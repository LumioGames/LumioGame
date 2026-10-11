using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Engine.SDK;

namespace Lumio.Bomber.Tests;

/// <summary>Immutable sampled controls and initial Native voxel state for the two test assemblies.</summary>
internal static class MovementNativeParityFixture
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    internal sealed class Document
    {
        public int FormatVersion { get; set; }
        public Requirements ConfigRequirements { get; set; } = null!;
        public Case[] Cases { get; set; } = [];
        public PolicyVariant[] PolicyVariants { get; set; } = [];
    }

    internal sealed class Requirements
    {
        public int TickRateHz { get; set; }
        public int Tier0SpeedMilliPerSecond { get; set; }
        public int WaterSpeedPermille { get; set; }
        public double FormalToleranceMetres { get; set; }
        public double EqualPolicyPrototypeToleranceMetres { get; set; }
    }

    internal sealed class Case
    {
        public string Id { get; set; } = "";
        public int[] Start { get; set; } = [];
        public int[] Goal { get; set; } = [];
        public Map Map { get; set; } = null!;
        public Sample[] SampledControls { get; set; } = [];
        public int[][] PrototypePositionsMilli { get; set; } = [];
    }

    internal sealed class Map
    {
        public int Size { get; set; }
        public string[] Ground { get; set; } = [];
        public string[] Obstacle { get; set; } = [];
    }

    internal sealed class Sample
    {
        public int StepIndex { get; set; }
        public ulong SourceTickBefore { get; set; }
        public ulong SourceTickAfter { get; set; }
        public string[] EventIds { get; set; } = [];
        public Move Move { get; set; } = null!;
        public string[] Actions { get; set; } = [];
    }

    internal sealed class Move
    {
        public string Kind { get; set; } = "";
        public string Primary { get; set; } = "";
        public string Secondary { get; set; } = "";
        public bool TurnPressed { get; set; }
    }

    internal sealed class PolicyVariant
    {
        public string Id { get; set; } = "";
        public string SourceCaseId { get; set; } = "";
        public int[] Start { get; set; } = [];
        public Map Map { get; set; } = null!;
        public Sample[] SampledControls { get; set; } = [];
        public PrototypeBomb? Bomb { get; set; }
        public int[][] PrototypePositionsMilli { get; set; } = [];
    }

    internal sealed class PrototypeBomb
    {
        public int[] Cell { get; set; } = [];
        public int Power { get; set; }
        public int FuseIn { get; set; }
    }

    internal sealed record Section(VoxelSectionKey Key, ulong Revision, VoxelSectionEncoding Encoding,
        byte[] Payload, string Sha256);

    private static readonly byte[] CatalogBytes = File.ReadAllBytes(Path.Combine(
        FindGameRoot(), "Server", "Assets", "Maps", "official-catalog.json"));
    internal static readonly string CatalogSha256 = Convert.ToHexStringLower(SHA256.HashData(CatalogBytes));
    private static readonly IReadOnlyDictionary<string, (string Name, uint Type, string Material, string Behavior)> ExpectedCatalog =
        new Dictionary<string, (string, uint, string, string)>(StringComparer.Ordinal)
    {
        ["floor"] = ("lumio.bomber.floor", 1022, "Solid", "FullCube"),
        ["iron"] = ("lumio.bomber.iron", 1023, "Solid", "FullCube"),
        ["hardPillar"] = ("lumio.bomber.hard_pillar", 1024, "Solid", "FullCube"),
        ["softBrick"] = ("lumio.bomber.soft_brick", 1025, "Solid", "FullCube"),
        ["water"] = ("lumio.bomber.water", 1027, "Liquid", "Liquid"),
    };
    internal static readonly IReadOnlyDictionary<string, uint> Blocks = ResolveCatalog(CatalogBytes);

    internal static void AssertCatalogBytes(byte[] loaded)
    {
        if (!loaded.AsSpan().SequenceEqual(CatalogBytes))
            throw new InvalidDataException("Loaded Native catalog bytes differ from resolved fixture catalog: " +
                Convert.ToHexStringLower(SHA256.HashData(loaded)) + " != " + CatalogSha256);
    }

    internal static void AssertConfigBlocks(IBomberConfig config)
    {
        foreach (string alias in Blocks.Keys)
        {
            var rows = config.Tables.Blocks.Rows.Where(row => row.Name == alias).ToArray();
            if (rows.Length != 1 || !rows[0].Enabled ||
                rows[0].BlockType != (Blocks[alias] >> 8) ||
                rows[0].Walkable != (alias is "air" or "floor" or "water"))
                throw new InvalidDataException("Generated Reader block mapping changed: " + alias);
        }
    }

    private static Dictionary<string, uint> ResolveCatalog(byte[] bytes)
    {
        using JsonDocument document = JsonDocument.Parse(bytes);
        JsonElement root = document.RootElement;
        var rows = root.GetProperty("rows").EnumerateArray().ToArray();
        var retired = root.GetProperty("retiredNames").EnumerateArray()
            .Select(value => value.GetString()).ToHashSet(StringComparer.Ordinal);
        var result = new Dictionary<string, uint>(StringComparer.Ordinal) { ["air"] = 0 };
        foreach (var (alias, expected) in ExpectedCatalog)
        {
            if (retired.Contains(expected.Name))
                throw new InvalidDataException("Movement catalog name retired: " + expected.Name);
            JsonElement[] matches = rows.Where(row => row.GetProperty("name").GetString() == expected.Name).ToArray();
            if (matches.Length != 1)
                throw new InvalidDataException("Movement catalog name is absent or duplicated: " + expected.Name);
            JsonElement row = matches[0];
            uint type = row.GetProperty("blockType").GetUInt32();
            string material = row.GetProperty("materialClass").GetString()!;
            string behavior = row.GetProperty("behaviorTemplate").GetString()!;
            if (type != expected.Type || material != expected.Material || behavior != expected.Behavior ||
                rows.Count(other => other.GetProperty("blockType").GetUInt32() == type) != 1)
                throw new InvalidDataException("Movement catalog mapping changed: " + alias);
            result.Add(alias, checked(type << 8));
        }
        return result;
    }

    internal static Document Load()
    {
        string root = FindGameRoot();
        string path = Path.Combine(root, "Tools", "Fixtures", "movement-f1-inputs.json");
        var result = JsonSerializer.Deserialize<Document>(File.ReadAllBytes(path), JsonOptions)
            ?? throw new InvalidDataException("Movement fixture is empty.");
        if (result.FormatVersion != 1 || result.ConfigRequirements.TickRateHz != 20 ||
            result.ConfigRequirements.Tier0SpeedMilliPerSecond != 3500 ||
            result.ConfigRequirements.FormalToleranceMetres != 0.00001 ||
            result.ConfigRequirements.EqualPolicyPrototypeToleranceMetres != 0.001 ||
            result.Cases.Length != 10 || result.Cases.Select(row => row.Id).Distinct().Count() != 10)
            throw new InvalidDataException("Movement fixture identity or dimensional contract differs.");
        foreach (Case row in result.Cases)
        {
            if (row.Map.Size != 19 || row.Map.Ground.Length != 361 || row.Map.Obstacle.Length != 361 ||
                row.SampledControls.Length == 0 || row.SampledControls.Select((step, index) => step.StepIndex == index).Any(ok => !ok) ||
                row.PrototypePositionsMilli.Length != row.SampledControls.Length ||
                row.PrototypePositionsMilli.Any(pose => pose.Length != 2))
                throw new InvalidDataException("Movement fixture map or sampled steps are incomplete: " + row.Id);
            if (row.Map.Ground.Any(name => !Blocks.ContainsKey(name)) ||
                row.Map.Obstacle.Any(name => !Blocks.ContainsKey(name)))
                throw new InvalidDataException("Movement fixture uses an unknown block: " + row.Id);
        }
        if (result.PolicyVariants.Length != 6 ||
            result.PolicyVariants.Select(row => row.Id).Distinct().Count() != 6)
            throw new InvalidDataException("Movement policy variants are incomplete.");
        foreach (PolicyVariant row in result.PolicyVariants)
            if (row.Start.Length != 2 || row.Map.Size != 19 || row.Map.Ground.Length != 361 ||
                row.Map.Obstacle.Length != 361 || row.SampledControls.Length == 0 ||
                row.PrototypePositionsMilli.Length != row.SampledControls.Length ||
                row.PrototypePositionsMilli.Any(pose => pose.Length != 2))
                throw new InvalidDataException("Movement policy variant lacks captured facts: " + row.Id);
        return result;
    }

    internal static string FindGameRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Gameplay", "Lumio.Bomber.Gameplay.csproj")))
                return directory.FullName;
        throw new DirectoryNotFoundException("101 Bomber game root unavailable for movement fixture.");
    }

    /// <summary>Authors only initial terrain in the selected Native world, then checks every cell.</summary>
    internal static Section[] AuthorAndReadback(NativeVoxelWorld native, Map map)
    {
        var result = new List<Section>();
        for (int sectionZ = 0; sectionZ < 2; sectionZ++)
        for (int sectionX = 0; sectionX < 2; sectionX++)
        {
            var key = new VoxelSectionKey(sectionX, 0, sectionZ);
            var cells = new uint[4096];
            for (int offset = 0; offset < cells.Length; offset++)
            {
                int y = offset >> 8;
                int x = sectionX * 16 + (offset & 15);
                int z = sectionZ * 16 + ((offset >> 4) & 15);
                cells[offset] = x < map.Size && z < map.Size && y < 2
                    ? Blocks[(y == 0 ? map.Ground : map.Obstacle)[z * map.Size + x]] : 0;
            }
            uint[] palette = cells.Distinct().ToArray();
            using var stream = new MemoryStream();
            using (var writer = new BinaryWriter(stream, Encoding.UTF8, true))
            {
                writer.Write(checked((ushort)palette.Length));
                foreach (uint block in palette) writer.Write(block);
                foreach (uint block in cells)
                    writer.Write(checked((byte)Array.IndexOf(palette, block)));
            }
            byte[] authored = stream.ToArray();
            native.RequestSection(key);
            native.DeliverSection(key, 1, VoxelSectionEncoding.Palette, authored, SHA256.HashData(authored), null);
            using var export = native.OpenSectionExport(new(1, 1024 * 1024, 1024 * 1024));
            using var snapshot = export.Acquire(key, 1);
            if (export.Read(snapshot, null, Span<byte>.Empty, out var size) != 5)
                throw new InvalidDataException("Native section sizing did not report buffer requirement.");
            byte[] payload = new byte[size.RequiredBytes];
            if (export.Read(snapshot, null, payload, out var record) != 0)
                throw new InvalidDataException("Native section export failed.");
            result.Add(new Section(key, record.SectionRevision, record.Encoding, payload,
                Convert.ToHexStringLower(SHA256.HashData(payload))));
        }
        AssertReadback(native, map);
        return result.ToArray();
    }

    internal static void AssertReadback(NativeVoxelWorld native, Map map)
    {
        for (int z = 0; z < map.Size; z++)
        for (int x = 0; x < map.Size; x++)
        for (int y = 0; y < 2; y++)
        {
            uint expected = Blocks[(y == 0 ? map.Ground : map.Obstacle)[z * map.Size + x]];
            uint actual = native.ReadCell(new VoxelWorldCoordinate(x, checked((byte)y), z)).BlockId;
            if (actual != expected)
                throw new InvalidDataException($"Native readback mismatch at ({x},{y},{z}): {actual} != {expected}.");
        }
    }
}
