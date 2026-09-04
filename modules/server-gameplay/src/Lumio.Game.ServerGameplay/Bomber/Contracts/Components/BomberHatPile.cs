using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

/// <summary>散落帽堆（design.md §9.2）。Count 转移一次即整堆归零并由 G-2 回收该实体。</summary>
[EcsComponent]
public sealed partial class BomberHatPile : Component
{
    [Persist] public Sync<int> Count = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellX = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellY = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellZ = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> ExpireAtTick = new(Scope.Room, Authority.Server);
}
