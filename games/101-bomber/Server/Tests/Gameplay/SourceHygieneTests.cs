using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

public sealed class SourceHygieneTests
{
    private static string GameplayRoot => Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Gameplay");

    [Fact]
    public void SetLocalPositionIsOnlyCalledFromMoveAbility()
    {
        var hits = new List<string>();
        foreach (string file in Directory.GetFiles(GameplayRoot, "*.cs", SearchOption.AllDirectories))
        {
            if (file.Contains($"{Path.DirectorySeparatorChar}generated{Path.DirectorySeparatorChar}", System.StringComparison.Ordinal))
                continue;
            if (Path.GetFileName(file) == "MoveAbility.cs") continue;
            if (Path.GetFileName(file) == "BomberGameplay.cs") continue;
            // The admission pose half of BomberGameplay, split out as a server-side file (B-00121).
            if (Path.GetFileName(file) == "BomberGameplay.Server.cs") continue;
            if (Regex.IsMatch(File.ReadAllText(file), @"SetLocalPosition|SetWorldPosition|Translate\("))
                hits.Add(file);
        }

        Assert.Empty(hits);
    }

    [Fact]
    public void ServerJsonUsesRelativeAssemblyPaths()
    {
        string text = File.ReadAllText(Path.Combine(GameplayRoot, "..", "Server", "Config", "Startup", "server.json"));
        Assert.Contains("../../../Gameplay/bin/Debug/net10.0/Lumio.Bomber.Gameplay.dll", text);
        Assert.DoesNotContain("/Users/", text);
        Assert.DoesNotContain("LumioGameEngine/", text);
        Assert.Contains("\"world_profile\": \"runtime+voxel\"", text);
        Assert.Contains("\"voxel_catalog\": \"../../Assets/Maps/official-catalog.json\"", text);
        Assert.Contains("\"durability\": \"snapshot_only\"", text);
        Assert.DoesNotContain("process-crash", text);
        Assert.DoesNotContain("power-loss", text);
        Assert.Contains("\"base_map_id\": \"bomber\"", text);
        Assert.Contains("\"base_map_version\": \"0.1.0\"", text);
        Assert.Contains("\"base_map_path\": \"../../Assets/Maps/bomber.voxel\"", text);
        Assert.DoesNotContain("0.1.0-placeholder", text);
        Assert.Matches(new Regex("\"base_map_content_sha256\": \"[0-9a-f]{64}\""), text);
        Assert.Contains("\"config_dir\": \"../Tables\"", text);
        Assert.Contains("\"voxel_quota_bytes\": 65536", text);
        Assert.Contains("Lumio.Server.HostEntry.HostEntry, Lumio.Server.HostEntry", text);
        Assert.Contains("LumioHostEntry", text);
        Assert.DoesNotContain("replace-host-entry", text);
        Assert.DoesNotContain("replace-server-audience", text);
        Assert.DoesNotContain("REPLACE_WITH_PLATFORM_32_BYTE_PUBLIC_KEY_HEX", text);
        Assert.Matches(new Regex("\"admission_public_key_hex\": \"[0-9a-fA-F]{64}\""), text);
    }

    [Fact]
    public void CommittedVoxelIsARestoreableCapture()
    {
        string repoRoot = Path.GetFullPath(Path.Combine(GameplayRoot, ".."));
        string mapPath = Path.Combine(repoRoot, "Server", "Assets", "Maps", "bomber.voxel");
        byte[] bytes = File.ReadAllBytes(mapPath);
        string mapText = Encoding.UTF8.GetString(bytes);
        Assert.Contains("LUMIOSNP1", mapText);
        Assert.DoesNotContain("LUMIO-VOXEL-SNAPSHOT-V1", mapText);
        Assert.DoesNotContain("BLOCKED: this is not a restoreable VoxelEngine capture", mapText);
        Assert.DoesNotContain("do-not-restore: true", mapText);
        Assert.DoesNotContain("does not exist", mapText, StringComparison.OrdinalIgnoreCase);

        using JsonDocument document = JsonDocument.Parse(File.ReadAllText(Path.Combine(repoRoot, "Server", "Config", "Startup", "server.json")));
        string declared = document.RootElement.GetProperty("base_map_content_sha256").GetString()!;
        string actual = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        Assert.Equal(actual, declared);
        Assert.Matches("^[0-9a-f]{64}$", declared);
        Assert.True(bytes.Length > 0);
    }

    [Fact]
    public void GameplayOutputShipsNet10SimulationAndCanonicalEngineOwner()
    {
        DirectoryInfo output = new(AppContext.BaseDirectory);
        // SDK artifacts output is bin/<project>/<pivot>; ordinary output is bin/<configuration>/<tfm>.
        string gameplayOutput = output.Parent!.Name == "Lumio.Bomber.Gameplay.Tests"
            ? Path.Combine(output.Parent.Parent!.FullName, "Lumio.Bomber.Gameplay", output.Name)
            : Path.Combine(GameplayRoot, "bin", output.Parent.Name, "net10.0");
        string path = Path.Combine(gameplayOutput, "Lumio.GameRuntime.Simulation.dll");
        Assert.True(
            File.Exists(path),
            "Lumio.GameRuntime.Simulation.dll is missing from Bomber gameplay output. Probed: " + path);

        Assembly assembly = Assembly.LoadFrom(path);
        string hostingPath = Path.Combine(gameplayOutput, "Lumio.GameRuntime.Hosting.dll");
        Assert.True(File.Exists(hostingPath), "The canonical Engine owner must ship beside gameplay: " + hostingPath);
        Assembly hosting = Assembly.LoadFrom(hostingPath);
        Assert.NotNull(hosting.GetType("Lumio.GameRuntime.Hosting.LumioEngine"));
        Assert.True(hosting.GetType("Lumio.GameRuntime.Hosting.NativeWorldVoxelResources") is not null,
            "The desktop Engine owner must resolve the net10.0 Hosting assembly with actual Native resources.");
        Assert.True(
            assembly.GetType("Lumio.GameRuntime.Simulation.WorldTickBinding") is not null,
            "Lumio.GameRuntime.Simulation.WorldTickBinding is missing from " + path + ".");
    }

    [Fact]
    public void CiTakesTheEngineOnlyFromTheEngineSubmodule()
    {
        // ADR-123: build and test jobs fetch Engine/ with the checkout (submodules: true); no job
        // checks out a private engine repository or reads the organisation CI token, and the native the GAS
        // wiring tests load is the release's (Server/Tests/EngineRelease.cs), not a provisioned one.
        string yml = File.ReadAllText(Path.Combine(GameplayRoot, "..", "..", "..", ".github", "workflows", "bomber-101.yml"));
        Assert.Contains("submodules: true", yml);
        Assert.DoesNotContain("provision-engine-native.sh", yml);
        Assert.DoesNotContain("secrets.LUMIO_" + "CI_PAT", yml);
        foreach (string repository in new[] { "LumioGameEngine", "LumioGameRuntime", "LumioNativeCore", "LumioVoxelEngine", "LumioServer", "LumioClient", "LumioPlatform" })
            Assert.DoesNotContain("repository: LumioGames/" + repository, yml);
        Assert.Contains("node --test Tools/server-profile.test.mjs", yml);
        Assert.Contains("node --test Tools/ds-config.test.mjs", yml);
        Assert.Contains("node --test Tools/sync-config-readers.test.mjs", yml);
        // LumioConfig is public: the zero-diff reader check still drives the real generator.
        Assert.Contains("LUMIO_CONFIG_ROOT", yml);
        Assert.Contains("repository: LumioGames/LumioConfig", yml);
    }
}
