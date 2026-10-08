using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberPublicPierceChestContactNativeTests
{
    [Fact]
    public void OnePublicPowerEightPierceBombConsumesSixActualNativeChestOriginals()
    {
        using var authored = AuthoredPowerEight();
        using var scene = new BomberTerrainProductionTests.Scene(0,
            configDirectory: authored.Compile(), controlled: true);
        PrepareCross(scene);
        NetEntityId[] chests = BindSixChests(scene);
        BomberBombState bomb = PlacePublicPierce(scene);
        var source = bomb.ReadSource();
        ulong chain = bomb.ChainId.Value, placedAt = bomb.PlacedAtTick.Value;
        var originals = new HashSet<NetEntityId>();
        ulong stop = checked(bomb.FuseEndTick.Value + 16);
        while (bomb.ContactedChests.Count < chests.Length && scene.World.Tick < stop)
        {
            scene.TickControlled();
            ObserveActualOriginal(scene, bomb, chests, originals);
        }
        Assert.Equal(6, originals.Count);
        Assert.Equal(6, bomb.ContactedChests.Count);
        Assert.Equal(chests.OrderBy(id => id).ToArray(), bomb.ContactedChests.Values.OrderBy(id => id).ToArray());
        Assert.All(chests, id =>
        {
            Assert.False(scene.World.IsLive(id));
            Assert.Equal(1, bomb.ContactedChests.Values.Count(contact => contact == id));
        });
        Assert.Equal(source, bomb.ReadSource());
        Assert.Equal(chain, bomb.ChainId.Value);
        Assert.Equal(placedAt, bomb.PlacedAtTick.Value);
        Assert.Equal(8, bomb.Power.Value);
        Assert.Equal((int)BomberBombKind.Pierce, bomb.BombKind.Value);
        Assert.Equal(6, scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value);
        Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "bomb_placed"));
        Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "bomb_exploded"));
        Assert.Equal(6, BomberEffectIntegrationTests.Events(scene.World, "crate_opened").Length);
        Assert.Empty(BomberEffectIntegrationTests.Events(scene.World, "damage_applied"));
        bomb.ValidateStorage();
    }

    internal static BomberObjectBudgetTests.AuthoredFixture AuthoredPowerEight() => new(
        ("attributes", BomberAttributeNames.BombPower, "maximum", "8"),
        ("game", "default", "skills_enabled", "true"),
        ("game", "default", "central_supply_enabled", "false"),
        ("object_budgets", "default", "max_pickup_entities", "1351"));

    internal static void PrepareCross(BomberTerrainProductionTests.Scene scene)
    {
        var config = BomberConfigBinding.For(scene.World);
        Assert.Equal("LegacyPillars", config.Map.LayoutKind);
        Assert.Equal((19, 19, 1), (config.Map.Width, config.Map.Depth, config.Map.BoundaryCells));
        Assert.Equal(8L, config.Attribute(BomberAttributeNames.BombPower).Maximum);
        Assert.True(config.Game.SkillsEnabled);
        // The authored Native input corridor lies on odd row/column 9. No
        // mandatory even/even pillar or outer boundary cell is removed.
        for (int at = 1; at <= 17; at++)
        {
            scene.Write(at, 0, 9, 1022u << 8);
            scene.Write(at, 1, 9, 0);
            if (at == 9) continue;
            scene.Write(9, 0, at, 1022u << 8);
            scene.Write(9, 1, at, 0);
        }
        foreach (NetEntityId life in scene.Lives) Position(scene.World, life, 15, 15);
        Position(scene.World, scene.Lives[0], 9, 9);
        scene.TickControlled();
    }

    internal static NetEntityId[] BindSixChests(BomberTerrainProductionTests.Scene scene)
    {
        int[] xs = { 8, 7, 6, 10, 11, 12 };
        string[] tiers = { "Wood", "Iron", "Wood", "Iron", "Wood", "Iron" };
        var orders = xs.Select(_ => scene.World.Commands.Create<BomberChestEntity>()).ToArray();
        scene.TickControlled();
        scene.Adapter.SetBindingPolicy(new[] {
            new VoxelBindingPolicyEntry(1028, scene.World.Registry.WireName(typeof(BomberChestEntity))) });
        var writes = new List<VoxelWriteEntry>();
        var bindings = new List<VoxelBindingOp>();
        for (int index = 0; index < orders.Length; index++)
        {
            NetEntityId id = orders[index].AssignedId;
            var row = BomberConfigBinding.For(scene.World).Tables.Chest.Rows.Single(tier => tier.Name == tiers[index]);
            Assert.Equal(1, row.IndependentBombHits);
            scene.World.Get<BomberChestState>(id).InitializeTier(row.Id, checked((ulong)index + 1));
            var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, xs[index], 1, 9);
            var before = scene.Native.ReadCell(new VoxelWorldCoordinate(xs[index], 1, 9));
            Assert.Equal(0u, before.BlockId);
            writes.Add(new(address.Section, address.Offset, 1028u << 8, before.SectionRevision));
            bindings.Add(new(address.Section, address.Offset, id.ToHex()) { ExpectedSectionRevision = before.SectionRevision });
        }
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageMutation(writes, bindings, "public-pierce-six-input-chests").Status);
        scene.TickControlled();
        for (int index = 0; index < orders.Length; index++)
        {
            var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, xs[index], 1, 9);
            Assert.True(scene.World.IsLive(orders[index].AssignedId));
            Assert.Equal(1028u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(xs[index], 1, 9)).BlockId);
            Assert.Equal(orders[index].AssignedId.ToHex(), scene.Adapter.BindingGet(address.Section, address.Offset));
            scene.World.Get<BomberChestState>(orders[index].AssignedId).ValidateStorage();
        }
        return orders.Select(order => order.AssignedId).ToArray();
    }

    internal static BomberBombState PlacePublicPierce(BomberTerrainProductionTests.Scene scene)
    {
        World world = scene.World;
        NetEntityId life = scene.Lives[0];
        var owner = world.Get<AbilityComponent>(life);
        var attributes = world.Get<AttributeComponent>(life);
        var config = BomberConfigBinding.For(world);
        Assert.Equal(2L, attributes.GetBaseValue(BomberAttributeNames.BombPower));
        for (int upgrade = 0; upgrade < 6; upgrade++)
        {
            EntityOrder item = BomberGrowthHealthTests.Item(world, life, (int)BomberPickupKind.Power);
            scene.TickControlled();
            var input = new PickupAbility.Input { Target = item.AssignedId };
            Assert.True(new PickupAbility().CanActivate(in input, owner, out string? reason), reason);
            var taken = owner.Activate<PickupAbility, PickupAbility.Input>(in input, checked((ulong)(9800 + upgrade)));
            Assert.True(taken.Succeeded, taken.FailureCode);
            scene.TickControlled(); scene.TickControlled();
            Assert.False(world.IsLive(item.AssignedId));
            Assert.Equal(3L + upgrade, attributes.GetBaseValue(BomberAttributeNames.BombPower));
            Assert.Equal(3L + upgrade, attributes.GetCurrentValue(BomberAttributeNames.BombPower));
        }
        var pierce = Assert.Single(config.Tables.BombKinds.Rows, row => row.Name == "Pierce");
        Assert.True(pierce.Enabled);
        var skill = Assert.Single(config.Tables.Skills.Rows, row => row.Name == "pierceBomb");
        EntityOrder candy = BomberGrowthHealthTests.Item(world, life, (int)BomberPickupKind.Skill);
        candy.Get<BomberPickupItem>().SkillId.Value = skill.Id;
        candy.Get<BomberPickupItem>().SkillLevel.Value = 1;
        scene.TickControlled();
        var pickup = new PickupAbility.Input { Target = candy.AssignedId };
        Assert.True(new PickupAbility().CanActivate(in pickup, owner, out string? pickupReason), pickupReason);
        var picked = owner.Activate<PickupAbility, PickupAbility.Input>(in pickup, 9810);
        Assert.True(picked.Succeeded, picked.FailureCode);
        scene.TickControlled(); scene.TickControlled();
        Assert.False(world.IsLive(candy.AssignedId));
        Assert.Equal(skill.Id, world.Get<BomberSkillState>(life).BombSkillId.Value);
        Assert.Empty(world.Each<BomberBombState>());
        var source = world.Get<BomberPlayerState>(life);
        ulong placedAt = world.Tick, chain = world.Single<BomberWorldRuntime>().NextChainId.Value;
        long available = attributes.GetBaseValue(BomberAttributeNames.AvailableBombs);
        Assert.True(PlaceBombAbility.CanPlace(owner, out string? placeReason), placeReason);
        var placed = owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default, 9811);
        Assert.True(placed.Succeeded, placed.FailureCode);
        Assert.Equal(available - 1, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        scene.TickControlled(); scene.TickControlled();
        BomberBombState bomb = Assert.Single(world.Each<BomberBombState>());
        Assert.Equal((int)BomberBombKind.Pierce, bomb.BombKind.Value);
        Assert.Equal(8, bomb.Power.Value);
        Assert.Equal(1, bomb.PierceLayers.Value);
        Assert.Equal(1, bomb.SkillLevel.Value);
        Assert.Equal(source.Participant.Value, bomb.Owner.Value);
        Assert.Equal(life, bomb.SourceLife.Value);
        Assert.Equal(source.LifeGeneration.Value, bomb.SourceLifeGeneration.Value);
        Assert.Equal(placedAt, bomb.PlacedAtTick.Value);
        Assert.Equal(checked(chain + 1), bomb.ChainId.Value);
        Assert.Equal(checked(placedAt + Ticks.FromMilliseconds(config.Bomb.FuseMs, config.Game.TickRateHz)), bomb.FuseEndTick.Value);
        Assert.Empty(bomb.ContactedChests.Values);
        using (var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.Bomb))
        {
            var machine = world.Get<BomberHfsmState>(bomb.Entity);
            Assert.True(machine.SnapshotPresent.Value);
            Assert.Equal(BomberHfsmDefinitions.State.BombStationary,
                machine.ReadSnapshot(definition, BomberHfsmKind.Bomb, machine.MachineKey.Value).ActivePath[^1].State);
        }
        Position(world, life, 15, 15);
        return bomb;
    }

    internal static void ObserveActualOriginal(BomberTerrainProductionTests.Scene scene, BomberBombState bomb,
        IReadOnlyCollection<NetEntityId> chests, ISet<NetEntityId> originals)
    {
        var runtime = scene.World.Single<BomberWorldRuntime>();
        if (runtime.PendingVoxelTransactionIds.Count == 0 || runtime.PendingSourceBombs.Count == 0 ||
            runtime.PendingSourceBombs[0] != bomb.Entity) return;
        NetEntityId chest = Assert.Single(runtime.PendingChests.Values);
        Assert.Contains(chest, chests);
        string transaction = Assert.Single(runtime.PendingVoxelTransactionIds.Values);
        var original = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results, row => row.TransactionId == transaction);
        Assert.Equal(0, original.Outcome.Status);
        Assert.Equal(VoxelTxnState.Applied, original.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Original, original.Outcome.Disposition);
        Assert.True(original.Outcome.TokenConsumed);
        Assert.False(original.Outcome.Receipt.OriginalReceiptBytes.IsEmpty);
        Assert.Equal(original.Outcome.ReceiptByteCount, checked((uint)original.Outcome.Receipt.OriginalReceiptBytes.Length));
        var section = Assert.Single(original.Outcome.Receipt.Sections);
        Assert.Equal(runtime.PendingSections[0], section.SectionKey);
        Assert.True(section.UpToSectionRevision > runtime.PendingExpectedRevisions[0]);
        Assert.Equal(bomb.Owner.Value, Assert.Single(runtime.PendingParticipants.Values));
        Assert.Equal(bomb.SourceLife.Value, Assert.Single(runtime.PendingSourceLives.Values));
        Assert.Equal(bomb.SourceLifeGeneration.Value, Assert.Single(runtime.PendingSourceLifeGenerations.Values));
        Assert.Equal(bomb.ChainId.Value, Assert.Single(runtime.PendingChainIds.Values));
        var detail = BomberTerrainTransactions.Decode<BomberTerrainDetail>(Assert.Single(runtime.TerrainPendingDetails.Values));
        Assert.Equal(bomb.Entity.ToHex(), detail.Family);
        Assert.Equal(bomb.ExplodedAtTick.Value, detail.Occurred);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(detail.X, 1, detail.Z)).BlockId);
        Assert.Null(scene.Adapter.BindingGet(runtime.PendingSections[0], runtime.PendingCellOffsets[0]));
        Assert.False(scene.World.IsLive(chest));
        originals.Add(chest);
    }

    internal static void Position(World world, NetEntityId life, int x, int z) =>
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(x + .5f, 1.5f, z + .5f));
}
