using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>An authoritative upgrade, health pack or skill candy; ordinary pickups do not expire.</summary>
[EcsComponent]
public sealed partial class BomberPickupItem : Component
{
    [Persist] public Sync<int> Kind = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<uint> SkillId = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> SkillLevel = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<uint> ComboSourceA = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<uint> ComboSourceB = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> ComboLevelA = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> ComboLevelB = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<NetEntityId> DroppedBy = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> ProtectedUntilTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<ulong> SpawnTick = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<int> Phase = new(Scope.Aoi, Authority.Server);
    [Persist] public Sync<NetEntityId> ClaimedBy = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> ExcludedLife = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> ExcludedLifeGeneration = new(Scope.None, Authority.Server);

    [Persist] public Sync<ulong> DropMatchId = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> DropParticipant = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> DropLifeGeneration = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> DropOccurrenceTick = new(Scope.None, Authority.Server);
    [Persist] public Sync<string> TerrainTransaction = new(Scope.None, Authority.Server) { Value = "" };
    [Persist] public Sync<NetEntityId> TerrainSourceBomb = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> TerrainSourceFamily = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> TerrainOrdinal = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> SupplyMatchId = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> SupplyOrdinal = new(Scope.None, Authority.Server) { Value = -1 };
}
