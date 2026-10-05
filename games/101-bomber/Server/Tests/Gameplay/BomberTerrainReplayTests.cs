using System;
using System.Linq;
using System.Security.Cryptography;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberTerrainReplayTests
{
    [Fact]
    public void FixedSeedOrdinaryTicksCaptureEveryCutAcrossFrame65536()
    {
        static string[] Replay(int replay)
        {
            using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, initialTicks: 65530);
            Assert.Equal(65533UL, scene.World.Tick);
            scene.Bomb(true);
            var hashes = new string[4];
            for (int i = 0; i < hashes.Length; i++)
            {
                scene.Manager.Tick();
                byte[] ecs = scene.Manager.CaptureSnapshot(), native = scene.Native.Capture();
                string path = Environment.GetEnvironmentVariable("BOMBER_TERRAIN_REPLAY_DIR") ??
                    System.IO.Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, ".artifacts", "terrain", "replay-cuts");
                System.IO.Directory.CreateDirectory(path);
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(path, $"{replay}-{i}.ecs"), ecs);
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(path, $"{replay}-{i}.native"), native);
                hashes[i] = "ECS:" + Convert.ToHexString(SHA256.HashData(ecs)) + ";Native:" + Convert.ToHexString(SHA256.HashData(native));
                if (scene.World.Tick == 65535)
                {
                    Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
                    Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
                }
                if (scene.World.Tick == 65536)
                {
                    Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
                    Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
                }
            }
            return hashes;
        }
        // Required combined gate: node Tools/verify-terrain-replay.mjs --test-dll <this assembly> --output <new directory>.
        // Native incarnation generation deliberately increases between worlds in one process.
        string[] hashes = Replay(1);
        string output = Environment.GetEnvironmentVariable("BOMBER_TERRAIN_REPLAY_DIR") ??
            System.IO.Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, ".artifacts", "terrain", "replay-cuts");
        System.IO.File.WriteAllLines(System.IO.Path.Combine(output, "hashes.txt"), hashes);
    }
}
