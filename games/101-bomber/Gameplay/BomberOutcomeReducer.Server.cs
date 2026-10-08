using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Lumio.Bomber.Gameplay.Contracts.Components;
namespace Lumio.Bomber.Gameplay;
[EffectReducer("bomber.outcome", After = new string[] { "bomber.settlement", "bomber.health", "bomber.fire" }, MaxWrites = 423)]
[EffectReducerField(typeof(BomberMatchState), "Phase", 10104, 1)]
[EffectReducerField(typeof(BomberMatchState), "EndTick", 10104, 2)]
[EffectReducerField(typeof(BomberMatchState), "PhaseEndTick", 10104, 3)]
[EffectReducerField(typeof(BomberMatchState), "Winner", 10104, 4)]
[EffectReducerField(typeof(BomberMatchState), "SurvivorCount", 10104, 5)]
[EffectReducerField(typeof(BomberMatchState), "EndReason", 10104, 6)]
[EffectReducerField(typeof(BomberMatchState), "OutcomePending", 10104, 7)]
[EffectReducerField(typeof(BomberParticipantState), "LifePhase", 10103, 1)]
[EffectReducerField(typeof(BomberParticipantState), "EliminatedTick", 10103, 4)]
[EffectReducerField(typeof(BomberSuccessorState), "Eligible", 10120, 2)]
[EffectReducerField(typeof(BomberPlayerState), "LifePhase", 10102, 1)]
[EffectReducerField(typeof(BomberPlayerState), "RespawnAtTick", 10102, 2)]
[EffectReducerField(typeof(BomberPlayerState), "EliminatedTick", 10102, 3)]
[EffectReducerField(typeof(BomberParticipantState), "DeathTick", 10103, 2)]
[EffectReducerField(typeof(BomberParticipantState), "RespawnAtTick", 10103, 3)]
[EffectReducerField(typeof(BomberParticipantState), "DeathStructurePending", 10103, 5)]
[EffectReducerField(typeof(BomberParticipantState), "DeathStructureLife", 10103, 6)]
[EffectReducerField(typeof(BomberParticipantState), "DeathStructureGeneration", 10103, 7)]
[EffectReducerField(typeof(BomberParticipantState), "DeathStructureTick", 10103, 8)]
[EffectReducerField(typeof(BomberPlayerState), "Participant", 10102, 9)]
[EffectReducerField(typeof(BomberSuccessorLife), "PreparedRevision", 10121, 1)]
[EffectReducerField(typeof(BomberParticipantState), "CurrentLife", 10103, 9)]
[EffectReducerField(typeof(BomberParticipantState), "LastLife", 10103, 10)]
[EffectReducerField(typeof(BomberParticipantState), "MatchId", 10103, 11)]
[EffectReducerField(typeof(BomberParticipantState), "LifeGeneration", 10103, 12)]
[EffectReducerField(typeof(BomberSuccessorState), "IntentGeneration", 10120, 1)]
[EffectReducerField(typeof(BomberSuccessorState), "ObservationParticipant", 10120, 3)]
[EffectReducerField(typeof(BomberSuccessorState), "NextLifeGeneration", 10120, 4)]
[EffectReducerField(typeof(BomberSuccessorState), "EffectWorldId", 10120, 5)]
[EffectReducerField(typeof(BomberSuccessorState), "EffectInstanceId", 10120, 6)]
[EffectReducerField(typeof(BomberSuccessorState), "EffectGeneration", 10120, 7)]
[EffectReducerField(typeof(BomberSuccessorState), "EffectTypeId", 10120, 8)]
[EffectReducerField(typeof(BomberSuccessorState), "Target", 10120, 9)]
[EffectReducerField(typeof(BomberSuccessorState), "Participant", 10120, 10)]
[EffectReducerField(typeof(BomberSuccessorState), "RestoreMatchId", 10120, 11)]
[EffectReducerField(typeof(BomberSuccessorState), "RestoreLifeGeneration", 10120, 12)]
[EffectReducerField(typeof(BomberSuccessorState), "RestoreIntentGeneration", 10120, 13)]
[EffectReducerField(typeof(BomberSuccessorState), "SettlementTick", 10120, 14)]
[EffectReducerField(typeof(BomberSuccessorState), "RestorationRevision", 10120, 15)]
[EffectReducerField(typeof(BomberSuccessorState), "RestoreOutcome", 10120, 24)]
public sealed partial class BomberOutcomeReducer : EffectReducer
{
    public static void Reduce(EffectReducerContext c)
    {
        NetEntityId world = c.WorldEntity;
        // A participant can cross zero once and has one successor restoration
        // stream in a Tick. Search the retained results without writes, then
        // publish the original lifecycle fields once per bounded participant.
        for (int slot = 0; slot < c.Count<BomberWorldRuntime, NetEntityId>(world, "participantIds"); slot++)
        {
            NetEntityId participant = c.At<BomberWorldRuntime, NetEntityId>(world, "participantIds", slot);
            int lethalResult = -1, restoreResult = -1, appliedRestoreResult = -1;
            for (int i = 0; i < c.ResultCount; i++)
            {
                EffectResult candidate = c.Result(i);
                NetEntityId target = candidate.Target;
                if (c.Has<BomberPlayerState>(target))
                {
                    if (c.Read<BomberPlayerState, NetEntityId>(target, "participant") == participant)
                    {
                        uint typeId = candidate.TypeId;
                        // Preserve the retained last lethal/restore selections;
                        // component reads keep their original Has guard.
                        if (typeId == 10101u | typeId == 10110u)
                        {
                            if (candidate.Kind == EffectResultKind.Initial)
                            {
                                if (candidate.Outcome == EffectResultOutcome.Applied)
                                {
                                    if (candidate.CrossedZero) lethalResult = i;
                                }
                            }
                        }
                        else if (typeId == 10105u)
                        {
                            if (candidate.Kind == EffectResultKind.Initial)
                            {
                                restoreResult = i;
                                if (candidate.Outcome == EffectResultOutcome.Applied) appliedRestoreResult = i;
                            }
                        }
                    }
                }
            }
            if (lethalResult >= 0)
            {
                EffectResult r = c.Result(lethalResult);
                NetEntityId bomb = r.Source;
                int matched = -1;
                bool accepted = false;
                ulong generation = 0;
                if (r.TypeId == 10101u && c.Has<BomberDamageFacts>(bomb))
                {
                    for (int row = 0; row < c.Count<BomberDamageFacts, ulong>(bomb, "handleWorld"); row++)
                    {
                        if (c.At<BomberDamageFacts, ulong>(bomb, "handleWorld", row) == r.Handle.WorldId.Value &&
                            c.At<BomberDamageFacts, ulong>(bomb, "handleInstance", row) == r.Handle.InstanceId.Value &&
                            c.At<BomberDamageFacts, uint>(bomb, "handleGeneration", row) == r.Handle.Generation &&
                            c.At<BomberDamageFacts, NetEntityId>(bomb, "target", row) == r.Target)
                            matched = row;
                    }
                }
                if (matched >= 0 && c.At<BomberDamageFacts, int>(bomb, "status", matched) == 1 &&
                    c.At<BomberBombState, ulong>(bomb, "hitHandleWorlds", matched) == r.Handle.WorldId.Value &&
                    c.At<BomberBombState, ulong>(bomb, "hitHandleInstances", matched) == r.Handle.InstanceId.Value &&
                    c.At<BomberBombState, uint>(bomb, "hitHandleGenerations", matched) == r.Handle.Generation &&
                    c.At<BomberBombState, NetEntityId>(bomb, "hitLives", matched) == r.Target &&
                    c.At<BomberBombState, NetEntityId>(bomb, "hitParticipants", matched) == participant &&
                    c.At<BomberDamageFacts, NetEntityId>(bomb, "participant", matched) == participant &&
                    c.At<BomberBombState, ulong>(bomb, "hitLifeGenerations", matched) == c.At<BomberDamageFacts, ulong>(bomb, "generation", matched))
                {
                    generation = c.At<BomberDamageFacts, ulong>(bomb, "generation", matched);
                    accepted = true;
                }
                if (r.TypeId == 10110u && c.Has<BomberFireFacts>(participant) &&
                    c.Count<BomberFireFacts, ulong>(participant, "fireHandleWorld") == 1 &&
                    c.At<BomberFireFacts, ulong>(participant, "fireHandleWorld", 0) == r.Handle.WorldId.Value &&
                    c.At<BomberFireFacts, ulong>(participant, "fireHandleInstance", 0) == r.Handle.InstanceId.Value &&
                    c.At<BomberFireFacts, uint>(participant, "fireHandleGeneration", 0) == r.Handle.Generation &&
                    c.At<BomberFireFacts, uint>(participant, "fireTypeId", 0) == r.TypeId &&
                    c.At<BomberFireFacts, NetEntityId>(participant, "fireTarget", 0) == r.Target &&
                    c.At<BomberFireFacts, NetEntityId>(participant, "fireSource", 0) == r.Source &&
                    c.At<BomberFireFacts, NetEntityId>(participant, "fireParticipant", 0) == participant &&
                    c.At<BomberFireFacts, NetEntityId>(participant, "fireLife", 0) == r.Target &&
                    c.At<BomberFireFacts, ulong>(participant, "fireGeneration", 0) == c.Read<BomberPlayerState, ulong>(r.Target, "lifeGeneration") &&
                    c.Read<BomberParticipantState, NetEntityId>(participant, "currentLife") == r.Target &&
                    c.Read<BomberParticipantState, ulong>(participant, "lifeGeneration") == c.At<BomberFireFacts, ulong>(participant, "fireGeneration", 0) &&
                    c.At<BomberFireFacts, ulong>(participant, "fireMatchId", 0) == c.Read<BomberParticipantState, ulong>(participant, "matchId") &&
                    c.At<BomberFireFacts, ulong>(participant, "fireMatchId", 0) == c.Read<BomberMatchState, ulong>(world, "matchId") &&
                    c.At<BomberFireFacts, ulong>(participant, "fireTick", 0) == r.AppliedTick && r.Tick == c.Tick &&
                    c.At<BomberFireFacts, int>(participant, "fireCause", 0) == 2 &&
                    c.At<BomberFireFacts, int>(participant, "fireStatus", 0) == 1 &&
                    c.At<BomberFireFacts, bool>(participant, "fireReady", 0) &&
                    c.At<BomberFireFacts, long>(participant, "fireBefore", 0) > 0 &&
                    c.At<BomberFireFacts, long>(participant, "fireAfter", 0) == 0 &&
                    c.At<BomberFireFacts, long>(participant, "fireActual", 0) == c.At<BomberFireFacts, long>(participant, "fireBefore", 0))
                {
                    // bomber.fire already claimed this immutable association and published status.
                    generation = c.At<BomberFireFacts, ulong>(participant, "fireGeneration", 0);
                    accepted = true;
                }
                if (accepted)
                {
                    bool final = c.Read<BomberMatchState, int>(world, "phase") == 3;
                    int phase = final ? 3 : 2;
                    ulong respawn = final ? 0UL : c.Tick + c.Read<BomberMatchState, ulong>(world, "settlementRespawnTicks");
                    c.Write<BomberPlayerState, int>(r.Target, "lifePhase", phase);
                    c.Write<BomberPlayerState, ulong>(r.Target, "respawnAtTick", respawn);
                    c.Write<BomberPlayerState, ulong>(r.Target, "eliminatedTick", final ? c.Tick : 0UL);
                    c.Write<BomberParticipantState, int>(participant, "lifePhase", phase);
                    c.Write<BomberParticipantState, ulong>(participant, "deathTick", c.Tick);
                    c.Write<BomberParticipantState, ulong>(participant, "respawnAtTick", respawn);
                    c.Write<BomberParticipantState, ulong>(participant, "eliminatedTick", final ? c.Tick : 0UL);
                    c.Write<BomberParticipantState, bool>(participant, "deathStructurePending", true);
                    c.Write<BomberParticipantState, NetEntityId>(participant, "deathStructureLife", r.Target);
                    c.Write<BomberParticipantState, ulong>(participant, "deathStructureGeneration", generation);
                    c.Write<BomberParticipantState, ulong>(participant, "deathStructureTick", c.Tick);
                }
            }
            if (appliedRestoreResult >= 0)
            {
                EffectResult r = c.Result(appliedRestoreResult);
                c.Write<BomberSuccessorState, NetEntityId>(participant, "target", r.Target);
                c.Write<BomberSuccessorState, NetEntityId>(participant, "participant", participant);
                c.Write<BomberSuccessorState, ulong>(participant, "restoreMatchId", c.Read<BomberParticipantState, ulong>(participant, "matchId"));
                c.Write<BomberSuccessorState, ulong>(participant, "restoreLifeGeneration", c.Read<BomberSuccessorState, ulong>(participant, "nextLifeGeneration"));
                c.Write<BomberSuccessorState, ulong>(participant, "restoreIntentGeneration", c.Read<BomberSuccessorState, ulong>(participant, "intentGeneration"));
                c.Write<BomberSuccessorState, ulong>(participant, "settlementTick", r.Tick);
                c.Write<BomberSuccessorState, ulong>(participant, "restorationRevision", c.Read<BomberSuccessorLife, ulong>(r.Target, "preparedRevision"));
            }
            if (restoreResult >= 0)
            {
                EffectResult r = c.Result(restoreResult);
                c.Write<BomberSuccessorState, ulong>(participant, "effectWorldId", r.Handle.WorldId.Value);
                c.Write<BomberSuccessorState, ulong>(participant, "effectInstanceId", r.Handle.InstanceId.Value);
                c.Write<BomberSuccessorState, uint>(participant, "effectGeneration", r.Handle.Generation);
                c.Write<BomberSuccessorState, uint>(participant, "effectTypeId", r.TypeId);
                c.Write<BomberSuccessorState, int>(participant, "restoreOutcome", r.Outcome == EffectResultOutcome.Applied ? 1 : 2);
            }
        }

        if (c.Read<BomberMatchState, int>(world, "phase") == 3)
        {
            int alive = 0;
            int pendingRespawns = 0;
            NetEntityId winner = default;
            int bestHats = -1;
            for (int i = 0; i < c.Count<BomberWorldRuntime, NetEntityId>(world, "participantIds"); i++)
            {
                NetEntityId participant = c.At<BomberWorldRuntime, NetEntityId>(world, "participantIds", i);
                if (c.Read<BomberParticipantState, int>(participant, "lifePhase") == 2)
                    pendingRespawns++;
                NetEntityId life = c.Read<BomberParticipantState, NetEntityId>(participant, "currentLife");
                EffectCurrentValue health = c.TryCurrent(life, "HealthPoints");
                if (health.Present)
                {
                    if (health.Value > 0 && c.Read<BomberParticipantState, int>(participant, "lifePhase") < 2)
                    {
                        alive++;
                        int hats = c.Read<BomberPlayerState, int>(life, "hatCount");
                        if (hats > bestHats)
                        {
                    bestHats = hats;
                    winner = participant;
                        }
                    }
                }
            }
            if (alive <= 1 && pendingRespawns == 0 || c.Tick >= c.Read<BomberMatchState, ulong>(world, "phaseEndTick"))
            {
                // At the time cap an untransferred prearranged life is eliminated now,
                // not at its earlier ordinary death. Three writes per bounded eight-seat roster.
                for (int i = 0; i < c.Count<BomberWorldRuntime, NetEntityId>(world, "participantIds"); i++)
                {
                    NetEntityId participant = c.At<BomberWorldRuntime, NetEntityId>(world, "participantIds", i);
                    if (c.Read<BomberParticipantState, int>(participant, "lifePhase") == 2)
                    {
                        c.Write<BomberParticipantState, int>(participant, "lifePhase", 3);
                        c.Write<BomberParticipantState, ulong>(participant, "eliminatedTick", c.Tick);
                        c.Write<BomberSuccessorState, bool>(participant, "eligible", false);
                    }
                }
                c.Write<BomberMatchState, int>(world, "phase", 4);
                c.Write<BomberMatchState, ulong>(world, "endTick", c.Tick);
                c.Write<BomberMatchState, ulong>(world, "phaseEndTick", c.Tick + c.Read<BomberMatchState, ulong>(world, "settlementPodiumTicks"));
                c.Write<BomberMatchState, int>(world, "survivorCount", alive);
                c.Write<BomberMatchState, NetEntityId>(world, "winner", alive > 0 ? winner : default);
                c.Write<BomberMatchState, int>(world, "endReason", alive == 0 ? 2 : alive == 1 ? 1 : 3);
                c.Write<BomberMatchState, bool>(world, "outcomePending", true);
            }
        }
    }
}
