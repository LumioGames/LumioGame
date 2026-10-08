using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.Client.Gameplay.ECS;
using Lumio.Client.Network.Connection;
using Lumio.Engine.NativeLoader;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Config;
using Lumio.GameRuntime.Hosting;
using Lumio.Wire;

[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace Lumio.Bomber.Client.Spectator.Tests;

/// <summary>Real SDK Native owner and real WebSocket carrier. It supplies test authority
/// envelopes, not a DS/game simulator, and cannot replace the full Host acceptance run.</summary>
public sealed class BrowserSessionOwner : IDisposable
{
    private readonly LumioEngine _engine;
    private readonly HttpListener _listener = new();
    private readonly Task<WebSocket> _accepted;
    private readonly List<byte[]> _received = new();
    private readonly Task _reader;
    private bool _disposed;
    private readonly BomberClientConfig? _configuration;
    public SpectatorReplicaHost Host { get; }
    public List<string> Logs { get; } = new();
    public string Profile { get; }
    public WireProfile WireProfile { get; }
    private ulong _generation = 9;
    private ulong _transfer;
    public static readonly NetEntityId Incarnation = new(555, 1);
    public static readonly NetEntityId Self = new(7, 2);
    public static readonly NetEntityId Participant = new(7, 4);
    public byte[] Catalog { get; }
    public NativeVoxelWorld? Voxel { get; private set; }
    public BrowserSessionOwner(bool parts = false, BomberClientConfig? configuration = null, BomberPlayerStepOptions? stepOptions = null)
    {
        _configuration = configuration;
        Profile = parts ? WebSocketTransportOptions.SuccessorBindingPartsSubProtocol : WebSocketTransportOptions.SuccessorBindingSubProtocol;
        WireProfile = parts ? WireProfile.SuccessorBindingPartsV1 : WireProfile.SuccessorBindingV1;
        var native = Environment.GetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH") ?? throw new InvalidOperationException("LUMIO_ENGINE_NATIVE_PATH must identify the official selected SDK native image.");
        var budget = new KernelConfig { MaxNativeBytes = 256UL << 20, MaxHandles = 65536, MaxJobsQueued = 1024, MaxJobsRunning = 64,
            MaxCompletionItems = 1024, LogMailboxCapacity = 4096, MaxContexts = 64 };
        _engine = LumioEngine.Start(native, budget);
        Catalog = File.ReadAllBytes(Path.Combine(FindGame(), "Server/Assets/Maps/official-catalog.json"));
        var probe = new TcpListener(IPAddress.Loopback, 0); probe.Start(); int port = ((IPEndPoint)probe.LocalEndpoint).Port; probe.Stop();
        _listener.Prefixes.Add($"http://127.0.0.1:{port}/"); _listener.Start();
        _accepted = Accept();
        _reader = Receive();
        string launch = JsonSerializer.Serialize(new { wsUrl = $"ws://127.0.0.1:{port}/", admissionCredential = "unit-admission", subprotocol = Profile, roomId = "browser-room" });
        Host = new SpectatorReplicaHost(_engine, new WebSocketClientConnectionFactory(_engine.Hfsm, SpectatorReplicaHost.TransportOptions(Profile)),
            Catalog, launch, _ => Task.FromException<string>(new InvalidOperationException("unexpected recovery")), Logs.Add,
            manager => new NativeSections(Voxel = NativeWorldVoxelResources.Require(manager).Voxel), configuration, stepOptions);
        Host.Connect(launch);
        PumpUntil(() => _accepted.IsCompleted);
        _accepted.GetAwaiter().GetResult();
    }
    private async Task<WebSocket> Accept()
    {
        var context = await _listener.GetContextAsync();
        if (context.Request.Headers["Authorization"] != "Bearer unit-admission") throw new InvalidOperationException("test admission carrier missing");
        return (await context.AcceptWebSocketAsync(Profile)).WebSocket;
    }
    private async Task Receive()
    {
        var socket = await _accepted;
        var buffer = new byte[65536];
        while (socket.State == WebSocketState.Open)
        {
            var result = await socket.ReceiveAsync(buffer, CancellationToken.None);
            if (result.MessageType == WebSocketMessageType.Close) { await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "closed", CancellationToken.None); break; }
            if (!result.EndOfMessage) throw new InvalidOperationException("unexpected oversized test input");
            lock (_received) _received.Add(buffer.AsSpan(0, result.Count).ToArray());
        }
    }
    public void Send(byte[] frame)
    {
        _accepted.GetAwaiter().GetResult().SendAsync(frame, WebSocketMessageType.Text, true, CancellationToken.None).GetAwaiter().GetResult();
    }
    public void Authorize(ulong authority = 999, NetEntityId? self = null, ulong generation = 9)
    {
        _generation = generation;
        var controlled = self ?? Self;
        var participant = new NetEntityId(controlled.InstanceId, 4);
        var value = new SuccessorAuthorization("SuccessorAuthorization", "initial", Profile, new NetEntityId(7, 90).ToHex(), "game-test-socket", "1", "1", 7,
            Incarnation.ToHex(), participant.ToHex(), "1", null, new AttachmentRecord(participant.ToHex(), controlled.ToHex(), controlled.ToHex(), generation, "controlled"), authority.ToString());
        var buffer = new byte[4096];
        Assert.True(WireCodec.TryWriteSuccessorAuthorization(in value, Profile, buffer, out int length));
        Send(buffer.AsSpan(0, length).ToArray());
        Send(WireCodec.EncodePack(new WelcomeMessage(controlled.InstanceId, controlled, generation) { ControlledLife = controlled, ControlMode = AttachmentControlMode.Controlled }, WireProfile));
        PumpUntil(() => Host.ConnectionState == "synchronizing" || Host.ConnectionState == "faulted");
        Assert.Equal("synchronizing", Host.ConnectionState);
        Assert.False(Host.InputEnabled);
    }
    public void Apply(WorldChangeMessage change)
    {
        byte[] body = WireCodec.EncodePack(change, WireProfile);
        if (body.Length <= 65536) Send(body);
        else
        {
            Assert.Equal(WireProfile.SuccessorBindingPartsV1, WireProfile);
            Assert.InRange(body.Length, 1, WorldChangePartsAssembler.MaxLogicalBytes);
            int chunk = WorldChangePartsAssembler.MaxChunkBytes;
            int count = (body.Length + chunk - 1) / chunk;
            string hash = Convert.ToHexStringLower(SHA256.HashData(body));
            string transfer = (++_transfer).ToString(System.Globalization.CultureInfo.InvariantCulture);
            for (int i = 0; i < count; i++)
            {
                // Contract-shaped test carrier only; production parts emission belongs to Server.
                byte[] frame = JsonSerializer.SerializeToUtf8Bytes(new { messageType = "WorldChangePart",
                    generation = _generation.ToString(System.Globalization.CultureInfo.InvariantCulture), transferId = transfer,
                    partIndex = i, partCount = count, totalBytes = body.Length, chunkBytes = chunk, sha256 = hash,
                    payload = Convert.ToBase64String(body.AsSpan(i * chunk, Math.Min(chunk, body.Length - i * chunk))) });
                Assert.InRange(frame.Length, 1, 65536);
                Send(frame); Pump(2);
                if (i + 1 < count) Assert.False(Host.InputEnabled);
            }
        }
        PumpUntil(() => Host.ConnectionState == "faulted" || ReadAuthorityTick() >= change.Tick);
    }
    private ulong ReadAuthorityTick()
    {
        if (Host.World is not { } world || !world.Each<Lumio.Bomber.Gameplay.Contracts.Components.BomberMatchState>().Any()) return 0;
        using var state = JsonDocument.Parse(Host.PlayerState());
        return ulong.Parse(state.RootElement.GetProperty("authorityTick").GetString()!);
    }
    public void PumpUntil(Func<bool> done)
    {
        var start = Environment.TickCount64;
        while (!done())
        {
            Host.Tick();
            if (Environment.TickCount64 - start > 10000) throw new TimeoutException("Session condition: " + Host.ConnectionState + "; " + string.Join(" | ", Logs));
            Thread.Sleep(1);
        }
    }
    public void Pump(int ticks = 5) { for (int i = 0; i < ticks; i++) { Host.Tick(); Thread.Sleep(2); } }
    public byte[][] ReceivedFrames { get { lock (_received) return _received.Select(frame => frame.ToArray()).ToArray(); } }
    public byte[] TakeInput(Func<bool> request)
    {
        int before; lock (_received) before = _received.Count;
        Assert.True(request());
        PumpUntil(() => { lock (_received) return _received.Count > before; });
        lock (_received) return _received[before];
    }
    public byte[][] TakeInputs(int count, Action request)
    {
        int before; lock (_received) before = _received.Count;
        request();
        PumpUntil(() => { lock (_received) return _received.Count >= before + count; });
        lock (_received) return _received.Skip(before).Take(count).ToArray();
    }
    public WorldManager CreateClientWorld() => _engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance)
    { Config = _configuration?.CreateWorldBinding() ?? SpectatorDump.LoadBomberConfig(), Catalog = Catalog, Subsystems = ReplicaSchedulingSubsystem.Create() });
    public static EcsRegistry LoadServerRegistry()
    {
        string path = Environment.GetEnvironmentVariable("LUMIO_BOMBER_SERVER_GAMEPLAY_PATH")
            ?? throw new InvalidOperationException("Build the actual server Gameplay with the same SDK and set LUMIO_BOMBER_SERVER_GAMEPLAY_PATH.");
        var context = new AssemblyLoadContext("bomber-server-projection", isCollectible: true);
        context.Resolving += (_, name) => AssemblyLoadContext.Default.Assemblies.SingleOrDefault(a => a.GetName().Name == name.Name);
        Assembly assembly = context.LoadFromAssemblyPath(Path.GetFullPath(path));
        var registry = (EcsRegistry)assembly.GetType("Lumio.Bomber.Gameplay.GeneratedRegistry", throwOnError: true)!
            .GetProperty("Instance", BindingFlags.Public | BindingFlags.Static)!.GetValue(null)!;
        Assert.Equal(RegistrySide.Server, registry.Side);
        return registry;
    }
    public WorldManager CreateServerProjectionWorld(EcsRegistry registry, ulong instance)
    {
        var entry = registry.CreateGameplayConfigBinding()!;
        var export = LumioConfigLoader.Load(Path.Combine(FindGame(), "Server/Config/Tables"), ConfigTarget.Server,
            requiredTables: entry.RequiredTables, typedTableFactory: entry.CreateTypedTables);
        Assert.True(export.IsSuccess, export.ErrorMessage);
        var module = ConfigModule.Create();
        Assert.True(module.Stage(export.CreateSnapshot(new ConfigSnapshotId(1))).Staged);
        Assert.True(module.ActivateAtBarrier(default).Activated);
        return _engine.CreateWorld(new WorldCreationOptions(registry) {
            InstanceId = instance, Catalog = Catalog, TickRate = 20, Config = new WorldConfigBinding(module, registry, entry),
        });
    }
    public void Dispose()
    {
        if (_disposed) return;
        try
        {
            Host.Dispose(); PumpUntil(() => Host.Closed);
            if (!_reader.Wait(TimeSpan.FromSeconds(10))) throw new TimeoutException("WebSocket reader did not finish after session close.");
            _reader.GetAwaiter().GetResult();
        }
        finally
        {
            if (_accepted.IsCompletedSuccessfully) _accepted.Result.Dispose();
            _listener.Close(); _engine.Dispose(); _disposed = true;
        }
    }
    internal static string FindGame()
    {
        for (var folder = new DirectoryInfo(AppContext.BaseDirectory); folder is not null; folder = folder.Parent)
            if (File.Exists(Path.Combine(folder.FullName, "Gameplay/Lumio.Bomber.Gameplay.csproj"))) return folder.FullName;
        throw new DirectoryNotFoundException("101 game root unavailable");
    }
    private sealed class NativeSections(NativeVoxelWorld world) : IReplicaVoxelSink
    {
        public void RequestSection(ReplicaSectionKey key) => world.RequestSection(new(key.X, checked((byte)key.Y), key.Z));
        public void ReleaseSection(ReplicaSectionKey key) => world.ReleaseSection(new(key.X, checked((byte)key.Y), key.Z));
        public ReplicaSectionApplyResult DeliverSection(in ReplicaSectionDelivery delivery)
        {
            try
            {
                world.DeliverSection(new(delivery.SectionKey.X, checked((byte)delivery.SectionKey.Y), delivery.SectionKey.Z), delivery.SectionRevision,
                    Enum.Parse<VoxelSectionEncoding>(delivery.Encoding.ToString()), delivery.Payload.Span, delivery.PayloadSha256.Span, delivery.BaseSectionRevision);
                return ReplicaSectionApplyResult.Ok();
            }
            catch (VoxelNativeException error) when (error.Code is VoxelErrorCode.SectionDigestMismatch or VoxelErrorCode.DeltaBaseRevisionMismatch or VoxelErrorCode.DeltaUsedForFirstDelivery or VoxelErrorCode.SectionUnavailable)
            {
                return ReplicaSectionApplyResult.Resync(error.Code switch
                {
                    VoxelErrorCode.SectionDigestMismatch => ReplicaSectionResyncReason.SectionDigestMismatch,
                    VoxelErrorCode.DeltaBaseRevisionMismatch => ReplicaSectionResyncReason.DeltaBaseRevisionMismatch,
                    VoxelErrorCode.DeltaUsedForFirstDelivery => ReplicaSectionResyncReason.LadderFullResync,
                    _ => ReplicaSectionResyncReason.ObserverNotReady,
                });
            }
        }
    }
}
