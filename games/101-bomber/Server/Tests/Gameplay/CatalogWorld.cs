using System;
using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Engine.SDK;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

/// <summary>
/// The wall scene the native-backed cases run on (SMP08 cold restore here; the host admit/spawn
/// voxel case through <c>Tools/prepare-server-host-inputs.mjs</c>), authored by this game from its
/// own inputs against the Engine/ release native (R-00785, ADR-117 决策 1–2: the game builds its own
/// fixture from the SDK's public surface, never from an engine test fixture).
/// </summary>
/// <remarks>
/// Recipe: this game's committed base map <c>Server/Assets/Maps/bomber.voxel</c> restored into an
/// Authority world under this game's <c>official-catalog.json</c>, then one public
/// <c>PrepareWriteV2</c> / <c>CommitV3</c> that places a <c>lumio.stone</c> block at
/// <see cref="Wall"/>, then <c>Capture</c>. <see cref="Open"/> stays air. Every call is the release
/// SDK's, on the release native, so the capture is same-source by construction; the evidence
/// records that native's identity for the host suite to compare.
/// </remarks>
internal static class CatalogWorld
{
    internal const string OutputVariable = "LUMIO_BOMBER_CATALOG_WORLD_OUTPUT";

    internal static readonly VoxelWorldCoordinate Wall = new(4, 4, 4);
    internal static readonly VoxelWorldCoordinate Open = new(8, 4, 4);

    /// <summary><c>lumio.stone</c> (block type 256) with state 0: BlockId = type &lt;&lt; 8.</summary>
    internal const uint WallBlockId = 256u << 8;

    // One Chunk column of the 32×32 base map holds 4 Sections at layer 0; room to spare.
    private const uint ResidentSectionBudget = 64;
    private const uint ReceiptRetentionEntries = 2;

    private static readonly JsonSerializerOptions Indented = new() { WriteIndented = true };

    internal sealed record Scene(byte[] Catalog, byte[] Capture, string BuildId, string AbiHash, string BinarySha256)
    {
        internal string CaptureSha256 => Convert.ToHexString(SHA256.HashData(Capture)).ToLowerInvariant();
    }

    internal static Scene Author()
    {
        string native = Lumio.Bomber.Tests.EngineRelease.Require(Lumio.Bomber.Tests.EngineRelease.NativeLibrary,
            "the wall scene is authored on the release native");
        string maps = Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Server", "Assets", "Maps");
        byte[] catalog = File.ReadAllBytes(Path.Combine(maps, "official-catalog.json"));
        byte[] baseMap = File.ReadAllBytes(Path.Combine(maps, "bomber.voxel"));

        using LumioEngineLease sdk = LumioEngineSdk.LoadNative(native);
        using NativeVoxelWorld world = sdk.CreateVoxelWorld("Authority", ResidentSectionBudget, ReceiptRetentionEntries, catalog);
        world.Restore(baseMap);
        VoxelBlockReadResult before = world.ReadCell(Wall);
        Assert.True(before.Presence is VoxelPresence.Ready or VoxelPresence.Unchanged,
            $"the base map must make the wall's Section ready; got {before.Presence}");
        Assert.Equal(0u, before.BlockId);
        Assert.Equal(0u, world.ReadCell(Open).BlockId);

        var section = new VoxelSectionKey(Wall.X >> 4, (byte)(Wall.Y >> 4), Wall.Z >> 4);
        ushort offset = (ushort)((Wall.X & 15) + ((Wall.Z & 15) << 4) + ((Wall.Y & 15) << 8));
        using (VoxelWriteToken token = world.PrepareWriteV2(1,
            new[] { new VoxelBlockWriteEntry(section, offset, WallBlockId, before.SectionRevision) },
            Array.Empty<VoxelBindingMutationEntry>()))
        {
            VoxelMutationOutputRequirements limits = world.GetOutputRequirements(token);
            VoxelMutationResult committed = world.CommitV3(token, new VoxelWriteReceipt[limits.SectionCapacity], new byte[limits.ReceiptByteCapacity]);
            Assert.Equal(0, committed.Status);
        }
        Assert.Equal(WallBlockId, world.ReadCell(Wall).BlockId);
        Assert.Equal(0u, world.ReadCell(Open).BlockId);
        return new Scene(catalog, world.Capture(), sdk.BuildId, sdk.AbiHash, sdk.BinarySha256);
    }

    /// <summary>The three files the host suite reads (<c>LUMIO_TEST_VOXEL_FIXTURE_DIR</c>).</summary>
    internal static void Write(Scene scene, string directory)
    {
        Directory.CreateDirectory(directory);
        File.WriteAllBytes(Path.Combine(directory, "catalog-world.json"), scene.Catalog);
        File.WriteAllBytes(Path.Combine(directory, "catalog-world.capture"), scene.Capture);
        File.WriteAllText(Path.Combine(directory, "catalog-world-evidence.json"), JsonSerializer.Serialize(new
        {
            scene.BuildId,
            scene.AbiHash,
            scene.BinarySha256,
            wall = new[] { Wall.X, Wall.Y, Wall.Z },
            open = new[] { Open.X, Open.Y, Open.Z },
            blockId = WallBlockId,
            captureSha256 = scene.CaptureSha256,
            preparation = "Bomber base map bomber.voxel restored under official-catalog.json on the Engine/ release native; "
                + "public PrepareWriteV2 -> GetOutputRequirements -> CommitV3 places lumio.stone at the wall cell; Capture.",
        }, Indented));
    }
}

public sealed class CatalogWorldTests
{
    /// <summary>
    /// Authors the wall scene on the release native and proves it restores into a fresh world with
    /// the wall and the open cell intact. With <c>LUMIO_BOMBER_CATALOG_WORLD_OUTPUT</c> set it also
    /// writes the three fixture files there (the host suite's input).
    /// </summary>
    [Fact]
    public void AuthorsTheWallSceneOnTheReleaseNative()
    {
        CatalogWorld.Scene scene = CatalogWorld.Author();
        (string _, string _, string binarySha256) = Lumio.Bomber.Tests.EngineRelease.NativeBuildInfo();
        Assert.Equal(binarySha256, scene.BinarySha256, ignoreCase: true);

        using LumioEngineLease sdk = LumioEngineSdk.LoadNative(Lumio.Bomber.Tests.EngineRelease.NativeLibrary);
        using NativeVoxelWorld restored = sdk.CreateVoxelWorld("Authority", 64, 2, scene.Catalog);
        restored.Restore(scene.Capture);
        Assert.Equal(CatalogWorld.WallBlockId, restored.ReadCell(CatalogWorld.Wall).BlockId);
        Assert.Equal(0u, restored.ReadCell(CatalogWorld.Open).BlockId);

        string? output = Environment.GetEnvironmentVariable(CatalogWorld.OutputVariable);
        if (!string.IsNullOrWhiteSpace(output)) CatalogWorld.Write(scene, output);
    }
}
