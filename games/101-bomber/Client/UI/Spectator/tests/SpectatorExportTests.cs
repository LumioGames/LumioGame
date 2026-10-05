using System.Globalization;
using System.Numerics;
using System.Text.Json;
using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Components.Identity;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class SpectatorExportTests
{
    [Fact]
    public void DumpPositionsMatchesLiveLogicTransformWorldPosition()
    {
        const ulong instance = 7UL;
        NetEntityId worldId = new(instance, 1UL);
        NetEntityId self = new(instance, 2UL);
        NetEntityId other = new(instance, 3UL);
        NetEntityId third = new(instance, 4UL);
        var poses = new Dictionary<NetEntityId, Vector3>
        {
            [self] = new Vector3(1.25f, 0f, 2.5f),
            [other] = new Vector3(-4f, 0f, 8f),
            [third] = new Vector3(10f, 0f, -3f),
        };

        using var owner = new BrowserSessionOwner();
        using WorldManager client = owner.CreateClientWorld();

        client.Enqueue(new WelcomeMessage(instance, self, 1UL));
        client.Enqueue(new WorldChangeMessage(
            1UL,
            0UL,
            new[]
            {
                new CreateRecord("world", worldId, Array.Empty<FieldValue>()),
                PlayerCreate(self, poses[self]),
                PlayerCreate(other, poses[other]),
                new CreateRecord("bomberBomb", third, new[]
                {
                    new FieldValue(nameof(LogicTransform), "localPosition", "10,0,-3"),
                }),
            },
            Array.Empty<FieldChange>(),
            Array.Empty<DestroyRecord>(),
            Array.Empty<ClientRpcRecord>()));
        client.Tick();

        string json = SpectatorDump.DumpPositions(client.World);
        using JsonDocument document = JsonDocument.Parse(json);
        Assert.Equal(JsonValueKind.Array, document.RootElement.ValueKind);

        var dumped = new Dictionary<string, (float X, float Z)>();
        foreach (JsonElement row in document.RootElement.EnumerateArray())
        {
            Assert.True(row.TryGetProperty("id", out JsonElement id));
            Assert.True(row.TryGetProperty("x", out JsonElement x));
            Assert.True(row.TryGetProperty("z", out JsonElement z));
            dumped[id.GetString()!] = (x.GetSingle(), z.GetSingle());
        }

        Assert.Equal(poses.Count, dumped.Count);
        foreach (LogicTransform transform in client.World.Each<LogicTransform>())
        {
            Vector3 local = transform.WorldPosition;
            Assert.True(dumped.TryGetValue(transform.Entity.ToHex(), out (float X, float Z) row));
            Assert.Equal(local.X, row.X);
            Assert.Equal(local.Z, row.Z);
            Assert.Equal(poses[transform.Entity].X, local.X);
            Assert.Equal(poses[transform.Entity].Z, local.Z);
        }
        using JsonDocument generic = JsonDocument.Parse(json);
        JsonElement bomb = Assert.Single(generic.RootElement.EnumerateArray(),
            row => row.GetProperty("id").GetString() == third.ToHex());
        Assert.Equal("bomberBomb", bomb.GetProperty("type").GetString());
        Assert.False(bomb.TryGetProperty("characterId", out _));
    }

    [Fact]
    public void ApplyPackWelcomeAndWorldChangeFeedsDump()
    {
        const ulong instance = 11UL;
        NetEntityId worldId = new(instance, 1UL);
        NetEntityId self = new(instance, 2UL);
        var pose = new Vector3(6f, 0f, -2f);

        using var owner = new BrowserSessionOwner();
        using WorldManager client = owner.CreateClientWorld();
        byte[] welcome = WireCodec.EncodePack(new WelcomeMessage(instance, self, 1UL));
        byte[] change = WireCodec.EncodePack(new WorldChangeMessage(
            1UL,
            0UL,
            new[]
            {
                new CreateRecord("world", worldId, Array.Empty<FieldValue>()),
                PlayerCreate(self, pose),
            },
            Array.Empty<FieldChange>(),
            Array.Empty<DestroyRecord>(),
            Array.Empty<ClientRpcRecord>()));

        SpectatorDump.ApplyPack(client, welcome);
        SpectatorDump.ApplyPack(client, change);

        LogicTransform live = client.World.Get<LogicTransform>(self);
        using JsonDocument document = JsonDocument.Parse(SpectatorDump.DumpPositions(client.World));
        JsonElement row = document.RootElement[0];
        Assert.Equal(self.ToHex(), row.GetProperty("id").GetString());
        Assert.True(row.GetProperty("self").GetBoolean());
        Assert.Equal(live.WorldPosition.X, row.GetProperty("x").GetSingle());
        Assert.Equal(live.WorldPosition.Z, row.GetProperty("z").GetSingle());
        Assert.Equal(pose.X, live.LocalPosition.X);
        Assert.Equal(pose.Z, live.LocalPosition.Z);
    }

    [Fact]
    public void DumpPositionsCarriesReplicatedIdentityAndConfiguredCharacter()
    {
        const ulong instance = 21UL;
        NetEntityId worldId = new(instance, 1UL);
        NetEntityId self = new(instance, 2UL);
        NetEntityId other = new(instance, 3UL);

        using var owner = new BrowserSessionOwner();
        using WorldManager client = owner.CreateClientWorld();
        client.Enqueue(new WelcomeMessage(instance, self, 1UL));
        client.Enqueue(new WorldChangeMessage(
            1UL,
            0UL,
            new[]
            {
                new CreateRecord("world", worldId, Array.Empty<FieldValue>()),
                PlayerCreate(self, new Vector3(1f, 0f, 1f), "A\"lice", 118001),
                PlayerCreate(other, new Vector3(4f, 0f, 4f)),
            },
            Array.Empty<FieldChange>(),
            Array.Empty<DestroyRecord>(),
            Array.Empty<ClientRpcRecord>()));
        client.Tick();

        using JsonDocument document = JsonDocument.Parse(SpectatorDump.DumpPositions(client.World));
        var rows = new Dictionary<string, JsonElement>();
        foreach (JsonElement row in document.RootElement.EnumerateArray())
        {
            rows[row.GetProperty("id").GetString()!] = row;
        }
        Assert.Equal("A\"lice", rows[self.ToHex()].GetProperty("name").GetString());
        Assert.Equal(118001U, rows[self.ToHex()].GetProperty("characterId").GetUInt32());
        Assert.Equal("rabbit", rows[self.ToHex()].GetProperty("characterName").GetString());
        Assert.Equal(JsonValueKind.Null, rows[other.ToHex()].GetProperty("name").ValueKind);
        Assert.Equal(JsonValueKind.Null, rows[other.ToHex()].GetProperty("characterId").ValueKind);
        Assert.False(rows[self.ToHex()].TryGetProperty("hue", out _));
        using JsonDocument dimensions = JsonDocument.Parse(SpectatorDump.MapDimensions(client.World));
        Assert.Equal(19, dimensions.RootElement.GetProperty("width").GetInt32());
        Assert.Equal(19, dimensions.RootElement.GetProperty("depth").GetInt32());
    }

    private static CreateRecord PlayerCreate(NetEntityId id, Vector3 local, string? name = null, uint? characterId = null)
    {
        string value = string.Format(
            CultureInfo.InvariantCulture,
            "{0},{1},{2}",
            local.X,
            local.Y,
            local.Z);
        var fields = new List<FieldValue> { new(nameof(LogicTransform), "localPosition", value) };
        if (name is not null)
        {
            fields.Add(new FieldValue(
                nameof(IdentityComponent),
                "name",
                name));
        }
        if (characterId.HasValue)
        {
            fields.Add(new FieldValue(
                nameof(BomberSkillState),
                "characterId",
                characterId.Value));
        }

        return new CreateRecord("player", id, fields.ToArray());
    }
}

