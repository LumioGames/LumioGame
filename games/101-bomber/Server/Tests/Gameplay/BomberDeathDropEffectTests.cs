using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.Engine.SDK;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberDeathDropEffectTests
{
    [Theory]
    [InlineData(uint.MaxValue, 1, false)]
    [InlineData(2u, 1, false)]
    [InlineData(6u, -1, false)]
    [InlineData(6u, 0, false)]
    [InlineData(6u, 4, false)]
    [InlineData(0u, 1, false)]
    [InlineData(0u, 0, true)]
    [InlineData(6u, 1, true)]
    [InlineData(6u, 3, true)]
    public void PendingBombSnapshotRequiresSupportedSkillAndEffectiveLevel(uint skillId, int level, bool valid)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        var player = world.Get<BomberPlayerState>(lives[0]);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        var attributes = world.Get<AttributeComponent>(lives[0]);
        attributes.SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        var skill = world.Get<BomberSkillState>(lives[0]);
        skill.BombSkillId.Value = 6;
        skill.BombSkillLevel.Value = 1;
        BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 714);
        manager.Tick();
        BomberEffectIntegrationTests.ScheduleFinalCircle(world);
        manager.Tick(); manager.Tick();
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        Assert.Equal(6u, carry.PendingBombSkill.Value);
        Assert.Equal(1, carry.PendingBombLevel.Value);
        carry.PendingBombSkill.Value = skillId;
        carry.PendingBombLevel.Value = level;
        if (skillId == 0) carry.SelectedDropCount.Value--;
        byte[] snapshot = manager.CaptureSnapshot();

        if (valid)
        {
            using WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
                config: BomberConfigBinding.Load());
            var saved = restored.World.Get<BomberRespawnCarry>(participant.Entity);
            Assert.Equal(skillId, saved.PendingBombSkill.Value);
            Assert.Equal(level, saved.PendingBombLevel.Value);
            Assert.Equal(saved.SelectedDropCount.Value, saved.PlacedDropCount.Value + saved.PendingPower.Value +
                saved.PendingCapacity.Value + saved.PendingSpeed.Value + (skillId == 0 ? 0 : 1));
        }
        else
        {
            BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() =>
            {
                using WorldManager rejected = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
                    config: BomberConfigBinding.Load());
            });
        }
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void BlockedOriginAndIntermediateStillRetryToNearestLegalCell(int distance)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        var player = world.Get<BomberPlayerState>(lives[0]);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        world.Get<AttributeComponent>(lives[0]).SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        var skill = world.Get<BomberSkillState>(lives[0]);
        skill.BombSkillId.Value = 6;
        skill.BombSkillLevel.Value = 1;
        BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 715);
        manager.Tick();
        BomberEffectIntegrationTests.ScheduleFinalCircle(world);
        manager.Tick(); manager.Tick();
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        Assert.Equal(1, carry.SelectedDropCount.Value);
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
        Assert.Equal(0, carry.PlacedDropCount.Value);
        Assert.Equal(6u, carry.PendingBombSkill.Value);

        var map = BomberConfigBinding.For(world).Map;
        int direction = carry.DropOriginX.Value + distance < map.Width - map.BoundaryCells ? 1 : -1;
        int targetX = carry.DropOriginX.Value + direction * distance;
        int targetZ = carry.DropOriginZ.Value;
        Assert.InRange(targetX, map.BoundaryCells, map.Width - map.BoundaryCells - 1);
        BomberTestWorld.LoadTerrainMap(manager);
        var native = NativeWorldVoxelResources.Require(manager).Voxel;
        var writes = new System.Collections.Generic.List<VoxelBlockWriteEntry>();
        for (int z = map.BoundaryCells; z < map.Depth - map.BoundaryCells; z++)
        for (int x = map.BoundaryCells; x < map.Width - map.BoundaryCells; x++)
        {
            var before = native.ReadCell(new VoxelWorldCoordinate(x, 1, z));
            writes.Add(new(new VoxelSectionKey(x >> 4, 0, z >> 4), (ushort)(256 + ((z & 15) << 4) + (x & 15)),
                x == targetX && z == targetZ ? 0 : 1023u << 8, before.SectionRevision));
        }
        using (var token = native.PrepareWriteV2(990715, writes.ToArray(), Array.Empty<VoxelBindingMutationEntry>()))
        {
            var limits = native.GetOutputRequirements(token);
            Assert.Equal(0, native.CommitV3(token, new VoxelWriteReceipt[limits.SectionCapacity], new byte[limits.ReceiptByteCapacity]).Status);
        }
        manager.Tick();

        var items = world.Each<BomberPickupItem>().Where(i => i.DroppedBy.Value == lives[0]).ToArray();
        Assert.Single(items);
        var position = world.Get<LogicTransform>(items[0].Entity).LocalPosition;
        Assert.Equal(targetX, BomberMatchRules.CellX(position));
        Assert.Equal(targetZ, BomberMatchRules.CellZ(position));
        Assert.Equal(participant.Entity, items[0].DropParticipant.Value);
        Assert.Equal(carry.DropMatchId.Value, items[0].DropMatchId.Value);
        Assert.Equal(carry.DropGeneration.Value, items[0].DropLifeGeneration.Value);
        Assert.Equal(carry.DropOccurrenceTick.Value, items[0].DropOccurrenceTick.Value);
        Assert.Equal(1, carry.SelectedDropCount.Value);
        Assert.Equal(1, carry.PlacedDropCount.Value);
        Assert.Equal(0u, carry.PendingBombSkill.Value);
        Assert.Equal(0, carry.PendingBombLevel.Value);
        Assert.False(participant.DeathDropPending.Value);
        manager.Tick();
        Assert.Equal(1, world.Each<BomberPickupItem>().Count(i => i.DroppedBy.Value == lives[0]));
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
    }

    [Fact]
    public void FullPickupCapacityRetainsSelectedWealthUntilAnActualSlotOpens()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        int capacity = BomberConfigBinding.For(world).ObjectBudgets.PickupCapacity;
        EntityOrder first = world.Commands.Create<BomberPickupItemEntity>();
        for (int i = 1; i < capacity; i++) world.Commands.Create<BomberPickupItemEntity>();
        var player = world.Get<BomberPlayerState>(lives[0]);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        var health = world.Get<AttributeComponent>(lives[0]);
        health.SetBaseValue(BomberAttributeNames.BombPower, 6);
        health.SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 712);
        manager.Tick();
        BomberEffectIntegrationTests.ScheduleFinalCircle(world);
        manager.Tick(); manager.Tick();
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        Assert.Equal(4, carry.PendingPower.Value);
        BomberTestWorld.LoadTerrainMap(manager, openInterior: true);
        // Complete the first preview's real Native chest publication while all slots
        // remain occupied; its pending terrain cut is a separate placement prerequisite.
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.Equal(0, world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        Assert.NotEqual(0u, world.Single<BomberFinalCircleState>().ChestIssuedStageMask.Value);
        Assert.Equal(capacity, world.Each<BomberPickupItem>().Count());
        Assert.Equal(4, carry.PendingPower.Value);
        Assert.Equal(0, carry.PlacedDropCount.Value);
        world.Commands.Destroy(first.AssignedId);
        manager.Tick(); manager.Tick();
        Assert.Equal(capacity, world.Each<BomberPickupItem>().Count());
        Assert.Equal(3, carry.PendingPower.Value);
        Assert.Equal(1, carry.PlacedDropCount.Value);
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void DeathPartitionsWealthOnceRetainsWithoutTerrainThenTransfersToPickups(bool final)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        var player = world.Get<BomberPlayerState>(lives[0]);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        var attributes = world.Get<AttributeComponent>(lives[0]);
        attributes.SetBaseValue(BomberAttributeNames.BombPower, 6);
        attributes.SetBaseValue(BomberAttributeNames.BombCapacity, 6);
        attributes.SetBaseValue(BomberAttributeNames.SpeedTier, 8);
        attributes.SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        var skill = world.Get<BomberSkillState>(lives[0]);
        skill.BombSkillId.Value = 6;
        skill.BombSkillLevel.Value = 1;
        BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 711);
        manager.Tick();
        if (final)
        {
            BomberEffectIntegrationTests.ScheduleFinalCircle(world);
        }
        ulong deathTick = world.Tick;
        manager.Tick(); manager.Tick();
        Assert.False(world.IsLive(lives[0]));
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        int selected = carry.SelectedDropCount.Value;
        Assert.InRange(selected, 1, 18);
        if (final) Assert.Equal(18, selected);
        Assert.Equal(6, carry.PowerBase.Value + carry.PendingPower.Value);
        Assert.Equal(6, carry.CapacityBase.Value + carry.PendingCapacity.Value);
        Assert.Equal(8, carry.SpeedTierBase.Value + carry.PendingSpeed.Value);
        Assert.Equal(6, carry.BombSkillId.Value + (int)carry.PendingBombSkill.Value);
        Assert.Equal(lives[0], carry.DropLife.Value);
        Assert.Equal(deathTick, carry.DropOccurrenceTick.Value);
        Assert.Equal(participant.LifeGeneration.Value, carry.DropGeneration.Value);
        Assert.Equal(participant.MatchId.Value, carry.DropMatchId.Value);
        Assert.Equal(0, carry.PlacedDropCount.Value);
        Assert.True(participant.DeathDropPending.Value);
        byte[] snapshot = manager.CaptureSnapshot();
        using (WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()))
        {
            // Component recovery evidence only; this does not resume an active match.
            var saved = restored.World.Get<BomberRespawnCarry>(participant.Entity);
            Assert.Equal(selected, saved.SelectedDropCount.Value);
            Assert.Equal(carry.PendingPower.Value, saved.PendingPower.Value);
            Assert.Equal(carry.PendingCapacity.Value, saved.PendingCapacity.Value);
            Assert.Equal(carry.PendingSpeed.Value, saved.PendingSpeed.Value);
            Assert.Equal(carry.DropLife.Value, saved.DropLife.Value);
            Assert.Equal(carry.DropGeneration.Value, saved.DropGeneration.Value);
        }
        int validPending = carry.PendingPower.Value;
        carry.PendingPower.Value = -1;
        byte[] malformed = manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() =>
        {
            using WorldManager rejected = BomberTestWorld.Restore(malformed, GeneratedRegistry.Instance,
                config: BomberConfigBinding.Load());
        });
        carry.PendingPower.Value = validPending;
        Assert.Equal(snapshot, manager.CaptureSnapshot());
        manager.Tick();
        Assert.Equal(selected, carry.SelectedDropCount.Value);
        Assert.Equal(0, carry.PlacedDropCount.Value);
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
        BomberTestWorld.LoadTerrainMap(manager);
        manager.Tick();
        int placed = carry.PlacedDropCount.Value;
        Assert.InRange(placed, 1, selected);
        Assert.Equal(selected, placed + carry.PendingPower.Value + carry.PendingCapacity.Value + carry.PendingSpeed.Value + (carry.PendingBombSkill.Value == 0 ? 0 : 1));
        var items = world.Each<BomberPickupItem>().Where(i => i.DroppedBy.Value == lives[0]).ToArray();
        Assert.Equal(placed, items.Length);
        Assert.All(items, item =>
        {
            Assert.Equal(participant.Entity, item.DropParticipant.Value);
            Assert.Equal(carry.DropMatchId.Value, item.DropMatchId.Value);
            Assert.Equal(carry.DropGeneration.Value, item.DropLifeGeneration.Value);
            Assert.Equal(deathTick, item.DropOccurrenceTick.Value);
            Assert.True(item.ProtectedUntilTick.Value > item.SpawnTick.Value);
        });
        manager.Tick();
        Assert.Equal(selected, carry.SelectedDropCount.Value);
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
        Assert.Equal(carry.PlacedDropCount.Value, world.Each<BomberPickupItem>().Count(i => i.DroppedBy.Value == lives[0]));
    }
}
