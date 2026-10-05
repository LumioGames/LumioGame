using System.Numerics;
using System.Reflection;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;

namespace Lumio.Bomber.Client.Spectator.Tests;

/// <summary>Native server projection through the real WebSocket/replica owner.
/// Explicit server setup supplies no client-only fields and grants no DS admission.</summary>
public sealed class MovementOwnerBaselineTests
{
    [Fact]
    public void OwnerBaselineRetainsMovementMemoryFromTheActualServerProjection()
    {
        using var scene = ProjectOwner();
        var player = scene.Owner.Host.World!.Get<BomberPlayerState>(scene.Life);
        Assert.Equal(55UL, player.InputMemoryMatchId.Value);
        Assert.Equal((int)BomberDirection.Down, player.PendingTurnDirection.Value);
        Assert.Equal(12UL, player.PendingTurnUntilTick.Value);
        Assert.Equal((int)BomberDirection.Right, player.LastMoveDirection.Value);
        Assert.Equal(1UL, player.LastMoveTick.Value);
        Assert.Equal(1UL, player.LastAssistTick.Value);
        Assert.Equal(500, player.AssistToleranceMilli.Value);
    }

    [Fact]
    public void CurrentServerLifeCanActivateTheClientMovementAbilityBeforeNewAuthority()
    {
        using var scene = ProjectOwner();
        World confirmed = scene.Owner.Host.World!;
        var player = confirmed.Get<BomberPlayerState>(scene.Life);
        var participant = confirmed.Get<BomberParticipantState>(scene.Participant);
        Assert.Equal(scene.Life, participant.CurrentLife.Value);
        Assert.Equal(scene.Participant, player.Participant.Value);
        Assert.Equal(3UL, player.LifeGeneration.Value);
        var input = new MoveAbility.Input { PrimaryDirection = BomberDirection.Right, TurnPressed = false };
        bool accepted = new MoveAbility().CanActivate(in input, confirmed.Get<AbilityComponent>(scene.Life), out string? reason);
        Assert.True(accepted, $"Movement rejected its projected current life: {reason}; player generation={player.LifeGeneration.Value}, participant generation={participant.LifeGeneration.Value}");
    }

    private static ProjectedScene ProjectOwner()
    {
        var owner = new BrowserSessionOwner(parts: true);
        try
        {
            using var server = owner.CreateServerProjectionWorld(new ProjectionRegistry(BrowserSessionOwner.LoadServerRegistry()), 7);
            server.AttachControlAdapter(new ProjectionProfile());
            server.Tick(); server.DrainOutbox();
            Component match = server.World.NamedComponent(new NetEntityId(7, 1), nameof(BomberMatchState))!;
            Assert.NotNull(match);
            Set(match, nameof(BomberMatchState.MatchId), 55UL);
            Set(match, nameof(BomberMatchState.Phase), (int)BomberMatchPhase.Running);
            Assert.True(server.World.Registry.TryResolveEntityType("bomberParticipant", out Type participantType));
            Assert.True(server.World.Registry.TryResolveEntityType("player", out Type playerType));
            var participant = server.World.Commands.CreateFor(participantType);
            var life = server.World.Commands.CreateFor(playerType);
            server.Tick(); server.DrainOutbox();
            Assert.False(participant.AssignedId.IsDefault);
            Assert.False(life.AssignedId.IsDefault);
            Component seat = server.World.NamedComponent(participant.AssignedId, nameof(BomberParticipantState))!;
            Set(seat, nameof(BomberParticipantState.MatchId), 55UL);
            Set(seat, nameof(BomberParticipantState.CurrentLife), life.AssignedId);
            Set(seat, nameof(BomberParticipantState.LifeGeneration), 3UL);
            Set(seat, nameof(BomberParticipantState.LifePhase), (int)BomberLifePhase.Vulnerable);
            Component player = server.World.NamedComponent(life.AssignedId, nameof(BomberPlayerState))!;
            Set(player, nameof(BomberPlayerState.Participant), participant.AssignedId);
            Set(player, nameof(BomberPlayerState.LifeGeneration), 3UL);
            Set(player, nameof(BomberPlayerState.LifePhase), (int)BomberLifePhase.Vulnerable);
            Set(player, nameof(BomberPlayerState.InputMemoryMatchId), 55UL);
            Set(player, nameof(BomberPlayerState.PendingTurnDirection), (int)BomberDirection.Down);
            Set(player, nameof(BomberPlayerState.PendingTurnUntilTick), 12UL);
            Set(player, nameof(BomberPlayerState.LastMoveDirection), (int)BomberDirection.Right);
            Set(player, nameof(BomberPlayerState.LastMoveTick), 1UL);
            Set(player, nameof(BomberPlayerState.LastAssistTick), 1UL);
            Set(player, nameof(BomberPlayerState.AssistToleranceMilli), 500);
            var transform = server.World.Get<LogicTransform>(life.AssignedId);
            TransformController controller = server.World.RegisterTransformController(life.AssignedId, nameof(MoveAbility));
            using (transform.BeginWrite(controller)) transform.SetLocalPosition(new Vector3(7.5f, 1.5f, 7.5f));
            var observer = server.World.Get<ObserverComponent>(life.AssignedId);
            observer.Connected = true; observer.ConnectionGeneration = 1;
            server.Tick();
            var drain = server.DrainOutbox();
            var welcome = Assert.Single(drain.Frames.OfType<WelcomeMessage>(), row => row.Self == life.AssignedId);
            var baseline = Assert.Single(drain.Frames.OfType<WorldChangeMessage>(), row => row.ObserverId == life.AssignedId);
            Assert.Equal(55UL, Get<ulong>(player, nameof(BomberPlayerState.InputMemoryMatchId)));
            Assert.Equal(3UL, Get<ulong>(seat, nameof(BomberParticipantState.LifeGeneration)));
            Authorize(owner, welcome, participant.AssignedId);
            owner.Apply(baseline);
            Assert.Equal("active", owner.Host.ConnectionState);
            Assert.True(owner.Host.InputEnabled);
            Assert.Equal(new Vector3(7.5f, 1.5f, 7.5f), owner.Host.World!.Get<LogicTransform>(life.AssignedId).LocalPosition);
            return new ProjectedScene(owner, life.AssignedId, participant.AssignedId);
        }
        catch { owner.Dispose(); throw; }
    }

    private static void Authorize(BrowserSessionOwner owner, WelcomeMessage welcome, NetEntityId participant)
    {
        var value = new SuccessorAuthorization("SuccessorAuthorization", "initial", owner.Profile,
            new NetEntityId(7, 90).ToHex(), "game-test-socket", "1", "1", 7,
            BrowserSessionOwner.Incarnation.ToHex(), participant.ToHex(), "1", null,
            new AttachmentRecord(participant.ToHex(), welcome.Self.ToHex(), welcome.Self.ToHex(), welcome.ConnectionGeneration, "controlled"), "999");
        var buffer = new byte[4096];
        Assert.True(WireCodec.TryWriteSuccessorAuthorization(in value, owner.Profile, buffer, out int length));
        owner.Send(buffer.AsSpan(0, length).ToArray());
        var initial = new WelcomeMessage(welcome.Self.InstanceId, welcome.Self, welcome.ConnectionGeneration)
            { ControlledLife = welcome.Self, ControlMode = AttachmentControlMode.Controlled };
        owner.Send(WireCodec.EncodePack(initial, owner.WireProfile));
        owner.PumpUntil(() => owner.Host.ConnectionState is "synchronizing" or "faulted");
        Assert.Equal("synchronizing", owner.Host.ConnectionState);
        Assert.False(owner.Host.InputEnabled);
    }

    // The server Gameplay lives in its own load context. Reflection only sets its
    // real draft fields; the wire baseline is generated by the unchanged registry.
    private static object Field(Component component, string name) => component.GetType().GetField(name, BindingFlags.Instance | BindingFlags.Public)!.GetValue(component)!;
    private static void Set(Component component, string name, object value)
    {
        object field = Field(component, name);
        field.GetType().GetProperty("Value")!.SetValue(field, value);
    }
    private static T Get<T>(Component component, string name)
    {
        object field = Field(component, name);
        return (T)field.GetType().GetProperty("Value")!.GetValue(field)!;
    }
    private sealed record ProjectedScene(BrowserSessionOwner Owner, NetEntityId Life, NetEntityId Participant) : IDisposable
    {
        public void Dispose() => Owner.Dispose();
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
