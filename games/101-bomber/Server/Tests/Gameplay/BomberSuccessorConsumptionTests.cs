using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;
using Xunit;
using Lumio.Wire;
using System.Linq;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberSuccessorConsumptionTests
{
    private static readonly int[] OneReceipt = { 0 };
    [Fact]
    public void TransferIssuedBeforeDeadlineCannotReviveASettledElimination()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        NetEntityId old = scene.Lives[0];
        var participant = scene.World.Get<BomberParticipantState>(scene.World.Get<BomberPlayerState>(old).Participant.Value);
        for (ulong chain = 7701; chain < 7704; chain++)
            BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], old, chain);
        var config = BomberConfigBinding.For(scene.World);
        ulong wait = Ticks.FromMilliseconds(config.Life.RespawnMs, config.Game.TickRateHz) + 16;
        for (ulong i = 0; i < wait && scene.PendingTransfers.Count == 0; i++) scene.TickControlled(false);
        var request = Assert.Single(scene.PendingTransfers);
        var match = scene.World.Single<BomberMatchState>();
        BomberEffectIntegrationTests.ScheduleFinalCircle(scene.World);
        scene.TickControlled(false);
        match.PhaseEndTick.Value = scene.World.Tick + 1;
        scene.TickControlled(false); scene.TickControlled(false);
        Assert.Equal((int)BomberMatchPhase.Podium, match.Phase.Value);
        Assert.Equal((int)BomberLifePhase.Eliminated, participant.LifePhase.Value);
        Assert.Equal(match.EndTick.Value, participant.EliminatedTick.Value);
        var state = scene.World.Get<BomberSuccessorState>(participant.Entity);
        var token = new SuccessorReservationToken(state.ReservationWorld.Value, state.ReservationSlot.Value, state.ReservationGeneration.Value);
        Assert.False(scene.Manager.TryReadSuccessorEligibility(token, out _));
        for (int i = 0; i < 4; i++) scene.TickControlled();
        Assert.Equal((int)BomberLifePhase.Eliminated, participant.LifePhase.Value);
        Assert.Equal(match.EndTick.Value, participant.EliminatedTick.Value);
        Assert.Equal(old, participant.CurrentLife.Value);
        Assert.False(BomberMatchRules.IsPlayerInputOpen(scene.World, request.SuccessorEntityId));
        Assert.False(scene.ControlledBinding!.TryResolveConnectionState("successor-0", out _, out _));
        var rejection = Assert.Single(scene.TransferResults, r => r.Operation == "transfer");
        Assert.Equal(SuccessorCommitFact.NotApplied, rejection.CommitFact);
    }
    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    public void RepeatedDeathRetainsEveryOriginalDebtUntilActualPlacement(int secondHearts)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        var config = BomberConfigBinding.For(scene.World);
        BomberWealthCreditContinuityTests.BlockLandings(scene);
        NetEntityId old = scene.Lives[0];
        for (int i = 0; i < 3; i++) BomberGrowthHealthTests.Take(scene.Manager, old, 5);
        var participant = scene.World.Get<BomberParticipantState>(scene.World.Get<BomberPlayerState>(old).Participant.Value);
        ulong firstGeneration = participant.LifeGeneration.Value;
        for (ulong chain = 7501; chain < 7507; chain++)
            BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], old, chain);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        ulong firstDeathTick = participant.DeathTick.Value;
        var carry = scene.World.Get<BomberRespawnCarry>(participant.Entity);
        Assert.Equal(3, carry.PendingGoldenHearts.Value);
        ulong wait = Ticks.FromMilliseconds(config.Life.RespawnMs, config.Game.TickRateHz) + 16;
        for (ulong i = 0; i < wait && participant.CurrentLife.Value == old; i++) scene.TickControlled();
        NetEntityId second = participant.CurrentLife.Value;
        Assert.NotEqual(old, second);
        Assert.True(scene.World.IsLive(second));
        Assert.Equal(firstGeneration + 1, participant.LifeGeneration.Value);
        Assert.Equal((int)BomberLifePhase.Protected, participant.LifePhase.Value);
        for (int i = 0; i < secondHearts; i++) BomberGrowthHealthTests.Take(scene.Manager, second, 5);
        var secondPlayer = scene.World.Get<BomberPlayerState>(second);
        secondPlayer.ProtectedUntilTick.Value = 0;
        secondPlayer.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        for (ulong chain = 7601; chain < 7607; chain++)
            BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], second, chain);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        ulong secondDeathTick = participant.DeathTick.Value;
        Assert.False(scene.World.IsLive(second));
        Assert.Equal(2UL, participant.DeathConsumedCount.Value);
        Assert.Equal(3 + secondHearts, BomberDeathDrops.PendingOutputs(scene.World));
        using (WorldManager restored = BomberTestWorld.Restore(scene.Manager.CaptureSnapshot(), GeneratedRegistry.Instance, config: BomberConfigBinding.Load()))
            Assert.Equal(3 + secondHearts, BomberDeathDrops.PendingOutputs(restored.World));
        string originalDebt = carry.DeferredDeathDebts[0];
        carry.DeferredDeathDebts.Add(originalDebt);
        BomberTestWorld.AssertOwnerFailure<System.InvalidOperationException>(() =>
        {
            using WorldManager invalid = BomberTestWorld.Restore(scene.Manager.CaptureSnapshot(), GeneratedRegistry.Instance, config: BomberConfigBinding.Load());
        });
        carry.DeferredDeathDebts.RemoveAt(1);
        for (int z = 0; z < config.Map.Depth; z++)
        for (int x = 0; x < config.Map.Width; x++) scene.Write(x, 0, z, 1022u << 8);
        scene.TickControlled(); scene.TickControlled();
        Assert.Equal(0, BomberDeathDrops.PendingOutputs(scene.World));
        Assert.False(participant.DeathDropPending.Value);
        var drops = scene.World.Each<BomberPickupItem>().Where(i => i.DropParticipant.Value == participant.Entity).ToArray();
        Assert.Equal(3 + secondHearts, drops.Length);
        Assert.Equal(3, drops.Count(i => i.DroppedBy.Value == old));
        Assert.Equal(secondHearts, drops.Count(i => i.DroppedBy.Value == second));
        Assert.All(drops, drop =>
        {
            Assert.Equal(participant.MatchId.Value, drop.DropMatchId.Value);
            Assert.Equal(drop.DroppedBy.Value == old ? firstGeneration : firstGeneration + 1, drop.DropLifeGeneration.Value);
            Assert.Equal(drop.DroppedBy.Value == old ? firstDeathTick : secondDeathTick, drop.DropOccurrenceTick.Value);
        });
    }
    [Fact]
    public void PrearrangedRespawnPreventsLastSurvivorBeforeTheDeadline()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        NetEntityId old = scene.Lives[0];
        for (ulong chain = 7401; chain < 7404; chain++)
            BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], old, chain);
        scene.TickControlled(false); scene.TickControlled(false); scene.TickControlled(false);
        Assert.False(scene.World.IsLive(old));
        BomberParticipantState pending = scene.World.Get<BomberParticipantState>(
            scene.World.Single<BomberWorldRuntime>().ParticipantIds[0]);
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, pending.LifePhase.Value);
        // Other eliminations are fixture inputs; the waiting life above came through real Effects.
        for (int i = 1; i < 7; i++)
        {
            BomberPlayerState life = scene.World.Get<BomberPlayerState>(scene.Lives[i]);
            life.LifePhase.Value = (int)BomberLifePhase.Eliminated;
            life.EliminatedTick.Value = scene.World.Tick;
            BomberParticipantState participant = scene.World.Get<BomberParticipantState>(life.Participant.Value);
            participant.LifePhase.Value = life.LifePhase.Value;
            participant.EliminatedTick.Value = life.EliminatedTick.Value;
        }
        BomberMatchState match = scene.World.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.FinalCircle;
        match.PhaseEndTick.Value = scene.World.Tick + 100;
        scene.TickControlled(false);
        Assert.Equal((int)BomberMatchPhase.FinalCircle, match.Phase.Value);
        Assert.Equal(0UL, match.EndTick.Value);
        Assert.False(match.OutcomePending.Value);
    }
    [Fact]
    public void DestroyedCapturedAssociationCannotRestoreInputBeforeAppliedTransfer()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        NetEntityId old = scene.Lives[0];
        AbilityComponent oldAbilities = scene.World.Get<AbilityComponent>(old);
        BomberParticipantState participant = scene.World.Get<BomberParticipantState>(scene.World.Get<BomberPlayerState>(old).Participant.Value);
        ulong generation = participant.LifeGeneration.Value;
        for (ulong chain = 7101; chain < 7104; chain++)
            BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], old, chain);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        Assert.False(scene.World.IsLive(old));
        Assert.Equal(old, participant.CurrentLife.Value);
        Assert.Equal(generation, participant.LifeGeneration.Value);
        Assert.False(BomberMatchRules.IsPlayerInputOpen(scene.World, old));
        Assert.Throws<System.InvalidOperationException>(() => oldAbilities.World);
        Assert.False(scene.ControlledBinding!.TryResolveConnectionState("successor-0", out _, out _));
        Assert.True(scene.ControlledBinding.TryResolveObservationAttachment("successor-0", out ObservationAttachment observation, out _));
        Assert.Null(observation.ControlledLife);
        Assert.Equal(participant.Entity, observation.ViewEntityId);
        scene.Manager.Enqueue(new InputCommandMessage(1, WireCodec.FieldWrite, old,
            WireCodec.EncodeFieldWrite(old, nameof(BomberPlayerState), nameof(BomberPlayerState.Facing), "1"),
            "successor-0", observation.ConnectionGeneration)
            { Profile = WireProfile.SuccessorBindingReceiptsPartsV1, WorldIncarnation = scene.Manager.WorldIncarnation, ReceiptParts = OneReceipt });
        scene.Manager.Tick();
        WorldOperationResult rejected = Assert.Single(scene.Manager.DrainOutbox().Operations);
        Assert.Equal(OperationResultStage.Admission, rejected.Stage);
        Assert.Equal(OperationOutcomeKind.ProtocolReject, rejected.Outcome.Kind);
        Assert.Equal(OperationCommitFact.NotApplied, rejected.Outcome.CommitFact);
        Assert.Equal("operation_authority_rejected", rejected.Outcome.Code);
        Assert.False(scene.World.IsLive(old));
        Assert.Equal(old, participant.CurrentLife.Value);
        Assert.Equal(0UL, scene.World.Get<ObserverComponent>(participant.Entity).AppliedInputSequence);
        ulong wait = Ticks.FromMilliseconds(BomberConfigBinding.For(scene.World).Life.RespawnMs, BomberConfigBinding.For(scene.World).Game.TickRateHz) + 16;
        for (ulong i = 0; i < wait && (participant.CurrentLife.Value == old || !scene.World.IsLive(participant.CurrentLife.Value)); i++)
            scene.TickControlled();
        Assert.NotEqual(old, participant.CurrentLife.Value);
        Assert.True(scene.World.IsLive(participant.CurrentLife.Value));
        Assert.Equal(generation + 1, participant.LifeGeneration.Value);
        Assert.True(scene.ControlledBinding.TryResolveConnectionState("successor-0", out NetEntityId actual, out _));
        Assert.Equal(participant.CurrentLife.Value, actual);
        Assert.Equal(participant.Entity, scene.World.Get<BomberPlayerState>(actual).Participant.Value);
        Assert.Equal(participant.LifeGeneration.Value, scene.World.Get<BomberPlayerState>(actual).LifeGeneration.Value);
        Assert.Equal(6, scene.World.Get<AttributeComponent>(actual).GetCurrentValue(BomberAttributeNames.HealthPoints));
        participant.Validate(BomberConfigBinding.For(scene.World).Game.PlayerCount);
        Assert.Equal(actual, participant.LastLife.Value);
        for (int i = 0; i < 8; i++) scene.TickControlled();
        Assert.Equal(generation + 1, participant.LifeGeneration.Value);
        Assert.Equal(actual, participant.CurrentLife.Value);
    }
    [Fact]
    public void RestoredDormantHealthAndIssuedRequestDoNotPublishCurrentLife()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        NetEntityId old = scene.Lives[0];
        BomberParticipantState participant = scene.World.Get<BomberParticipantState>(scene.World.Get<BomberPlayerState>(old).Participant.Value);
        ulong generation = participant.LifeGeneration.Value;
        for (ulong chain = 7201; chain < 7204; chain++)
            BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], old, chain);
        ulong wait = Ticks.FromMilliseconds(BomberConfigBinding.For(scene.World).Life.RespawnMs, BomberConfigBinding.For(scene.World).Game.TickRateHz) + 16;
        for (ulong i = 0; i < wait && scene.PendingTransfers.Count == 0; i++) scene.TickControlled(false);
        SuccessorTransferRequest request = Assert.Single(scene.PendingTransfers);
        Assert.NotEqual(old, request.SuccessorEntityId);
        Assert.True(scene.World.IsLive(request.SuccessorEntityId));
        Assert.Equal(6, scene.World.Get<AttributeComponent>(request.SuccessorEntityId).GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(old, participant.CurrentLife.Value);
        Assert.Equal(generation, participant.LifeGeneration.Value);
        Assert.False(BomberMatchRules.IsPlayerInputOpen(scene.World, request.SuccessorEntityId));
        Assert.False(scene.ControlledBinding!.TryResolveConnectionState("successor-0", out _, out _));
        for (int i = 0; i < 4; i++) scene.TickControlled(false);
        Assert.Single(scene.PendingTransfers);
        Assert.Equal(old, participant.CurrentLife.Value);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        Assert.Equal(request.SuccessorEntityId, participant.CurrentLife.Value);
        Assert.Equal(generation + 1, participant.LifeGeneration.Value);
        Assert.True(scene.ControlledBinding.TryResolveConnectionState("successor-0", out NetEntityId actual, out _));
        Assert.Equal(participant.CurrentLife.Value, actual);
    }
    [Fact]
    public void NextMatchKeepsCapturedAssociationUntilAuthenticatedSupersessionAndFreshRestore()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        NetEntityId old = scene.Lives[0];
        BomberParticipantState participant = scene.World.Get<BomberParticipantState>(scene.World.Get<BomberPlayerState>(old).Participant.Value);
        BomberSuccessorState state = scene.World.Get<BomberSuccessorState>(participant.Entity);
        for (ulong chain = 7301; chain < 7304; chain++)
            BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], old, chain);
        ulong wait = Ticks.FromMilliseconds(BomberConfigBinding.For(scene.World).Life.RespawnMs, BomberConfigBinding.For(scene.World).Game.TickRateHz) + 16;
        for (ulong i = 0; i < wait && scene.PendingTransfers.Count == 0; i++) scene.TickControlled(false);
        SuccessorTransferRequest stale = Assert.Single(scene.PendingTransfers);
        ulong oldMatch = participant.MatchId.Value;
        ulong oldIntent = state.IntentGeneration.Value;
        var token = new SuccessorReservationToken(state.ReservationWorld.Value, state.ReservationSlot.Value, state.ReservationGeneration.Value);
        Assert.True(scene.Manager.TryReadSuccessorEligibility(token, out Lumio.Wire.EligibilityRecord eligibility));
        BomberRoundRolloverTests.EndRound(scene);
        scene.TickControlled(false);
        Assert.Equal(oldMatch + 1, participant.MatchId.Value);
        Assert.Equal(oldIntent + 1, state.IntentGeneration.Value);
        Assert.Equal(old, participant.CurrentLife.Value);
        Assert.True(scene.World.IsLive(stale.SuccessorEntityId));
        Assert.False(scene.World.Get<BomberRespawnCarry>(participant.Entity).CarryPresent.Value);
        Assert.True(scene.ControlledBinding!.TryResolveObservationAttachment("successor-0", out ObservationAttachment attachment, out _));
        // Desired policy no longer matches the captured Runtime revision. It is not
        // exposed as current until the authenticated Host supersession below commits.
        Assert.False(scene.Manager.TryReadSuccessorEligibility(token, out _));
        Assert.Equal(oldMatch.ToString(System.Globalization.CultureInfo.InvariantCulture), eligibility.MatchId);
        var supersede = new Lumio.Wire.SupersedeSuccessorEligibilityMessage("9001",
            new Lumio.Wire.ReservationToken(token.WorldIncarnation.ToHex(), token.Slot, token.AllocationGeneration.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            scene.Manager.WorldIncarnation.ToHex(), participant.Entity.ToHex(),
            new Lumio.Wire.AttachmentRecord(participant.Entity.ToHex(), attachment.ViewEntityId.ToHex(), null!, attachment.ConnectionGeneration, "observing"),
            eligibility.Revision, "successor-0", "effects-0", "bomber-test", WireProfile.SuccessorBindingReceiptsPartsV1.SuccessorProfileId());
        Assert.Equal(SuccessorEnqueueStatus.Queued, scene.Manager.Enqueue(supersede));
        for (int i = 0; i < 16 && scene.PendingTransfers.Count < 2; i++) scene.TickControlled(false);
        Assert.False(scene.World.IsLive(stale.SuccessorEntityId));
        Assert.Equal(2, scene.PendingTransfers.Count);
        SuccessorTransferRequest fresh = scene.PendingTransfers[1];
        Assert.NotEqual(stale.SuccessorEntityId, fresh.SuccessorEntityId);
        Assert.Equal(2UL, fresh.EligibilityRevision);
        Assert.Equal(participant.MatchId.Value, fresh.MatchId);
        Assert.Equal(old, participant.CurrentLife.Value);
        // Deliver both actual requests: the stale revision cannot acquire the fresh dormant Life.
        for (int i = 0; i < 8 && participant.CurrentLife.Value == old; i++) scene.TickControlled();
        Assert.Equal(fresh.SuccessorEntityId, participant.CurrentLife.Value);
        Assert.Equal(3UL, participant.LifeGeneration.Value);
        Assert.True(scene.World.IsLive(fresh.SuccessorEntityId));
        Assert.Equal(6, scene.World.Get<AttributeComponent>(fresh.SuccessorEntityId).GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.True(scene.ControlledBinding.TryResolveConnectionState("successor-0", out NetEntityId actual, out _));
        Assert.Equal(fresh.SuccessorEntityId, actual);
    }
}
