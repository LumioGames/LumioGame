using System;
using System.Collections.Generic;
using Lumio.Client.Bot;
using Lumio.Client.Gameplay.ECS;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Bots;

/// <summary>
/// Read-only evidence collector for the second-round Bomber tour.
///
/// This scenario deliberately does not synthesize gameplay events. Every flag is set from a
/// value or transition delivered by the client replica, and remains false when that observation
/// is unavailable. The scenario can therefore be used with a real server without making the bot
/// side a second gameplay authority.
/// </summary>
public sealed class BomberMatchScenario : BotScenario
{
    private const string ParticipantMatchId = "BomberParticipantState.matchId";
    private const string ParticipantLifePhase = "BomberParticipantState.lifePhase";
    private const string ParticipantCurrentLife = "BomberParticipantState.currentLife";
    private const string ParticipantLastLife = "BomberParticipantState.lastLife";
    private const string ParticipantRespawnAt = "BomberParticipantState.respawnAtTick";
    private const string ParticipantEliminatedAt = "BomberParticipantState.eliminatedTick";

    private const string BombPhase = "BomberBombState.phase";
    private const string BombChain = "BomberBombState.chainId";
    private const string BombExplodedAt = "BomberBombState.explodedAtTick";
    private const string BombOwner = "BomberBombState.owner";

    private const string PlayerLifeGeneration = "BomberPlayerState.lifeGeneration";
    private const string PlayerParticipant = "BomberPlayerState.participant";
    private const string HealthCurrent = "AttributeComponent.HealthPointsCurrent";

    // These three observations require WorldEntity/voxel/result projections that are not part of
    // the currently available BotWorldView; they intentionally remain false until such facts are
    // delivered instead of being inferred from timing or census size.
    private bool basemapObserved;
    private bool matchJoined;
    private bool selfBound;
    private bool firstBombPlace;
    private bool bombDetonated;
    private bool chainResolved;
    private bool damageApplied;
    private bool respawned;
    private bool finalCircleStarted;
    private bool matchEnded;
    private bool rankingValid;
    private bool nextMatchStarted;
    private bool sameRoom;

    private string roomId = string.Empty;
    private ulong previousLifeGeneration;
    private long previousHealth;
    private bool hasHealth;

    /// <summary>Creates an empty evidence collector for Bot.Host.</summary>
    public BomberMatchScenario()
    {
        basemapObserved = false;
        finalCircleStarted = false;
        rankingValid = false;
        matchEnded = false;
        nextMatchStarted = false;
    }

    /// <inheritdoc />
    public override BotStepResult Step(in BotDriverContext context)
    {
        BotWorldView world = context.World;
        BotSelfBinding self = world.Self;

        if (world.HasSelf && self.Found && !string.IsNullOrWhiteSpace(self.NetEntityId)
            && !string.IsNullOrWhiteSpace(self.RoomId))
        {
            selfBound = true;
            if (roomId.Length == 0)
                roomId = self.RoomId;
            else if (string.Equals(roomId, self.RoomId, StringComparison.Ordinal)
                && nextMatchStarted)
                sameRoom = true;

            ObserveSelf(world, self.NetEntityId);
        }

        ObserveParticipants(world, self.NetEntityId);
        ObserveBombs(world);
        return IsComplete ? BotStepResult.Complete : BotStepResult.Continue;
    }

    /// <inheritdoc />
    public override void Assert(in BotDriverContext context, BotAssertionSink sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        sink.That(basemapObserved, "basemap_observed");
        sink.That(matchJoined, "match_joined");
        sink.That(selfBound, "self_bound");
        sink.That(firstBombPlace, "first_bomb_place");
        sink.That(bombDetonated, "bomb_detonated");
        sink.That(chainResolved, "chain_resolved");
        sink.That(damageApplied, "damage_applied");
        sink.That(respawned, "respawned");
        sink.That(finalCircleStarted, "final_circle_started");
        sink.That(matchEnded, "match_ended");
        sink.That(rankingValid, "ranking_valid");
        sink.That(nextMatchStarted, "next_match_started");
        sink.That(sameRoom, "same_room");
    }

    private bool IsComplete => basemapObserved && matchJoined && selfBound && firstBombPlace
        && bombDetonated && chainResolved && damageApplied && respawned && finalCircleStarted
        && matchEnded && rankingValid && nextMatchStarted && sameRoom;

    private void ObserveSelf(in BotWorldView world, string selfId)
    {
        ReplicaFieldObservation generation = world.Fields[selfId, PlayerLifeGeneration];
        if (generation.Found && TryUnsigned(generation.Value, out ulong currentGeneration)
            && currentGeneration != 0)
        {
            if (previousLifeGeneration != 0 && currentGeneration > previousLifeGeneration)
                respawned = true;
            previousLifeGeneration = currentGeneration;
        }

        ReplicaFieldObservation health = world.Fields[selfId, HealthCurrent];
        if (health.Found && TrySigned(health.Value, out long currentHealth))
        {
            if (hasHealth && currentHealth < previousHealth)
                damageApplied = true;
            previousHealth = currentHealth;
            hasHealth = true;
        }
    }

    private void ObserveParticipants(in BotWorldView world, string selfId)
    {
        ReplicaFieldObservation participantRef = world.Fields[selfId, PlayerParticipant];
        if (!participantRef.Found || participantRef.Value.Kind != "netEntityId"
            || string.IsNullOrWhiteSpace(participantRef.Value.Text))
            return;

        IReadOnlyList<BotVisibleEntity> participants = world.VisibleEntities[
            GeneratedRegistry.Instance.WireName(typeof(BomberParticipantEntity))];
        for (int i = 0; i < participants.Count; i++)
        {
            BotVisibleEntity participant = participants[i];
            if (!participant.Found || !string.Equals(participant.NetEntityId, participantRef.Value.Text,
                    StringComparison.Ordinal))
                continue;

            ReplicaFieldObservation match = world.Fields[participant.NetEntityId, ParticipantMatchId];
            if (match.Found && TryUnsigned(match.Value, out ulong matchId) && matchId != 0)
                matchJoined = selfBound;

            ReplicaFieldObservation lifePhase = world.Fields[participant.NetEntityId, ParticipantLifePhase];
            ReplicaFieldObservation respawnAt = world.Fields[participant.NetEntityId, ParticipantRespawnAt];
            ReplicaFieldObservation eliminatedAt = world.Fields[participant.NetEntityId, ParticipantEliminatedAt];
            ReplicaFieldObservation currentLife = world.Fields[participant.NetEntityId, ParticipantCurrentLife];
            ReplicaFieldObservation lastLife = world.Fields[participant.NetEntityId, ParticipantLastLife];
            // Match end, final circle, ranking and a later match require WorldEntity result fields,
            // which are unavailable in this BotWorldView. Keep those assertions false.
            _ = lifePhase;
            _ = eliminatedAt;
            _ = currentLife;
            _ = lastLife;
            _ = respawnAt;
            break;
        }
    }

    private void ObserveBombs(in BotWorldView world)
    {
        IReadOnlyList<BotVisibleEntity> bombs = world.VisibleEntities[GeneratedRegistry.Instance.WireName(typeof(BomberBombEntity))];
        for (int i = 0; i < bombs.Count; i++)
        {
            BotVisibleEntity bomb = bombs[i];
            if (!bomb.Found) continue;
            ReplicaFieldObservation owner = world.Fields[bomb.NetEntityId, BombOwner];
            if (owner.Found && owner.Value.Kind == "netEntityId" && !string.IsNullOrWhiteSpace(owner.Value.Text))
                firstBombPlace = true;

            ReplicaFieldObservation exploded = world.Fields[bomb.NetEntityId, BombExplodedAt];
            if (exploded.Found && TryUnsigned(exploded.Value, out ulong explodedAt) && explodedAt != 0)
                bombDetonated = true;

            ReplicaFieldObservation phase = world.Fields[bomb.NetEntityId, BombPhase];
            ReplicaFieldObservation chain = world.Fields[bomb.NetEntityId, BombChain];
            if (phase.Found && TrySigned(phase.Value, out long phaseValue)
                && chain.Found && TryUnsigned(chain.Value, out ulong chainId) && chainId != 0)
            {
                if (phaseValue >= (long)BomberBombPhase.Extinguished)
                    chainResolved = true;
            }
        }
    }

    private static bool IsUnsignedPositive(in ReplicaFieldValue value) =>
        TryUnsigned(value, out ulong number) && number > 0;

    private static bool TryUnsigned(in ReplicaFieldValue value, out ulong number)
    {
        if (value.Magnitude is ulong magnitude)
        {
            number = magnitude;
            return true;
        }
        if (value.WholeNumber is long signed && signed >= 0)
        {
            number = (ulong)signed;
            return true;
        }
        number = 0;
        return false;
    }

    private static bool TrySigned(in ReplicaFieldValue value, out long number)
    {
        if (value.WholeNumber is long signed)
        {
            number = signed;
            return true;
        }
        if (value.Magnitude is ulong magnitude && magnitude <= long.MaxValue)
        {
            number = (long)magnitude;
            return true;
        }
        number = 0;
        return false;
    }
}
