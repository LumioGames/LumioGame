using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// Capture the actual unchanged cap5 World before any declaration expansion.
// It saves an immutable, actual whole-World image; no payload is patched.
[Collection("BomberWorld")]
public sealed class BomberContactOldWorldSnapshotTests
{
    [Fact]
    public void CurrentFiveContactWorldCapturesAndReadsItsActualCanonicalOriginal()
    {
        if (BomberFrozenV14Qualification.RunForDifferentReader(nameof(BomberContactOldWorldSnapshotTests),
            nameof(CurrentFiveContactWorldCapturesAndReadsItsActualCanonicalOriginal))) return;

        using var authoring = new BomberObjectBudgetTests.AuthoredFixture(
            ("regeneration", "default", "max_mirror_orbits", "0"),
            ("game", "default", "central_supply_enabled", "false"));
        string export = authoring.Compile();
        using WorldManager manager = BomberTestWorld.Start(configDirectory: export);
        EntityOrder order = manager.World.Commands.Create<BomberBombEntity>();
        EntityOrder[] chests = Enumerable.Range(0, 5).Select(_ => manager.World.Commands.Create<BomberChestEntity>()).ToArray();
        manager.Tick();
        var bomb = manager.World.Get<BomberBombState>(order.AssignedId);
        Assert.Equal(5, bomb.ContactedChests.MaxCapacity);
        foreach (EntityOrder chest in chests)
        {
            manager.World.Get<BomberChestState>(chest.AssignedId).InitializeHitBudget();
            Assert.Equal(BomberStorageAdmission.Added, bomb.TryObserveChest(chest.AssignedId));
        }
        byte[] original = manager.CaptureSnapshot();
        string artifact = ContactSnapshotEvidence.Save("old-world-cap5", original, export, new { Bomb = order.AssignedId.ToHex(), Capacity = bomb.ContactedChests.MaxCapacity, Count = bomb.ContactedChests.Count });
        Console.WriteLine("OLD_CAP5_WORLD_ARTIFACT=" + artifact);
        var observed = Assert.Single(ContactSnapshotEvidence.ReadFields(original));
        Assert.Equal((5, 5), (observed.Capacity, observed.Count));
        using WorldManager restored = BomberTestWorld.Restore(original, GeneratedRegistry.Instance, BomberConfigBinding.Load(export));
        Assert.Equal(original, restored.CaptureSnapshot());
    }
}

internal static class ContactSnapshotEvidence
{
    private static readonly JsonSerializerOptions EvidenceOptions = new() { WriteIndented = true };
    internal sealed record Field(int Capacity, int Count, int BlobBytes);
    internal static List<Field> ReadFields(byte[] original)
    {
        ReadOnlySpan<byte> key = Encoding.UTF8.GetBytes("BomberBombState.contactedChests");
        var rows = new List<Field>();
        int cursor = 4;
        while (cursor < original.Length)
        {
            int found = original.AsSpan(cursor).IndexOf(key);
            if (found < 0) break;
            int start = cursor + found;
            cursor = start + key.Length;
            if (start < 4 || cursor + 5 > original.Length ||
                BinaryPrimitives.ReadInt32LittleEndian(original.AsSpan(start - 4)) != key.Length || original[cursor] != 4) continue;
            int offset = cursor + 1;
            int length = BinaryPrimitives.ReadInt32LittleEndian(original.AsSpan(offset));
            Assert.InRange(length, 0, original.Length - offset - 4);
            using JsonDocument payload = JsonDocument.Parse(original.AsMemory(offset + 4, length));
            Assert.Equal("SyncList", payload.RootElement.GetProperty("containerType").GetString());
            rows.Add(new(payload.RootElement.GetProperty("maxCapacity").GetInt32(),
                payload.RootElement.GetProperty("fullEntries").GetArrayLength(), checked(length + 4)));
            cursor = checked(offset + 4 + length);
        }
        return rows;
    }

    internal static string Save(string label, byte[] original, string export, object detail)
    {
        string root = Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, ".artifacts", "resource-contact-world", label + "-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        File.WriteAllBytes(Path.Combine(root, "original.lwm"), original);
        string savedExport = Path.Combine(root, "config");
        Directory.CreateDirectory(savedExport);
        var exportFiles = Directory.GetFiles(export, "*", SearchOption.AllDirectories)
            .OrderBy(path => Path.GetRelativePath(export, path), StringComparer.Ordinal)
            .Select(path =>
            {
                string relative = Path.GetRelativePath(export, path);
                string copy = Path.Combine(savedExport, relative);
                Directory.CreateDirectory(Path.GetDirectoryName(copy)!);
                File.Copy(path, copy);
                byte[] source = File.ReadAllBytes(path);
                Assert.Equal(source, File.ReadAllBytes(copy));
                return new { Path = relative.Replace(Path.DirectorySeparatorChar, '/'), Sha256 = Convert.ToHexString(SHA256.HashData(source)).ToLowerInvariant() };
            }).ToArray();
        Assert.NotEmpty(exportFiles);
        File.WriteAllText(Path.Combine(root, "actual.json"), JsonSerializer.Serialize(new
        {
            Kind = "actual official WorldManager CaptureSnapshot; never patched",
            Export = savedExport, SourceExport = export, ExportFiles = exportFiles, Bytes = original.Length,
            Sha256 = Convert.ToHexString(SHA256.HashData(original)).ToLowerInvariant(),
            GameSha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(typeof(BomberBombState).Assembly.Location))).ToLowerInvariant(),
            RuntimeSha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(typeof(World).Assembly.Location))).ToLowerInvariant(),
            Limits = PersistenceLimits.Default, Detail = detail,
        }, EvidenceOptions));
        return root;
    }
}
