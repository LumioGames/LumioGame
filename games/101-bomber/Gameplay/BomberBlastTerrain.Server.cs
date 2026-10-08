using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

internal static class BomberBlastTerrain
{
    private static readonly (int X, int Z)[] Directions = { (0, -1), (1, 0), (0, 1), (-1, 0) };

    internal static List<(int X, int Z)> Trace(World world, BomberBombState bomb)
    {
        bomb.ValidateStorage();
        bomb.RequireInitialTraversal();
        var position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
        int x = BomberMatchRules.CellX(position), z = BomberMatchRules.CellZ(position);
        // The bomb owns its origin contact; only terrain-dependent arms wait for a read.
        var cells = new List<(int X, int Z)> { (x, z) };
        bomb.ReachUp.Value = bomb.ReachRight.Value = bomb.ReachDown.Value = bomb.ReachLeft.Value = 0;
        if (BomberTerrainRead.For(world) is null)
        {
            for (int direction = 0; direction < 4; direction++)
                bomb.TerrainContinuations.Add(BomberTerrainTransactions.Encode(new BomberTerrainContinuation(
                    x, z, direction, bomb.Power.Value, BomberTerrainTransactions.Family(bomb).ToHex(),
                    bomb.ExplodedAtTick.Value, Unstarted: true)));
            return cells;
        }
        for (int direction = 0; direction < 4; direction++) Ray(world, bomb, x, z, direction, bomb.Power.Value, cells);
        return cells;
    }

    internal static List<(int X, int Z)> Resume(World world, BomberBombState bomb)
    {
        bomb.ValidateStorage();
        var cells = new List<(int X, int Z)>();
        var pending = Enumerable.Range(0, bomb.TerrainContinuations.Count).Select(i =>
            BomberTerrainTransactions.Decode<BomberTerrainContinuation>(bomb.TerrainContinuations[i])).ToArray();
        foreach (var ray in pending)
        {
            if (ray.Direction is < 0 or > 3 || ray.Remaining < 0 || ray.Remaining > bomb.Power.Value ||
                ray.Family != BomberTerrainTransactions.Family(bomb).ToHex() || ray.Occurred != bomb.ExplodedAtTick.Value)
                throw new InvalidOperationException("Terrain continuation lost its original source.");
            bomb.RequireTraversalContinuation(ray);
        }
        var config = BomberConfigBinding.For(world);
        var read = BomberTerrainRead.For(world);
        if (read is null) return cells;
        bomb.TerrainContinuations.Clear();
        int area = checked(config.Map.Width * config.Map.Depth);
        foreach (var ray in pending)
        {
            if (ray.Unstarted)
            {
                Ray(world, bomb, ray.X, ray.Z, ray.Direction, ray.Remaining, cells);
                continue;
            }
            int cell = checked(ray.Z * config.Map.Width + ray.X);
            var obstacle = config.Tables.Blocks.Rows.SingleOrDefault(r => r.BlockType == read[area + cell].BlockId >> 8);
            var ground = config.Tables.Blocks.Rows.SingleOrDefault(r => r.BlockType == read[cell].BlockId >> 8);
            // The receipt owns the old destruction only. A replacement is a new obstacle.
            if (obstacle.Id == 0 || ground.Id == 0 || obstacle.Destructible ||
                (obstacle.BlastStop && !obstacle.CoverBeforeStop))
            { bomb.FinishTraversalArm(ray.Direction); continue; }
            cells.Add((ray.X, ray.Z));
            Reach(world, bomb, ray.Direction, ray.X, ray.Z);
            if (obstacle.BlastStop || ground.BlastStop)
            { bomb.FinishTraversalArm(ray.Direction); continue; }
            Ray(world, bomb, ray.X, ray.Z, ray.Direction, ray.Remaining, cells);
        }
        return cells;
    }

    private static void Ray(World world, BomberBombState bomb, int x, int z, int direction, int remaining, List<(int X, int Z)> result)
    {
        var config = BomberConfigBinding.For(world);
        VoxelCellQuery[]? read = BomberTerrainRead.For(world);
        if (read is null)
        {
            bomb.TerrainContinuations.Add(BomberTerrainTransactions.Encode(new BomberTerrainContinuation(
                x, z, direction, remaining, BomberTerrainTransactions.Family(bomb).ToHex(),
                bomb.ExplodedAtTick.Value, Unstarted: bomb.TraversalDistance(x, z, direction) == 0)));
            return;
        }
        int area = checked(config.Map.Width * config.Map.Depth);
        var delta = Directions[direction];
        for (int step = 1; step <= remaining; step++)
        {
            int atX = x + delta.X * step, atZ = z + delta.Z * step;
            if (atX < config.Map.BoundaryCells || atZ < config.Map.BoundaryCells ||
                atX >= config.Map.Width - config.Map.BoundaryCells || atZ >= config.Map.Depth - config.Map.BoundaryCells) break;
            int cell = atZ * config.Map.Width + atX;
            var obstacle = config.Tables.Blocks.Rows.SingleOrDefault(r => r.BlockType == read[area + cell].BlockId >> 8);
            var ground = config.Tables.Blocks.Rows.SingleOrDefault(r => r.BlockType == read[cell].BlockId >> 8);
            if (obstacle.Id == 0 || ground.Id == 0) break;
            if (obstacle.Destructible)
            {
                BomberTerrainTransactions.TryDestroy(world, bomb, atX, atZ, direction,
                    bomb.PierceLayers.Value > 0 ? remaining - step : 0, out bool retryArm);
                if (retryArm)
                {
                    // Competition acquired no new mutation. Retain the accepted cursor
                    // and its remaining range instead of replaying the original prefix.
                    var origin = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
                    bool unstarted = x == BomberMatchRules.CellX(origin) && z == BomberMatchRules.CellZ(origin);
                    bomb.TerrainContinuations.Add(BomberTerrainTransactions.Encode(new BomberTerrainContinuation(
                        x, z, direction, remaining, BomberTerrainTransactions.Family(bomb).ToHex(),
                        bomb.ExplodedAtTick.Value, Unstarted: unstarted)));
                }
                else if (bomb.TraversalIsReady(direction)) bomb.FinishTraversalArm(direction);
                return;
            }
            if (obstacle.BlastStop && !obstacle.CoverBeforeStop) break;
            result.Add((atX, atZ)); Reach(world, bomb, direction, atX, atZ);
            if (obstacle.BlastStop || ground.BlastStop) break;
        }
        bomb.FinishTraversalArm(direction);
    }

    private static void Reach(World world, BomberBombState bomb, int direction, int x, int z)
    {
        var position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
        int distance = Math.Abs(x - BomberMatchRules.CellX(position)) + Math.Abs(z - BomberMatchRules.CellZ(position));
        switch (direction)
        {
            case 0: bomb.ReachUp.Value = Math.Max(bomb.ReachUp.Value, distance); break;
            case 1: bomb.ReachRight.Value = Math.Max(bomb.ReachRight.Value, distance); break;
            case 2: bomb.ReachDown.Value = Math.Max(bomb.ReachDown.Value, distance); break;
            case 3: bomb.ReachLeft.Value = Math.Max(bomb.ReachLeft.Value, distance); break;
        }
    }
}
