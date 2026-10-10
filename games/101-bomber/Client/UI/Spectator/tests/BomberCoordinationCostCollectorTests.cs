using System.Diagnostics.Tracing;
using System.Reflection;
using System.Text.Json;
using Lumio.Client.Gameplay.ECS;
using Lumio.Client.Gameplay.GAS;
using Lumio.Client.Gameplay.Session;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class BomberCoordinationCostCollectorTests
{
    private static Type CollectorType()
    {
        var type = typeof(BomberInputTrace).Assembly.GetType("Lumio.Bomber.Client.Spectator.BomberCoordinationCostCollector");
        Assert.NotNull(type); return type;
    }
    private static object Create() => Activator.CreateInstance(CollectorType(), BindingFlags.Instance | BindingFlags.NonPublic, null, ["unit-host"], null)!;
    private static object? Call(object target, string name, params object?[] args) =>
        CollectorType().GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(target, args);
    private static bool Parse(int id, object?[] payload, out object? sample)
    {
        var args = new object?[] { id, payload, null };
        var result = CollectorType().GetMethod("TryReadPayload", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, args);
        sample = args[2]; return (bool)result!;
    }
    private static object?[] Payload(long window = 1, long ordinal = 1, bool valid = true) =>
        [window, ordinal, 9007199254740993L, 123L, 1000L, true, valid, 3, 4, 5, 6, "None",
         120L, 3L, 1L, 2L, 3L, 4L, 5L, 6L, 7L, 8, 9L, 10L, 11, 12L, 13, 14L, 15L, 16, 17, 18L, 19L];
    private static JsonDocument Peek(object collector) => JsonDocument.Parse(JsonSerializer.Serialize(Call(collector, "Peek")));
    private static WorkCounterSnapshotDto Work(string driver = "1", string generation = "2") => new() {
        sessionGeneration = generation, predictionGeneration = "3", managerId = "4", worldInstance = "5", driverId = driver };

    [Fact]
    public void PayloadRejectsMalformedClrShapesAndPreservesLargeRawStrings()
    {
        Assert.True(Parse(2, Payload(), out var sample)); Assert.NotNull(sample);
        using var collector = (IDisposable)Create(); Call(collector, "Store", sample);
        using var json = Peek(collector); var row = json.RootElement.GetProperty("records")[0];
        Assert.Equal("9007199254740993", row.GetProperty("startedTicks").GetString());
        Assert.False(Parse(1, Payload(), out _)); Assert.False(Parse(2, [], out _));
        var wrong = Payload(); wrong[0] = 1; Assert.False(Parse(2, wrong, out _));
        wrong = Payload(); wrong[5] = null; Assert.False(Parse(2, wrong, out _));
    }

    [Fact]
    public void InvalidMeasurementKeepsRawTicksAndNeverFabricatesElapsedMilliseconds()
    {
        Assert.True(Parse(2, Payload(valid: false), out var sample));
        using var collector = (IDisposable)Create(); Call(collector, "Store", sample);
        using var json = Peek(collector); var row = json.RootElement.GetProperty("records")[0];
        Assert.Equal("123", row.GetProperty("elapsedTicks").GetString());
        Assert.False(row.GetProperty("measurementValid").GetBoolean());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("elapsedMs").ValueKind);
    }

    [Fact]
    public void BufferIsLifetimeBoundedAndConsumptionNeverRenewsTheRecordLimit()
    {
        using var collector = (IDisposable)Create();
        for (int i = 1; i <= 257; i++) { Assert.True(Parse(2, Payload(ordinal: i), out var row)); Call(collector, "Store", row); }
        using var first = Peek(collector); Assert.Equal(256, first.RootElement.GetProperty("records").GetArrayLength());
        Assert.Equal("1", first.RootElement.GetProperty("dropped").GetString());
        Assert.True(first.RootElement.GetProperty("closed").GetBoolean());
        Assert.False(first.RootElement.GetProperty("complete").GetBoolean());
        Call(collector, "Consume"); Assert.True(Parse(2, Payload(ordinal: 258), out var later)); Call(collector, "Store", later);
        using var second = Peek(collector); Assert.Equal(0, second.RootElement.GetProperty("records").GetArrayLength());
        Assert.True(second.RootElement.GetProperty("closed").GetBoolean());
    }

    [Theory]
    [InlineData("RecordLimit")]
    [InlineData("WindowLimit")]
    [InlineData("ClockFailure")]
    public void TerminalCompletedRecordIsRetainedBoundThenReleasedOutsideSession(string reason)
    {
        using var collector = (IDisposable)Create(); Call(collector, "BeginPump", 9UL); Call(collector, "EnterSession");
        var payload = Payload(); payload[11] = reason; Assert.True(Parse(2, payload, out var sample)); Call(collector, "Store", sample);
        Assert.False((bool)CollectorType().GetField("_disposed", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(collector)!);
        Call(collector, "LeaveSession"); Call(collector, "EndPump", Work(), Work(), null, true);
        using var result = Peek(collector); Assert.True(result.RootElement.GetProperty("closed").GetBoolean());
        Assert.Equal(reason, result.RootElement.GetProperty("reason").GetString());
        var row = Assert.Single(result.RootElement.GetProperty("records").EnumerateArray());
        Assert.Equal(reason, row.GetProperty("stopReason").GetString()); Assert.Equal("9", row.GetProperty("facadeOrdinal").GetString());
        Assert.True(row.GetProperty("bindingAvailable").GetBoolean());
        Assert.True((bool)CollectorType().GetField("_disposed", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(collector)!);
        Call(collector, "Consume"); using var idle = Peek(collector); Assert.Equal(JsonValueKind.Null, idle.RootElement.ValueKind);
    }

    [Fact]
    public void NonterminalCompletedRecordKeepsTheCaptureOpen()
    {
        using var collector = (IDisposable)Create(); Call(collector, "BeginPump", 9UL); Call(collector, "EnterSession");
        Assert.True(Parse(2, Payload(), out var sample)); Call(collector, "Store", sample);
        Call(collector, "LeaveSession"); Call(collector, "EndPump", Work(), Work(), null, true);
        using var result = Peek(collector); Assert.False(result.RootElement.GetProperty("closed").GetBoolean());
        Assert.False((bool)CollectorType().GetField("_disposed", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(collector)!);
    }

    [Fact]
    public void ActualAcceptedOrdinalAndSameDriverBindWithoutAdditionalWorldQueries()
    {
        using var collector = (IDisposable)Create(); Call(collector, "BeginPump", 9UL); Call(collector, "EnterSession");
        Assert.True(Parse(2, Payload(), out var sample)); Call(collector, "Store", sample); Call(collector, "LeaveSession");
        Call(collector, "EndPump", Work(), Work(), null, true);
        using var json = Peek(collector); var row = json.RootElement.GetProperty("records")[0];
        Assert.True(row.GetProperty("bindingAvailable").GetBoolean());
        Assert.Equal("9", row.GetProperty("facadeOrdinal").GetString());
        Assert.Equal("1", row.GetProperty("driverId").GetString());
    }

    [Fact]
    public void DriverChangeClosesCaptureAndKeepsUnclassifiedRecordsUnavailable()
    {
        using var collector = (IDisposable)Create(); Call(collector, "BeginPump", 9UL); Call(collector, "EnterSession");
        Assert.True(Parse(2, Payload(), out var sample)); Call(collector, "Store", sample); Call(collector, "LeaveSession");
        Call(collector, "EndPump", Work(), Work("2"), null, true);
        using var json = Peek(collector); var row = json.RootElement.GetProperty("records")[0];
        Assert.False(row.GetProperty("bindingAvailable").GetBoolean());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("driverId").ValueKind);
        Assert.True(json.RootElement.GetProperty("closed").GetBoolean());
    }

    [Fact]
    public void FailedSourceGeneratedDrainPreservesNewRowsUntilSuccessfulSerialization()
    {
        using var collector = (IDisposable)Create(); Assert.True(Parse(2, Payload(), out var sample)); Call(collector, "Store", sample);
        int serializations = 0;
        var trace = new BomberInputTrace(serialize: batch => {
            if (++serializations == 1) throw new InvalidOperationException("unit serialization failure");
            return JsonSerializer.Serialize(batch, SpectatorJsonContext.Default.InputTraceBatchDto); });
        var property = typeof(BomberInputTrace).GetProperty("CoordinationCost", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(property); property.SetValue(trace, collector);
        using var failed = JsonDocument.Parse(trace.Drain()); Assert.True(failed.RootElement.GetProperty("diagnosticFailure").GetBoolean());
        using var success = JsonDocument.Parse(trace.Drain());
        Assert.Single(success.RootElement.GetProperty("coordinationCost").GetProperty("records").EnumerateArray());
        using var empty = JsonDocument.Parse(trace.Drain());
        Assert.Equal(JsonValueKind.Null, empty.RootElement.GetProperty("coordinationCost").ValueKind);
    }

    [Fact]
    public void OutsideSessionRecordRemainsIncompleteAfterSuccessfulConsumeAndLaterBinding()
    {
        using var collector = (IDisposable)Create();
        // Scalar aggregation fixture only. Provider matching and actual Native
        // delivery are covered separately; this stub does not claim integration.
        using var source = new EventSource("unit-coordination-aggregation");
        CollectorType().GetField("_source", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(collector, source);
        var trace = new BomberInputTrace();
        typeof(BomberInputTrace).GetProperty("CoordinationCost", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(trace, collector);
        Assert.True(Parse(2, Payload(), out var outside)); Call(collector, "Store", outside);
        using var first = JsonDocument.Parse(trace.Drain());
        var firstCost = first.RootElement.GetProperty("coordinationCost");
        Assert.False(firstCost.GetProperty("complete").GetBoolean());
        Assert.Equal("outside-session", Assert.Single(firstCost.GetProperty("records").EnumerateArray()).GetProperty("bindingReason").GetString());
        Call(collector, "BeginPump", 9UL); Call(collector, "EnterSession");
        Assert.True(Parse(2, Payload(ordinal: 2), out var later)); Call(collector, "Store", later);
        Call(collector, "LeaveSession"); Call(collector, "EndPump", Work(), Work(), null, true);
        using var second = JsonDocument.Parse(trace.Drain());
        var secondCost = second.RootElement.GetProperty("coordinationCost");
        Assert.True(Assert.Single(secondCost.GetProperty("records").EnumerateArray()).GetProperty("bindingAvailable").GetBoolean());
        Assert.False(secondCost.GetProperty("complete").GetBoolean());
        using var idle = JsonDocument.Parse(trace.Drain()); Assert.Equal(JsonValueKind.Null, idle.RootElement.GetProperty("coordinationCost").ValueKind);
    }

    [Fact]
    public void SameNameProviderFromAnotherAssemblyIsNeverEnabled()
    {
        using var pretender = new Pretender(); using var collector = (IDisposable)Create();
        Assert.False(pretender.IsEnabled(EventLevel.Informational, (EventKeywords)2));
        using var json = Peek(collector); Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("providerName").ValueKind);
    }

    [Fact]
    public void IdleDrainOmitsAlreadyConsumedHeaderAndClosedStatusIsSentOnlyOnce()
    {
        using var collector = (IDisposable)Create();
        var trace = new BomberInputTrace();
        typeof(BomberInputTrace).GetProperty("CoordinationCost", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(trace, collector);
        using var first = JsonDocument.Parse(trace.Drain()); Assert.Equal(JsonValueKind.Object, first.RootElement.GetProperty("coordinationCost").ValueKind);
        using var second = JsonDocument.Parse(trace.Drain()); Assert.Equal(JsonValueKind.Null, second.RootElement.GetProperty("coordinationCost").ValueKind);
        Call(collector, "Stop", "host-disposed");
        using var stopped = JsonDocument.Parse(trace.Drain()); Assert.True(stopped.RootElement.GetProperty("coordinationCost").GetProperty("closed").GetBoolean());
        using var empty = JsonDocument.Parse(trace.Drain()); Assert.Equal(JsonValueKind.Null, empty.RootElement.GetProperty("coordinationCost").ValueKind);
    }

    [Fact]
    public void GenerationChangeClosesCaptureEvenWhenDriverIdIsUnchanged()
    {
        using var collector = (IDisposable)Create(); Call(collector, "BeginPump", 9UL); Call(collector, "EnterSession");
        Assert.True(Parse(2, Payload(), out var sample)); Call(collector, "Store", sample); Call(collector, "LeaveSession");
        var after = Work(generation: "3");
        Call(collector, "EndPump", Work(), after, null, true);
        using var json = Peek(collector); Assert.False(json.RootElement.GetProperty("records")[0].GetProperty("bindingAvailable").GetBoolean());
        Assert.True(json.RootElement.GetProperty("closed").GetBoolean());
    }

    [Fact]
    public void StartBeforeActiveDoesNotCreateListenerOrConsumeTheAttemptAndDefaultOffDoesNotQuerySession()
    {
        var method = typeof(SpectatorReplicaHost).GetMethod("StartCoordinationCostCapture", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(method);
        try
        {
            AppContext.SetSwitch("Lumio.Bomber.CoordinationCost", false);
            var disabledSession = new StartSessionProbe();
            using var disabled = new SpectatorReplicaHost(disabledSession, new BomberPlayerStepOptions(true), new BomberInputTrace());
            Assert.Equal("disabled", method.Invoke(disabled, null)); Assert.Equal(0, disabledSession.Snapshots);
            AppContext.SetSwitch("Lumio.Bomber.CoordinationCost", true);
            var session = new StartSessionProbe();
            using var host = new SpectatorReplicaHost(session, new BomberPlayerStepOptions(true), new BomberInputTrace());
            Assert.Equal("not-active", method.Invoke(host, null)); Assert.Equal("not-active", method.Invoke(host, null));
            Assert.Equal(2, session.Snapshots);
            var field = typeof(SpectatorReplicaHost).GetField("_coordinationCost", BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.NotNull(field); Assert.Null(field.GetValue(host));
            host.Dispose(); Assert.Equal("closed", method.Invoke(host, null));
        }
        finally { AppContext.SetSwitch("Lumio.Bomber.CoordinationCost", false); }
    }


    [Fact]
    public void StoppedMarkerKeepsItsOwnRawFieldsAndTheSameAcceptedWorkBinding()
    {
        using var collector = (IDisposable)Create(); Call(collector, "BeginPump", 9UL); Call(collector, "EnterSession");
        Assert.True(Parse(3, [7L, 256L, "RecordLimit"], out var stop)); Call(collector, "Store", stop); Call(collector, "LeaveSession");
        Call(collector, "EndPump", Work(), Work(), null, true);
        using var json = Peek(collector); var marker = json.RootElement.GetProperty("stopped");
        Assert.Equal("7", marker.GetProperty("windowId").GetString()); Assert.Equal("256", marker.GetProperty("ordinal").GetString());
        Assert.Equal("RecordLimit", marker.GetProperty("stopReason").GetString()); Assert.True(marker.GetProperty("bindingAvailable").GetBoolean());
        Assert.Equal("9", marker.GetProperty("facadeOrdinal").GetString()); Assert.Equal("1", marker.GetProperty("driverId").GetString());
        Assert.False(Parse(3, [7L, 256, "RecordLimit"], out _)); Assert.False(Parse(3, [7L, 256L], out _));
    }

    [Fact]
    public void MultipleDriverWindowsCloseAndMissingAcceptedOrdinalNeverUsesAnOlderPump()
    {
        using var collector = (IDisposable)Create(); Call(collector, "BeginPump", (object?)null); Call(collector, "EnterSession");
        Assert.True(Parse(2, Payload(), out var first)); Call(collector, "Store", first);
        Assert.True(Parse(2, Payload(window: 2), out var second)); Call(collector, "Store", second); Call(collector, "LeaveSession");
        Call(collector, "EndPump", Work(), Work(), null, true);
        using var json = Peek(collector); Assert.True(json.RootElement.GetProperty("closed").GetBoolean());
        Assert.Equal("multiple-drivers", json.RootElement.GetProperty("reason").GetString());
        foreach (var row in json.RootElement.GetProperty("records").EnumerateArray())
        { Assert.False(row.GetProperty("bindingAvailable").GetBoolean()); Assert.Equal(JsonValueKind.Null, row.GetProperty("facadeOrdinal").ValueKind); }
    }

    [Fact]
    public void OriginalCloseExceptionIsRetainedAndFinallyClosesTheOwningCollector()
    {
        using var collector = (IDisposable)Create(); var session = new StartSessionProbe {ThrowOnClose = true};
        var host = new SpectatorReplicaHost(session, new BomberPlayerStepOptions(true), new BomberInputTrace());
        typeof(SpectatorReplicaHost).GetField("_coordinationCost", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(host, collector);
        Assert.Same(session.Error, Assert.Throws<InvalidOperationException>(host.Dispose));
        using var json = Peek(collector); Assert.True(json.RootElement.GetProperty("closed").GetBoolean());
    }
    private sealed class StartSessionProbe : IClientSession
    {
        internal int Snapshots;
        internal bool ThrowOnClose;
        internal readonly InvalidOperationException Error = new("original close");
        public ClientSessionSnapshot GetSnapshot() { Snapshots++; return new(default, 1, false, 0, false, false, false, 0, 0, 0, 0, 0, 0, []); }
        public SessionTickResult Tick(in ClientOwnerTick tick) => default;
        public bool TryGetReplicaWorld(out IReplicaWorld world) { world = null!; return false; }
        public bool TryGetPrediction(out IClientPrediction prediction) { prediction = null!; return false; }
        public bool TryUpdateOwnerPresentation(out OwnerPresentationPose pose) { pose = default; return false; }
        public SessionCommandResult RequestConnect(in SessionConnectRequest request, CancellationToken cancellationToken) => default;
        public SessionCommandResult Login(in SessionConnectRequest request, CancellationToken cancellationToken) => default;
        public SessionCommandResult RequestClose(in SessionCloseRequest request) { if (ThrowOnClose) throw Error; return default; }
        public bool TryDequeueSuperseded(out SessionSupersededNotice notice) { notice = default; return false; }
        public void Dispose() { }
    }
    [EventSource(Name = "Lumio-GameRuntime-Gas-SelectiveRebuild")]
    private sealed class Pretender : EventSource { }
}


// Actual Native/Sections/session chain; unlike the scalar unit fixtures above,
// these facts require the explicitly selected native and frozen net10 overlay.
public sealed class BomberCoordinationCostNativeTests
{
    private static string Start(SpectatorReplicaHost host) => (string)typeof(SpectatorReplicaHost)
        .GetMethod("StartCoordinationCostCapture", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(host, null)!;
    private static EventSource Source() => EventSource.GetSources().Single(source =>
        source.Name == "Lumio-GameRuntime-Gas-SelectiveRebuild" && source.GetType().Assembly == typeof(Lumio.GameRuntime.Gas.GasJointPrediction).Assembly);

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ActualNativeStartWorkBindingDrainAndReleaseRetainNormalMovement(bool enabled)
    {
        try
        {
            AppContext.SetSwitch("Lumio.Bomber.CoordinationCost", enabled);
            MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, self) =>
            {
                // Active can precede the Runtime provider's first normal rebuild.
                // A failed start must not consume the one-shot; warm it with an
                // ordinary neutral prediction step before the explicit capture.
                var initialProvider = EventSource.GetSources().SingleOrDefault(source =>
                    source.Name == "Lumio-GameRuntime-Gas-SelectiveRebuild" && source.GetType().Assembly == typeof(Lumio.GameRuntime.Gas.GasJointPrediction).Assembly);
                string? initialStartResult = initialProvider is null ? Start(owner.Host) : null;
                if (initialProvider is null) Assert.Equal(enabled ? "provider-unavailable" : "disabled", initialStartResult);
                owner.Host.SetInputIntentEnabled(true);
                Thread.Sleep(55); owner.Host.Tick();
                var provider = Source();
                Assert.False(provider.IsEnabled(EventLevel.Informational, (EventKeywords)2));
                _ = owner.Host.DrainInputTrace();
                Assert.Equal(enabled ? "started" : "disabled", Start(owner.Host));
                if (enabled) Assert.Equal("already-started", Start(owner.Host));
                Assert.Equal(enabled, provider.IsEnabled(EventLevel.Informational, (EventKeywords)2));
                owner.Host.SetInputIntentEnabled(true);
                owner.Host.SetMoveIntent((int)Lumio.Bomber.Gameplay.BomberDirection.Right, 0, false);
                var batches = new List<JsonElement>();
                for (int i = 0; i < 3; i++)
                {
                    Thread.Sleep(55); owner.Host.Tick();
                    using var batch = JsonDocument.Parse(owner.Host.DrainInputTrace()); batches.Add(batch.RootElement.Clone());
                }
                var replica = owner.Host.World;
                Assert.NotNull(replica);
                var confirmed = replica.Get<Lumio.GameRuntime.Ecs.LogicTransform>(self).LocalPosition;
                Assert.Equal(7.5f, confirmed.X); Assert.Equal(7.5f, confirmed.Z);
                using var display = JsonDocument.Parse(owner.Host.PresentationState());
                var player = display.RootElement.GetProperty("players").EnumerateArray().Single(row => row.GetProperty("id").GetString() == self.ToHex());
                Assert.True(player.GetProperty("x").GetSingle() > confirmed.X);
                var costs = batches.Select(batch => batch.GetProperty("coordinationCost")).Where(value => value.ValueKind == JsonValueKind.Object).ToArray();
                if (enabled)
                {
                    var rows = costs.SelectMany(cost => cost.GetProperty("records").EnumerateArray()).ToArray();
                    Assert.NotEmpty(rows); Assert.All(rows, row => { Assert.True(row.GetProperty("bindingAvailable").GetBoolean());
                        Assert.True(row.GetProperty("measurementValid").GetBoolean()); Assert.Equal(JsonValueKind.String, row.GetProperty("facadeOrdinal").ValueKind);
                        Assert.Equal(JsonValueKind.String, row.GetProperty("driverId").ValueKind); });
                    Assert.All(costs, cost => { Assert.Equal(0UL, ulong.Parse(cost.GetProperty("dropped").GetString()!));
                        Assert.Equal(0UL, ulong.Parse(cost.GetProperty("diagnosticFailures").GetString()!));
                        Assert.Equal(typeof(Lumio.GameRuntime.Gas.GasJointPrediction).Module.ModuleVersionId.ToString("D"), cost.GetProperty("assemblyMvid").GetString()); });
                }
                else Assert.Empty(costs);
                var loaded = new[] { typeof(SpectatorReplicaHost).Assembly, typeof(Lumio.GameRuntime.Gas.GasJointPrediction).Assembly, typeof(Lumio.GameRuntime.Ecs.World).Assembly,
                    typeof(Lumio.GameRuntime.Hosting.LumioEngine).Assembly, typeof(Lumio.Engine.NativeLoader.NativeMonotonicClock).Assembly, typeof(IClientSession).Assembly }
                    .Append(AppDomain.CurrentDomain.GetAssemblies().Single(assembly => assembly.GetName().Name == "Lumio.Engine.NativeLoader.Hfsm"))
                    .Select(assembly => new { assembly = assembly.FullName, mvid = assembly.ManifestModule.ModuleVersionId.ToString("D"), path = assembly.Location,
                        sha256 = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(assembly.Location))) }).ToArray();
                var nativePath = Path.GetFullPath(Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")!);
                var nativeModule = System.Diagnostics.Process.GetCurrentProcess().Modules.Cast<System.Diagnostics.ProcessModule>().Single(module =>
                    string.Equals(Path.GetFullPath(module.FileName), nativePath, StringComparison.OrdinalIgnoreCase));
                string evidence = Environment.GetEnvironmentVariable("MOVEMENT_NATIVE_EVIDENCE_PATH")!;
                using var expectedNative = JsonDocument.Parse(File.ReadAllText(Path.Combine(evidence, "expected-native-binding-01.json")));
                Assert.Equal(expectedNative.RootElement.GetProperty("native").GetProperty("sha256").GetString(),
                    Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(nativeModule.FileName))));
                Assert.Equal(expectedNative.RootElement.GetProperty("hfsm").GetProperty("sha256").GetString(),
                    loaded.Single(assembly => assembly.assembly!.StartsWith("Lumio.Engine.NativeLoader.Hfsm,", StringComparison.Ordinal)).sha256);
                string text = JsonSerializer.Serialize(new { qualification = "ACTUAL_NATIVE_COORDINATION_START_BIND_DRAIN_NOT_WASM", pid = Environment.ProcessId,
                    enabled, initialProviderAvailable = initialProvider is not null, initialStartResult, loaded, native = new { path = nativeModule.FileName, sha256 = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(nativeModule.FileName))) },
                    confirmed = new[] {confirmed.X,confirmed.Y,confirmed.Z}, predictedX = player.GetProperty("x").GetSingle(), batches });
                using (var stream = new FileStream(Path.Combine(evidence, enabled ? "native-coordination-on-01.json" : "native-coordination-off-01.json"), FileMode.CreateNew))
                using (var writer = new StreamWriter(stream)) writer.Write(text);
                owner.Host.Dispose(); owner.PumpUntil(() => owner.Host.Closed);
                Assert.False(provider.IsEnabled(EventLevel.Informational, (EventKeywords)2)); Assert.Equal("closed", Start(owner.Host));
                using var closed = JsonDocument.Parse(owner.Host.DrainInputTrace());
                if (enabled) Assert.True(closed.RootElement.GetProperty("coordinationCost").GetProperty("closed").GetBoolean());
                else Assert.Equal(JsonValueKind.Null, closed.RootElement.GetProperty("coordinationCost").ValueKind);
                using var empty = JsonDocument.Parse(owner.Host.DrainInputTrace());
                Assert.Equal(JsonValueKind.Null, empty.RootElement.GetProperty("coordinationCost").ValueKind);
            }, stepOptions: new BomberPlayerStepOptions(true));
        }
        finally { AppContext.SetSwitch("Lumio.Bomber.CoordinationCost", false); }
    }
}
