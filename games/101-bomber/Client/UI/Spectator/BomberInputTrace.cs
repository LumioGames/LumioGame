using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Client.Gameplay.Input;
using Lumio.Client.Gameplay.GAS;
using Lumio.Client.Gameplay.Session;
using Lumio.Client.Network.Connection;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Client.Spectator;

/// <summary>Optional bounded observations of real step requests and accepted transport bytes.</summary>
internal sealed class BomberInputTrace
{
    internal BomberInputTrace(ManagedFacadeTiming? facadeTiming = null, Func<InputTraceBatchDto, string>? serialize = null)
    { FacadeTiming = facadeTiming ?? new ManagedFacadeTiming(); _serialize = serialize; }
    internal ManagedFacadeTiming FacadeTiming { get; }
    private readonly Func<InputTraceBatchDto, string>? _serialize;
    internal const int EventCapacity = 1024;
    internal const int PendingCapacity = 256;
    private readonly Queue<InputTraceEventDto> _events = new();
    private readonly Dictionary<string, (string SampleId, string SessionGeneration, LinkedListNode<string> Node)> _pending = new(StringComparer.Ordinal);
    private readonly LinkedList<string> _pendingOrder = new();
    private readonly HashSet<string> _retiredKeys = new(StringComparer.Ordinal);
    private readonly string _lifetime = Guid.NewGuid().ToString("N");
    private ulong _nextSample;
    private ulong _nextManager;
    private ulong _eventLoss;
    private ulong _pendingLoss;
    private ulong _unmatched;
    private ulong _diagnosticFailures;
    private object? _activeManager;
    private ulong _activeSession;
    private bool _hasEverStepRequest;
    private bool _unsafeReuse;
    private WorkCounterPair? _workCounters;
    private WeakReference<object>? _workManager, _workDriver, _workPrediction;
    private ulong _workManagerId, _workDriverId, _workPredictionId;

    internal string Lifetime => _lifetime;
    internal ulong EventLoss => _eventLoss;
    internal ulong PendingLoss => _pendingLoss;
    internal ulong Unmatched => _unmatched;
    internal bool Complete => _eventLoss == 0 && _pendingLoss == 0 && _unmatched == 0 && _diagnosticFailures == 0 &&
        FacadeTiming.Loss == 0 && FacadeTiming.DiagnosticFailures == 0;

    private static string Decimal(ulong value) => value.ToString(CultureInfo.InvariantCulture);
    private static void Increment(ref ulong value) { if (value < ulong.MaxValue) value++; }
    private static string Key(string sender, ulong generation, ulong sequence) =>
        sender + ":" + Decimal(generation) + ":" + Decimal(sequence);
    private static string Stamp() => Stopwatch.GetTimestamp().ToString(CultureInfo.InvariantCulture);

    private void Add(InputTraceEventDto record)
    {
        if (_events.Count == EventCapacity) { _events.Dequeue(); Increment(ref _eventLoss); }
        _events.Enqueue(record);
    }

    internal void Failure()
    {
        Increment(ref _diagnosticFailures);
    }

    internal sealed class WorkCounterSample
    {
        internal long? StartedStamp, EndedStamp;
        internal ClientSessionSnapshot? Session;
        internal IClientPrediction? Prediction;
        internal PredictionSnapshot? PredictionState;
        internal WorldManager? Manager;
        internal World? World;
        internal ulong? WorldInstance;
        internal GasJointPrediction? Driver;
        internal GasJointPredictionMetrics? Metrics;
        internal int? OutstandingCount;
        internal long? RetainedBytes;
        internal bool? Suspended, Retired, Faulted;
        internal string? UnavailableReason;
    }
    private sealed record WorkCounterPair(WorkCounterSnapshotDto Before, WorkCounterSnapshotDto After,
        WorkCounterDeltaDto? Delta, string? Reason, bool SessionInvoked, string Stamp)
    {
        internal bool Queued;
    }

    // Session.GetSnapshot also copies its resource ledger. These observations are
    // deliberately outside the façade spans, and have their own raw clock stamps.
    internal WorkCounterSample? CaptureWorkCounters(IClientSession session)
    {
        try { return _workCounters is null ? CaptureWorkSample(session) : null; }
        catch { Failure(); return null; }
    }
    private WorkCounterSample CaptureWorkSample(IClientSession session)
    {
        var sample = new WorkCounterSample();
        try
        {
            sample.StartedStamp = Stopwatch.GetTimestamp();
            var state = session.GetSnapshot(); sample.Session = state;
            if (state.IsDisposed || state.State == ClientSessionState.Faulted) { sample.UnavailableReason = "session-unavailable"; return sample; }
            if (!session.TryGetPrediction(out var prediction)) { sample.UnavailableReason = "prediction-unavailable"; return sample; }
            sample.Prediction = prediction; sample.PredictionState = prediction.GetSnapshot();
            if (!session.TryGetReplicaWorld(out var replica)) { sample.UnavailableReason = "replica-unavailable"; return sample; }
            sample.Manager = replica.Manager; sample.World = sample.Manager.World;
            sample.WorldInstance = sample.World.InstanceId;
            var driver = GasJointPrediction.For(sample.Manager); sample.Driver = driver;
            if (driver is null) { sample.UnavailableReason = "driver-unavailable"; return sample; }
            sample.OutstandingCount = driver.OutstandingCount; sample.RetainedBytes = driver.RetainedBytes;
            sample.Suspended = driver.Suspended; sample.Retired = driver.Retired; sample.Faulted = driver.Faulted;
            sample.Metrics = driver.Metrics;
            if (driver.Retired || driver.Faulted) sample.UnavailableReason = "driver-unavailable";
        }
        catch { Failure(); sample.UnavailableReason = "capture-failed"; }
        finally { sample.EndedStamp = Stopwatch.GetTimestamp(); }
        return sample;
    }
    internal void FinishWorkCounters(WorkCounterSample? before, IClientSession session, bool sessionInvoked)
    {
        try
        {
            if (_workCounters is not null) return;
            var after = CaptureWorkSample(session);
            before ??= new() { UnavailableReason = "before-unavailable" };
            string? reason = WorkUnavailable(before, after, sessionInvoked);
            // References live only for this Tick's identity comparison. Pending
            // observations contain scalar DTOs, even while Drain is delayed.
            _workCounters = new(WorkSnapshot(before), WorkSnapshot(after), reason is null ? WorkDelta(before, after) : null,
                reason, sessionInvoked, after.EndedStamp?.ToString(CultureInfo.InvariantCulture) ?? Stamp());
        }
        catch { Failure(); }
    }
    private static string? WorkIdentity(object? current, ref WeakReference<object>? previous, ref ulong id)
    {
        if (current is null) return null;
        if (previous is null || !previous.TryGetTarget(out var target) || !ReferenceEquals(current, target))
        { id = checked(id + 1); previous = new(current); }
        return Decimal(id);
    }
    private WorkCounterSnapshotDto WorkSnapshot(WorkCounterSample sample)
    {
        var session = sample.Session; var prediction = sample.PredictionState; var metrics = sample.Metrics;
        return new() {
            captureStartedStamp = sample.StartedStamp?.ToString(CultureInfo.InvariantCulture),
            captureEndedStamp = sample.EndedStamp?.ToString(CultureInfo.InvariantCulture), unavailableReason = sample.UnavailableReason,
            sessionGeneration = session?.Generation.ToString(CultureInfo.InvariantCulture), ownerTick = session?.OwnerTick.ToString(CultureInfo.InvariantCulture),
            state = session?.State.ToString().ToLowerInvariant(), disposed = session?.IsDisposed,
            predictionGeneration = prediction?.Generation.ToString(CultureInfo.InvariantCulture),
            predictionId = WorkIdentity(sample.Prediction, ref _workPrediction, ref _workPredictionId),
            managerId = WorkIdentity(sample.Manager, ref _workManager, ref _workManagerId), worldInstance = sample.WorldInstance?.ToString(CultureInfo.InvariantCulture),
            driverId = WorkIdentity(sample.Driver, ref _workDriver, ref _workDriverId),
            lastAssignedSeq = prediction?.LastAssignedSeq.ToString(CultureInfo.InvariantCulture), confirmedSeq = prediction?.ConfirmedSeq.ToString(CultureInfo.InvariantCulture),
            historyCount = prediction?.HistoryCount, windowCapacity = prediction?.WindowCapacity, highWatermark = prediction?.HighWatermark, frozen = prediction?.Frozen,
            openAuthorityGroups = session?.OpenAuthorityGroups, heldSections = session?.HeldSections,
            replicaStageCalls = session?.ReplicaStageCalls, predictionAuthorityStageCalls = session?.PredictionAuthorityStageCalls,
            runtimeAuthorityCalls = session?.RuntimeAuthorityCalls, outstandingCount = sample.OutstandingCount,
            retainedBytes = sample.RetainedBytes?.ToString(CultureInfo.InvariantCulture), suspended = sample.Suspended, retired = sample.Retired, faulted = sample.Faulted,
            inputExecutions = metrics?.InputExecutions.ToString(CultureInfo.InvariantCulture), replays = metrics?.Replays.ToString(CultureInfo.InvariantCulture),
            nativeStageAttempts = metrics?.NativeStageAttempts.ToString(CultureInfo.InvariantCulture), nativeCoveredReleases = metrics?.NativeCoveredReleases.ToString(CultureInfo.InvariantCulture) };
    }
    private static string? WorkUnavailable(WorkCounterSample before, WorkCounterSample after, bool sessionInvoked)
    {
        if (!sessionInvoked) return "session-not-invoked";
        if (before.UnavailableReason == "capture-failed" || after.UnavailableReason == "capture-failed") return "capture-failed";
        if (before.Session?.Generation != after.Session?.Generation ||
            before.PredictionState?.Generation != after.PredictionState?.Generation ||
            !ReferenceEquals(before.Prediction, after.Prediction) || !ReferenceEquals(before.Manager, after.Manager) ||
            !ReferenceEquals(before.World, after.World) || before.WorldInstance != after.WorldInstance ||
            !ReferenceEquals(before.Driver, after.Driver)) return "identity-changed";
        if (before.UnavailableReason is { } reason) return reason;
        if (after.UnavailableReason is { } afterReason) return afterReason;
        var bs = before.Session!.Value; var ps = after.Session!.Value;
        var bp = before.PredictionState!.Value; var ap = after.PredictionState!.Value;
        var bm = before.Metrics!.Value; var am = after.Metrics!.Value;
        if (bs.ReplicaStageCalls < 0 || bs.PredictionAuthorityStageCalls < 0 || bs.RuntimeAuthorityCalls < 0 ||
            ps.ReplicaStageCalls < bs.ReplicaStageCalls || ps.PredictionAuthorityStageCalls < bs.PredictionAuthorityStageCalls || ps.RuntimeAuthorityCalls < bs.RuntimeAuthorityCalls ||
            ap.LastAssignedSeq < bp.LastAssignedSeq || ap.ConfirmedSeq < bp.ConfirmedSeq || ap.HighWatermark < bp.HighWatermark ||
            am.InputExecutions < bm.InputExecutions || am.Replays < bm.Replays || am.NativeStageAttempts < bm.NativeStageAttempts ||
            am.NativeCoveredReleases < bm.NativeCoveredReleases) return "counter-decreased";
        if (bm.Replays > bm.InputExecutions || am.Replays > am.InputExecutions ||
            am.Replays - bm.Replays > am.InputExecutions - bm.InputExecutions) return "counter-inconsistent";
        if (before.StartedStamp is not { } bStart || before.EndedStamp is not { } bEnd ||
            after.StartedStamp is not { } aStart || after.EndedStamp is not { } aEnd) return "clock-unavailable";
        if (bEnd < bStart || aStart < bEnd || aEnd < aStart) return "clock-regressed";
        return null;
    }
    private static WorkCounterDeltaDto WorkDelta(WorkCounterSample before, WorkCounterSample after)
    {
        var bs = before.Session!.Value; var ps = after.Session!.Value;
        var bp = before.PredictionState!.Value; var ap = after.PredictionState!.Value;
        var bm = before.Metrics!.Value; var am = after.Metrics!.Value;
        ulong executions = am.InputExecutions - bm.InputExecutions, replays = am.Replays - bm.Replays;
        return new() { lastAssignedSeq = Decimal(ap.LastAssignedSeq - bp.LastAssignedSeq), confirmedSeq = Decimal(ap.ConfirmedSeq - bp.ConfirmedSeq),
            replicaStageCalls = ps.ReplicaStageCalls - bs.ReplicaStageCalls, predictionAuthorityStageCalls = ps.PredictionAuthorityStageCalls - bs.PredictionAuthorityStageCalls,
            runtimeAuthorityCalls = ps.RuntimeAuthorityCalls - bs.RuntimeAuthorityCalls, inputExecutions = Decimal(executions), replays = Decimal(replays),
            firstAttempts = Decimal(executions - replays), nativeStageAttempts = Decimal(am.NativeStageAttempts - bm.NativeStageAttempts),
            nativeCoveredReleases = Decimal(am.NativeCoveredReleases - bm.NativeCoveredReleases) };
    }
    private void QueueWorkCounters(FacadeTickTimingDto? timing)
    {
        if (timing is null || _workCounters is not { Queued: false } pair) return;
        Add(new() { k = "work-counters", stamp = pair.Stamp,
            workCounters = new() { facadeOrdinal = timing.ordinal, available = pair.Reason is null, reason = pair.Reason,
                sessionInvoked = pair.SessionInvoked, before = pair.Before, after = pair.After, delta = pair.Delta } });
        pair.Queued = true;
    }

    internal string? Sample(object manager, ulong sessionGeneration, ulong bindingGeneration,
        string self, ulong matchId, ulong ordinal, int primary, int secondary, bool turn,
        int bombPress, int bombRelease, bool skill)
    {
        try
        {
            if (_nextSample == ulong.MaxValue) { Failure(); return null; }
            bool newManager = !ReferenceEquals(_activeManager, manager);
            if (newManager || _activeSession != sessionGeneration)
            {
                if (_activeManager is not null && _pending.Count != 0) RetirePending(reason: "session-retired");
                _activeManager = manager;
                _activeSession = sessionGeneration;
            }
            if (newManager)
            {
                if (_nextManager == ulong.MaxValue) { Failure(); return null; }
                _nextManager++;
            }
            string id = Decimal(++_nextSample);
            Add(new InputTraceEventDto { k = "sample", stamp = Stamp(), sampleId = id,
                managerId = Decimal(_nextManager), sessionGeneration = Decimal(sessionGeneration),
                bindingGeneration = Decimal(bindingGeneration), self = self, matchId = Decimal(matchId),
                ordinal = Decimal(ordinal), primary = primary, secondary = secondary, turn = turn,
                bombPress = bombPress, bombRelease = bombRelease, skill = skill });
            return id;
        }
        catch { Failure(); return null; }
    }

    internal void Request(string? sampleId, string ability, string sender, ulong wireGeneration,
        ulong sequence, ulong sessionGeneration)
    {
        if (sampleId is null) return;
        try
        {
            string key = Key(sender, wireGeneration, sequence);
            Add(new InputTraceEventDto { k = "request", stamp = Stamp(), sampleId = sampleId,
                ability = ability, sender = sender, wireGeneration = Decimal(wireGeneration),
                sequence = Decimal(sequence), sessionGeneration = Decimal(sessionGeneration) });
            _hasEverStepRequest = true;
            if (_unsafeReuse || _retiredKeys.Contains(key))
            {
                Increment(ref _unmatched);
                Add(new InputTraceEventDto { k = "unmatched-request", stamp = Stamp(), sampleId = sampleId,
                    sender = sender, wireGeneration = Decimal(wireGeneration), sequence = Decimal(sequence),
                    reason = _unsafeReuse ? "retired-key-capacity" : "retired-key-reused" });
                return;
            }
            if (_pending.ContainsKey(key))
            {
                Increment(ref _unmatched);
                Add(new InputTraceEventDto { k = "unmatched-request", stamp = Stamp(), sampleId = sampleId,
                    sender = sender, wireGeneration = Decimal(wireGeneration), sequence = Decimal(sequence), reason = "duplicate-key" });
                return;
            }
            while (_pending.Count >= PendingCapacity)
            {
                string oldest = _pendingOrder.First!.Value;
                _pendingOrder.RemoveFirst();
                if (!_pending.Remove(oldest)) continue;
                Increment(ref _pendingLoss);
                Add(new InputTraceEventDto { k = "trace-overflow", stamp = Stamp(), reason = "pending-capacity" });
            }
            var node = _pendingOrder.AddLast(key);
            _pending.Add(key, (sampleId, Decimal(sessionGeneration), node));
        }
        catch { Failure(); }
    }

    // Invoked only by ClientSession's observer after TrySend.Accepted. No encoded payload survives this call.
    internal void Accepted(InputCommandMessage message, ReadOnlyMemory<byte> encodedBytes)
    {
        try
        {
            string sender = message.Sender.ToHex();
            string? key = message.ConnectionGeneration is ulong generation
                ? Key(sender, generation, message.Sequence) : null;
            (string SampleId, string SessionGeneration, LinkedListNode<string> Node) request = default;
            bool matched = key is not null && _pending.Remove(key, out request);
            if (matched) _pendingOrder.Remove(request.Node!);
            bool outsideStepScope = !matched && !_hasEverStepRequest;
            if (!matched && !outsideStepScope) Increment(ref _unmatched);
            Add(new InputTraceEventDto { k = outsideStepScope ? "outside-step-accepted" : "accepted",
                stamp = Stamp(), sampleId = matched ? request.SampleId : null,
                sender = sender, wireGeneration = message.ConnectionGeneration?.ToString(CultureInfo.InvariantCulture),
                sequence = Decimal(message.Sequence), commandCount = message.Commands.Count,
                mappingId = message.MappingId.ToString(),
                commandMappingIds = message.Commands.Select(command => command.MappingId.ToString()).ToArray(),
                encodedLength = encodedBytes.Length, encodedSha256 = Convert.ToHexString(SHA256.HashData(encodedBytes.Span)).ToLowerInvariant(),
                reason = matched ? null : outsideStepScope ? "before-first-step-request" : "no-matching-request" });
        }
        catch { Failure(); }
    }

    internal void IntentOverflow(string reason)
    {
        try { Add(new InputTraceEventDto { k = "intent-overflow", stamp = Stamp(), reason = reason }); }
        catch { Failure(); }
    }

    internal void RetirePending(string reason = "host-closed", bool newSession = false)
    {
        try
        {
            foreach (var (key, request) in _pending)
            {
                Increment(ref _unmatched);
                Add(new InputTraceEventDto { k = "unmatched-request", stamp = Stamp(), sampleId = request.SampleId,
                    reason = reason });
                if (_retiredKeys.Count < PendingCapacity) _retiredKeys.Add(key);
                else { _unsafeReuse = true; Increment(ref _pendingLoss); }
            }
            _pending.Clear(); _pendingOrder.Clear();
            if (newSession) Add(new InputTraceEventDto { k = "session-boundary", stamp = Stamp() });
        }
        catch { Failure(); }
    }

    internal string Drain()
    {
        try
        {
            var facadeTiming = FacadeTiming.Peek();
            // A failed serialization can leave the event queued. A later failed
            // Peek must retain it with its timing rather than split the batch.
            if (facadeTiming is null && _workCounters is { Queued: true })
                throw new InvalidOperationException("Pending work counters require their accepted façade timing.");
            QueueWorkCounters(facadeTiming);
            var batch = new InputTraceBatchDto { version = 1, enabled = true, hostLifetime = _lifetime,
                clockDomain = "Stopwatch.GetTimestamp/unanchored-to-performance.now",
                clockFrequency = Decimal(checked((ulong)Stopwatch.Frequency)), complete = Complete,
                eventLoss = Decimal(_eventLoss), pendingLoss = Decimal(_pendingLoss),
                unmatched = Decimal(_unmatched), diagnosticFailures = Decimal(_diagnosticFailures),
                facadeTiming = facadeTiming, facadeTimingLoss = Decimal(FacadeTiming.Loss),
                facadeTimingDiagnosticFailures = Decimal(FacadeTiming.DiagnosticFailures),
                pending = _pending.Count,
                traceOverflow = _eventLoss == 0 && _pendingLoss == 0 ? null : new InputTraceEventDto {
                    k = "trace-overflow", stamp = Stamp(), reason = _eventLoss > 0 ? "event-ring" : "pending-capacity" },
                events = _events.ToList() };
            string json = _serialize is null ? JsonSerializer.Serialize(batch, SpectatorJsonContext.Default.InputTraceBatchDto) : _serialize(batch);
            if (facadeTiming is not null) { FacadeTiming.Consume(); _workCounters = null; }
            _events.Clear();
            return json;
        }
        catch
        {
            Failure();
            return "{\"version\":1,\"enabled\":true,\"complete\":false,\"events\":[],\"diagnosticFailure\":true}";
        }
    }

    internal static string DisabledBatch => "{\"version\":1,\"enabled\":false,\"complete\":true,\"events\":[]}";
}
