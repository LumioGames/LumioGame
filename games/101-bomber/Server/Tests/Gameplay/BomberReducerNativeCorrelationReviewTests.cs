using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.ExceptionServices;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// These fixtures admit real generated Effects and settle only through the official
// WorldManager.Tick. Candidate corruption is deliberate; no Result or Claim is authored.
[Collection("BomberWorld")]
public sealed class BomberReducerNativeCorrelationReviewTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void DuplicateNondefaultDamageTargetRefusesBeforeStatusWithEitherLastHandle(bool lastHandleMatches)
    {
        using var manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberBombState bomb = IdleBomb(manager, lives[7], 9501);
        BomberDamageFacts facts = world.Get<BomberDamageFacts>(bomb.Entity);
        ReserveDamage(world, bomb, lives[0]);
        ReserveDamage(world, bomb, lives[1]);
        var second = new BomberTargetIdentity(bomb.HitParticipants[1], bomb.HitLives[1], bomb.HitLifeGenerations[1]);
        Assert.True(bomb.CommitContact(second));
        // Both rows exist before admission, so the real association pins their
        // unchanged counts. Only row zero is submitted; row one is a corrupt candidate.
        facts.Target[1] = facts.Target[0];
        Assert.False(facts.Target[0].IsDefault);
        using var receipts = new ReceiptProbe(world);
        BomberEffectBusiness.SubmitDamage(world, bomb);
        Submitted request = SubmittedDamage(world, bomb, 0);
        if (lastHandleMatches)
        {
            facts.HandleWorld[1] = request.HandleWorld;
            facts.HandleInstance[1] = request.HandleInstance;
            facts.HandleGeneration[1] = request.HandleGeneration;
        }
        Assert.Equal(lastHandleMatches, facts.HandleWorld[1] == request.HandleWorld &&
            facts.HandleInstance[1] == request.HandleInstance && facts.HandleGeneration[1] == request.HandleGeneration);
        bomb.ValidateStorage();

        InvalidOperationException failure = Assert.Throws<InvalidOperationException>(() => manager.Tick());
        Assert.Equal("Tick faulted at EcsCommandBufferCommit: effect_access_violation", failure.Message);
        Assert.Contains("EffectOperationClaim.Capture", receipts.RefusalStack, StringComparison.Ordinal);
        Observed actual = RequireReceipt(receipts.Refused, request, 10101u, bomb.Entity, 0, completed: true);
        Assert.Equal(EffectResultOutcome.Applied, actual.Result.Outcome);
        Assert.Equal(4L, Health(world, lives[0]));
        Assert.Equal(6L, Health(world, lives[1]));
        Assert.True(facts.Ready[0]);
        Assert.False(facts.Ready[1]);
        Assert.Equal(0, facts.Status[0]);
        Assert.Equal(0, facts.Status[1]);
        Assert.Equal(2L, facts.Actual[0]);
        Assert.Empty(receipts.Succeeded);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "damage_applied"));
    }

    [Fact]
    public void UniqueDamageTargetPublishesStatusFromItsActualCompleteAssociation()
    {
        using var manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberBombState bomb = IdleBomb(manager, lives[7], 9502);
        ReserveDamage(world, bomb, lives[0]);
        using var receipts = new ReceiptProbe(world);
        BomberEffectBusiness.SubmitDamage(world, bomb);
        Submitted request = SubmittedDamage(world, bomb, 0);
        manager.Tick();

        Observed actual = RequireReceipt(receipts.Succeeded, request, 10101u, bomb.Entity, 0, completed: true);
        Assert.Equal(EffectResultOutcome.Applied, actual.Result.Outcome);
        Assert.Empty(receipts.Refused);
        var facts = world.Get<BomberDamageFacts>(bomb.Entity);
        Assert.Equal(1, facts.Status[0]);
        Assert.True(facts.Ready[0]);
        Assert.Equal(6L, facts.Before[0]);
        Assert.Equal(4L, facts.After[0]);
        Assert.Equal(2L, facts.Actual[0]);
        Assert.Equal(4L, Health(world, lives[0]));
        Assert.Equal(request.Target, facts.Life[0]);
        Assert.Equal(world.Get<BomberPlayerState>(request.Target).Participant.Value, facts.Participant[0]);
        Assert.Equal(world.Get<BomberPlayerState>(request.Target).LifeGeneration.Value, facts.Generation[0]);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "damage_applied"));
        manager.Tick();
        Assert.Equal((int)BomberHitStorageState.ContactApplied, bomb.HitStates[0]);
        Assert.Single(BomberEffectIntegrationTests.Events(world, "damage_applied"));
    }

    [Fact]
    public void ActualReissuedInstanceWithANewGenerationSettlesBesideRetainedHitHistory()
    {
        using var manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberBombState bomb = IdleBomb(manager, lives[7], 9503);
        using var receipts = new ReceiptProbe(world);
        ReserveDamage(world, bomb, lives[0]);
        BomberEffectBusiness.SubmitDamage(world, bomb);
        Submitted first = SubmittedDamage(world, bomb, 0);
        manager.Tick();
        Assert.Equal(EffectResultOutcome.Applied,
            RequireReceipt(receipts.Succeeded, first, 10101u, bomb.Entity, 0, completed: true).Result.Outcome);
        manager.Tick(); // Consume commits the genuine first contact without removing its facts.
        BomberDamageFacts facts = world.Get<BomberDamageFacts>(bomb.Entity);
        Assert.Equal((int)BomberHitStorageState.ContactApplied, bomb.HitStates[0]);
        Assert.Equal(1, facts.Status[0]);
        Assert.Empty(receipts.Succeeded);

        ReserveDamage(world, bomb, lives[1]);
        BomberEffectBusiness.SubmitDamage(world, bomb);
        Submitted second = SubmittedDamage(world, bomb, 1);
        // These are allocator-issued values, not a rewritten/fabricated handle.
        Assert.Equal(first.HandleWorld, second.HandleWorld);
        Assert.Equal(first.HandleInstance, second.HandleInstance);
        Assert.True(second.HandleGeneration > first.HandleGeneration);
        Assert.NotEqual(first.Target, second.Target);
        manager.Tick();

        Assert.Equal(EffectResultOutcome.Applied,
            RequireReceipt(receipts.Succeeded, second, 10101u, bomb.Entity, 1, completed: true).Result.Outcome);
        Assert.Empty(receipts.Refused);
        Assert.Equal(2, facts.Status.Count);
        Assert.Equal(1, facts.Status[0]);
        Assert.Equal(1, facts.Status[1]);
        Assert.Equal(first.HandleGeneration, facts.HandleGeneration[0]);
        Assert.Equal(second.HandleGeneration, facts.HandleGeneration[1]);
        Assert.Equal(first.Target, facts.Target[0]);
        Assert.Equal(second.Target, facts.Target[1]);
        Assert.Equal(4L, Health(world, lives[0]));
        Assert.Equal(4L, Health(world, lives[1]));
        manager.Tick();
        Assert.Equal(2, BomberEffectIntegrationTests.Events(world, "damage_applied").Length);
        Assert.Equal((int)BomberHitStorageState.ContactApplied, bomb.HitStates[1]);
    }

    [Fact]
    public void DestroyedDamageTargetStillClosesItsPendingFactFromTheOriginalRejectedReceipt()
    {
        using var manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberBombState bomb = IdleBomb(manager, lives[7], 9504);
        ReserveDamage(world, bomb, lives[0]);
        using var receipts = new ReceiptProbe(world);
        BomberEffectBusiness.SubmitDamage(world, bomb);
        Submitted request = SubmittedDamage(world, bomb, 0);
        world.Commands.Destroy(request.Target);
        Assert.True(world.IsLive(request.Target)); // The official command-buffer commit precedes settlement.
        manager.Tick();

        Assert.False(world.IsLive(request.Target));
        Observed actual = RequireReceipt(receipts.Succeeded, request, 10101u, bomb.Entity, 0, completed: false);
        Assert.Equal(EffectResultOutcome.Rejected, actual.Result.Outcome);
        Assert.Equal("effect_target_unavailable", actual.Result.GeneratedErrorId);
        var facts = world.Get<BomberDamageFacts>(bomb.Entity);
        Assert.Equal(request.Target, facts.Target[0]);
        Assert.Equal(request.Target, bomb.HitLives[0]);
        Assert.Equal(2, facts.Status[0]);
        Assert.False(facts.Ready[0]);
        Assert.Equal(0L, facts.Actual[0]);
        Assert.Empty(receipts.Refused);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "damage_applied"));
    }

    [Fact]
    public void MultipleFireOwnersMatchActualFullFactsAcrossUnrelatedAndEmptyResultWindows()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        WorldManager manager = scene.Manager;
        World world = manager.World;
        NetEntityId[] lives = scene.Lives.ToArray();
        for (int z = 3; z <= 11; z++)
        for (int x = 3; x <= 11; x++) scene.Write(x, 1, z, 0);
        foreach (NetEntityId life in lives)
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new System.Numerics.Vector3(15.5f, 1.5f, 15.5f));
        NetEntityId[] oldLives = { lives[5], lives[6] };
        var owners = oldLives.Select(life => world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(life).Participant.Value)).ToArray();
        NetEntityId preludeSource = lives[1];
        NetEntityId preludeParticipant = world.Get<BomberPlayerState>(preludeSource).Participant.Value;
        var preludeBombs = new List<EntityOrder>();
        // Inventory10106 is a successor-only settlement. Reach that eligibility
        // through actual damage/death/restore/transfer/landing, never a seeded revision.
        for (int index = 0; index < oldLives.Length; index++)
        {
            float cell = index == 0 ? 5.5f : 11.5f;
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(oldLives[index]), new System.Numerics.Vector3(cell, 1.5f, cell));
            for (ulong hit = 0; hit < 3; hit++)
                preludeBombs.Add(BomberEffectIntegrationTests.Bomb(world, preludeSource, oldLives[index], 9520UL + (ulong)index * 3 + hit));
        }
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        Assert.All(oldLives, life => Assert.False(world.IsLive(life)));
        Assert.All(owners, owner => Assert.Equal((int)BomberLifePhase.AwaitingRespawn, owner.LifePhase.Value));
        var config = BomberConfigBinding.For(world);
        ulong wait = Ticks.FromMilliseconds(config.Life.RespawnMs, config.Game.TickRateHz) + 32;
        for (ulong tick = 0; tick < wait && owners.Any(owner => owner.CurrentLife.Value.IsDefault ||
            oldLives.Contains(owner.CurrentLife.Value) || !world.IsLive(owner.CurrentLife.Value) ||
            world.Get<BomberPlayerState>(owner.CurrentLife.Value).RestorePending.Value ||
            !world.Get<BomberSuccessorState>(owner.Entity).DormantLife.Value.IsDefault); tick++) scene.TickControlled();
        for (int index = 0; index < owners.Length; index++)
        {
            var owner = owners[index];
            NetEntityId life = owner.CurrentLife.Value;
            Assert.NotEqual(oldLives[index], life);
            Assert.True(world.IsLive(life));
            Assert.Equal(2UL, owner.LifeGeneration.Value);
            var player = world.Get<BomberPlayerState>(life);
            Assert.Equal(owner.Entity, player.Participant.Value);
            Assert.Equal(owner.LifeGeneration.Value, player.LifeGeneration.Value);
            Assert.False(player.RestorePending.Value);
            Assert.Equal((int)BomberLifePhase.Protected, player.LifePhase.Value);
            Assert.True(world.Get<BomberSuccessorLife>(life).PreparedRevision.Value > 0);
            Assert.True(scene.ControlledBinding!.TryResolveConnectionState("successor-" + owner.Slot.Value, out NetEntityId binding, out _));
            Assert.Equal(life, binding);
            Assert.Single(scene.TransferResults, result => result.Operation == "transfer" && result.ParticipantId == owner.Entity &&
                result.CommitFact == SuccessorCommitFact.Applied && result.NewBinding is { } transferred && transferred.NetEntityId == life);
            Assert.Equal(6L, Health(world, life));
            lives[index + 5] = life;
        }
        Assert.Empty(scene.PendingTransfers);
        var baseline = BomberEffectIntegrationTests.Events(world, "damage_applied");
        Assert.Equal(6, baseline.Length);
        Assert.All(baseline, entry =>
        {
            Assert.Contains(entry.GetProperty("lifeId").GetString(), oldLives.Select(life => life.ToHex()));
            Assert.Equal(preludeSource.ToHex(), entry.GetProperty("sourceLifeId").GetString());
            Assert.Equal(preludeParticipant.ToHex(), entry.GetProperty("sourceParticipantId").GetString());
            Assert.Contains(entry.GetProperty("entityId").GetString(), preludeBombs.Select(bomb => bomb.AssignedId.ToHex()));
        });
        foreach (NetEntityId old in oldLives)
            Assert.Equal(3, baseline.Count(entry => entry.GetProperty("lifeId").GetString() == old.ToHex()));
        string[] baselineBytes = baseline.Select(entry => entry.GetRawText()).ToArray();
        BomberBombState source = IdleBomb(manager, lives[7], 9511);
        using var receipts = new ReceiptProbe(world);
        EffectHandleResult first = StageFire(world, source, lives[0]);
        EffectHandleResult unrelatedFirst = StageInventory(world, lives[5]);
        EffectHandleResult second = StageFire(world, source, lives[2]);
        EffectHandleResult unrelatedLast = StageInventory(world, lives[6]);
        ulong submitted = world.Tick;
        manager.Tick();

        foreach ((NetEntityId life, EffectHandleResult request) in new[] { (lives[0], first), (lives[2], second) })
        {
            BomberPlayerState player = world.Get<BomberPlayerState>(life);
            Observed actual = RequireReceipt(receipts.Succeeded, SubmittedFire(request, life, source.Entity, submitted),
                10110u, player.Participant.Value, 0, completed: true);
            Assert.Equal(EffectResultOutcome.Applied, actual.Result.Outcome);
            AssertFireFact(world, source, life, actual.Result);
            Assert.Equal(4L, Health(world, life));
        }
        Assert.Equal(2, receipts.Succeeded.Count(row => row.Result.TypeId == 10110u));
        foreach ((NetEntityId life, EffectHandleResult request) in new[] { (lives[5], unrelatedFirst), (lives[6], unrelatedLast) })
        {
            Observed actual = RequireReceipt(receipts.Succeeded, SubmittedFire(request, life, life, submitted),
                10106u, default, -1, completed: false);
            Assert.Equal(EffectResultOutcome.Applied, actual.Result.Outcome);
        }
        Assert.True(first.Handle.InstanceId.Value < unrelatedFirst.Handle.InstanceId.Value);
        Assert.True(unrelatedFirst.Handle.InstanceId.Value < second.Handle.InstanceId.Value);
        Assert.True(second.Handle.InstanceId.Value < unrelatedLast.Handle.InstanceId.Value);
        Assert.Empty(receipts.Refused);
        Assert.Equal(baselineBytes, BomberEffectIntegrationTests.Events(world, "damage_applied").Select(entry => entry.GetRawText()).ToArray());
        foreach (int slot in new[] { 1, 3, 4, 5, 6, 7 })
        {
            Assert.Equal(6L, Health(world, lives[slot]));
            Assert.Equal(0, FireFacts(world, lives[slot]).FireStatus.Count);
        }
        manager.Tick();
        Assert.Empty(receipts.Succeeded);
        Assert.All(world.Each<BomberFireFacts>(), facts => Assert.Equal(0, facts.FireStatus.Count));
        var completed = BomberEffectIntegrationTests.Events(world, "damage_applied");
        Assert.Equal(baseline.Length + 2, completed.Length);
        Assert.Equal(baselineBytes, completed.Take(baseline.Length).Select(entry => entry.GetRawText()).ToArray());
        var fireIncrement = completed.Skip(baseline.Length).ToArray();
        Assert.All(fireIncrement, entry =>
        {
            Assert.Equal(source.Entity.ToHex(), entry.GetProperty("entityId").GetString());
            Assert.Equal(source.SourceLife.Value.ToHex(), entry.GetProperty("sourceLifeId").GetString());
            Assert.Equal(source.Owner.Value.ToHex(), entry.GetProperty("sourceParticipantId").GetString());
            Assert.Equal("burn", entry.GetProperty("cause").GetString());
        });
        foreach (int slot in new[] { 0, 2 })
            Assert.Single(fireIncrement, entry => entry.GetProperty("lifeId").GetString() == lives[slot].ToHex());
    }

    [Fact]
    public void AFullMatchingFireCandidateOnTheWrongOwnerRefusesTheActualAssociationBeforeStatus()
    {
        using var manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberBombState source = IdleBomb(manager, lives[7], 9512);
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        NetEntityId wrongOwner = runtime.ParticipantIds[0];
        NetEntityId owner = runtime.ParticipantIds[6];
        NetEntityId target = world.Get<BomberParticipantState>(owner).CurrentLife.Value;
        BomberFireFacts original = world.Get<BomberFireFacts>(owner);
        BomberFireFacts candidate = world.Get<BomberFireFacts>(wrongOwner);
        using var receipts = new ReceiptProbe(world);
        EffectHandleResult request = StageFire(world, source, target);
        Submitted submitted = SubmittedFire(request, target, source.Entity, world.Tick);
        // The actual captured association remains on owner. Only an earlier,
        // unadmitted Participant candidate is copied; the reducer must not claim it.
        CopyFireCandidate(original, candidate);
        Assert.Equal(wrongOwner, candidate.FireParticipant[0]);
        Assert.NotEqual(owner, wrongOwner);
        Assert.False(original.FireReady[0]);
        Assert.False(candidate.FireReady[0]);

        InvalidOperationException failure = Assert.Throws<InvalidOperationException>(() => manager.Tick());
        Assert.Equal("Tick faulted at EcsCommandBufferCommit: effect_access_violation", failure.Message);
        Assert.Contains("EffectOperationClaim.Capture", receipts.RefusalStack, StringComparison.Ordinal);
        Observed actual = RequireReceipt(receipts.Refused, submitted, 10110u, owner, 0, completed: true);
        Assert.Equal(EffectResultOutcome.Applied, actual.Result.Outcome);
        Assert.True(original.FireReady[0]);
        Assert.False(candidate.FireReady[0]);
        Assert.Equal(0, original.FireStatus[0]);
        Assert.Equal(0, candidate.FireStatus[0]);
        Assert.Equal(2L, original.FireActual[0]);
        Assert.Equal(4L, Health(world, target));
        Assert.Empty(receipts.Succeeded);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "damage_applied"));
    }

    [Theory]
    [InlineData("world")]
    [InlineData("instance")]
    [InlineData("generation")]
    [InlineData("target")]
    [InlineData("source")]
    public void AFireCandidateWithOneDifferentFullIdentityFieldCannotTakeTheActualOwnerStatus(string difference)
    {
        using var manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberBombState source = IdleBomb(manager, lives[7], 9513);
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        BomberFireFacts candidate = world.Get<BomberFireFacts>(runtime.ParticipantIds[0]);
        NetEntityId owner = runtime.ParticipantIds[6];
        NetEntityId target = world.Get<BomberParticipantState>(owner).CurrentLife.Value;
        using var receipts = new ReceiptProbe(world);
        EffectHandleResult request = StageFire(world, source, target);
        Submitted submitted = SubmittedFire(request, target, source.Entity, world.Tick);
        CopyFireCandidate(world.Get<BomberFireFacts>(owner), candidate);
        switch (difference)
        {
            case "world": candidate.FireHandleWorld[0] = request.Handle.WorldId.Value ^ 2UL; break;
            case "instance": candidate.FireHandleInstance[0] = checked(request.Handle.InstanceId.Value + 1); break;
            case "generation": candidate.FireHandleGeneration[0] = checked(request.Handle.Generation + 1); break;
            case "target": candidate.FireTarget[0] = lives[4]; break;
            case "source": candidate.FireSource[0] = lives[7]; break;
            default: throw new InvalidOperationException("Unknown full identity mutation.");
        }
        manager.Tick();

        Observed actual = RequireReceipt(receipts.Succeeded, submitted, 10110u, owner, 0, completed: true);
        Assert.Equal(EffectResultOutcome.Applied, actual.Result.Outcome);
        AssertFireFact(world, source, target, actual.Result);
        Assert.Equal(0, candidate.FireStatus[0]);
        Assert.False(candidate.FireReady[0]);
        Assert.Equal(4L, Health(world, target));
        Assert.Empty(receipts.Refused);
    }

    [Fact]
    public void DestroyedFireTargetStillClosesTheParticipantFactWithItsOriginalFullIdentity()
    {
        using var manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberBombState source = IdleBomb(manager, lives[7], 9514);
        NetEntityId owner = world.Get<BomberPlayerState>(lives[0]).Participant.Value;
        using var receipts = new ReceiptProbe(world);
        EffectHandleResult request = StageFire(world, source, lives[0]);
        Submitted submitted = SubmittedFire(request, lives[0], source.Entity, world.Tick);
        world.Commands.Destroy(submitted.Target);
        manager.Tick();

        Assert.False(world.IsLive(submitted.Target));
        Observed actual = RequireReceipt(receipts.Succeeded, submitted, 10110u, owner, 0, completed: false);
        Assert.Equal(EffectResultOutcome.Rejected, actual.Result.Outcome);
        Assert.Equal("effect_target_unavailable", actual.Result.GeneratedErrorId);
        BomberFireFacts facts = world.Get<BomberFireFacts>(owner);
        Assert.Equal(submitted.Target, facts.FireTarget[0]);
        Assert.Equal(submitted.Target, facts.FireLife[0]);
        Assert.Equal(2, facts.FireStatus[0]);
        Assert.False(facts.FireReady[0]);
        Assert.Equal(0L, facts.FireActual[0]);
        Assert.Empty(receipts.Refused);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "damage_applied"));
    }

    private static BomberBombState IdleBomb(WorldManager manager, NetEntityId source, ulong chain)
    {
        World world = manager.World;
        EntityOrder order = BomberEffectIntegrationTests.Bomb(world, source, source, chain);
        order.Get<BomberBombState>().FuseEndTick.Value = checked(world.Tick + 1000);
        order.Get<BomberBombState>().CapacityReturned.Value = true;
        manager.Tick();
        var bomb = world.Get<BomberBombState>(order.AssignedId);
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        Assert.Equal(0, bomb.HitParticipants.Count);
        return bomb;
    }

    private static void ReserveDamage(World world, BomberBombState bomb, NetEntityId target)
    {
        int before = bomb.HitParticipants.Count;
        BomberEffectBusiness.ReserveDamage(world, world.Single<BomberMatchState>(), bomb,
            world.Get<BomberPlayerState>(target), 5, 5);
        Assert.Equal(before + 1, bomb.HitParticipants.Count);
    }

    private static Submitted SubmittedDamage(World world, BomberBombState bomb, int row)
    {
        var facts = world.Get<BomberDamageFacts>(bomb.Entity);
        Assert.NotEqual(0UL, facts.HandleWorld[row]);
        Assert.NotEqual(0UL, facts.HandleInstance[row]);
        Assert.NotEqual(0U, facts.HandleGeneration[row]);
        Assert.Equal(facts.HandleWorld[row], bomb.HitHandleWorlds[row]);
        Assert.Equal(facts.HandleInstance[row], bomb.HitHandleInstances[row]);
        Assert.Equal(facts.HandleGeneration[row], bomb.HitHandleGenerations[row]);
        Assert.True(bomb.HitDependentsAdmitted[row]);
        Assert.Equal(0, facts.Status[row]);
        Assert.False(facts.Ready[row]);
        return new(facts.HandleWorld[row], facts.HandleInstance[row], facts.HandleGeneration[row],
            facts.Target[row], bomb.Entity, world.Tick);
    }

    private static EffectHandleResult StageFire(World world, BomberBombState source, NetEntityId target)
    {
        var player = world.Get<BomberPlayerState>(target);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        var skill = world.Get<BomberSkillState>(target);
        var facts = world.Get<BomberFireFacts>(participant.Entity);
        Assert.Equal(0, facts.FireStatus.Count);
        ulong pulse = checked(skill.FirePulseSequence.Value + 1);
        // Explicit correlation fixture for the generated 10110 contract. Coverage
        // producers are separately tested; this does not assert guarded cast admission.
        facts.FireHandleWorld.Add(0); facts.FireHandleInstance.Add(0); facts.FireHandleGeneration.Add(0);
        facts.FireTypeId.Add(10110); facts.FireTarget.Add(target); facts.FireSource.Add(source.Entity);
        facts.FireTick.Add(world.Tick); facts.FireMatchId.Add(participant.MatchId.Value); facts.FireParticipant.Add(participant.Entity);
        facts.FireLife.Add(target); facts.FireGeneration.Add(player.LifeGeneration.Value);
        facts.FireSourceParticipant.Add(source.Owner.Value); facts.FireSourceLife.Add(source.SourceLife.Value);
        facts.FireSourceGeneration.Add(source.SourceLifeGeneration.Value); facts.FireFamily.Add(source.BombKind.Value);
        facts.FireChainId.Add(source.ChainId.Value); facts.FireX.Add(5); facts.FireZ.Add(5);
        facts.FireCause.Add((int)BomberDamageCause.Fire); facts.FireSourceKind.Add(1); facts.FirePulse.Add(pulse);
        facts.FireBefore.Add(0); facts.FireAfter.Add(0); facts.FireActual.Add(0); facts.FireReady.Add(false); facts.FireStatus.Add(0);
        skill.FirePulseSequence.Value = pulse;
        var p = new BomberBurnDamageEffect.Parameters { Points = BomberMatchRules.HalfHeartsPerBomb, Fx = "bomber.damage",
            FactOwner = participant.Entity, Row = 0, MatchId = participant.MatchId.Value, Participant = participant.Entity,
            Life = target, Generation = player.LifeGeneration.Value, SourceParticipant = source.Owner.Value,
            SourceLife = source.SourceLife.Value, SourceGeneration = source.SourceLifeGeneration.Value,
            Family = source.BombKind.Value, ChainId = source.ChainId.Value, X = 5, Z = 5,
            Cause = (int)BomberDamageCause.Fire, SourceKind = 1, Pulse = pulse };
        EffectHandleResult request = Effects.Apply<BomberBurnDamageEffect, BomberBurnDamageEffect.Parameters>(world, target, in p, source.Entity);
        Assert.True(request.Succeeded, request.GeneratedErrorId);
        facts.FireHandleWorld[0] = request.Handle.WorldId.Value;
        facts.FireHandleInstance[0] = request.Handle.InstanceId.Value;
        facts.FireHandleGeneration[0] = request.Handle.Generation;
        return request;
    }

    private static EffectHandleResult StageInventory(World world, NetEntityId target)
    {
        var player = world.Get<BomberPlayerState>(target);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        Assert.NotEqual(0UL, world.Get<BomberSuccessorLife>(target).PreparedRevision.Value);
        long capacity = world.Get<AttributeComponent>(target).GetCurrentValue(BomberAttributeNames.BombCapacity);
        var p = new BomberInventoryEffect.Parameters { Available = BomberInventory.Available(world, participant.Entity, capacity),
            Capacity = capacity, Fx = "", Participant = participant.Entity, Life = target,
            Generation = player.LifeGeneration.Value, MatchId = participant.MatchId.Value };
        EffectHandleResult request = Effects.Apply<BomberInventoryEffect, BomberInventoryEffect.Parameters>(world, target, in p, target);
        Assert.True(request.Succeeded, request.GeneratedErrorId);
        return request;
    }

    private static void CopyFireCandidate(BomberFireFacts source, BomberFireFacts destination)
    {
        Assert.Equal(1, source.FireStatus.Count);
        Assert.Equal(0, destination.FireStatus.Count);
        destination.FireHandleWorld.Add(source.FireHandleWorld[0]); destination.FireHandleInstance.Add(source.FireHandleInstance[0]);
        destination.FireHandleGeneration.Add(source.FireHandleGeneration[0]); destination.FireTypeId.Add(source.FireTypeId[0]);
        destination.FireTarget.Add(source.FireTarget[0]); destination.FireSource.Add(source.FireSource[0]); destination.FireTick.Add(source.FireTick[0]);
        destination.FireMatchId.Add(source.FireMatchId[0]); destination.FireParticipant.Add(destination.Entity);
        destination.FireLife.Add(source.FireLife[0]); destination.FireGeneration.Add(source.FireGeneration[0]);
        destination.FireSourceParticipant.Add(source.FireSourceParticipant[0]); destination.FireSourceLife.Add(source.FireSourceLife[0]);
        destination.FireSourceGeneration.Add(source.FireSourceGeneration[0]); destination.FireFamily.Add(source.FireFamily[0]);
        destination.FireChainId.Add(source.FireChainId[0]); destination.FireX.Add(source.FireX[0]); destination.FireZ.Add(source.FireZ[0]);
        destination.FireCause.Add(source.FireCause[0]); destination.FireSourceKind.Add(source.FireSourceKind[0]);
        destination.FirePulse.Add(source.FirePulse[0]); destination.FireBefore.Add(0); destination.FireAfter.Add(0);
        destination.FireActual.Add(0); destination.FireReady.Add(false); destination.FireStatus.Add(0);
    }

    private static void AssertFireFact(World world, BomberBombState source, NetEntityId target, EffectResult result)
    {
        BomberPlayerState player = world.Get<BomberPlayerState>(target);
        BomberFireFacts facts = FireFacts(world, target);
        Assert.Equal(1, facts.FireStatus.Count);
        Assert.Equal(1, facts.FireStatus[0]);
        Assert.True(facts.FireReady[0]);
        Assert.Equal(result.Handle.WorldId.Value, facts.FireHandleWorld[0]);
        Assert.Equal(result.Handle.InstanceId.Value, facts.FireHandleInstance[0]);
        Assert.Equal(result.Handle.Generation, facts.FireHandleGeneration[0]);
        Assert.Equal(10110u, facts.FireTypeId[0]);
        Assert.Equal(result.Tick, facts.FireTick[0]);
        Assert.Equal(result.Target, facts.FireTarget[0]);
        Assert.Equal(result.Source, facts.FireSource[0]);
        Assert.Equal(player.Participant.Value, facts.Entity);
        Assert.Equal(player.Participant.Value, facts.FireParticipant[0]);
        Assert.Equal(world.Get<BomberParticipantState>(player.Participant.Value).MatchId.Value, facts.FireMatchId[0]);
        Assert.Equal(target, facts.FireLife[0]);
        Assert.Equal(player.LifeGeneration.Value, facts.FireGeneration[0]);
        Assert.Equal(source.Owner.Value, facts.FireSourceParticipant[0]);
        Assert.Equal(source.SourceLife.Value, facts.FireSourceLife[0]);
        Assert.Equal(source.SourceLifeGeneration.Value, facts.FireSourceGeneration[0]);
        Assert.Equal(source.BombKind.Value, facts.FireFamily[0]);
        Assert.Equal(source.ChainId.Value, facts.FireChainId[0]);
        Assert.Equal(5, facts.FireX[0]); Assert.Equal(5, facts.FireZ[0]);
        Assert.Equal((int)BomberDamageCause.Fire, facts.FireCause[0]);
        Assert.Equal(1, facts.FireSourceKind[0]);
        Assert.Equal(world.Get<BomberSkillState>(target).FirePulseSequence.Value, facts.FirePulse[0]);
        Assert.Equal(6L, facts.FireBefore[0]); Assert.Equal(4L, facts.FireAfter[0]); Assert.Equal(2L, facts.FireActual[0]);
    }

    private static BomberFireFacts FireFacts(World world, NetEntityId life) =>
        world.Get<BomberFireFacts>(world.Get<BomberPlayerState>(life).Participant.Value);

    private static long Health(World world, NetEntityId life) =>
        world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints);

    private static Submitted SubmittedFire(EffectHandleResult request, NetEntityId target, NetEntityId source, ulong tick) =>
        new(request.Handle.WorldId.Value, request.Handle.InstanceId.Value, request.Handle.Generation, target, source, tick);

    private static Observed RequireReceipt(IReadOnlyList<Observed> receipts, Submitted request, uint type,
        NetEntityId owner, int row, bool completed)
    {
        Observed actual = Assert.Single(receipts, value => value.Result.Handle.WorldId.Value == request.HandleWorld &&
            value.Result.Handle.InstanceId.Value == request.HandleInstance && value.Result.Handle.Generation == request.HandleGeneration);
        Assert.Equal(type, actual.Result.TypeId);
        Assert.Equal(request.Target, actual.Result.Target);
        Assert.Equal(request.Source, actual.Result.Source);
        Assert.Equal(request.Tick, actual.Result.AppliedTick);
        Assert.Equal(request.Tick, actual.Result.Tick);
        Assert.Equal(EffectResultKind.Initial, actual.Result.Kind);
        Assert.NotEqual(0U, actual.Result.Ordinal);
        Assert.Equal(owner, actual.Owner);
        Assert.Equal(row, actual.Row);
        Assert.Equal(completed, actual.Completed);
        Console.WriteLine($"NATIVE_CORRELATION type={type} handle={request.HandleWorld:x16}/{request.HandleInstance}/{request.HandleGeneration} " +
            $"target={actual.Result.Target.ToHex()} source={actual.Result.Source.ToHex()} applied={actual.Result.AppliedTick} " +
            $"tick={actual.Result.Tick} ordinal={actual.Result.Ordinal} kind={actual.Result.Kind} outcome={actual.Result.Outcome} " +
            $"error={actual.Result.GeneratedErrorId ?? "none"} owner={actual.Owner.ToHex()} row={actual.Row} completed={actual.Completed}");
        return actual;
    }

    private readonly record struct Submitted(ulong HandleWorld, ulong HandleInstance, uint HandleGeneration,
        NetEntityId Target, NetEntityId Source, ulong Tick);
    private readonly record struct Observed(EffectResult Result, NetEntityId Owner, int Row, bool Completed);

    // Reflection is an observation entry only. The public observer window is
    // internal to Runtime; failed reducer windows are cleared in Dispose before
    // Tick returns. FirstChance copies the same raw window at the original Claim
    // exception, without swallowing, replacing, or replaying it.
    private sealed class ReceiptProbe : IDisposable
    {
        private const BindingFlags InstanceMembers = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        private readonly World world;
        private readonly GasWorldContext gas;
        private readonly int ownerThread;
        private readonly PropertyInfo observer;
        private readonly Action<EffectResultBatch>? previousObserver;
        private readonly IReadOnlyList<EffectResult> actualResults;
        private readonly IList actualAssociations;
        private readonly FieldInfo associationOwner;
        private readonly FieldInfo associationIndex;
        private readonly PropertyInfo associationCompleted;
        private Observed[] succeeded = Array.Empty<Observed>();
        private Observed[] refused = Array.Empty<Observed>();
        private Exception? observationFailure;
        internal Observed[] Succeeded { get { Assert.Null(observationFailure); return succeeded; } }
        internal Observed[] Refused { get { Assert.Null(observationFailure); return refused; } }
        internal string RefusalStack { get; private set; } = "";

        internal ReceiptProbe(World world)
        {
            this.world = world;
            ownerThread = Environment.CurrentManagedThreadId;
            gas = GasWorldContext.Require(world);
            observer = typeof(GasWorldContext).GetProperty("ObserveEffectResults", InstanceMembers)!;
            Assert.NotNull(observer);
            previousObserver = (Action<EffectResultBatch>?)observer.GetValue(gas);
            Assert.Null(previousObserver);
            PropertyInfo effects = typeof(GasWorldContext).GetProperty("Effects", InstanceMembers)!;
            Assert.NotNull(effects);
            object frame = effects.GetValue(gas)!;
            Assert.NotNull(frame);
            FieldInfo results = frame.GetType().GetField("Results", InstanceMembers)!;
            FieldInfo associations = frame.GetType().GetField("ResultFacts", InstanceMembers)!;
            Assert.NotNull(results); Assert.NotNull(associations);
            actualResults = Assert.IsAssignableFrom<IReadOnlyList<EffectResult>>(results.GetValue(frame));
            actualAssociations = Assert.IsAssignableFrom<IList>(associations.GetValue(frame));
            Type association = typeof(GasWorldContext).Assembly.GetType("Lumio.GameRuntime.Gas.EffectFactAssociation", throwOnError: true)!;
            associationOwner = association.GetField("Owner", InstanceMembers)!;
            associationIndex = association.GetField("Index", InstanceMembers)!;
            associationCompleted = association.GetProperty("Completed", InstanceMembers)!;
            Assert.NotNull(associationOwner); Assert.NotNull(associationIndex); Assert.NotNull(associationCompleted);
            observer.SetValue(gas, (Action<EffectResultBatch>)ObserveSuccess);
            AppDomain.CurrentDomain.FirstChanceException += ObserveRefusal;
        }

        private void ObserveSuccess(EffectResultBatch batch)
        {
            try
            {
                var copied = new EffectResult[batch.Count(world)];
                for (int index = 0; index < copied.Length; index++) copied[index] = batch.At(world, index);
                succeeded = CopyAssociations(copied);
            }
            catch (Exception error) { observationFailure = error; }
        }

        private void ObserveRefusal(object? sender, FirstChanceExceptionEventArgs args)
        {
            if (refused.Length != 0 || Environment.CurrentManagedThreadId != ownerThread || !ReferenceEquals(gas.World, world) ||
                args.Exception is not InvalidOperationException || args.Exception.Message != "effect_access_violation" ||
                !(args.Exception.StackTrace?.Contains("EffectOperationClaim.Capture", StringComparison.Ordinal) ?? false) ||
                actualResults.Count == 0 || actualResults[0].Tick != world.Tick) return;
            RefusalStack = args.Exception.StackTrace!;
            try { refused = CopyAssociations(actualResults.ToArray()); }
            catch (Exception error) { observationFailure = error; }
        }

        private Observed[] CopyAssociations(EffectResult[] copied)
        {
            if (copied.Length != actualAssociations.Count)
                throw new InvalidOperationException("Observation precondition: actual Results/ResultFacts counts differ.");
            var observed = new Observed[copied.Length];
            for (int index = 0; index < copied.Length; index++)
            {
                object? association = actualAssociations[index];
                observed[index] = association is null ? new(copied[index], default, -1, false) :
                    new(copied[index], (NetEntityId)associationOwner.GetValue(association)!,
                        (int)associationIndex.GetValue(association)!, (bool)associationCompleted.GetValue(association)!);
            }
            return observed;
        }

        public void Dispose()
        {
            AppDomain.CurrentDomain.FirstChanceException -= ObserveRefusal;
            observer.SetValue(gas, previousObserver);
        }
    }
}
