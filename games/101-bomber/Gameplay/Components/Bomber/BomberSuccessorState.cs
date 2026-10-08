using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Game eligibility, settled restoration witness and opaque Runtime request correlation.</summary>
[EcsComponent]
public sealed partial class BomberSuccessorState : Component
{
    [Persist] public Sync<ulong> IntentGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> Eligible = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> ObservationParticipant = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> NextLifeGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> EffectWorldId = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> EffectInstanceId = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> EffectGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> EffectTypeId = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> Target = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> Participant = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> RestoreMatchId = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> RestoreLifeGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> RestoreIntentGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> SettlementTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> RestorationRevision = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> ReservationWorld = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> ReservationSlot = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> ReservationGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> DormantLife = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> TransferRequest = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> RestoreHandleWorld = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> RestoreHandleInstance = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> RestoreHandleGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> RestoreOutcome = new(Scope.None, Authority.Server);
}
