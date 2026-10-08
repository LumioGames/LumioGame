using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// A separately identified v14-compatible reader qualifies the immutable earlier
// v14 capture. It does not claim to be the Game binary that made that capture.
[Collection("BomberWorld")]
public sealed class BomberContactImmutableV14CompatibilityQualificationTests
{
    private const string OriginalWorld = "6a0e5a671cdb89a003c4567ccefa9534481c0fcd48e147b10c583d8aabd755a8";
    private const string OriginalMetadata = "d9512037e1f85c11775ced7271a31ceb970e6947bcf67b9789b00060d25fb573";
    private const string CaptureGame = "78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e";
    private const string ReaderGame = "61ffd66564c634a13b173a04af4eefcd212e1305da41d27d07675de1f13b5e55";
    private const string Runtime = "aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49";

    [Fact]
    public void IdentifiedV14ReaderRoundtripsTheUnmodifiedEarlierFiveContactWorld()
    {
        if (BomberFrozenV14Qualification.RunForDifferentReader(nameof(BomberContactImmutableV14CompatibilityQualificationTests),
            nameof(IdentifiedV14ReaderRoundtripsTheUnmodifiedEarlierFiveContactWorld))) return;

        string root = Environment.GetEnvironmentVariable("LUMIO_RESOURCE_CONTACT_OLD_WORLD")
            ?? Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, ".artifacts", "resource-contact-world",
                "old-world-cap5-0bb1c9bca38e454fb187e5874ec84c44");
        byte[] original = File.ReadAllBytes(Path.Combine(root, "original.lwm"));
        byte[] metadata = File.ReadAllBytes(Path.Combine(root, "actual.json"));
        Assert.Equal(OriginalMetadata, Hash(metadata));
        using JsonDocument proof = JsonDocument.Parse(metadata);
        Assert.Equal(21487, original.Length);
        Assert.Equal(OriginalWorld, Hash(original));
        Assert.Equal(OriginalWorld, proof.RootElement.GetProperty("Sha256").GetString());
        Assert.Equal(CaptureGame, proof.RootElement.GetProperty("GameSha256").GetString());
        Assert.Equal(Runtime, proof.RootElement.GetProperty("RuntimeSha256").GetString());
        Assert.Equal(ReaderGame, Hash(File.ReadAllBytes(typeof(BomberBombState).Assembly.Location)));
        Assert.Equal(Runtime, Hash(File.ReadAllBytes(typeof(World).Assembly.Location)));
        string export = Path.Combine(root, "config");
        JsonElement[] files = proof.RootElement.GetProperty("ExportFiles").EnumerateArray().ToArray();
        Assert.Equal(31, files.Length);
        string[] expectedPaths = files.Select(file => file.GetProperty("Path").GetString()!).ToArray();
        Assert.Equal(31, expectedPaths.Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(expectedPaths.OrderBy(path => path, StringComparer.Ordinal).ToArray(),
            Directory.GetFiles(export, "*", SearchOption.AllDirectories)
                .Select(path => Path.GetRelativePath(export, path).Replace(Path.DirectorySeparatorChar, '/'))
                .OrderBy(path => path, StringComparer.Ordinal).ToArray());
        foreach (JsonElement file in files)
            Assert.Equal(file.GetProperty("Sha256").GetString(),
                Hash(File.ReadAllBytes(Path.Combine(export, file.GetProperty("Path").GetString()!))));
        Assert.Equal(5, new BomberBombState().ContactedChests.MaxCapacity);
        var field = Assert.Single(ContactSnapshotEvidence.ReadFields(original));
        Assert.Equal((5, 5), (field.Capacity, field.Count));
        using WorldManager restored = BomberTestWorld.Restore(original, GeneratedRegistry.Instance,
            BomberConfigBinding.Load(export));
        Assert.Equal(original, restored.CaptureSnapshot());
        Assert.Equal(original, File.ReadAllBytes(Path.Combine(root, "original.lwm")));
        Assert.Equal(metadata, File.ReadAllBytes(Path.Combine(root, "actual.json")));
        foreach (JsonElement file in files)
            Assert.Equal(file.GetProperty("Sha256").GetString(),
                Hash(File.ReadAllBytes(Path.Combine(export, file.GetProperty("Path").GetString()!))));
    }

    private static string Hash(byte[] bytes) =>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
}
