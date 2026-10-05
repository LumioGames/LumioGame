using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Mutable counters for the current match, owned by the durable participant.</summary>
[EcsComponent]
public sealed partial class BomberStatistics : Component
{
    [Persist] public Sync<int> Kills = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> Bombs = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> DestroyedBlocks = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> Pickups = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> BestChain = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> PeakHats = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> HatKingTicks = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> SkillCasts = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> Evolutions = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> Deaths = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> PeakHealthPoints = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> BossKills = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> ClutchEscapes = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> GoldenHeartPickups = new(Scope.Room, Authority.Server);
    [Persist] public SyncList<uint> SpecialBombHistory = new(Scope.Room, 6, Authority.Server);
    [Persist] public Sync<int> CharacterId = new(Scope.Room, Authority.Server);
}
