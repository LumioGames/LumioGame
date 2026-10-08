using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Circle bounds describe gameplay geometry, never a second terrain store.</summary>
[EcsComponent]
public sealed partial class BomberFinalCircleState : Component
{
    [Persist] public Sync<ulong> TriggerTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> TriggerReason = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> InitialResourceCount = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> RemainingResourceCount = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> RegenStopTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CurrentStageId = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> NextStageId = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CurrentSide = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> NextSide = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> NextAnnounceTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> NextEffectiveTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> PoisonPoints = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> Phase = new(Scope.Room, Authority.Server);
    // Completion of each configured one-time clear, not a cache of terrain cells.
    [Persist] public Sync<uint> ClearedStageMask = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> ResourceCountInitialized = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> ChestIssuedStageMask = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> ChestUnavailableStageMask = new(Scope.None, Authority.Server);
}
