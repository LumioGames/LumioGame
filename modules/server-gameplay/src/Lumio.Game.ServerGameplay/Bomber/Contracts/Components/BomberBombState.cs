using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

/// <summary>
/// 一颗炸弹，兼任它自己的爆炸（design.md §7.1/§7.2/§7.5；ADR 0017）。
/// OwnerNetEntityIdRaw 是主人 NetEntityId 的裸 u64 编码。
/// 生命周期：引信计时 → ExplodedAtTick 起进入火焰阶段（至 DangerUntilTick）
/// → 留火阶段（至 BurnUntilTick，Stage 5）→ 销毁。爆炸不另建实体。
/// </summary>
[EcsComponent]
public sealed partial class BomberBombState : Component
{
    [Persist] public Sync<ulong> OwnerNetEntityIdRaw = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellX = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellY = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellZ = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> FuseEndTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> Power = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> ChainId = new(Scope.Room, Authority.Server);

    /// <summary>形态（design.md §8.4）：0=标准 1=冰冻 2=火焰 3=穿透 4=分裂。几何一律十字，本字段只改伤害与余烬语义。</summary>
    [Persist] public Sync<int> BombKind = new(Scope.Room, Authority.Server);

    /// <summary>遇软砖摧毁后还能继续穿过的层数。标准弹 = 0；穿透弹按等级放大。</summary>
    [Persist] public Sync<int> PierceLayers = new(Scope.Room, Authority.Server);

    /// <summary>引爆发生的 Tick；0 表示尚未引爆。</summary>
    [Persist] public Sync<ulong> ExplodedAtTick = new(Scope.Room, Authority.Server);

    /// <summary>火焰阶段结束 Tick（dangerWindowMs）。此前进入覆盖格的玩家受伤，同弹对同人最多一次。</summary>
    [Persist] public Sync<ulong> DangerUntilTick = new(Scope.Room, Authority.Server);

    /// <summary>留火阶段结束 Tick（火焰弹与木头材质，Stage 5）；等于 DangerUntilTick 表示无留火。</summary>
    [Persist] public Sync<ulong> BurnUntilTick = new(Scope.Room, Authority.Server);

    /// <summary>四臂实际到达格数，传播算完后写入（已含地形阻断）。客户端据此直接绘制火焰。</summary>
    [Persist] public Sync<int> ReachUp = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> ReachDown = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> ReachLeft = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> ReachRight = new(Scope.Room, Authority.Server);
}
