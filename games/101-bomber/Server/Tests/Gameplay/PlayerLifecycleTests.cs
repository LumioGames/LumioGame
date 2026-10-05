using System.Numerics;
using System.Threading;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Simulation;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class PlayerLifecycleTests
{
    [Fact]
    public void HealClampsAnAlreadyOverMaximumBaseThroughTheActualEffect()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        var health = world.Get<AttributeComponent>(lives[0]);
        long maximum = world.Get<BomberPlayerState>(lives[0]).MaximumHealth.Value;
        // Seed the out-of-range premise only; the real pickup Effect must perform the clamp.
        health.SetBaseValue(BomberAttributeNames.HealthPoints, maximum + 1);
        EntityOrder pickup = world.Commands.Create<Lumio.Bomber.Gameplay.Contracts.EntityTypes.BomberPickupItemEntity>();
        pickup.Get<BomberPickupItem>().Kind.Value = (int)BomberPickupKind.Health;
        BomberEffectIntegrationTests.Position(pickup.Get<LogicTransform>(), world.Get<LogicTransform>(lives[0]).LocalPosition);
        manager.Tick();
        Assert.Equal(maximum + 1, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        world.Get<AbilityComponent>(lives[0]).Activate<PickupAbility, PickupAbility.Input>(new PickupAbility.Input { Target = pickup.AssignedId });
        manager.Tick();
        var fact = world.Get<BomberHealthFacts>(lives[0]);
        Assert.True(fact.Ready[0]); Assert.Equal(1, fact.Status[0]);
        Assert.Equal(maximum + 1, fact.Before[0]); Assert.Equal(maximum, fact.After[0]);
        Assert.Equal(-1L, fact.Actual[0]);
        Assert.Equal(maximum, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(maximum, health.GetCurrentValue(BomberAttributeNames.HealthPoints));
        manager.Tick();
        Assert.Equal(maximum, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(maximum, health.GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.Single(BomberEffectIntegrationTests.Events(world, "heal_applied"));
    }

    [Fact]
    public void EffectHealingAndMatchingRestorationPersistThroughQuietTicks()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        NetEntityId life = lives[0];
        var player = world.Get<BomberPlayerState>(life);
        var health = world.Get<AttributeComponent>(life);
        BomberEffectIntegrationTests.Bomb(world, lives[1], life, 501);
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.Equal(4L, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        EntityOrder pickup = world.Commands.Create<Lumio.Bomber.Gameplay.Contracts.EntityTypes.BomberPickupItemEntity>();
        pickup.Get<BomberPickupItem>().Kind.Value = (int)BomberPickupKind.Health;
        BomberEffectIntegrationTests.Position(pickup.Get<LogicTransform>(), world.Get<LogicTransform>(life).LocalPosition);
        manager.Tick();
        world.Get<AbilityComponent>(life).Activate<PickupAbility, PickupAbility.Input>(new PickupAbility.Input { Target = pickup.AssignedId });
        manager.Tick();
        Assert.Equal(6L, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(6L, health.GetCurrentValue(BomberAttributeNames.HealthPoints));
        var fact = world.Get<BomberHealthFacts>(life);
        Assert.True(fact.Ready[0]);
        Assert.Equal(4L, fact.Before[0]); Assert.Equal(6L, fact.After[0]); Assert.Equal(2L, fact.Actual[0]);
        manager.Tick();
        Assert.Equal(6L, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Single(BomberEffectIntegrationTests.Events(world, "heal_applied"));
        BomberEffectIntegrationTests.Bomb(world, lives[1], life, 502);
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.Equal(4L, health.GetCurrentValue(BomberAttributeNames.HealthPoints));
        // A live prepared restoration intent is consumed by the actual planning system.
        player.RestoreIntent.Value = 17;
        player.RestorePending.Value = true;
        manager.Tick();
        Assert.Equal(6L, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(6L, health.GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.False(player.RestorePending.Value);
        Assert.Equal(17UL, player.RestoredIntent.Value);
        Assert.Equal(4L, fact.Before[0]); Assert.Equal(6L, fact.After[0]);
        manager.Tick();
        Assert.Equal(6L, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(6L, health.GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.Single(BomberEffectIntegrationTests.Events(world, "health_restored"));
    }

    [Fact]
    public void NextMatchRestoresExistingLifeThroughAnAppliedEffect()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        WorldManager manager = scene.Manager;
        NetEntityId[] lives = scene.Lives;
        World world = manager.World;
        BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 601);
        manager.Tick(); manager.Tick(); manager.Tick();
        var health = world.Get<AttributeComponent>(lives[0]);
        Assert.Equal(4L, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        var match = world.Single<BomberMatchState>();
        ulong oldMatch = match.MatchId.Value;
        BomberRoundRolloverTests.EndRound(scene);
        Assert.Equal(oldMatch + 1, match.MatchId.Value);
        Assert.Equal(6L, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(6L, health.GetCurrentValue(BomberAttributeNames.HealthPoints));
        var fact = world.Get<BomberHealthFacts>(lives[0]);
        Assert.Equal(10104u, fact.TypeId[0]);
        Assert.True(fact.Ready[0]); Assert.Equal(1, fact.Status[0]);
        Assert.Equal(4L, fact.Before[0]); Assert.Equal(6L, fact.After[0]);
        manager.Tick();
        Assert.Equal(6L, health.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(6L, health.GetCurrentValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void CreationOccursOnlyOnTheOwnerTickAndPlacesThePlayerAboveTheFloor()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder player = BomberTestWorld.QueuePlayer(manager.World, "lifecycle");
        Assert.Equal(0UL, player.AssignedId.Counter);
        manager.Tick();
        Assert.True(manager.World.IsLive(player.AssignedId));
        Assert.Equal(new Vector3(1.5f, 1.5f, 1.5f), manager.World.Get<LogicTransform>(player.AssignedId).LocalPosition);
    }

    [Fact]
    public void SnapshotRestoresBaseLedgersFullIdentityAndPosition()
    {
        using WorldManager manager = BomberTestWorld.Start(0xFEDCBA9876543210UL);
        EntityOrder player = BomberTestWorld.QueuePlayer(manager.World, "restore");
        manager.Tick();
        AttributeComponent before = manager.World.Get<AttributeComponent>(player.AssignedId);
        before.SetBaseValue("BombPower", 4);
        var source = new NetEntityId(0x123456789ABCDEF0UL, 0xFEDCBA9876543210UL);
        manager.World.Get<BomberSkillState>(player.AssignedId).ToxinSource.Value = source;
        byte[] snapshot = manager.CaptureSnapshot();
        Assert.NotEmpty(snapshot);
        using WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();
        restored.Tick();
        Assert.Equal(4, restored.World.Get<AttributeComponent>(player.AssignedId).GetBaseValue("BombPower"));
        Assert.Equal(4, restored.World.Get<AttributeComponent>(player.AssignedId).GetCurrentValue("BombPower"));
        Assert.Equal(source, restored.World.Get<BomberSkillState>(player.AssignedId).ToxinSource.Value);
        Assert.Equal(manager.World.Get<LogicTransform>(player.AssignedId).LocalPosition, restored.World.Get<LogicTransform>(player.AssignedId).LocalPosition);
    }
}
