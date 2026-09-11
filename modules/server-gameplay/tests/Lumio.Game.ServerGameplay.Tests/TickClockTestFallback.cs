using System;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.CompilerServices;
using Lumio.GameRuntime.Simulation.Tick;

namespace Lumio.Game.ServerGameplay.Tests;

internal static class TickClockTestFallback
{
    [ModuleInitializer]
    internal static void Install()
    {
        var clock = new HostTickClockForTests();
        MethodInfo? install = typeof(TickClockResolver).GetMethod(
            "InstallTestFallback",
            BindingFlags.NonPublic | BindingFlags.Static);
        if (install is not null)
        {
            install.Invoke(null, new object[] { clock });
            return;
        }

        PropertyInfo? property = typeof(TickClockResolver).GetProperty(
            "TestFallback",
            BindingFlags.Public | BindingFlags.Static);
        if (property?.SetMethod is not null)
        {
            property.SetValue(null, clock);
            return;
        }

        throw new InvalidOperationException("TickClockResolver has no test-fallback injection point.");
    }

    private sealed class HostTickClockForTests : ITickMonotonicClock
    {
        public ulong NowNanos()
        {
            ulong t = (ulong)Stopwatch.GetTimestamp();
            ulong f = (ulong)Stopwatch.Frequency;
            return (ulong)((UInt128)t * 1_000_000_000UL / f);
        }
    }
}
