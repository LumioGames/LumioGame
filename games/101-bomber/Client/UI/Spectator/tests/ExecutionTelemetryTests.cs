using System.Text.Json;
using Lumio.Client.Gameplay.Session;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class ExecutionTelemetryTests
{
    [Fact]
    public void AttachDelegatesBeforeEnablingAndOnlyEnablesEachDriverOnce()
    {
        var calls = new List<string>(); var joint = new Joint(calls); var port = new Port(calls);
        var trace = new BomberInputTrace(); int reads = 0;
        var wrapper = new BomberTelemetryJointPrediction(joint, () => { reads++; return 1; }, trace, _ => { calls.Add("resolve"); return port; });
        wrapper.Attach(null!); wrapper.Attach(null!);
        Assert.Equal(["attach", "resolve", "enable", "attach", "resolve"], calls);
        Assert.Equal(0, reads); Assert.Equal(1, port.Enables); Assert.True(port.Window != 0);
        Assert.Equal(new PredictionExecutionTelemetryOptions(256, 32768, 120_000_000_000, 10000), port.Bounds);
        var second = new Port(calls);
        var wrapper2 = new BomberTelemetryJointPrediction(joint, () => 1, trace, _ => second);
        wrapper2.Attach(null!); Assert.NotEqual(port.Window, second.Window);
        joint.Attached = true; Assert.True(wrapper.IsAttached(null!));
        int applied = 0; wrapper.PublishAuthorityGroup(null!, () => applied++); Assert.Equal(1, applied);
    }

    [Fact]
    public void DelegateFailureKeepsSameExceptionAndNeverEnablesOrReleasesDiagnostics()
    {
        var original = new InvalidOperationException("original joint error"); var calls = new List<string>();
        var joint = new Joint(calls) { AttachError = original }; var port = new Port(calls);
        var trace = new BomberInputTrace(); var wrapper = new BomberTelemetryJointPrediction(joint, () => 1, trace, _ => port);
        Assert.Same(original, Assert.Throws<InvalidOperationException>(() => wrapper.Attach(null!)));
        Assert.Equal(0, port.Enables);
        joint.AttachError = null; wrapper.Attach(null!); joint.RetireError = original;
        Assert.Same(original, Assert.Throws<InvalidOperationException>(wrapper.Retire));
        Assert.Equal(0, port.Drains); Assert.Equal(0, port.Disables);
        joint.RetireError = null; joint.OnRetire = () => port.Value = port.Value with { Enabled = false, StopReason = PredictionExecutionStopReason.Retired };
        wrapper.Retire(); Assert.Equal(1, port.Drains); Assert.Equal(1, port.Disables);
        wrapper.Drain(); Assert.Equal(1, port.Drains);
        using var json = JsonDocument.Parse(trace.Drain());
        var row = Assert.Single(json.RootElement.GetProperty("events").EnumerateArray(), x => x.GetProperty("k").GetString() == "execution-telemetry-retired");
        Assert.Equal("Retired", row.GetProperty("executionTelemetry").GetProperty("stopReason").GetString());
        Assert.Equal(256, port.DrainCapacity);
    }

    [Theory]
    [InlineData("window", "window-changed")]
    [InlineData("stopped", "window-stopped")]
    [InlineData("clock", "clock-failure")]
    [InlineData("partial", "attempt-coverage-incomplete")]
    [InlineData("rollback", "counter-decreased")]
    [InlineData("saturation", "counter-saturated")]
    public void IncompletePairsKeepNullDurationRatherThanInventZero(string change, string reason)
    {
        var before = Status(); var after = before with { FirstAttempts = 1, TimedFirstAttempts = 1, FirstElapsedNanos = 17 };
        after = change switch { "window" => after with { WindowId = 6 }, "stopped" => after with { Enabled = false, StopReason = PredictionExecutionStopReason.AttemptLimit },
            "clock" => after with { ClockFailures = 1 }, "partial" => after with { TimedFirstAttempts = 0 },
            "rollback" => after with { Publications = 0 }, _ => after with { Saturated = true } };
        var delta = BomberExecutionTiming.Delta(before, after, 1, 0);
        Assert.False(delta.complete); Assert.Equal(reason, delta.reason); Assert.Null(delta.firstElapsedNanos); Assert.Null(delta.replayElapsedNanos);
        Assert.Null(delta.firstAttempts); Assert.Null(delta.timedFirstAttempts);
    }

    [Fact]
    public void AggregateTotalsRemainCompleteWhenBoundedRecordRingDrops()
    {
        var before = Status(); var after = before with { FirstAttempts = 2, ReplayAttempts = 3, TimedFirstAttempts = 2, TimedReplayAttempts = 3,
            FirstElapsedNanos = 9007199254740993UL, ReplayElapsedNanos = 29, RecordsDropped = 500, BufferedRecords = 256 };
        var delta = BomberExecutionTiming.Delta(before, after, 2, 3);
        Assert.True(delta.complete); Assert.Equal("9007199254740993", delta.firstElapsedNanos); Assert.Equal("29", delta.replayElapsedNanos);
        Assert.Equal("500", delta.recordsDropped);
        var batch = new InputTraceBatchDto { version = 1, enabled = true, hostLifetime = "telemetry-test", clockDomain = "test", clockFrequency = "1", complete = true,
            eventLoss = "0", pendingLoss = "0", unmatched = "0", diagnosticFailures = "0", pending = 0,
            events = [new() { k = "execution-telemetry-retired", stamp = "1", executionTelemetry = BomberExecutionTiming.Snapshot(after) }] };
        string json = JsonSerializer.Serialize(batch, SpectatorJsonContext.Default.InputTraceBatchDto);
        using var doc = JsonDocument.Parse(json);
        Assert.Equal("9007199254740993", doc.RootElement.GetProperty("events")[0].GetProperty("executionTelemetry").GetProperty("firstElapsedNanos").GetString());
        Assert.False(BomberExecutionTiming.Snapshot(null).available); Assert.Null(BomberExecutionTiming.Snapshot(null).firstAttempts);
        Assert.False(BomberExecutionTiming.Snapshot(default(PredictionExecutionTelemetryStatus)).available);
        Assert.Null(BomberExecutionTiming.Snapshot(default(PredictionExecutionTelemetryStatus)).firstAttempts);
    }

    [Fact]
    public void DiagnosticFailuresNeverChangeSuccessfulJointOperationsAndDoNotRestartWindow()
    {
        var calls = new List<string>(); var joint = new Joint(calls); var port = new Port(calls) { EnableError = new("diagnostic enable") };
        var trace = new BomberInputTrace(); var wrapper = new BomberTelemetryJointPrediction(joint, () => 1, trace, _ => port);
        wrapper.Attach(null!); wrapper.Attach(null!); Assert.Equal(1, port.Enables);
        port.DrainError = new("diagnostic drain"); wrapper.Drain();
        joint.OnRetire = () => port.Value = port.Value with { Enabled = false, StopReason = PredictionExecutionStopReason.Retired };
        wrapper.Retire(); Assert.Contains("retire", calls); Assert.Equal(2, port.Drains);
        using var doc = JsonDocument.Parse(trace.Drain()); Assert.False(doc.RootElement.GetProperty("complete").GetBoolean());
        Assert.Equal("3", doc.RootElement.GetProperty("diagnosticFailures").GetString());
    }

    private static PredictionExecutionTelemetryStatus Status() => default(PredictionExecutionTelemetryStatus) with { WindowId = 5, Enabled = true, Publications = 1 };
    private sealed class Joint(List<string> calls) : IClientJointPrediction
    {
        internal bool Attached; internal InvalidOperationException? AttachError, RetireError; internal Action? OnRetire;
        public void Attach(WorldManager manager) { calls.Add("attach"); if (AttachError is { } e) throw e; }
        public bool IsAttached(WorldManager manager) => Attached;
        public void PublishAuthorityGroup(WorldManager manager, Action apply) { calls.Add("publish"); apply(); }
        public void Retire() { calls.Add("retire"); if (RetireError is { } e) throw e; OnRetire?.Invoke(); }
    }
    private sealed class Port(List<string> calls) : IBomberExecutionTelemetry
    {
        internal int Enables, Drains, Disables, DrainCapacity; internal ulong Window;
        internal PredictionExecutionTelemetryOptions Bounds;
        internal InvalidOperationException? EnableError, DrainError;
        internal PredictionExecutionTelemetryStatus Value = ExecutionTelemetryTests.Status();
        public object Identity => this;
        public bool TryEnable(ulong window, PredictionExecutionTelemetryOptions options, Func<ulong> clock)
        { calls.Add("enable"); Enables++; Window = window; Bounds = options; if (EnableError is { } e) throw e; return true; }
        public PredictionExecutionTelemetryStatus Status => Value;
        public int Drain(Span<PredictionExecutionRecord> records) { Drains++; DrainCapacity = records.Length; if (DrainError is { } e) throw e; return 0; }
        public void Disable() { Disables++; }
    }
}
