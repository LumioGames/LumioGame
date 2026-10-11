using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

namespace Lumio.Bomber.Tests;

/// <summary>
/// ADR-123: tests use the pinned <c>Engine/</c> release, or the complete candidate verified
/// during this assembly's build. Private assembly metadata binds that candidate's root,
/// version and manifest hash. No environment variable selects a release or loose binary.
/// Compiled into both Bomber test projects (Tools/*.Tests csproj link this file).
/// </summary>
internal static class EngineRelease
{
    internal const string InitCommand = "git submodule update --init --depth 1 Engine";

    internal static string RepoRoot { get; } = FindRepoRoot();

    private static readonly AssemblyMetadataAttribute[] Selection = Assembly.GetExecutingAssembly()
        .GetCustomAttributes<AssemblyMetadataAttribute>().ToArray();

    internal static string Root { get; } = SelectRoot(Selection, Path.Combine(RepoRoot, "Engine"), Rid);

    /// <summary>This process's runtime identifier, spelled the way the release names platforms.</summary>
    internal static string Rid => RuntimeInformation.RuntimeIdentifier;

    internal static string Server => Path.Combine(Root, "server", Rid);

    // Native is copied from the exact restored SDK package, including when an
    // explicitly verified official candidate is selected for validation. Reading
    // Engine/server here would mix that candidate's managed Runtime with another
    // release's native image. Missing package assets remain a hard failure.
    internal static string NativeLibrary => Path.Combine(AppContext.BaseDirectory, "runtimes", Rid, "native", NativeFileName);

    internal static string HostEntry => SelectedBinary($"server/{Rid}/Application/Lumio.Server.HostEntry.dll");

    internal static string ReplicationAssembly => SelectedBinary($"server/{Rid}/SDK/Managed/Lumio.GameRuntime.Replication.dll");

    internal static string EcsAssembly => SelectedBinary($"server/{Rid}/SDK/Managed/Lumio.GameRuntime.Ecs.dll");

    /// <summary>
    /// The Runtime finds <c>liblumio_engine_native</c> through <c>LUMIO_ENGINE_NATIVE_PATH</c>
    /// (Ecs spatial index, GAS hfsm, Simulation clock). Every test process points it at the
    /// release native before any test runs, so a Runtime lease and the cases that load
    /// <see cref="NativeLibrary"/> directly use the same image (R-00785). Set unconditionally, so
    /// no value inherited from the shell can point these tests at another image.
    /// </summary>
    [System.Runtime.CompilerServices.ModuleInitializer]
    internal static void UseReleaseNative()
    {
        if (HasCandidate) ValidateNative(NativeLibrary);
        Environment.SetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH", NativeLibrary);
    }

    private static bool HasCandidate => Selection.Any(item => item.Key == "Lumio.Test.EngineRoot");

    internal static string SelectRoot(IEnumerable<AssemblyMetadataAttribute> metadata, string pinned, string rid)
    {
        string[] keys = ["Lumio.Test.EngineRoot", "Lumio.Test.EngineVersion", "Lumio.Test.EngineManifestSha256"];
        var selected = metadata.Where(item => keys.Contains(item.Key, StringComparer.Ordinal)).ToArray();
        if (selected.Length == 0) return pinned;
        if (selected.Length != keys.Length || keys.Any(key => selected.Count(item => item.Key == key) != 1)
            || selected.Any(item => string.IsNullOrWhiteSpace(item.Value)))
            throw Invalid("candidate metadata must contain exactly one non-empty root, version and manifest hash");
        string root = selected.Single(item => item.Key == keys[0]).Value!;
        if (!Path.IsPathFullyQualified(root)) throw Invalid("candidate root must be absolute");
        string canonical = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        if (!string.Equals(canonical, Path.TrimEndingDirectorySeparator(root), PathComparison))
            throw Invalid("candidate root must be canonical");
        for (DirectoryInfo? directory = new(canonical); directory is not null; directory = directory.Parent)
            if (directory.LinkTarget is not null) throw Invalid("candidate root must not traverse a directory link");
        string manifest = Path.Combine(canonical, "manifest.json");
        if (!File.Exists(manifest) || !string.Equals(Hash(manifest), selected.Single(item => item.Key == keys[2]).Value, StringComparison.OrdinalIgnoreCase))
            throw Invalid("candidate manifest hash differs or manifest is missing");
        using JsonDocument document = JsonDocument.Parse(File.ReadAllBytes(manifest));
        JsonElement value = document.RootElement;
        if (value.GetProperty("formatVersion").GetInt32() != 2
            || value.GetProperty("version").GetString() != selected.Single(item => item.Key == keys[1]).Value
            || value.TryGetProperty("candidateKind", out _) || (value.TryGetProperty("fullRelease", out var complete) && complete.ValueKind == JsonValueKind.False))
            throw Invalid("candidate must be the verified version of a complete format2 release");
        ValidateFile(canonical, "tools/verify-release.mjs", Path.Combine(canonical, "tools", "verify-release.mjs"));
        var start = new ProcessStartInfo("node") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, WorkingDirectory = canonical };
        foreach (string argument in new[] { Path.Combine(canonical, "tools", "verify-release.mjs"), "--root", canonical, "--rid", rid, "--version", selected.Single(item => item.Key == keys[1]).Value! })
            start.ArgumentList.Add(argument);
        using Process process = Process.Start(start) ?? throw Invalid("official release verifier could not start");
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(60000)) { process.Kill(entireProcessTree: true); throw Invalid("official release verifier timed out"); }
        string result = stdout.GetAwaiter().GetResult() + stderr.GetAwaiter().GetResult();
        if (process.ExitCode != 0) throw Invalid($"official release verifier exit {process.ExitCode}: {result}");
        foreach (string relative in new[] { $"server/{rid}/Application/Lumio.Server.HostEntry.dll", $"server/{rid}/SDK/Managed/Lumio.GameRuntime.Ecs.dll", $"server/{rid}/SDK/Managed/Lumio.GameRuntime.Replication.dll", $"server/{rid}/SDK/Native/{rid}/{NativeFileName}", $"bot/{rid}/Lumio.Client.Bot.Host.dll", "web/lumio_voxel_wasm.wasm", $"sdk/Lumio.Engine.SDK.{value.GetProperty("version").GetString()}.nupkg" })
            ValidateFile(canonical, relative, Path.Combine(canonical, relative));
        return canonical;
    }

    internal static void ValidateLoadedAssembly(Assembly assembly, string relative)
    {
        string expected = Path.GetFullPath(Path.Combine(Root, relative));
        string sdkOutput = Path.Combine(AppContext.BaseDirectory, Path.GetFileName(relative));
        string actual = assembly.Location;
        bool runtimeOutput = relative.StartsWith($"server/{Rid}/SDK/Managed/", StringComparison.Ordinal) && string.Equals(actual, sdkOutput, PathComparison);
        if (!string.Equals(actual, expected, PathComparison) && !runtimeOutput)
            throw Invalid($"loaded assembly is outside selected release and SDK output: {actual}");
        ValidateFile(Root, relative, actual);
        using var stream = File.OpenRead(actual);
        using var pe = new PEReader(stream);
        MetadataReader reader = pe.GetMetadataReader();
        if (reader.GetGuid(reader.GetModuleDefinition().Mvid) != assembly.ManifestModule.ModuleVersionId)
            throw Invalid($"loaded MVID differs from PE: {actual}");
        string pdbRelative = Path.ChangeExtension(relative, ".pdb").Replace('\\', '/');
        using JsonDocument manifest = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(Root, "manifest.json")));
        bool hasPdb = manifest.RootElement.GetProperty("files").TryGetProperty(pdbRelative, out _);
        string pdb = Path.ChangeExtension(actual, ".pdb");
        if (hasPdb) ValidateFile(Root, pdbRelative, pdb);
        else if (File.Exists(pdb)) throw Invalid($"unlisted PDB beside loaded assembly: {pdb}");
    }

    internal static void ValidateNative(string actual)
    {
        if (!string.Equals(Path.GetFullPath(actual), Path.GetFullPath(NativeLibrary), PathComparison))
            throw Invalid($"Native must come from this SDK output: {actual}");
        string relative = $"server/{Rid}/SDK/Native/{Rid}/";
        ValidateFile(Root, relative + NativeFileName, actual);
        ValidateFile(Root, relative + "build-info.json", Path.Combine(Path.GetDirectoryName(actual)!, "build-info.json"));
    }

    private static string SelectedBinary(string relative)
    {
        string path = Path.Combine(Root, relative);
        if (HasCandidate) ValidateFile(Root, relative, path);
        return path;
    }

    private static void ValidateFile(string root, string relative, string path)
    {
        using JsonDocument manifest = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(root, "manifest.json")));
        if (!manifest.RootElement.GetProperty("files").TryGetProperty(relative, out var expected)
            || !File.Exists(path) || !string.Equals(expected.GetString(), Hash(path), StringComparison.OrdinalIgnoreCase))
            throw Invalid($"binary does not match selected manifest: {relative} at {path}");
    }

    private static string Hash(string path) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path)));

    private static StringComparison PathComparison => OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;

    private static InvalidOperationException Invalid(string message) => new($"ENGINE_TEST_RELEASE_INVALID: {message}");

    internal static string Require(string path, string why)
    {
        if (!File.Exists(path) && !Directory.Exists(path))
        {
            throw new InvalidOperationException(
                $"ENGINE_RELEASE_INPUT_MISSING: {path} ({why}). Engine/ is the LumioEngineRelease submodule; "
                + $"fill it with `{InitCommand}`, and make sure its manifest lists {Rid}.");
        }
        return path;
    }

    /// <summary>build-info.json beside the release native: the identity the loader checks.</summary>
    internal static (string BuildId, string AbiHash, string BinarySha256) NativeBuildInfo()
    {
        string sidecar = Require(Path.Combine(Path.GetDirectoryName(NativeLibrary)!, "build-info.json"),
            "the release native's identity sidecar");
        using JsonDocument document = JsonDocument.Parse(File.ReadAllText(sidecar));
        JsonElement root = document.RootElement;
        return (root.GetProperty("buildId").GetString()!, root.GetProperty("abiHash").GetString()!,
            root.GetProperty("binarySha256").GetString()!);
    }

    private static string NativeFileName =>
        OperatingSystem.IsWindows() ? "lumio_engine_native.dll"
        : OperatingSystem.IsMacOS() ? "liblumio_engine_native.dylib"
        : "liblumio_engine_native.so";

    private static string FindRepoRoot()
    {
        for (DirectoryInfo? directory = new(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "LumioBomber.slnx"))) return directory.FullName;
            string game = Path.Combine(directory.FullName, "games", "101-bomber");
            if (File.Exists(Path.Combine(directory.FullName, "LumioGame.sln"))
                && File.Exists(Path.Combine(game, "LumioBomber.slnx"))) return game;
        }
        throw new InvalidOperationException($"LumioBomber.slnx not found above {AppContext.BaseDirectory}");
    }
}
