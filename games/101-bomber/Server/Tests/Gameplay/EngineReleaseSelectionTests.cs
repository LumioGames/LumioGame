using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text.Json;
using Lumio.Engine.SDK;
using Xunit;

namespace Lumio.Bomber.Tests;

public sealed class EngineReleaseSelectionTests(ITestOutputHelper output)
{
    private static readonly JsonSerializerOptions EvidenceJson = new() { WriteIndented = true };
    private static AssemblyMetadataAttribute[] ExecutingMetadata => Assembly.GetExecutingAssembly().GetCustomAttributes<AssemblyMetadataAttribute>()
        .Where(item => item.Key.StartsWith("Lumio.Test.Engine", StringComparison.Ordinal)).ToArray();

    private static AssemblyMetadataAttribute[] Metadata
    {
        get
        {
            if (ExecutingMetadata.Length != 0) return ExecutingMetadata;
            using JsonDocument manifest = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(EngineRelease.Root, "manifest.json")));
            return [new("Lumio.Test.EngineRoot", EngineRelease.Root), new("Lumio.Test.EngineVersion", manifest.RootElement.GetProperty("version").GetString()), new("Lumio.Test.EngineManifestSha256", Hash(Path.Combine(EngineRelease.Root, "manifest.json")))];
        }
    }

    private static string SelectedRoot => ExecutingMetadata.Length == 0 ? EngineRelease.Root : Metadata.Single(item => item.Key == "Lumio.Test.EngineRoot").Value!;

    [Fact]
    public void ExecutingAssemblySelectsTheVerifiedCandidateAndProductionNative()
    {
        string root = SelectedRoot;
        if (ExecutingMetadata.Length != 0)
            Assert.NotEqual(Path.GetFullPath(Path.Combine(EngineRelease.RepoRoot, "Engine")), Path.TrimEndingDirectorySeparator(root));
        else Assert.Equal(Path.Combine(EngineRelease.RepoRoot, "Engine"), root);
        using LumioEngineLease native = LumioEngineSdk.LoadNative(EngineRelease.NativeLibrary);
        output.WriteLine($"Loaded production Native: {EngineRelease.NativeLibrary}; buildId={native.BuildId}; abiHash={native.AbiHash}; binarySha256={native.BinarySha256}");
        Assert.Equal(Path.TrimEndingDirectorySeparator(Path.GetFullPath(root)), Path.TrimEndingDirectorySeparator(EngineRelease.Root));
        Assert.Equal(Path.Combine(EngineRelease.Root, "server", EngineRelease.Rid), EngineRelease.Server);
        Assert.Equal(Path.Combine(AppContext.BaseDirectory, "runtimes", EngineRelease.Rid, "native", "lumio_engine_native.dll"), EngineRelease.NativeLibrary);
        EngineRelease.ValidateNative(EngineRelease.NativeLibrary);
        var sidecar = EngineRelease.NativeBuildInfo();
        Assert.Equal(sidecar.BuildId, native.BuildId);
        Assert.Equal(sidecar.AbiHash, native.AbiHash);
        Assert.Equal(sidecar.BinarySha256, native.BinarySha256);
    }

    [Fact]
    public void NoMetadataKeepsTheAvailablePinnedRelease()
    {
        string pinned = Path.Combine(EngineRelease.RepoRoot, "Engine");
        Assert.Equal(pinned, EngineRelease.SelectRoot(Array.Empty<AssemblyMetadataAttribute>(), pinned, EngineRelease.Rid));
        foreach (string path in new[] { "manifest.json", $"server/{EngineRelease.Rid}/Application/Lumio.Server.HostEntry.dll", $"server/{EngineRelease.Rid}/SDK/Managed/Lumio.GameRuntime.Ecs.dll", $"server/{EngineRelease.Rid}/SDK/Managed/Lumio.GameRuntime.Replication.dll" })
            Assert.True(File.Exists(Path.Combine(pinned, path)), $"BLOCKED_ENV: pinned input missing: {path}");
        output.WriteLine($"Pinned default separately verified: {pinned}; manifestSha256={Hash(Path.Combine(pinned, "manifest.json"))}");
    }

    [Theory]
    [InlineData(1)] [InlineData(2)] [InlineData(3)] [InlineData(4)] [InlineData(5)] [InlineData(6)]
    public void EveryPartialMetadataCombinationFails(int mask)
    {
        var partial = Metadata.Where((_, index) => (mask & (1 << index)) != 0).ToArray();
        Assert.Throws<InvalidOperationException>(() => EngineRelease.SelectRoot(partial, "unused", EngineRelease.Rid));
    }

    [Theory]
    [InlineData("Lumio.Test.EngineRoot")] [InlineData("Lumio.Test.EngineVersion")] [InlineData("Lumio.Test.EngineManifestSha256")]
    public void DuplicateMetadataFails(string key)
    {
        var duplicate = Metadata.Append(Metadata.Single(item => item.Key == key));
        Assert.Throws<InvalidOperationException>(() => EngineRelease.SelectRoot(duplicate, "unused", EngineRelease.Rid));
    }

    [Theory]
    [InlineData("Lumio.Test.EngineRoot", "relative/release")]
    [InlineData("Lumio.Test.EngineRoot", "")]
    [InlineData("Lumio.Test.EngineVersion", "0.0.0-wrong")]
    [InlineData("Lumio.Test.EngineManifestSha256", "0000000000000000000000000000000000000000000000000000000000000000")]
    public void InvalidMetadataFails(string key, string value)
    {
        var changed = Metadata.Select(item => new AssemblyMetadataAttribute(item.Key, item.Key == key ? value : item.Value));
        Assert.Throws<InvalidOperationException>(() => EngineRelease.SelectRoot(changed, "unused", EngineRelease.Rid));
    }

    [Fact]
    public void NonCanonicalRootFails()
    {
        string root = Path.Combine(SelectedRoot, "server", "..");
        var changed = Metadata.Select(item => new AssemblyMetadataAttribute(item.Key, item.Key == "Lumio.Test.EngineRoot" ? root : item.Value));
        Assert.Throws<InvalidOperationException>(() => EngineRelease.SelectRoot(changed, "unused", EngineRelease.Rid));
    }

    [Fact]
    public void ValidMetadataSelectsTheCompleteFormatTwoRelease()
    {
        if (ExecutingMetadata.Length == 0)
            Assert.Equal(EngineRelease.Root, EngineRelease.SelectRoot(ExecutingMetadata, EngineRelease.Root, EngineRelease.Rid));
        else Assert.Equal(Path.TrimEndingDirectorySeparator(Path.GetFullPath(SelectedRoot)), EngineRelease.SelectRoot(Metadata, "unused", EngineRelease.Rid));
    }

    [Fact]
    public void WrongRidFails() => Assert.Throws<InvalidOperationException>(() => EngineRelease.SelectRoot(Metadata, "unused", "linux-arm64"));

    [Theory]
    [InlineData("manifest")]
    [InlineData("format")]
    [InlineData("file")]
    [InlineData("incomplete")]
    public void TamperedOrIncompleteReleaseFails(string change)
    {
        string fixture = CopyRelease();
        string manifest = Path.Combine(fixture, "manifest.json");
        if (change == "manifest") File.AppendAllText(manifest, " ");
        if (change == "format") File.WriteAllText(manifest, File.ReadAllText(manifest).Replace("\"formatVersion\": 2", "\"formatVersion\": 1", StringComparison.Ordinal));
        if (change == "file") File.AppendAllText(Path.Combine(fixture, "server", EngineRelease.Rid, "SDK", "Managed", "Lumio.GameRuntime.Ecs.dll"), "changed");
        if (change == "incomplete") File.Delete(Path.Combine(fixture, "web", "lumio_voxel_wasm.wasm"));
        var changed = Metadata.Select(item => new AssemblyMetadataAttribute(item.Key,
            item.Key == "Lumio.Test.EngineRoot" ? fixture : item.Key == "Lumio.Test.EngineManifestSha256" && change == "format" ? Hash(manifest) : item.Value));
        Assert.Throws<InvalidOperationException>(() => EngineRelease.SelectRoot(changed, "unused", EngineRelease.Rid));
    }

    [Fact]
    public void ActualHostAndSdkRuntimeBytesAndMvidMatchTheSelectedManifest()
    {
        var identities = new List<object>();
        foreach (string relative in new[] { $"server/{EngineRelease.Rid}/Application/Lumio.Server.HostEntry.dll", $"server/{EngineRelease.Rid}/SDK/Managed/Lumio.GameRuntime.Ecs.dll", $"server/{EngineRelease.Rid}/SDK/Managed/Lumio.GameRuntime.Replication.dll" })
        {
            string expected = Path.Combine(EngineRelease.Root, relative);
            Assembly loaded = Assembly.LoadFrom(expected);
            EngineRelease.ValidateLoadedAssembly(loaded, relative);
            using var stream = File.OpenRead(loaded.Location);
            using var pe = new PEReader(stream);
            MetadataReader reader = pe.GetMetadataReader();
            Assert.Equal(reader.GetGuid(reader.GetModuleDefinition().Mvid), loaded.ManifestModule.ModuleVersionId);
            Assert.Equal(Hash(expected), Hash(loaded.Location));
            string pdb = Path.ChangeExtension(loaded.Location, ".pdb");
            output.WriteLine($"Loaded PE: {loaded.Location}; selected={expected}; MVID={loaded.ManifestModule.ModuleVersionId}; sha256={Hash(loaded.Location)}; PDB={(File.Exists(pdb) ? Hash(pdb) : "ABSENT_FROM_RELEASE_AND_SDK")}");
            identities.Add(new { relative, expected, loaded.Location, mvid = loaded.ManifestModule.ModuleVersionId, peSha256 = Hash(loaded.Location), pdbSha256 = File.Exists(pdb) ? Hash(pdb) : null, pdbStatus = File.Exists(pdb) ? "PRESENT" : "ABSENT_FROM_RELEASE_AND_SDK" });
        }
        Assembly sdk = typeof(LumioEngineSdk).Assembly;
        EngineRelease.ValidateLoadedAssembly(sdk, $"server/{EngineRelease.Rid}/SDK/Managed/Lumio.Engine.SDK.dll");
        output.WriteLine($"Loaded SDK PE: {sdk.Location}; MVID={sdk.ManifestModule.ModuleVersionId}; sha256={Hash(sdk.Location)}; PDB=ABSENT_FROM_RELEASE_AND_SDK");
        identities.Add(new { relative = $"server/{EngineRelease.Rid}/SDK/Managed/Lumio.Engine.SDK.dll", expected = Path.Combine(EngineRelease.Server, "SDK", "Managed", "Lumio.Engine.SDK.dll"), sdk.Location, mvid = sdk.ManifestModule.ModuleVersionId, peSha256 = Hash(sdk.Location), pdbSha256 = (string?)null, pdbStatus = "ABSENT_FROM_RELEASE_AND_SDK" });
        foreach (string file in Directory.EnumerateFiles(AppContext.BaseDirectory, "Lumio.*.dll")
            .Where(file => (Path.GetFileName(file).StartsWith("Lumio.GameRuntime.", StringComparison.Ordinal) || Path.GetFileName(file).StartsWith("Lumio.Engine.", StringComparison.Ordinal))
                && !new[] { "Lumio.GameRuntime.Ecs.dll", "Lumio.GameRuntime.Replication.dll", "Lumio.Engine.SDK.dll" }.Contains(Path.GetFileName(file), StringComparer.Ordinal)))
        {
            Assembly loaded = Assembly.LoadFrom(file);
            string relative = $"server/{EngineRelease.Rid}/SDK/Managed/{Path.GetFileName(file)}";
            EngineRelease.ValidateLoadedAssembly(loaded, relative);
            string pdb = Path.ChangeExtension(loaded.Location, ".pdb");
            identities.Add(new { relative, expected = Path.Combine(EngineRelease.Root, relative), loaded.Location, mvid = loaded.ManifestModule.ModuleVersionId, peSha256 = Hash(loaded.Location), pdbSha256 = File.Exists(pdb) ? Hash(pdb) : null, pdbStatus = File.Exists(pdb) ? "PRESENT" : "ABSENT_FROM_RELEASE_AND_SDK" });
        }
        using LumioEngineLease native = LumioEngineSdk.LoadNative(EngineRelease.NativeLibrary);
        EngineRelease.ValidateNative(EngineRelease.NativeLibrary);
        string proof = Path.Combine(EngineRelease.RepoRoot, ".run", $"g2a-selection-proof-{Assembly.GetExecutingAssembly().GetName().Name}-{Environment.ProcessId}.json");
        Directory.CreateDirectory(Path.GetDirectoryName(proof)!);
        File.WriteAllText(proof, JsonSerializer.Serialize(new
        {
            engineRoot = EngineRelease.Root,
            metadata = ExecutingMetadata.Select(item => new { item.Key, item.Value }),
            manifestSha256 = Hash(Path.Combine(EngineRelease.Root, "manifest.json")),
            assemblies = identities,
            native = new { path = EngineRelease.NativeLibrary, native.BuildId, native.AbiHash, native.BinarySha256, fileSha256 = Hash(EngineRelease.NativeLibrary), buildInfoSha256 = Hash(Path.Combine(Path.GetDirectoryName(EngineRelease.NativeLibrary)!, "build-info.json")) },
            pinnedDefault = new { path = Path.Combine(EngineRelease.RepoRoot, "Engine"), manifestSha256 = Hash(Path.Combine(EngineRelease.RepoRoot, "Engine", "manifest.json")) },
        }, EvidenceJson));
        output.WriteLine($"Selection identity proof: {proof}");
    }

    [Theory]
    [InlineData("Application/Lumio.Server.HostEntry.dll")]
    [InlineData("SDK/Managed/Lumio.GameRuntime.Ecs.dll")]
    [InlineData("SDK/Managed/Lumio.GameRuntime.Replication.dll")]
    public void AssemblyActuallyLoadedFromAnotherRootFails(string path)
    {
        string source = Path.Combine(EngineRelease.Server, path);
        string fixture = Path.Combine(EngineRelease.RepoRoot, ".run", "selection-foreign-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(fixture);
        string foreign = Path.Combine(fixture, Path.GetFileName(source));
        File.Copy(source, foreign);
        var context = new AssemblyLoadContext("selection-foreign", isCollectible: true);
        try
        {
            Assembly loaded = context.LoadFromAssemblyPath(foreign);
            Assert.Equal(foreign, loaded.Location);
            Assert.Throws<InvalidOperationException>(() => EngineRelease.ValidateLoadedAssembly(loaded, $"server/{EngineRelease.Rid}/{path}"));
        }
        finally { context.Unload(); }
    }

    [Fact]
    public void NativeFromAnotherRootFailsEvenWhenTheBytesMatch()
    {
        string foreign = Path.Combine(EngineRelease.Server, "SDK", "Native", EngineRelease.Rid, "lumio_engine_native.dll");
        using LumioEngineLease native = LumioEngineSdk.LoadNative(foreign);
        Assert.Equal(EngineRelease.NativeBuildInfo().BinarySha256, native.BinarySha256);
        Assert.Throws<InvalidOperationException>(() => EngineRelease.ValidateNative(foreign));
    }

    private static string Hash(string path) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path)));

    private static string CopyRelease()
    {
        string fixture = Path.Combine(EngineRelease.RepoRoot, ".run", "selection-release-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(fixture);
        foreach (string file in Directory.EnumerateFiles(SelectedRoot, "*", SearchOption.AllDirectories))
        {
            string target = Path.Combine(fixture, Path.GetRelativePath(SelectedRoot, file));
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file, target);
        }
        return fixture;
    }
}
