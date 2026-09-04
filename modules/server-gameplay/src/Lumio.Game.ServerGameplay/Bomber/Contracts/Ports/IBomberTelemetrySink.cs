namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Ports;

/// <summary>
/// 遥测落地端口（design.md §17；G-7 实现 JSONL Sink）。Emit 不得阻塞模拟线程——
/// 实现必须缓冲/批刷，见 G-7 卡「不得在 Simulation Thread 同步 I/O」。
/// </summary>
public interface IBomberTelemetrySink
{
    void Emit(string eventName, ulong tick, string payloadJson);
}
