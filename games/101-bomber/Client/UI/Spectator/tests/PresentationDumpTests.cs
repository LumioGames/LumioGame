using System.Text.Json;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Hosting;
using Lumio.Engine.SDK;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class PresentationDumpTests
{
    [Theory]
    [InlineData(2, 3, 0u)]
    [InlineData(17, 18, 113007u)]
    public void ChestDisplayUsesTheCommittedVoxelBindingWithoutInventingATransform(int x, int z, uint resourceTier)
    {
        using var owner = new BrowserSessionOwner();
        using var client = owner.CreateClientWorld();
        var chest = new NetEntityId(7, 9);
        client.Enqueue(new WelcomeMessage(7, new NetEntityId(7, 2), 1));
        client.Enqueue(new WorldChangeMessage(1, 0, new[] {
            new CreateRecord("world", new NetEntityId(7, 1), Array.Empty<FieldValue>()),
            new CreateRecord(client.World.Registry.WireName(typeof(BomberChestEntity)), chest, new[] {
                new FieldValue(nameof(BomberChestState), "requiredHits", 3),
                new FieldValue(nameof(BomberChestState), "remainingHits", 2),
                new FieldValue(nameof(BomberChestState), "resourceTier", resourceTier),
            }),
        }, Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>()));
        client.Tick();
        Assert.DoesNotContain(client.World.Each<LogicTransform>(), value => value.Entity == chest);
        using (var unavailable = JsonDocument.Parse(PresentationDump.Dump(client.World, "1")))
            Assert.Empty(unavailable.RootElement.GetProperty("chests").EnumerateArray());
        uint block = BomberConfigBinding.For(client.World).Tables.Blocks.Rows.Single(row => row.Name == "chest").BlockType;
        VoxelGameplayBinding.Resolve(client)!.SetBindingPolicy(new[] {
            new VoxelBindingPolicyEntry(block, client.World.Registry.WireName(typeof(BomberChestEntity))) });
        int cell = 256 + (z & 15) * 16 + (x & 15);
        using var bytes = new MemoryStream();
        using (var writer = new BinaryWriter(bytes, System.Text.Encoding.UTF8, true))
        {
            writer.Write((ushort)2); writer.Write(0u); writer.Write(block << 8);
            for (int i = 0; i < 4096; i++) writer.Write((byte)(i == cell ? 1 : 0));
            writer.Write((ushort)0xffff); writer.Write((ushort)1); writer.Write((ushort)cell);
            byte[] id = System.Text.Encoding.UTF8.GetBytes(chest.ToHex());
            writer.Write((ushort)id.Length); writer.Write(id);
        }
        byte[] payload = bytes.ToArray();
        var voxel = NativeWorldVoxelResources.Require(client).Voxel;
        voxel.RequestSection(new(x >> 4, 0, z >> 4));
        voxel.DeliverSection(new(x >> 4, 0, z >> 4), 1, VoxelSectionEncoding.Palette, payload,
            System.Security.Cryptography.SHA256.HashData(payload), null);
        using var json = JsonDocument.Parse(PresentationDump.Dump(client.World, "1"));
        var projected = Assert.Single(json.RootElement.GetProperty("chests").EnumerateArray());
        Assert.Equal(chest.ToHex(), projected.GetProperty("id").GetString());
        Assert.Equal(x + 0.5, projected.GetProperty("x").GetDouble());
        Assert.Equal(z + 0.5, projected.GetProperty("z").GetDouble());
        Assert.Equal(3, projected.GetProperty("requiredHits").GetInt32());
        Assert.Equal(2, projected.GetProperty("remainingHits").GetInt32());
        Assert.Equal(resourceTier, projected.GetProperty("resourceTier").GetUInt32());
        Assert.Contains(json.RootElement.GetProperty("config").GetProperty("resourceTiers").EnumerateArray(),
            row => row.GetProperty("name").GetString() == "Gold" && row.GetProperty("id").GetUInt32() == 113007u);
        Assert.Empty(json.RootElement.GetProperty("unpositionedChests").EnumerateArray());
        Assert.DoesNotContain(client.World.Each<LogicTransform>(), value => value.Entity == chest);
        voxel.ReleaseSection(new(x >> 4, 0, z >> 4));
        using var released = JsonDocument.Parse(PresentationDump.Dump(client.World, "1"));
        Assert.Empty(released.RootElement.GetProperty("chests").EnumerateArray());
    }
    [Fact]
    public void PreAdmissionSelectionUsesTheSameFiveCharacterConfigAsTheReplica()
    {
        using var before = JsonDocument.Parse(PresentationDump.SelectionConfig());
        Assert.Equal(5, before.RootElement.GetProperty("characters").GetArrayLength());
        using var owner = new BrowserSessionOwner();
        owner.Authorize();
        using var after = JsonDocument.Parse(PresentationDump.Dump(owner.Host.World, "0"));
        Assert.Equal(before.RootElement.GetRawText(), after.RootElement.GetProperty("config").GetRawText());
        Assert.Empty(after.RootElement.GetProperty("players").EnumerateArray());
    }

    [Fact]
    public void MissingWorldDoesNotInventPlayersOrConfig()
    {
        using var json = JsonDocument.Parse(PresentationDump.Dump(null, "0"));
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("match").ValueKind);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("config").ValueKind);
        Assert.Empty(json.RootElement.GetProperty("players").EnumerateArray());
    }

    [Fact]
    public void DisplayUsesConfiguredValuesAndKeepsFullIdsAndTicks()
    {
        const ulong instance = 0xfffffffffffffff0UL;
        var self = new NetEntityId(instance, 2);
        using var owner = new BrowserSessionOwner();
        using var client = owner.CreateClientWorld();
        client.Enqueue(new WelcomeMessage(instance, self, 1));
        client.Enqueue(new WorldChangeMessage(1, 0, new[] {
            new CreateRecord("world", new NetEntityId(instance, 1), new[] {
                new FieldValue(nameof(BomberMatchState), "matchId", 0xffffffffffffffe0UL),
                new FieldValue(nameof(BomberMatchState), "phase", 2),
            }),
            new CreateRecord("player", self, new[] {
                new FieldValue(nameof(LogicTransform), "localPosition", "1,1,2"),
                new FieldValue(nameof(BomberSkillState), "characterId", 118003U),
                new FieldValue(nameof(BomberSkillState), "cooldownUntilTick", 77UL),
                new FieldValue(nameof(BomberPlayerState), "hatCount", 6),
                new FieldValue(nameof(BomberPlayerState), "maximumHealth", 12),
                new FieldValue(nameof(BomberPlayerState), "goldenHeartCount", 2),
            }),
        }, Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>()));
        client.Tick();
        string text = PresentationDump.Dump(client.World, "18446744073709551600");
        using var json = JsonDocument.Parse(text);
        var root = json.RootElement;
        Assert.Equal("18446744073709551600", root.GetProperty("tick").GetString());
        Assert.Equal("18446744073709551584", root.GetProperty("match").GetProperty("matchId").GetString());
        Assert.Equal(self.ToHex(), root.GetProperty("selfId").GetString());
        var player = Assert.Single(root.GetProperty("players").EnumerateArray());
        Assert.Equal(6, player.GetProperty("hatCount").GetInt32());
        Assert.Equal(12, player.GetProperty("maximumHealth").GetInt32());
        Assert.Equal(2, player.GetProperty("goldenHeartCount").GetInt32());
        Assert.Equal(118003U, player.GetProperty("skills").GetProperty("characterId").GetUInt32());
        using var inputState = JsonDocument.Parse(SpectatorDump.DumpPlayerState(client.World, "active", true, "1", "0"));
        Assert.Equal("cat", inputState.RootElement.GetProperty("characterName").GetString());
        Assert.Equal("77", player.GetProperty("skills").GetProperty("cooldownUntilTick").GetString());
        Assert.False(player.GetProperty("skills").TryGetProperty("regenNextTick", out _));
        Assert.Equal(19, root.GetProperty("config").GetProperty("mapSize").GetInt32());
        Assert.Equal(20, root.GetProperty("config").GetProperty("tickRateHz").GetInt32());
        var kinds = root.GetProperty("config").GetProperty("bombKinds").EnumerateArray().ToArray();
        foreach (var name in new[] { "Fire", "Remote", "Split" })
            Assert.False(Assert.Single(kinds, kind => kind.GetProperty("name").GetString() == name)
                .GetProperty("enabled").GetBoolean());
        string? output = Environment.GetEnvironmentVariable("LUMIO_PRESENTATION_FIXTURE");
        if (!string.IsNullOrEmpty(output)) File.WriteAllText(output, text);
    }
}
