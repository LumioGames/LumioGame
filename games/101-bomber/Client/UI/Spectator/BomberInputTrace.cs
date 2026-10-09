using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Client.Gameplay.Input;
using Lumio.Client.Network.Connection;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Client.Spectator;

/// <summary>Optional bounded observations of real step requests and accepted transport bytes.</summary>
internal sealed class BomberInputTrace
{
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

    internal string Lifetime => _lifetime;
    internal ulong EventLoss => _eventLoss;
    internal ulong PendingLoss => _pendingLoss;
    internal ulong Unmatched => _unmatched;
    internal bool Complete => _eventLoss == 0 && _pendingLoss == 0 && _unmatched == 0 && _diagnosticFailures == 0;

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
            var batch = new InputTraceBatchDto { version = 1, enabled = true, hostLifetime = _lifetime,
                clockDomain = "Stopwatch.GetTimestamp/unanchored-to-performance.now",
                clockFrequency = Decimal(checked((ulong)Stopwatch.Frequency)), complete = Complete,
                eventLoss = Decimal(_eventLoss), pendingLoss = Decimal(_pendingLoss),
                unmatched = Decimal(_unmatched), diagnosticFailures = Decimal(_diagnosticFailures),
                pending = _pending.Count,
                traceOverflow = _eventLoss == 0 && _pendingLoss == 0 ? null : new InputTraceEventDto {
                    k = "trace-overflow", stamp = Stamp(), reason = _eventLoss > 0 ? "event-ring" : "pending-capacity" },
                events = _events.ToList() };
            string json = JsonSerializer.Serialize(batch, SpectatorJsonContext.Default.InputTraceBatchDto);
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
