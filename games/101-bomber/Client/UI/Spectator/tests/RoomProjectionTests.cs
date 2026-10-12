using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class RoomProjectionTests
{
    private static readonly NetEntityId Self = new(7, 2);
    private static readonly NetEntityId Bot = new(7, 3);

    [Fact]
    public void MissingWorldHasNoInventedRoom()
    {
        using var doc = JsonDocument.Parse(SpectatorDump.DumpPlayerState(null, "synchronizing", false, "0", "0"));
        Assert.True(doc.RootElement.TryGetProperty("room", out var room));
        Assert.Equal(JsonValueKind.Null, room.ValueKind);
    }

    [Fact]
    public void WaitingRosterUsesReplicatedNamesBotsAndAuthorityTicks()
    {
        using var owner = new BrowserSessionOwner();
        owner.Authorize();
        owner.Apply(Change(100, new[] {
            new CreateRecord("world", new NetEntityId(7, 1), new[] {
                new FieldValue(nameof(BomberMatchState), "phase", (int)BomberMatchPhase.WaitingForWorldReady),
                new FieldValue(nameof(BomberWorldRuntime), "botFillEnabled", true),
                new FieldValue(nameof(BomberWorldRuntime), "botNextJoinTick", 160UL),
            }),
            Player(Self, "Alice", false), Player(Bot, "bot001", true),
        }));
        using var doc = JsonDocument.Parse(owner.Host.PlayerState());
        var room = doc.RootElement.GetProperty("room");
        Assert.Equal(8, room.GetProperty("capacity").GetInt32());
        Assert.Equal(1, room.GetProperty("humans").GetInt32());
        Assert.Equal(1, room.GetProperty("bots").GetInt32());
        Assert.True(room.GetProperty("fillEnabled").GetBoolean());
        Assert.Equal("160", room.GetProperty("nextBotJoinTick").GetString());
        Assert.Equal("100", room.GetProperty("authorityTick").GetString());
        Assert.Equal(20UL, room.GetProperty("tickRateHz").GetUInt64());
        var players = room.GetProperty("players").EnumerateArray().ToArray();
        Assert.Equal(2, players.Length);
        Assert.Equal("Alice", players[0].GetProperty("name").GetString());
        Assert.True(players[0].GetProperty("isSelf").GetBoolean());
        Assert.Equal("bot001", players[1].GetProperty("name").GetString());
        Assert.True(players[1].GetProperty("isBot").GetBoolean());
    }

    [Fact]
    public void FillInputUsesNormalOwnerGasWithoutMutatingReplica()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        owner.Apply(Change(1, new[] {
            new CreateRecord("world", new NetEntityId(7, 1), new[] { new FieldValue(nameof(BomberMatchState), "phase", 0) }),
            new CreateRecord("player", Self, new[] {
                new FieldValue(nameof(BomberPlayerState), "participant", new NetEntityId(7, 4)),
                new FieldValue(nameof(BomberPlayerState), "lifeGeneration", 1UL),
            }),
            new CreateRecord("bomberParticipant", new NetEntityId(7, 4), new[] {
                new FieldValue(nameof(BomberParticipantState), "currentLife", Self),
                new FieldValue(nameof(BomberParticipantState), "lifeGeneration", 1UL),
            }),
        }));
        var method = typeof(SpectatorReplicaHost).GetMethod("SetBotFill");
        Assert.NotNull(method);
        var frames = owner.TakeInputs(2, () => {
            Assert.True((bool)method.Invoke(owner.Host, new object[] { true })!);
            Assert.True((bool)method.Invoke(owner.Host, new object[] { false })!);
        });
        for (int i = 0; i < frames.Length; i++) {
            var command = WireCodec.DecodeAuthenticatedInput(frames[i], WireProfile.SuccessorBindingV1, Self, 9, "game-test-socket", BrowserSessionOwner.Incarnation);
            Assert.Equal(Self, command.Sender);
            Assert.Equal((ulong)i + 1, command.Sequence);
            Assert.Contains("SetBotFillAbility", Encoding.UTF8.GetString(command.Payload.Span));
        }
        using var state = JsonDocument.Parse(owner.Host.PlayerState());
        Assert.False(state.RootElement.GetProperty("room").GetProperty("fillEnabled").GetBoolean());
    }

    [Fact]
    public void WaitingSelectionProjectsTheOwnerLatchBeforeSkillsBind()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        owner.Apply(Change(1, new[] {
            new CreateRecord("world", new NetEntityId(7, 1), new[] { new FieldValue(nameof(BomberMatchState), "phase", 0) }),
            new CreateRecord("player", Self, new[] { new FieldValue(nameof(BomberPlayerState), "nextCharacterId", 118002) }),
        }));
        using var doc = JsonDocument.Parse(owner.Host.PlayerState());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("characterName").ValueKind);
        Assert.Equal("duck", doc.RootElement.GetProperty("selectedCharacterName").GetString());
    }

    private static CreateRecord Player(NetEntityId id, string name, bool isBot) => new("player", id, new[] {
        new FieldValue("IdentityComponent", "name", name),
        new FieldValue(nameof(BomberPlayerState), "isBot", isBot),
    });
    private static WorldChangeMessage Change(ulong tick, CreateRecord[] creates) => new(tick, 0, creates, Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>());
}
