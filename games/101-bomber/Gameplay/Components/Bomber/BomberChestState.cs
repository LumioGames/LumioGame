using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>A bound chest owns hit accounting; its position comes only from the native voxel binding.</summary>
[EcsComponent]
public sealed partial class BomberChestState : Component
{
    [Persist] public Sync<int> RequiredHits = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> RemainingHits = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> Phase = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<string> PendingTransactionId = new(Scope.None, Authority.Server) { Value = "" };
    [Persist] public Sync<bool> HasPendingTransaction = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> PendingMatchId = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> PendingSubmittedTick = new(Scope.None, Authority.Server);
    [Persist] public SyncList<NetEntityId> HitBombs = new(Scope.None, 3, Authority.Server);
    [Persist] public Sync<uint> ResourceTier = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> ResourceGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> InitialResourceMatch = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> InitialResourceCell = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> StrongSpawnMatch = new(Scope.None, Authority.Server);
    [Persist] public Sync<uint> StrongSpawnStage = new(Scope.None, Authority.Server);
}
