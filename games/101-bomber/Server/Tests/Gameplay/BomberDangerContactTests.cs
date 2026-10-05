using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberDangerContactTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void EnteringCommittedBlastCoverageOnlyHitsDuringItsOriginalDangerWindow(bool afterExpiry)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        Vector3 origin = world.Get<LogicTransform>(lives[0]).LocalPosition;
        EntityOrder order = BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 280);
        order.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(lives[0]), origin + new Vector3(4, 0, 4));
        manager.Tick(); manager.Tick();
        var bomb = world.Get<BomberBombState>(order.AssignedId);
        ulong originalEnd = bomb.DangerUntilTick.Value;
        Assert.Equal((int)BomberBombPhase.Danger, bomb.Phase.Value);
        Assert.Equal(6, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(0, bomb.HitParticipants.Count);
        if (afterExpiry) while (world.Tick < originalEnd) manager.Tick();
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(lives[0]), origin);
        manager.Tick();
        Assert.Equal(originalEnd, bomb.DangerUntilTick.Value);
        Assert.Equal(afterExpiry ? 6 : 4, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        if (afterExpiry) Assert.Empty(world.Get<EffectComponent>(lives[0]).ActiveEffects);
        else Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10108u);
        manager.Tick();
        Assert.Equal(afterExpiry ? 6 : 4, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(afterExpiry ? 0 : 1, BomberEffectIntegrationTests.Events(world, "damage_applied").Length);
    }

    [Fact]
    public void TwoLivesInOneBlastCellReserveBothRowsBeforeEffectAdmission()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(lives[2]), world.Get<LogicTransform>(lives[0]).LocalPosition);
        EntityOrder order = BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 281);
        order.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick(); manager.Tick();
        foreach (NetEntityId life in new[] { lives[0], lives[2] })
        {
            Assert.Equal(4, world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints));
            Assert.Single(world.Get<EffectComponent>(life).ActiveEffects, row => row.TypeId == 10108u);
        }
        var facts = world.Get<BomberDamageFacts>(order.AssignedId);
        Assert.Equal(2, facts.Target.Count);
        Assert.All(Enumerable.Range(0, facts.Target.Count), row => { Assert.Equal(1, facts.Status[row]); Assert.True(facts.Ready[row]); });
        manager.Tick(); manager.Tick();
        Assert.Equal(2, BomberEffectIntegrationTests.Events(world, "damage_applied").Length);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void RejectedLastDangerTickDoesNotRetryAfterTheOriginalDeadline(int remainingRequests)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives, WireProfile.SuccessorBindingReceiptsPartsV1);
        World world = manager.World;
        Vector3 origin = world.Get<LogicTransform>(lives[0]).LocalPosition;
        EntityOrder order = BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 282);
        order.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(lives[0]), origin + new Vector3(4, 0, 4));
        manager.Tick(); manager.Tick();
        var bomb = world.Get<BomberBombState>(order.AssignedId);
        ulong originalEnd = bomb.DangerUntilTick.Value;
        while (world.Tick < originalEnd - 1) manager.Tick();
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(lives[0]), origin);
        BomberFiniteFreezeTests.FillRequests(world, lives[7], remainingRequests);
        manager.Tick();
        Assert.Equal(originalEnd, world.Tick);
        var facts = world.Get<BomberDamageFacts>(order.AssignedId);
        Assert.Single(Enumerable.Range(0, facts.Target.Count));
        Assert.Equal(2, facts.Status[0]);
        Assert.False(facts.Ready[0]);
        Assert.Equal(6, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(originalEnd, bomb.DangerUntilTick.Value);
        // The rejected F-stage fact is consumed on the next Tick, before the
        // actual Native expiry destroys the bomb and its pending storage.
        Assert.Equal(1, bomb.HitParticipants.Count);
        var player = world.Get<BomberPlayerState>(lives[0]);
        Assert.True(bomb.TryReadHit(player.Participant.Value, out var target, out var hitState));
        Assert.Equal(new BomberTargetIdentity(player.Participant.Value, lives[0], player.LifeGeneration.Value), target);
        Assert.Equal(BomberHitStorageState.Pending, hitState);
        Assert.Equal(remainingRequests != 0, bomb.HitHandleWorlds[0] != 0);
        Assert.Equal(remainingRequests != 0, bomb.HitHandleInstances[0] != 0);
        Assert.Equal(remainingRequests != 0, bomb.HitHandleGenerations[0] != 0);
        Assert.Equal(bomb.HitHandleWorlds[0], facts.HandleWorld[0]);
        Assert.Equal(bomb.HitHandleInstances[0], facts.HandleInstance[0]);
        Assert.Equal(bomb.HitHandleGenerations[0], facts.HandleGeneration[0]);
        Assert.False(bomb.HitDependentsAdmitted[0]);
        manager.Tick();
        // At the exact deadline the actual Native HFSM expires this bomb. Its
        // detached component is no longer a readable substitute for lifecycle evidence.
        Assert.False(world.IsLive(order.AssignedId));
        Assert.Empty(world.Get<EffectComponent>(lives[0]).ActiveEffects);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "damage_applied"));
        Assert.Equal(6, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }
}
