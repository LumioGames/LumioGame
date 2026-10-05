using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.RegularExpressions;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Config;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Client.Spectator;

/// <summary>One verified client export shared by pre-admission UI and every replica world.</summary>
public sealed class BomberClientConfig
{
    private readonly IGameConfigExportBinding _entry;
    private readonly ConfigSnapshot _snapshot;

    private BomberClientConfig(IGameConfigExportBinding entry, ConfigSnapshot snapshot)
    {
        _entry = entry;
        _snapshot = snapshot;
        Display = (IBomberConfig)entry.Project(snapshot);
    }

    public IBomberConfig Display { get; }

    public static BomberClientConfig Load(IConfigArtifactBytes source)
    {
        if (source is null) throw new ArgumentNullException(nameof(source));
        var entry = GeneratedRegistry.Instance.CreateGameplayConfigBinding()
            ?? throw new InvalidOperationException("Bomber registry declares no gameplay config binding.");
        var frozen = new FrozenArtifact(source);
        var result = LumioConfigLoader.Load(frozen, ConfigTarget.Client,
            requiredTables: entry.RequiredTables, typedTableFactory: entry.CreateTypedTables);
        frozen.Seal();
        if (!result.IsSuccess) throw new InvalidOperationException(result.ErrorCode + ": " + result.ErrorMessage);
        return new BomberClientConfig(entry, result.CreateSnapshot(new ConfigSnapshotId(1)));
    }

    public WorldConfigBinding CreateWorldBinding()
    {
        var module = ConfigModule.Create();
        if (!module.Stage(_snapshot).Staged || !module.ActivateAtBarrier(default).Activated)
            throw new InvalidOperationException("Bomber config activation failed.");
        return new WorldConfigBinding(module, GeneratedRegistry.Instance, _entry);
    }

    public static BomberClientConfig FromBundle(string json)
    {
        using var document = JsonDocument.Parse(json);
        var files = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        foreach (var item in document.RootElement.GetProperty("files").EnumerateObject())
        {
            if (item.Name != "manifest.json" && !Regex.IsMatch(item.Name, @"\Aclient/[a-zA-Z0-9_-]+\.json\z"))
                throw new FormatException("client_config_path_invalid");
            if (!files.TryAdd(item.Name, Convert.FromBase64String(item.Value.GetString()
                ?? throw new FormatException("client_config_bytes_missing"))))
                throw new FormatException("client_config_duplicate_file");
        }
        return Load(new BundleArtifact(files));
    }

    private sealed class BundleArtifact(Dictionary<string, byte[]> files) : IConfigArtifactBytes
    {
        public ReadOnlyMemory<byte> ReadFile(string path) => files.TryGetValue(path, out var bytes) ? bytes : ReadOnlyMemory<byte>.Empty;
    }

    // Loader provenance can retain the artifact. Freeze the exact bytes it read,
    // so a reconnect cannot silently observe a changed export on disk.
    private sealed class FrozenArtifact(IConfigArtifactBytes source) : IConfigArtifactBytes
    {
        private IConfigArtifactBytes? _source = source;
        private readonly Dictionary<string, byte[]> _files = new(StringComparer.Ordinal);
        public void Seal() => _source = null;
        public ReadOnlyMemory<byte> ReadFile(string path)
        {
            if (_files.TryGetValue(path, out var bytes)) return bytes;
            if (_source is null) return ReadOnlyMemory<byte>.Empty;
            bytes = _source.ReadFile(path).ToArray();
            _files.Add(path, bytes);
            return bytes;
        }
    }
}
