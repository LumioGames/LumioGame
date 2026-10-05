using System.Linq;
using System.Security.Cryptography;
using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberWorldDeterminismTests
{
    [Fact]
    public void RepeatedFoundationWorldsWithIdenticalAdmissionsHaveIdenticalSnapshots()
    {
        byte[][] first = CaptureSequence();
        byte[][] second = CaptureSequence();
        Assert.Equal(10, first.Length);
        Assert.Equal(first.Length, second.Length);
        for (int tick = 0; tick < first.Length; tick++)
        {
            Assert.NotEmpty(first[tick]);
            Assert.Equal(first[tick], second[tick]);
        }
        Assert.False(first[0].SequenceEqual(first[^1]));
    }

    private static byte[][] CaptureSequence()
    {
        using WorldManager manager = BomberTestWorld.Start();
        for (int player = 0; player < 8; player++)
            BomberTestWorld.QueuePlayer(manager.World, "replay-" + player);
        var hashes = new byte[10][];
        for (int tick = 0; tick < hashes.Length; tick++)
        {
            manager.Tick();
            Assert.Equal(8, manager.World.Each<BomberPlayerState>().Count());
            byte[] snapshot = manager.CaptureSnapshot();
            Assert.NotEmpty(snapshot);
            hashes[tick] = SHA256.HashData(snapshot);
        }
        return hashes;
    }
}
