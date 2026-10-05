using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>World-owned identities and the intent for one unresolved ordinary voxel batch.</summary>
[EcsComponent]
public sealed partial class BomberWorldRuntime : Component
{
    [Persist] public Sync<ulong> NextHfsmMachineKey = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> NextEventSequence = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> NextChainId = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> NextVoxelTransactionSequence = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> BombPlacementTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> BombPlacementMatchId = new(Scope.None, Authority.Server);
    [Persist] public SyncList<NetEntityId> ParticipantIds = new(Scope.None, 16, Authority.Server);
    [Persist] public SyncList<int> BombPlacementCells = new(Scope.None, 361, Authority.Server);
    [Persist] public SyncList<NetEntityId> BombPlacementParticipants = new(Scope.None, 361, Authority.Server);

    // One ordinary merged batch. Chest-specific transactions remain owned by their chest.
    [Persist] public SyncList<string> PendingVoxelTransactionIds = new(Scope.None, 1, Authority.Server);
    [Persist] public SyncList<ulong> PendingVoxelSubmittedTicks = new(Scope.None, 1, Authority.Server);
    [Persist] public SyncList<ulong> PendingVoxelMatchIds = new(Scope.None, 1, Authority.Server);
    [Persist] public SyncList<ulong> PendingSections = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<int> PendingCellOffsets = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<ulong> PendingExpectedRevisions = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<uint> PendingOldBlocks = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<uint> PendingNewBlocks = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<int> PendingKinds = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<NetEntityId> PendingParticipants = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<NetEntityId> PendingSourceLives = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<ulong> PendingSourceLifeGenerations = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<NetEntityId> PendingSourceBombs = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<NetEntityId> PendingChests = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<ulong> PendingChainIds = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<string> TerrainPendingDetails = new(Scope.None, 722, Authority.Server);
    [Persist] public SyncList<string> TerrainRewards = new(Scope.None, 703, Authority.Server);
    [Persist] public Sync<ulong> TerrainInitialMatchId = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> TerrainReservedPickups = new(Scope.None, Authority.Server);
    [Persist] public Sync<string> InitialResourcePlan = new(Scope.None, Authority.Server) { Value = "" };
    [Persist] public Sync<int> InitialResourceCursor = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> InitialResourcePhase = new(Scope.None, Authority.Server);
    [Persist] public SyncList<int> InitialBarrelReservations = new(Scope.None, 8, Authority.Server);
    [Persist] public Sync<string> BarrelBombPromises = new(Scope.None, Authority.Server) { Value = "" };
    [Persist] public Sync<ulong> RegenerationMatchId = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> RegenerationNextTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> NextResourceGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<string> RegenerationPromises = new(Scope.None, Authority.Server) { Value = "" };
    [Persist] public Sync<string> IceBridgePromises = new(Scope.None, Authority.Server) { Value = "" };
    [Persist] public Sync<string> FireTrailPromises = new(Scope.None, Authority.Server) { Value = "" };
    [Persist] public Sync<ulong> SupplyAnnouncedMatchId = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> SupplyIssuedMatchId = new(Scope.Room, Authority.Server);
    [Persist] public Sync<string> SupplyPending = new(Scope.None, Authority.Server) { Value = "" };
}
