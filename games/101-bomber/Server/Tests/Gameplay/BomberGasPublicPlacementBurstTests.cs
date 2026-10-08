using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// PRIVATE, UNRUN. Root supplies an officially compiled legal UGC profile with
// attributes Power/Capacity/Available initial=maximum=6 and ordinary Fuse >=8
// ticks. No EffectLimits changes are authored here. Positions/Native empty lanes
// are explicit geometry fixtures; skill acquisition and all 25 bomb placements
// use real public abilities, real inventories, common reservations, and Native F.
[Collection("BomberWorld")]
public sealed class BomberGasPublicPlacementBurstTests
{
    private static readonly JsonSerializerOptions EvidenceJsonOptions = new() { WriteIndented = true };

    [Fact]
    public void PublicInventoryAdmittedFamiliesSynchronizeThroughRealNativeChainBeforeHealthCanReducePendingDemand()
    {
        string? configDirectory = Environment.GetEnvironmentVariable("LUMIO_BOMBER_GAS_PUBLIC_CONFIG_DIRECTORY");
        string? outputDirectory = Environment.GetEnvironmentVariable("LUMIO_BOMBER_GAS_DIAGNOSTIC_DIR");
        Assert.False(string.IsNullOrWhiteSpace(configDirectory), "Root must supply the frozen official legal UGC attribute profile.");
        Assert.False(string.IsNullOrWhiteSpace(outputDirectory));
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: configDirectory, controlled: true);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        Assert.Equal(6L, config.Attribute(BomberAttributeNames.BombPower).Initial);
        Assert.Equal(6L, config.Attribute(BomberAttributeNames.BombCapacity).Initial);
        Assert.Equal(6L, config.Attribute(BomberAttributeNames.AvailableBombs).Initial);
        Assert.True(Ticks.FromMilliseconds(config.Bomb.FuseMs, config.Game.TickRateHz) >= 8);
        Assert.True(config.Game.SkillsEnabled); Assert.True(config.SkillRules.FreezeBombDamages);
        for (int z = 1; z <= 17; z++) for (int x = 1; x <= 17; x++)
        {
            uint block = scene.Native.ReadCell(new VoxelWorldCoordinate(x, 1, z)).BlockId >> 8;
            if (block is 1025u or 1026u) scene.Write(x, 1, z, 0);
        }
        for (int n = 3; n <= 15; n++) { scene.Write(9, 1, n, 0); scene.Write(n, 1, 9, 0); }
        uint freezeSkill = config.Tables.Skills.Rows.Single(row => row.Name == "freezeBomb").Id;
        var pickups = scene.Lives.Select(life =>
        {
            EntityOrder item = BomberGrowthHealthTests.Item(world, life, (int)BomberPickupKind.Skill);
            item.Get<BomberPickupItem>().SkillId.Value = freezeSkill; item.Get<BomberPickupItem>().SkillLevel.Value = 1;
            return (life, item);
        }).ToArray();
        scene.TickControlled();
        foreach (var entry in pickups)
        {
            var input = new PickupAbility.Input { Target = entry.item.AssignedId };
            var picked = world.Get<AbilityComponent>(entry.life).Activate<PickupAbility, PickupAbility.Input>(in input);
            Assert.True(picked.Succeeded, picked.FailureCode);
        }
        scene.TickControlled();
        var origins = new List<(int X, int Z)> { (9, 9) };
        for (int d = 1; d <= 6; d++) { origins.Add((9 - d, 9)); origins.Add((9 + d, 9)); origins.Add((9, 9 - d)); origins.Add((9, 9 + d)); }
        var bombs = new List<BomberBombState>();
        for (int offset = 0; offset < origins.Count; offset += 8)
        {
            var staged = new List<(NetEntityId Life, int X, int Z)>();
            for (int slot = 0; slot < 8 && offset + slot < origins.Count; slot++)
            {
                NetEntityId life = scene.Lives[slot]; var origin = origins[offset + slot];
                BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(origin.X + .5f, 1.5f, origin.Z + .5f));
                var ability = world.Get<AbilityComponent>(life);
                Assert.True(PlaceBombAbility.CanPlace(ability, out string? reason), reason);
                var placed = ability.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
                Assert.True(placed.Succeeded, placed.FailureCode);
                staged.Add((life, origin.X, origin.Z));
            }
            scene.TickControlled();
            foreach (var entry in staged)
            {
                var bomb = Assert.Single(world.Each<BomberBombState>(), b => b.SourceLife.Value == entry.Life &&
                    world.Get<LogicTransform>(b.Entity).LocalPosition == new Vector3(entry.X + .5f, 1.5f, entry.Z + .5f));
                Assert.False(bomb.CapacityReturned.Value);
                Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
                Assert.Equal((int)BomberBombKind.Freeze, bomb.BombKind.Value);
                bombs.Add(bomb);
            }
        }
        Assert.Equal(25, bombs.Count);
        // Real place inventory stays spent until Native FuseElapsed returns it.
        Assert.Equal(2L, world.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
        foreach (NetEntityId life in scene.Lives)
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(9.5f, 1.5f, 9.5f));
        ulong firstDue = bombs.Min(b => b.FuseEndTick.Value);
        while (bombs.All(b => b.ExplodedAtTick.Value == 0))
        {
            Assert.True(world.Tick <= firstDue + 2, "The true Native due/chain path must make progress.");
            scene.TickControlled();
        }
        var rows = bombs.SelectMany(bomb =>
        {
            var facts = world.Get<BomberDamageFacts>(bomb.Entity);
            return Enumerable.Range(0, facts.Target.Count).Select(row => new { bomb = bomb.Entity.ToHex(), row,
                sourceLife = facts.SourceLife[row].ToHex(), sourceGeneration = facts.SourceGeneration[row],
                participant = facts.Participant[row].ToHex(), life = facts.Life[row].ToHex(), generation = facts.Generation[row],
                chain = facts.ChainId[row], status = facts.Status[row], handleWorld = facts.HandleWorld[row],
                handleInstance = facts.HandleInstance[row], handleGeneration = facts.HandleGeneration[row],
                dependent = bomb.HitDependentsAdmitted[row], actual = facts.Actual[row] });
        }).ToArray();
        int refusedPrimary = rows.Count(row => row.handleGeneration == 0);
        int refusedDependent = rows.Count(row => row.handleGeneration != 0 && !row.dependent);
        Directory.CreateDirectory(outputDirectory!);
        File.WriteAllText(Path.Combine(outputDirectory!, "native-public-placement-25-by-8.json"), JsonSerializer.Serialize(new
        {
            status = "ACTUAL_NATIVE_OBSERVATION", tick = world.Tick, firstDue, publicPlacements = bombs.Count,
            expectedPrimaryContacts = 200, requiredUncappedPrimaryPlusDependencies = 400, actualRows = rows.Length,
            refusedPrimary, refusedDependent, rows,
            limitation = "Public ability/inventory/admission/chain history; position and empty-lane geometry are explicit fixtures, not movement replay."
        }, EvidenceJsonOptions));
        Assert.Equal(200, rows.Length); Assert.Equal(0, refusedPrimary); Assert.Equal(0, refusedDependent);
        Assert.All(bombs, b => Assert.Equal(bombs[0].ExplodedAtTick.Value, b.ExplodedAtTick.Value));
    }
}
