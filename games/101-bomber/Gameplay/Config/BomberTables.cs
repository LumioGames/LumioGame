using System;
using System.Collections.Generic;
using System.IO;

namespace Lumio.Bomber.Gameplay.Config;

/// <summary>Export directory resolution for the World config binding.</summary>
public static class BomberTables
{
    public const string ConfigDirVariable = "LUMIO_CONFIG_DIR";

    /// <summary>
    /// Resolves a LumioConfig export directory. Override and <see cref="ConfigDirVariable"/> win.
    /// The assembly output <c>config/manifest.json</c> is the only fallback — parent directories are not scanned.
    /// </summary>
    public static string ResolveDirectory(string? overrideDirectory = null, IReadOnlyDictionary<string, string?>? environment = null)
    {
        if (!string.IsNullOrWhiteSpace(overrideDirectory))
            return Path.GetFullPath(overrideDirectory);

        string? fromEnv = ReadEnv(environment, ConfigDirVariable);
        if (!string.IsNullOrWhiteSpace(fromEnv))
            return Path.GetFullPath(fromEnv);

        string nextToAssembly = Path.Combine(AppContext.BaseDirectory, "config");
        if (File.Exists(Path.Combine(nextToAssembly, "manifest.json")))
            return Path.GetFullPath(nextToAssembly);

        throw new InvalidOperationException(
            "Bomber config export was not found. Set " + ConfigDirVariable + " to a LumioConfig export root that contains manifest.json.");
    }

    private static string? ReadEnv(IReadOnlyDictionary<string, string?>? environment, string name)
    {
        if (environment is not null && environment.TryGetValue(name, out string? value))
            return value;
        return Environment.GetEnvironmentVariable(name);
    }
}
