using System;
using System.Globalization;
using Lumio.Client.Gameplay.Session;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Client.Spectator;

// Game diagnostics decorate the existing joint seam; the delegate still owns
// admission, authority publication, retirement and all Native resources.
internal sealed class BomberTelemetryJointPrediction : IClientJointPrediction
{
    internal static readonly PredictionExecutionTelemetryOptions Bounds = new(256, 32768, 120_000_000_000, 10000);
    private static readonly object WindowGate = new();
    private static ulong _nextWindow;
    private readonly IClientJointPrediction _joint;
    private readonly Func<ulong>? _clock;
    private readonly BomberInputTrace _trace;
    private readonly Func<WorldManager, IBomberExecutionTelemetry?> _resolve;
    private readonly PredictionExecutionRecord[] _drain = new PredictionExecutionRecord[256];
    private IBomberExecutionTelemetry? _driver;
    private WeakReference<object>? _lastDriver;

    internal BomberTelemetryJointPrediction(IClientJointPrediction joint, Func<ulong>? clock, BomberInputTrace trace,
        Func<WorldManager, IBomberExecutionTelemetry?>? resolve = null)
    { _joint = joint; _clock = clock; _trace = trace; _resolve = resolve ?? Resolve; }

    private static IBomberExecutionTelemetry? Resolve(WorldManager manager) =>
        GasJointPrediction.For(manager) is { } gas ? new GasTelemetry(gas) : null;

    public bool IsAttached(WorldManager manager) => _joint.IsAttached(manager);
    public void PublishAuthorityGroup(WorldManager manager, Action apply) => _joint.PublishAuthorityGroup(manager, apply);
    public void Attach(WorldManager manager)
    {
        _joint.Attach(manager);
        try
        {
            var driver = _resolve(manager);
            if (driver is null) { _trace.ExecutionTelemetryFailure("driver-unavailable"); return; }
            if (_lastDriver is not null && _lastDriver.TryGetTarget(out var last) && ReferenceEquals(last, driver.Identity)) return;
            _driver = driver;
            _lastDriver = new(driver.Identity);
            if (_clock is null) { _trace.ExecutionTelemetryFailure("native-clock-unavailable"); return; }
            ulong window;
            lock (WindowGate) { window = checked(_nextWindow + 1); _nextWindow = window; }
            if (!driver.TryEnable(window, Bounds, _clock)) _trace.ExecutionTelemetryFailure("enable-refused");
        }
        catch { _trace.ExecutionTelemetryFailure("enable-failed"); }
    }

    // Called after the complete/fail and after-counter capture, at an idle owner
    // boundary. Draining does not erase the Runtime's cumulative status totals.
    internal void Drain()
    {
        try { _driver?.Drain(_drain); }
        catch { _trace.ExecutionTelemetryFailure("drain-failed"); }
    }

    public void Retire()
    {
        _joint.Retire();
        var driver = _driver;
        if (driver is null) return;
        try
        {
            // Delegate retirement must stop the window as Retired, before any
            // optional diagnostic operation can change its terminal reason.
            var status = driver.Status;
            int drained = driver.Drain(_drain);
            _trace.ExecutionTelemetryRetired(driver.Identity, status, drained);
            driver.Disable();
        }
        catch { _trace.ExecutionTelemetryFailure("retire-diagnostics-failed"); }
        finally { _driver = null; }
    }

    private sealed class GasTelemetry(GasJointPrediction driver) : IBomberExecutionTelemetry
    {
        public object Identity => driver;
        public bool TryEnable(ulong window, PredictionExecutionTelemetryOptions options, Func<ulong> clock) =>
            driver.TryEnableExecutionTelemetry(window, options, clock);
        public PredictionExecutionTelemetryStatus Status => driver.ExecutionTelemetryStatus;
        public int Drain(Span<PredictionExecutionRecord> records) => driver.DrainExecutionTelemetry(records);
        public void Disable() => driver.DisableExecutionTelemetry();
    }
}

// Small internal seam for ordering and failure tests; no SDK or browser export.
internal interface IBomberExecutionTelemetry
{
    object Identity { get; }
    bool TryEnable(ulong window, PredictionExecutionTelemetryOptions options, Func<ulong> clock);
    PredictionExecutionTelemetryStatus Status { get; }
    int Drain(Span<PredictionExecutionRecord> records);
    void Disable();
}

internal static class BomberExecutionTiming
{
    private static string D(ulong value) => value.ToString(CultureInfo.InvariantCulture);
    internal static ExecutionTelemetryStatusDto Snapshot(PredictionExecutionTelemetryStatus? status, string? reason = null)
    {
        if (status is not { } s) return new() { available = false, reason = reason ?? "status-unavailable" };
        if (s.WindowId == 0) return new() { available = false, reason = reason ?? "window-not-enabled" };
        return new() { available = s.WindowId != 0, reason = s.WindowId == 0 ? "window-not-enabled" : reason,
            windowId = D(s.WindowId), enabled = s.Enabled, stopReason = s.StopReason.ToString(), saturated = s.Saturated,
            recordsAttempted = D(s.RecordsAttempted), recordsWritten = D(s.RecordsWritten), recordsDropped = D(s.RecordsDropped), clockFailures = D(s.ClockFailures),
            firstAttempts = D(s.FirstAttempts), replayAttempts = D(s.ReplayAttempts), firstCompleted = D(s.FirstCompleted), replayCompleted = D(s.ReplayCompleted),
            timedFirstAttempts = D(s.TimedFirstAttempts), timedReplayAttempts = D(s.TimedReplayAttempts), firstElapsedNanos = D(s.FirstElapsedNanos), replayElapsedNanos = D(s.ReplayElapsedNanos),
            dataWaits = D(s.DataWaits), budgetWaits = D(s.BudgetWaits), correctionRetries = D(s.CorrectionRetries), faults = D(s.Faults), publications = D(s.Publications),
            executionsSincePublication = D(s.ExecutionsSincePublication), censoredOutstandingInputs = s.CensoredOutstandingInputs, bufferedRecords = s.BufferedRecords,
            reservedBytes = s.ReservedBytes.ToString(CultureInfo.InvariantCulture) };
    }
    internal static ExecutionTelemetryDeltaDto Delta(PredictionExecutionTelemetryStatus? before, PredictionExecutionTelemetryStatus? after,
        ulong firstAttempts, ulong replayAttempts)
    {
        string? reason = null;
        if (before is not { } b || after is not { } a) return new() { complete = false, reason = "status-unavailable" };
        if (b.WindowId == 0 || a.WindowId == 0) reason = "window-not-enabled";
        else if (b.WindowId != a.WindowId) reason = "window-changed";
        else if (b.Saturated || a.Saturated) reason = "counter-saturated";
        else if (b.ClockFailures != 0 || a.ClockFailures != 0) reason = "clock-failure";
        else if (!b.Enabled || !a.Enabled || b.StopReason != PredictionExecutionStopReason.None || a.StopReason != PredictionExecutionStopReason.None) reason = "window-stopped";
        else if (!Monotonic(b, a)) reason = "counter-decreased";
        else if (a.FirstAttempts - b.FirstAttempts != firstAttempts || a.ReplayAttempts - b.ReplayAttempts != replayAttempts ||
            a.TimedFirstAttempts - b.TimedFirstAttempts != firstAttempts || a.TimedReplayAttempts - b.TimedReplayAttempts != replayAttempts ||
            b.TimedFirstAttempts != b.FirstAttempts || b.TimedReplayAttempts != b.ReplayAttempts ||
            a.TimedFirstAttempts != a.FirstAttempts || a.TimedReplayAttempts != a.ReplayAttempts) reason = "attempt-coverage-incomplete";
        if (reason is not null) return new() { complete = false, reason = reason, windowId = a.WindowId == 0 ? null : D(a.WindowId) };
        return new() { complete = true, windowId = D(a.WindowId), firstAttempts = D(firstAttempts), replayAttempts = D(replayAttempts),
            timedFirstAttempts = D(a.TimedFirstAttempts - b.TimedFirstAttempts), timedReplayAttempts = D(a.TimedReplayAttempts - b.TimedReplayAttempts),
            firstElapsedNanos = D(a.FirstElapsedNanos - b.FirstElapsedNanos), replayElapsedNanos = D(a.ReplayElapsedNanos - b.ReplayElapsedNanos),
            firstCompleted = D(a.FirstCompleted - b.FirstCompleted), replayCompleted = D(a.ReplayCompleted - b.ReplayCompleted),
            dataWaits = D(a.DataWaits - b.DataWaits), budgetWaits = D(a.BudgetWaits - b.BudgetWaits), correctionRetries = D(a.CorrectionRetries - b.CorrectionRetries),
            faults = D(a.Faults - b.Faults), publications = D(a.Publications - b.Publications), recordsDropped = D(a.RecordsDropped - b.RecordsDropped) };
    }
    private static bool Monotonic(PredictionExecutionTelemetryStatus b, PredictionExecutionTelemetryStatus a) =>
        a.RecordsAttempted >= b.RecordsAttempted && a.RecordsWritten >= b.RecordsWritten && a.RecordsDropped >= b.RecordsDropped &&
        a.FirstAttempts >= b.FirstAttempts && a.ReplayAttempts >= b.ReplayAttempts && a.FirstCompleted >= b.FirstCompleted && a.ReplayCompleted >= b.ReplayCompleted &&
        a.TimedFirstAttempts >= b.TimedFirstAttempts && a.TimedReplayAttempts >= b.TimedReplayAttempts && a.FirstElapsedNanos >= b.FirstElapsedNanos && a.ReplayElapsedNanos >= b.ReplayElapsedNanos &&
        a.DataWaits >= b.DataWaits && a.BudgetWaits >= b.BudgetWaits && a.CorrectionRetries >= b.CorrectionRetries && a.Faults >= b.Faults && a.Publications >= b.Publications;
}
