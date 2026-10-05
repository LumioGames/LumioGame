using System;
using System.Collections.Generic;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Coordination;

namespace Lumio.Bomber.Gameplay;

/// <summary>One tick's SDK read projection and deterministic merged writes; never persisted.</summary>
public sealed class BomberVoxelFrame
{
    private readonly Dictionary<(ulong Section, int Cell), VoxelWriteEntry> _writes = new();
    private uint[]? _cells;
    private ulong _tick;
    private int _limit;

    public void Begin(ulong currentTick, IReadOnlyList<uint> sdkCells, IBomberConfig config)
    {
        ArgumentNullException.ThrowIfNull(sdkCells);
        ArgumentNullException.ThrowIfNull(config);
        if (_cells is not null) throw new InvalidOperationException("Previous voxel frame has not ended.");
        if (currentTick == 0 || config.Map.Width <= 0 || config.Map.Depth <= 0 ||
            config.Map.GroundLayer == config.Map.ObstacleLayer)
            throw new InvalidOperationException("Invalid voxel frame dimensions or tick.");
        int limit = checked(config.Map.Width * config.Map.Depth * 2);
        if (sdkCells.Count != limit) throw new InvalidOperationException("SDK voxel read is not the mapped two-layer frame.");
        var copy = new uint[limit];
        for (int i = 0; i < copy.Length; i++) copy[i] = sdkCells[i];
        _cells = copy;
        _tick = currentTick;
        _limit = limit;
        _writes.Clear();
    }

    public uint Read(int mappedCellIndex, ulong currentTick)
    {
        RequireCurrent(currentTick);
        if ((uint)mappedCellIndex >= (uint)_limit) throw new ArgumentOutOfRangeException(nameof(mappedCellIndex));
        return _cells![mappedCellIndex];
    }

    public void Merge(VoxelWriteEntry entry, ulong currentTick)
    {
        RequireCurrent(currentTick);
        if (entry.CellOffset < 0 || entry.CellOffset >= 4096 || entry.ExpectedSectionRevision == 0)
            throw new InvalidOperationException("Invalid voxel write cell or revision.");
        var key = (entry.SectionKey, entry.CellOffset);
        if (!_writes.ContainsKey(key) && _writes.Count == _limit)
            throw new InvalidOperationException("Voxel frame write budget exceeded.");
        // Caller must apply the declared system order. A later stage wins a same-cell conflict.
        _writes[key] = entry;
    }

    public VoxelWriteEntry[] OrderedWrites(ulong currentTick)
    {
        RequireCurrent(currentTick);
        var result = new List<VoxelWriteEntry>(_writes.Values);
        result.Sort(static (a, b) => a.SectionKey != b.SectionKey
            ? a.SectionKey.CompareTo(b.SectionKey) : a.CellOffset.CompareTo(b.CellOffset));
        return result.ToArray();
    }

    public void End()
    {
        _cells = null;
        _writes.Clear();
        _tick = 0;
        _limit = 0;
    }

    private void RequireCurrent(ulong currentTick)
    {
        if (_cells is null || _tick != currentTick)
            throw new InvalidOperationException("Voxel frame is absent or belongs to another tick.");
    }
}
