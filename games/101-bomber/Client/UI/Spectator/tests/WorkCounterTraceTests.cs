using System.Diagnostics;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Runtime.ExceptionServices;
using System.Text.Json;
using Lumio.Client.Gameplay.ECS;
using Lumio.Client.Gameplay.GAS;
using Lumio.Client.Gameplay.Session;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Ecs.Annotations;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Primitives;
using PresentationKeyDelta = Lumio.Client.Gameplay.GAS.PresentationKeyDelta;
using PresentationKey = Lumio.Client.Gameplay.GAS.PresentationKey;
using PredictionTraceBind = Lumio.Client.Gameplay.GAS.PredictionTraceBind;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class WorkCounterTraceTests
{
    private static JsonElement Pair(JsonDocument document)
    {
        var row = Assert.Single(document.RootElement.GetProperty("events").EnumerateArray(),
            row => row.GetProperty("k").GetString() == "work-counters");
        var pair = row.GetProperty("workCounters");
        Assert.Equal(document.RootElement.GetProperty("facadeTiming").GetProperty("ordinal").GetString(),
            pair.GetProperty("facadeOrdinal").GetString());
        return pair;
    }
    private static JsonDocument Drain(SpectatorReplicaHost host) => JsonDocument.Parse(host.DrainInputTrace());
    private static SpectatorReplicaHost Host(SessionProbe session, BomberInputTrace? trace = null, bool enabled = true) =>
        new(session, new BomberPlayerStepOptions(enabled), trace ?? new BomberInputTrace());
    private static void NativeProbe(Action<NativeCounterFixture, SessionProbe, GasJointPrediction> inspect)
    {
        using var owner = new NativeCounterFixture();
        var gas = Assert.IsType<GasJointPrediction>(GasJointPrediction.For(owner.Manager));
        var probe = new SessionProbe { Replica = new ReplicaProbe(owner.Manager), Prediction = new PredictionProbe() };
        inspect(owner, probe, gas);
    }

    [Fact]
    public void DisabledGateKeepsOriginalCallsAndNeverQueriesPrediction()
    {
        var session = new SessionProbe { PredictionFailure = new("disabled observer queried") };
        var host = Host(session, enabled: false);
        host.Tick(); using var json = Drain(host);
        Assert.Equal(["snapshot", "replica", "snapshot", "tick", "snapshot", "replica", "snapshot", "snapshot"], session.Calls);
        Assert.Equal(1, session.TickCalls);
        Assert.Empty(json.RootElement.GetProperty("events").EnumerateArray());
    }

    [Fact]
    public void MissingReplicaIsExplicitUnavailableWithNullDelta()
    {
        var session = new SessionProbe(); var host = Host(session);
        host.Tick(); using var json = Drain(host); var pair = Pair(json);
        Assert.False(pair.GetProperty("available").GetBoolean());
        Assert.Equal("prediction-unavailable", pair.GetProperty("reason").GetString());
        Assert.Equal(JsonValueKind.Null, pair.GetProperty("delta").ValueKind);
        Assert.Equal(1, session.TickCalls);
    }

    [Fact]
    public void SameIdentityReportsRealGasGettersStageDeltasAndDecreasingStock()
    {
        NativeProbe((owner, session, gas) =>
        {
            var before = gas.Metrics;
            session.OnTick = () => { session.Stages = 8; session.Groups = 1; session.Prediction!.Assigned = 12; session.Prediction.Confirmed = 11; session.Prediction.History = 1;
                owner.AdmitInput(); owner.Manager.Tick(); };
            var host = Host(session); host.Tick(); using var json = Drain(host); var pair = Pair(json);
            Assert.True(pair.GetProperty("available").GetBoolean());
            Assert.Equal(5, pair.GetProperty("delta").GetProperty("replicaStageCalls").GetInt32());
            Assert.Equal(5, pair.GetProperty("delta").GetProperty("runtimeAuthorityCalls").GetInt32());
            Assert.Equal("2", pair.GetProperty("delta").GetProperty("lastAssignedSeq").GetString());
            Assert.Equal("3", pair.GetProperty("delta").GetProperty("confirmedSeq").GetString());
            Assert.Equal(4, pair.GetProperty("before").GetProperty("openAuthorityGroups").GetInt32());
            Assert.Equal(1, pair.GetProperty("after").GetProperty("openAuthorityGroups").GetInt32());
            Assert.Equal(before.InputExecutions.ToString(CultureInfo.InvariantCulture), pair.GetProperty("before").GetProperty("inputExecutions").GetString());
            Assert.Equal(gas.Metrics.Replays.ToString(CultureInfo.InvariantCulture), pair.GetProperty("after").GetProperty("replays").GetString());
            Assert.True(gas.Metrics.InputExecutions > before.InputExecutions);
            Assert.Equal((gas.Metrics.InputExecutions - before.InputExecutions).ToString(CultureInfo.InvariantCulture),
                pair.GetProperty("delta").GetProperty("inputExecutions").GetString());
            Assert.Equal(gas.OutstandingCount, pair.GetProperty("after").GetProperty("outstandingCount").GetInt32());
            Assert.Equal(gas.RetainedBytes.ToString(CultureInfo.InvariantCulture), pair.GetProperty("after").GetProperty("retainedBytes").GetString());
            Assert.Equal(1, session.TickCalls);
            Assert.Equal(1, owner.Registry.MappedInputs);
            Assert.Equal(2, session.Replica!.SelfLookupCalls);
            owner.WriteSpecimen(json.RootElement);
            Assert.True(long.Parse(pair.GetProperty("before").GetProperty("captureEndedStamp").GetString()!) <=
                long.Parse(json.RootElement.GetProperty("facadeTiming").GetProperty("preIdentity").GetProperty("startedStamp").GetString()!));
            Assert.True(long.Parse(pair.GetProperty("after").GetProperty("captureStartedStamp").GetString()!) >=
                long.Parse(json.RootElement.GetProperty("facadeTiming").GetProperty("postIdentityCleanup").GetProperty("endedStamp").GetString()!));
        });
    }

    [Theory]
    [InlineData("session-generation")]
    [InlineData("prediction-generation")]
    [InlineData("prediction-instance")]
    [InlineData("manager-instance")]
    [InlineData("driver-instance")]
    [InlineData("driver-retired")]
    [InlineData("counter-decreased")]
    public void IdentityBoundariesAndCounterRollbackNeverInventDelta(string change)
    {
        NativeProbe((owner, session, _) =>
        {
            using var other = change == "manager-instance" ? owner.CreateManager() : null;
            session.OnTick = () => {
                switch (change)
                {
                    case "session-generation": session.Generation++; break;
                    case "prediction-generation": session.Prediction!.Generation++; break;
                    case "prediction-instance": session.Prediction = new PredictionProbe(); break;
                    case "manager-instance": session.Replica = new ReplicaProbe(other!); break;
                    case "driver-instance": owner.ReplaceDriver(); break;
                    case "driver-retired": owner.Gas.Retire(); break;
                    default: session.Stages--; break;
                }
            };
            var host = Host(session); host.Tick(); using var json = Drain(host); var pair = Pair(json);
            Assert.False(pair.GetProperty("available").GetBoolean());
            Assert.Equal(change == "counter-decreased" ? "counter-decreased" : change == "driver-retired" ? "driver-unavailable" : "identity-changed",
                pair.GetProperty("reason").GetString());
            Assert.Equal(JsonValueKind.Null, pair.GetProperty("delta").ValueKind);
            if (change == "driver-instance")
            {
                Assert.Equal(pair.GetProperty("before").GetProperty("managerId").GetString(), pair.GetProperty("after").GetProperty("managerId").GetString());
                Assert.NotEqual(pair.GetProperty("before").GetProperty("driverId").GetString(), pair.GetProperty("after").GetProperty("driverId").GetString());
            }
        });
    }

    [Fact]
    public void DisposedSessionDoesNotTickAndIsUnavailable()
    {
        var session = new SessionProbe { Disposed = true }; var host = Host(session);
        host.Tick(); using var json = Drain(host); var pair = Pair(json);
        Assert.Equal(0, session.TickCalls);
        Assert.False(pair.GetProperty("sessionInvoked").GetBoolean());
        Assert.Equal("session-not-invoked", pair.GetProperty("reason").GetString());
        Assert.Equal(JsonValueKind.Null, pair.GetProperty("delta").ValueKind);
    }

    [Fact]
    public void ObservationFailureCannotReplaceOriginalTickException()
    {
        var original = new InvalidOperationException("original tick");
        var session = new SessionProbe { PredictionFailure = new("observer failure"), TickFailure = original };
        var host = Host(session);
        Assert.Same(original, Assert.Throws<InvalidOperationException>(host.Tick));
        using var json = Drain(host); var pair = Pair(json);
        Assert.Equal("capture-failed", pair.GetProperty("reason").GetString());
        Assert.Equal(JsonValueKind.Null, pair.GetProperty("delta").ValueKind);
        Assert.False(json.RootElement.GetProperty("complete").GetBoolean());
        Assert.Equal("2", json.RootElement.GetProperty("diagnosticFailures").GetString());
        Assert.Equal(1, session.TickCalls);
    }

    [Fact]
    public void BeginLossRetainsOnlyTheAcceptedPairAndItsOrdinal()
    {
        var session = new SessionProbe(); var host = Host(session);
        host.Tick(); int priorCalls = session.Calls.Count; session.Generation = 2; host.Tick();
        Assert.Equal(priorCalls + 8, session.Calls.Count);
        int beforeDrain = session.Calls.Count;
        using var first = Drain(host); var pair = Pair(first);
        Assert.Equal(beforeDrain, session.Calls.Count);
        Assert.Equal("1", pair.GetProperty("facadeOrdinal").GetString());
        Assert.Equal("1", pair.GetProperty("before").GetProperty("sessionGeneration").GetString());
        Assert.Equal("1", first.RootElement.GetProperty("facadeTimingLoss").GetString());
        host.Tick(); using var second = Drain(host);
        Assert.Equal("2", Pair(second).GetProperty("facadeOrdinal").GetString());
        Assert.Equal("2", Pair(second).GetProperty("before").GetProperty("sessionGeneration").GetString());
    }

    [Fact]
    public void FailedPeekPreservesPairUntilSuccessfulTypedDrain()
    {
        int peeks = 0;
        var trace = new BomberInputTrace(new ManagedFacadeTiming(beforeSnapshot: () => { if (++peeks == 1) throw new InvalidOperationException("peek"); }));
        var host = Host(new SessionProbe(), trace); host.Tick();
        using var failed = Drain(host);
        Assert.DoesNotContain(failed.RootElement.GetProperty("events").EnumerateArray(), row => row.GetProperty("k").GetString() == "work-counters");
        using var good = Drain(host); Assert.Equal("1", Pair(good).GetProperty("facadeOrdinal").GetString());
        using var empty = Drain(host);
        Assert.DoesNotContain(empty.RootElement.GetProperty("events").EnumerateArray(), row => row.GetProperty("k").GetString() == "work-counters");
    }

    [Fact]
    public void FailedSerializationThenFailedPeekRetainsPairAndTimingTogetherExactlyOnce()
    {
        int peeks = 0, serializations = 0;
        var trace = new BomberInputTrace(
            new ManagedFacadeTiming(beforeSnapshot: () => { if (++peeks == 2) throw new InvalidOperationException("peek"); }),
            batch => { if (++serializations == 1) throw new InvalidOperationException("serialize");
                return JsonSerializer.Serialize(batch, SpectatorJsonContext.Default.InputTraceBatchDto); });
        var session = new SessionProbe(); var host = Host(session, trace); host.Tick();
        trace.Sample(session, 1, 9, "self", 55, 1, 1, 0, false, 0, 0, false);
        using var failedSerialize = Drain(host);
        Assert.Empty(failedSerialize.RootElement.GetProperty("events").EnumerateArray());
        using var failedPeek = Drain(host);
        Assert.Empty(failedPeek.RootElement.GetProperty("events").EnumerateArray());
        using var good = Drain(host);
        Assert.Equal("1", Pair(good).GetProperty("facadeOrdinal").GetString());
        Assert.Single(good.RootElement.GetProperty("events").EnumerateArray(), row => row.GetProperty("k").GetString() == "sample");
        Assert.Equal("0", good.RootElement.GetProperty("eventLoss").GetString());
        Assert.Equal(2, serializations);
        using var empty = Drain(host);
        Assert.Empty(empty.RootElement.GetProperty("events").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, empty.RootElement.GetProperty("facadeTiming").ValueKind);
        Assert.Equal(1, session.TickCalls);
    }

    [Fact]
    public void PendingScalarPairDoesNotRetainPredictionAcrossTicks()
    {
        var (trace, prediction) = CompletedPair();
        GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect();
        Assert.False(prediction.IsAlive);
        using var json = JsonDocument.Parse(trace.Drain());
        Assert.Equal("replica-unavailable", Pair(json).GetProperty("reason").GetString());
        Assert.Equal("1", Pair(json).GetProperty("before").GetProperty("predictionId").GetString());
        Assert.Equal("1", Pair(json).GetProperty("after").GetProperty("predictionId").GetString());
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static (BomberInputTrace, WeakReference) CompletedPair()
    {
        var prediction = new PredictionProbe();
        var trace = new BomberInputTrace();
        Host(new SessionProbe { Prediction = prediction }, trace).Tick();
        return (trace, new WeakReference(prediction));
    }

    [Fact]
    public void CounterEventUsesExistingBoundedRingAndKeepsUlongPrecision()
    {
        var trace = new BomberInputTrace(); var session = new SessionProbe { Generation = 9007199254740993UL };
        var host = Host(session, trace); host.Tick();
        for (ulong i = 0; i < BomberInputTrace.EventCapacity; i++) trace.Sample(session, 1, 9, "self", 55, i, 1, 0, false, 0, 0, false);
        using var json = Drain(host); var pair = Pair(json);
        Assert.Equal("9007199254740993", pair.GetProperty("before").GetProperty("sessionGeneration").GetString());
        Assert.Equal(BomberInputTrace.EventCapacity, json.RootElement.GetProperty("events").GetArrayLength());
        Assert.Equal("1", json.RootElement.GetProperty("eventLoss").GetString());
        Assert.False(json.RootElement.GetProperty("complete").GetBoolean());
    }

    private sealed class SessionProbe : IClientSession
    {
        internal List<string> Calls { get; } = [];
        internal ReplicaProbe? Replica;
        internal PredictionProbe? Prediction;
        internal InvalidOperationException? PredictionFailure, TickFailure;
        internal Action? OnTick;
        internal bool Disposed;
        internal ulong Generation = 1;
        internal int Stages = 3, Groups = 4, TickCalls;
        public ClientSessionSnapshot GetSnapshot()
        {
            Calls.Add("snapshot");
            return new(ClientSessionState.Active, Generation, false, 0, false, false, false, Stages, Stages, Stages, 0, 0, 0, [],
                SessionCleanupStatus.None, Disposed, 0, true, openAuthorityGroups: Groups, heldSections: Groups);
        }
        public SessionTickResult Tick(in ClientOwnerTick tick)
        { Calls.Add("tick"); TickCalls++; OnTick?.Invoke(); if (TickFailure is { } error) throw error; return default; }
        public bool TryGetReplicaWorld(out IReplicaWorld world) { Calls.Add("replica"); world = Replica!; return world is not null; }
        public bool TryGetPrediction(out IClientPrediction prediction)
        { Calls.Add("prediction"); if (PredictionFailure is { } error) throw error; prediction = Prediction!; return prediction is not null; }
        public SessionCommandResult RequestConnect(in SessionConnectRequest request, CancellationToken cancellationToken) => default;
        public SessionCommandResult Login(in SessionConnectRequest request, CancellationToken cancellationToken) => default;
        public SessionCommandResult RequestClose(in SessionCloseRequest request) => default;
        public bool TryDequeueSuperseded(out SessionSupersededNotice notice) { notice = default; return false; }
        public bool TryUpdateOwnerPresentation(out OwnerPresentationPose pose) { pose = default; return false; }
        public void Dispose() { }
    }
    private sealed class PredictionProbe : IClientPrediction
    {
        internal ulong Generation = 7, Assigned = 10, Confirmed = 8;
        internal int History = 2;
        public PredictionSnapshot GetSnapshot() => new(Generation, Assigned, Confirmed, History, 256, 20, 0, 0, false);
        public PredictionCandidateResult AcceptCandidate(in PredictionCandidate candidate, in PredictionCandidateContext context, out PredictionCandidateStage stage, out LocalPredictionPlan localPlan) { stage = default; localPlan = default; throw new NotSupportedException(); }
        public PredictionLocalOutcomeResult DiscardCandidateStage(PredictionCandidateStage stage, PredictionStageDiscardReason reason) => throw new NotSupportedException();
        public PredictionLocalOutcomeResult ObserveLocalPredictionOutcome(PredictionCandidateStage stage, in LocalPredictionOutcome outcome, out AcceptedPredictionCommand acceptedCommand) { acceptedCommand = default; throw new NotSupportedException(); }
        public PredictionAuthorityResult StageAuthority(in AuthorityPredictionUpdate update, in PredictionAuthorityContext context, out PredictionAuthorityStage stage, out PredictionReconcilePlan reconcilePlan) { stage = default; reconcilePlan = default; throw new NotSupportedException(); }
        public PredictionAuthorityOutcomeResult DiscardAuthorityStage(PredictionAuthorityStage stage, PredictionStageDiscardReason reason) => throw new NotSupportedException();
        public PredictionAuthorityOutcomeResult ObserveRuntimeOutcome(PredictionAuthorityStage stage, in AuthorityRuntimeOutcome outcome) => throw new NotSupportedException();
        public PredictionResetResult ResetForNewSession(in PredictionResetRequest request) => throw new NotSupportedException();
        public bool TryObservePresentationDelta(in PresentationKeyDelta delta, out PresentationApplyResult result) { result = default; throw new NotSupportedException(); }
        public bool TryGetController(in PresentationKey key, out ulong controllerId) { controllerId = 0; throw new NotSupportedException(); }
        public void BindTrace(in PredictionTraceBind bind) => throw new NotSupportedException();
        public IReadOnlyList<PredictionTraceBind> GetTrace() => throw new NotSupportedException();
        public IReadOnlyList<UnconfirmedInputCopy> CopyUnconfirmedAfter(ulong appliedInputSequence) => throw new NotSupportedException();
        public bool TryEnqueueUnacked(ulong sequence, ReadOnlyMemory<byte> payload) => throw new NotSupportedException();
    }
    private sealed class ReplicaProbe(WorldManager manager) : IReplicaWorld
    {
        internal int SelfLookupCalls;
        public WorldManager Manager => manager;
        public ReplicaBindingLookup SelfLookup() { SelfLookupCalls++; return default; }
        public IReadOnlyList<WorldMessage> DrainOutbound() => throw new NotSupportedException();
        public WorldDrainResponse Drain() => throw new NotSupportedException();
        public IReadOnlyList<WorldMessage> DrainQueries() => throw new NotSupportedException();
        public ReplicaEntityResolve Resolve(string roomId, string netEntityId, ulong connectionGeneration, bool hasConnectionGeneration) => throw new NotSupportedException();
        public ReplicaAttributeQueryResult QueryAttribute(in ReplicaAttributeQuery query) => throw new NotSupportedException();
        public ReplicaFieldObservation ReadField(string netEntityId, string attributeId, ulong? connectionGeneration = null) => throw new NotSupportedException();
        public ReplicaWorldPosition ReadWorldPosition(string netEntityId) => throw new NotSupportedException();
        public ReplicaVoxelCell ReadConfirmedVoxel(ulong sectionKey, int cellOffset) => throw new NotSupportedException();
        public IReadOnlyList<ReplicaChatLine> CopyChatWindow() => throw new NotSupportedException();
        public IReadOnlyList<ReplicaIdentityRecord> CopyIdentityRecords() => throw new NotSupportedException();
        public ReplicaIdentityRecord ReadWorldIdentity() => throw new NotSupportedException();
        public int VisibleEntityCount => 0;
        public bool InputEnabled => true;
        public ReplicaConnectionSuperseded LastConnectionSuperseded => default;
        public string LastRejectCode => string.Empty;
    }

    // This fixture observes real Native GAS admission without the full map/DS
    // startup. Client prediction/session counters remain explicit test probes.
    private sealed class NativeCounterFixture : IDisposable
    {
        private const string Connection = "work-counter-probe";
        private static readonly NetEntityId Self = new(41, 2);
        private readonly LumioEngine _engine;
        private readonly List<WorldManager> _managers = [];
        private readonly byte[] _catalog;
        private bool _unclosedSession;
        private AggregateException? _unclosedSessionFailure;
        internal CounterRegistry Registry { get; } = new();
        internal WorldManager Manager { get; }
        internal GasJointPrediction Gas { get; private set; }
        internal NativeCounterFixture()
        {
            string native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")
                ?? throw new InvalidOperationException("An official selected Native image is required.");
            _catalog = File.ReadAllBytes(Path.Combine(BrowserSessionOwner.FindGame(), "Server/Assets/Maps/official-catalog.json"));
            var budget = new KernelConfig { MaxNativeBytes = 256UL << 20, MaxHandles = 65536, MaxJobsQueued = 1024, MaxJobsRunning = 64,
                MaxCompletionItems = 1024, LogMailboxCapacity = 4096, MaxContexts = 64 };
            _engine = LumioEngine.Start(native, budget);
            try { Manager = CreateManager(); Gas = AttachDriver(); }
            catch (Exception original)
            {
                if (_unclosedSession) throw;
                try { foreach (var manager in _managers) manager.Dispose(); _engine.Dispose(); }
                catch (Exception cleanup) { throw new AggregateException(original, cleanup); }
                throw;
            }
        }
        internal WorldManager CreateManager()
        {
            var manager = _engine.CreateWorld(new WorldCreationOptions(Registry) { Catalog = _catalog });
            _managers.Add(manager);
            manager.Enqueue(new WelcomeMessage(Self.InstanceId, Self, 1, Connection));
            manager.Enqueue(new WorldChangeMessage(1, 0, [new CreateRecord("counter-probe", Self, [])], [], [], []));
            manager.Tick();
            return manager;
        }
        private GasJointPrediction AttachDriver()
        {
            var resources = NativeWorldVoxelResources.Require(Manager);
            var abi = new VoxelFacadeNativeAbi(resources.Voxel);
            Assert.Equal(0, abi.OpenPrediction(resources.Voxel.NativeHandle,
                new VoxelPredictionConfig(100_000, 8, 16, 16, 16, 1, 16, 8, 64), out IVoxelPredictionSession? session));
            Assert.NotNull(session);
            try { return new GasJointPrediction(Manager, session, Connection, 1, resources.Adapter); }
            catch (Exception original)
            {
                try { Assert.Equal(0, session.Close()); }
                catch (Exception cleanup)
                {
                    _unclosedSession = true;
                    _unclosedSessionFailure = new AggregateException("Native prediction close failed; manager/voxel/Engine resources retained.", original, cleanup);
                    throw _unclosedSessionFailure;
                }
                throw;
            }
        }
        internal void AdmitInput() => Manager.EnqueueLocalInput(Connection, 1,
            new InputCommandMessage(1, "counter-noop", Self, ReadOnlyMemory<byte>.Empty, Connection, 1));
        internal void ReplaceDriver() { Gas.Dispose(); Gas = AttachDriver(); }
        internal void WriteSpecimen(JsonElement batch)
        {
            string path = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")!;
            var module = Process.GetCurrentProcess().Modules.Cast<ProcessModule>().Single(row =>
                string.Equals(Path.GetFullPath(row.FileName), Path.GetFullPath(path), StringComparison.OrdinalIgnoreCase));
            string specimen = JsonSerializer.Serialize(new { pid = Environment.ProcessId,
                native = module.FileName, nativeSha256 = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(module.FileName))),
                facadeAssembly = typeof(SpectatorReplicaHost).Assembly.Location, facadeMvid = typeof(SpectatorReplicaHost).Module.ModuleVersionId,
                mappedInputs = Registry.MappedInputs, gasMetrics = Gas.Metrics, batch });
            string evidence = Environment.GetEnvironmentVariable("MOVEMENT_NATIVE_EVIDENCE_PATH")!;
            File.WriteAllText(Path.Combine(evidence, "work-counter-native-loaded-01.json"), specimen);
            Console.WriteLine("WORK_COUNTER_NATIVE_SPECIMEN=" + specimen);
        }
        public void Dispose()
        {
            // A failed replacement may still own a newly opened session even
            // though Gas refers to the successfully disposed previous driver.
            if (_unclosedSession) ExceptionDispatchInfo.Capture(_unclosedSessionFailure!).Throw();
            // The driver owns its Native session; borrowed world/voxel/Engine
            // resources stay live if its close reports pending or fails.
            Gas.Dispose();
            foreach (var manager in _managers) manager.Dispose();
            Assert.Equal(0, _engine.WorldCount);
            _engine.Dispose();
        }
    }
    private sealed class CounterRegistry : EcsRegistry
    {
        private sealed class ProbeWorld { }
        private sealed class ProbePlayer { }
        internal int MappedInputs;
        public override void CreateWorldServices(World world) => _ = new GasWorldContext(world);
        public override RegistrySide Side => RegistrySide.Client;
        public override Type WorldEntityType => typeof(ProbeWorld);
        public override IReadOnlyList<FieldAttributeDeclaration> AttributeDeclarations => [];
        public override Component[] CreateComponents(Type type) => type == typeof(ProbePlayer) ? [new ObserverComponent()] : [];
        public override string WireName(Type type) => type == typeof(ProbePlayer) ? "counter-probe" : "counter-world";
        public override bool TryResolveEntityType(string name, out Type type)
        { type = name == "counter-probe" ? typeof(ProbePlayer) : typeof(ProbeWorld); return name is "counter-probe" or "counter-world"; }
        public override bool IsEntityType(Type concrete, Type query) => concrete == query;
        public override bool TryApplyMappedInput(World world, InputCommandMessage input)
        {
            Assert.Equal("counter-noop", input.MappingId);
            MappedInputs++;
            return true;
        }
    }
}
