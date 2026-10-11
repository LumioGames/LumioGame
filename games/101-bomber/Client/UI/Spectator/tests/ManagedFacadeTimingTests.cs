using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using Lumio.Client.Gameplay.ECS;
using Lumio.Client.Gameplay.GAS;
using Lumio.Client.Gameplay.Session;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class ManagedFacadeTimingTests
{
    private static JsonDocument Drain(SpectatorReplicaHost host) => JsonDocument.Parse(host.DrainInputTrace());
    private static JsonElement Timing(JsonDocument document)
    {
        Assert.True(document.RootElement.TryGetProperty("facadeTiming", out var timing), "actual source-generated batch is missing façade timing");
        Assert.Equal(JsonValueKind.Object, timing.ValueKind);
        return timing;
    }

    [Fact]
    public void ActualTickKeepsOriginalCallOrderAndSourceGeneratedRawThreeSpans()
    {
        var stamps = new Queue<long>([9007199254740993, 9007199254741013, 9007199254741063, 9007199254741093]);
        int reads = 0;
        var recorder = new ManagedFacadeTiming(() => { reads++; return stamps.Dequeue(); });
        var session = new SessionProbe();
        var host = new SpectatorReplicaHost(session, new BomberPlayerStepOptions(true), new BomberInputTrace(recorder));
        host.Tick();
        Assert.Equal(["snapshot", "prediction", "snapshot", "replica", "snapshot", "tick:1", "snapshot", "replica", "snapshot", "snapshot", "snapshot", "prediction"], session.Calls);
        Assert.Equal(4, reads);
        using var document = Drain(host); var timing = Timing(document);
        Assert.True(timing.GetProperty("completed").GetBoolean());
        Assert.True(timing.GetProperty("sessionInvoked").GetBoolean());
        Assert.Equal("9007199254740993", timing.GetProperty("preIdentity").GetProperty("startedStamp").GetString());
        Assert.Equal("9007199254741013", timing.GetProperty("preIdentity").GetProperty("endedStamp").GetString());
        Assert.Equal("9007199254741063", timing.GetProperty("sessionTick").GetProperty("endedStamp").GetString());
        Assert.Equal("9007199254741093", timing.GetProperty("postIdentityCleanup").GetProperty("endedStamp").GetString());
        Assert.Equal("Stopwatch.GetTimestamp/unanchored-to-performance.now", document.RootElement.GetProperty("clockDomain").GetString());
        Assert.Equal(Stopwatch.Frequency.ToString(CultureInfo.InvariantCulture), document.RootElement.GetProperty("clockFrequency").GetString());
        using var empty = Drain(host); Assert.Equal(JsonValueKind.Null, empty.RootElement.GetProperty("facadeTiming").ValueKind);
    }

    [Theory]
    [InlineData("preIdentity")]
    [InlineData("sessionTick")]
    [InlineData("postIdentityCleanup")]
    public void OriginalTickExceptionIsRetainedWithOnlyActualStartedSpans(string phase)
    {
        long stamp = 100;
        var session = new SessionProbe { FailurePhase = phase };
        int clockPhase = 0;
        var host = new SpectatorReplicaHost(session, new BomberPlayerStepOptions(true), new BomberInputTrace(new ManagedFacadeTiming(() => {
            session.Phase = ++clockPhase switch { 1 => "preIdentity", 2 => "sessionTick", 3 => "postIdentityCleanup", _ => "observer" };
            return stamp += 10;
        })));
        var caught = Assert.Throws<InvalidOperationException>(host.Tick);
        Assert.Same(session.Error, caught);
        Assert.Contains(session.Error.Message, host.LastApplyError, StringComparison.Ordinal);
        using var document = Drain(host); var timing = Timing(document);
        Assert.False(timing.GetProperty("completed").GetBoolean());
        Assert.Equal(phase, timing.GetProperty("failedPhase").GetString());
        Assert.NotNull(timing.GetProperty(phase).GetProperty("endedStamp").GetString());
        if (phase == "preIdentity") Assert.Equal(JsonValueKind.Null, timing.GetProperty("sessionTick").ValueKind);
        if (phase != "postIdentityCleanup") Assert.Equal(JsonValueKind.Null, timing.GetProperty("postIdentityCleanup").ValueKind);
        Assert.Equal(phase == "preIdentity" ? 0 : 1, session.TickCalls);
    }

    [Fact]
    public void DisabledGateAddsNoObserverClockOrSnapshotWork()
    {
        int clocks = 0, snapshots = 0;
        var recorder = new ManagedFacadeTiming(() => { clocks++; throw new InvalidOperationException("disabled clock"); }, () => snapshots++);
        var session = new SessionProbe();
        var host = new SpectatorReplicaHost(session, new BomberPlayerStepOptions(), new BomberInputTrace(recorder));
        host.Tick(); using var document = Drain(host);
        Assert.Equal(0, clocks); Assert.Equal(0, snapshots); Assert.Equal(1, session.TickCalls);
        Assert.Equal(["snapshot", "replica", "snapshot", "tick:1", "snapshot", "replica", "snapshot", "snapshot"], session.Calls);
        Assert.False(document.RootElement.GetProperty("enabled").GetBoolean());
        Assert.False(document.RootElement.TryGetProperty("facadeTiming", out _));
    }

    [Fact]
    public void DisposedSessionRemainsSkippedAndItsSpanIsNull()
    {
        long stamp = 100;
        var session = new SessionProbe { Disposed = true };
        var host = new SpectatorReplicaHost(session, new BomberPlayerStepOptions(true), new BomberInputTrace(new ManagedFacadeTiming(() => stamp += 10)));
        host.Tick(); using var document = Drain(host); var timing = Timing(document);
        Assert.Equal(0, session.TickCalls); Assert.Equal(7, session.Calls.Count);
        Assert.False(timing.GetProperty("sessionInvoked").GetBoolean());
        Assert.Equal(JsonValueKind.Null, timing.GetProperty("sessionTick").ValueKind);
        Assert.True(timing.GetProperty("completed").GetBoolean());
    }

    [Fact]
    public void PendingOneKeepsFirstAndLaterFailureOnlyIncrementsVisibleLoss()
    {
        long stamp = 100;
        var session = new SessionProbe();
        var host = new SpectatorReplicaHost(session, new BomberPlayerStepOptions(true), new BomberInputTrace(new ManagedFacadeTiming(() => stamp += 10)));
        host.Tick(); session.FailurePhase = "sessionTick";
        Assert.Same(session.Error, Assert.Throws<InvalidOperationException>(host.Tick));
        using var document = Drain(host); var timing = Timing(document);
        Assert.Equal("1", timing.GetProperty("ordinal").GetString()); Assert.True(timing.GetProperty("completed").GetBoolean());
        Assert.Equal("1", document.RootElement.GetProperty("facadeTimingLoss").GetString());
        Assert.False(document.RootElement.GetProperty("complete").GetBoolean());
    }

    [Fact]
    public void ClockFailureIsVisibleAndCannotFaultTickOrFabricateAStamp()
    {
        int reads = 0;
        var session = new SessionProbe();
        var host = new SpectatorReplicaHost(session, new BomberPlayerStepOptions(true), new BomberInputTrace(new ManagedFacadeTiming(() =>
        { if (++reads == 1) throw new InvalidOperationException("diagnostic clock"); return reads * 10; })));
        host.Tick(); using var document = Drain(host); var timing = Timing(document);
        Assert.Equal(1, session.TickCalls); Assert.True(timing.GetProperty("completed").GetBoolean());
        Assert.Equal(JsonValueKind.Null, timing.GetProperty("preIdentity").GetProperty("startedStamp").ValueKind);
        Assert.Equal("1", document.RootElement.GetProperty("facadeTimingDiagnosticFailures").GetString());
        Assert.False(document.RootElement.GetProperty("complete").GetBoolean());
    }

    [Fact]
    public void SnapshotStorageFailureKeepsPendingAndCannotReplaceTheOriginalTickException()
    {
        int snapshots = 0; long stamp = 100;
        var session = new SessionProbe { FailurePhase = "sessionTick" };
        var host = new SpectatorReplicaHost(session, new BomberPlayerStepOptions(true), new BomberInputTrace(new ManagedFacadeTiming(() => stamp += 10,
          () => { if (++snapshots == 1) throw new InvalidOperationException("diagnostic snapshot"); })));
        Assert.Same(session.Error, Assert.Throws<InvalidOperationException>(host.Tick));
        using var first = Drain(host);
        Assert.Equal(JsonValueKind.Null, first.RootElement.GetProperty("facadeTiming").ValueKind);
        Assert.Equal("1", first.RootElement.GetProperty("facadeTimingDiagnosticFailures").GetString());
        using var second = Drain(host); Assert.Equal("sessionTick", Timing(second).GetProperty("failedPhase").GetString());
    }

    [Fact]
    public void ActualSelectedNativeHostAndExistingCloseDrainRetainBoundedTiming()
    {
        using var owner = new BrowserSessionOwner(stepOptions: new BomberPlayerStepOptions(true));
        owner.Authorize(); _ = owner.Host.DrainInputTrace();
        owner.Host.Tick(); using var active = Drain(owner.Host); var timing = Timing(active);
        Assert.True(timing.GetProperty("sessionInvoked").GetBoolean());
        Assert.NotNull(timing.GetProperty("sessionTick").GetProperty("startedStamp").GetString());
        Assert.NotNull(timing.GetProperty("sessionTick").GetProperty("endedStamp").GetString());
        string path = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")!;
        var module = Process.GetCurrentProcess().Modules.Cast<ProcessModule>().Single(row =>
            string.Equals(Path.GetFullPath(row.FileName), Path.GetFullPath(path), StringComparison.OrdinalIgnoreCase));
        string specimen = JsonSerializer.Serialize(new { pid = Environment.ProcessId,
            startUtc = Process.GetCurrentProcess().StartTime.ToUniversalTime().ToString("O"), native = module.FileName,
            nativeSha256 = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(module.FileName))),
            facadeAssembly = typeof(SpectatorReplicaHost).Assembly.Location, facadeMvid = typeof(SpectatorReplicaHost).Module.ModuleVersionId,
            clockDomain = active.RootElement.GetProperty("clockDomain").GetString(), clockFrequency = active.RootElement.GetProperty("clockFrequency").GetString() });
        string evidence = Environment.GetEnvironmentVariable("MOVEMENT_NATIVE_EVIDENCE_PATH")!;
        File.WriteAllText(Path.Combine(evidence, "managed-facade-loaded-01.json"), specimen);
        Console.WriteLine("MANAGED_FACADE_NATIVE_SPECIMEN=" + specimen);
        owner.Dispose(); using var closed = Drain(owner.Host); Assert.Equal(JsonValueKind.Object, Timing(closed).ValueKind);
    }


    [Fact]
    public void PendingOrdinalReadsTheAcceptedObservationWithoutAdditionalClockCalls()
    {
        int clocks = 0; var recorder = new ManagedFacadeTiming(() => ++clocks);
        var property = typeof(ManagedFacadeTiming).GetProperty("PendingOrdinal", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
        Assert.NotNull(property); Assert.Null(property.GetValue(recorder));
        Assert.True(recorder.Begin()); Assert.Equal(1UL, property.GetValue(recorder));
        Assert.False(recorder.Begin()); Assert.Equal(1UL, property.GetValue(recorder));
        Assert.Equal(1, clocks); recorder.Consume(); Assert.Null(property.GetValue(recorder));
        Assert.Equal(1, clocks);
    }
    private sealed class SessionProbe : IClientSession
    {
        internal List<string> Calls { get; } = [];
        internal string? FailurePhase { get; set; }
        internal bool Disposed { get; init; }
        internal int TickCalls { get; private set; }
        internal readonly InvalidOperationException Error = new("original façade Tick error");
        internal string Phase { get; set; } = "observer";
        public ClientSessionSnapshot GetSnapshot()
        {
            Calls.Add("snapshot");
            if (FailurePhase == Phase && Phase is "preIdentity" or "postIdentityCleanup") throw Error;
            return new(ClientSessionState.Active, 1, false, 0, false, false, false, 0, 0, 0, 0, 0, 0, [], isDisposed: Disposed);
        }
        public SessionTickResult Tick(in ClientOwnerTick tick) { Calls.Add("tick:1"); TickCalls++; if (FailurePhase == "sessionTick") throw Error; return default; }
        public bool TryGetReplicaWorld(out IReplicaWorld world) { Calls.Add("replica"); world = null!; return false; }
        public SessionCommandResult RequestConnect(in SessionConnectRequest request, CancellationToken cancellationToken) => default;
        public SessionCommandResult Login(in SessionConnectRequest request, CancellationToken cancellationToken) => default;
        public SessionCommandResult RequestClose(in SessionCloseRequest request) => default;
        public bool TryDequeueSuperseded(out SessionSupersededNotice notice) { notice = default; return false; }
        public bool TryGetPrediction(out IClientPrediction prediction) { Calls.Add("prediction"); prediction = null!; return false; }
        public bool TryUpdateOwnerPresentation(out OwnerPresentationPose pose) { pose = default; return false; }
        public void Dispose() { }
    }
}
