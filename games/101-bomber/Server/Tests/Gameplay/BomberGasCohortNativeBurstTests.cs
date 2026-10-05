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
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// PRIVATE TOOLING DRAFT, UNRUN. Root must copy this into its fenced test checkout
// and run official GEN/build/Native. This authors a valid bounded ECS cohort; it
// does not claim 25 public placements can happen in one Tick or prove its history.
// Every explosion, Native HFSM, terrain read, contact reservation, Effects.Apply,
// full-handle association, and F settlement below uses the production path.
[Collection("BomberWorld")]
public sealed class BomberGasCohortNativeBurstTests
{
    private static readonly JsonSerializerOptions EvidenceOptions = new() { WriteIndented = true };
    [Fact]
    public void TwentyFiveDistinctFamiliesAndEightCurrentLivesRequireFourHundredAdmissionSlotsBeforeDeathSettlement()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        World world = scene.World;
        Assert.True(BomberConfigBinding.For(world).Game.SkillsEnabled);
        Assert.True(BomberConfigBinding.For(world).SkillRules.FreezeBombDamages);
        Assert.Equal(8, scene.Lives.Length);
        // Empty all ordinary destructible fixture cells, preserving hard pillars
        // and boundary geometry, so side arms cannot create terrain transactions.
        for (int z = 1; z <= 17; z++) for (int x = 1; x <= 17; x++)
        {
            uint block = scene.Native.ReadCell(new VoxelWorldCoordinate(x, 1, z)).BlockId >> 8;
            if (block is 1025u or 1026u) scene.Write(x, 1, z, 0);
        }
        // These two odd-coordinate lanes are legal LegacyPillars walkable lanes.
        // Clear authored fixture obstacles before the production photo is read.
        for (int n = 3; n <= 15; n++)
        {
            scene.Write(9, 1, n, 0);
            scene.Write(n, 1, 9, 0);
        }
        foreach (NetEntityId life in scene.Lives)
        {
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(9.5f, 1.5f, 9.5f));
            var player = world.Get<BomberPlayerState>(life);
            player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
            player.ProtectedUntilTick.Value = 0;
        }

        var origins = new List<(int X, int Z)> { (9, 9) };
        for (int distance = 1; distance <= 6; distance++)
        {
            origins.Add((9 - distance, 9)); origins.Add((9 + distance, 9));
            origins.Add((9, 9 - distance)); origins.Add((9, 9 + distance));
        }
        BomberPlayerState source = world.Get<BomberPlayerState>(scene.Lives[1]);
        EntityOrder[] orders = origins.Select((origin, index) =>
        {
            // Use the real common owner, including unpublished structural credits.
            EntityOrder order = BomberBombAdmissions.CreatePrimary(world);
            var bomb = order.Get<BomberBombState>();
            bomb.Owner.Value = source.Participant.Value;
            bomb.SourceLife.Value = source.Entity;
            bomb.SourceLifeGeneration.Value = source.LifeGeneration.Value;
            bomb.ChainId.Value = checked(100100UL + (ulong)index);
            bomb.BombKind.Value = (int)BomberBombKind.Freeze;
            bomb.Phase.Value = (int)BomberBombPhase.Fuse;
            bomb.Power.Value = 6;
            bomb.FuseEndTick.Value = checked(world.Tick + 1);
            bomb.PlacedAtTick.Value = world.Tick;
            // Fixture inventories were not decremented. Never manufacture capacity
            // from Native ReturnCapacity; this is a retained-source cohort fixture.
            bomb.CapacityReturned.Value = true;
            BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(),
                new Vector3(origin.X + .5f, 1.5f, origin.Z + .5f));
            return order;
        }).ToArray();

        scene.Manager.Tick(); // actual structural publication + Native machine start
        scene.Manager.Tick(); // actual due/chain processing + true GAS F
        var rows = orders.SelectMany(order =>
        {
            BomberBombState bomb = world.Get<BomberBombState>(order.AssignedId);
            BomberDamageFacts facts = world.Get<BomberDamageFacts>(order.AssignedId);
            return Enumerable.Range(0, facts.Target.Count).Select(row => new
            {
                bomb = bomb.Entity.ToHex(), chain = facts.ChainId[row], row,
                target = facts.Target[row].ToHex(), participant = facts.Participant[row].ToHex(),
                generation = facts.Generation[row], sourceLife = facts.SourceLife[row].ToHex(),
                sourceGeneration = facts.SourceGeneration[row], status = facts.Status[row],
                handleWorld = facts.HandleWorld[row], handleInstance = facts.HandleInstance[row],
                handleGeneration = facts.HandleGeneration[row], dependentAdmitted = bomb.HitDependentsAdmitted[row],
                ready = facts.Ready[row], actual = facts.Actual[row]
            });
        }).ToArray();
        int refusedPrimary = rows.Count(row => row.handleGeneration == 0);
        int refusedDependent = rows.Count(row => row.handleGeneration != 0 && !row.dependentAdmitted);
        string? outputDirectory = Environment.GetEnvironmentVariable("LUMIO_BOMBER_GAS_DIAGNOSTIC_DIR");
        Assert.False(string.IsNullOrWhiteSpace(outputDirectory), "Root must set a private diagnostic output directory.");
        Directory.CreateDirectory(outputDirectory!);
        File.WriteAllText(Path.Combine(outputDirectory!, "native-cohort-25-by-8.json"),
            JsonSerializer.Serialize(new
            {
                status = "ACTUAL_NATIVE_OBSERVATION", tick = world.Tick,
                configuredBombCapacity = BomberConfigBinding.For(world).ObjectBudgets.BombCapacity,
                expectedPrimaryContacts = 200, requiredUncappedPrimaryPlusDependencies = 400,
                actualRows = rows.Length, refusedPrimary, refusedDependent, rows,
                limitation = "Production Native/GAS path over an authored retained-source fixture; public-history reachability is a separate diagnostic."
            }, EvidenceOptions));
        Assert.Equal(200, rows.Length);
        Assert.Equal(0, refusedPrimary);
        Assert.Equal(0, refusedDependent);
    }
}
