using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

/// <summary>爆炸覆盖的一格，瞬时危险窗（design.md §7.2/§7.5/§12）。DangerUntilTick 到期后由 G-1 回收该实体。</summary>
[EcsComponent]
public sealed partial class BomberExplosionCell : Component
{
    [Persist] public Sync<ulong> ChainId = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> SourceBombOwnerNetEntityIdRaw = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellX = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellY = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> DangerUntilTick = new(Scope.Room, Authority.Server);
}
