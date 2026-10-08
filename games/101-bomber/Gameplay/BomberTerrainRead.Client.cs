using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

internal static class BomberTerrainRead
{
    internal static BomberMovementTerrain? ForMovement(World world)
    {
        HostVoxelWorldAdapter? adapter = VoxelGameplayBinding.Resolve(world.Manager);
        MapRow map = BomberConfigBinding.For(world).Map;
        if (adapter is null || map.GroundLayer < 0 || map.ObstacleLayer < 0 ||
            map.GroundLayer > 255 || map.ObstacleLayer > 255 || map.Width <= 0 || map.Depth <= 0)
            return null;
        return new BomberMovementTerrain(adapter, map);
    }

    internal static VoxelCellQuery[]? For(World world)
    {
        HostVoxelWorldAdapter? adapter = VoxelGameplayBinding.Resolve(world.Manager);
        MapRow map = BomberConfigBinding.For(world).Map;
        if (adapter is null || map.GroundLayer < 0 || map.ObstacleLayer < 0 ||
            map.GroundLayer > 255 || map.ObstacleLayer > 255 || map.Width <= 0 || map.Depth <= 0)
            return null;
        int area = checked(map.Width * map.Depth);
        var addresses = new (ulong SectionKey, int CellOffset)[checked(area * 2)];
        for (int layer = 0; layer < 2; layer++)
        for (int z = 0; z < map.Depth; z++)
        for (int x = 0; x < map.Width; x++)
        {
            int y = layer == 0 ? map.GroundLayer : map.ObstacleLayer;
            addresses[layer * area + z * map.Width + x] =
                (VoxelPackedSection.Encode(x >> 4, (byte)(y >> 4), z >> 4),
                    ((y & 15) << 8) | ((z & 15) << 4) | (x & 15));
        }
        // Each prediction replay records the real Native reads. A cached frame
        // would omit its read trace and could retain cells from an older authority group.
        VoxelCellQuery[] cells = adapter.Read(addresses);
        if (cells.Length != addresses.Length) return null;
        foreach (VoxelCellQuery cell in cells)
            if (!cell.HasBlockId || cell.Presence is not (VoxelPresence.Ready or VoxelPresence.Unchanged))
                return null;
        return cells;
    }
}
