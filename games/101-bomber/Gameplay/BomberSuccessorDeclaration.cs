using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.EntityTypes;

namespace Lumio.Bomber.Gameplay;

[SuccessorBinding(101, typeof(PlayerEntity), typeof(BomberParticipantEntity), 10105)]
[SuccessorField("association", "participant", typeof(BomberPlayerState), "Participant", 10102, 9)]
[SuccessorField("association", "currentLife", typeof(BomberParticipantState), "CurrentLife", 10103, 9)]
[SuccessorField("association", "lastLife", typeof(BomberParticipantState), "LastLife", 10103, 10)]
[SuccessorField("association", "matchId", typeof(BomberParticipantState), "MatchId", 10103, 11)]
[SuccessorField("association", "lifeGeneration", typeof(BomberParticipantState), "LifeGeneration", 10103, 12)]
[SuccessorField("association", "intentGeneration", typeof(BomberSuccessorState), "IntentGeneration", 10120, 1)]
[SuccessorField("association", "eligibleTick", typeof(BomberParticipantState), "RespawnAtTick", 10103, 3)]
[SuccessorField("association", "eligible", typeof(BomberSuccessorState), "Eligible", 10120, 2)]
[SuccessorField("association", "observationParticipant", typeof(BomberSuccessorState), "ObservationParticipant", 10120, 3)]
[SuccessorField("association", "nextLifeGeneration", typeof(BomberSuccessorState), "NextLifeGeneration", 10120, 4)]
[SuccessorField("restoration", "effectWorldId", typeof(BomberSuccessorState), "EffectWorldId", 10120, 5)]
[SuccessorField("restoration", "effectInstanceId", typeof(BomberSuccessorState), "EffectInstanceId", 10120, 6)]
[SuccessorField("restoration", "effectGeneration", typeof(BomberSuccessorState), "EffectGeneration", 10120, 7)]
[SuccessorField("restoration", "effectTypeId", typeof(BomberSuccessorState), "EffectTypeId", 10120, 8)]
[SuccessorField("restoration", "target", typeof(BomberSuccessorState), "Target", 10120, 9)]
[SuccessorField("restoration", "participant", typeof(BomberSuccessorState), "Participant", 10120, 10)]
[SuccessorField("restoration", "matchId", typeof(BomberSuccessorState), "RestoreMatchId", 10120, 11)]
[SuccessorField("restoration", "lifeGeneration", typeof(BomberSuccessorState), "RestoreLifeGeneration", 10120, 12)]
[SuccessorField("restoration", "intentGeneration", typeof(BomberSuccessorState), "RestoreIntentGeneration", 10120, 13)]
[SuccessorField("restoration", "settlementTick", typeof(BomberSuccessorState), "SettlementTick", 10120, 14)]
[SuccessorField("restoration", "eligibilityRevision", typeof(BomberSuccessorState), "RestorationRevision", 10120, 15)]
public sealed class BomberSuccessorDeclaration { }
