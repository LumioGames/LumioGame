using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Client.Gameplay.ECS;
using Lumio.Client.Gameplay.GAS;
using Lumio.Client.Gameplay.Input;
using Lumio.Client.Gameplay.Session;
using Lumio.Client.Log;
using Lumio.Client.Network.Connection;
using Lumio.Client.Network.Handshake;
using Lumio.Client.Spectator;
using Lumio.Client.Storage;
using Lumio.Engine.NativeLoader;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.Wire;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class BomberInputTraceTests
{
    [Fact]
    public void ActualClientSessionRefusalLeavesRequestDistinctUntilRealTransportAcceptance()
    {
        // The local baseline carrier reaches the shared ClientSession send boundary. Successor
        // receipts bind to the concrete WebSocket connection and cannot be proxied here.
        string native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH")
            ?? throw new InvalidOperationException("LUMIO_ENGINE_NATIVE_PATH is required");
        var budget = new KernelConfig { MaxNativeBytes = 256UL << 20, MaxHandles = 65536,
            MaxJobsQueued = 1024, MaxJobsRunning = 64, MaxCompletionItems = 1024,
            LogMailboxCapacity = 4096, MaxContexts = 64 };
        using var engine = LumioEngine.Start(native, budget);
        var trace = new BomberInputTrace();
        var carrier = new RefusingLocalConnectionFactory(new ClientConnectionFactory(engine.Hfsm));
        var ingress = new InputSampleIngress(16);
        var commands = new InputCommandSource(ingress, new FixedInputMapper());
        var options = new ClientEventPipelineOptions(8, 4, TimeSpan.FromSeconds(1));
        new ClientEventPipelineFactory().Create(in options, new InMemoryClientEventSink(8), out var events);
        byte[] catalog = File.ReadAllBytes(Path.Combine(BrowserSessionOwner.FindGame(),
            "Server/Assets/Maps/official-catalog.json"));
        var config = SpectatorDump.LoadEmbeddedClientConfig();
        var replicas = new ClientReplicaFactory(() => engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance)
        { Config = config.CreateWorldBinding(), Catalog = catalog, Subsystems = ReplicaSchedulingSubsystem.Create() }));
        var dependencies = new ClientSessionDependencies(engine.Hfsm, carrier, new ClientHandshakeFactory(),
            new GrantedCapability(), new TestHelloClassifier(), ingress, commands,
            IClientPersistenceFactory.CreateMemory().CreateVerifiedSessionArtifactSource(), events,
            new WorldChangeRuntimePort(), replicas, new ClientPredictionFactory(),
            new ImmediateGameplayScopeActivator(), new NullPresentationSink(),
            new JsonSessionMessageKindMap(new NoReplicaSectionEnvelopeReader()), new TraceObserver(trace),
            allowWelcomeOnlyAdmission: true);
        Assert.True(new ClientSessionFactory().Create(in dependencies, out var session).Succeeded);
        using (session)
        {
            ulong tick = 0;
            void Tick() => session.Tick(new ClientOwnerTick(++tick));
            Assert.True(session.RequestConnect(new SessionConnectRequest(1), CancellationToken.None).Succeeded);
            Tick();
            carrier.Deliver(TestHelloClassifier.Hello);
            Tick();
            var self = new NetEntityId(7, 2);
            carrier.Deliver(WireCodec.EncodePack(new WelcomeMessage(7, self, 1)));
            Tick();
            carrier.Deliver(WireCodec.EncodePack(new WorldChangeMessage(1, 0, new[] {
                new CreateRecord("world", new NetEntityId(7, 1), new[] {
                    new FieldValue(nameof(BomberMatchState), "phase", (int)BomberMatchPhase.Running),
                    new FieldValue(nameof(BomberMatchState), "matchId", 1UL),
                }),
                new CreateRecord("player", self, new[] {
                    new FieldValue(nameof(LogicTransform), "localPosition", "1,1.5,2"),
                    new FieldValue(nameof(BomberPlayerState), "participant", new NetEntityId(7, 4)),
                    new FieldValue(nameof(BomberPlayerState), "lifePhase", (int)BomberLifePhase.Vulnerable),
                }),
            }, Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>())));
            Tick();
            Assert.Equal(ClientSessionState.Active, session.GetSnapshot().State);
            Assert.True(session.TryGetReplicaWorld(out var replica));
            carrier.AcceptedFrames.Clear();
            var manager = replica.Manager;
            var before = manager.CaptureRpcCompletionContinuity();
            Assert.Equal(self, before.Sender);
            string sample = trace.Sample(manager, session.GetSnapshot().Generation, before.ConnectionGeneration, self.ToHex(),
                manager.World.Single<BomberMatchState>().MatchId.Value,
                manager.ClientPredictionElapsedStep, (int)BomberDirection.Right, 0, false, 0, 0, false)!;
            var move = new MoveAbility.Input { PrimaryDirection = BomberDirection.Right };
            Assert.True(manager.World.Get<AbilityComponent>(self).Activate<MoveAbility, MoveAbility.Input>(in move).Succeeded);
            var after = manager.CaptureRpcCompletionContinuity();
            Assert.Equal(before.NextSequence + 1, after.NextSequence);
            trace.Request(sample, nameof(MoveAbility), self.ToHex(), before.ConnectionGeneration, before.NextSequence,
                session.GetSnapshot().Generation);
            carrier.RefuseNext = true;
            Tick();
            byte[] refused = Assert.Single(carrier.RefusedFrames);
            var refusedMessage = WireCodec.DecodeInput(refused, self);
            Assert.Equal(before.NextSequence, refusedMessage.Sequence);
            Assert.Equal(self, refusedMessage.Sender);
            using (var blocked = JsonDocument.Parse(trace.Drain()))
            {
                var rows = blocked.RootElement.GetProperty("events").EnumerateArray().ToArray();
                Assert.Contains(rows, row => row.GetProperty("k").GetString() == "request" &&
                    row.GetProperty("sampleId").GetString() == sample);
                Assert.DoesNotContain(rows, row => row.GetProperty("k").GetString() == "accepted");
                Assert.Equal(1, blocked.RootElement.GetProperty("pending").GetInt32());
            }
            Tick();
            byte[] acceptedBytes = Assert.Single(carrier.AcceptedFrames);
            Assert.Equal(refused, acceptedBytes);
            using var delivered = JsonDocument.Parse(trace.Drain());
            var accepted = Assert.Single(delivered.RootElement.GetProperty("events").EnumerateArray(), row =>
                row.GetProperty("k").GetString() == "accepted");
            Assert.Equal(sample, accepted.GetProperty("sampleId").GetString());
            Assert.Equal(before.NextSequence.ToString(), accepted.GetProperty("sequence").GetString());
            Assert.Equal(Convert.ToHexString(SHA256.HashData(acceptedBytes)).ToLowerInvariant(),
                accepted.GetProperty("encodedSha256").GetString());
            Console.WriteLine(JsonSerializer.Serialize(new {
                qualification = "LOCAL_CLIENT_SESSION_NATIVE_TRY_SEND_BOUNDARY",
                refusedTrySendCount = carrier.RefusedFrames.Count,
                acceptedTrySendCount = carrier.AcceptedFrames.Count,
                sequence = refusedMessage.Sequence,
                encodedLength = acceptedBytes.Length,
                encodedSha256 = accepted.GetProperty("encodedSha256").GetString(),
                sampleId = sample,
            }));
        }
    }

    [Fact]
    public void ActualObserverAcceptanceJoinsAllocatedRequestAndSurvivesCloseWithExactBytes()
    {
        MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, self) =>
        {
            var host = owner.Host;
            host.SetInputIntentEnabled(true);
            host.SetMoveIntent((int)BomberDirection.Right, 0, true);
            int before = owner.ReceivedFrames.Length;
            owner.PumpUntil(() => owner.ReceivedFrames.Length > before);
            byte[] bytes = owner.ReceivedFrames[before];
            var message = WireCodec.DecodeAuthenticatedInput(bytes, owner.WireProfile, self, 9,
                "game-test-socket", BrowserSessionOwner.Incarnation);
            owner.Dispose();
            using var document = JsonDocument.Parse(host.DrainInputTrace());
            var rows = document.RootElement.GetProperty("events").EnumerateArray().ToArray();
            var accepted = Assert.Single(rows, row => row.GetProperty("k").GetString() == "accepted" &&
                row.GetProperty("sequence").GetString() == message.Sequence.ToString());
            var request = Assert.Single(rows, row => row.GetProperty("k").GetString() == "request" &&
                row.GetProperty("sequence").GetString() == message.Sequence.ToString());
            Assert.Equal("9", accepted.GetProperty("wireGeneration").GetString());
            Assert.Equal(request.GetProperty("sampleId").GetString(), accepted.GetProperty("sampleId").GetString());
            Assert.Equal(bytes.Length, accepted.GetProperty("encodedLength").GetInt32());
            Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
                accepted.GetProperty("encodedSha256").GetString());
            Assert.Equal(1, accepted.GetProperty("commandCount").GetInt32());
        }, stepOptions: new BomberPlayerStepOptions(true), wireGeneration: 9);
    }

    [Fact]
    public void RingRetainsExactly1024RecordsAndMarksLossAfter1025th()
    {
        var trace = new BomberInputTrace();
        var manager = new object();
        for (ulong i = 0; i < 1025; i++)
            Assert.NotNull(trace.Sample(manager, 1, 9, "self", 55, i, 2, 0, false, 0, 0, false));
        using var document = JsonDocument.Parse(trace.Drain());
        var fullRing = document.RootElement.GetProperty("events").EnumerateArray().ToList();
        Assert.Equal(1024, fullRing.Count);
        Assert.Equal("1", document.RootElement.GetProperty("eventLoss").GetString());
        Assert.False(document.RootElement.GetProperty("complete").GetBoolean());
        Assert.Equal("trace-overflow", document.RootElement.GetProperty("traceOverflow").GetProperty("k").GetString());
        Assert.Equal("2", fullRing[0].GetProperty("sampleId").GetString());
    }

    [Fact]
    public void NewSampleIdsStayUniqueAcrossResetOrdinalOnSameManager()
    {
        var trace = new BomberInputTrace();
        var manager = new object();
        string? first = trace.Sample(manager, 1, 9, "self", 55, 1, 2, 0, false, 0, 0, false);
        string? second = trace.Sample(manager, 1, 9, "self", 55, 1, 2, 0, false, 0, 0, false);
        Assert.NotEqual(first, second);
        using var document = JsonDocument.Parse(trace.Drain());
        Assert.Equal(new[] { "1", "2" }, document.RootElement.GetProperty("events").EnumerateArray()
            .Select(e => e.GetProperty("sampleId").GetString()).ToArray());
    }

    [Fact]
    public void MatcherRequiresSenderGenerationSequenceAndCurrentSession()
    {
        var trace = new BomberInputTrace();
        var sender = new NetEntityId(7, 1);
        var other = new NetEntityId(7, 2);
        var manager = new object();
        string sample = trace.Sample(manager, 1, 9, sender.ToHex(), 55, 1, 2, 0, false, 0, 0, false)!;
        trace.Request(sample, "MoveAbility", sender.ToHex(), 9, 42, 1);
        trace.Accepted(new InputCommandMessage(42, "rpc", other, new byte[] { 1 }, connectionGeneration: 9), new byte[] { 1 });
        trace.Accepted(new InputCommandMessage(42, "rpc", sender, new byte[] { 1 }), new byte[] { 1 });
        trace.Accepted(new InputCommandMessage(42, "rpc", sender, new byte[] { 1 }, connectionGeneration: 10), new byte[] { 1 });
        trace.Accepted(new InputCommandMessage(43, "rpc", sender, new byte[] { 1 }, connectionGeneration: 9), new byte[] { 1 });
        trace.Accepted(new InputCommandMessage(42, "rpc", sender, new byte[] { 1 }, connectionGeneration: 9), new byte[] { 1 });
        using var first = JsonDocument.Parse(trace.Drain());
        var accepted = first.RootElement.GetProperty("events").EnumerateArray()
            .Where(e => e.GetProperty("k").GetString() == "accepted").ToArray();
        Assert.Equal(5, accepted.Length);
        Assert.Equal(new string?[] { null, null, null, null, sample },
            accepted.Select(e => e.GetProperty("sampleId").GetString()).ToArray());
        Assert.False(first.RootElement.GetProperty("complete").GetBoolean());

        string old = trace.Sample(manager, 1, 9, sender.ToHex(), 55, 2, 2, 0, false, 0, 0, false)!;
        trace.Request(old, "MoveAbility", sender.ToHex(), 9, 44, 1);
        string current = trace.Sample(new object(), 2, 9, sender.ToHex(), 55, 1, 2, 0, false, 0, 0, false)!;
        trace.Request(current, "MoveAbility", sender.ToHex(), 9, 44, 2);
        trace.Accepted(new InputCommandMessage(44, "rpc", sender, new byte[] { 1 }, connectionGeneration: 9), new byte[] { 1 });
        using var second = JsonDocument.Parse(trace.Drain());
        Assert.Contains(second.RootElement.GetProperty("events").EnumerateArray(), e =>
            e.GetProperty("k").GetString() == "accepted" && e.GetProperty("sampleId").ValueKind == JsonValueKind.Null);
    }

    [Fact]
    public void PendingTableCapsAt256AndMarksEvictionIncomplete()
    {
        var trace = new BomberInputTrace();
        var manager = new object();
        string sample = trace.Sample(manager, 1, 9, "self", 55, 1, 2, 0, false, 0, 0, false)!;
        for (ulong sequence = 1; sequence <= 257; sequence++)
            trace.Request(sample, "MoveAbility", "self", 9, sequence, 1);
        using var document = JsonDocument.Parse(trace.Drain());
        Assert.Equal(256, document.RootElement.GetProperty("pending").GetInt32());
        Assert.Equal("1", document.RootElement.GetProperty("pendingLoss").GetString());
        Assert.False(document.RootElement.GetProperty("complete").GetBoolean());
    }

    [Fact]
    public void DiagnosticObserverFailureIsContainedAndMarksRecordingIncomplete()
    {
        var trace = new BomberInputTrace();
        var sender = new NetEntityId(7, 1);
        string sample = trace.Sample(new object(), 1, 9, sender.ToHex(), 55, 1, 2, 0, false, 0, 0, false)!;
        trace.Request(sample, "MoveAbility", sender.ToHex(), 9, 1, 1);
        var message = new InputCommandMessage(1, sender, new ThrowingCommands(), connectionGeneration: 9);
        trace.Accepted(message, new byte[] { 1, 2, 3 });
        using var document = JsonDocument.Parse(trace.Drain());
        Assert.False(document.RootElement.GetProperty("complete").GetBoolean());
        Assert.Equal("1", document.RootElement.GetProperty("diagnosticFailures").GetString());
    }

    [Fact]
    public void AdmissionBeforeFirstStepRequestIsVisibleOutsideStepScopeWithoutPoisoningCorrelation()
    {
        var trace = new BomberInputTrace();
        var sender = new NetEntityId(7, 1);
        trace.Accepted(new InputCommandMessage(1, "rpc", sender, new byte[] { 4 }, connectionGeneration: 9),
            new byte[] { 4 });
        using var first = JsonDocument.Parse(trace.Drain());
        Assert.True(first.RootElement.GetProperty("complete").GetBoolean());
        Assert.Equal("outside-step-accepted", first.RootElement.GetProperty("events")[0].GetProperty("k").GetString());
        string sample = trace.Sample(new object(), 1, 9, sender.ToHex(), 55, 1, 2, 0, false, 0, 0, false)!;
        trace.Request(sample, "MoveAbility", sender.ToHex(), 9, 2, 1);
        trace.Accepted(new InputCommandMessage(2, "rpc", sender, new byte[] { 5 }, connectionGeneration: 9),
            new byte[] { 5 });
        using var second = JsonDocument.Parse(trace.Drain());
        Assert.True(second.RootElement.GetProperty("complete").GetBoolean());
        Assert.Contains(second.RootElement.GetProperty("events").EnumerateArray(), row =>
            row.GetProperty("k").GetString() == "accepted" && row.GetProperty("sampleId").GetString() == sample);
    }

    [Fact]
    public void DelayedGenerationNineAcceptanceJoinsPriorSampleAfterCurrentGenerationChanges()
    {
        var trace = new BomberInputTrace();
        var manager = new object();
        var sender = new NetEntityId(7, 1);
        string prior = trace.Sample(manager, 1, 9, sender.ToHex(), 55, 1, 2, 0, false, 0, 0, false)!;
        trace.Request(prior, "MoveAbility", sender.ToHex(), 9, 7, 1);
        string current = trace.Sample(manager, 1, 10, sender.ToHex(), 55, 2, 2, 0, false, 0, 0, false)!;
        trace.Request(current, "MoveAbility", sender.ToHex(), 10, 8, 1);
        trace.Accepted(new InputCommandMessage(7, "rpc", sender, new byte[] { 7 }, connectionGeneration: 9),
            new byte[] { 7 });
        using var document = JsonDocument.Parse(trace.Drain());
        var accepted = Assert.Single(document.RootElement.GetProperty("events").EnumerateArray(), row =>
            row.GetProperty("k").GetString() == "accepted");
        Assert.Equal(prior, accepted.GetProperty("sampleId").GetString());
        Assert.NotEqual(current, accepted.GetProperty("sampleId").GetString());
        Assert.Equal("9", accepted.GetProperty("wireGeneration").GetString());
    }

    private sealed class ThrowingCommands : IReadOnlyList<InputCommandPart>
    {
        public int Count => 1;
        public InputCommandPart this[int index] => new("rpc", ReadOnlyMemory<byte>.Empty);
        public IEnumerator<InputCommandPart> GetEnumerator() => throw new InvalidOperationException("diagnostic-enumeration");
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }

    private sealed class TraceObserver(BomberInputTrace trace) : IClientOutboundMessageObserver
    {
        public void Observe(InputCommandMessage message, ReadOnlyMemory<byte> encodedBytes) => trace.Accepted(message, encodedBytes);
    }

    private sealed class RefusingLocalConnectionFactory(IClientConnectionFactory inner) : IClientConnectionFactory
    {
        public bool RefuseNext { get; set; }
        public List<byte[]> RefusedFrames { get; } = new();
        public List<byte[]> AcceptedFrames { get; } = new();
        private LocalEmbeddedLoopback? _loopback;
        public void Deliver(byte[] bytes) => Assert.True(_loopback!.TryDeliverToClient(new EncodedFrame(bytes)));
        public ClientConnectionCreateResult Create(in ClientConnectionCreateRequest request, out IClientConnection connection)
        {
            ClientConnectionCreateResult result = inner.Create(in request, out IClientConnection actual);
            _loopback = result.Loopback;
            connection = new RefusingConnection(actual, this);
            return result;
        }
        private sealed class RefusingConnection(IClientConnection actual, RefusingLocalConnectionFactory owner) : IClientConnection
        {
            public ConnectionGeneration Generation => actual.Generation;
            public Task DisposalCompletion => actual.DisposalCompletion;
            public ConnectionCommandResult Start() => actual.Start();
            public ConnectionSendResult TrySend(in EncodedFrame frame)
            {
                if (owner.RefuseNext)
                {
                    owner.RefuseNext = false;
                    owner.RefusedFrames.Add(frame.Bytes.ToArray());
                    return new ConnectionSendResult(false);
                }
                ConnectionSendResult result = actual.TrySend(in frame);
                if (result.Accepted) owner.AcceptedFrames.Add(frame.Bytes.ToArray());
                return result;
            }
            public ConnectionCommandResult RetirePendingSends() => actual.RetirePendingSends();
            public int DrainEvents(Span<ConnectionEvent> destination) => actual.DrainEvents(destination);
            public ConnectionCommandResult RequestClose(ConnectionCloseReason reason) => actual.RequestClose(reason);
            public ClientConnectionSnapshot GetSnapshot() => actual.GetSnapshot();
            public void Dispose() => actual.Dispose();
        }
    }

    private sealed class TestHelloClassifier : IHandshakeFrameClassifier
    {
        public static readonly byte[] Hello = { 0xA5, 0x3C, 0x91, 0x07, 0xD2, 0x4E, 0xB8, 0x11 };
        public HandshakeOpaqueFrameRole Classify(ReadOnlyMemory<byte> frame) =>
            frame.Span.SequenceEqual(Hello) ? HandshakeOpaqueFrameRole.ServerHello : HandshakeOpaqueFrameRole.Unclassified;
    }

    private sealed class GrantedCapability : IPlatformCapabilityProvider
    {
        public ValueTask<PlatformCapabilityResult> QueryAsync(in PlatformCapabilityQuery query, CancellationToken cancellationToken)
        { cancellationToken.ThrowIfCancellationRequested(); return new(new PlatformCapabilityResult(query.Attempt, query.Generation, true)); }
    }

    private sealed class FixedInputMapper : IGameInputMapper
    {
        public bool TryMap(in SequencedInputSample sample, in InputDrainContext context, out GameplayCommandCandidate candidate)
        { candidate = new GameplayCommandCandidate(sample.Sequence, new byte[] { 0x42 }); return true; }
    }

    [Fact]
    public void DisabledTraceIsEmptyWithoutDisablingRealInputOrStatus()
    {
        MovementPredictionPublicationTests.RunActualPrediction("clear", beforeMove: (owner, self) =>
        {
            var host = owner.Host;
            host.SetInputIntentEnabled(true);
            int before = owner.ReceivedFrames.Length;
            owner.PumpUntil(() => owner.ReceivedFrames.Length > before);
            Assert.True(owner.ReceivedFrames.Length > before);
            using var document = JsonDocument.Parse(host.DrainInputTrace());
            Assert.False(document.RootElement.GetProperty("enabled").GetBoolean());
            Assert.Empty(document.RootElement.GetProperty("events").EnumerateArray());
            Assert.Equal("accepted", host.GetBombIntentStatusCode());
        }, stepOptions: new BomberPlayerStepOptions());
    }
}
