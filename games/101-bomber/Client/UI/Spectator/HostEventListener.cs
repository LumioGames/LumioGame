using System;
using System.Diagnostics.Tracing;
using System.Globalization;

namespace Lumio.Bomber.Client.Spectator;

internal sealed class HostEventListener : EventListener
{
    internal const string Provider = "Lumio-GameRuntime-Gas-SelectiveRebuild";
    private readonly object _gate = new();
    private readonly PhaseRecord[] _buffer;
    private int _count;
    private ulong _observed, _dropped, _errors;
    private bool _providerSeen, _enabled, _disposed;
    private string? _lastError;
    private ulong? _hookPumpId;
    private int _hookThread;

    public HostEventListener(int capacity)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(capacity);
        _buffer = new PhaseRecord[capacity];
        // EventListener's base constructor can invoke OnEventSourceCreated before
        // derived fields exist. Enumerate again after the buffer is initialized.
        foreach (EventSource source in EventSource.GetSources()) Attach(source);
    }

    protected override void OnEventSourceCreated(EventSource eventSource)
    {
        if (_buffer is not null) Attach(eventSource);
    }

    private void Attach(EventSource source)
    {
        if (source.Name != Provider) return;
        lock (_gate)
        {
            if (_disposed) return;
            _providerSeen = true;
            try { EnableEvents(source, EventLevel.Informational, EventKeywords.None); _enabled = true; }
            catch (Exception error) { Error("enable:" + error.GetType().Name); }
        }
    }

    public void BeginHook(ulong pumpId)
    {
        lock (_gate) { if (!_disposed) { _hookPumpId = pumpId; _hookThread = Environment.CurrentManagedThreadId; } }
    }

    public void EndHook()
    {
        lock (_gate) { _hookPumpId = null; _hookThread = 0; }
    }

    protected override void OnEventWritten(EventWrittenEventArgs data)
    {
        if (_buffer is null || data.EventSource.Name != Provider) return;
        lock (_gate)
        {
            if (_disposed) return;
            if (data.EventId == 0) { Error("providerEventSourceError"); return; }
            if (data.EventId != 1) return;
            var payload = data.Payload;
            if (payload is null || payload.Count != 5 || payload[0] is not int phase || phase is < 1 or > 4 ||
                payload[1] is not long start || payload[2] is not long elapsed || elapsed < 0 ||
                payload[3] is not long frequency || frequency <= 0 || payload[4] is not bool returned)
            { Error("invalidPhasePayload"); return; }
            _observed++;
            if (_count == _buffer.Length) { _dropped++; return; }
            int thread = Environment.CurrentManagedThreadId;
            // The provider has no world/driver identity. Only synchronous events on
            // this hook's thread get a pump association; other process events stay raw.
            _buffer[_count++] = new PhaseRecord(_observed, thread == _hookThread ? _hookPumpId : null,
                thread, phase, start, elapsed, frequency, returned);
        }
    }

    private void Error(string code) { _errors++; _lastError = code; }

    public HostPhaseBatchDto Drain()
    {
        lock (_gate)
        {
            var phases = new HostPhaseDto[_count];
            for (int i = 0; i < phases.Length; i++)
            {
                PhaseRecord p = _buffer[i];
                phases[i] = new HostPhaseDto
                {
                    recordId = Text(p.Id), hookPumpId = p.Pump is ulong pump ? Text(pump) : null,
                    managedThreadId = p.Thread, phase = p.Phase, startTicks = Text(p.Start), elapsedTicks = Text(p.Elapsed),
                    frequency = Text(p.Frequency), returned = p.Returned,
                };
            }
            Array.Clear(_buffer, 0, _count);
            _count = 0;
            return new HostPhaseBatchDto
            {
                providerSeen = _providerSeen, enabled = _enabled && !_disposed, phases = phases,
                phaseRecordsObserved = Text(_observed), droppedPhaseRecords = Text(_dropped), truncated = _dropped != 0,
                errorCount = Text(_errors), lastError = _lastError, Errors = _errors,
            };
        }
    }

    public override void Dispose()
    {
        lock (_gate)
        {
            _disposed = true; _enabled = false; _hookPumpId = null; _hookThread = 0;
            Array.Clear(_buffer); _count = 0; _observed = _dropped = _errors = 0; _lastError = null;
        }
        base.Dispose();
    }

    internal static string Text(ulong value) => value.ToString(CultureInfo.InvariantCulture);
    internal static string Text(long value) => value.ToString(CultureInfo.InvariantCulture);
    private readonly record struct PhaseRecord(ulong Id, ulong? Pump, int Thread, int Phase, long Start,
        long Elapsed, long Frequency, bool Returned);
}

internal sealed class HostPhaseBatchDto
{
    public bool providerSeen { get; init; }
    public bool enabled { get; init; }
    public HostPhaseDto[] phases { get; init; } = Array.Empty<HostPhaseDto>();
    public string phaseRecordsObserved { get; init; } = "0";
    public string droppedPhaseRecords { get; init; } = "0";
    public bool truncated { get; init; }
    public string errorCount { get; init; } = "0";
    public string? lastError { get; init; }
    internal ulong Errors { get; init; }
}

internal sealed class HostPhaseDto
{
    public string recordId { get; init; } = "0";
    public string? hookPumpId { get; init; }
    public int managedThreadId { get; init; }
    public int phase { get; init; }
    public string startTicks { get; init; } = "0";
    public string elapsedTicks { get; init; } = "0";
    public string frequency { get; init; } = "0";
    public bool returned { get; init; }
}
