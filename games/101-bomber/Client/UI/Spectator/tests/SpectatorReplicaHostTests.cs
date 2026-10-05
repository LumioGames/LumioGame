using System.Numerics;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class SpectatorReplicaHostTests
{
    private static NetEntityId Self => BrowserSessionOwner.Self;

    [Fact]
    public void AuthorizedWorldWithoutFirstSnapshotExposesWaitingPresentationAndZeroAuthorityTick()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        Assert.NotNull(owner.Host.World);
        using (var player = JsonDocument.Parse(owner.Host.PlayerState()))
        {
            Assert.Equal("0", player.RootElement.GetProperty("authorityTick").GetString());
            Assert.Equal(JsonValueKind.Null, player.RootElement.GetProperty("phase").ValueKind);
            Assert.False(player.RootElement.GetProperty("inputOpen").GetBoolean());
        }
        using (var presentation = JsonDocument.Parse(owner.Host.PresentationState()))
        {
            Assert.Equal("0", presentation.RootElement.GetProperty("tick").GetString());
            Assert.Equal(JsonValueKind.Null, presentation.RootElement.GetProperty("match").ValueKind);
        }
        owner.Apply(InitialChange(Self));
        using var ready = JsonDocument.Parse(owner.Host.PlayerState());
        Assert.Equal("1", ready.RootElement.GetProperty("authorityTick").GetString());
        Assert.Equal("active", owner.Host.ConnectionState);
    }

    [Fact]
    public void MalformedFrameTerminatesAndClearsReplica()
    {
        using var owner = new BrowserSessionOwner();
        owner.Send(new byte[] { 1, 2, 3 });
        Fault(owner);
    }

    [Fact]
    public void WelcomeBindingGenerationIsIndependentAndDuplicatesDoNotRecreateWorld()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        var world = owner.Host.World;
        owner.Send(Welcome()); owner.Pump(30);
        Assert.Same(world, owner.Host.World);
        Assert.Equal("synchronizing", owner.Host.ConnectionState);
        owner.Send(WireCodec.EncodePack(new WelcomeMessage(7, new NetEntityId(7, 3), 9)
        { ControlledLife = new NetEntityId(7, 3), ControlMode = AttachmentControlMode.Controlled }, WireProfile.SuccessorBindingV1));
        Fault(owner);
    }

    [Fact]
    public void SupersessionDisposesOnlyMatchingBinding()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        owner.Send(WireCodec.EncodePack(new ConnectionSupersededMessage(new NetEntityId(7, 3), 10), WireProfile.SuccessorBindingV1));
        owner.Pump(30); Assert.Equal("synchronizing", owner.Host.ConnectionState);
        owner.Send(WireCodec.EncodePack(new ConnectionSupersededMessage(Self, 10), WireProfile.SuccessorBindingV1));
        owner.PumpUntil(() => owner.Host.ConnectionState == "superseded");
        Assert.Null(owner.Host.World); Assert.False(owner.Host.InputEnabled);
    }

    [Fact]
    public void SuccessfulInitialAndDeltaChangesCommitBeforeInputIsEnabled()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        Assert.False(owner.Host.InputEnabled);
        owner.Apply(InitialChange(Self));
        Assert.True(owner.Host.InputEnabled); Assert.Equal("active", owner.Host.ConnectionState);
        Assert.Equal(new Vector3(1, 0, 2), owner.Host.World!.Get<LogicTransform>(Self).LocalPosition);
        owner.Apply(Delta(new FieldChange(Self, nameof(LogicTransform), "localPosition", "5,0,6", ChangeReason.Sync)));
        Assert.Equal(new Vector3(5, 0, 6), owner.Host.World.Get<LogicTransform>(Self).LocalPosition);
    }

    [Fact]
    public void DuplicateAuthorityAndWelcomeLeaveTheActiveWorldIntact()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize(); owner.Apply(InitialChange(Self));
        var world = owner.Host.World;
        owner.Send(WireCodec.EncodePack(InitialChange(Self), WireProfile.SuccessorBindingV1));
        owner.Send(Welcome()); owner.Pump(30);
        Assert.Same(world, owner.Host.World); Assert.True(owner.Host.InputEnabled);
        Assert.Equal("active", owner.Host.ConnectionState);
    }

    [Fact]
    public void DataApplicationFailureDisposesTheSessionAndRejectsLaterInput()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize(); owner.Apply(InitialChange(Self));
        owner.Send(WireCodec.EncodePack(Delta(new FieldChange(Self, "BomberSkillState", "characterId", "invalid-character", ChangeReason.Sync)), WireProfile.SuccessorBindingV1));
        Fault(owner);
        Assert.Throws<InvalidOperationException>(() => owner.Host.PlaceBomb());
    }

    [Fact]
    public void DisposeReleasesTheWorldWithoutCreatingAReplacement()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize(); owner.Apply(InitialChange(Self));
        var world = owner.Host.World!;
        owner.Host.Dispose(); owner.Host.Dispose(); owner.PumpUntil(() => owner.Host.Closed);
        Assert.Null(owner.Host.World); Assert.False(owner.Host.InputEnabled);
        Assert.Equal("closed", owner.Host.ConnectionState);
        Assert.False(world.IsLive(Self));
        var error = Assert.Throws<InvalidOperationException>(() => world.Get<LogicTransform>(Self));
        Assert.Contains("is not live", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void InitialAuthorityRetainsNondefaultAttributeBaseAndCurrent()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        owner.Apply(new WorldChangeMessage(1, 0, new[] {
            new CreateRecord("world", new NetEntityId(7, 1), MatchFields()),
            new CreateRecord("player", Self, new[] {
                new FieldValue(nameof(AttributeComponent), "staminaBase", 81L),
                new FieldValue(nameof(AttributeComponent), "staminaCurrent", 37L),
                new FieldValue(nameof(AttributeComponent), "oreBase", 24L),
                new FieldValue(nameof(AttributeComponent), "oreCurrent", 12L),
            }),
        }, Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>()));
        Assert.True(owner.Host.InputEnabled);
        var attributes = owner.Host.World!.Get<AttributeComponent>(Self);
        Assert.Equal((81L, 37L, 24L, 12L), (attributes.GetBaseValue("Stamina"), attributes.GetCurrentValue("Stamina"), attributes.GetBaseValue("Ore"), attributes.GetCurrentValue("Ore")));
    }

    [Fact]
    public void AuthorityDeltaParsesSignedAttributeValuesFromWire()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize(); owner.Apply(InitialChange(Self));
        owner.Apply(Delta(
            new FieldChange(Self, nameof(AttributeComponent), "staminaBase", long.MinValue, ChangeReason.Sync),
            new FieldChange(Self, nameof(AttributeComponent), "staminaCurrent", long.MaxValue, ChangeReason.Sync),
            new FieldChange(Self, nameof(AttributeComponent), "oreBase", -24L, ChangeReason.Sync),
            new FieldChange(Self, nameof(AttributeComponent), "oreCurrent", 12L, ChangeReason.Sync)));
        var attributes = owner.Host.World!.Get<AttributeComponent>(Self);
        Assert.Equal((long.MinValue, long.MaxValue, -24L, 12L), (attributes.GetBaseValue("Stamina"), attributes.GetCurrentValue("Stamina"), attributes.GetBaseValue("Ore"), attributes.GetCurrentValue("Ore")));
    }

    [Theory]
    [InlineData("not-an-integer")]
    [InlineData("9223372036854775808")]
    public void InvalidAuthorityAttributeFaultsAndDisposesTheHost(string value)
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize(); owner.Apply(InitialChange(Self));
        owner.Send(WireCodec.EncodePack(Delta(new FieldChange(Self, nameof(AttributeComponent), "staminaCurrent", value, ChangeReason.Sync)), WireProfile.SuccessorBindingV1));
        Fault(owner);
    }

    [Fact]
    public void JsonWelcomeThenWorldChangeFeedsDumpPositions()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize(); owner.Apply(InitialChange(Self));
        using var dump = JsonDocument.Parse(SpectatorDump.DumpPositions(owner.Host.World!));
        Assert.Contains(dump.RootElement.EnumerateArray(), row => row.GetProperty("id").GetString() == Self.ToHex());
        Assert.Equal("active", owner.Host.ConnectionState);
    }

    [Fact]
    public void UnknownFieldOnWorldChangeStillFaults()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        owner.Send(Encoding.UTF8.GetBytes("{\"appliedInputSequence\":0,\"creates\":[],\"destroys\":[],\"fields\":[],\"messageType\":\"WorldChange\",\"rpcs\":[],\"tick\":1,\"extra\":\"nope\"}"));
        Fault(owner);
        Assert.Contains(owner.Logs, line => line.Contains("protocol", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("protocol", owner.Host.LastApplyError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PlayerOnlyFullSnapshotRecordsAuthorityApplyFailed()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        owner.Send(WireCodec.EncodePack(new WorldChangeMessage(1, 0,
            new[] { new CreateRecord("player", Self, Array.Empty<FieldValue>()) },
            Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>()), WireProfile.SuccessorBindingV1));
        Fault(owner);
        Assert.Contains(owner.Logs, line => line.Contains("authority", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("authority", owner.Host.LastApplyError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void LateSpectatorCensusOfHundredPlayerRoomAppliesAsFullSnapshot()
    {
        using var owner = new BrowserSessionOwner(parts: true);
        using var server = owner.CreateServerProjectionWorld(new ServerSideRegistryWrapper(BrowserSessionOwner.LoadServerRegistry()), 7);
        server.AttachControlAdapter(new PartsProjectionProfile());
        for (int i = 0; i < 100; i++) AddObserver(server);
        server.Tick(); server.DrainOutbox();
        var spectator = AddObserver(server); server.Tick();
        var drain = server.DrainOutbox();
        var welcome = Assert.Single(drain.Frames.OfType<WelcomeMessage>(), frame => frame.Self == spectator.AssignedId);
        var census = Assert.Single(drain.Frames.OfType<WorldChangeMessage>(), frame => frame.ObserverId == spectator.AssignedId);
        owner.Authorize(self: welcome.Self, generation: welcome.ConnectionGeneration);
        owner.Apply(census);
        Assert.True(owner.Host.InputEnabled); Assert.Equal("active", owner.Host.ConnectionState);
        using var dump = JsonDocument.Parse(SpectatorDump.DumpPositions(owner.Host.World!));
        Assert.Equal(101, dump.RootElement.GetArrayLength());
    }

    private static EntityOrder AddObserver(WorldManager server)
    {
        Assert.True(server.World.Registry.TryResolveEntityType("player", out var playerType));
        var order = server.World.Commands.CreateFor(playerType);
        var observer = (ObserverComponent)order.NamedComponent(nameof(ObserverComponent))!;
        observer.Connected = true; observer.ConnectionGeneration = 1; return order;
    }
    // Only supplies this projection test's negotiated profile. It grants no account,
    // input or successor admission; those require the complete real Host acceptance.
    private sealed class PartsProjectionProfile : IWorldControlAdapter
    {
        public WireProfile ProfileFor(string connection) => WireProfile.SuccessorBindingPartsV1;
        public bool TryResolveConnection(NetEntityId observer, out string connection) { connection = observer.ToHex(); return true; }
        public bool TryHandle(WorldMessage message, out ErrorMessage? failure) { failure = null; return false; }
    }
    internal static WorldChangeMessage InitialChange(NetEntityId self) => new(1, 0,
        new[] { new CreateRecord("world", new NetEntityId(self.InstanceId, 1), MatchFields()),
            new CreateRecord("player", self, new[] { new FieldValue(nameof(LogicTransform), "localPosition", "1,0,2") }) },
        Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>());
    private static WorldChangeMessage Delta(params FieldChange[] fields) => new(2, 0, Array.Empty<CreateRecord>(), fields, Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>());
    private static FieldValue[] MatchFields() => new[] { new FieldValue("BomberMatchState", "phase", 0) };
    private static byte[] Welcome() => WireCodec.EncodePack(new WelcomeMessage(7, Self, 9) { ControlledLife = Self, ControlMode = AttachmentControlMode.Controlled }, WireProfile.SuccessorBindingV1);
    internal static void Fault(BrowserSessionOwner owner)
    {
        owner.PumpUntil(() => owner.Host.ConnectionState == "faulted");
        Assert.False(owner.Host.InputEnabled); Assert.Null(owner.Host.World);
    }

    // Producer uses the real Native B3 owner and ordinary authoritative schedule.
    // Client-only declarations cannot call account admission; observers are explicitly
    // created for this projection test, while complete Host admission is tested separately.
    private sealed class ServerSideRegistryWrapper(EcsRegistry inner) : EcsRegistry
    {
        public override RegistrySide Side => RegistrySide.Server;
        public override Type WorldEntityType => inner.WorldEntityType;
        public override Type? RequiredGameplayConfigContract => inner.RequiredGameplayConfigContract;
        public override IGameConfigExportBinding? CreateGameplayConfigBinding() => inner.CreateGameplayConfigBinding();
        public override ulong DeclaredTickRateHz => inner.DeclaredTickRateHz;
        public override IReadOnlyList<SuccessorDeclaration> SuccessorDeclarations => inner.SuccessorDeclarations;
        public override void CreateWorldServices(World world) => inner.CreateWorldServices(world);
        public override IReadOnlyList<Lumio.GameRuntime.Ecs.Annotations.FieldAttributeDeclaration> AttributeDeclarations => inner.AttributeDeclarations;
        public override string ReducerStorageSchema => inner.ReducerStorageSchema;
        public override IReadOnlyList<ReducerStorageDeclaration> ReducerStorageDeclarations => inner.ReducerStorageDeclarations;
        public override IReadOnlyList<ReducerLayoutDeclaration> ReducerLayouts => inner.ReducerLayouts;
        public override IReadOnlyList<ReducerAttributeDeclaration> ReducerAttributes => inner.ReducerAttributes;
        public override IReadOnlyList<string> ReducerHookFragments => inner.ReducerHookFragments;
        public override IReadOnlyList<string> ReducerRowSchemas => inner.ReducerRowSchemas;
        public override IReadOnlyList<string> ReducerFactPlans => inner.ReducerFactPlans;
        public override Component[] CreateComponents(Type entityType) => inner.CreateComponents(entityType);
        public override string WireName(Type entityType) => inner.WireName(entityType);
        public override bool TryResolveEntityType(string name, out Type entityType) => inner.TryResolveEntityType(name, out entityType);
        public override bool IsEntityType(Type concrete, Type query) => inner.IsEntityType(concrete, query);
        public override int ComponentIndex(Type entityType, Type componentType) => inner.ComponentIndex(entityType, componentType);
        public override int ComponentIndex(Type entityType, string componentName) => inner.ComponentIndex(entityType, componentName);
    }
}
