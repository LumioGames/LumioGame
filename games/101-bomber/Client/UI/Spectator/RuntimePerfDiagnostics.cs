using System;
using Lumio.Client.Gameplay.Session;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using static Lumio.Bomber.Client.Spectator.HostEventListener;

namespace Lumio.Bomber.Client.Spectator;

internal sealed class RuntimePerfDiagnostics : IDisposable
{
    private readonly HostEventListener? _listener;
    private Endpoint? _before;
    private IClientSession? _beginSession, _lastSession;
    private WorldManager? _lastManager;
    private GasJointPrediction? _lastDriver;
    private ulong _sessionId, _managerId, _driverId, _pumpId, _errors, _droppedPumps;
    private RuntimePerfPumpDto? _pump;
    private string? _lastError;
    private bool _disposed, _active;

    public RuntimePerfDiagnostics(int capacity)
    {
        try { _listener = new HostEventListener(capacity); }
        catch (Exception error) { Error("listenerCreate", error); }
    }

    public void BeginPump(IClientSession session)
    {
        if (_disposed) return;
        if (_pump is not null || _active) _droppedPumps++;
        _pump = null; _active = true; _beginSession = session; _pumpId++;
        _listener?.BeginHook(_pumpId);
        _before = Capture(session);
    }

    public void EndPump(IClientSession session, Exception? primary)
    {
        if (_disposed) return;
        _listener?.EndHook();
        if (!_active) { Error("endWithoutBegin", null); return; }
        _active = false;
        Endpoint? after = Capture(session);
        string? reason = null;
        RuntimePerfDeltaDto? deltas = null;
        if (!ReferenceEquals(_beginSession, session) || (_before is not null && after is not null &&
            (_before.Session.Generation != after.Session.Generation || !ReferenceEquals(_before.Manager, after.Manager) ||
             !ReferenceEquals(_before.Driver, after.Driver) || _before.Dto.worldInstanceId != after.Dto.worldInstanceId ||
             _before.Dto.clockGeneration != after.Dto.clockGeneration))) reason = "lifecycleChanged";
        else if (_before is null || after is null) reason = "snapshotUnavailable";
        else if (_before.Manager is null || _before.Driver is null || after.Manager is null || after.Driver is null)
            reason = "managerOrDriverUnavailable";
        else if (CountersDecreased(_before, after)) reason = "counterReset";
        else deltas = Delta(_before, after);
        _pump = new RuntimePerfPumpDto
        {
            hookPumpId = Text(_pumpId), before = _before?.Dto, after = after?.Dto, deltas = deltas,
            deltaUnavailableReason = reason, primaryExceptionType = primary?.GetType().Name,
        };
        _before = null; _beginSession = null;
    }

    private Endpoint? Capture(IClientSession session)
    {
        try
        {
            if (!ReferenceEquals(session, _lastSession)) { _lastSession = session; _sessionId++; }
            ClientSessionSnapshot snapshot = session.GetSnapshot();
            WorldManager? manager = null;
            GasJointPrediction? driver = null;
            try
            {
                manager = !snapshot.IsDisposed && session.TryGetReplicaWorld(out var world) ? world.Manager : null;
                driver = manager is null ? null : GasJointPrediction.For(manager);
            }
            catch (Exception error) { manager = null; driver = null; Error("runtimeSnapshot", error); }
            if (!ReferenceEquals(manager, _lastManager)) { _lastManager = manager; if (manager is not null) _managerId++; }
            if (!ReferenceEquals(driver, _lastDriver)) { _lastDriver = driver; if (driver is not null) _driverId++; }
            GasJointPredictionMetrics metrics = driver?.Metrics ?? default;
            return new Endpoint(snapshot, manager, driver, metrics, new RuntimePerfEndpointDto
            {
                sessionInstanceId = Text(_sessionId), sessionGeneration = Text(snapshot.Generation), ownerTick = Text(snapshot.OwnerTick),
                replicaStageCalls = Text(snapshot.ReplicaStageCalls), runtimeAuthorityCalls = Text(snapshot.RuntimeAuthorityCalls),
                predictionAuthorityStageCalls = Text(snapshot.PredictionAuthorityStageCalls), openAuthorityGroups = Text(snapshot.OpenAuthorityGroups),
                heldSections = Text(snapshot.HeldSections), voxelBaselineReady = snapshot.VoxelBaselineReady,
                sessionState = snapshot.State.ToString(), disposed = snapshot.IsDisposed,
                managerInstanceId = manager is null ? null : Text(_managerId), worldInstanceId = manager is null ? null : Text(manager.World.InstanceId),
                driverInstanceId = driver is null ? null : Text(_driverId), clockEnabled = manager?.ClientPredictionClockEnabled,
                clockGeneration = manager is null ? null : Text(manager.ClientPredictionClockGeneration),
                elapsedStep = manager is null ? null : Text(manager.ClientPredictionElapsedStep),
                gas = driver is null ? null : new RuntimePerfGasDto
                {
                    inputExecutions = Text(metrics.InputExecutions), replays = Text(metrics.Replays), nativeStageAttempts = Text(metrics.NativeStageAttempts),
                    nativeCorrectionCalls = Text(metrics.NativeCorrectionCalls), nativeDiscardedRecords = Text(metrics.NativeDiscardedRecords),
                    nativeCoveredReleases = Text(metrics.NativeCoveredReleases), nativeTraceVisits = Text(metrics.NativeTraceVisits),
                    retainedBytes = Text(metrics.RetainedBytes), outstandingCount = Text(driver.OutstandingCount),
                    suspended = driver.Suspended, faulted = driver.Faulted, retired = driver.Retired,
                },
            });
        }
        catch (Exception error) { Error("snapshot", error); return null; }
    }

    private static bool CountersDecreased(Endpoint a, Endpoint b) =>
        b.Session.OwnerTick < a.Session.OwnerTick || b.Session.ReplicaStageCalls < a.Session.ReplicaStageCalls ||
        b.Session.RuntimeAuthorityCalls < a.Session.RuntimeAuthorityCalls || b.Session.PredictionAuthorityStageCalls < a.Session.PredictionAuthorityStageCalls ||
        b.Metrics.InputExecutions < a.Metrics.InputExecutions || b.Metrics.Replays < a.Metrics.Replays ||
        b.Metrics.NativeStageAttempts < a.Metrics.NativeStageAttempts || b.Metrics.NativeCorrectionCalls < a.Metrics.NativeCorrectionCalls ||
        b.Metrics.NativeDiscardedRecords < a.Metrics.NativeDiscardedRecords || b.Metrics.NativeCoveredReleases < a.Metrics.NativeCoveredReleases ||
        b.Metrics.NativeTraceVisits < a.Metrics.NativeTraceVisits;

    private static RuntimePerfDeltaDto Delta(Endpoint a, Endpoint b) => new()
    {
        ownerTick = Text(b.Session.OwnerTick - a.Session.OwnerTick), replicaStageCalls = Text((long)b.Session.ReplicaStageCalls - a.Session.ReplicaStageCalls),
        runtimeAuthorityCalls = Text((long)b.Session.RuntimeAuthorityCalls - a.Session.RuntimeAuthorityCalls),
        predictionAuthorityStageCalls = Text((long)b.Session.PredictionAuthorityStageCalls - a.Session.PredictionAuthorityStageCalls),
        inputExecutions = Text(b.Metrics.InputExecutions - a.Metrics.InputExecutions), replays = Text(b.Metrics.Replays - a.Metrics.Replays),
        nativeStageAttempts = Text(b.Metrics.NativeStageAttempts - a.Metrics.NativeStageAttempts),
        nativeCorrectionCalls = Text(b.Metrics.NativeCorrectionCalls - a.Metrics.NativeCorrectionCalls),
        nativeDiscardedRecords = Text(b.Metrics.NativeDiscardedRecords - a.Metrics.NativeDiscardedRecords),
        nativeCoveredReleases = Text(b.Metrics.NativeCoveredReleases - a.Metrics.NativeCoveredReleases),
        nativeTraceVisits = Text(b.Metrics.NativeTraceVisits - a.Metrics.NativeTraceVisits),
    };

    private void Error(string stage, Exception? error) { _errors++; _lastError = stage + ":" + (error?.GetType().Name ?? "invalidState"); }

    public RuntimePerfObservationDto Drain()
    {
        HostPhaseBatchDto phase = _listener?.Drain() ?? new HostPhaseBatchDto();
        var pump = _pump;
        _pump = null;
        bool available = !_disposed && phase.providerSeen && phase.enabled && _errors == 0 && phase.Errors == 0 && phase.phases.Length != 0;
        return new RuntimePerfObservationDto
        {
            diagnosticEnabled = !_disposed, available = available, countersAvailable = pump?.before is not null && pump.after is not null,
            availabilityReason = available ? null : _disposed ? "disabled" : _errors != 0 || phase.Errors != 0 ? "diagnosticError" :
                !phase.providerSeen ? "providerNotSeen" : !phase.enabled ? "providerNotEnabled" : "noPhaseEventsInThisDrain",
            providerSeen = phase.providerSeen, enabled = phase.enabled, phases = phase.phases, phaseRecordsObserved = phase.phaseRecordsObserved,
            droppedPhaseRecords = phase.droppedPhaseRecords, droppedPumpObservations = Text(_droppedPumps), truncated = phase.truncated || _droppedPumps != 0,
            errorCount = Text(_errors + phase.Errors), collectorErrorCount = Text(_errors), providerErrorCount = phase.errorCount,
            lastError = _lastError ?? phase.lastError, pump = pump,
        };
    }

    public void Dispose()
    {
        _disposed = true; _active = false; _before = null; _beginSession = _lastSession = null; _lastManager = null; _lastDriver = null;
        _pump = null; _pumpId = _sessionId = _managerId = _driverId = _errors = _droppedPumps = 0; _lastError = null;
        _listener?.Dispose();
    }

    private sealed record Endpoint(ClientSessionSnapshot Session, WorldManager? Manager, GasJointPrediction? Driver,
        GasJointPredictionMetrics Metrics, RuntimePerfEndpointDto Dto);
}

internal sealed class RuntimePerfObservationDto
{
    public bool diagnosticEnabled { get; init; }
    public bool profilingOverhead => true;
    public bool matrixSample => false;
    public string phaseScope => "processLocalCompletedProviderEvents";
    public string pumpBinding => "synchronousSameManagedThreadOnly";
    public bool available { get; init; }
    public bool countersAvailable { get; init; }
    public string? availabilityReason { get; init; }
    public bool providerSeen { get; init; }
    public bool enabled { get; init; }
    public HostPhaseDto[] phases { get; init; } = Array.Empty<HostPhaseDto>();
    public string phaseRecordsObserved { get; init; } = "0";
    public string droppedPhaseRecords { get; init; } = "0";
    public string droppedPumpObservations { get; init; } = "0";
    public bool truncated { get; init; }
    public string errorCount { get; init; } = "0";
    public string collectorErrorCount { get; init; } = "0";
    public string providerErrorCount { get; init; } = "0";
    public string? lastError { get; init; }
    public RuntimePerfPumpDto? pump { get; init; }
}

internal sealed class RuntimePerfPumpDto
{
    public string hookPumpId { get; init; } = "0";
    public RuntimePerfEndpointDto? before { get; init; }
    public RuntimePerfEndpointDto? after { get; init; }
    public RuntimePerfDeltaDto? deltas { get; init; }
    public string? deltaUnavailableReason { get; init; }
    public string? primaryExceptionType { get; init; }
}

internal sealed class RuntimePerfEndpointDto
{
    public string sessionInstanceId { get; init; } = "0";
    public string sessionGeneration { get; init; } = "0";
    public string ownerTick { get; init; } = "0";
    public string replicaStageCalls { get; init; } = "0";
    public string runtimeAuthorityCalls { get; init; } = "0";
    public string predictionAuthorityStageCalls { get; init; } = "0";
    public string openAuthorityGroups { get; init; } = "0";
    public string heldSections { get; init; } = "0";
    public bool voxelBaselineReady { get; init; }
    public string sessionState { get; init; } = "";
    public bool disposed { get; init; }
    public string? managerInstanceId { get; init; }
    public string? worldInstanceId { get; init; }
    public string? driverInstanceId { get; init; }
    public bool? clockEnabled { get; init; }
    public string? clockGeneration { get; init; }
    public string? elapsedStep { get; init; }
    public RuntimePerfGasDto? gas { get; init; }
}

internal sealed class RuntimePerfGasDto
{
    public string inputExecutions { get; init; } = "0";
    public string replays { get; init; } = "0";
    public string nativeStageAttempts { get; init; } = "0";
    public string nativeCorrectionCalls { get; init; } = "0";
    public string nativeDiscardedRecords { get; init; } = "0";
    public string nativeCoveredReleases { get; init; } = "0";
    public string nativeTraceVisits { get; init; } = "0";
    public string retainedBytes { get; init; } = "0";
    public string outstandingCount { get; init; } = "0";
    public bool suspended { get; init; }
    public bool faulted { get; init; }
    public bool retired { get; init; }
}

internal sealed class RuntimePerfDeltaDto
{
    public string ownerTick { get; init; } = "0";
    public string replicaStageCalls { get; init; } = "0";
    public string runtimeAuthorityCalls { get; init; } = "0";
    public string predictionAuthorityStageCalls { get; init; } = "0";
    public string inputExecutions { get; init; } = "0";
    public string replays { get; init; } = "0";
    public string nativeStageAttempts { get; init; } = "0";
    public string nativeCorrectionCalls { get; init; } = "0";
    public string nativeDiscardedRecords { get; init; } = "0";
    public string nativeCoveredReleases { get; init; } = "0";
    public string nativeTraceVisits { get; init; } = "0";
}
