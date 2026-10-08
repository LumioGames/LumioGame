using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberSuccessorLifecycleTests
{
    [Theory]
    // Paired fresh admission assigns participant counter 3. These seeds retain the
    // full loadout at the exercised death cuts (22/31); production drop rates stay intact.
    [InlineData(1, 1, 6, 9UL)]
    [InlineData(2, 2, 8, 22UL)]
    public void RespawnCreatesDistinctLifeRestoresCarryAndRejectsOldSourceDamage(int powerPickups, int capacityPickups, int expectedHealth, ulong seed)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        var config = BomberConfigBinding.For(world);
        NetEntityId oldLife = scene.Lives[0];
        var oldPlayer = world.Get<BomberPlayerState>(oldLife);
        var participant = world.Get<BomberParticipantState>(oldPlayer.Participant.Value);
        var match = world.Single<BomberMatchState>();
        match.Seed.Value = seed;
        var owner = world.Get<AbilityComponent>(oldLife);
        for (int z = 2; z < 17; z++)
        for (int x = 2; x < 17; x++)
        {
            scene.Write(x, 0, z, 1022u << 8);
            scene.Write(x, 1, z, 0);
        }
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(oldLife), new Vector3(12.5f, 1.5f, 12.5f));
        for (int i = 0; i < powerPickups; i++) BomberGrowthHealthTests.Take(scene.Manager, oldLife, (int)BomberPickupKind.Power);
        for (int i = 0; i < capacityPickups; i++) BomberGrowthHealthTests.Take(scene.Manager, oldLife, (int)BomberPickupKind.Capacity);
        BomberGrowthHealthTests.Take(scene.Manager, oldLife, (int)BomberPickupKind.Speed);
        var special = BomberGrowthHealthTests.Item(world, oldLife, (int)BomberPickupKind.Skill);
        special.Get<BomberPickupItem>().SkillId.Value = 7;
        special.Get<BomberPickupItem>().SkillLevel.Value = 1;
        scene.TickControlled();
        owner.Activate<PickupAbility, PickupAbility.Input>(new PickupAbility.Input { Target = special.AssignedId });
        scene.TickControlled();
        Assert.False(world.IsLive(special.AssignedId));
        Assert.Equal(7u, world.Get<BomberSkillState>(oldLife).BombSkillId.Value);
        Assert.Equal(expectedHealth, oldPlayer.MaximumHealth.Value);

        // A genuinely placed old Fuse explains the inherited inventory debit.
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(oldLife), new Vector3(3.5f, 1.5f, 3.5f));
        owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        scene.TickControlled();
        var outstanding = Assert.Single(world.Each<BomberBombState>(), b => b.Owner.Value == participant.Entity);
        outstanding.FuseEndTick.Value = world.Tick + 2000;
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(oldLife), new Vector3(12.5f, 1.5f, 12.5f));
        BomberBombState? lethal = null;
        for (int hit = 0; hit < expectedHealth / 2; hit++)
        {
            while (world.Get<BomberSkillState>(oldLife).FrozenUntilTick.Value > world.Tick) scene.TickControlled();
            Assert.True(new PlaceBombAbility().CanActivate(default, owner, out string? reason), reason);
            owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
            scene.TickControlled();
            lethal = Assert.Single(world.Each<BomberBombState>(), b => b.Owner.Value == participant.Entity && b.Entity != outstanding.Entity && b.Phase.Value == (int)BomberBombPhase.Fuse);
            lethal.FuseEndTick.Value = world.Tick;
            scene.TickControlled();
            Assert.Equal(expectedHealth - 2 * (hit + 1), world.Get<AttributeComponent>(oldLife).GetBaseValue(BomberAttributeNames.HealthPoints));
            if (hit != expectedHealth / 2 - 1) scene.TickControlled();
        }
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, oldPlayer.LifePhase.Value);
        Assert.True(participant.DeathStructurePending.Value);
        Assert.Equal(oldLife, participant.CurrentLife.Value);
        Assert.NotNull(lethal);
        // Stretch this already-hit bomb across the lifetime boundary as a bounded
        // fixture input. Never manufacture a new bomb with a destroyed source.
        lethal.DangerUntilTick.Value = world.Tick + 1000;
        BomberSourceIdentity originalSource = lethal.ReadSource();
        scene.TickControlled();
        Assert.False(world.IsLive(oldLife));
        Assert.False(BomberMatchRules.IsPlayerInputOpen(world, oldLife));
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        Assert.Equal(0, carry.SelectedDropCount.Value);
        Assert.Equal(2 + powerPickups, carry.PowerBase.Value);
        Assert.Equal(1 + capacityPickups, carry.CapacityBase.Value);
        Assert.Equal(1, carry.SpeedTierBase.Value);
        Assert.Equal(7, carry.BombSkillId.Value);
        ulong wait = Ticks.FromMilliseconds(config.Life.RespawnMs, config.Game.TickRateHz) + 16;
        for (ulong i = 0; i < wait && participant.CurrentLife.Value == oldLife; i++) scene.TickControlled();
        NetEntityId successorId = participant.CurrentLife.Value;
        Assert.NotEqual(oldLife, successorId);
        Assert.True(world.IsLive(successorId));
        Assert.Equal(2UL, participant.LifeGeneration.Value);
        Assert.Equal(successorId, participant.LastLife.Value);
        Assert.False(participant.DeathStructurePending.Value);
        Assert.True(scene.ControlledBinding!.TryResolveConnectionState("successor-0", out NetEntityId controlled, out _));
        Assert.Equal(successorId, controlled);
        Assert.Contains(scene.TransferResults, result => result.Operation == "transfer" && result.CommitFact == SuccessorCommitFact.Applied);
        var successorAttributes = world.Get<AttributeComponent>(successorId);
        Assert.Equal(2 + powerPickups, successorAttributes.GetBaseValue(BomberAttributeNames.BombPower));
        Assert.Equal(1 + capacityPickups, successorAttributes.GetBaseValue(BomberAttributeNames.BombCapacity));
        Assert.Equal(capacityPickups, successorAttributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(1, successorAttributes.GetBaseValue(BomberAttributeNames.SpeedTier));
        Assert.Equal(config.SpeedTier(1).SpeedMilli, successorAttributes.GetBaseValue(BomberAttributeNames.MovementSpeedMilli));
        Assert.Equal(expectedHealth, successorAttributes.GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(7u, world.Get<BomberSkillState>(successorId).BombSkillId.Value);
        Assert.Equal(1, world.Get<BomberSkillState>(successorId).BombSkillLevel.Value);
        var successor = world.Get<BomberPlayerState>(successorId);
        successor.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        successor.ProtectedUntilTick.Value = 0;
        Assert.True(lethal.TryReadHit(participant.Entity, out var oldTarget, out var state));
        Assert.Equal(oldLife, oldTarget.Life);
        Assert.Equal(1UL, oldTarget.LifeGeneration);
        Assert.Equal(BomberHitStorageState.ContactApplied, state);
        Assert.Equal(originalSource, lethal.ReadSource());
        Assert.Equal(BomberStorageAdmission.Duplicate, lethal.TryReserveHit(new(participant.Entity, successorId, 2)));
        BomberEffectBusiness.ReserveDamage(world, match, lethal, successor, 12, 12);
        BomberEffectBusiness.SubmitDamage(world, lethal);
        scene.TickControlled(); scene.TickControlled();
        Assert.Equal(expectedHealth, successorAttributes.GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(oldLife, world.Get<BomberDamageFacts>(lethal.Entity).Target[0]);
        Assert.Equal(1UL, participant.DeathConsumedCount.Value);
    }

}
