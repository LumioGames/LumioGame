namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Commands;

/// <summary>
/// 客户端 → 服务器意图，Game 内部 DTO（design.md §6/§6.1）。网络包络由 C-1 在架构源登记；
/// Stage 0a 的 Bot/回放场景直接构造这些值，不经网络。
/// </summary>
public readonly record struct MoveIntent(int DirX, int DirY)
{
    /// <summary>DirX/DirY 各自只能是 -1/0/1（八向）；越界值由调用方在构造前校验，本类型不做隐式钳制。</summary>
    public static MoveIntent Zero { get; } = new(0, 0);
}

/// <summary>放弹意图，无参数——落点由服务器按 §6.1「炸弹总是落在最近的合法格中心」计算。</summary>
public readonly record struct PlaceBombIntent;
