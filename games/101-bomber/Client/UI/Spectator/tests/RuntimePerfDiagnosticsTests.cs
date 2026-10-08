using System.Diagnostics.Tracing;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading;
using Lumio.Client.Gameplay.ECS;
using Lumio.Client.Gameplay.GAS;
using Lumio.Client.Gameplay.Session;
using Lumio.Client.Spectator;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Client.Spectator.Tests;

[CollectionDefinition("RuntimePerfEventSources", DisableParallelization = true)]
public sealed class RuntimePerfEventSourceCollection { }

[Collection("RuntimePerfEventSources")]
public sealed class RuntimePerfDiagnosticsTests(ITestOutputHelper output)
{
    private const string Provider = "Lumio-GameRuntime-Gas-SelectiveRebuild";

    // The optional Game capability is looked up at runtime so its absence is a
    // behavioral RED, rather than a missing-type compile error before implementation.
    private static EventListener Listener(int capacity = 512)
    {
        Type? type = typeof(SpectatorReplicaHost).Assembly.GetType("Lumio.Bomber.Client.Spectator.HostEventListener");
        Assert.True(type is not null, "Game runtime performance listener capability is unavailable");
        object? value = Activator.CreateInstance(type!, capacity);
        Assert.IsAssignableFrom<EventListener>(value);
        return (EventListener)value!;
    }

    private static object? Call(object listener, string name, params object?[] args)
    {
        MethodInfo? method = listener.GetType().GetMethod(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        Assert.True(method is not null, "Missing Game diagnostic operation: " + name);
        return method!.Invoke(listener, args);
    }

    private static JsonDocument Drain(EventListener listener)
    {
        object? snapshot = Call(listener, "Drain");
        Assert.NotNull(snapshot);
        return JsonDocument.Parse(JsonSerializer.Serialize(snapshot, snapshot!.GetType()));
    }

    private static object Collector()
    {
        Type? type = typeof(SpectatorReplicaHost).Assembly.GetType("Lumio.Bomber.Client.Spectator.RuntimePerfDiagnostics");
        Assert.True(type is not null, "Game runtime performance collector capability is unavailable");
        return Activator.CreateInstance(type!, 512)!;
    }

    private static JsonDocument DrainCollector(object collector)
    {
        object? snapshot = Call(collector, "Drain");
        Assert.NotNull(snapshot);
        return JsonDocument.Parse(JsonSerializer.Serialize(snapshot, snapshot!.GetType()));
    }

    [Fact]
    public void OfficialSessionCountersAreRawEndpointsWithFullWidthIdentityAndUnknownManagerDeltasRemainUnavailable()
    {
        object collector = Collector();
        using var lifetime = (IDisposable)collector;
        var session = new SnapshotSession(ulong.MaxValue, 9007199254740993UL, 7, 11, 13);
        Call(collector, "BeginPump", session);
        session.Snapshot = Snapshot(ulong.MaxValue, 9007199254740994UL, 8, 14, 15);
        Call(collector, "EndPump", session, null);
        using JsonDocument document = DrainCollector(collector);
        JsonElement pump = document.RootElement.GetProperty("pump");
        Assert.Equal("1", pump.GetProperty("hookPumpId").GetString());
        JsonElement before = pump.GetProperty("before"), after = pump.GetProperty("after");
        Assert.Equal("18446744073709551615", before.GetProperty("sessionGeneration").GetString());
        Assert.Equal("9007199254740993", before.GetProperty("ownerTick").GetString());
        Assert.Equal("9007199254740994", after.GetProperty("ownerTick").GetString());
        Assert.Equal("7", before.GetProperty("replicaStageCalls").GetString());
        Assert.Equal("11", before.GetProperty("predictionAuthorityStageCalls").GetString());
        Assert.Equal("13", before.GetProperty("runtimeAuthorityCalls").GetString());
        Assert.Equal("8", after.GetProperty("replicaStageCalls").GetString());
        Assert.Equal("14", after.GetProperty("predictionAuthorityStageCalls").GetString());
        Assert.Equal("15", after.GetProperty("runtimeAuthorityCalls").GetString());
        Assert.Equal("2", after.GetProperty("openAuthorityGroups").GetString());
        Assert.Equal("4", after.GetProperty("heldSections").GetString());
        Assert.True(after.GetProperty("voxelBaselineReady").GetBoolean());
        Assert.Equal(JsonValueKind.Null, pump.GetProperty("deltas").ValueKind);
        Assert.Equal("managerOrDriverUnavailable", pump.GetProperty("deltaUnavailableReason").GetString());
        Assert.Equal(0, session.TickCalls);
    }

    [Fact]
    public void ReplacedSessionKeepsBothEndpointsAndNeverSubtractsAcrossItsLifecycleEvenWithTheSameGeneration()
    {
        object collector = Collector();
        using var lifetime = (IDisposable)collector;
        var first = new SnapshotSession(7, 8, 9, 10, 11);
        var next = new SnapshotSession(7, 80, 90, 100, 110);
        Call(collector, "BeginPump", first);
        Call(collector, "EndPump", next, null);
        using JsonDocument document = DrainCollector(collector);
        JsonElement pump = document.RootElement.GetProperty("pump");
        Assert.Equal("9", pump.GetProperty("before").GetProperty("replicaStageCalls").GetString());
        Assert.Equal("90", pump.GetProperty("after").GetProperty("replicaStageCalls").GetString());
        Assert.Equal(JsonValueKind.Null, pump.GetProperty("deltas").ValueKind);
        Assert.Equal("lifecycleChanged", pump.GetProperty("deltaUnavailableReason").GetString());
        Assert.Equal(0, first.TickCalls + next.TickCalls);
    }

    [Fact]
    public void SnapshotFailureIsReportedWithoutEscapingTheDiagnosticHookOrExportingExceptionContents()
    {
        object collector = Collector();
        using var lifetime = (IDisposable)collector;
        var session = new SnapshotSession(7, 8, 9, 10, 11) { FailSnapshot = true };
        Assert.Null(Record.Exception(() => Call(collector, "BeginPump", session)));
        var primary = new ApplicationException("secret transport contents must not be exported");
        Assert.Null(Record.Exception(() => Call(collector, "EndPump", session, primary)));
        using JsonDocument document = DrainCollector(collector);
        Assert.False(document.RootElement.GetProperty("available").GetBoolean());
        Assert.NotEqual("0", document.RootElement.GetProperty("errorCount").GetString());
        Assert.Contains("InvalidOperationException", document.RootElement.GetProperty("lastError").GetString());
        Assert.Equal("ApplicationException", document.RootElement.GetProperty("pump").GetProperty("primaryExceptionType").GetString());
        Assert.DoesNotContain("secret", document.RootElement.GetRawText());
        Assert.Equal(0, session.TickCalls);
    }

    [Fact]
    public void UnavailableRuntimeReadKeepsOfficialSessionEndpointsAndMarksRuntimeDeltasUnavailable()
    {
        object collector = Collector();
        using var lifetime = (IDisposable)collector;
        var session = new SnapshotSession(7, 8, 9, 10, 11) { FailWorld = true };
        Call(collector, "BeginPump", session);
        session.Snapshot = Snapshot(7, 9, 12, 13, 14);
        Call(collector, "EndPump", session, null);
        using JsonDocument document = DrainCollector(collector);
        JsonElement root = document.RootElement, pump = root.GetProperty("pump");
        Assert.True(root.GetProperty("countersAvailable").GetBoolean());
        Assert.Equal("9", pump.GetProperty("before").GetProperty("replicaStageCalls").GetString());
        Assert.Equal("12", pump.GetProperty("after").GetProperty("replicaStageCalls").GetString());
        Assert.Equal(JsonValueKind.Null, pump.GetProperty("deltas").ValueKind);
        Assert.Equal("managerOrDriverUnavailable", pump.GetProperty("deltaUnavailableReason").GetString());
        Assert.NotEqual("0", root.GetProperty("errorCount").GetString());
        Assert.DoesNotContain("secret", root.GetRawText());
    }

    // The real host wrapper runs against only its Session boundary here. Constructing
    // an Engine/world graph would turn these exception/disabled-path checks into Native tests.
    private static SpectatorReplicaHost Host(SnapshotSession session)
    {
        var host = (SpectatorReplicaHost)RuntimeHelpers.GetUninitializedObject(typeof(SpectatorReplicaHost));
        void Set(string name, object value) => typeof(SpectatorReplicaHost).GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(host, value);
        Set("_session", session);
        Set("_joint", new RuntimeJointPrediction(new VoxelPredictionConfig(64UL << 20, 512, 4096, 4096, 4096, 64, 4096, 1024, 256)));
        Set("_lastError", string.Empty);
        return host;
    }

    [Fact]
    public void DisabledHostTickUsesTheOriginalSnapshotAndSingleTickPathWithoutSubscribing()
    {
        using var source = new PhaseSource();
        var session = new SnapshotSession(7, 8, 9, 10, 11) { AllowTick = true };
        var host = Host(session);
        Call(host, "ConfigureRuntimePerf", false);
        host.Tick();
        Assert.Equal(3, session.SnapshotCalls);
        Assert.Equal(1, session.TickCalls);
        Assert.Equal(9UL, session.LastOwnerTick);
        Assert.False(source.IsEnabled());
        host.Dispose();
        Assert.Equal(1, session.CloseCalls);
        Assert.Equal(1, session.DisposeCalls);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void HostPreservesTheExactPrimaryTickExceptionEvenWhenDiagnosticSnapshotFails(bool enabled)
    {
        var primary = new ApplicationException("original_tick_failure");
        var session = new SnapshotSession(7, 8, 9, 10, 11) { AllowTick = true, TickFailure = primary, FailSnapshotAfterTick = enabled };
        var host = Host(session);
        Call(host, "ConfigureRuntimePerf", enabled);
        Assert.Same(primary, Record.Exception(host.Tick));
        Assert.Equal(1, session.TickCalls);
        Assert.Contains("original_tick_failure", host.LastApplyError);
        if (enabled)
        {
            using var diagnostic = JsonDocument.Parse((string)Call(host, "DrainRuntimePerf")!);
            Assert.Equal("ApplicationException", diagnostic.RootElement.GetProperty("pump").GetProperty("primaryExceptionType").GetString());
            Assert.NotEqual("0", diagnostic.RootElement.GetProperty("errorCount").GetString());
        }
        host.Dispose();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void HostCleanupFailureAndCloseCallsRemainVisibleAndUnchangedWithDiagnostics(bool enabled)
    {
        using var source = new PhaseSource();
        var session = new SnapshotSession(7, 8, 9, 10, 11) { AllowTick = true,
            Snapshot = new ClientSessionSnapshot(ClientSessionState.Faulted, 7, true, 0, true, true, true, 9, 10, 11,
                1, 0, 0, Array.Empty<string>(), SessionCleanupStatus.Failed, false, 8, true) };
        var host = Host(session);
        Call(host, "ConfigureRuntimePerf", enabled);
        var error = Assert.Throws<InvalidOperationException>(host.Tick);
        Assert.Equal("client_cleanup_failed_resources_retained", error.Message);
        Assert.Equal(1, session.TickCalls);
        Assert.Equal(9UL, session.LastOwnerTick);
        host.Dispose();
        Assert.Equal(1, session.CloseCalls);
        Assert.Equal(1, session.DisposeCalls);
        Assert.False(source.IsEnabled());
    }

    private static ClientSessionSnapshot Snapshot(ulong generation, ulong ownerTick, int replica, int prediction, int runtime) =>
        new(ClientSessionState.Active, generation, true, 0, true, true, true, replica, prediction, runtime,
            1, 0, 0, Array.Empty<string>(), SessionCleanupStatus.None, false, ownerTick, true,
            voxelBaselineReady: true, openAuthorityGroups: 2, heldSections: 4);

    private sealed class SnapshotSession(ulong generation, ulong ownerTick, int replica, int prediction, int runtime) : IClientSession
    {
        public ClientSessionSnapshot Snapshot = RuntimePerfDiagnosticsTests.Snapshot(generation, ownerTick, replica, prediction, runtime);
        public int TickCalls;
        public bool FailSnapshot;
        public bool FailWorld;
        public bool AllowTick, FailSnapshotAfterTick;
        public int SnapshotCalls, CloseCalls, DisposeCalls;
        public ulong LastOwnerTick;
        public Exception? TickFailure;
        public ClientSessionSnapshot GetSnapshot() { SnapshotCalls++; return FailSnapshot || (FailSnapshotAfterTick && TickCalls != 0) ? throw new InvalidOperationException("secret snapshot contents") : Snapshot; }
        public bool TryGetReplicaWorld(out IReplicaWorld world) { world = null!; if (FailWorld) throw new InvalidOperationException("secret world read contents"); return false; }
        public bool TryGetPrediction(out IClientPrediction prediction) { prediction = null!; return false; }
        public bool TryUpdateOwnerPresentation(out OwnerPresentationPose pose) { pose = default; return false; }
        public bool TryDequeueSuperseded(out SessionSupersededNotice notice) { notice = default; return false; }
        public SessionTickResult Tick(in ClientOwnerTick tick) { TickCalls++; LastOwnerTick = tick.Tick; if (TickFailure is not null) throw TickFailure; if (!AllowTick) throw new NotSupportedException("Diagnostics must not tick the Session"); return new SessionTickResult(Snapshot.State); }
        public SessionCommandResult RequestConnect(in SessionConnectRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public SessionCommandResult Login(in SessionConnectRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        public SessionCommandResult RequestClose(in SessionCloseRequest request) { CloseCalls++; return new SessionCommandResult(true); }
        public void Dispose() { DisposeCalls++; }
    }

    [Fact]
    public void ProviderCreatedBeforeListenerIsEnabledAndFourPhasesKeepRawClockPrecisionAndReturnedFlags()
    {
        using var source = new PhaseSource();
        using EventListener listener = Listener();
        const ulong pump = 9007199254740993UL;
        Call(listener, "BeginHook", pump);
        for (int phase = 1; phase <= 4; phase++)
            source.PhaseCompleted(phase, 9007199254740995L + phase, 123L + phase, 10000000L, phase != 3);
        Call(listener, "EndHook");
        using JsonDocument document = Drain(listener);
        JsonElement root = document.RootElement;
        output.WriteLine("phase-payload-receipt: " + root.GetRawText());
        Assert.True(root.GetProperty("providerSeen").GetBoolean());
        Assert.True(root.GetProperty("enabled").GetBoolean());
        Assert.Equal("0", root.GetProperty("errorCount").GetString());
        JsonElement phases = root.GetProperty("phases");
        Assert.Equal(4, phases.GetArrayLength());
        for (int i = 0; i < 4; i++)
        {
            JsonElement phase = phases[i];
            Assert.Equal(i + 1, phase.GetProperty("phase").GetInt32());
            Assert.Equal(pump.ToString(), phase.GetProperty("hookPumpId").GetString());
            Assert.Equal((9007199254740996L + i).ToString(), phase.GetProperty("startTicks").GetString());
            Assert.Equal((124L + i).ToString(), phase.GetProperty("elapsedTicks").GetString());
            Assert.Equal("10000000", phase.GetProperty("frequency").GetString());
            Assert.Equal(i != 2, phase.GetProperty("returned").GetBoolean());
        }
    }

    [Fact]
    public void ProviderCreatedAfterListenerIsObservedWhileUnrelatedProviderRemainsDisabled()
    {
        using EventListener listener = Listener();
        using var unrelated = new UnrelatedSource();
        Assert.False(unrelated.IsEnabled());
        using var source = new PhaseSource();
        Assert.True(source.IsEnabled(EventLevel.Informational, EventKeywords.None));
        source.PhaseCompleted(1, 10L, 20L, 10000000L, true);
        using JsonDocument document = Drain(listener);
        Assert.True(document.RootElement.GetProperty("providerSeen").GetBoolean());
        Assert.Single(document.RootElement.GetProperty("phases").EnumerateArray());
    }

    [Fact]
    public void CapacityIsBoundedDroppedCountIsExplicitAndDrainingDoesNotInventZeroCostCompleteness()
    {
        using var source = new PhaseSource();
        using EventListener listener = Listener(2);
        for (int i = 0; i < 4; i++) source.PhaseCompleted(i + 1, 10L + i, 20L, 10000000L, true);
        using JsonDocument first = Drain(listener);
        Assert.Equal(2, first.RootElement.GetProperty("phases").GetArrayLength());
        Assert.Equal("2", first.RootElement.GetProperty("droppedPhaseRecords").GetString());
        Assert.True(first.RootElement.GetProperty("truncated").GetBoolean());
        using JsonDocument second = Drain(listener);
        Assert.Empty(second.RootElement.GetProperty("phases").EnumerateArray());
        Assert.Equal("2", second.RootElement.GetProperty("droppedPhaseRecords").GetString());
        Assert.True(second.RootElement.GetProperty("truncated").GetBoolean());
    }

    [Fact]
    public void PhasesOutsideAnActiveHostPumpRemainUnboundAndAreNotDiscardedOrJoinedToThePreviousPump()
    {
        using var source = new PhaseSource();
        using EventListener listener = Listener();
        source.PhaseCompleted(1, 10L, 20L, 10000000L, true);
        Call(listener, "BeginHook", 7UL);
        source.PhaseCompleted(2, 30L, 20L, 10000000L, true);
        Call(listener, "EndHook");
        source.PhaseCompleted(3, 50L, 20L, 10000000L, false);
        using JsonDocument document = Drain(listener);
        JsonElement phases = document.RootElement.GetProperty("phases");
        Assert.Equal(3, phases.GetArrayLength());
        Assert.Equal(JsonValueKind.Null, phases[0].GetProperty("hookPumpId").ValueKind);
        Assert.Equal("7", phases[1].GetProperty("hookPumpId").GetString());
        Assert.Equal(JsonValueKind.Null, phases[2].GetProperty("hookPumpId").ValueKind);
    }

    [Fact]
    public void PhaseFromAnotherThreadCannotAcquireTheActiveHostPumpIdentity()
    {
        using var source = new PhaseSource();
        using EventListener listener = Listener();
        Call(listener, "BeginHook", 7UL);
        var producer = new Thread(() => source.PhaseCompleted(1, 10L, 20L, 10000000L, true));
        producer.Start();
        producer.Join();
        source.PhaseCompleted(2, 30L, 20L, 10000000L, true);
        Call(listener, "EndHook");
        using JsonDocument document = Drain(listener);
        JsonElement phases = document.RootElement.GetProperty("phases");
        Assert.Equal(2, phases.GetArrayLength());
        Assert.Equal(JsonValueKind.Null, phases[0].GetProperty("hookPumpId").ValueKind);
        Assert.Equal("7", phases[1].GetProperty("hookPumpId").GetString());
    }

    [Fact]
    public void ListenerErrorsAreRetainedAsErrorsRatherThanAnEmptySuccessfulObservation()
    {
        using var source = new PhaseSource();
        using EventListener listener = Listener();
        using var payloadReceipt = new PayloadReceipt(value => output.WriteLine("raw-malformed-bcl: " + value));
        _ = Record.Exception(source.Malformed);
        using JsonDocument document = Drain(listener);
        Assert.NotEqual("0", document.RootElement.GetProperty("errorCount").GetString());
        Assert.False(string.IsNullOrEmpty(document.RootElement.GetProperty("lastError").GetString()));
        output.WriteLine("malformed-payload-receipt: " + document.RootElement.GetRawText());
    }

    [Fact]
    public void DisableDisposesTheSubscriptionAndClearsBufferedDataForTheNextRun()
    {
        using var source = new PhaseSource();
        EventListener listener = Listener(1);
        source.PhaseCompleted(1, 10L, 20L, 10000000L, true);
        source.PhaseCompleted(2, 30L, 20L, 10000000L, true);
        listener.Dispose();
        Assert.False(source.IsEnabled(EventLevel.Informational, EventKeywords.None));
        source.PhaseCompleted(3, 50L, 20L, 10000000L, true);
        using JsonDocument disabled = Drain(listener);
        Assert.False(disabled.RootElement.GetProperty("enabled").GetBoolean());
        Assert.Empty(disabled.RootElement.GetProperty("phases").EnumerateArray());
        Assert.Equal("0", disabled.RootElement.GetProperty("droppedPhaseRecords").GetString());
        using EventListener next = Listener();
        using JsonDocument fresh = Drain(next);
        Assert.Empty(fresh.RootElement.GetProperty("phases").EnumerateArray());
        Assert.Equal("0", fresh.RootElement.GetProperty("errorCount").GetString());
        Assert.Equal("0", fresh.RootElement.GetProperty("droppedPhaseRecords").GetString());
    }

    // A distinct GUID keeps this test provider independent of the consumed Runtime's
    // provider; it emits the same declared EventSource payload through the real BCL.
    [EventSource(Name = Provider, Guid = "37e106e2-c19b-4aa1-9c09-32d55b999ecb")]
    private sealed class PhaseSource : EventSource
    {
        [Event(1, Level = EventLevel.Informational)]
        public void PhaseCompleted(int phase, long startTicks, long elapsedTicks, long frequency, bool returned) =>
            WriteEvent(1, new object[] { phase, startTicks, elapsedTicks, frequency, returned });
        [NonEvent]
        public void Malformed() => WriteEvent(1, new object[] { "invalid-phase", 10L, 20L, 10000000L, true });
    }

    [EventSource(Name = "Lumio-Bomber-Perf-Unrelated-Test", Guid = "c504a51b-c319-4d4d-88f8-4edc94b21564")]
    private sealed class UnrelatedSource : EventSource { }

    private sealed class PayloadReceipt : EventListener
    {
        private readonly Action<string> _write;
        public PayloadReceipt(Action<string> write)
        {
            _write = write;
            foreach (EventSource source in EventSource.GetSources())
                if (source.Name == Provider) EnableEvents(source, EventLevel.Informational, EventKeywords.None);
        }
        protected override void OnEventWritten(EventWrittenEventArgs data) =>
            _write?.Invoke("eventId=" + data.EventId + ";payloadTypes=" + string.Join(",", data.Payload?.Select(value => value?.GetType().Name ?? "null") ?? Array.Empty<string>()));
    }
}
