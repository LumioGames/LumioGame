using System;
using System.Runtime.CompilerServices;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

/// <summary>Disposable-world scratch, rebuilt from authoritative rows and Native cells for each input.</summary>
internal static class BomberMovementDanger
{
    private static readonly ConditionalWeakTable<World, Scratch> Work = new();

    internal static ReadOnlySpan<bool> Read(World world, IBomberConfig config, BomberMovementTerrain terrain)
    {
        Scratch scratch = Work.GetValue(world, static _ => new Scratch());
        scratch.Reset(checked(config.Map.Width * config.Map.Depth), config.ObjectBudgets.BombCapacity);
        ulong window = Ticks.FromMilliseconds(config.Bomb.DangerMs, config.Game.TickRateHz);
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            if (bomb.Phase.Value != (int)BomberBombPhase.Fuse &&
                (bomb.Phase.Value != (int)BomberBombPhase.Danger || bomb.DangerUntilTick.Value <= world.Tick)) continue;
            if (scratch.Count == scratch.Rows.Length)
                throw new InvalidOperationException("Movement danger source count exceeds the configured bomb budget.");
            int row = scratch.Count++;
            scratch.Rows[row] = bomb;
            var position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            scratch.X[row] = BomberMatchRules.CellX(position);
            scratch.Z[row] = BomberMatchRules.CellZ(position);
            if (!Inside(config.Map, scratch.X[row], scratch.Z[row])) continue;
            int cell = scratch.Z[row] * config.Map.Width + scratch.X[row];
            scratch.Next[row] = scratch.First[cell];
            scratch.First[cell] = row;
        }
        for (int row = 0; row < scratch.Count; row++)
        {
            BomberBombState bomb = scratch.Rows[row]!;
            if (bomb.Phase.Value == (int)BomberBombPhase.Fuse)
            {
                if (bomb.FuseEndTick.Value <= world.Tick || bomb.FuseEndTick.Value - world.Tick <= window)
                    scratch.Enqueue(row);
            }
            else
            {
                int x = scratch.X[row], z = scratch.Z[row];
                Mark(scratch, config.Map, x, z);
                for (int direction = 0; direction < 4; direction++)
                {
                    (int dx, int dz) = Delta(direction);
                    int reach = direction switch { 0 => bomb.ReachUp.Value, 1 => bomb.ReachRight.Value,
                        2 => bomb.ReachDown.Value, _ => bomb.ReachLeft.Value };
                    for (int step = 1; step <= reach; step++)
                    {
                        int atX = x + dx * step, atZ = z + dz * step;
                        if (!Inside(config.Map, atX, atZ)) break;
                        Mark(scratch, config.Map, atX, atZ);
                    }
                }
            }
        }
        // Every real fuse enters this queue at most once. Cell links avoid scanning all
        // bombs for every ray and close the entire chain within this same read.
        for (int head = 0; head < scratch.Tail; head++)
        {
            int row = scratch.Queue[head];
            BomberBombState bomb = scratch.Rows[row]!;
            int x = scratch.X[row], z = scratch.Z[row];
            Mark(scratch, config.Map, x, z);
            for (int direction = 0; direction < 4; direction++)
            {
                (int dx, int dz) = Delta(direction);
                for (int step = 1; step <= bomb.Power.Value; step++)
                {
                    int atX = x + dx * step, atZ = z + dz * step;
                    if (!Inside(config.Map, atX, atZ)) break;
                    int cell = atZ * config.Map.Width + atX;
                    BlocksRow obstacle = Block(config, terrain[scratch.Danger.Length + cell].BlockId >> 8);
                    BlocksRow ground = Block(config, terrain[cell].BlockId >> 8);
                    if (obstacle.Id == 0 || ground.Id == 0 || obstacle.SparseBinding != "none") break;
                    if (obstacle.Destructible)
                    {
                        // The actual receipt-driven ray uses this as a positive flag:
                        // each successful destruction continues with its remaining range.
                        if (bomb.PierceLayers.Value <= 0) break;
                    }
                    else if (obstacle.BlastStop && !obstacle.CoverBeforeStop) break;
                    Mark(scratch, config.Map, atX, atZ);
                    if ((!obstacle.Destructible && obstacle.BlastStop) || ground.BlastStop) break;
                }
            }
        }
        return scratch.Danger;
    }

    private static void Mark(Scratch scratch, MapRow map, int x, int z)
    {
        if (!Inside(map, x, z)) return;
        int cell = z * map.Width + x;
        scratch.Danger[cell] = true;
        for (int row = scratch.First[cell]; row >= 0; row = scratch.Next[row])
            if (scratch.Rows[row]!.Phase.Value == (int)BomberBombPhase.Fuse) scratch.Enqueue(row);
    }

    private static bool Inside(MapRow map, int x, int z) => x >= map.BoundaryCells && z >= map.BoundaryCells &&
        x < map.Width - map.BoundaryCells && z < map.Depth - map.BoundaryCells;

    private static BlocksRow Block(IBomberConfig config, uint kind)
    {
        foreach (BlocksRow block in config.Tables.Blocks.Rows)
            if (block.BlockType == kind) return block;
        return default;
    }

    private static (int X, int Z) Delta(int direction) => direction switch
    { 0 => (0, -1), 1 => (1, 0), 2 => (0, 1), _ => (-1, 0) };

    private sealed class Scratch
    {
        internal BomberBombState?[] Rows = Array.Empty<BomberBombState?>();
        internal int[] First = Array.Empty<int>(), Next = Array.Empty<int>(), X = Array.Empty<int>(), Z = Array.Empty<int>(), Queue = Array.Empty<int>();
        internal bool[] Danger = Array.Empty<bool>(), Queued = Array.Empty<bool>();
        internal int Count, Tail;

        internal void Reset(int area, int capacity)
        {
            if (Danger.Length != area) { Danger = new bool[area]; First = new int[area]; }
            if (Rows.Length != capacity)
            {
                Rows = new BomberBombState?[capacity]; Next = new int[capacity];
                X = new int[capacity]; Z = new int[capacity]; Queue = new int[capacity]; Queued = new bool[capacity];
                Count = 0;
            }
            Array.Clear(Rows, 0, Count); Array.Clear(Queued, 0, Queued.Length); Array.Clear(Danger, 0, Danger.Length); Array.Fill(First, -1);
            Count = Tail = 0;
        }

        internal void Enqueue(int row)
        {
            if (Queued[row]) return;
            Queued[row] = true; Queue[Tail++] = row;
        }
    }
}
