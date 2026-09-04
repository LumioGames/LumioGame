namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Ports;

/// <summary>
/// 确定性随机源端口（design.md §16 Gate 0「同 Seed 可重放」）。同一 Seed 派生的调用序列必须
/// 逐次产出相同结果；实现不得读取系统时钟、GUID 或其他不可重放的熵源。
/// </summary>
public interface IBomberRandom
{
    int NextInt(int minInclusive, int maxExclusive);

    /// <summary>[0.0, 1.0) 半开区间；用于掉落率等按千分比整数判定时，调用方应改走 <see cref="NextInt"/> 保持 IntegerOnly 纪律。</summary>
    double NextDouble();
}
