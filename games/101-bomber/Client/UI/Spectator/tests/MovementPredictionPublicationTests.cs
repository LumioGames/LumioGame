using System.Numerics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.Wire;

namespace Lumio.Bomber.Client.Spectator.Tests;

/// <summary>Actual Native section export and ordinary WebSocket/session prediction.
/// Test authority only; it does not replace Platform/DS browser acceptance.</summary>
public sealed class MovementPredictionPublicationTests
{
    [Theory]
    [InlineData("clear")]
    [InlineData("wall")]
    [InlineData("own-bomb")]
    [InlineData("other-life-bomb")]
    public void UnconfirmedInputPublishesMovedOwnerWithoutChangingConfirmedLogic(string boundary)
        => RunActualPrediction(boundary);

    internal static void RunActualPrediction(string boundary, Action<BrowserSessionOwner, NetEntityId>? inspect = null,
        Action<BrowserSessionOwner, NetEntityId>? beforeMove = null, BomberPlayerStepOptions? stepOptions = null,
        ulong wireGeneration = 1)
    {
        using var owner = new BrowserSessionOwner(parts: true, stepOptions: stepOptions);
        using var server = owner.CreateServerProjectionWorld(new ProjectionRegistry(BrowserSessionOwner.LoadServerRegistry()), 7);
        server.AttachControlAdapter(new ProjectionProfile());
        server.Tick(); server.DrainOutbox();
        var match = server.World.NamedComponent(new(7, 1), nameof(BomberMatchState))!;
        Assert.NotNull(match);
        Set(match, nameof(BomberMatchState.MatchId), 55UL);
        Set(match, nameof(BomberMatchState.Phase), (int)BomberMatchPhase.Running);
        Assert.True(server.World.Registry.TryResolveEntityType("bomberParticipant", out Type participantType));
        Assert.True(server.World.Registry.TryResolveEntityType("player", out Type playerType));
        var participant = server.World.Commands.CreateFor(participantType);
        var life = server.World.Commands.CreateFor(playerType);
        server.Tick(); server.DrainOutbox();
        var seat = server.World.NamedComponent(participant.AssignedId, nameof(BomberParticipantState))!;
        Set(seat, nameof(BomberParticipantState.MatchId), 55UL);
        Set(seat, nameof(BomberParticipantState.CurrentLife), life.AssignedId);
        Set(seat, nameof(BomberParticipantState.LifeGeneration), 3UL);
        Set(seat, nameof(BomberParticipantState.LifePhase), (int)BomberLifePhase.Vulnerable);
        var player = server.World.NamedComponent(life.AssignedId, nameof(BomberPlayerState))!;
        Set(player, nameof(BomberPlayerState.Participant), participant.AssignedId);
        Set(player, nameof(BomberPlayerState.LifeGeneration), 3UL);
        Set(player, nameof(BomberPlayerState.LifePhase), (int)BomberLifePhase.Vulnerable);
        Set(player, nameof(BomberPlayerState.InputMemoryMatchId), 55UL);
        server.World.Get<AttributeComponent>(life.AssignedId).SetCurrentValue(BomberAttributeNames.MovementSpeedMilli, 3500);
        Vector3 before = new(7.5f, 1.5f, 7.5f);
        var transform = server.World.Get<LogicTransform>(life.AssignedId);
        using (transform.BeginWrite(server.World.RegisterTransformController(life.AssignedId, nameof(MoveAbility))))
            transform.SetLocalPosition(before);
        var observer = server.World.Get<ObserverComponent>(life.AssignedId);
        NetEntityId bombId = default;
        if (boundary is "own-bomb" or "other-life-bomb")
        {
            Assert.True(server.World.Registry.TryResolveEntityType("bomberBomb", out Type bombType));
            var bombOrder = server.World.Commands.CreateFor(bombType);
            var oldLifeOrder = boundary == "other-life-bomb" ? server.World.Commands.CreateFor(playerType) : null;
            server.Tick(); server.DrainOutbox();
            bombId = bombOrder.AssignedId;
            var bomb = server.World.NamedComponent(bombId, nameof(BomberBombState))!;
            Set(bomb, nameof(BomberBombState.Owner), participant.AssignedId);
            Set(bomb, nameof(BomberBombState.SourceLife), oldLifeOrder?.AssignedId ?? life.AssignedId);
            Set(bomb, nameof(BomberBombState.SourceLifeGeneration), oldLifeOrder is null ? 3UL : 2UL);
            Set(bomb, nameof(BomberBombState.Phase), (int)BomberBombPhase.Fuse);
            Set(bomb, nameof(BomberBombState.FuseEndTick), checked(server.World.Tick + 60UL));
            Set(bomb, nameof(BomberBombState.Power), 1);
            var bombTransform = server.World.Get<LogicTransform>(bombId);
            using (bombTransform.BeginWrite(server.World.RegisterTransformController(bombId, nameof(MoveAbility))))
                bombTransform.SetLocalPosition(before);
        }
        observer.Connected = true; observer.ConnectionGeneration = wireGeneration;
        IBomberConfig config = SpectatorDump.LoadDisplayConfig();
        var exported = ExportActualGround(server, config, boundary == "wall");
        server.Tick();
        var drain = server.DrainOutbox();
        var welcome = Assert.Single(drain.Frames.OfType<WelcomeMessage>(), row => row.Self == life.AssignedId);
        var baseline = Assert.Single(drain.Frames.OfType<WorldChangeMessage>(), row => row.ObserverId == life.AssignedId);
        Authorize(owner, welcome, participant.AssignedId);
        foreach (var row in exported) owner.Send(SectionFrame(baseline.Tick, row));
        var grouped = JsonNode.Parse(WireCodec.EncodePack(baseline, owner.WireProfile))!;
        grouped["sectionGroup"] = new JsonObject {
            ["sent"] = new JsonArray(exported.Select(row => (JsonNode)new JsonObject {
                ["sectionKey"] = row.Key, ["sectionRevision"] = row.Revision }).ToArray()),
            ["deferred"] = new JsonArray(),
        };
        owner.Send(Encoding.UTF8.GetBytes(grouped.ToJsonString()));
        owner.PumpUntil(() => owner.Host.InputEnabled || owner.Host.ConnectionState == "faulted");
        Assert.Equal("active", owner.Host.ConnectionState);
        Assert.True(owner.Host.InputEnabled, string.Join(" | ", owner.Logs));
        var confirmed = owner.Host.World!;
        if (beforeMove is not null)
        {
            Assert.True(confirmed.Manager.ClientPredictionClockEnabled);
            beforeMove(owner, life.AssignedId);
            return;
        }
        var driver = Assert.IsType<Lumio.Client.Spectator.RuntimeJointPrediction>(typeof(SpectatorReplicaHost)
            .GetField("_joint", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(owner.Host));
        Assert.True(driver.IsAttached(confirmed.Manager));
        if (boundary == "own-bomb")
        {
            var projectedBomb = confirmed.Get<BomberBombState>(bombId);
            Assert.Equal(life.AssignedId, projectedBomb.SourceLife.Value);
            Assert.Equal(3UL, projectedBomb.SourceLifeGeneration.Value);
        }
        Assert.Equal(before, confirmed.Get<LogicTransform>(life.AssignedId).LocalPosition);
        Assert.Equal(3500L, confirmed.Get<AttributeComponent>(life.AssignedId).GetCurrentValue(BomberAttributeNames.MovementSpeedMilli));
        Assert.Equal(VoxelPresence.Ready, owner.Voxel!.ReadCell(new(7, checked((byte)config.Map.GroundLayer), 7)).Presence);
        Assert.Equal(VoxelPresence.Ready, owner.Voxel.ReadCell(new(7, checked((byte)config.Map.ObstacleLayer), 7)).Presence);
        ulong authority = confirmed.Tick;
        var delta = confirmed.Manager.LastPresentationKeyDelta;
        byte[] input = owner.TakeInput(() => owner.Host.SendMove((int)BomberDirection.Right, 0, false));
        Assert.NotEmpty(input);
        owner.PumpUntil(() => confirmed.Manager.PredictionPublished &&
            (!ReferenceEquals(delta.Started, confirmed.Manager.LastPresentationKeyDelta.Started) ||
             !ReferenceEquals(delta.Continued, confirmed.Manager.LastPresentationKeyDelta.Continued) ||
             !ReferenceEquals(delta.Ended, confirmed.Manager.LastPresentationKeyDelta.Ended)));
        Assert.Equal(authority, confirmed.Tick);
        Assert.Equal(before, confirmed.Get<LogicTransform>(life.AssignedId).LocalPosition);
        World predicted = Assert.IsType<World>(confirmed.Manager.PredictedWorld);
        Assert.True(predicted.IsLive(life.AssignedId));
        Vector3 after = predicted.Get<LogicTransform>(life.AssignedId).LocalPosition;
        Console.WriteLine(JsonSerializer.Serialize(new { qualification = "ACTUAL_NATIVE_COMPLETE_PREDICTION", boundary, authority,
            participant = participant.AssignedId.ToHex(), life = life.AssignedId.ToHex(),
            before = new[] { before.X, before.Y, before.Z }, after = new[] { after.X, after.Y, after.Z },
            confirmed = new[] { confirmed.Get<LogicTransform>(life.AssignedId).LocalPosition.X,
                confirmed.Get<LogicTransform>(life.AssignedId).LocalPosition.Y, confirmed.Get<LogicTransform>(life.AssignedId).LocalPosition.Z },
            sections = exported.Select(row => new { row.Key, row.Revision, row.Sha256 }), inputSha256 = Convert.ToHexStringLower(SHA256.HashData(input)) }));
        Assert.Equal(before.Y, after.Y);
        Assert.Equal(before.Z, after.Z);
        if (boundary is "wall" or "other-life-bomb") Assert.Equal(before.X, after.X);
        else Assert.InRange(after.X - before.X, 0.1749f, 0.1751f);
        using var presentation = JsonDocument.Parse(owner.Host.PresentationState());
        var displayPlayer = presentation.RootElement.GetProperty("players").EnumerateArray()
            .Single(row => row.GetProperty("id").GetString() == life.AssignedId.ToHex());
        Assert.Equal(after.X, displayPlayer.GetProperty("x").GetSingle());
        using var positions = JsonDocument.Parse(SpectatorDump.DumpPositions(confirmed));
        var displayDot = positions.RootElement.EnumerateArray()
            .Single(row => row.GetProperty("id").GetString() == life.AssignedId.ToHex());
        Assert.Equal(after.X, displayDot.GetProperty("x").GetSingle());
        inspect?.Invoke(owner, life.AssignedId);
    }

    private sealed record ExportedSection(string Key, ulong Revision, string Encoding, byte[] Payload, string Sha256);
    private static List<ExportedSection> ExportActualGround(WorldManager server, IBomberConfig config, bool wall)
    {
        var native = NativeWorldVoxelResources.Require(server).Voxel;
        uint ground = config.Tables.Blocks.Rows.Single(row => row.Name == "floor").BlockType << 8;
        uint obstacle = config.Tables.Blocks.Rows.First(row => row.Enabled && !row.Walkable &&
            row.BlastStop && !row.Destructible && row.SparseBinding == "none").BlockType << 8;
        var rows = new List<ExportedSection>();
        for (int z = 0; z < config.Map.Depth; z += 16)
        for (int x = 0; x < config.Map.Width; x += 16)
        {
            var key = new VoxelSectionKey(x >> 4, 0, z >> 4);
            bool sectionWall = wall && x <= 8 && x + 16 > 8 && z <= 7 && z + 16 > 7;
            using var bytes = new MemoryStream();
            using (var writer = new BinaryWriter(bytes, Encoding.UTF8, true))
            {
                writer.Write((ushort)(sectionWall ? 3 : 2)); writer.Write(0u); writer.Write(ground);
                if (sectionWall) writer.Write(obstacle);
                for (int i = 0; i < 4096; i++) writer.Write((byte)(i / 256 == config.Map.GroundLayer ? 1 :
                    sectionWall && i / 256 == config.Map.ObstacleLayer && x + (i & 15) == 8 && z + ((i >> 4) & 15) == 7 ? 2 : 0));
            }
            byte[] authored = bytes.ToArray();
            native.RequestSection(key);
            native.DeliverSection(key, 1, VoxelSectionEncoding.Palette, authored, SHA256.HashData(authored), null);
            using var export = native.OpenSectionExport(new(1, 1024 * 1024, 1024 * 1024));
            using var snapshot = export.Acquire(key, 1);
            Assert.Equal(5, export.Read(snapshot, null, Span<byte>.Empty, out var size));
            byte[] payload = new byte[size.RequiredBytes];
            Assert.Equal(0, export.Read(snapshot, null, payload, out var record));
            rows.Add(new($"s:{key.X}:{key.Y}:{key.Z}", record.SectionRevision, record.Encoding.ToString(), payload, Convert.ToHexStringLower(SHA256.HashData(payload))));
        }
        return rows;
    }
    private static byte[] SectionFrame(ulong tick, ExportedSection row) => JsonSerializer.SerializeToUtf8Bytes(new {
        messageType = "SectionFrame", tick, sectionKey = row.Key, sectionRevision = row.Revision,
        encoding = row.Encoding, payloadLength = row.Payload.Length, payload = Convert.ToHexStringLower(row.Payload),
        payloadSha256 = row.Sha256, observerPresence = "absent", deliveryReason = "first" });
    private static void Set(Component component, string name, object value)
    {
        object field = component.GetType().GetField(name, BindingFlags.Instance | BindingFlags.Public)!.GetValue(component)!;
        field.GetType().GetProperty("Value")!.SetValue(field, value);
    }
    private static void Authorize(BrowserSessionOwner owner, WelcomeMessage welcome, NetEntityId participant)
    {
        var auth = new SuccessorAuthorization("SuccessorAuthorization", "initial", owner.Profile, new NetEntityId(7, 90).ToHex(),
            "game-test-socket", "1", "1", 7, BrowserSessionOwner.Incarnation.ToHex(), participant.ToHex(), "1", null,
            new AttachmentRecord(participant.ToHex(), welcome.Self.ToHex(), welcome.Self.ToHex(), welcome.ConnectionGeneration, "controlled"), "999");
        byte[] buffer = new byte[4096];
        Assert.True(WireCodec.TryWriteSuccessorAuthorization(in auth, owner.Profile, buffer, out int length));
        owner.Send(buffer.AsSpan(0, length).ToArray());
        owner.Send(WireCodec.EncodePack(new WelcomeMessage(welcome.Self.InstanceId, welcome.Self, welcome.ConnectionGeneration)
            { ControlledLife = welcome.Self, ControlMode = AttachmentControlMode.Controlled }, owner.WireProfile));
        owner.PumpUntil(() => owner.Host.ConnectionState is "synchronizing" or "faulted");
        Assert.Equal("synchronizing", owner.Host.ConnectionState);
    }
    private sealed class ProjectionProfile : IWorldControlAdapter
    {
        public WireProfile ProfileFor(string connection) => WireProfile.SuccessorBindingPartsV1;
        public bool TryResolveConnection(NetEntityId observer, out string connection) { connection = observer.ToHex(); return true; }
        public bool TryHandle(WorldMessage message, out ErrorMessage? failure) { failure = null; return false; }
    }
    private sealed class ProjectionRegistry(EcsRegistry inner) : EcsRegistry
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
