using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

/// <summary>Existing controlled Native fixture, not browser or Host acceptance.</summary>
[Collection("BomberWorld")]
public sealed class PrearrangedFinalSurvivorContractTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void HealthyPrearrangedLifeFinishesWithNaturalLastSurvivor(bool lastOpponentDiesBeforeTransfer)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true, controlled: true);
        World world = scene.World;
        var match = world.Single<BomberMatchState>();
        var old = scene.Lives[0];
        var pending = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        var opponent = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(scene.Lives[1]).Participant.Value);
        ulong oldGeneration = pending.LifeGeneration.Value;
        var observations = new List<object>();
        string? destination = Environment.GetEnvironmentVariable("BOMBER_CONTRACT_EVIDENCE");
        string? output = destination is null ? null : Path.Combine(destination,
            lastOpponentDiesBeforeTransfer ? "deferred-last-life" : "normal-last-life");
        if (output is not null) Directory.CreateDirectory(output);
        Observe("initial");
        for (ulong chain = 810001; chain < 810004; chain++)
            BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        for (int i = 0; i < 90 && scene.PendingTransfers.Count == 0; i++) Step("ordinary-death-and-preparation", false);
        Assert.False(world.IsLive(old));
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, pending.LifePhase.Value);
        Assert.True(pending.SuccessorPending.Value);
        var request = Assert.Single(scene.PendingTransfers);
        Assert.Equal(pending.Entity, request.ParticipantId);
        Assert.True(world.IsLive(request.SuccessorEntityId));
        Assert.Equal(6L, world.Get<AttributeComponent>(request.SuccessorEntityId)
            .GetCurrentValue(BomberAttributeNames.HealthPoints));
        // Six earlier eliminations are explicit fixture inputs. The pending life,
        // final opponent death, restoration and completion below remain real.
        for (int i = 2; i < scene.Lives.Length; i++)
        {
            var player = world.Get<BomberPlayerState>(scene.Lives[i]);
            var participant = world.Get<BomberParticipantState>(player.Participant.Value);
            player.LifePhase.Value = participant.LifePhase.Value = (int)BomberLifePhase.Eliminated;
            player.EliminatedTick.Value = participant.EliminatedTick.Value = world.Tick;
        }
        BomberEffectIntegrationTests.ScheduleFinalCircle(world);
        Step("formal-final-entry", false);
        Assert.Equal((int)BomberMatchPhase.FinalCircle, match.Phase.Value);
        ulong unchangedDeadline = match.PhaseEndTick.Value;
        Observe("healthy-prearranged-crosses-final-entry");

        if (lastOpponentDiesBeforeTransfer)
        {
            KillOpponent();
            Assert.Equal((int)BomberLifePhase.Eliminated, opponent.LifePhase.Value);
            Assert.Equal((int)BomberMatchPhase.FinalCircle, match.Phase.Value);
            Assert.Equal(0UL, match.EndTick.Value);
            Assert.False(match.OutcomePending.Value);
            Assert.Equal((int)BomberLifePhase.AwaitingRespawn, pending.LifePhase.Value);
            Observe("last-opponent-dead-but-prearranged-right-remains");
        }

        for (int i = 0; i < 12 && pending.LifePhase.Value == (int)BomberLifePhase.AwaitingRespawn; i++)
            Step("actual-applied-transfer-and-land", true);
        Assert.NotEqual(old, pending.CurrentLife.Value);
        Assert.True(world.IsLive(pending.CurrentLife.Value));
        Assert.Equal(oldGeneration + 1, pending.LifeGeneration.Value);
        Assert.Equal((int)BomberLifePhase.Protected, pending.LifePhase.Value);
        Assert.Equal(6L, world.Get<AttributeComponent>(pending.CurrentLife.Value)
            .GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.Single(scene.TransferResults, result => result.Operation == "transfer" && result.CommitFact == SuccessorCommitFact.Applied);
        Assert.True(scene.ControlledBinding!.TryResolveConnectionState("successor-0", out var actual, out _));
        Assert.Equal(pending.CurrentLife.Value, actual);
        Assert.False(pending.SuccessorPending.Value);
        Observe("actual-live-successor-landed");

        if (!lastOpponentDiesBeforeTransfer)
        {
            Assert.Equal((int)BomberMatchPhase.FinalCircle, match.Phase.Value);
            Assert.Equal(unchangedDeadline, match.PhaseEndTick.Value);
            KillOpponent();
        }
        for (int i = 0; i < 6 && (match.Phase.Value == (int)BomberMatchPhase.FinalCircle || match.OutcomePending.Value); i++)
            Step("natural-settlement-and-original-result-publisher", true);
        Assert.Equal((int)BomberMatchPhase.Podium, match.Phase.Value);
        Assert.True(match.EndTick.Value < unchangedDeadline);
        Assert.Equal((int)BomberEndReason.LastSurvivor, match.EndReason.Value);
        Assert.Equal(pending.Entity, match.Winner.Value);
        Assert.Equal(1, match.SurvivorCount.Value);
        var complete = Assert.Single(world.Single<BomberResults>().ReadRetained(8));
        Assert.Equal(match.EndTick.Value, complete.EndTick);
        Assert.Equal(pending.Entity, complete.WinnerParticipant);
        Assert.Equal(8, complete.Rows.Count);
        var winner = Assert.Single(complete.Rows, row => row.Survived);
        Assert.Equal(pending.Entity, winner.Participant);
        Assert.Equal(pending.CurrentLife.Value, winner.Life);
        Assert.Equal(pending.LifeGeneration.Value, winner.LifeGeneration);
        Assert.Equal(opponent.EliminatedTick.Value, Assert.Single(complete.Rows, row => row.Participant == opponent.Entity).EliminatedTick);
        Observe("valid-original-published-result");

        void KillOpponent()
        {
            // Distinct bomb families, real Native Effects, no player/lifecycle rewrite.
            for (ulong chain = 810101; chain < 810104; chain++)
                BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], scene.Lives[1], chain);
            Step("last-opponent-bombs-submitted", false);
            Step("last-opponent-real-lethal-effects", false);
        }

        void Step(string stage, bool deliver)
        {
            Exception? failure = Record.Exception(() => scene.TickControlled(deliver));
            Observe(stage, failure);
            Assert.Null(failure);
        }

        void Observe(string stage, Exception? failure = null)
        {
            if (output is null) return;
            observations.Add(new
            {
                stage, tick = world.Tick, phase = match.Phase.Value, endTick = match.EndTick.Value,
                deadline = match.PhaseEndTick.Value, reason = match.EndReason.Value,
                winner = match.Winner.Value.ToHex(), survivorCount = match.SurvivorCount.Value,
                outcomePending = match.OutcomePending.Value, publishedGeneration = world.Single<BomberResults>().PublishedGeneration.Value,
                transfers = scene.TransferResults.Select(r => new { r.Operation, commit = r.CommitFact.ToString(), r.CommitTick }).ToArray(),
                participants = world.Each<BomberParticipantState>().OrderBy(p => p.Slot.Value).Select(p => new
                {
                    participant = p.Entity.ToHex(), slot = p.Slot.Value, phase = p.LifePhase.Value,
                    eliminated = p.EliminatedTick.Value, death = p.DeathTick.Value, due = p.RespawnAtTick.Value,
                    current = p.CurrentLife.Value.ToHex(), generation = p.LifeGeneration.Value,
                    pending = p.SuccessorPending.Value, deathPending = p.DeathStructurePending.Value,
                    alive = !p.CurrentLife.Value.IsDefault && world.IsLive(p.CurrentLife.Value),
                    playerPhase = !p.CurrentLife.Value.IsDefault && world.IsLive(p.CurrentLife.Value)
                        ? world.Get<BomberPlayerState>(p.CurrentLife.Value).LifePhase.Value : (int?)null,
                }).ToArray(), failure = failure?.ToString(),
            });
            File.WriteAllText(Path.Combine(output, "observations.json"), JsonSerializer.Serialize(new
            {
                lastOpponentDiesBeforeTransfer, scope = "Actual controlled Native owner fixture; no real socket/browser claim",
                nativePath = Lumio.Bomber.Tests.EngineRelease.NativeLibrary,
                nativeSha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Lumio.Bomber.Tests.EngineRelease.NativeLibrary))),
                observations,
            }, JsonOptions));
        }
    }
}
