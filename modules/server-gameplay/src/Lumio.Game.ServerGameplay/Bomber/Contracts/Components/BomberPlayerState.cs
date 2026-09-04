using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

/// <summary>
/// 玩家权威状态（design.md §7.1/§9/§10/§12）。位置一律 milli-cell 定点（1000 = 1 格，config IntegerOnly）。
/// 坐标三维（ADR 0016）：Stage 0a 实体恒 Z=0，地形另分 z=-1 地面层 / z=0 砖层。
/// 血量单位是半心点（ADR 0017）：满血 6 点 = 3 颗心，表现层 hearts = floor(HealthPoints / 2)。
/// </summary>
[EcsComponent]
public sealed partial class BomberPlayerState : Component
{
    /// <summary>半心点，0..maxHealthPoints（默认 6）。整颗心 = healthPointsPerHeart（默认 2）点。</summary>
    [Persist] public Sync<int> HealthPoints = new(Scope.Room, Authority.Server);

    [Persist] public Sync<int> HatCount = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> BombPower = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> BombCapacity = new(Scope.Room, Authority.Server);

    /// <summary>移速档位（整数 Tier，Config 表提供 Tier→格/秒 换算，见 G-5）。</summary>
    [Persist] public Sync<int> SpeedTier = new(Scope.Room, Authority.Server);

    [Persist] public Sync<ulong> RespawnAtTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> ProtectedUntilTick = new(Scope.Room, Authority.Server);

    [Persist] public Sync<int> CellX = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellY = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellZ = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> PosMilliX = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> PosMilliY = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> PosMilliZ = new(Scope.Room, Authority.Server);
}
