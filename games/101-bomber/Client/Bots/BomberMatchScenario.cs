using System;
using System.Collections.Generic;
using Lumio.Bomber.Gameplay;
using Lumio.Client.Bot;
using Lumio.Client.Gameplay.ECS;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Bots;

/// <summary>
/// Drives one real client through the fourteen-step Bomber tour. Evidence comes from the
/// replica, rather than from issued-command acknowledgements: commands only provide input and
/// every assertion is backed by an observed component transition.
/// </summary>
public sealed class BomberMatchScenario : BotScenario
{
    private const string WorldType = "world";
    private const string PlayerType = "player";
    private const string BombType = "bomberBomb";
    private const string ParticipantType = "bomberParticipant";

    private readonly Observation observed = new();
    private ulong? previousHealth;
    private ulong initialLifeGeneration;
    private string? previousLife;
    private ulong firstMatchId;
    private ulong previousMatchId;
    private string? roomId;
    private int lastBombCommandTick = -20;

    /// <inheritdoc />
    public override BotStepResult Step(in BotDriverContext context)
    {
        BotWorldView world = context.World;
        if (!world.Bound || !world.HasSelf)
            return BotStepResult.Continue;

        BotSelfBinding self = world.Self;
        bool validSelf = NetEntityId.TryParse(self.NetEntityId, out NetEntityId selfId)
            && !selfId.IsDefault && string.Equals(self.EntityType, PlayerType, StringComparison.Ordinal);
        if (!validSelf)
            return BotStepResult.Continue;

        if (!string.IsNullOrWhiteSpace(self.RoomId))
            roomId ??= self.RoomId;
        observed.SelfBound = true;
        observed.SameRoom = roomId is not null
            && string.Equals(roomId, self.RoomId, StringComparison.Ordinal);

        string? worldId = FindEntity(world, WorldType);
        if (worldId is not null)
            ObserveWorld(world, worldId);

        ObservePlayer(world, self.NetEntityId);
        ObserveBombs(world, self.NetEntityId);
        TryIssueInputs(context, world, observed.MatchActive, observed.OwnBombVisible);

        return observed.Complete ? BotStepResult.Complete : BotStepResult.Continue;
    }

    /// <inheritdoc />
    public override void Assert(in BotDriverContext context, BotAssertionSink sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        sink.That(observed.BaseMapObserved, "basemap_observed");
        sink.That(observed.MatchJoined, "match_joined");
        sink.That(observed.SelfBound, "self_bound");
        sink.That(observed.FirstBombPlaced, "first_bomb_place");
        sink.That(observed.BombDetonated, "bomb_detonated");
        sink.That(observed.ChainResolved, "chain_resolved");
        sink.That(observed.DamageApplied, "damage_applied");
        sink.That(observed.Respawned, "respawned");
        sink.That(observed.FinalCircleStarted, "final_circle_started");
        sink.That(observed.MatchEnded, "match_ended");
        sink.That(observed.RankingValid, "ranking_valid");
        sink.That(observed.NextMatchStarted, "next_match_started");
        sink.That(observed.SameRoom, "same_room");
    }

    private void ObserveWorld(BotWorldView world, string worldId)
    {
        bool matchFieldPresent = TryReadUInt(world, worldId, "BomberMatchState.matchId", out ulong matchId);
        observed.BaseMapObserved |= matchFieldPresent && world.VisibleEntityCount > 0;
        if (!matchFieldPresent || matchId == 0)
            return;

        if (firstMatchId == 0)
            firstMatchId = matchId;
        if (previousMatchId != 0 && matchId != previousMatchId && observed.MatchEnded)
            observed.NextMatchStarted = matchId > firstMatchId;
        previousMatchId = matchId;

        if (TryReadInt(world, worldId, "BomberMatchState.phase", out int phase))
        {
            observed.FinalCircleStarted |= phase >= (int)BomberMatchPhase.FinalCircle;
            observed.MatchEnded |= phase >= (int)BomberMatchPhase.Podium;
            observed.MatchActive = phase is (int)BomberMatchPhase.Warmup
                or (int)BomberMatchPhase.Running or (int)BomberMatchPhase.FinalCircle;
        }
        if (TryReadUInt(world, worldId, "BomberMatchState.endTick", out ulong endTick))
            observed.MatchEnded |= endTick > 0;
        if (TryReadUInt(world, worldId, "BomberFinalCircleState.triggerTick", out ulong triggerTick))
            observed.FinalCircleStarted |= triggerTick > 0;

        if (TryReadUInt(world, worldId, "BomberResults.publishedGeneration", out ulong generation)
            && generation > 0)
            observed.RankingValid |= ReadValidRanking(world, worldId);

        // A match id transition is accepted only after the first match reached settlement.
        if (observed.MatchEnded && matchId > firstMatchId)
            observed.NextMatchStarted = true;
    }

    private void ObservePlayer(BotWorldView world, string selfId)
    {
        if (TryReadInt(world, selfId, "BomberPlayerState.lifePhase", out int lifePhase)
            && lifePhase is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable)
            observed.MatchJoined = true;

        if (TryReadUInt(world, selfId, "AttributeComponent.healthPointsCurrent", out ulong health))
        {
            if (previousHealth is { } before && health < before)
                observed.DamageApplied = true;
            previousHealth = health;
        }

        if (TryReadUInt(world, selfId, "BomberPlayerState.lifeGeneration", out ulong generation)
            && generation > 0)
        {
            if (initialLifeGeneration == 0)
                initialLifeGeneration = generation;
            else if (generation > initialLifeGeneration)
                observed.Respawned = true;
        }

        string? participant = ReadText(world, selfId, "BomberPlayerState.participant");
        if (participant is null)
            return;
        if (NetEntityId.TryParse(participant, out NetEntityId participantId) && !participantId.IsDefault)
            observed.MatchJoined = true;
        foreach (BotVisibleEntity entity in world.VisibleEntities.All)
        {
            if (!string.Equals(entity.EntityType, ParticipantType, StringComparison.Ordinal)
                || !string.Equals(entity.NetEntityId, participant, StringComparison.Ordinal))
                continue;
            string? currentLife = ReadText(world, entity.NetEntityId, "BomberParticipantState.currentLife");
            if (currentLife is not null)
            {
                if (previousLife is not null && !string.Equals(previousLife, currentLife, StringComparison.Ordinal))
                    observed.Respawned = true;
                previousLife = currentLife;
            }
            if (TryReadInt(world, entity.NetEntityId, "BomberStatistics.bestChain", out int bestChain)
                && bestChain > 0)
                observed.ChainResolved = true;
            break;
        }
    }

    private void ObserveBombs(BotWorldView world, string selfId)
    {
        var chains = new Dictionary<ulong, int>();
        observed.OwnBombVisible = false;
        foreach (BotVisibleEntity entity in world.VisibleEntities.All)
        {
            if (!string.Equals(entity.EntityType, BombType, StringComparison.Ordinal))
                continue;
            string? owner = ReadText(world, entity.NetEntityId, "BomberBombState.owner");
            bool own = string.Equals(owner, selfId, StringComparison.Ordinal);
            if (own)
            {
                observed.OwnBombVisible = true;
                observed.FirstBombPlaced = true;
            }
            if (TryReadInt(world, entity.NetEntityId, "BomberBombState.phase", out int phase)
                && phase >= (int)BomberBombPhase.Danger)
                observed.BombDetonated = true;
            if (TryReadUInt(world, entity.NetEntityId, "BomberBombState.explodedAtTick", out ulong exploded)
                && exploded > 0)
                observed.BombDetonated = true;
            bool hasChain = TryReadUInt(world, entity.NetEntityId, "BomberBombState.chainId", out ulong chainId)
                && chainId > 0;
            if (hasChain)
                chains[chainId] = chains.TryGetValue(chainId, out int count) ? count + 1 : 1;
            if (hasChain && TryReadInt(world, entity.NetEntityId, "BomberBombState.phase", out phase)
                && phase >= (int)BomberBombPhase.Extinguished)
                observed.ChainResolved = true;
        }
        foreach (int count in chains.Values)
            if (count > 1 && observed.BombDetonated)
                observed.ChainResolved = true;
    }

    private void TryIssueInputs(in BotDriverContext context, BotWorldView world, bool matchActive, bool ownBombVisible)
    {
        if (!world.InputEnabled || !matchActive)
            return;
        int tick = context.Tick;
        if (!ownBombVisible && tick - lastBombCommandTick >= 20)
        {
            if (IssueActivate(in context, "PlaceBombAbility", Array.Empty<string>()))
                lastBombCommandTick = tick;
        }

        // Movement is deliberately sent after the first detonation so the initial bomb can
        // produce an authoritative damage/respawn observation for the tour.
        if (observed.BombDetonated && tick % 8 == 0)
        {
            string direction = ((tick / 8) % 2 == 0 ? (int)BomberDirection.Right : (int)BomberDirection.Left)
                .ToString(System.Globalization.CultureInfo.InvariantCulture);
            _ = IssueActivate(in context, "MoveAbility", new[] { direction, "0", "true" });
        }
    }

    private static bool IssueActivate(in BotDriverContext context, string member, IReadOnlyList<string> args)
    {
        foreach (BotInputTerm term in context.Vocabulary.AvailableTerms)
        {
            if (term.Kind != BotInputKind.Activate || !string.Equals(term.Member, member, StringComparison.Ordinal))
                continue;
            BotIssuedCommand command = BotIssuedCommand.Activate(member, args,
                (ulong)Math.Max(0, context.Tick));
            return context.Issue(in command).Accepted;
        }
        return false;
    }

    private static bool ReadValidRanking(BotWorldView world, string worldId)
    {
        if (!TryReadListCount(world, worldId, "BomberResults.retainedMatchIds", out int matches)
            || matches == 0
            || !TryReadListCount(world, worldId, "BomberResults.matchIds", out int rows)
            || !TryReadListCount(world, worldId, "BomberResults.ranks", out int ranks)
            || rows == 0 || rows != ranks || !AllPositive(world, worldId, "BomberResults.ranks"))
            return false;
        return true;
    }

    private static bool AllPositive(BotWorldView world, string entityId, string field)
    {
        ReplicaFieldObservation observation = world.Fields[entityId, field];
        if (!observation.Found || observation.Value.Items.Count == 0)
            return false;
        foreach (ReplicaFieldValue item in observation.Value.Items)
        {
            if (item.Magnitude is 0 or null && item.WholeNumber is not > 0)
                return false;
        }
        return true;
    }

    private static string? FindEntity(BotWorldView world, string entityType)
    {
        foreach (BotVisibleEntity entity in world.VisibleEntities.All)
            if (string.Equals(entity.EntityType, entityType, StringComparison.Ordinal))
                return entity.NetEntityId;
        return null;
    }

    private static string? ReadText(BotWorldView world, string entityId, string field)
    {
        ReplicaFieldObservation observation = world.Fields[entityId, field];
        if (!observation.Found)
            return null;
        return observation.Value.Text;
    }

    private static bool TryReadUInt(BotWorldView world, string entityId, string field, out ulong value)
    {
        ReplicaFieldObservation observation = world.Fields[entityId, field];
        if (observation.Found && observation.Value.Magnitude is { } magnitude)
        {
            value = magnitude;
            return true;
        }
        if (observation.Found && observation.Value.WholeNumber is { } whole && whole >= 0)
        {
            value = (ulong)whole;
            return true;
        }
        value = 0;
        return false;
    }

    private static bool TryReadInt(BotWorldView world, string entityId, string field, out int value)
    {
        if (TryReadUInt(world, entityId, field, out ulong unsigned) && unsigned <= int.MaxValue)
        {
            value = (int)unsigned;
            return true;
        }
        ReplicaFieldObservation observation = world.Fields[entityId, field];
        if (observation.Found && observation.Value.WholeNumber is { } whole
            && whole >= int.MinValue && whole <= int.MaxValue)
        {
            value = (int)whole;
            return true;
        }
        value = 0;
        return false;
    }

    private static bool TryReadListCount(BotWorldView world, string entityId, string field, out int count)
    {
        ReplicaFieldObservation observation = world.Fields[entityId, field];
        if (observation.Found && observation.Value.Items is { } items)
        {
            count = items.Count;
            return true;
        }
        count = 0;
        return false;
    }

    private sealed class Observation
    {
        public bool BaseMapObserved;
        public bool MatchJoined;
        public bool SelfBound;
        public bool FirstBombPlaced;
        public bool BombDetonated;
        public bool ChainResolved;
        public bool DamageApplied;
        public bool Respawned;
        public bool FinalCircleStarted;
        public bool MatchEnded;
        public bool RankingValid;
        public bool NextMatchStarted;
        public bool SameRoom;
        public bool MatchActive;
        public bool OwnBombVisible;

        public bool Complete => BaseMapObserved && MatchJoined && SelfBound && FirstBombPlaced
            && BombDetonated && ChainResolved && DamageApplied && Respawned && FinalCircleStarted
            && MatchEnded && RankingValid && NextMatchStarted && SameRoom;
    }
}
