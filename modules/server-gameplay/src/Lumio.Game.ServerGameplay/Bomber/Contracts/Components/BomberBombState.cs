using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

/// <summary>一颗炸弹（design.md §7.1/§7.2/§7.5）。OwnerNetEntityIdRaw 是主人 NetEntityId 的裸 u64 编码。</summary>
[EcsComponent]
public sealed partial class BomberBombState : Component
{
    [Persist] public Sync<ulong> OwnerNetEntityIdRaw = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellX = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellY = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> FuseEndTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> Power = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> ChainId = new(Scope.Room, Authority.Server);
}
