using System;
using System.Diagnostics;
using System.Globalization;

namespace Lumio.Bomber.Client.Spectator;

// One pending observation per traced host. Tick stores values only; the existing
// drain builds the typed JSON snapshot and consumes it only after serialization.
internal sealed class ManagedFacadeTiming
{
    private readonly Func<long>? _clock;
    private readonly Action? _beforeSnapshot;
    private bool _pending, _completed, _sessionInvoked, _postStarted;
    private ulong _ordinal, _loss, _diagnosticFailures;
    private Phase _phase;
    private long? _preStart, _preEnd, _sessionStart, _sessionEnd, _postStart, _postEnd, _previousStamp;
    private enum Phase { PreIdentity, SessionTick, PostIdentityCleanup }

    internal ManagedFacadeTiming(Func<long>? clock = null, Action? beforeSnapshot = null)
    { _clock = clock; _beforeSnapshot = beforeSnapshot; }
    internal ulong Loss => _loss;
    internal ulong DiagnosticFailures => _diagnosticFailures;
    private static void Increment(ref ulong value) { if (value < ulong.MaxValue) value++; }
    private long? Stamp()
    {
        try
        {
            long stamp = _clock is null ? Stopwatch.GetTimestamp() : _clock();
            if (_previousStamp.HasValue && stamp < _previousStamp.Value) Increment(ref _diagnosticFailures);
            _previousStamp = stamp;
            return stamp;
        }
        catch { Increment(ref _diagnosticFailures); return null; }
    }
    internal bool Begin()
    {
        if (_pending) { Increment(ref _loss); return false; }
        _pending = true;
        if (_ordinal == ulong.MaxValue) Increment(ref _diagnosticFailures);
        else _ordinal++;
        _completed = _sessionInvoked = _postStarted = false;
        _preEnd = _sessionStart = _sessionEnd = _postStart = _postEnd = _previousStamp = null;
        _phase = Phase.PreIdentity;
        _preStart = Stamp();
        return true;
    }
    internal void Session(bool invoked)
    {
        _preEnd = Stamp();
        _sessionInvoked = invoked;
        if (invoked) { _sessionStart = _preEnd; _phase = Phase.SessionTick; }
    }
    internal void Post()
    {
        long? stamp = Stamp();
        if (_sessionInvoked) _sessionEnd = stamp;
        _postStarted = true; _postStart = stamp; _phase = Phase.PostIdentityCleanup;
    }
    internal void Complete() { _postEnd = Stamp(); _completed = true; }
    internal void Fail()
    {
        long? stamp = Stamp();
        switch (_phase)
        {
            case Phase.PreIdentity: _preEnd = stamp; break;
            case Phase.SessionTick: _sessionEnd = stamp; break;
            case Phase.PostIdentityCleanup: _postEnd = stamp; break;
        }
    }
    private static string? Decimal(long? value) => value?.ToString(CultureInfo.InvariantCulture);
    private static FacadePhaseTimingDto Span(long? start, long? end) =>
        new() { startedStamp = Decimal(start), endedStamp = Decimal(end) };
    internal FacadeTickTimingDto? Peek()
    {
        if (!_pending) return null;
        try
        {
            _beforeSnapshot?.Invoke();
            return new FacadeTickTimingDto {
                ordinal = _ordinal.ToString(CultureInfo.InvariantCulture), completed = _completed,
                sessionInvoked = _sessionInvoked,
                failedPhase = _completed ? null : _phase switch {
                    Phase.PreIdentity => "preIdentity", Phase.SessionTick => "sessionTick", _ => "postIdentityCleanup" },
                preIdentity = Span(_preStart, _preEnd),
                sessionTick = _sessionInvoked ? Span(_sessionStart, _sessionEnd) : null,
                postIdentityCleanup = _postStarted ? Span(_postStart, _postEnd) : null };
        }
        catch { Increment(ref _diagnosticFailures); return null; }
    }
    internal void Consume() => _pending = false;
}
