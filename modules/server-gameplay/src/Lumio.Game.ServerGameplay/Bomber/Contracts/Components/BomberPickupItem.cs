using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

/// <summary>软砖掉落的正向糖果（design.md §7.4/§8.5）。Kind: 0=FirePlus, 1=BombPlus, 2=SpeedPlus。</summary>
[EcsComponent]
public sealed partial class BomberPickupItem : Component
{
    [Persist] public Sync<int> Kind = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellX = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellY = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellZ = new(Scope.Room, Authority.Server);
}
