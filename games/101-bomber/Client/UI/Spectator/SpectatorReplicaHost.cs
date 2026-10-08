using System;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Lumio.Client.Engine.Wasm;
using Lumio.Client.Gameplay.ECS;
using Lumio.Client.Gameplay.GAS;
using Lumio.Client.Gameplay.Input;
using Lumio.Client.Gameplay.Session;
using Lumio.Client.Log;
using Lumio.Client.Network.Connection;
using Lumio.Client.Network.Handshake;
using Lumio.Client.Spectator;
using Lumio.Client.Storage;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Config.Generated.Client;

namespace Lumio.Bomber.Client.Spectator;

/// <summary>Product composition over the standard ClientSession; owns no transport or replica rules.</summary>
public sealed class SpectatorReplicaHost : IDisposable
{
    private readonly IClientSession _session;
    private readonly RuntimeJointPrediction _joint;
    private readonly SentObserver _sent = new();
    private bool _closing;
    private string _lastError = string.Empty;
    private RuntimePerfDiagnostics? _runtimePerf;

    public SpectatorReplicaHost(LumioEngine engine, IClientConnectionFactory connections, byte[] catalog,
        string launchJson, Func<CancellationToken, Task<string>> renewEndpoint, Action<string> log,
        Func<WorldManager, IReplicaVoxelSink>? voxelSections = null, BomberClientConfig? configuration = null, bool runtimePerf = false)
    {
        var launch = ReadLaunch(launchJson);
        var config = configuration ?? SpectatorDump.LoadEmbeddedClientConfig();
        var input = new InputSampleIngress(16);
        var sections = new ReplicaSectionEnvelopeReader();
        _joint = new RuntimeJointPrediction(new VoxelPredictionConfig(64UL << 20, 512, 4096, 4096, 4096, 64, 4096, 1024, 256));
        var replicas = new ClientReplicaFactory(() => engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance)
        {
            Config = config.CreateWorldBinding(), Catalog = catalog, Subsystems = ReplicaSchedulingSubsystem.Create(),
            // Native's 64 MiB limit and managed prediction each have a finite allowance.
            // The combined Runtime owner must not silently use its 1 MiB default.
            IngressBudget = new WorldIngressBudget(256, 1_048_576, 256, 1_048_576,
                predictionCapacity: 512, predictionMaxBytes: 128L << 20),
        }));
        var dependencies = new ClientSessionDependencies(engine.Hfsm, connections, new ClientHandshakeFactory(),
            new BrowserCapabilities(), new UnpublishedHandshakeFrameClassifier(), input, new InputCommandSource(input, new AbilityInputMapper()),
            IClientPersistenceFactory.CreateMemory().CreateVerifiedSessionArtifactSource(),
            new BrowserEvents(log, reason => { if (_lastError.Length == 0) _lastError = reason; }),
            new WorldChangeRuntimePort(), replicas, new ClientPredictionFactory(), new ImmediateGameplayScopeActivator(),
            new NullPresentationSink(), new JsonSessionMessageKindMap(sections), _sent, allowWelcomeOnlyAdmission: true,
            endpointProvider: new PlatformEndpointProvider(launch.Profile, launch.Endpoint, renewEndpoint), sectionEnvelopes: sections,
            voxelSections: voxelSections ?? (manager => new EngineWasmSectionSink(EngineWasmWorldVoxelResources.Require(manager))), jointPrediction: _joint);
        if (!new ClientSessionFactory().Create(in dependencies, out _session).Succeeded)
            throw new InvalidOperationException("client_session_creation_failed");
        if (runtimePerf) ConfigureRuntimePerf(true);
    }
    public void Connect(string launchJson)
    {
        if (!_session.RequestConnect(new SessionConnectRequest(1, ReadLaunch(launchJson).Endpoint), CancellationToken.None).Succeeded)
            throw new InvalidOperationException("client_session_connect_rejected");
    }

    public static (ClientEndpoint Endpoint, string Profile) ReadLaunch(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        string Get(string name) => root.GetProperty(name).GetString() ?? throw new FormatException("launch_" + name + "_missing");
        string profile = Get("subprotocol");
        _ = TransportOptions(profile);
        string room = Get("roomId");
        if (string.IsNullOrWhiteSpace(room)) throw new FormatException("launch_room_missing");
        var endpoint = new ClientEndpoint(Get("wsUrl"), Encoding.UTF8.GetBytes(Get("admissionCredential")),
            ReadOnlyMemory<byte>.Empty, TimeSpan.FromSeconds(10), room);
        if (!endpoint.TryValidate(out string error)) throw new FormatException(error);
        return (endpoint, profile);
    }

    public static WebSocketTransportOptions TransportOptions(string profile)
    {
        bool receipts = profile is WebSocketTransportOptions.SuccessorBindingReceiptsSubProtocol or WebSocketTransportOptions.SuccessorBindingReceiptsPartsSubProtocol;
        bool parts = profile is WebSocketTransportOptions.SuccessorBindingPartsSubProtocol or WebSocketTransportOptions.SuccessorBindingReceiptsPartsSubProtocol;
        var options = new WebSocketTransportOptions(WebSocketTransportOptions.SuccessorMaxMessageBytes,
            WebSocketTransportOptions.DefaultReceiveBufferBytes, WebSocketTransportOptions.DefaultKeepAliveInterval,
            receipts, parts, requireSuccessorBinding: true);
        if (options.RequiredSubProtocol != profile) throw new FormatException("launch_successor_profile_required");
        return options;
    }

    private IReplicaWorld? Replica => !_session.GetSnapshot().IsDisposed && _session.TryGetReplicaWorld(out var world) ? world : null;
    public World? World => Replica?.Manager.World;
    public bool InputEnabled => !_closing && _session.GetSnapshot().State == ClientSessionState.Active && Replica?.InputEnabled == true;
    public bool Closed => _session.GetSnapshot().IsDisposed;
    public string ConnectionState => _session.GetSnapshot().State.ToString().ToLowerInvariant();
    public string LastApplyError => _lastError.Length > 0 ? _lastError : Replica?.LastRejectCode ?? string.Empty;
    public static ulong TickRateHz => GeneratedRegistry.Instance.DeclaredTickRateHz;
    public void Tick()
    {
        var perf = _runtimePerf;
        perf?.BeginPump(_session);
        Exception? primary = null;
        try
        {
            var before = _session.GetSnapshot();
            if (!before.IsDisposed) _session.Tick(new ClientOwnerTick(checked(before.OwnerTick + 1)));
            if (_session.GetSnapshot().CleanupStatus == SessionCleanupStatus.Failed)
                throw new InvalidOperationException("client_cleanup_failed_resources_retained");
            if (_session.GetSnapshot().IsDisposed) _joint.Dispose();
        }
        catch (Exception error) { primary = error; _lastError = FormatApplyError(error); throw; }
        finally { perf?.EndPump(_session, primary); }
    }
    public void ConfigureRuntimePerf(bool enabled)
    {
        if (enabled) _runtimePerf ??= new RuntimePerfDiagnostics(512);
        else { _runtimePerf?.Dispose(); _runtimePerf = null; }
    }
    public string DrainRuntimePerf() => _runtimePerf is { } perf
        ? JsonSerializer.Serialize(perf.Drain(), SpectatorJsonContext.Default.RuntimePerfObservationDto)
        : "{\"diagnosticEnabled\":false,\"available\":false,\"availabilityReason\":\"disabled\"}";
    public string SessionState() => JsonSerializer.Serialize(new SessionStateDto
    {
        state = ConnectionState, inputEnabled = InputEnabled, closed = Closed,
        generation = _session.GetSnapshot().Generation.ToString(CultureInfo.InvariantCulture),
        notServingCloses = _session.GetSnapshot().NotServingCloses,
        sentInputs = _sent.Count, lastError = LastApplyError,
    }, SpectatorJsonContext.Default.SessionStateDto);
    private ulong AuthorityTick
    {
        get
        {
            var replica = Replica;
            if (replica is null) return 0;
            // Authorization creates the replica before the first authority snapshot.
            // Waiting presentation has no observed match tick yet.
            if (!replica.Manager.World.Each<BomberMatchState>().Any()) return 0;
            var match = replica.Manager.World.Single<BomberMatchState>();
            return replica.ReadField(match.Entity.ToHex(), "BomberMatchState.phase").ObservedTick;
        }
    }
    public string PlayerState() => SpectatorDump.DumpPlayerState(World, ConnectionState, InputEnabled,
        AuthorityTick.ToString(CultureInfo.InvariantCulture),
        (_session.TryGetPrediction(out var prediction) ? prediction.GetSnapshot().ConfirmedSeq : 0).ToString(CultureInfo.InvariantCulture));
    public string PresentationState() => PresentationDump.Dump(World, AuthorityTick.ToString(CultureInfo.InvariantCulture));
    public string OwnerPresentation()
    {
        if (_closing || !_session.TryUpdateOwnerPresentation(out var pose)) return "null";
        return JsonSerializer.Serialize(OwnerPresentationDto.From(_session.GetSnapshot().Generation, pose),
            SpectatorJsonContext.Default.OwnerPresentationDto);
    }
    public byte[] WorldHandleBytes() => Replica is { } replica ? EngineWasmWorldVoxelResources.Require(replica.Manager).WorldHandleBytes : Array.Empty<byte>();
    public string ReadBox(int minX, int minY, int minZ, int maxX, int maxY, int maxZ)
    {
        var replica = Replica ?? throw new InvalidOperationException("replica_world_unavailable");
        var box = EngineWasmWorldVoxelResources.Require(replica.Manager).ReadBox(minX, checked((byte)minY), minZ, maxX, checked((byte)maxY), maxZ);
        return JsonSerializer.Serialize(new ReadBoxDto
        {
            cells = box.Cells.Select(cell => new ReadBoxCellDto { hasBlockId = cell.HasBlockId, blockId = cell.BlockId, presence = cell.Presence.ToString() }),
            sections = box.Sections.Select(section => new ReadBoxSectionDto { x = section.X, y = section.Y, z = section.Z,
                revision = section.Revision.ToString(CultureInfo.InvariantCulture), presence = section.Presence.ToString() }),
        }, SpectatorJsonContext.Default.ReadBoxDto);
    }

    public bool SendMove(int primary, int secondary, bool turnPressed)
    {
        if (!Enum.IsDefined(typeof(BomberDirection), primary) || !Enum.IsDefined(typeof(BomberDirection), secondary) || (primary == 0 && secondary == 0))
            throw new ArgumentException("player_move_direction_invalid");
        var input = new MoveAbility.Input { PrimaryDirection = (BomberDirection)primary, SecondaryDirection = (BomberDirection)secondary, TurnPressed = turnPressed };
        return Activate<MoveAbility, MoveAbility.Input>(in input);
    }
    public bool PlaceBomb() { var input = new PlaceBombAbility.Input(); return Activate<PlaceBombAbility, PlaceBombAbility.Input>(in input); }
    public bool BombButton(int phase)
    {
        if (phase is 1 or 2)
        {
            var input = new BombButtonAbility.Input { Phase = phase };
            return Activate<BombButtonAbility, BombButtonAbility.Input>(in input);
        }
        if (phase is 3 or 4)
        {
            var input = new BombButtonReleaseAbility.Input { Phase = phase };
            return Activate<BombButtonReleaseAbility, BombButtonReleaseAbility.Input>(in input);
        }
        throw new ArgumentException("bomb_button_phase_invalid", nameof(phase));
    }
    public bool UseActiveSkill() { var input = new UseActiveSkillAbility.Input(); return Activate<UseActiveSkillAbility, UseActiveSkillAbility.Input>(in input); }
    public bool SelectCharacter(string characterId)
    {
        if (_closing) throw new ObjectDisposedException(nameof(SpectatorReplicaHost));
        World world = World ?? throw new InvalidOperationException("player_input_not_ready");
        var phase = (BomberMatchPhase)world.Single<BomberMatchState>().Phase.Value;
        if (phase is not (BomberMatchPhase.WaitingForWorldReady or BomberMatchPhase.Warmup or BomberMatchPhase.Results)) throw new InvalidOperationException("character_selection_closed");
        uint id = 0;
        foreach (CharactersRow row in BomberConfigBinding.For(world).Tables.Characters.Rows)
            if (string.Equals(row.Name, characterId, StringComparison.Ordinal)) { id = row.Id; break; }
        if (id == 0) throw new ArgumentException("character_unknown", nameof(characterId));
        var input = new SelectCharacterAbility.Input { CharacterId = id };
        return Activate<SelectCharacterAbility, SelectCharacterAbility.Input>(in input);
    }
    private bool Activate<TAbility, TInput>(in TInput input) where TAbility : AbilityType<TInput>, new() where TInput : struct, IAbilityInput
    {
        if (_closing) throw new ObjectDisposedException(nameof(SpectatorReplicaHost));
        IReplicaWorld replica = Replica ?? throw new InvalidOperationException("player_input_not_ready");
        if (!InputEnabled || !replica.SelfLookup().Found) throw new InvalidOperationException("player_input_not_ready");
        World world = replica.Manager.World;
        NetEntityId self = world.Self.Id;
        if (!world.IsLive(self)) throw new InvalidOperationException("player_self_not_live");
        if (!world.Get<AbilityComponent>(self).Activate<TAbility, TInput>(in input).Succeeded)
            throw new InvalidOperationException("player_ability_request_rejected");
        // ClientSession drains, stamps, encodes and sends the published request on its next owner Tick.
        return true;
    }
    public void Dispose() { _closing = true; ConfigureRuntimePerf(false); _session.RequestClose(new SessionCloseRequest(false)); _session.Dispose(); }
    internal static string FormatApplyError(Exception error)
    {
        var text = new StringBuilder();
        for (Exception? current = error; current is not null; current = current.InnerException)
        { if (text.Length > 0) text.Append(" | "); text.Append(current.GetType().Name).Append(':').Append(current.Message); }
        return text.ToString();
    }
    private sealed class PlatformEndpointProvider(string profile, ClientEndpoint initial, Func<CancellationToken, Task<string>> renew) : IClientEndpointProvider
    {
        private bool _first = true;
        public async ValueTask<ClientEndpoint> GetEndpointAsync(ulong attemptId, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (_first) { _first = false; return initial; }
            var launch = ReadLaunch(await renew(cancellationToken));
            cancellationToken.ThrowIfCancellationRequested();
            if (launch.Profile != profile) throw new InvalidOperationException("launch_profile_changed");
            return launch.Endpoint;
        }
    }
    private sealed class BrowserCapabilities : IPlatformCapabilityProvider
    {
        public ValueTask<PlatformCapabilityResult> QueryAsync(in PlatformCapabilityQuery query, CancellationToken cancellationToken)
        { cancellationToken.ThrowIfCancellationRequested(); return new(new PlatformCapabilityResult(query.Attempt, query.Generation, true)); }
    }
    private sealed class AbilityInputMapper : IGameInputMapper
    {
        public bool TryMap(in SequencedInputSample sample, in InputDrainContext context, out GameplayCommandCandidate candidate)
        { candidate = default; return false; }
    }
    private sealed class SentObserver : IClientOutboundMessageObserver
    {
        public ulong Count { get; private set; }
        public void Observe(InputCommandMessage message, ReadOnlyMemory<byte> encodedBytes) => Count++;
    }
    // A synchronous host sink retains no queue or payload. Console delivery failures propagate.
    private sealed class BrowserEvents(Action<string> write, Action<string> failure) : IClientEventWriter
    {
        private ulong _sequence;
        public ClientEventWriteResult TryWrite(in ClientEventRecord record)
        {
            string payload = Encoding.UTF8.GetString(record.Payload.Span);
            if (record.SchemaClass == EventSchemaClass.Critical) failure(payload);
            write(payload); _sequence = record.ProducerSequence ?? _sequence;
            return new(ClientEventWriteOutcome.Accepted);
        }
        public ClientEventPipelineSnapshot GetSnapshot() => new(0, 0, 0, _sequence, false, false);
    }
}
