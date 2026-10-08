using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class ParticipantSelfProjectionTests
{
    private static readonly NetEntityId Participant = new(7, 4);
    private static readonly NetEntityId OtherLife = new(7, 3);
    private static readonly NetEntityId NewLife = new(7, 8);
    private static readonly NetEntityId Bomb = new(7, 5);

    [Theory]
    [InlineData(BomberLifePhase.Protected)]
    [InlineData(BomberLifePhase.Vulnerable)]
    [InlineData(BomberLifePhase.AwaitingRespawn)]
    [InlineData(BomberLifePhase.Eliminated)]
    public void ParticipantSelfProjectsOnlyParticipantFactsAndNeverOpensPlayerInput(BomberLifePhase phase)
    {
        using var owner = new BrowserSessionOwner();
        using var client = owner.CreateClientWorld();
        BindObservingParticipant(client, phase);
        Assert.Equal(typeof(BomberParticipantEntity), client.World.TypeOf(Participant).ClrType);
        Assert.Throws<InvalidOperationException>(() => client.World.Get<BomberPlayerState>(Participant));

        using var state = JsonDocument.Parse(SpectatorDump.DumpPlayerState(client.World, "active", true, "1", "0"));
        var root = state.RootElement;
        Assert.Equal(Participant.ToHex(), root.GetProperty("selfId").GetString());
        Assert.Equal(Participant.ToHex(), root.GetProperty("participantId").GetString());
        Assert.Equal(phase.ToString(), root.GetProperty("lifePhase").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("characterName").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("availableBombs").ValueKind);
        Assert.False(root.GetProperty("inputOpen").GetBoolean());
        Assert.Equal("Running", root.GetProperty("phase").GetString());
        Assert.Equal(Bomb.ToHex(), Assert.Single(root.GetProperty("bombs").EnumerateArray()).GetProperty("id").GetString());

        using var positions = JsonDocument.Parse(SpectatorDump.DumpPositions(client.World));
        Assert.Contains(positions.RootElement.EnumerateArray(), row => row.GetProperty("id").GetString() == OtherLife.ToHex());
        Assert.Contains(positions.RootElement.EnumerateArray(), row => row.GetProperty("id").GetString() == Bomb.ToHex());
        Assert.DoesNotContain(positions.RootElement.EnumerateArray(), row => row.TryGetProperty("self", out var own) && own.GetBoolean());
        using var presentation = JsonDocument.Parse(PresentationDump.Dump(client.World, "1"));
        Assert.Equal(Participant.ToHex(), presentation.RootElement.GetProperty("selfId").GetString());
        Assert.Single(presentation.RootElement.GetProperty("players").EnumerateArray());
        Assert.Single(presentation.RootElement.GetProperty("participants").EnumerateArray());
    }

    [Fact]
    public void ControlledPlayerKeepsItsAuthoritativePlayerStatsAndInput()
    {
        using var owner = new BrowserSessionOwner();
        using var client = owner.CreateClientWorld();
        client.Enqueue(new WelcomeMessage(7, NewLife, 9)
        { ControlledLife = NewLife, ControlMode = AttachmentControlMode.Controlled });
        client.Enqueue(Change(1, WorldCreate(), PlayerCreate(NewLife)));
        client.Tick();

        using var state = JsonDocument.Parse(SpectatorDump.DumpPlayerState(client.World, "active", true, "1", "0"));
        Assert.Equal(NewLife.ToHex(), state.RootElement.GetProperty("selfId").GetString());
        Assert.Equal(Participant.ToHex(), state.RootElement.GetProperty("participantId").GetString());
        Assert.Equal("Vulnerable", state.RootElement.GetProperty("lifePhase").GetString());
        Assert.Equal("duck", state.RootElement.GetProperty("characterName").GetString());
        Assert.Equal(9, state.RootElement.GetProperty("availableBombs").GetInt64());
        Assert.True(state.RootElement.GetProperty("inputOpen").GetBoolean());
    }

    [Fact]
    public void NewWelcomeGenerationRebindsSelfToItsNewLifeWithoutReusingOtherPlayerStats()
    {
        using var owner = new BrowserSessionOwner();
        using var client = owner.CreateClientWorld();
        BindObservingParticipant(client, BomberLifePhase.AwaitingRespawn);
        using (var waiting = JsonDocument.Parse(SpectatorDump.DumpPlayerState(client.World, "active", true, "1", "0")))
        {
            Assert.Equal(Participant.ToHex(), waiting.RootElement.GetProperty("participantId").GetString());
            Assert.False(waiting.RootElement.GetProperty("inputOpen").GetBoolean());
        }

        client.Enqueue(new WelcomeMessage(7, NewLife, 10)
        { ControlledLife = NewLife, ControlMode = AttachmentControlMode.Controlled });
        client.Enqueue(Change(2, PlayerCreate(NewLife)));
        client.Tick();
        Assert.Equal(NewLife, client.World.Self.Id);
        using var state = JsonDocument.Parse(SpectatorDump.DumpPlayerState(client.World, "active", true, "2", "0"));
        Assert.Equal(NewLife.ToHex(), state.RootElement.GetProperty("selfId").GetString());
        Assert.Equal(Participant.ToHex(), state.RootElement.GetProperty("participantId").GetString());
        Assert.Equal("duck", state.RootElement.GetProperty("characterName").GetString());
        Assert.Equal(9, state.RootElement.GetProperty("availableBombs").GetInt64());
        Assert.True(state.RootElement.GetProperty("inputOpen").GetBoolean());
        using var positions = JsonDocument.Parse(SpectatorDump.DumpPositions(client.World));
        Assert.Equal(NewLife.ToHex(), Assert.Single(positions.RootElement.EnumerateArray(),
            row => row.TryGetProperty("self", out var own) && own.GetBoolean()).GetProperty("id").GetString());
    }

    [Fact]
    public void BoundSelfAbsentFromAuthorityDoesNotBorrowAnotherReplicaLife()
    {
        using var owner = new BrowserSessionOwner();
        using var client = owner.CreateClientWorld();
        client.Enqueue(new WelcomeMessage(7, Participant, 9)
        { ControlledLife = null, ControlMode = AttachmentControlMode.Observing });
        client.Enqueue(Change(1, WorldCreate(), PlayerCreate(OtherLife)));
        client.Tick();

        using var state = JsonDocument.Parse(SpectatorDump.DumpPlayerState(client.World, "active", true, "1", "0"));
        foreach (string field in new[] { "selfId", "participantId", "lifePhase", "characterName", "availableBombs" })
            Assert.Equal(JsonValueKind.Null, state.RootElement.GetProperty(field).ValueKind);
        Assert.False(state.RootElement.GetProperty("inputOpen").GetBoolean());
    }

    private static void BindObservingParticipant(WorldManager client, BomberLifePhase phase)
    {
        client.Enqueue(new WelcomeMessage(7, Participant, 9)
        { ControlledLife = null, ControlMode = AttachmentControlMode.Observing });
        client.Enqueue(Change(1, WorldCreate(),
            new CreateRecord("bomberParticipant", Participant, new[] {
                new FieldValue(nameof(BomberParticipantState), "lifePhase", (int)phase),
                new FieldValue(nameof(BomberParticipantState), "lastLife", OtherLife),
                new FieldValue(nameof(BomberParticipantState), "matchId", 1UL),
            }),
            PlayerCreate(OtherLife),
            new CreateRecord("bomberBomb", Bomb, new[] {
                new FieldValue(nameof(LogicTransform), "localPosition", "3,1.5,4"),
                new FieldValue(nameof(BomberBombState), "owner", Participant),
            })));
        client.Tick();
    }

    private static CreateRecord WorldCreate() => new("world", new NetEntityId(7, 1), new[] {
        new FieldValue(nameof(BomberMatchState), "phase", (int)BomberMatchPhase.Running),
        new FieldValue(nameof(BomberMatchState), "matchId", 1UL),
    });

    private static CreateRecord PlayerCreate(NetEntityId life) => new("player", life, new[] {
        new FieldValue(nameof(LogicTransform), "localPosition", "1,1.5,2"),
        new FieldValue(nameof(BomberPlayerState), "participant", Participant),
        new FieldValue(nameof(BomberPlayerState), "lifePhase", (int)BomberLifePhase.Vulnerable),
        new FieldValue(nameof(BomberSkillState), "characterId", 118002U),
        new FieldValue(nameof(AttributeComponent), "availableBombsBase", 9L),
    });

    private static WorldChangeMessage Change(ulong tick, params CreateRecord[] created) => new(tick, 0,
        created, Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>());
}
