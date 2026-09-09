using System;
using System.IO;
using System.Text.Json;

namespace Lumio.Game.ServerGameplay.Tests;

/// <summary>
/// Reads a wire contract straight out of the architecture repository <c>LumioGameEngine</c>, the single
/// source of truth for public semantics. This repository consumes those files and never mirrors them, so
/// the checkout is located at test time instead of being vendored: <c>LUMIO_ENGINE_ROOT</c> first, then a
/// walk up the ancestors of the test output directory looking for a sibling <c>LumioGameEngine</c>. A
/// missing checkout fails loudly — skipping would let the contract drift behind a green test run.
/// </summary>
internal static class EngineWireContract
{
    internal const string GameplayCommandEnvelopeV1 = "gameplay-command-envelope-v1.json";

    private const string EngineRootVariable = "LUMIO_ENGINE_ROOT";
    private const string EngineDirectoryName = "LumioGameEngine";

    internal static JsonDocument Load(string contractFileName)
    {
        return JsonDocument.Parse(File.ReadAllBytes(ResolvePath(contractFileName)));
    }

    private static string ResolvePath(string contractFileName)
    {
        string relative = Path.Combine("engine", "wire", contractFileName);

        string? configured = Environment.GetEnvironmentVariable(EngineRootVariable);
        if (!string.IsNullOrWhiteSpace(configured))
        {
            string configuredPath = Path.GetFullPath(Path.Combine(configured, relative));
            if (File.Exists(configuredPath))
            {
                return configuredPath;
            }

            throw new InvalidOperationException(
                $"{EngineRootVariable} is set to '{configured}' but '{configuredPath}' does not exist. "
                + $"Point {EngineRootVariable} at a {EngineDirectoryName} checkout root.");
        }

        for (DirectoryInfo? ancestor = new(AppContext.BaseDirectory); ancestor is not null; ancestor = ancestor.Parent)
        {
            string candidate = Path.Combine(ancestor.FullName, EngineDirectoryName, relative);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException(
            $"No {EngineDirectoryName} checkout found next to any ancestor of '{AppContext.BaseDirectory}'. "
            + $"Clone it beside this repository (node clone-all.mjs clones the whole organisation) or set "
            + $"{EngineRootVariable} to an existing checkout root.");
    }
}
