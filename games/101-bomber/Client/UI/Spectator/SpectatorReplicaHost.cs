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
    private readonly BomberTelemetryJointPrediction? _telemetryJoint;
    private readonly SentObserver _sent = new();
    private readonly BomberInputTrace? _inputTrace;
    private readonly BomberPlayerIntent _intent = new();
    private readonly BomberPlayerStepOptions? _stepOptions;
    private readonly bool _coordinationArmed;
    private BomberCoordinationCostCollector? _coordinationCost;
    private readonly string _intentLifetime = Guid.NewGuid().ToString("N");
    private InputIdentity? _inputIdentity;
    private InputIdentity? _lastTraceIdentity;
    private ulong _intentResetVersion;
    private bool _intentEnabled;
    private bool _closing;
    private string _lastError = string.Empty;

    internal SpectatorReplicaHost(IClientSession session, BomberPlayerStepOptions stepOptions, BomberInputTrace trace)
    {
        _session = session;
        _stepOptions = stepOptions;
        _inputTrace = stepOptions.TraceEnabled ? trace : null;
        _coordinationArmed = _inputTrace is not null && AppContext.TryGetSwitch("Lumio.Bomber.CoordinationCost", out bool enabled) && enabled;
        _joint = new RuntimeJointPrediction(new VoxelPredictionConfig(64UL << 20, 512, 4096, 4096, 4096, 64, 4096, 1024, 256));
    }

    public SpectatorReplicaHost(LumioEngine engine, IClientConnectionFactory connections, byte[] catalog,
        string launchJson, Func<CancellationToken, Task<string>> renewEndpoint, Action<string> log,
        Func<WorldManager, IReplicaVoxelSink>? voxelSections = null, BomberClientConfig? configuration = null,
        BomberPlayerStepOptions? stepOptions = null, Func<ulong>? executionClock = null)
    {
        _stepOptions = stepOptions;
        _inputTrace = stepOptions?.TraceEnabled == true ? new BomberInputTrace() : null;
        _coordinationArmed = _inputTrace is not null && AppContext.TryGetSwitch("Lumio.Bomber.CoordinationCost", out bool enabled) && enabled;
        _sent.Trace = _inputTrace;
        var launch = ReadLaunch(launchJson);
        var config = configuration ?? SpectatorDump.LoadEmbeddedClientConfig();
        var input = new InputSampleIngress(16);
        var sections = new ReplicaSectionEnvelopeReader();
        _joint = new RuntimeJointPrediction(new VoxelPredictionConfig(64UL << 20, 512, 4096, 4096, 4096, 64, 4096, 1024, 256));
        _telemetryJoint = _inputTrace is null || executionClock is null ||
            (AppContext.TryGetSwitch("Lumio.Bomber.DisableGasExecutionClock", out bool disabled) && disabled)
            ? null : new BomberTelemetryJointPrediction(_joint, executionClock, _inputTrace);
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
            voxelSections: voxelSections ?? (manager => new EngineWasmSectionSink(EngineWasmWorldVoxelResources.Require(manager))), jointPrediction: (IClientJointPrediction?)_telemetryJoint ?? _joint,
            predictionSteps: stepOptions is null ? null : new ClientPredictionStepOptions(SamplePlayerIntent, 5, TimeSpan.FromMilliseconds(250)));
        if (!new ClientSessionFactory().Create(in dependencies, out _session).Succeeded)
            throw new InvalidOperationException("client_session_creation_failed");
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
        var timing = _inputTrace?.FacadeTiming;
        var workBefore = _inputTrace?.CaptureWorkCounters(_session);
        bool record = timing?.Begin() == true;
        bool sessionInvoked = false;
        _coordinationCost?.BeginPump(record ? timing!.PendingOrdinal : null);
        try
        {
            ReconcileInputIdentity();
            var before = _session.GetSnapshot();
            if (!before.IsDisposed)
            {
                var ownerTick = new ClientOwnerTick(checked(before.OwnerTick + 1));
                _coordinationCost?.EnterSession();
                if (record) timing!.Session(invoked: true);
                sessionInvoked = true;
                _session.Tick(ownerTick);
            }
            else if (record) timing!.Session(invoked: false);
            if (record) timing!.Post();
            _coordinationCost?.LeaveSession();
            ReconcileInputIdentity();
            if (_session.GetSnapshot().CleanupStatus == SessionCleanupStatus.Failed)
                throw new InvalidOperationException("client_cleanup_failed_resources_retained");
            if (_session.GetSnapshot().IsDisposed) { _joint.Dispose(); _coordinationCost?.Stop("host-retired"); }
            if (record) timing!.Complete();
        }
        catch (Exception error) { if (record) timing!.Fail(); _lastError = FormatApplyError(error); throw; }
        finally
        {
            _coordinationCost?.LeaveSession();
            if (record) _inputTrace!.FinishWorkCounters(workBefore, _session, sessionInvoked, _coordinationCost);
            else _coordinationCost?.EndPump(null, null, "facade-not-accepted", sessionInvoked);
            _telemetryJoint?.Drain();
        }
    }
    public string SessionState() => JsonSerializer.Serialize(new SessionStateDto
    {
        state = ConnectionState, inputEnabled = InputEnabled, closed = Closed,
        generation = _session.GetSnapshot().Generation.ToString(CultureInfo.InvariantCulture),
        notServingCloses = _session.GetSnapshot().NotServingCloses,
        sentInputs = _sent.Count, lastError = LastApplyError,
    }, SpectatorJsonContext.Default.SessionStateDto);
    // PreBoot configuration arms this optional observer; an explicit recording
    // request must reach an Active session before it can consume the one-shot.
    internal string StartCoordinationCostCapture()
    {
        if (_closing) return "closed";
        if (!_coordinationArmed) return "disabled";
        if (_coordinationCost is not null) return _coordinationCost.StartResult == "started" ? "already-started" : "closed";
        BomberCoordinationCostCollector? candidate = null;
        try
        {
            var state = _session.GetSnapshot();
            if (state.IsDisposed) return "closed";
            if (state.State != ClientSessionState.Active) return "not-active";
            candidate = new BomberCoordinationCostCollector(_inputTrace!.Lifetime);
            string result = candidate.StartResult;
            if (result != "started") { candidate.Dispose(); return result; }
            _coordinationCost = candidate; _inputTrace.CoordinationCost = candidate;
            return "started";
        }
        catch (Exception) { candidate?.Dispose(); return "capture-failed"; }
    }
    public string DrainInputTrace() => _inputTrace?.Drain() ?? BomberInputTrace.DisabledBatch;
    public void RetireInputTrace() => _inputTrace?.RetirePending();
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
        if (!Enum.IsDefined(typeof(BomberDirection), primary) || !Enum.IsDefined(typeof(BomberDirection), secondary))
            throw new ArgumentException("player_move_direction_invalid");
        var input = new MoveAbility.Input { PrimaryDirection = (BomberDirection)primary, SecondaryDirection = (BomberDirection)secondary, TurnPressed = turnPressed };
        return Activate<MoveAbility, MoveAbility.Input>(in input);
    }
    public void SetMoveIntent(int primary, int secondary, bool turnPressed)
    {
        if (!Enum.IsDefined(typeof(BomberDirection), primary) || !Enum.IsDefined(typeof(BomberDirection), secondary))
            throw new ArgumentException("player_move_direction_invalid");
        RequirePhysicalInput();
        _intent.SetMoveIntent(primary, secondary, turnPressed);
    }
    public string SetBombIntent(int phase)
    {
        var observation = ReconcileInputIdentity();
        if (phase == 1 && (!_intentEnabled || !observation.Ready)) throw new InvalidOperationException("player_input_not_ready");
        int before = _intent.BombIntentRefusalCount;
        string result = _intent.SetBombIntent(phase);
        if (_intent.BombIntentRefusalCount > before) _inputTrace?.IntentOverflow(result);
        return result;
    }
    public void LatchSkillIntent() { RequirePhysicalInput(); _intent.LatchSkillIntent(); }
    public void SetInputIntentEnabled(bool enabled)
    {
        ReconcileInputIdentity();
        if (_intentEnabled && !enabled) _intent.Clear();
        _intentEnabled = enabled;
    }
    public void ClearPlayerIntent() { ReconcileInputIdentity(); _intent.Clear(); }
    public int GetBombIntentRefusalCount() => _intent.BombIntentRefusalCount;
    public string GetBombIntentStatusCode() => _intent.BombIntentStatusCode;
    public string GetInputIntentResetToken()
    {
        ReconcileInputIdentity();
        return _intentLifetime + ":" + _intentResetVersion.ToString(CultureInfo.InvariantCulture);
    }

    private void RequirePhysicalInput()
    {
        var observation = ReconcileInputIdentity();
        if (!_intentEnabled || !observation.Ready) throw new InvalidOperationException("player_input_not_ready");
    }

    private sealed record InputIdentity(WorldManager Manager, ulong WorldInstance, ulong SessionGeneration,
        ulong WireGeneration, NetEntityId Self, NetEntityId Participant, ulong LifeGeneration, ulong MatchId);
    private readonly record struct InputObservation(InputIdentity? Identity, IReplicaWorld? Replica, bool Ready);

    private InputObservation ReconcileInputIdentity()
    {
        if (_stepOptions is null) return default;
        InputObservation current = ObserveInputIdentity();
        if (current.Identity is { } nextTrace)
        {
            if (_lastTraceIdentity is { } priorTrace &&
                (!ReferenceEquals(priorTrace.Manager, nextTrace.Manager) ||
                 priorTrace.SessionGeneration != nextTrace.SessionGeneration))
                _inputTrace?.RetirePending(reason: "session-retired", newSession: true);
            _lastTraceIdentity = nextTrace;
        }
        if (!Equals(_inputIdentity, current.Identity))
        {
            _intent.Invalidate();
            _inputIdentity = current.Identity;
            _intentResetVersion = checked(_intentResetVersion + 1);
        }
        else if (!current.Ready) _intent.Clear();
        return current;
    }

    private InputObservation ObserveInputIdentity()
    {
        var snapshot = _session.GetSnapshot();
        if (_closing || snapshot.IsDisposed || !_session.TryGetReplicaWorld(out var replica)) return default;
        var lookup = replica.SelfLookup();
        if (!lookup.Found) return default;
        World world = replica.Manager.World;
        if (!world.TryGetSelf(out Entity? bound) || bound is null || !world.IsLive(bound.Id) ||
            !string.Equals(lookup.Binding.NetEntityId, bound.Id.ToHex(), StringComparison.OrdinalIgnoreCase)) return default;
        BomberPlayerState? player = world.Each<BomberPlayerState>().FirstOrDefault(row => row.Entity == bound.Id);
        if (player is null || player.Participant.Value.IsDefault || player.LifeGeneration.Value == 0 ||
            !world.IsLive(player.Participant.Value)) return default;
        BomberParticipantState? participant = world.Each<BomberParticipantState>()
            .FirstOrDefault(row => row.Entity == player.Participant.Value);
        BomberMatchState? match = world.Each<BomberMatchState>().SingleOrDefault();
        if (participant is null || match is null || match.MatchId.Value == 0 ||
            participant.MatchId.Value != match.MatchId.Value ||
            participant.CurrentLife.Value != bound.Id || participant.LifeGeneration.Value != player.LifeGeneration.Value)
            return default;
        var identity = new InputIdentity(replica.Manager, world.InstanceId, snapshot.Generation,
            lookup.Binding.ConnectionGeneration, bound.Id, player.Participant.Value,
            player.LifeGeneration.Value, match.MatchId.Value);
        BomberSkillState? skill = world.Each<BomberSkillState>().FirstOrDefault(row => row.Entity == bound.Id);
        bool ready = snapshot.State == ClientSessionState.Active && replica.InputEnabled &&
            (BomberMatchPhase)match.Phase.Value is BomberMatchPhase.Warmup or BomberMatchPhase.Running or BomberMatchPhase.FinalCircle &&
            (BomberLifePhase)player.LifePhase.Value is BomberLifePhase.Protected or BomberLifePhase.Vulnerable &&
            skill is not null && skill.FrozenUntilTick.Value <= world.Tick;
        return new(identity, replica, ready);
    }

    private void SamplePlayerIntent(ClientPredictionStepContext context)
    {
        InputObservation observed = ReconcileInputIdentity();
        InputIdentity? identity = observed.Identity;
        if (identity is null || !ReferenceEquals(identity.Manager, context.Manager) ||
            context.ConnectionGeneration != context.Manager.ClientPredictionClockGeneration) return;
        bool enabled = _intentEnabled && observed.Ready;
        BomberIntentSample sample = _intent.PeekSample(enabled);
        string? sampleId = RecordInputSample(identity, context, sample);
        if (enabled)
        {
            var move = new MoveAbility.Input { PrimaryDirection = (BomberDirection)sample.Primary,
                SecondaryDirection = (BomberDirection)sample.Secondary, TurnPressed = sample.TurnPressed };
            if (!PublishStepInput<MoveAbility, MoveAbility.Input>(identity, false, in move, sampleId)) return;
            _intent.CommitMove(sample.Primary);
        }
        if (sample.BombPressPhase != 0)
        {
            var press = new BombButtonAbility.Input { Phase = sample.BombPressPhase };
            if (!PublishStepInput<BombButtonAbility, BombButtonAbility.Input>(identity, false, in press, sampleId)) return;
            _intent.CommitBomb(sample.BombPressPhase);
        }
        if (sample.BombReleasePhase != 0)
        {
            var release = new BombButtonReleaseAbility.Input { Phase = sample.BombReleasePhase };
            if (!PublishStepInput<BombButtonReleaseAbility, BombButtonReleaseAbility.Input>(identity,
                sample.BombReleasePhase == 4, in release, sampleId)) return;
            _intent.CommitBomb(sample.BombReleasePhase);
        }
        if (sample.Skill)
        {
            var skill = new UseActiveSkillAbility.Input();
            if (PublishStepInput<UseActiveSkillAbility, UseActiveSkillAbility.Input>(identity, false, in skill, sampleId)) _intent.CommitSkill();
        }
    }

    private bool PublishStepInput<TAbility, TInput>(InputIdentity identity, bool allowDisabled, in TInput input, string? sampleId)
        where TAbility : AbilityType<TInput>, new() where TInput : struct, IAbilityInput
    {
        InputObservation current = ReconcileInputIdentity();
        if (!Equals(identity, current.Identity) || current.Replica is null || !current.Replica.InputEnabled ||
            (!allowDisabled && (!_intentEnabled || !current.Ready))) return false;
        var before = identity.Manager.CaptureRpcCompletionContinuity();
        if (before.Sender != identity.Self || before.ConnectionGeneration != identity.WireGeneration) return false;
        Activate<TAbility, TInput>(in input);
        var after = identity.Manager.CaptureRpcCompletionContinuity();
        if (!Equals(identity, ReconcileInputIdentity().Identity) || after.Sender != before.Sender ||
            after.ConnectionGeneration != before.ConnectionGeneration ||
            after.ServerWorldInstanceId != before.ServerWorldInstanceId ||
            after.NextSequence != checked(before.NextSequence + 1))
            throw new InvalidOperationException("player_intent_publication_continuity_lost");
        RecordInputRequest(sampleId, typeof(TAbility).Name, before.Sender, before.ConnectionGeneration,
            before.NextSequence, identity.SessionGeneration);
        return true;
    }

    private string? RecordInputSample(InputIdentity identity, ClientPredictionStepContext context, BomberIntentSample sample)
    {
        if (_inputTrace is null) return null;
        try { return _inputTrace.Sample(identity.Manager, identity.SessionGeneration,
            identity.WireGeneration, identity.Self.ToHex(), identity.MatchId, context.LocalStepOrdinal,
            sample.Primary, sample.Secondary, sample.TurnPressed, sample.BombPressPhase,
            sample.BombReleasePhase, sample.Skill); }
        catch { _inputTrace.Failure(); return null; }
    }

    private void RecordInputRequest(string? sampleId, string ability, NetEntityId sender, ulong generation,
        ulong sequence, ulong sessionGeneration)
    {
        if (_inputTrace is null) return;
        try { _inputTrace.Request(sampleId, ability, sender.ToHex(), generation, sequence, sessionGeneration); }
        catch { _inputTrace.Failure(); }
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
    public void Dispose()
    {
        _closing = true;
        try { ReconcileInputIdentity(); _session.RequestClose(new SessionCloseRequest(false)); _session.Dispose(); }
        finally { _coordinationCost?.Stop("host-disposed"); }
    }
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
        public BomberInputTrace? Trace { get; set; }
        public void Observe(InputCommandMessage message, ReadOnlyMemory<byte> encodedBytes)
        {
            if (Count < ulong.MaxValue) Count++;
            Trace?.Accepted(message, encodedBytes);
        }
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
