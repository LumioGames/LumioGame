using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

public sealed partial class PlaceBombAbility
{
    private static partial bool CanProduceFrenzy(World world, BomberParticipantState participant, out string? failureCode) =>
        BomberFrenzy.CanProduce(world, participant, out failureCode);

    private static partial EntityOrder CreateFrenzyBomb(World world, BomberParticipantState participant,
        BomberPlayerState life, int power, ulong nextChain, int x, int z, float y, ulong fuseEnd) =>
        BomberFrenzy.StageAndCreate(world, participant, life, power, nextChain, x, z, y, fuseEnd);

    private static partial bool CanReserve(World world, BomberWorldRuntime runtime,
        ulong matchId, int cell, NetEntityId participant, int futureChildren) => BomberBombAdmissions.CanCreatePrimary(world, futureChildren) &&
        runtime.CanReserveBombPlacement(world.Tick, matchId, cell, participant, BomberConfigBinding.For(world));

    private static partial EntityOrder CreateBomb(World world, int futureChildren) => BomberBombAdmissions.CreatePrimary(world, futureChildren);

    private static partial void Reserve(World world, BomberWorldRuntime runtime,
        ulong matchId, int cell, NetEntityId participant) => runtime.ReserveBombPlacement(
            world.Tick, matchId, cell, participant, BomberConfigBinding.For(world));

    internal static partial bool IsPlacableTerrain(World world, int x, int z)
    {
        IBomberConfig config = BomberConfigBinding.For(world);
        MapRow map = config.Map;
        if (x < map.BoundaryCells || z < map.BoundaryCells ||
            x >= map.Width - map.BoundaryCells || z >= map.Depth - map.BoundaryCells)
            return false;
        VoxelCellQuery[]? cells = BomberTerrainRead.For(world);
        if (cells is null) return false;
        int area = checked(map.Width * map.Depth);
        int index = z * map.Width + x;
        if ((cells[area + index].BlockId >> 8) != 0) return false;
        uint ground = cells[index].BlockId >> 8;
        foreach (BlocksRow block in config.Tables.Blocks.Rows)
            if (block.BlockType == ground && block.Enabled && block.Walkable &&
                block.Name is not ("air" or "water")) return true;
        return false;
    }
}
