using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberInventoryContinuityTests
{
    [Fact]
    public void SameTickRefundGrowthAndBufferedPlacementKeepOneInventoryPerActualFuse()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        World world = scene.World;
        NetEntityId life = scene.Lives[0];
        var owner = world.Get<AbilityComponent>(life);
        var attributes = world.Get<AttributeComponent>(life);
        MovementInputMemoryTests.Position(scene, new Vector3(5.5f, 1.5f, 5.5f));
        owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        scene.Manager.Tick();
        BomberBombState oldBomb = Assert.Single(world.Each<BomberBombState>());
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center);
        EntityOrder item = BomberGrowthHealthTests.Item(world, life, (int)BomberPickupKind.Capacity);
        MovementInputMemoryTests.Position(scene, new Vector3(9.5f, 1.5f, 7.5f));
        scene.Manager.Tick();
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center);
        oldBomb.FuseEndTick.Value = world.Tick;
        owner.Activate<PickupAbility, PickupAbility.Input>(new() { Target = item.AssignedId });
        owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        Assert.Equal(0, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        scene.Manager.Tick();
        Assert.True(oldBomb.CapacityReturned.Value);
        Assert.Equal(2, attributes.GetBaseValue(BomberAttributeNames.BombCapacity));
        Assert.Equal(2, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        scene.Manager.Tick();
        Assert.Single(world.Each<BomberBombState>(), b => b.Owner.Value == oldBomb.Owner.Value && b.Phase.Value == (int)BomberBombPhase.Fuse);
        Assert.Equal(1, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        for (int i = 0; i < 3; i++) scene.Manager.Tick();
        Assert.Equal(1, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void PreparedSuccessorCannotSpendSeedInventoryBeforeRestorationAndActualTransfer()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        NetEntityId old = scene.Lives[0];
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        var state = world.Get<BomberSuccessorState>(participant.Entity);
        world.Get<AbilityComponent>(old).Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        scene.TickControlled();
        BomberBombState outstanding = Assert.Single(world.Each<BomberBombState>(), b => b.Owner.Value == participant.Entity);
        outstanding.FuseEndTick.Value = world.Tick + 400;
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(old), new Vector3(11.5f, 1.5f, 11.5f));
        for (ulong chain = 7991; chain < 7994; chain++) BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        bool observedPrepared = false, observedRestored = false;
        for (int i = 0; i < 90; i++)
        {
            scene.TickControlled(deliverTransfers: false);
            if (state.DormantLife.Value.IsDefault || !world.IsLive(state.DormantLife.Value)) continue;
            observedPrepared = true;
            observedRestored |= state.RestoreOutcome.Value == 1;
            var owner = world.Get<AbilityComponent>(state.DormantLife.Value);
            Assert.False(PlaceBombAbility.CanPlace(owner, out string? reason));
            Assert.Equal("bomber_match_not_ready", reason);
            Assert.False(new BombButtonAbility().CanActivate(new() { Phase = 1 }, owner, out _));
            owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
            Assert.Equal(old, participant.CurrentLife.Value);
            Assert.Single(world.Each<BomberBombState>(), b => b.Owner.Value == participant.Entity && b.Phase.Value == (int)BomberBombPhase.Fuse);
        }
        Assert.True(observedPrepared);
        Assert.True(observedRestored);
        Assert.NotEmpty(scene.PendingTransfers);
        for (int i = 0; i < 8 && participant.CurrentLife.Value == old; i++) scene.TickControlled();
        Assert.NotEqual(old, participant.CurrentLife.Value);
        var current = world.Get<AbilityComponent>(participant.CurrentLife.Value);
        Assert.False(PlaceBombAbility.CanPlace(current, out string? currentReason));
        Assert.Equal("bomb_capacity_empty", currentReason);
        Assert.Equal(0, world.Get<AttributeComponent>(participant.CurrentLife.Value).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void SuccessorPlacementConsumesInventoryUntilItsActualNewFuseExits()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        NetEntityId old = scene.Lives[0];
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        for (ulong chain = 7911; chain < 7914; chain++) BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        ulong wait = Ticks.FromMilliseconds(BomberConfigBinding.For(world).Life.RespawnMs, BomberConfigBinding.For(world).Game.TickRateHz) + 16;
        for (ulong i = 0; i < wait && participant.CurrentLife.Value == old; i++) scene.TickControlled();
        NetEntityId life = participant.CurrentLife.Value;
        Assert.NotEqual(old, life);
        Assert.True(world.IsLive(life));
        Assert.Equal(2UL, participant.LifeGeneration.Value);
        var inventory = world.Get<AttributeComponent>(life);
        Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(3.5f, 1.5f, 3.5f));
        var owner = world.Get<AbilityComponent>(life);
        owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        scene.TickControlled();
        var bomb = Assert.Single(world.Each<BomberBombState>(), b => b.Owner.Value == participant.Entity && b.Phase.Value == (int)BomberBombPhase.Fuse);
        Assert.Equal(life, bomb.SourceLife.Value);
        Assert.Equal(2UL, bomb.SourceLifeGeneration.Value);
        Assert.Equal(0, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(9.5f, 1.5f, 3.5f));
        Assert.False(PlaceBombAbility.CanPlace(owner, out string? reason));
        Assert.Equal("bomb_capacity_empty", reason);
        owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        scene.TickControlled();
        Assert.Single(world.Each<BomberBombState>(), b => b.Owner.Value == participant.Entity && b.Phase.Value == (int)BomberBombPhase.Fuse);
        Assert.Equal(0, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        bomb.FuseEndTick.Value = world.Tick;
        scene.TickControlled(); scene.TickControlled();
        Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        scene.TickControlled();
        Assert.Single(world.Each<BomberBombState>(), b => b.Owner.Value == participant.Entity && b.Phase.Value == (int)BomberBombPhase.Fuse);
        Assert.Equal(0, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void CapacityLossKeepsOldFusesAndOpensInventoryOnlyAfterTheExcessLeavesFuse()
    {
        string profile = System.IO.Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Server/Config/Profiles/death-drop-1000");
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true, configDirectory: profile);
        World world = scene.World;
        NetEntityId old = scene.Lives[0];
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        for (int i = 0; i < 5; i++) BomberGrowthHealthTests.Take(scene.Manager, old, 1);
        Assert.Equal(6, world.Get<AttributeComponent>(old).GetBaseValue(BomberAttributeNames.BombCapacity));
        foreach (int x in new[] { 3, 9, 15 })
        {
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(old), new Vector3(x + 0.5f, 1.5f, 3.5f));
            world.Get<AbilityComponent>(old).Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
            scene.TickControlled();
        }
        BomberBombState[] bombs = world.Each<BomberBombState>().Where(b => b.Owner.Value == participant.Entity).ToArray();
        Assert.Equal(3, bombs.Length);
        foreach (var bomb in bombs) bomb.FuseEndTick.Value = world.Tick + 400;
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(old), new Vector3(11.5f, 1.5f, 11.5f));
        for (ulong chain = 7901; chain < 7906; chain++)
            BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        ulong wait = Ticks.FromMilliseconds(BomberConfigBinding.For(world).Life.RespawnMs, BomberConfigBinding.For(world).Game.TickRateHz) + 16;
        for (ulong i = 0; i < wait && participant.CurrentLife.Value == old; i++) scene.TickControlled();
        NetEntityId current = participant.CurrentLife.Value;
        Assert.NotEqual(old, current);
        var attributes = world.Get<AttributeComponent>(current);
        Assert.Equal(1, attributes.GetBaseValue(BomberAttributeNames.BombCapacity));
        Assert.Equal(0, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.All(bombs, bomb => Assert.True(world.IsLive(bomb.Entity)));
        for (int i = 0; i < bombs.Length; i++)
        {
            Assert.Equal(0, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
            Assert.False(PlaceBombAbility.CanPlace(world.Get<AbilityComponent>(current), out string? code));
            Assert.Equal("bomb_capacity_empty", code);
            bombs[i].FuseEndTick.Value = world.Tick;
            scene.TickControlled(); scene.TickControlled();
            Assert.Equal(i == bombs.Length - 1 ? 1 : 0, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        }
        var invalid = new BomberInventoryEffect.Parameters { Available = 0, Fx = "bomber.inventory", Participant = participant.Entity,
            Life = old, Generation = 1, MatchId = participant.MatchId.Value, Capacity = 1 };
        Assert.True(Effects.Apply<BomberInventoryEffect, BomberInventoryEffect.Parameters>(world, current, in invalid, old).Succeeded);
        scene.TickControlled(); scene.TickControlled();
        Assert.Equal(1, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void OldFuseExitReconcilesCurrentInventoryAcrossActualRespawn(bool exitAfterRespawn)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        NetEntityId old = scene.Lives[0];
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        world.Get<AbilityComponent>(old).Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        scene.TickControlled();
        BomberBombState placed = Assert.Single(world.Each<BomberBombState>(), b => b.Owner.Value == participant.Entity);
        NetEntityId bombId = placed.Entity;
        Assert.Equal(0, world.Get<AttributeComponent>(old).GetBaseValue(BomberAttributeNames.AvailableBombs));
        ulong wait = Ticks.FromMilliseconds(BomberConfigBinding.For(world).Life.RespawnMs, BomberConfigBinding.For(world).Game.TickRateHz) + 16;
        // Author only the pending fuse deadline to cover both sides of the actual handoff.
        // This boundary fixture is not acceptance for an enabled Remote bomb config.
        if (exitAfterRespawn) placed.FuseEndTick.Value = world.Tick + wait * 2;
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(old), new Vector3(11.5f, 1.5f, 11.5f));
        for (ulong chain = 7801; chain < 7804; chain++)
            BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        Assert.False(world.IsLive(old));
        for (ulong i = 0; i < wait && participant.CurrentLife.Value == old; i++) scene.TickControlled();
        NetEntityId current = participant.CurrentLife.Value;
        Assert.NotEqual(old, current);
        Assert.True(world.IsLive(current));
        Assert.Equal(2UL, participant.LifeGeneration.Value);
        var inventory = world.Get<AttributeComponent>(current);
        Assert.Equal(exitAfterRespawn ? 0 : 1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        if (exitAfterRespawn)
        {
            placed.FuseEndTick.Value = world.Tick;
            scene.TickControlled(); scene.TickControlled();
            Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        }
        for (int i = 0; i < 8; i++) scene.TickControlled();
        Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.DoesNotContain(world.Each<BomberBombState>(), b => b.Entity == bombId && b.Phase.Value == (int)BomberBombPhase.Fuse);
        var explosions = BomberEffectIntegrationTests.Events(world, "bomb_exploded");
        Assert.Contains(explosions, e => e.GetProperty("entityId").GetString() == bombId.ToHex() && e.GetProperty("lifeId").GetString() == old.ToHex());
    }
}

