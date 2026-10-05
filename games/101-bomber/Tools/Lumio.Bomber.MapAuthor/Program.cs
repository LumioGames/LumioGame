using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lumio.Engine.SDK;

namespace Lumio.Bomber.MapAuthor;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length < 2 || args[0] is not ("capture" or "verify" or "probe"))
                throw new ArgumentException("Usage: MapAuthor capture|verify|probe <game-root> [snapshot] [--profile name]");
            int profileIndex = Array.IndexOf(args, "--profile");
            if (profileIndex >= 0 && (profileIndex != args.Length - 2 || profileIndex < 2))
                throw new ArgumentException("--profile requires one authoring profile name at the end of the command.");
            string? profile = profileIndex < 0 ? null : args[profileIndex + 1];
            if (profileIndex < 0 && args.Length > 3 || profileIndex >= 0 && args.Length > 5)
                throw new ArgumentException("Unexpected MapAuthor arguments.");
            string root = Path.GetFullPath(args[1]);
            string maps = Path.Combine(root, "Server", "Assets", "Maps");
            string rid = RuntimeInformation.RuntimeIdentifier;
            string library = OperatingSystem.IsWindows() ? "lumio_engine_native.dll"
                : OperatingSystem.IsMacOS() ? "liblumio_engine_native.dylib" : "liblumio_engine_native.so";
            string native = Path.Combine(root, "Engine", "server", rid, "SDK", "Native", rid, library);
            using LumioEngineLease sdk = LumioEngineSdk.LoadNative(native);
            byte[] catalog = File.ReadAllBytes(Path.Combine(maps, "official-catalog.json"));
            using JsonDocument budget = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(maps, "bot-voxel-budget.json")));
            uint sections = budget.RootElement.GetProperty("residentSectionBudget").GetUInt32();
            uint receipts = budget.RootElement.GetProperty("receiptRetentionEntries").GetUInt32();
            string snapshotPath = (profileIndex < 0 ? args.Length > 2 : profileIndex > 2)
                ? Path.GetFullPath(args[2]) : Path.Combine(maps, profile is null ? "bomber.voxel" : profile + ".voxel");
            MapInputs input = MapInputs.Load(root, profile);
            if (args[0] == "capture")
            {
                ValidateCatalog(root, catalog, profile);
                byte[] first = Author(sdk, catalog, sections, receipts, input);
                File.WriteAllBytes(snapshotPath, first);
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    status = "PASS", snapshotSha256 = Convert.ToHexStringLower(SHA256.HashData(first)),
                    snapshotBytes = first.Length,
                    sdk.BuildId, sdk.AbiHash, sdk.BinarySha256,
                }));
                return 0;
            }
            using NativeVoxelWorld world = sdk.CreateVoxelWorld("Authority", sections, receipts, catalog);
            if (args[0] == "probe")
            {
                // Release voxel-world-v1 sectionPayload.encodings.Uniform: one uint32 BlockId.
                // Air is zero, independent of byte order. This initializes an empty section only;
                // no final map, palette, receipt or snapshot bytes are encoded by this tool.
                byte[] airRecord = new byte[sizeof(uint)];
                var loaded = world.LoadSectionFromRecord(new(0, 0, 0), VoxelSectionEncoding.Uniform,
                    1, airRecord, SHA256.HashData(airRecord));
                VoxelBlockReadResult cell = world.ReadCell(new(0, 0, 0));
                if (!cell.HasBlockId || cell.BlockId != 0 || cell.Presence != VoxelPresence.Ready)
                    throw new InvalidOperationException($"Empty section did not become Ready air: {cell}");
                Console.WriteLine(JsonSerializer.Serialize(new { status = "PASS", loaded, cell, sdk.BuildId, sdk.BinarySha256 }));
                return 0;
            }
            byte[] snapshot = File.ReadAllBytes(snapshotPath);
            world.Restore(snapshot);
            Verification verification = Verify(world, input);
            Console.WriteLine(JsonSerializer.Serialize(new
            {
                status = "PASS", snapshotSha256 = Convert.ToHexStringLower(SHA256.HashData(snapshot)),
                verification, sdk.BuildId, sdk.BinarySha256,
            }));
            return 0;
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            Console.Error.WriteLine($"{error.GetType().Name}: {error.Message}");
            return 1;
        }
    }

    private static byte[] Author(LumioEngineLease sdk, byte[] catalog, uint sectionBudget, uint receiptBudget, MapInputs input)
    {
        byte[] capture;
        Verification expected;
        using (NativeVoxelWorld world = sdk.CreateVoxelWorld("Authority", sectionBudget, receiptBudget, catalog))
        {
            int sectionsX = (input.Width + 15) / 16;
            int sectionsZ = (input.Depth + 15) / 16;
            if (sectionsX * sectionsZ > sectionBudget)
                throw new InvalidDataException("The declared residentSectionBudget cannot hold the complete map.");
            byte[] airRecord = new byte[sizeof(uint)];
            byte[] digest = SHA256.HashData(airRecord);
            var revisions = new Dictionary<VoxelSectionKey, ulong>();
            for (int z = 0; z < sectionsZ; z++)
            for (int x = 0; x < sectionsX; x++)
            {
                var key = new VoxelSectionKey(x, 0, z);
                var loaded = world.LoadSectionFromRecord(key, VoxelSectionEncoding.Uniform, 1, airRecord, digest);
                revisions.Add(key, loaded.SectionRevision);
            }
            var writes = new List<VoxelBlockWriteEntry>(input.Width * input.Depth * 2);
            for (byte y = input.GroundLayer; y <= input.ObstacleLayer; y++)
            for (int z = 0; z < input.Depth; z++)
            for (int x = 0; x < input.Width; x++)
            {
                var key = new VoxelSectionKey(x / 16, 0, z / 16);
                ushort offset = checked((ushort)(y * NativeVoxelWorld.CellOffsetYStride
                    + (z % 16) * NativeVoxelWorld.CellOffsetZStride + (x % 16) * NativeVoxelWorld.CellOffsetXStride));
                writes.Add(new(key, offset, input.ExpectedBlockId(x, y, z), revisions[key]));
            }
            using (VoxelWriteToken token = world.PrepareWriteV2(1, writes.ToArray(), Array.Empty<VoxelBindingMutationEntry>()))
            {
                VoxelMutationOutputRequirements limits = world.GetOutputRequirements(token);
                VoxelMutationResult result = world.CommitV3(token,
                    new VoxelWriteReceipt[limits.SectionCapacity], new byte[limits.ReceiptByteCapacity]);
                if (result.Status != 0 || !result.IsApplied)
                    throw new InvalidOperationException($"BASEMAP_COMMIT_FAILED: {result}");
            }
            expected = Verify(world, input);
            capture = world.Capture();
        }
        // The author world is disposed before the fresh receiver is created.
        using NativeVoxelWorld restored = sdk.CreateVoxelWorld("Authority", sectionBudget, receiptBudget, catalog);
        restored.Restore(capture);
        if (Verify(restored, input) != expected)
            throw new InvalidDataException("BASEMAP_RESTORE_MISMATCH: fresh world verification differs.");
        return capture;
    }

    private static void ValidateCatalog(string root, byte[] catalog, string? profile)
    {
        using JsonDocument catalogDocument = JsonDocument.Parse(catalog);
        Dictionary<uint, string> names = catalogDocument.RootElement.GetProperty("rows").EnumerateArray()
            .ToDictionary(row => row.GetProperty("blockType").GetUInt32(), row => row.GetProperty("name").GetString()!);
        using JsonDocument blocks = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(MapInputs.TableRoot(root, profile), "blocks.json")));
        foreach (JsonElement block in blocks.RootElement.GetProperty("rows").EnumerateArray())
        {
            string key = block.GetProperty("name").GetString()!;
            uint type = block.GetProperty("block_type").GetUInt32();
            if (key == "air" && type == 0) continue;
            string suffix = key switch { "hardPillar" => "hard_pillar", "softBrick" => "soft_brick", _ => key };
            if (type < 256 || !names.TryGetValue(type, out string? name) || name != $"lumio.bomber.{suffix}")
                throw new InvalidDataException($"BLOCK_CATALOG_MISMATCH: generated blocks row {key} uses block_type={type}; "
                    + $"expected the official catalog identity lumio.bomber.{suffix}. Reserved 1..255 are not game blocks.");
        }
    }

    private static Verification Verify(NativeVoxelWorld world, MapInputs input)
    {
        var mismatches = new List<string>();
        int mismatchCount = 0;
        int sampleOreCells = 0;
        int checkedCells = 0;
        int groundCells = 0;
        int ironCells = 0;
        int pillarCells = 0;
        int waterCells = 0;
        int airCells = 0;
        bool[,] land = new bool[input.Width, input.Depth];
        bool[,] ground = new bool[input.Width, input.Depth];
        bool[,] water = new bool[input.Width, input.Depth];
        bool[,] pillars = new bool[input.Width, input.Depth];
        using IncrementalHash cellState = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        int extentX = ((input.Width + 15) / 16) * 16;
        int extentZ = ((input.Depth + 15) / 16) * 16;
        for (byte y = 0; y < 16; y++)
        for (int z = 0; z < extentZ; z++)
        for (int x = 0; x < extentX; x++)
        {
            uint expected = input.ExpectedBlockId(x, y, z);
            VoxelBlockReadResult actual = world.ReadCell(new(x, y, z));
            cellState.AppendData(Encoding.UTF8.GetBytes(FormattableString.Invariant(
                $"{x},{y},{z}:{actual.Presence}:{actual.HasBlockId}:{actual.BlockId}:{actual.SectionRevision};")));
            checkedCells++;
            if (actual.HasBlockId && actual.BlockId == BlockId(1000)) sampleOreCells++;
            if (actual.HasBlockId && actual.BlockId == BlockId(input.Floor)) groundCells++;
            else if (actual.HasBlockId && actual.BlockId == BlockId(input.Water)) waterCells++;
            else if (actual.HasBlockId && actual.BlockId == BlockId(input.Iron)) ironCells++;
            else if (actual.HasBlockId && actual.BlockId == BlockId(input.Pillar)) pillarCells++;
            else airCells++;
            if (x < input.Width && z < input.Depth)
            {
                if (y == input.GroundLayer) ground[x, z] = actual.HasBlockId && actual.BlockId == BlockId(input.Floor);
                if (y == input.GroundLayer) water[x, z] = actual.HasBlockId && actual.BlockId == BlockId(input.Water);
                if (y == input.ObstacleLayer)
                {
                    land[x, z] = actual.HasBlockId && actual.BlockId == 0;
                    pillars[x, z] = actual.HasBlockId && actual.BlockId == BlockId(input.Pillar);
                }
            }
            if (!actual.HasBlockId || actual.Presence is not (VoxelPresence.Ready or VoxelPresence.Unchanged)
                || actual.BlockId != expected)
            {
                mismatchCount++;
                if (mismatches.Count < 8)
                    mismatches.Add($"({x},{y},{z}) expected BlockId={expected}, actual={actual}");
            }
        }
        if (mismatchCount != 0)
            throw new InvalidDataException($"BASEMAP_CELL_MISMATCH: {mismatchCount}/{checkedCells} cells; "
                + $"Sample ore cells={sampleOreCells}; {string.Join("; ", mismatches)}");
        int potentialSpaces = 0;
        int bridgeCells = 0;
        int plazaClearCells = 0;
        int center = (input.Width - 1) / 2;
        var connected = new bool[input.Width, input.Depth];
        var queue = new Queue<(int X, int Z)>();
        for (int z = 1; z < input.Depth - 1; z++)
        for (int x = 1; x < input.Width - 1; x++)
        {
            if (!ground[x, z] || !land[x, z]) continue;
            potentialSpaces++;
            if (Math.Abs(x - center) <= 1 && Math.Abs(z - center) <= 1) plazaClearCells++;
            if (input.LayoutKind == "M2Moat" &&
                ((Math.Abs(x - center) == input.MoatRadius && z == center)
                    || (Math.Abs(z - center) == input.MoatRadius && x == center))) bridgeCells++;
            if (queue.Count == 0 && potentialSpaces == 1) { queue.Enqueue((x, z)); connected[x, z] = true; }
        }
        int connectedLandCells = 0;
        while (queue.Count > 0)
        {
            var (x, z) = queue.Dequeue();
            connectedLandCells++;
            foreach (var (nx, nz) in new[] { (x - 1, z), (x + 1, z), (x, z - 1), (x, z + 1) })
            {
                if (nx < 1 || nz < 1 || nx >= input.Width - 1 || nz >= input.Depth - 1
                    || connected[nx, nz] || !ground[nx, nz] || !land[nx, nz]) continue;
                connected[nx, nz] = true;
                queue.Enqueue((nx, nz));
            }
        }
        if (input.LayoutKind == "M2Moat")
        {
            for (int z = 0; z < input.Depth; z++)
            for (int x = 0; x < input.Width; x++)
                if (water[x, z] != water[input.Width - 1 - x, z]
                    || water[x, z] != water[x, input.Depth - 1 - z]
                    || pillars[x, z] != pillars[input.Width - 1 - x, z]
                    || pillars[x, z] != pillars[x, input.Depth - 1 - z])
                    throw new InvalidDataException($"M2_GEOMETRY_MISMATCH: symmetry at ({x},{z})");
            var expectedCounts = input.Width switch { 19 => (28, 48, 213), 23 => (44, 80, 317), 27 => (60, 104, 461), _ => throw new InvalidDataException("Unsupported M2 map size") };
            if ((waterCells, pillarCells, potentialSpaces) != expectedCounts || bridgeCells != 4
                || plazaClearCells != 9 || connectedLandCells != potentialSpaces)
                throw new InvalidDataException($"M2_GEOMETRY_MISMATCH: water={waterCells}, pillars={pillarCells}, potential={potentialSpaces}, bridges={bridgeCells}, plaza={plazaClearCells}, connected={connectedLandCells}");
        }
        return new(checkedCells, input.Width * input.Depth * 2, groundCells, ironCells, pillarCells, airCells,
            waterCells, potentialSpaces, bridgeCells, plazaClearCells, connectedLandCells,
            Convert.ToHexStringLower(cellState.GetHashAndReset()));
    }

    // One explicit conversion boundary. Game data carries BlockType; SDK writes carry BlockId.
    private static uint BlockId(uint blockType) => checked(blockType * 256u);

    private sealed record Verification(int CheckedCells, int MapLayerCells, int FloorCells,
        int IronCells, int PillarCells, int AirCells, int WaterCells, int PotentialSpaces,
        int BridgeCells, int PlazaClearCells, int ConnectedLandCells, string CellStateSha256);

    private sealed record MapInputs(int Width, int Depth, int Boundary, byte GroundLayer,
        byte ObstacleLayer, int PillarStride, string LayoutKind, int MoatRadius, int MoatBranchCells,
        uint Floor, uint Iron, uint Pillar, uint Water)
    {
        internal static string TableRoot(string root, string? profile) => profile is null
            ? Path.Combine(root, "Server", "Config", "Tables", "server")
            : Path.Combine(root, "Server", "Config", "Profiles", profile, "server");

        internal static MapInputs Load(string root, string? profile)
        {
            var expected = profile switch
            {
                null => (Size: 19, Players: 8, Radius: 0, Branch: 0, Kind: "LegacyPillars"),
                "m2-map-19" => (Size: 19, Players: 8, Radius: 3, Branch: 2, Kind: "M2Moat"),
                "m2-map-23" => (Size: 23, Players: 12, Radius: 4, Branch: 4, Kind: "M2Moat"),
                "m2-map-27" => (Size: 27, Players: 16, Radius: 5, Branch: 6, Kind: "M2Moat"),
                _ => throw new InvalidDataException($"Unknown authoring profile: {profile}"),
            };
            string tables = TableRoot(root, profile);
            using JsonDocument mapDocument = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(tables, "map.json")));
            using JsonDocument gameDocument = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(tables, "game.json")));
            using JsonDocument blockDocument = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(tables, "blocks.json")));
            JsonElement map = mapDocument.RootElement.GetProperty("rows").EnumerateArray().Single();
            JsonElement game = gameDocument.RootElement.GetProperty("rows").EnumerateArray().Single();
            Dictionary<string, uint> blocks = blockDocument.RootElement.GetProperty("rows").EnumerateArray()
                .ToDictionary(row => row.GetProperty("name").GetString()!, row => row.GetProperty("block_type").GetUInt32(), StringComparer.Ordinal);
            if (blocks["air"] != 0) throw new InvalidDataException("The air row must use reserved BlockType 0.");
            var input = new MapInputs(map.GetProperty("width").GetInt32(), map.GetProperty("depth").GetInt32(),
                map.GetProperty("boundary_cells").GetInt32(), map.GetProperty("ground_layer").GetByte(),
                map.GetProperty("obstacle_layer").GetByte(), map.GetProperty("hard_pillar_stride").GetInt32(),
                map.GetProperty("layout_kind").GetString()!, map.GetProperty("moat_radius_cells").GetInt32(),
                map.GetProperty("moat_branch_cells").GetInt32(),
                blocks["floor"], blocks["iron"], blocks["hardPillar"], blocks["water"]);
            if (input.Width != expected.Size || input.Depth != expected.Size || input.LayoutKind != expected.Kind
                || input.MoatRadius != expected.Radius || input.MoatBranchCells != expected.Branch
                || game.GetProperty("map_size").GetInt32() != expected.Size
                || game.GetProperty("player_count").GetInt32() != expected.Players
                || input.Boundary != 1 || input.GroundLayer != 0 || input.ObstacleLayer != 1 || input.PillarStride != 2)
                throw new InvalidDataException($"Bomber {profile ?? "legacy"} map profile has inconsistent geometry or game dimensions.");
            return input;
        }

        internal uint ExpectedBlockId(int x, int y, int z)
        {
            if (x < 0 || z < 0 || x >= Width || z >= Depth) return 0;
            if (y == GroundLayer) return BlockId(IsWater(x, z) ? Water : Floor);
            if (y != ObstacleLayer) return 0;
            if (x < Boundary || z < Boundary || x >= Width - Boundary || z >= Depth - Boundary)
                return BlockId(Iron);
            if (IsWater(x, z)) return 0;
            int center = (Width - 1) / 2;
            int distance = Math.Max(Math.Abs(x - center), Math.Abs(z - center));
            return (LayoutKind == "LegacyPillars" || distance >= MoatRadius)
                && x % PillarStride == 0 && z % PillarStride == 0 ? BlockId(Pillar) : 0;
        }

        private bool IsWater(int x, int z)
        {
            if (LayoutKind != "M2Moat") return false;
            int center = (Width - 1) / 2;
            int dx = Math.Abs(x - center), dz = Math.Abs(z - center);
            int distance = Math.Max(dx, dz);
            if (distance == MoatRadius && dx != 0 && dz != 0) return true;
            for (int i = 0; i < MoatBranchCells; i++)
                if (dx == MoatRadius + 1 + i / 2 && dz == MoatRadius + (i + 1) / 2) return true;
            return false;
        }
    }
}
