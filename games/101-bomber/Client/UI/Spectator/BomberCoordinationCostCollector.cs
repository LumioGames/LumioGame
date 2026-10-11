using System;
using System.Collections.Generic;
using System.Diagnostics.Tracing;
using System.Globalization;
using System.Reflection;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Client.Spectator;

// Game-private one-shot observation. Event callbacks copy bounded scalar values;
// they never inspect a World or read a clock. The owning browser Host serializes
// and consumes records outside Session.Tick, after successful trace serialization.
internal sealed class BomberCoordinationCostCollector : EventListener
{
    internal const int RecordLimit = 256;
    private const string ProviderName = "Lumio-GameRuntime-Gas-SelectiveRebuild";
    private readonly string _lifetime;
    private readonly Assembly _gasAssembly;
    private readonly Sample[] _records = new Sample[RecordLimit];
    private EventSource? _source;
    private bool _ready, _closed, _disposed, _inPump, _inSession, _multipleWindows, _dirty = true, _incomplete;
    private int _count, _total, _pumpStart;
    private ulong _dropped, _failures;
    private ulong? _pumpOrdinal;
    private long? _windowId;
    private string? _driver, _captureSession, _capturePrediction, _captureManager, _captureWorld, _reason = "provider-unavailable";
    private string? _providerName, _assemblyName, _mvid, _mvidReason;
    private Sample? _stopped;

    internal BomberCoordinationCostCollector(string lifetime)
    {
        _lifetime = lifetime;
        _gasAssembly = typeof(GasJointPrediction).Assembly;
        _ready = true;
        try { foreach (var source in EventSource.GetSources()) Match(source); }
        catch (Exception) { DiagnosticFailure("capture-init-failed"); }
    }
    internal string StartResult => _closed ? _reason ?? "capture-failed" : _source is null ? "provider-unavailable" : "started";
    private static void Increment(ref ulong value) { if (value < ulong.MaxValue) value++; }
    private static string Decimal(long value) => value.ToString(CultureInfo.InvariantCulture);
    private static string Decimal(ulong value) => value.ToString(CultureInfo.InvariantCulture);
    private void Closed(string reason) { _closed = true; _reason = reason; _dirty = true; }
    private void DiagnosticFailure(string reason) { Increment(ref _failures); Closed(reason); }
    protected override void OnEventSourceCreated(EventSource source) { if (_ready) Match(source); }
    private void Match(EventSource source)
    {
        if (_closed || _source is not null || source.Name != ProviderName || source.GetType().Assembly != _gasAssembly) return;
        try
        {
            if (source.IsEnabled(EventLevel.Informational, (EventKeywords)2)) { DiagnosticFailure("provider-conflict"); return; }
            _source = source; _providerName = source.Name; _assemblyName = _gasAssembly.FullName;
            try { _mvid = _gasAssembly.ManifestModule.ModuleVersionId.ToString("D"); }
            catch (Exception) { _mvidReason = "mvid-unavailable"; }
            _reason = null;
            EnableEvents(source, EventLevel.Informational, (EventKeywords)2,
                new Dictionary<string, string?> { ["coordination-record-limit"] = "256", ["coordination-window-ms"] = "5000" });
        }
        catch (Exception) { DiagnosticFailure("provider-enable-failed"); }
    }
    protected override void OnEventWritten(EventWrittenEventArgs data)
    {
        if (!_ready || !ReferenceEquals(data.EventSource, _source)) return;
        try
        {
            if (data.EventId == 0) { DiagnosticFailure("provider-write-failed"); return; }
            if (data.EventId is not 2 and not 3 || (data.Keywords & (EventKeywords)2) == 0) return;
            if (data.Payload is null || !TryReadPayload(data.EventId, data.Payload, out var sample))
            { DiagnosticFailure("payload-invalid"); return; }
            Store(sample);
        }
        catch (Exception) { DiagnosticFailure("callback-failed"); }
    }
    internal struct Sample
    {
        internal int EventId;
        internal long WindowId, Ordinal;
        internal long StartedTicks;
        internal long ElapsedTicks;
        internal long Frequency;
        internal bool Returned;
        internal bool MeasurementValid;
        internal int InputsBefore;
        internal int InputsAfter;
        internal int LocationsBefore;
        internal int LocationsAfter;
        internal string StopReason;
        internal long ClassifiedTicks;
        internal long UnclassifiedTicks;
        internal long BeginCoverageTicks;
        internal long AuthorityRefreshTicks;
        internal long WitnessTicks;
        internal long RemoveAffectedTicks;
        internal long ExecuteAffectedTicks;
        internal long FinalProjectTicks;
        internal long PublicationTicks;
        internal int ProjectCalls;
        internal long ProjectLocations;
        internal long ProjectTicks;
        internal int TrimCalls;
        internal long TrimScans;
        internal int TrimRemoved;
        internal long TrimTicks;
        internal long AuthorityScanned;
        internal int AuthorityCopied;
        internal int ComponentsCaptured;
        internal long FieldsCaptured;
        internal long AccountIndexScanned;
        internal ulong? FacadeOrdinal;
        internal bool InSession, BindingAvailable;
        internal string? BindingReason, SessionGeneration, PredictionGeneration, ManagerId, WorldInstance, DriverId;
    }
    internal static bool TryReadPayload(int id, IReadOnlyList<object?> payload, out Sample sample)
    {
        sample = default;
        if (id == 3)
        {
            if (payload.Count != 3 || payload[0] is not long window || payload[1] is not long stoppedOrdinal || payload[2] is not string reason) return false;
            sample = new Sample { EventId = 3, WindowId = window, Ordinal = stoppedOrdinal, StopReason = reason };
            return true;
        }
        if (id != 2 || payload.Count != 33
            || payload[0] is not long windowId
            || payload[1] is not long ordinal
            || payload[2] is not long startedTicks
            || payload[3] is not long elapsedTicks
            || payload[4] is not long frequency
            || payload[5] is not bool returned
            || payload[6] is not bool measurementValid
            || payload[7] is not int inputsBefore
            || payload[8] is not int inputsAfter
            || payload[9] is not int locationsBefore
            || payload[10] is not int locationsAfter
            || payload[11] is not string stopReason
            || payload[12] is not long classifiedTicks
            || payload[13] is not long unclassifiedTicks
            || payload[14] is not long beginCoverageTicks
            || payload[15] is not long authorityRefreshTicks
            || payload[16] is not long witnessTicks
            || payload[17] is not long removeAffectedTicks
            || payload[18] is not long executeAffectedTicks
            || payload[19] is not long finalProjectTicks
            || payload[20] is not long publicationTicks
            || payload[21] is not int projectCalls
            || payload[22] is not long projectLocations
            || payload[23] is not long projectTicks
            || payload[24] is not int trimCalls
            || payload[25] is not long trimScans
            || payload[26] is not int trimRemoved
            || payload[27] is not long trimTicks
            || payload[28] is not long authorityScanned
            || payload[29] is not int authorityCopied
            || payload[30] is not int componentsCaptured
            || payload[31] is not long fieldsCaptured
            || payload[32] is not long accountIndexScanned) return false;
        sample = new Sample { EventId = 2, WindowId = windowId, Ordinal = ordinal, StartedTicks = startedTicks, ElapsedTicks = elapsedTicks, Frequency = frequency, Returned = returned, MeasurementValid = measurementValid, InputsBefore = inputsBefore, InputsAfter = inputsAfter, LocationsBefore = locationsBefore, LocationsAfter = locationsAfter, StopReason = stopReason, ClassifiedTicks = classifiedTicks, UnclassifiedTicks = unclassifiedTicks, BeginCoverageTicks = beginCoverageTicks, AuthorityRefreshTicks = authorityRefreshTicks, WitnessTicks = witnessTicks, RemoveAffectedTicks = removeAffectedTicks, ExecuteAffectedTicks = executeAffectedTicks, FinalProjectTicks = finalProjectTicks, PublicationTicks = publicationTicks, ProjectCalls = projectCalls, ProjectLocations = projectLocations, ProjectTicks = projectTicks, TrimCalls = trimCalls, TrimScans = trimScans, TrimRemoved = trimRemoved, TrimTicks = trimTicks, AuthorityScanned = authorityScanned, AuthorityCopied = authorityCopied, ComponentsCaptured = componentsCaptured, FieldsCaptured = fieldsCaptured, AccountIndexScanned = accountIndexScanned };
        return true;
    }
    internal void Store(Sample sample)
    {
        _dirty = true;
        if (_closed) { Increment(ref _dropped); return; }
        sample.FacadeOrdinal = _inPump ? _pumpOrdinal : null;
        sample.InSession = _inPump && _inSession;
        _incomplete |= !sample.InSession;
        sample.BindingReason = sample.InSession ? "work-unavailable" : "outside-session";
        if (_windowId is null) _windowId = sample.WindowId;
        else if (_windowId != sample.WindowId) _multipleWindows = true;
        if (sample.EventId == 3)
        {
            if (_stopped.HasValue) Increment(ref _dropped);
            else _stopped = sample;
            Closed(sample.StopReason);
        }
        else
        {
            if (_total == RecordLimit) { Increment(ref _dropped); Closed("collector-record-limit"); return; }
            _records[_count++] = sample; _total++;
            if (sample.StopReason != "None") Closed(sample.StopReason);
        }
    }
    internal void BeginPump(ulong? ordinal)
    { _pumpStart = _count; _pumpOrdinal = ordinal; _inPump = true; _inSession = false; }
    internal void EnterSession() => _inSession = _inPump;
    internal void LeaveSession() => _inSession = false;
    internal void EndPump(WorkCounterSnapshotDto? before, WorkCounterSnapshotDto? after, string? workReason, bool invoked)
    {
        if (!_inPump) return;
        string? reason = !invoked ? "session-not-invoked" : _pumpOrdinal is null ? "facade-not-accepted" : workReason;
        bool identityChanged = before is not null && after is not null &&
            (Different(before.driverId, after.driverId) || Different(before.managerId, after.managerId) ||
             Different(before.worldInstance, after.worldInstance) || Different(before.sessionGeneration, after.sessionGeneration) ||
             Different(before.predictionGeneration, after.predictionGeneration));
        if (reason is null && (before?.driverId is null || before.managerId is null || before.worldInstance is null ||
            before.sessionGeneration is null || before.predictionGeneration is null || after?.driverId is null ||
            after.managerId is null || after.worldInstance is null || after.sessionGeneration is null || after.predictionGeneration is null))
            reason = "work-identity-unavailable";
        if (reason is null && _driver is not null && (Different(_driver, before!.driverId) ||
            Different(_captureSession, before.sessionGeneration) || Different(_capturePrediction, before.predictionGeneration) ||
            Different(_captureManager, before.managerId) || Different(_captureWorld, before.worldInstance))) identityChanged = true;
        if (identityChanged) reason = "identity-changed";
        if (_multipleWindows) reason = "multiple-drivers";
        for (int i = _pumpStart; i < _count; i++) Bind(ref _records[i], before, reason);
        if (_stopped is { } stop && stop.FacadeOrdinal == _pumpOrdinal) { Bind(ref stop, before, reason); _stopped = stop; }
        _inPump = _inSession = false;
        if (identityChanged || _multipleWindows) Closed(_multipleWindows ? "multiple-drivers" : "identity-changed");
        if (_closed) DisableOwnedSource();
    }
    private static bool Different(string? left, string? right) => left is not null && right is not null && left != right;
    private void Bind(ref Sample row, WorkCounterSnapshotDto? before, string? reason)
    {
        row.BindingReason = row.InSession ? reason : "outside-session";
        row.BindingAvailable = row.BindingReason is null;
        _incomplete |= !row.BindingAvailable || (row.EventId == 2 && !row.MeasurementValid);
        if (row.BindingAvailable)
        {
            row.SessionGeneration = before!.sessionGeneration; row.PredictionGeneration = before.predictionGeneration;
            row.ManagerId = before.managerId; row.WorldInstance = before.worldInstance; row.DriverId = before.driverId;
            _driver = before.driverId; _captureSession = before.sessionGeneration; _capturePrediction = before.predictionGeneration;
            _captureManager = before.managerId; _captureWorld = before.worldInstance;
        }
    }
    private void DisableOwnedSource()
    {
        if (_disposed) return;
        try { if (_source is not null) DisableEvents(_source); }
        catch (Exception) { Increment(ref _failures); _reason = "provider-disable-failed"; }
        finally { _disposed = true; try { base.Dispose(); } catch (Exception) { Increment(ref _failures); _reason = "listener-dispose-failed"; } }
    }
    internal void Stop(string reason) { if (!_closed) Closed(reason); DisableOwnedSource(); }
    public override void Dispose() => Stop("host-disposed");
    internal CoordinationCostBatchDto? Peek()
    {
        if (!_dirty) return null;
        var rows = new List<CoordinationCostRecordDto>(_count);
        bool allAvailable = true;
        for (int i = 0; i < _count; i++)
        {
            Sample sample = _records[i]; allAvailable &= sample.BindingAvailable && sample.MeasurementValid;
            double? elapsed = sample.MeasurementValid && sample.Frequency > 0 && sample.ElapsedTicks >= 0
                ? 1000d * sample.ElapsedTicks / sample.Frequency : null;
            rows.Add(new CoordinationCostRecordDto {
                windowId = Decimal(sample.WindowId),
                ordinal = Decimal(sample.Ordinal),
                startedTicks = Decimal(sample.StartedTicks),
                elapsedTicks = Decimal(sample.ElapsedTicks),
                frequency = Decimal(sample.Frequency),
                returned = sample.Returned,
                measurementValid = sample.MeasurementValid,
                inputsBefore = sample.InputsBefore,
                inputsAfter = sample.InputsAfter,
                locationsBefore = sample.LocationsBefore,
                locationsAfter = sample.LocationsAfter,
                stopReason = sample.StopReason,
                classifiedTicks = Decimal(sample.ClassifiedTicks),
                unclassifiedTicks = Decimal(sample.UnclassifiedTicks),
                beginCoverageTicks = Decimal(sample.BeginCoverageTicks),
                authorityRefreshTicks = Decimal(sample.AuthorityRefreshTicks),
                witnessTicks = Decimal(sample.WitnessTicks),
                removeAffectedTicks = Decimal(sample.RemoveAffectedTicks),
                executeAffectedTicks = Decimal(sample.ExecuteAffectedTicks),
                finalProjectTicks = Decimal(sample.FinalProjectTicks),
                publicationTicks = Decimal(sample.PublicationTicks),
                projectCalls = sample.ProjectCalls,
                projectLocations = Decimal(sample.ProjectLocations),
                projectTicks = Decimal(sample.ProjectTicks),
                trimCalls = sample.TrimCalls,
                trimScans = Decimal(sample.TrimScans),
                trimRemoved = sample.TrimRemoved,
                trimTicks = Decimal(sample.TrimTicks),
                authorityScanned = Decimal(sample.AuthorityScanned),
                authorityCopied = sample.AuthorityCopied,
                componentsCaptured = sample.ComponentsCaptured,
                fieldsCaptured = Decimal(sample.FieldsCaptured),
                accountIndexScanned = Decimal(sample.AccountIndexScanned),
                facadeOrdinal = sample.FacadeOrdinal?.ToString(CultureInfo.InvariantCulture),
                bindingAvailable = sample.BindingAvailable, bindingReason = sample.BindingReason,
                sessionGeneration = sample.SessionGeneration, predictionGeneration = sample.PredictionGeneration,
                managerId = sample.ManagerId, worldInstance = sample.WorldInstance, driverId = sample.DriverId,
                elapsedMs = elapsed });
        }
        return new CoordinationCostBatchDto {
            hostLifetime = _lifetime, closed = _closed, complete = _source is not null && _dropped == 0 && _failures == 0 && !_incomplete && allAvailable,
            reason = _reason, providerName = _providerName, assemblyName = _assemblyName, assemblyMvid = _mvid, assemblyMvidReason = _mvidReason,
            dropped = Decimal(_dropped), diagnosticFailures = Decimal(_failures), records = rows,
            stopped = _stopped is { } stop ? new CoordinationCostStopDto {
                windowId = Decimal(stop.WindowId), ordinal = Decimal(stop.Ordinal), stopReason = stop.StopReason,
                facadeOrdinal = stop.FacadeOrdinal?.ToString(CultureInfo.InvariantCulture), bindingAvailable = stop.BindingAvailable,
                bindingReason = stop.BindingReason, sessionGeneration = stop.SessionGeneration, predictionGeneration = stop.PredictionGeneration,
                managerId = stop.ManagerId, worldInstance = stop.WorldInstance, driverId = stop.DriverId } : null };
    }
    internal void Consume()
    {
        Array.Clear(_records, 0, _count); _count = 0; _pumpStart = 0; _stopped = null; _dirty = false;
    }
}
