using System.Numerics;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class PlayerInputTests
{
    private static readonly NetEntityId Self = new(7, 2);
    private static readonly NetEntityId Participant = new(7, 4);

    [Fact]
    public void SameFrameBombTapPreservesBothTypedCommandsWithoutCreatingReplicaBombs()
    {
        using var ready = ReadyHost();
        World world = ready.World!;
        ulong tick = world.Tick;
        var frames = ready.Owner.TakeInputs(2, () => {
            Assert.True(ready.Owner.Host.BombButton(1));
            Assert.True(ready.Owner.Host.BombButton(3));
        }).Select(Decode).ToArray();
        Assert.Equal(new ulong[] { 1, 2 }, frames.Select(frame => frame.Sequence));
        Assert.All(frames, frame => Assert.Equal(Self, frame.Sender));
        Assert.Contains(nameof(BombButtonAbility), Encoding.UTF8.GetString(frames[0].Payload.Span));
        Assert.Contains(nameof(BombButtonReleaseAbility), Encoding.UTF8.GetString(frames[1].Payload.Span));
        Assert.Equal(tick, world.Tick);
        Assert.Empty(world.Each<BomberBombState>());
    }

    [Theory]
    [InlineData(1, nameof(BombButtonAbility))]
    [InlineData(2, nameof(BombButtonAbility))]
    [InlineData(3, nameof(BombButtonReleaseAbility))]
    [InlineData(4, nameof(BombButtonReleaseAbility))]
    public void EveryBombGestureEdgeUsesItsPublishedAbility(int phase, string ability)
    {
        using var ready = ReadyHost();
        var message = Decode(ready.Owner.TakeInput(() => ready.Owner.Host.BombButton(phase)));
        Assert.Equal(WireCodec.ServerRpc, message.MappingId);
        Assert.Contains(ability, Encoding.UTF8.GetString(message.Payload.Span));
        Assert.Empty(ready.World!.Each<BomberBombState>());
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(0)]
    [InlineData(5)]
    [InlineData(int.MaxValue)]
    public void InvalidBombGestureDoesNotConsumeInputSequence(int phase)
    {
        using var ready = ReadyHost();
        Assert.Throws<ArgumentException>(() => ready.Owner.Host.BombButton(phase));
        Assert.Equal(1UL, Decode(ready.PlaceBomb()).Sequence);
    }

    [Fact]
    public void TypedInputsProduceConsecutiveServerCommandsWithoutLocalSimulation()
    {
        using var host = ReadyHost();
        World world = host.World!;
        Vector3 before = world.Get<LogicTransform>(Self).WorldPosition;
        ulong tick = world.Tick;

        InputCommandMessage move = Decode(host.SendMove((int)BomberDirection.Right, 0, true));
        InputCommandMessage bomb = Decode(host.PlaceBomb());

        Assert.Equal(1UL, move.Sequence);
        Assert.Equal(2UL, bomb.Sequence);
        Assert.Equal(Self, move.Sender);
        Assert.Equal(Self, bomb.Sender);
        Assert.Equal(WireCodec.ServerRpc, move.MappingId);
        Assert.Equal(WireCodec.ServerRpc, bomb.MappingId);
        Assert.Contains(nameof(MoveAbility), Encoding.UTF8.GetString(move.Payload.Span));
        Assert.Contains(nameof(PlaceBombAbility), Encoding.UTF8.GetString(bomb.Payload.Span));
        Assert.Equal(before, world.Get<LogicTransform>(Self).WorldPosition);
        Assert.Equal(tick, world.Tick); // Sending authority-only input does not advance simulation.
        Assert.Equal("1", JsonDocument.Parse(host.PlayerState()).RootElement.GetProperty("authorityTick").GetString());
        Assert.Empty(world.Each<BomberBombState>());
    }

    [Fact]
    public void SkillAndCharacterRequestsUseAuthorityOnlyGasAndConfigIds()
    {
        using var host = ReadyHost(BomberMatchPhase.Warmup);
        World world = host.World!;
        ulong tick = world.Tick;
        Vector3 position = world.Get<LogicTransform>(Self).WorldPosition;
        uint character = world.Get<BomberSkillState>(Self).CharacterId.Value;

        InputCommandMessage selection = Decode(host.SelectCharacter("duck"));
        InputCommandMessage skill = Decode(host.UseActiveSkill());

        Assert.Equal(1UL, selection.Sequence);
        Assert.Equal(2UL, skill.Sequence);
        Assert.Equal(Self, selection.Sender);
        Assert.Equal(Self, skill.Sender);
        Assert.Equal(WireCodec.ServerRpc, selection.MappingId);
        Assert.Equal(WireCodec.ServerRpc, skill.MappingId);
        Assert.Contains(nameof(SelectCharacterAbility), Encoding.UTF8.GetString(selection.Payload.Span));
        Assert.Contains("118002", Encoding.UTF8.GetString(selection.Payload.Span));
        Assert.Contains(nameof(UseActiveSkillAbility), Encoding.UTF8.GetString(skill.Payload.Span));
        Assert.Equal(character, world.Get<BomberSkillState>(Self).CharacterId.Value);
        Assert.Equal(position, world.Get<LogicTransform>(Self).WorldPosition);
        Assert.Equal(tick, world.Tick);
        Assert.Equal("1", JsonDocument.Parse(host.PlayerState()).RootElement.GetProperty("authorityTick").GetString());
        Assert.Empty(world.Each<BomberBombState>());
    }

    [Fact]
    public void FifthCharacterUsesItsGeneratedIdentityWithoutMutatingReplica()
    {
        using var host = ReadyHost(BomberMatchPhase.Warmup);
        uint before = host.World!.Get<BomberSkillState>(Self).CharacterId.Value;
        InputCommandMessage selection = Decode(host.SelectCharacter("kangaroo"));
        Assert.Contains("118005", Encoding.UTF8.GetString(selection.Payload.Span));
        Assert.Equal(before, host.World.Get<BomberSkillState>(Self).CharacterId.Value);
    }

    [Fact]
    public void WaitingForWorldReadySelectionUsesGasBeforeParticipantExists()
    {
        using var host = ReadyHost(BomberMatchPhase.WaitingForWorldReady);
        World world = host.World!;
        Assert.True(world.Get<BomberPlayerState>(Self).Participant.Value.IsDefault);
        uint before = world.Get<BomberSkillState>(Self).CharacterId.Value;
        ulong tick = world.Tick;

        InputCommandMessage selection = Decode(host.SelectCharacter("duck"));

        Assert.Equal(1UL, selection.Sequence);
        Assert.Equal(Self, selection.Sender);
        Assert.Equal(WireCodec.ServerRpc, selection.MappingId);
        Assert.Contains(nameof(SelectCharacterAbility), Encoding.UTF8.GetString(selection.Payload.Span));
        Assert.Contains("118002", Encoding.UTF8.GetString(selection.Payload.Span));
        Assert.Equal(before, world.Get<BomberSkillState>(Self).CharacterId.Value);
        Assert.Equal(tick, world.Tick);
        Assert.Equal("1", JsonDocument.Parse(host.PlayerState()).RootElement.GetProperty("authorityTick").GetString());
    }

    [Fact]
    public void UnsupportedCharacterAndClosedSelectionDoNotPublishCommands()
    {
        { using var warmup = ReadyHost(BomberMatchPhase.Warmup);
        Assert.Throws<ArgumentException>(() => warmup.SelectCharacter("unknown-character"));
        Assert.Throws<ArgumentException>(() => warmup.SelectCharacter("118002"));
        Assert.Equal(1UL, Decode(warmup.PlaceBomb()).Sequence);

        }
        { using var results = ReadyHost(BomberMatchPhase.Results);
        InputCommandMessage choice = Decode(results.SelectCharacter("duck"));
        Assert.Equal(1UL, choice.Sequence);
        Assert.Contains("118002", Encoding.UTF8.GetString(choice.Payload.Span));
        Assert.Equal(2UL, Decode(results.SelectCharacter("cat")).Sequence);

        }
        { using var running = ReadyHost();
        Assert.Throws<InvalidOperationException>(() => running.SelectCharacter("duck"));
        Assert.Equal(1UL, Decode(running.UseActiveSkill()).Sequence);
        }
        { using var podium = ReadyHost(BomberMatchPhase.Podium);
        Assert.Throws<InvalidOperationException>(() => podium.SelectCharacter("duck")); }
    }

    [Fact]
    public void InputRequiresCommittedSelfAndRejectsAfterDisposal()
    {
        using var owner = new BrowserSessionOwner();
        var host = owner.Host;
        Assert.Throws<InvalidOperationException>(() => host.PlaceBomb());
        owner.Authorize();
        Assert.Throws<InvalidOperationException>(() => host.SendMove(2, 0, false));
        host.Dispose(); owner.PumpUntil(() => host.Closed);
        Assert.Throws<ObjectDisposedException>(() => host.PlaceBomb());
    }

    [Theory]
    [InlineData(-1, 0)]
    [InlineData(5, 0)]
    [InlineData(1, 5)]
    public void InvalidDirectionDoesNotConsumeInputSequence(int primary, int secondary)
    {
        using var host = ReadyHost();
        Assert.Throws<ArgumentException>(() => host.SendMove(primary, secondary, false));
        Assert.Equal(1UL, Decode(host.PlaceBomb()).Sequence);
    }

    [Fact]
    public void SharedIdleMoveConsumesOneSequenceBeforeBomb()
    {
        using var host = ReadyHost();
        var idle = Decode(host.SendMove(0, 0, false));
        Assert.Single(idle.Commands);
        Assert.Equal(1UL, idle.Sequence);
        Assert.Equal(2UL, Decode(host.PlaceBomb()).Sequence);
    }

    [Fact]
    public void PlayerStateAndBombOwnershipComeFromCommittedAuthority()
    {
        using var host = ReadyHost();
        using JsonDocument state = JsonDocument.Parse(host.PlayerState());
        Assert.Equal(Self.ToHex(), state.RootElement.GetProperty("selfId").GetString());
        Assert.Equal(Participant.ToHex(), state.RootElement.GetProperty("participantId").GetString());
        Assert.Equal("Running", state.RootElement.GetProperty("phase").GetString());
        Assert.Equal("Vulnerable", state.RootElement.GetProperty("lifePhase").GetString());
        Assert.Equal(2, state.RootElement.GetProperty("availableBombs").GetInt64());
        Assert.True(state.RootElement.GetProperty("inputOpen").GetBoolean());
        Assert.Equal(20, state.RootElement.GetProperty("tickRateHz").GetInt32());

        var bomb = new NetEntityId(7, 5);
        // Acknowledgement 2 belongs to two actual previously sent inputs.
        Assert.Equal(1UL, Decode(host.SendMove(1, 0, false)).Sequence);
        Assert.Equal(2UL, Decode(host.SendMove(2, 0, false)).Sequence);
        host.Owner.Apply(new WorldChangeMessage(2, 2,
            new[] { new CreateRecord("bomberBomb", bomb, new[] {
                new FieldValue(nameof(LogicTransform), "localPosition", "2,1.5,2"),
                new FieldValue(nameof(BomberBombState), "owner", Participant),
            }) }, Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>()));

        using JsonDocument dump = JsonDocument.Parse(SpectatorDump.DumpPositions(host.World!));
        JsonElement row = Assert.Single(dump.RootElement.EnumerateArray(), item => item.GetProperty("id").GetString() == bomb.ToHex());
        Assert.Equal(Participant.ToHex(), row.GetProperty("ownerId").GetString());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("sourceLifeId").ValueKind);
        using JsonDocument after = JsonDocument.Parse(host.PlayerState());
        Assert.Equal("2", after.RootElement.GetProperty("appliedInputSequence").GetString());
        Assert.Equal("2", after.RootElement.GetProperty("authorityTick").GetString());
        JsonElement playerBomb = Assert.Single(after.RootElement.GetProperty("bombs").EnumerateArray());
        Assert.Equal(bomb.ToHex(), playerBomb.GetProperty("id").GetString());
        Assert.Equal(Participant.ToHex(), playerBomb.GetProperty("ownerId").GetString());
        Assert.Equal(2, playerBomb.GetProperty("x").GetSingle());
        Assert.Equal(2, playerBomb.GetProperty("z").GetSingle());
    }

    private static InputCommandMessage Decode(byte[] frame) => WireCodec.DecodeAuthenticatedInput(frame,
        WireProfile.SuccessorBindingV1, Self, 9, "game-test-socket", BrowserSessionOwner.Incarnation);

    private sealed class ReadySession : IDisposable
    {
        public BrowserSessionOwner Owner { get; } = new();
        private SpectatorReplicaHost Host => Owner.Host;
        public World? World => Host.World;
        public bool InputEnabled => Host.InputEnabled;
        public string PlayerState() => Host.PlayerState();
        public byte[] SendMove(int primary, int secondary, bool turn) => Owner.TakeInput(() => Host.SendMove(primary, secondary, turn));
        public byte[] PlaceBomb() => Owner.TakeInput(Host.PlaceBomb);
        public byte[] UseActiveSkill() => Owner.TakeInput(Host.UseActiveSkill);
        public byte[] SelectCharacter(string character) => Owner.TakeInput(() => Host.SelectCharacter(character));
        public void Dispose() => Owner.Dispose();
    }

    private static ReadySession ReadyHost(BomberMatchPhase phase = BomberMatchPhase.Running)
    {
        var host = new ReadySession();
        host.Owner.Authorize();
        host.Owner.Apply(new WorldChangeMessage(1, 0,
            new[] {
                new CreateRecord("world", new NetEntityId(7, 1), new[] {
                    new FieldValue(nameof(BomberMatchState), "phase", (int)phase),
                    new FieldValue(nameof(BomberMatchState), "matchId", 1UL),
                }),
                new CreateRecord("player", Self, new[] {
                    new FieldValue(nameof(LogicTransform), "localPosition", "1,1.5,2"),
                    new FieldValue(nameof(BomberPlayerState), "participant",
                        phase == BomberMatchPhase.WaitingForWorldReady ? default : Participant),
                    new FieldValue(nameof(BomberPlayerState), "lifePhase", (int)BomberLifePhase.Vulnerable),
                    new FieldValue(nameof(AttributeComponent), "availableBombsBase", 2L),
                }),
            }, Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>()));
        Assert.True(host.InputEnabled);
        return host;
    }
}
