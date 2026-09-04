using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

/// <summary>
/// 玩家权威状态（design.md §7.1/§9/§10/§12）。位置一律 milli-cell 定点（1000 = 1 格，config IntegerOnly）。
/// </summary>
[EcsComponent]
public sealed partial class BomberPlayerState : Component
{
    [Persist] public Sync<int> Hearts = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> HatCount = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> BombPower = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> BombCapacity = new(Scope.Room, Authority.Server);

    /// <summary>移速档位（整数 Tier，Config 表提供 Tier→格/秒 换算，见 G-5）。</summary>
    [Persist] public Sync<int> SpeedTier = new(Scope.Room, Authority.Server);

    [Persist] public Sync<ulong> RespawnAtTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> ProtectedUntilTick = new(Scope.Room, Authority.Server);

    [Persist] public Sync<int> CellX = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> CellY = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> PosMilliX = new(Scope.Room, Authority.Server);
    [Persist] public Sync<int> PosMilliY = new(Scope.Room, Authority.Server);
}
