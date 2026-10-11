using System.Globalization;
using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class GasClockObserverCostTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void PreBootDiagnosticClockSelectionPreservesActualNativeWork(bool disabled)
    {
        const string key = "Lumio.Bomber.DisableGasExecutionClock";
        AppContext.TryGetSwitch(key, out bool previous);
        AppContext.SetSwitch(key, disabled);
        int clockCalls = 0;
        try
        {
            MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, _) =>
            {
                var gas = Assert.IsType<GasJointPrediction>(GasJointPrediction.For(owner.Host.World!.Manager));
                using var setup = JsonDocument.Parse(owner.Host.DrainInputTrace());
                ulong before = gas.Metrics.InputExecutions;
                byte[] input = owner.TakeInput(() => owner.Host.SendMove((int)BomberDirection.Right, 0, false));
                Assert.NotEmpty(input);
                owner.PumpUntil(() => gas.Metrics.InputExecutions > before);
                owner.Host.Tick();
                using var json = JsonDocument.Parse(owner.Host.DrainInputTrace());
                var root = json.RootElement;
                var row = Assert.Single(root.GetProperty("events").EnumerateArray(),
                    e => e.GetProperty("k").GetString() == "work-counters");
                var pair = row.GetProperty("workCounters");
                Assert.True(pair.GetProperty("available").GetBoolean());
                Assert.Equal(root.GetProperty("facadeTiming").GetProperty("ordinal").GetString(),
                    pair.GetProperty("facadeOrdinal").GetString());
                Assert.Equal(gas.Metrics.InputExecutions.ToString(CultureInfo.InvariantCulture),
                    pair.GetProperty("after").GetProperty("inputExecutions").GetString());
                Assert.Equal("0", root.GetProperty("diagnosticFailures").GetString());
                bool existingComplete = new[] { "eventLoss", "pendingLoss", "unmatched", "facadeTimingLoss", "facadeTimingDiagnosticFailures" }
                    .All(name => root.GetProperty(name).GetString() == "0");
                Assert.Equal(existingComplete, root.GetProperty("complete").GetBoolean());
                Console.WriteLine($"GAS_CLOCK_OBSERVER_ACTUAL_NATIVE disabled={disabled} clockCalls={clockCalls} executions={gas.Metrics.InputExecutions} replays={gas.Metrics.Replays}");
                var status = pair.GetProperty("after").GetProperty("executionTelemetry");
                if (disabled)
                {
                    Assert.Equal(0, clockCalls);
                    Assert.False(status.GetProperty("available").GetBoolean());
                    Assert.Equal("window-not-enabled", status.GetProperty("reason").GetString());
                    Assert.Equal(JsonValueKind.Null, status.GetProperty("firstElapsedNanos").ValueKind);
                    var delta = pair.GetProperty("delta").GetProperty("executionTelemetry");
                    Assert.False(delta.GetProperty("complete").GetBoolean());
                    Assert.Equal("window-not-enabled", delta.GetProperty("reason").GetString());
                    Assert.Equal(JsonValueKind.Null, delta.GetProperty("firstElapsedNanos").ValueKind);
                }
                else
                {
                    Assert.True(clockCalls > 0);
                    Assert.True(status.GetProperty("available").GetBoolean());
                    Assert.NotEqual("0", status.GetProperty("windowId").GetString());
                    Assert.True(gas.ExecutionTelemetryStatus.TimedFirstAttempts > 0);
                }
            }, stepOptions: new BomberPlayerStepOptions(true), executionClockObserver: () => clockCalls++);
        }
        finally { AppContext.SetSwitch(key, previous); }
    }
}
