using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
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

    internal sealed record Section(VoxelSectionKey Key, ulong Revision, VoxelSectionEncoding Encoding,
        byte[] Payload, string Sha256);

    internal static readonly IReadOnlyDictionary<string, uint> Blocks = new Dictionary<string, uint>(StringComparer.Ordinal)
    {
        ["air"] = 0,
        ["floor"] = 1022u << 8,
        ["iron"] = 1023u << 8,
        ["hardPillar"] = 1024u << 8,
        ["softBrick"] = 1025u << 8,
        ["water"] = 1027u << 8,
    };

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
                row.SampledControls.Length == 0 || row.SampledControls.Select((step, index) => step.StepIndex == index).Any(ok => !ok))
                throw new InvalidDataException("Movement fixture map or sampled steps are incomplete: " + row.Id);
            if (row.Map.Ground.Any(name => !Blocks.ContainsKey(name)) ||
                row.Map.Obstacle.Any(name => !Blocks.ContainsKey(name)))
                throw new InvalidDataException("Movement fixture uses an unknown block: " + row.Id);
        }
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
