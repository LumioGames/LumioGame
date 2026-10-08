using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Lumio.Client.Gameplay.ECS;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Client.Spectator.Tests;

/// <summary>Game composition of the official authority group gate and same Native voxel world.</summary>
public sealed class SpectatorSectionQueueTests
{
    private static byte[] Section(ulong tick = 1, ulong revision = 1) => Encoding.UTF8.GetBytes(
        "{\"messageType\":\"SectionFrame\",\"tick\":" + tick + ",\"sectionKey\":\"s:0:0:0\",\"sectionRevision\":" + revision + ","
        + "\"encoding\":\"Uniform\",\"payloadLength\":4,\"payload\":\"00000000\","
        + "\"payloadSha256\":\"df3f619804a92fdb4057192dc43dd748ea778adc52bc498ce80524c014b81119\","
        + "\"observerPresence\":\"absent\",\"deliveryReason\":\"first\"}");

    [Fact]
    public void SectionWaitsForItsManifestThenCommitsToTheSameWorldAtFullWidthRevision()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        const ulong revision = ulong.MaxValue - 2;
        owner.Send(Section(revision: revision));
        owner.PumpUntil(() => owner.Voxel is { } voxel && voxel.ReadCell(new(0, 0, 0)).Presence == VoxelPresence.Pending);
        Assert.Equal("synchronizing", owner.Host.ConnectionState); Assert.False(owner.Host.InputEnabled);
        Assert.False(owner.Voxel!.ReadCell(new(0, 0, 0)).HasBlockId);
        var change = JsonNode.Parse(WireCodec.EncodePack(SpectatorReplicaHostTests.InitialChange(BrowserSessionOwner.Self), WireProfile.SuccessorBindingV1))!;
        change["sectionGroup"] = new JsonObject {
            ["sent"] = new JsonArray(new JsonObject { ["sectionKey"] = "s:0:0:0", ["sectionRevision"] = revision }),
            ["deferred"] = new JsonArray(),
        };
        owner.Send(Encoding.UTF8.GetBytes(change.ToJsonString()));
        owner.PumpUntil(() => owner.Host.InputEnabled || owner.Host.ConnectionState == "faulted");
        Assert.True(owner.Host.InputEnabled, string.Join(" | ", owner.Logs));
        var read = owner.Voxel.ReadCell(new(0, 0, 0));
        Assert.Equal(VoxelPresence.Ready, read.Presence); Assert.True(read.HasBlockId);
        Assert.Equal(0U, read.BlockId); Assert.Equal(revision, read.SectionRevision);
    }

    [Fact]
    public void UnclosedAuthorityGroupsFailAtTheEngineBound()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        for (ulong tick = 1; tick <= ReplicaAuthorityGroupLedger.MaxOpenGroups; tick++)
        { owner.Send(OpenGroup(tick)); owner.Pump(2); }
        Assert.Equal("synchronizing", owner.Host.ConnectionState);
        owner.Send(OpenGroup(ReplicaAuthorityGroupLedger.MaxOpenGroups + 1UL));
        SpectatorReplicaHostTests.Fault(owner);
    }

    [Fact]
    public void DisposeReleasesPendingSectionsWithTheEndingWorld()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize(); owner.Send(Section());
        owner.PumpUntil(() => owner.Voxel is { } pending && pending.ReadCell(new(0, 0, 0)).Presence == VoxelPresence.Pending);
        var voxel = owner.Voxel!;
        owner.Host.Dispose(); owner.PumpUntil(() => owner.Host.Closed);
        Assert.Null(owner.Host.World);
        Assert.Throws<ObjectDisposedException>(() => voxel.ReadCell(new(0, 0, 0)));
    }

    [Fact]
    public void DumpPositionsNamesEachEntityByItsDeclaredWireType()
    {
        using var owner = new BrowserSessionOwner(); owner.Authorize();
        owner.Apply(SpectatorReplicaHostTests.InitialChange(BrowserSessionOwner.Self));
        using var document = JsonDocument.Parse(SpectatorDump.DumpPositions(owner.Host.World!));
        var row = Assert.Single(document.RootElement.EnumerateArray());
        Assert.Equal(BrowserSessionOwner.Self.ToHex(), row.GetProperty("id").GetString());
        Assert.Equal("player", row.GetProperty("type").GetString());
    }

    private static byte[] OpenGroup(ulong tick)
    {
        var body = new WorldChangeMessage(tick, 0, Array.Empty<CreateRecord>(), Array.Empty<FieldChange>(), Array.Empty<DestroyRecord>(), Array.Empty<ClientRpcRecord>());
        var json = JsonNode.Parse(WireCodec.EncodePack(body, WireProfile.SuccessorBindingV1))!;
        json["sectionGroup"] = new JsonObject {
            ["sent"] = new JsonArray(new JsonObject { ["sectionKey"] = "s:0:0:0", ["sectionRevision"] = tick }),
            ["deferred"] = new JsonArray(),
        };
        return Encoding.UTF8.GetBytes(json.ToJsonString());
    }
}
