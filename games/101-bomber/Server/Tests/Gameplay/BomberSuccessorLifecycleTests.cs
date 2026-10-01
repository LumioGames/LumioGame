using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberSuccessorLifecycleTests
{
    [Fact]
    public void RespawnCreatesDistinctLifeRestoresCarryAndRejectsOldSourceDamage()
    {
        using WorldManager manager = BomberTestWorld.Start();
        World world = manager.World;
        EntityOrder[] players = Enumerable.Range(0, 8)
            .Select(i => BomberTestWorld.QueuePlayer(world, "successor-" + i)).ToArray();
        manager.Tick();
        manager.Tick();
        manager.Tick();

        NetEntityId oldLife = players[0].AssignedId;
        BomberPlayerState oldPlayer = world.Get<BomberPlayerState>(oldLife);
        oldPlayer.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        oldPlayer.ProtectedUntilTick.Value = 0;
        AttributeComponent oldAttributes = world.Get<AttributeComponent>(oldLife);
        oldAttributes.SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        oldAttributes.SetCurrentValue(BomberAttributeNames.HealthPoints, 2);
        oldAttributes.SetBaseValue(BomberAttributeNames.BombPower, 4);
        oldAttributes.SetCurrentValue(BomberAttributeNames.BombPower, 4);
        oldAttributes.SetBaseValue(BomberAttributeNames.BombCapacity, 3);
        oldAttributes.SetCurrentValue(BomberAttributeNames.BombCapacity, 3);
        oldAttributes.SetBaseValue(BomberAttributeNames.AvailableBombs, 1);
        oldAttributes.SetCurrentValue(BomberAttributeNames.AvailableBombs, 1);
        oldAttributes.SetBaseValue(BomberAttributeNames.SpeedTier, 1);
        oldAttributes.SetCurrentValue(BomberAttributeNames.SpeedTier, 1);
        oldAttributes.SetBaseValue(BomberAttributeNames.MovementSpeedMilli, 3800);
        oldAttributes.SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 3800);
        BomberSkillState oldSkill = world.Get<BomberSkillState>(oldLife);
        oldSkill.BombSkillId.Value = 7;
        oldSkill.BombSkillLevel.Value = 2;

        SpawnBomb(world, oldPlayer.Participant.Value, oldLife, oldPlayer.LifeGeneration.Value,
            world.Get<LogicTransform>(oldLife).LocalPosition, world.Tick);
        manager.Tick();
        manager.Tick();

        BomberParticipantState participant = world.Get<BomberParticipantState>(oldPlayer.Participant.Value);
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, oldPlayer.LifePhase.Value);
        Assert.True(participant.DeathStructurePending.Value);
        Assert.True(participant.CurrentLife.Value.IsDefault);
        ulong respawnAt = participant.RespawnAtTick.Value;
        while (world.Tick < respawnAt) manager.Tick();

        manager.Tick();
        Assert.False(world.IsLive(oldLife));
        Assert.True(participant.CurrentLife.Value.IsDefault);
        NetEntityId successorId = world.Each<BomberPlayerState>()
            .Single(player => player.Participant.Value == participant.Entity).Entity;
        Assert.NotEqual(oldLife, successorId);

        manager.Tick();
        Assert.Equal(successorId, participant.CurrentLife.Value);
        Assert.Equal(successorId, participant.LastLife.Value);
        Assert.False(participant.DeathStructurePending.Value);
        AttributeComponent successorAttributes = world.Get<AttributeComponent>(successorId);
        Assert.Equal(4, successorAttributes.GetBaseValue(BomberAttributeNames.BombPower));
        Assert.Equal(3, successorAttributes.GetBaseValue(BomberAttributeNames.BombCapacity));
        Assert.Equal(2, successorAttributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(1, successorAttributes.GetBaseValue(BomberAttributeNames.SpeedTier));
        Assert.Equal(6, successorAttributes.GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(7u, world.Get<BomberSkillState>(successorId).BombSkillId.Value);
        Assert.Equal(2, world.Get<BomberSkillState>(successorId).BombSkillLevel.Value);

        BomberPlayerState successor = world.Get<BomberPlayerState>(successorId);
        successor.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        successor.ProtectedUntilTick.Value = 0;
        SpawnBomb(world, participant.Entity, oldLife, 1, world.Get<LogicTransform>(successorId).LocalPosition,
            world.Tick);
        manager.Tick();
        manager.Tick();
        Assert.Equal(6, successorAttributes.GetCurrentValue(BomberAttributeNames.HealthPoints));
    }

    private static void SpawnBomb(World world, NetEntityId owner, NetEntityId sourceLife,
        ulong sourceGeneration, System.Numerics.Vector3 position, ulong fuseEndTick)
    {
        EntityOrder order = world.Commands.Create<BomberBombEntity>();
        BomberBombState bomb = order.Get<BomberBombState>();
        bomb.Owner.Value = owner;
        bomb.SourceLife.Value = sourceLife;
        bomb.SourceLifeGeneration.Value = sourceGeneration;
        bomb.Phase.Value = (int)BomberBombPhase.Fuse;
        bomb.Power.Value = 2;
        bomb.FuseEndTick.Value = fuseEndTick;
        bomb.PlacedAtTick.Value = world.Tick;
        bomb.ChainId.Value = world.Tick + 1;
        EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
            FormattableString.Invariant($"{position.X:R},{position.Y:R},{position.Z:R}"), silent: true);
    }
}
