using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberSharedProducerCreditTests
{
    [Theory]
    [InlineData(3, false)]
    [InlineData(4, false)]
    [InlineData(3, true)]
    [InlineData(4, true)]
    public void NativeTerminalAdmissionSharesDeathCreditsAndQueuedCells(int freeSlots, bool exchange)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        // Real Native terrain leaves no drop destination until explicitly opened below.
        for (int z = 0; z < config.Map.Depth; z++)
        for (int x = 0; x < config.Map.Width; x++)
        {
            scene.Write(x, 0, z, 1027u << 8);
            scene.Write(x, 1, z, 0);
        }
        NetEntityId chest = scene.Chest("Wood");
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(scene.Lives[0]), new Vector3(12.5f, 1.5f, 12.5f));
        for (int i = 0; i < 3; i++) BomberGrowthHealthTests.Take(scene.Manager, scene.Lives[0], 5);
        var life = world.Get<BomberPlayerState>(scene.Lives[0]);
        var participant = world.Get<BomberParticipantState>(life.Participant.Value);
        ulong match = participant.MatchId.Value, generation = life.LifeGeneration.Value;
        for (int i = 0; i < 6; i++) BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], scene.Lives[0], (ulong)(920 + i));
        scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        var runtime = world.Single<BomberWorldRuntime>();
        Assert.False(world.IsLive(scene.Lives[0]));
        Assert.Equal(3, carry.PendingGoldenHearts.Value);
        Assert.Equal(3, carry.SelectedDropCount.Value);
        Assert.Equal(0, carry.PlacedDropCount.Value);
        Assert.Equal(0, runtime.TerrainRewards.Count);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);

        int capacity = config.ObjectBudgets.PickupCapacity;
        // An exchange owns both its ground item and the outgoing held skill.
        for (int i = 0; i < capacity - freeSlots - (exchange ? 2 : 0); i++)
            world.Commands.Create<BomberPickupItemEntity>();
        EntityOrder? incoming = null;
        if (exchange)
        {
            incoming = world.Commands.Create<BomberPickupItemEntity>();
            incoming.Get<BomberPickupItem>().Kind.Value = (int)BomberPickupKind.Skill;
            incoming.Get<BomberPickupItem>().SkillId.Value = 7;
            incoming.Get<BomberPickupItem>().SkillLevel.Value = 1;
            BomberEffectIntegrationTests.Position(incoming.Get<LogicTransform>(), new Vector3(3.5f, 1.5f, 3.5f));
            var slot = world.Get<BomberSkillState>(scene.Lives[2]);
            slot.BombSkillId.Value = 6; slot.BombSkillLevel.Value = 1;
            scene.Write(3, 0, 3, 1022u << 8);
        }
        var terminal = BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], scene.Lives[2], 999);
        BomberEffectIntegrationTests.Position(terminal.Get<LogicTransform>(), new Vector3(5.5f, 1.5f, 5.5f));
        terminal.Get<BomberBombState>().Power.Value = 4;
        scene.Manager.Tick();
        Assert.Equal(exchange ? 1 : 0, BomberDeathDrops.HeldOutputs(world));
        Assert.Equal(capacity - freeSlots, GroundAndHeld(world));
        AssertBudget(world, capacity);
        // This landing is inside death radius, outside all existing bomb cells.
        scene.Write(11, 0, 12, 1022u << 8);
        if (exchange)
        {
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(scene.Lives[2]), new Vector3(3.5f, 1.5f, 3.5f));
            world.Get<AbilityComponent>(scene.Lives[2]).Activate<PickupAbility, PickupAbility.Input>(new PickupAbility.Input { Target = incoming!.AssignedId });
        }
        scene.Manager.Tick();
        Assert.Equal(1, carry.PlacedDropCount.Value);
        Assert.Equal(2, carry.PendingGoldenHearts.Value);
        Assert.Equal(capacity - freeSlots + 1, GroundAndHeld(world));
        AssertBudget(world, capacity);
        if (exchange)
        {
            Assert.True(world.IsLive(incoming!.AssignedId));
            Assert.Equal(6u, world.Get<BomberPickupItem>(incoming.AssignedId).SkillId.Value);
            Assert.Equal(7u, world.Get<BomberSkillState>(scene.Lives[2]).BombSkillId.Value);
        }
        if (freeSlots == 3)
        {
            Assert.True(world.IsLive(chest));
            Assert.Equal(1028u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
            Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
            Assert.Equal(0, runtime.TerrainReservedPickups.Value);
            Assert.Empty(scene.Adapter.CaptureResultCheckpoint().Results);
            Assert.Equal(0, world.Get<BomberBombState>(terminal.AssignedId).ContactedChests.Count);
            return;
        }

        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        Assert.Equal(1, runtime.TerrainReservedPickups.Value);
        var original = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results);
        Assert.Equal(transaction, original.TransactionId);
        Assert.Null(original.Operation);
        Assert.Null(original.BatchTransactionId);
        Assert.Equal(0, original.Outcome.Status);
        Assert.Equal(VoxelTxnState.Applied, original.Outcome.State);
        Assert.Equal(Lumio.GameRuntime.Coordination.VoxelCommitDisposition.Original, original.Outcome.Disposition);
        Assert.True(original.Outcome.TokenConsumed);
        Assert.Equal(1u, original.Outcome.SectionCount);
        Assert.False(original.Outcome.Receipt.OriginalReceiptBytes.IsEmpty);
        Assert.False(world.IsLive(chest));
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        scene.Manager.Tick();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(1, world.Get<BomberBombState>(terminal.AssignedId).ContactedChests.Count);
        Assert.Equal(chest, world.Get<BomberBombState>(terminal.AssignedId).ContactedChests[0]);
        Assert.Equal(1, world.Get<BomberStatistics>(world.Get<BomberBombState>(terminal.AssignedId).Owner.Value).DestroyedBlocks.Value);
        Assert.Equal(1, runtime.TerrainRewards.Count);
        AssertBudget(world, capacity);
        // Receipt drain leaves durable terrain debt. Next Tick death wins one new cell;
        // terrain must see that queued structural create before it can materialize.
        scene.Write(10, 0, 12, 1022u << 8);
        scene.Manager.Tick();
        Assert.Equal(2, carry.PlacedDropCount.Value);
        Assert.Equal(1, carry.PendingGoldenHearts.Value);
        Assert.Equal(1, runtime.TerrainRewards.Count);
        Assert.Equal(capacity - 2, GroundAndHeld(world));
        AssertBudget(world, capacity);
        scene.Write(12, 0, 11, 1022u << 8);
        scene.Write(6, 0, 5, 1022u << 8);
        scene.Manager.Tick();
        Assert.Equal(0, carry.PendingGoldenHearts.Value);
        Assert.Equal(3, carry.PlacedDropCount.Value);
        Assert.Equal(0, runtime.TerrainRewards.Count);
        Assert.Equal(capacity, GroundAndHeld(world));
        AssertBudget(world, capacity);
        var drops = world.Each<BomberPickupItem>().Where(i => i.DropParticipant.Value == participant.Entity).ToArray();
        Assert.Equal(3, drops.Length);
        Assert.All(drops, drop => {
            Assert.Equal((int)BomberPickupKind.GoldenHeart, drop.Kind.Value);
            Assert.Equal(match, drop.DropMatchId.Value);
            Assert.Equal(scene.Lives[0], drop.DroppedBy.Value);
            Assert.Equal(generation, drop.DropLifeGeneration.Value);
            Assert.Equal(participant.DeathTick.Value, drop.DropOccurrenceTick.Value);
        });
        var produced = world.Each<BomberPickupItem>().Where(i => i.DropParticipant.Value == participant.Entity || i.TerrainTransaction.Value == transaction).ToArray();
        Assert.Equal(4, produced.Length);
        Assert.Equal(4, produced.Select(i => world.Get<LogicTransform>(i.Entity).LocalPosition).Distinct().Count());
        BomberPickupItem terrain = Assert.Single(produced, i => i.TerrainTransaction.Value == transaction);
        BomberBombState source = world.Get<BomberBombState>(terminal.AssignedId);
        Assert.Equal(terminal.AssignedId, terrain.TerrainSourceBomb.Value);
        Assert.Equal(terminal.AssignedId, terrain.TerrainSourceFamily.Value);
        Assert.Equal(source.Owner.Value, terrain.DropParticipant.Value);
        Assert.Equal(source.SourceLife.Value, terrain.DroppedBy.Value);
        Assert.Equal(source.SourceLifeGeneration.Value, terrain.DropLifeGeneration.Value);
        Assert.Equal(source.ExplodedAtTick.Value, terrain.DropOccurrenceTick.Value);
        Assert.Equal(match, terrain.DropMatchId.Value);
        scene.Manager.Tick();
        Assert.Equal(capacity, GroundAndHeld(world));
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
    }

    private static void AssertBudget(World world, int capacity)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        int owned = GroundAndHeld(world) + BomberDeathDrops.PendingOutputs(world) +
            runtime.TerrainReservedPickups.Value + runtime.TerrainRewards.Count;
        Assert.InRange(owned, 0, capacity);
    }

    private static int GroundAndHeld(World world) => world.Each<BomberPickupItem>().Count() + BomberDeathDrops.HeldOutputs(world);
}
