using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Numerics;
using System.Reflection;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberPublicAuraProductionTests
{
    [Fact]
    public void SelectedBearPublicCastWaitsForActualAppliedBeforeProtectionCooldownAndOneOccurrence()
    {
        using var scene = Open();
        using var receipts = new ReceiptProbe(scene.World);
        NetEntityId life = scene.Lives[0];
        var player = scene.World.Get<BomberPlayerState>(life);
        var skill = scene.World.Get<BomberSkillState>(life);
        var config = BomberConfigBinding.For(scene.World);
        var level = config.SkillLevel(4, 1);
        player.ProtectedUntilTick.Value = scene.World.Tick + 500;
        ulong protection = player.ProtectedUntilTick.Value;
        ulong start = SubmitPublic(scene);
        Assert.Equal(protection, player.ProtectedUntilTick.Value);
        Assert.Equal(0UL, skill.AuraUntilTick.Value);
        Assert.Equal(0UL, skill.CooldownFromTick.Value);
        Assert.Equal(0UL, skill.CooldownUntilTick.Value);
        Assert.Empty(Casts(scene.World));
        Assert.Equal(0, Statistics(scene.World, life).SkillCasts.Value);

        scene.TickControlled();
        FiniteEffectView active = AssertActualAura(scene.World, life, start, receipts);
        Assert.Equal(Ticks.FromMilliseconds(level.DurationMs, config.Game.TickRateHz), active.Duration);
        Assert.Equal(start + active.Duration, active.EndTick);
        Assert.Equal(start, skill.CooldownFromTick.Value);
        ulong cooldown = start + Ticks.FromMilliseconds(level.CooldownMs, config.Game.TickRateHz);
        Assert.Equal(cooldown, skill.CooldownUntilTick.Value);
        Assert.Equal(0UL, player.ProtectedUntilTick.Value);
        scene.TickControlled();
        AssertOneCast(scene.World, life, start, active.EndTick);
        Assert.Equal(0, skill.AuraOutcome.Value);
        while (scene.World.Tick <= active.EndTick) scene.TickControlled();
        Assert.DoesNotContain(scene.World.Get<EffectComponent>(life).ActiveEffects, row => row.TypeId == 10111u);
        Assert.Equal(0UL, skill.AuraUntilTick.Value);
        Assert.Equal(cooldown, skill.CooldownUntilTick.Value);
        AssertOneCast(scene.World, life, start, active.EndTick);
        Assert.False(new UseActiveSkillAbility().CanActivate(default, scene.World.Get<AbilityComponent>(life), out string? reason));
        Assert.Equal("active_skill_cooldown", reason);
        Assert.Equal(6L, Health(scene.World, life));
    }

    [Fact]
    public void DuplicateAndIndependentPendingPublicRequestsCannotSpendOrPublishAgain()
    {
        using var scene = Open();
        using var receipts = new ReceiptProbe(scene.World);
        NetEntityId life = scene.Lives[0];
        var owner = scene.World.Get<AbilityComponent>(life);
        var player = scene.World.Get<BomberPlayerState>(life);
        var skill = scene.World.Get<BomberSkillState>(life);
        player.ProtectedUntilTick.Value = scene.World.Tick + 500;
        ulong protection = player.ProtectedUntilTick.Value;
        ulong start = SubmitPublic(scene);
        var identity = (skill.AuraEffectWorld.Value, skill.AuraEffectInstance.Value,
            skill.AuraEffectGeneration.Value, skill.AuraChainId.Value);
        ulong chainLedger = scene.World.Single<BomberWorldRuntime>().NextChainId.Value;
        ulong abilityCooldown = owner.GetCooldown(UseActiveSkillAbility.TypeId);
        Assert.False(new UseActiveSkillAbility().CanActivate(default, owner, out string? pending));
        Assert.Equal("active_skill_pending", pending);
        var duplicate = owner.Activate<UseActiveSkillAbility, UseActiveSkillAbility.Input>(default, 9002);
        Assert.False(duplicate.Succeeded);
        var independent = owner.Activate<UseActiveSkillAbility, UseActiveSkillAbility.Input>(default, 9003);
        Assert.False(independent.Succeeded);
        Assert.Equal(identity, (skill.AuraEffectWorld.Value, skill.AuraEffectInstance.Value,
            skill.AuraEffectGeneration.Value, skill.AuraChainId.Value));
        Assert.Equal(chainLedger, scene.World.Single<BomberWorldRuntime>().NextChainId.Value);
        Assert.Equal(abilityCooldown, owner.GetCooldown(UseActiveSkillAbility.TypeId));
        Assert.Equal(protection, player.ProtectedUntilTick.Value);
        Assert.Equal(1, skill.AuraOutcome.Value);
        Assert.Equal(0UL, skill.AuraUntilTick.Value);
        Assert.Equal(0UL, skill.CooldownUntilTick.Value);
        Assert.Empty(Casts(scene.World));
        Assert.Equal(0, Statistics(scene.World, life).SkillCasts.Value);
        Assert.Equal(6L, Health(scene.World, life));
        scene.TickControlled();
        FiniteEffectView active = AssertActualAura(scene.World, life, start, receipts);
        scene.TickControlled();
        AssertOneCast(scene.World, life, start, active.EndTick);
        Assert.Single(receipts.Results, result => result.TypeId == 10111u && result.Kind == EffectResultKind.Initial);
    }

    [Fact]
    public void PublicAuraNeedsOneContinuousSecondAndSettlesAnExactOriginalSourceBurnFact()
    {
        using var scene = Open();
        using var receipts = new ReceiptProbe(scene.World);
        NetEntityId source = scene.Lives[0], target = scene.Lives[2];
        ulong cast = SubmitPublic(scene);
        scene.TickControlled();
        _ = AssertActualAura(scene.World, source, cast, receipts);
        Position(scene.World, target, 6, 5);
        scene.TickControlled();
        var exposure = scene.World.Get<BomberSkillState>(target);
        ulong began = exposure.FireExposureFromTick.Value;
        ulong interval = Ticks.FromMilliseconds(1000, BomberConfigBinding.For(scene.World).Game.TickRateHz);
        Assert.Equal(source, exposure.FireExposureEntity.Value);
        while (scene.World.Tick < began + interval) scene.TickControlled();
        Assert.Equal(6L, Health(scene.World, target));
        Assert.DoesNotContain(receipts.Results, result => result.TypeId == 10110u && result.Target == target);
        scene.TickControlled();
        EffectResult actual = Assert.Single(receipts.Results, result => result.TypeId == 10110u && result.Target == target);
        Assert.Equal(EffectResultOutcome.Applied, actual.Outcome);
        Assert.Equal(EffectResultKind.Initial, actual.Kind);
        Assert.Equal(began + interval, actual.AppliedTick);
        Assert.Equal(actual.AppliedTick, actual.Tick);
        Assert.Equal(source, actual.Source);
        Assert.Equal(4L, Health(scene.World, target));
        Assert.Equal(6L, Health(scene.World, source));
        var sourcePlayer = scene.World.Get<BomberPlayerState>(source);
        var targetPlayer = scene.World.Get<BomberPlayerState>(target);
        var facts = scene.World.Get<BomberFireFacts>(targetPlayer.Participant.Value);
        Assert.Equal(1, facts.FireStatus.Count);
        Assert.Equal(1, facts.FireStatus[0]);
        Assert.True(facts.FireReady[0]);
        Assert.Equal(actual.Handle.WorldId.Value, facts.FireHandleWorld[0]);
        Assert.Equal(actual.Handle.InstanceId.Value, facts.FireHandleInstance[0]);
        Assert.Equal(actual.Handle.Generation, facts.FireHandleGeneration[0]);
        Assert.Equal(10110u, facts.FireTypeId[0]);
        Assert.Equal(actual.Tick, facts.FireTick[0]);
        Assert.Equal(target, facts.FireTarget[0]);
        Assert.Equal(target, facts.FireLife[0]);
        Assert.Equal(targetPlayer.Participant.Value, facts.FireParticipant[0]);
        Assert.Equal(targetPlayer.LifeGeneration.Value, facts.FireGeneration[0]);
        Assert.Equal(source, facts.FireSource[0]);
        Assert.Equal(source, facts.FireSourceLife[0]);
        Assert.Equal(sourcePlayer.Participant.Value, facts.FireSourceParticipant[0]);
        Assert.Equal(sourcePlayer.LifeGeneration.Value, facts.FireSourceGeneration[0]);
        Assert.Equal(scene.World.Single<BomberMatchState>().MatchId.Value, facts.FireMatchId[0]);
        Assert.Equal(scene.World.Get<BomberSkillState>(source).AuraChainId.Value, facts.FireChainId[0]);
        Assert.Equal((int)BomberBombKind.ReservedFire, facts.FireFamily[0]);
        Assert.Equal(2, facts.FireSourceKind[0]);
        Assert.Equal((int)BomberDamageCause.Fire, facts.FireCause[0]);
        Assert.Equal(1UL, facts.FirePulse[0]);
        Assert.Equal(6, facts.FireX[0]); Assert.Equal(5, facts.FireZ[0]);
        Assert.Equal(6L, facts.FireBefore[0]); Assert.Equal(4L, facts.FireAfter[0]); Assert.Equal(2L, facts.FireActual[0]);
        scene.TickControlled();
        var occurrence = Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "damage_applied"));
        Assert.Equal(source.ToHex(), occurrence.GetProperty("entityId").GetString());
        Assert.Equal(source.ToHex(), occurrence.GetProperty("sourceLifeId").GetString());
        Assert.Equal(target.ToHex(), occurrence.GetProperty("lifeId").GetString());
    }

    [Fact]
    public void PublicAuraExcludesAndNeverWritesAnActualBrickCell()
    {
        using var scene = Open();
        using var receipts = new ReceiptProbe(scene.World);
        scene.Write(6, 1, 5, 1025u << 8);
        var address = new VoxelWorldCoordinate(6, 1, 5);
        var brick = scene.Native.ReadCell(address);
        Position(scene.World, scene.Lives[2], 6, 5);
        ulong start = SubmitPublic(scene);
        scene.TickControlled();
        _ = AssertActualAura(scene.World, scene.Lives[0], start, receipts);
        ulong interval = Ticks.FromMilliseconds(1000, BomberConfigBinding.For(scene.World).Game.TickRateHz);
        for (ulong tick = 0; tick < interval + 2; tick++) scene.TickControlled();
        var after = scene.Native.ReadCell(address);
        Assert.Equal(brick.BlockId, after.BlockId);
        Assert.Equal(brick.SectionRevision, after.SectionRevision);
        Assert.Equal(6L, Health(scene.World, scene.Lives[2]));
        Assert.True(scene.World.Get<BomberSkillState>(scene.Lives[2]).FireExposureEntity.Value.IsDefault);
        Assert.DoesNotContain(receipts.Results, result => result.TypeId == 10110u);
        Assert.Empty(BomberEffectIntegrationTests.Events(scene.World, "damage_applied"));
    }

    [Fact]
    public void PublicMovementCarriesTheActualAuraAndEndsOldCellExposure()
    {
        using var scene = Open();
        using var receipts = new ReceiptProbe(scene.World);
        NetEntityId source = scene.Lives[0], target = scene.Lives[2];
        Position(scene.World, target, 4, 5);
        ulong start = SubmitPublic(scene);
        scene.TickControlled();
        FiniteEffectView active = AssertActualAura(scene.World, source, start, receipts);
        scene.TickControlled();
        Assert.Equal(source, scene.World.Get<BomberSkillState>(target).FireExposureEntity.Value);
        var owner = scene.World.Get<AbilityComponent>(source);
        var input = new MoveAbility.Input { PrimaryDirection = BomberDirection.Right };
        ulong interval = Ticks.FromMilliseconds(1000, BomberConfigBinding.For(scene.World).Game.TickRateHz);
        for (ulong tick = 0; tick < interval && BomberMatchRules.CellX(scene.World.Get<LogicTransform>(source).LocalPosition) == 5; tick++)
        {
            Assert.True(new MoveAbility().CanActivate(input, owner, out string? reason), reason);
            var moved = owner.Activate<MoveAbility, MoveAbility.Input>(in input);
            Assert.True(moved.Succeeded, moved.FailureCode);
            scene.TickControlled();
        }
        Assert.Equal(6, BomberMatchRules.CellX(scene.World.Get<LogicTransform>(source).LocalPosition));
        Assert.True(scene.World.Get<BomberSkillState>(target).FireExposureEntity.Value.IsDefault);
        Assert.Equal(6L, Health(scene.World, target));
        Assert.DoesNotContain(receipts.Results, result => result.TypeId == 10110u);
        Position(scene.World, target, 7, 5);
        scene.TickControlled();
        Assert.Equal(source, scene.World.Get<BomberSkillState>(target).FireExposureEntity.Value);
        Assert.Equal(active.Handle, Assert.Single(scene.World.Get<EffectComponent>(source).ActiveEffects).Handle);
    }

    [Fact]
    public void RealCasterDeathEndsThePublicAuraBeforeAFullEnemyBurnInterval()
    {
        using var scene = Open();
        using var receipts = new ReceiptProbe(scene.World);
        NetEntityId source = scene.Lives[0], target = scene.Lives[2];
        Position(scene.World, target, 4, 4);
        ulong start = SubmitPublic(scene);
        scene.TickControlled();
        FiniteEffectView aura = AssertActualAura(scene.World, source, start, receipts);
        scene.TickControlled();
        Assert.Equal(source, scene.World.Get<BomberSkillState>(target).FireExposureEntity.Value);
        for (ulong chain = 9801; chain <= 9803; chain++)
            _ = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], source, chain);
        for (int tick = 0; tick < 6 && scene.World.IsLive(source); tick++) scene.TickControlled();
        Assert.False(scene.World.IsLive(source));
        Assert.Equal(3, receipts.Results.Count(result => result.TypeId == 10101u && result.Target == source && result.Outcome == EffectResultOutcome.Applied));
        Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "death"), value => value.GetProperty("lifeId").GetString() == source.ToHex());
        Assert.DoesNotContain(scene.World.Each<EffectComponent>().SelectMany(component => component.ActiveEffects), row => row.TypeId == 10111u && row.Handle.InstanceId == aura.Handle.InstanceId);
        ulong interval = Ticks.FromMilliseconds(1000, BomberConfigBinding.For(scene.World).Game.TickRateHz);
        for (ulong tick = 0; tick < interval + 2; tick++) scene.TickControlled();
        Assert.Equal(6L, Health(scene.World, target));
        Assert.True(scene.World.Get<BomberSkillState>(target).FireExposureEntity.Value.IsDefault);
        Assert.DoesNotContain(receipts.Results, result => result.TypeId == 10110u && result.Target == target);
    }

    [Fact]
    public void PairedRestorePreservesARealPublicCastWithoutResubmissionOrASecondOccurrence()
    {
        using var scene = Open(persistence: true);
        using var receipts = new ReceiptProbe(scene.World);
        NetEntityId life = scene.Lives[0];
        ulong start = SubmitPublic(scene);
        scene.TickControlled();
        FiniteEffectView actual = AssertActualAura(scene.World, life, start, receipts);
        scene.TickControlled();
        AssertOneCast(scene.World, life, start, actual.EndTick);
        ulong cooldown = scene.World.Get<BomberSkillState>(life).CooldownUntilTick.Value;
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture();
        Assert.True(captured.Succeeded, captured.ErrorCode);
        using WorldManager restored = BomberTestWorld.RestorePaired(captured.Checkpoint!.Value);
        using var restoredReceipts = new ReceiptProbe(restored.World);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        var resumed = Assert.Single(restored.World.Get<EffectComponent>(life).ActiveEffects);
        Assert.Equal(10111u, resumed.TypeId);
        Assert.Equal(actual.Source, resumed.Source); Assert.Equal(actual.Target, resumed.Target);
        Assert.NotEqual(actual.Handle.WorldId, resumed.Handle.WorldId);
        Assert.Equal(GasWorldContext.Require(restored.World).WorldId, resumed.Handle.WorldId);
        Assert.Equal(actual.Handle.InstanceId, resumed.Handle.InstanceId);
        Assert.Equal(actual.Handle.Generation, resumed.Handle.Generation);
        Assert.Equal(actual.AppliedTick, resumed.AppliedTick);
        Assert.Equal(actual.EndTick, resumed.EndTick);
        Assert.False(Effects.Remove(restored.World, actual.Handle).Succeeded);
        restored.Tick();
        var skill = restored.World.Get<BomberSkillState>(life);
        Assert.Equal(resumed.Handle.WorldId.Value, skill.AuraEffectWorld.Value);
        Assert.Equal(cooldown, skill.CooldownUntilTick.Value);
        AssertOneCast(restored.World, life, start, actual.EndTick);
        while (restored.World.Tick <= resumed.EndTick) restored.Tick();
        Assert.DoesNotContain(restored.World.Get<EffectComponent>(life).ActiveEffects, row => row.TypeId == 10111u);
        Assert.Equal(0UL, skill.AuraUntilTick.Value);
        Assert.Equal(cooldown, skill.CooldownUntilTick.Value);
        AssertOneCast(restored.World, life, start, actual.EndTick);
        Assert.DoesNotContain(restoredReceipts.Results, result => result.TypeId == 10111u && result.Kind == EffectResultKind.Initial);
    }

    [Fact]
    public void ActualProtectedSuccessorPublicAuraEndsBothLifePhasesBeforeNaturalProtectionExpiry()
    {
        using var scene = Open();
        using var receipts = new ReceiptProbe(scene.World);
        World world = scene.World;
        NetEntityId oldLife = scene.Lives[0], attacker = scene.Lives[1];
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(oldLife).Participant.Value);
        ulong originalGeneration = participant.LifeGeneration.Value;
        var config = BomberConfigBinding.For(world);
        Assert.Equal(6L, Health(world, oldLife));
        var lethalBombs = Enumerable.Range(0, 3).Select(index =>
            BomberEffectIntegrationTests.Bomb(world, attacker, oldLife, checked(9901UL + (ulong)index))).ToArray();
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        Assert.False(world.IsLive(oldLife));
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, participant.LifePhase.Value);
        var lethal = receipts.Results.Where(result => result.TypeId == 10101u && result.Target == oldLife).ToArray();
        Assert.Equal(3, lethal.Length);
        Assert.All(lethal, result =>
        {
            Assert.Equal(EffectResultKind.Initial, result.Kind);
            Assert.Equal(EffectResultOutcome.Applied, result.Outcome);
            Assert.Contains(result.Source, lethalBombs.Select(bomb => bomb.AssignedId));
            Assert.NotEqual(0u, result.Ordinal);
        });
        Assert.Single(BomberEffectIntegrationTests.Events(world, "death"), entry => entry.GetProperty("lifeId").GetString() == oldLife.ToHex());

        ulong wait = Ticks.FromMilliseconds(config.Life.RespawnMs, config.Game.TickRateHz) + 32;
        for (ulong tick = 0; tick < wait && (participant.CurrentLife.Value == oldLife ||
            participant.CurrentLife.Value.IsDefault || !world.IsLive(participant.CurrentLife.Value) ||
            world.Get<BomberPlayerState>(participant.CurrentLife.Value).RestorePending.Value ||
            !world.Get<BomberSuccessorState>(participant.Entity).DormantLife.Value.IsDefault); tick++) scene.TickControlled();
        NetEntityId successor = participant.CurrentLife.Value;
        Assert.NotEqual(oldLife, successor);
        Assert.True(world.IsLive(successor));
        Assert.Equal(originalGeneration + 1, participant.LifeGeneration.Value);
        var player = world.Get<BomberPlayerState>(successor);
        Assert.Equal(participant.Entity, player.Participant.Value);
        Assert.Equal(participant.LifeGeneration.Value, player.LifeGeneration.Value);
        Assert.False(player.RestorePending.Value);
        Assert.False(participant.SuccessorPending.Value);
        Assert.True(world.Get<BomberSuccessorState>(participant.Entity).DormantLife.Value.IsDefault);
        Assert.True(world.Get<BomberSuccessorLife>(successor).PreparedRevision.Value > 0);
        Assert.True(scene.ControlledBinding!.TryResolveConnectionState("successor-" + participant.Slot.Value, out NetEntityId boundLife, out _));
        Assert.Equal(successor, boundLife);
        Assert.Single(scene.TransferResults, result => result.Operation == "transfer" && result.ParticipantId == participant.Entity &&
            result.CommitFact == SuccessorCommitFact.Applied && result.NewBinding is { } binding && binding.NetEntityId == successor);
        EffectResult restoration = Assert.Single(receipts.Results, result => result.TypeId == 10105u && result.Target == successor);
        Assert.Equal(EffectResultKind.Initial, restoration.Kind);
        Assert.Equal(EffectResultOutcome.Applied, restoration.Outcome);
        Assert.Equal(oldLife, restoration.Source);
        Assert.Equal(GasWorldContext.Require(world).WorldId, restoration.Handle.WorldId);
        Assert.NotEqual(0UL, restoration.Handle.InstanceId.Value);
        Assert.NotEqual(0u, restoration.Handle.Generation);
        Assert.Single(BomberEffectIntegrationTests.Events(world, "respawn"), entry => entry.GetProperty("lifeId").GetString() == successor.ToHex());
        Assert.Equal((int)BomberLifePhase.Protected, participant.LifePhase.Value);
        Assert.Equal((int)BomberLifePhase.Protected, player.LifePhase.Value);
        ulong protection = player.ProtectedUntilTick.Value;
        Assert.True(protection > world.Tick + 3);
        Assert.Equal(6L, Health(world, successor));
        var skill = world.Get<BomberSkillState>(successor);
        Assert.Equal(118004u, skill.CharacterId.Value);
        Assert.Equal(118004, participant.SelectedForMatchCharacterId.Value);
        Assert.Equal(4u, skill.ActiveSkillId.Value);
        Assert.Equal(1, skill.ActiveSkillLevel.Value);
        Assert.True(skill.ActiveSkillBound.Value);
        Assert.Equal(0u, skill.BombSkillId.Value);

        var owner = world.Get<AbilityComponent>(successor);
        Assert.True(new UseActiveSkillAbility().CanActivate(default, owner, out string? reason), reason);
        ulong start = world.Tick;
        var admitted = owner.Activate<UseActiveSkillAbility, UseActiveSkillAbility.Input>(default, 9002);
        Assert.True(admitted.Succeeded, admitted.FailureCode);
        Assert.Equal(1, skill.AuraOutcome.Value);
        Assert.Equal(protection, player.ProtectedUntilTick.Value);
        Assert.Equal((int)BomberLifePhase.Protected, participant.LifePhase.Value);
        Assert.Equal((int)BomberLifePhase.Protected, player.LifePhase.Value);
        Assert.Empty(Casts(world));
        scene.TickControlled();
        FiniteEffectView actual = AssertActualAura(world, successor, start, receipts);
        Assert.Equal(0UL, player.ProtectedUntilTick.Value);
        Assert.Equal(start, skill.CooldownFromTick.Value);
        Assert.Equal(start + Ticks.FromMilliseconds(config.SkillLevel(4, 1).CooldownMs, config.Game.TickRateHz), skill.CooldownUntilTick.Value);
        scene.TickControlled();
        Assert.True(world.Tick < protection, "The original landing protection must not expire naturally before the phase assertions.");
        Assert.Equal((int)BomberLifePhase.Vulnerable, player.LifePhase.Value);
        Assert.Equal((int)BomberLifePhase.Vulnerable, participant.LifePhase.Value);
        Assert.Equal(0UL, player.ProtectedUntilTick.Value);
        AssertOneCast(world, successor, start, actual.EndTick);

        EntityOrder damageProbe = BomberEffectIntegrationTests.Bomb(world, attacker, successor, 9904);
        for (int tick = 0; tick < 6 && Health(world, successor) == 6; tick++) scene.TickControlled();
        EffectResult damage = Assert.Single(receipts.Results, result => result.TypeId == 10101u && result.Target == successor);
        Assert.Equal(EffectResultKind.Initial, damage.Kind);
        Assert.Equal(EffectResultOutcome.Applied, damage.Outcome);
        Assert.Equal(damageProbe.AssignedId, damage.Source);
        Assert.Equal(4L, Health(world, successor));
        Assert.Equal((int)BomberLifePhase.Vulnerable, player.LifePhase.Value);
        Assert.Equal((int)BomberLifePhase.Vulnerable, participant.LifePhase.Value);
        AssertOneCast(world, successor, start, actual.EndTick);
    }

    private static BomberTerrainProductionTests.Scene Open(bool persistence = false)
    {
        var scene = new BomberTerrainProductionTests.Scene(0, controlled: true, persistence: persistence);
        try
        {
            for (int z = 3; z <= 11; z++)
                for (int x = 3; x <= 11; x++) scene.Write(x, 1, z, 0);
            foreach (NetEntityId life in scene.Lives) Position(scene.World, life, 15, 15);
            NetEntityId source = scene.Lives[0];
            Position(scene.World, source, 5, 5);
            var match = scene.World.Single<BomberMatchState>();
            var skill = scene.World.Get<BomberSkillState>(source);
            var participant = scene.World.Get<BomberParticipantState>(scene.World.Get<BomberPlayerState>(source).Participant.Value);
            // Explicit initial-selection fixture: reopen an unbound Warmup slot,
            // then use the real public selection path to populate every binding.
            match.Phase.Value = (int)BomberMatchPhase.Warmup;
            match.PhaseEndTick.Value = scene.World.Tick + 100;
            participant.SelectedForMatchCharacterId.Value = 0;
            skill.CharacterId.Value = 0;
            var select = new SelectCharacterAbility.Input { CharacterId = 118004 };
            var owner = scene.World.Get<AbilityComponent>(source);
            Assert.True(new SelectCharacterAbility().CanActivate(select, owner, out string? reason), reason);
            var selected = owner.Activate<SelectCharacterAbility, SelectCharacterAbility.Input>(in select, 9001);
            Assert.True(selected.Succeeded, selected.FailureCode);
            Assert.Equal(118004u, skill.CharacterId.Value);
            Assert.Equal(118004, participant.SelectedForMatchCharacterId.Value);
            Assert.Equal(4u, skill.ActiveSkillId.Value);
            Assert.Equal(1, skill.ActiveSkillLevel.Value);
            Assert.True(skill.ActiveSkillBound.Value);
            Assert.Equal(0u, skill.BombSkillId.Value);
            match.Phase.Value = (int)BomberMatchPhase.Running;
            match.PhaseEndTick.Value = checked(scene.World.Tick + Ticks.FromMilliseconds(
                BomberConfigBinding.For(scene.World).Game.MatchDurationMs, BomberConfigBinding.For(scene.World).Game.TickRateHz));
            return scene;
        }
        catch
        {
            scene.Dispose();
            throw;
        }
    }

    private static ulong SubmitPublic(BomberTerrainProductionTests.Scene scene)
    {
        var owner = scene.World.Get<AbilityComponent>(scene.Lives[0]);
        Assert.True(new UseActiveSkillAbility().CanActivate(default, owner, out string? reason), reason);
        ulong start = scene.World.Tick;
        var admitted = owner.Activate<UseActiveSkillAbility, UseActiveSkillAbility.Input>(default, 9002);
        Assert.True(admitted.Succeeded, admitted.FailureCode);
        var skill = scene.World.Get<BomberSkillState>(owner.Entity);
        Assert.Equal(1, skill.AuraOutcome.Value);
        Assert.NotEqual(0UL, skill.AuraEffectWorld.Value);
        Assert.NotEqual(0UL, skill.AuraEffectInstance.Value);
        Assert.NotEqual(0u, skill.AuraEffectGeneration.Value);
        Assert.NotEqual(0UL, skill.AuraChainId.Value);
        Assert.False(skill.AuraFavorite.Value);
        return start;
    }

    private static FiniteEffectView AssertActualAura(World world, NetEntityId life, ulong start, ReceiptProbe receipts)
    {
        var skill = world.Get<BomberSkillState>(life);
        var player = world.Get<BomberPlayerState>(life);
        FiniteEffectView active = Assert.Single(world.Get<EffectComponent>(life).ActiveEffects);
        Assert.Equal(10111u, active.TypeId);
        Assert.Equal(life, active.Target); Assert.Equal(life, active.Source);
        Assert.Equal(start, active.AppliedTick);
        Assert.False(active.Suppressed);
        Assert.Equal(skill.AuraEffectWorld.Value, active.Handle.WorldId.Value);
        Assert.Equal(skill.AuraEffectInstance.Value, active.Handle.InstanceId.Value);
        Assert.Equal(skill.AuraEffectGeneration.Value, active.Handle.Generation);
        Assert.Equal(active.EndTick, skill.AuraUntilTick.Value);
        var p = BomberFireAuraEffect.ReadActualRow(active);
        Assert.Equal(player.Participant.Value, p.Participant);
        Assert.Equal(life, p.Life);
        Assert.Equal(player.LifeGeneration.Value, p.Generation);
        Assert.Equal(world.Single<BomberMatchState>().MatchId.Value, p.MatchId);
        Assert.Equal(skill.AuraChainId.Value, p.ChainId);
        Assert.Equal(active.Duration, p.Duration);
        Assert.False(p.Favorite);
        EffectResult result = Assert.Single(receipts.Results, row => row.Handle == active.Handle && row.Kind == EffectResultKind.Initial);
        Assert.Equal(10111u, result.TypeId);
        Assert.Equal(EffectResultOutcome.Applied, result.Outcome);
        Assert.Equal(life, result.Target); Assert.Equal(life, result.Source);
        Assert.Equal(start, result.AppliedTick); Assert.Equal(start, result.Tick);
        Assert.NotEqual(0u, result.Ordinal);
        Assert.Null(result.GeneratedErrorId);
        return active;
    }

    private static void AssertOneCast(World world, NetEntityId life, ulong start, ulong end)
    {
        var cast = Assert.Single(Casts(world));
        Assert.Equal(life.ToHex(), cast.GetProperty("lifeId").GetString());
        Assert.Equal(start.ToString(CultureInfo.InvariantCulture), cast.GetProperty("tick").GetString());
        var data = cast.GetProperty("data");
        Assert.Equal("4", data.GetProperty("skillId").GetString());
        Assert.Equal(end.ToString(CultureInfo.InvariantCulture), data.GetProperty("untilTick").GetString());
        Assert.Equal(1, Statistics(world, life).SkillCasts.Value);
    }

    private static System.Text.Json.JsonElement[] Casts(World world) => BomberEffectIntegrationTests.Events(world, "skill_cast");
    private static BomberStatistics Statistics(World world, NetEntityId life) => world.Get<BomberStatistics>(world.Get<BomberPlayerState>(life).Participant.Value);
    private static long Health(World world, NetEntityId life) => world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints);
    private static void Position(World world, NetEntityId life, int x, int z) =>
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(x + .5f, 1.5f, z + .5f));

    // The hook only copies the real borrowed phase9 window. It never submits,
    // manufactures or replays any Effect; using disposes it on assertion failure.
    private sealed class ReceiptProbe : IDisposable
    {
        private readonly World world;
        private readonly GasWorldContext gas;
        private readonly PropertyInfo observer;
        private readonly Action<EffectResultBatch>? previous;
        internal List<EffectResult> Results { get; } = new();

        internal ReceiptProbe(World world)
        {
            this.world = world;
            gas = GasWorldContext.Require(world);
            observer = typeof(GasWorldContext).GetProperty("ObserveEffectResults", BindingFlags.Instance | BindingFlags.NonPublic)!;
            Assert.NotNull(observer);
            previous = (Action<EffectResultBatch>?)observer.GetValue(gas);
            Assert.Null(previous);
            observer.SetValue(gas, (Action<EffectResultBatch>)Observe);
        }

        private void Observe(EffectResultBatch batch)
        {
            for (int index = 0; index < batch.Count(world); index++) Results.Add(batch.At(world, index));
        }

        public void Dispose() => observer.SetValue(gas, previous);
    }
}
