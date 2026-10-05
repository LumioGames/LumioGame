using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Lumio.Bomber.Tests;

/// <summary>
/// ADR-123: every engine binary a test runs against comes from the <c>Engine/</c> submodule
/// (LumioEngineRelease pinned at a release tag) — the same release the build restored
/// <c>Lumio.Engine.SDK</c> from. No environment variable names an engine artefact, and there is
/// no sibling checkout to fall back to. A missing input is a named failure, never a skip.
/// Compiled into both Bomber test projects (Tools/*.Tests csproj link this file).
/// </summary>
internal static class EngineRelease
{
    internal const string InitCommand = "git submodule update --init --depth 1 Engine";

    internal static string RepoRoot { get; } = FindRepoRoot();

    internal static string Root => Path.Combine(RepoRoot, "Engine");

    /// <summary>This process's runtime identifier, spelled the way the release names platforms.</summary>
    internal static string Rid => RuntimeInformation.RuntimeIdentifier;

    internal static string Server => Path.Combine(Root, "server", Rid);

    // Native is copied from the exact restored SDK package, including when an
    // explicitly verified official candidate is selected for validation. Reading
    // Engine/server here would mix that candidate's managed Runtime with another
    // release's native image. Missing package assets remain a hard failure.
    internal static string NativeLibrary => Path.Combine(AppContext.BaseDirectory, "runtimes", Rid, "native", NativeFileName);

    internal static string HostEntry => Path.Combine(Server, "Application", "Lumio.Server.HostEntry.dll");

    internal static string ReplicationAssembly => Path.Combine(Server, "SDK", "Managed", "Lumio.GameRuntime.Replication.dll");

    internal static string EcsAssembly => Path.Combine(Server, "SDK", "Managed", "Lumio.GameRuntime.Ecs.dll");

    /// <summary>
    /// The Runtime finds <c>liblumio_engine_native</c> through <c>LUMIO_ENGINE_NATIVE_PATH</c>
    /// (Ecs spatial index, GAS hfsm, Simulation clock). Every test process points it at the
    /// release native before any test runs, so a Runtime lease and the cases that load
    /// <see cref="NativeLibrary"/> directly use the same image (R-00785). Set unconditionally, so
    /// no value inherited from the shell can point these tests at another image.
    /// </summary>
    [System.Runtime.CompilerServices.ModuleInitializer]
    internal static void UseReleaseNative() =>
        Environment.SetEnvironmentVariable("LUMIO_ENGINE_NATIVE_PATH", NativeLibrary);

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
        }
        throw new InvalidOperationException($"LumioBomber.slnx not found above {AppContext.BaseDirectory}");
    }
}
