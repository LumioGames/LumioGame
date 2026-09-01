using System;
using System.Diagnostics;

namespace Lumio.Game.ServerGameplay;

/// <summary>Process-local monotonic clock for the five-minute reconnect window.</summary>
public interface IHostMonotonicClock
{
    /// <summary>Milliseconds since this clock's origin.</summary>
    long Milliseconds { get; }

    /// <summary>Advances the clock. Production uses a real monotonic source; tests inject delays.</summary>
    void Advance(TimeSpan delta);
}

/// <summary>Default host clock based on <see cref="Environment.TickCount64"/>.</summary>
public sealed class SystemMonotonicClock : IHostMonotonicClock
{
    private readonly long _origin = Stopwatch.GetTimestamp();
    private long _offset;

    /// <inheritdoc />
    public long Milliseconds =>
        ((Stopwatch.GetTimestamp() - _origin) * 1000 / Stopwatch.Frequency) + _offset;

    /// <inheritdoc />
    public void Advance(TimeSpan delta) => _offset += (long)delta.TotalMilliseconds;
}
