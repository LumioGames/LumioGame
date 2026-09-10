using System.Diagnostics;
using System.Runtime.CompilerServices;
using Lumio.GameRuntime.Simulation.Tick;

namespace Lumio.Game.ServerGameplay.Tests;

internal static class TickClockTestFallback
{
    [ModuleInitializer]
    internal static void Install()
    {
        TickClockResolver.TestFallback = new HostTickClockForTests();
    }

    private sealed class HostTickClockForTests : ITickMonotonicClock
    {
        public ulong NowNanos()
        {
            long ticks = Stopwatch.GetTimestamp();
            return (ulong)(ticks * 1_000_000_000L / Stopwatch.Frequency);
        }
    }
}
