using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>One bomb owns its fuse and flame; its full source identity survives chain reactions.</summary>
[EcsComponent]
public sealed partial class BomberBombState : Component
{
    [Persist] public Sync<NetEntityId> Owner = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<NetEntityId> SourceLife = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> SourceLifeGeneration = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> FuseEndTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> Power = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> ChainId = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> BombKind = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> PierceLayers = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> SkillLevel = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> Phase = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> ExplodedAtTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> DangerUntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> BurnUntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> ReachUp = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> ReachDown = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> ReachLeft = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> ReachRight = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> KickDirection = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> KickRange = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> KickStartTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<bool> CapacityReturned = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> PlacedAtTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<bool> PlacementRecorded = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> HitFamily = new(Scope.None, Authority.Server);
    [Persist] public SyncList<string> TerrainContinuations = new(Scope.None, 4, Authority.Server);
    [Persist] public SyncList<NetEntityId> HitParticipants = new(Scope.None, 16, Authority.Server);
    [Persist] public SyncList<NetEntityId> HitLives = new(Scope.None, 16, Authority.Server);
    [Persist] public SyncList<ulong> HitLifeGenerations = new(Scope.None, 16, Authority.Server);
    [Persist] public SyncList<int> HitStates = new(Scope.None, 16, Authority.Server);
    [Persist] public SyncList<NetEntityId> ContactedChests = new(Scope.None, 52, Authority.Server);
    [Persist] public SyncList<ulong> HitHandleWorlds = new(Scope.None, 16, Authority.Server);
    [Persist] public SyncList<ulong> HitHandleInstances = new(Scope.None, 16, Authority.Server);
    [Persist] public SyncList<uint> HitHandleGenerations = new(Scope.None, 16, Authority.Server);
    // Admission witness for this exact damage row; health and status still settle only through GAS.
    [Persist] public SyncList<bool> HitDependentsAdmitted = new(Scope.None, 16, Authority.Server);
    // A Split mother owns all four future structural credits until each arm either publishes
    // its exact child or proves it has no endpoint. Submitted unknown orders keep their credit.
    [Persist] public Sync<int> FutureChildren = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> SplitSubmittedMask = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> SplitResolvedMask = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> ChildDirection = new(Scope.None, Authority.Server);
    [Persist] public Sync<string> PromiseToken = new(Scope.None, Authority.Server) { Value = "" };
    [Persist] public Sync<bool> Frenzy = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> TraversalOriginX = new(Scope.None, Authority.Server) { Value = -1 };
    [Persist] public Sync<int> TraversalOriginZ = new(Scope.None, Authority.Server) { Value = -1 };
    [Persist] public Sync<int> TraversalPower = new(Scope.None, Authority.Server) { Value = -1 };
    [Persist] public SyncList<int> TraversalArms = new(Scope.None, 4, Authority.Server);
}
