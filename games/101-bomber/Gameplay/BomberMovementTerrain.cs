using System;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

internal sealed class BomberMovementTerrain
{
    private readonly VoxelCellQuery[]? cells;
    private readonly HostVoxelWorldAdapter? adapter;
    private readonly MapRow map;
    private readonly int area;

    internal BomberMovementTerrain(VoxelCellQuery[] cells) => this.cells = cells;

    internal BomberMovementTerrain(HostVoxelWorldAdapter adapter, MapRow map)
    {
        this.adapter = adapter;
        this.map = map;
        area = checked(map.Width * map.Depth);
    }

    internal bool IsAvailable { get; private set; } = true;

    internal VoxelCellQuery this[int index]
    {
        get
        {
            VoxelCellQuery cell;
            if (cells is not null)
                cell = cells[index];
            else
            {
                if (index < 0 || index >= checked(area * 2)) throw new ArgumentOutOfRangeException(nameof(index));
                int layer = index / area;
                int at = index % area;
                int x = at % map.Width, z = at / map.Width;
                int y = layer == 0 ? map.GroundLayer : map.ObstacleLayer;
                // Repeated accesses remain real working reads in this input's trace.
                cell = adapter!.Read(VoxelPackedSection.Encode(x >> 4, (byte)(y >> 4), z >> 4),
                    ((y & 15) << 8) | ((z & 15) << 4) | (x & 15));
            }
            if (!cell.HasBlockId || cell.Presence is not (VoxelPresence.Ready or VoxelPresence.Unchanged))
                IsAvailable = false;
            return cell;
        }
    }
}
