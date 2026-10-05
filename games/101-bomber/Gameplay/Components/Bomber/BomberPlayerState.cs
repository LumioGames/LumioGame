using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Lifecycle values are projections of the player's native HFSM; position lives only in LogicTransform.</summary>
[EcsComponent]
public sealed partial class BomberPlayerState : Component
{
    [Persist] public Sync<int> LifePhase = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<NetEntityId> Participant = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> LifeGeneration = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> Facing = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> NextCharacterId = new(Scope.Owner, Authority.Server);
    [Persist] public Sync<int> ParticipantIndex = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> RespawnAtTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> ProtectedUntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> EliminatedTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> HatCount = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> MaximumHealth = new(Scope.Aoi, Authority.Server) { Value = 6 };
    [Persist] public Sync<ulong> RestoreIntent = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> RestorePending = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> RestoredIntent = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> GoldenHeartCount = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> InputMemoryMatchId = new(Scope.Owner, Authority.Server);
    [Persist] public Sync<int> PendingTurnDirection = new(Scope.Owner, Authority.Server);
    [Persist] public Sync<ulong> PendingTurnUntilTick = new(Scope.Owner, Authority.Server);
    [Persist] public Sync<int> LastMoveDirection = new(Scope.Owner, Authority.Server);
    [Persist] public Sync<ulong> LastMoveTick = new(Scope.Owner, Authority.Server);
    [Persist] public Sync<ulong> LastAssistTick = new(Scope.Owner, Authority.Server);
    [Persist] public Sync<int> AssistToleranceMilli = new(Scope.Owner, Authority.Server);
    [Persist] public Sync<ulong> PendingPlaceUntilTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> BombButtonMode = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> BombButtonStartedTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> BombButtonLastInputTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> BombButtonLifeGeneration = new(Scope.None, Authority.Server);
}
