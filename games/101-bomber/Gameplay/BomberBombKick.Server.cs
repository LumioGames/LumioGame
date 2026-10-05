using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

internal static class BomberBombKick
{
    internal static bool TryTarget(World world, NetEntityId playerId, int range,
        out BomberBombState? target, out bool terrainAvailable)
    {
        target = null;
        VoxelCellQuery[]? cells = BomberTerrainRead.For(world);
        terrainAvailable = cells is not null;
        if (cells is null) return false;
        IBomberConfig config = BomberConfigBinding.For(world);
        Vector3 origin = world.Get<LogicTransform>(playerId).LocalPosition;
        (int dx, int dz) = Delta((BomberDirection)world.Get<BomberPlayerState>(playerId).Facing.Value);
        if (dx == 0 && dz == 0) return false;
        for (int step = 1; step <= range; step++)
        {
            int x = BomberMatchRules.CellX(origin) + dx * step;
            int z = BomberMatchRules.CellZ(origin) + dz * step;
            if (TerrainAt(config, cells, x, z) != KickCell.Open) return false;
            BomberBombState? bomb = BombAt(world, x, z);
            if (bomb is null) continue;
            if (bomb.ChildDirection.Value != 0 || bomb.KickDirection.Value != 0 || bomb.FuseEndTick.Value <= world.Tick) return false;
            target = bomb;
            return true;
        }
        return false;
    }

    internal static void Start(World world, BomberBombState bomb, BomberDirection direction, NetEntityId kickerId)
    {
        if (bomb.ChildDirection.Value != 0) throw new InvalidOperationException("Split children cannot be kicked.");
        BomberPlayerState kicker = world.Get<BomberPlayerState>(kickerId);
        using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.Bomb);
        BomberBombLifecycle.Send(world, bomb, definition, BomberHfsmDefinitions.EventId.Kick);
        bomb.KickDirection.Value = (int)direction;
        bomb.KickStartTick.Value = world.Tick;
        bomb.KickRange.Value = 0;
        Vector3 position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
        MoveAbility.WritePosition(world, bomb.Entity,
            new Vector3(BomberMatchRules.CellX(position) + 0.5f, position.Y,
                BomberMatchRules.CellZ(position) + 0.5f), nameof(BombSystem));
        world.Single<BomberPresentationJournal>().Append(world, "bomb_kicked",
            world.Single<BomberMatchState>().MatchId.Value, world.Single<BomberWorldRuntime>().AllocateEventSequence(),
            kicker.Participant.Value, kickerId, kicker.LifeGeneration.Value,
            sourceParticipant: bomb.Owner.Value, sourceLife: bomb.SourceLife.Value, entity: bomb.Entity,
            x: BomberMatchRules.CellX(position), z: BomberMatchRules.CellZ(position),
            data: new Dictionary<string, string> { ["direction"] = ((int)direction).ToString(CultureInfo.InvariantCulture) });
    }

    internal static void Advance(World world, NativeHfsmDefinition definition)
    {
        IBomberConfig config = BomberConfigBinding.For(world);
        BomberBombState[] moving = world.Each<BomberBombState>()
            .Where(bomb => bomb.Phase.Value == (int)BomberBombPhase.Fuse && bomb.KickDirection.Value != 0 &&
                bomb.KickStartTick.Value < world.Tick && bomb.FuseEndTick.Value > world.Tick)
            .OrderBy(bomb => bomb.Entity).ToArray();
        if (moving.Length == 0) return;
        VoxelCellQuery[]? cells = BomberTerrainRead.For(world);
        foreach (BomberBombState bomb in moving)
        {
            if (cells is null)
            {
                Stop(world, bomb, definition);
                continue;
            }
            Vector3 position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            (int dx, int dz) = Delta((BomberDirection)bomb.KickDirection.Value);
            if (dx == 0 && dz == 0) throw new InvalidOperationException("Invalid kicked bomb direction.");
            float remaining = config.Bomb.KickSpeedMilli / 1000f / config.Game.TickRateHz;
            while (remaining > 0.00001f)
            {
                float axis = dx == 0 ? position.Z : position.X;
                int sign = dx == 0 ? dz : dx;
                float nextCenter = sign > 0
                    ? MathF.Floor(axis - 0.5f + 0.00001f) + 1.5f
                    : MathF.Ceiling(axis - 0.5f - 0.00001f) - 0.5f;
                int x = dx == 0 ? BomberMatchRules.CellX(position) : (int)MathF.Floor(nextCenter);
                int z = dz == 0 ? BomberMatchRules.CellZ(position) : (int)MathF.Floor(nextCenter);
                KickCell terrain = TerrainAt(config, cells, x, z);
                if (terrain == KickCell.Blocked || BombAt(world, x, z, bomb.Entity) is not null)
                {
                    float previousCenter = nextCenter - sign;
                    position = dx == 0 ? new(position.X, position.Y, previousCenter) : new(previousCenter, position.Y, position.Z);
                    MoveAbility.WritePosition(world, bomb.Entity, position, nameof(BombSystem));
                    Stop(world, bomb, definition);
                    break;
                }
                float distance = MathF.Abs(nextCenter - axis);
                if (terrain == KickCell.Water && remaining >= Math.Max(0, distance - 0.5f))
                {
                    position = new Vector3(x + 0.5f, position.Y, z + 0.5f);
                    MoveAbility.WritePosition(world, bomb.Entity, position, nameof(BombSystem));
                    BomberBombLifecycle.Send(world, bomb, definition, BomberHfsmDefinitions.EventId.Extinguish);
                    break;
                }
                float travel = Math.Min(remaining, distance);
                position += new Vector3(dx * travel, 0, dz * travel);
                remaining -= travel;
                MoveAbility.WritePosition(world, bomb.Entity, position, nameof(BombSystem));
            }
        }
    }

    private static void Stop(World world, BomberBombState bomb, NativeHfsmDefinition definition)
    {
        BomberBombLifecycle.Send(world, bomb, definition, BomberHfsmDefinitions.EventId.KickStopped);
        bomb.KickDirection.Value = 0;
        bomb.KickRange.Value = 0;
    }

    private static BomberBombState? BombAt(World world, int x, int z, NetEntityId except = default)
    {
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            if (bomb.Entity == except || bomb.Phase.Value != (int)BomberBombPhase.Fuse) continue;
            Vector3 position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            if (BomberMatchRules.CellX(position) == x && BomberMatchRules.CellZ(position) == z) return bomb;
        }
        return null;
    }

    private enum KickCell { Blocked, Open, Water }

    private static KickCell TerrainAt(IBomberConfig config, VoxelCellQuery[] cells, int x, int z)
    {
        MapRow map = config.Map;
        if (x < map.BoundaryCells || z < map.BoundaryCells ||
            x >= map.Width - map.BoundaryCells || z >= map.Depth - map.BoundaryCells) return KickCell.Blocked;
        int index = z * map.Width + x;
        uint ground = cells[index].BlockId >> 8;
        uint obstacle = cells[map.Width * map.Depth + index].BlockId >> 8;
        if (obstacle != 0) return KickCell.Blocked;
        foreach (var row in config.Tables.Blocks.Rows)
            if (row.BlockType == ground && row.Enabled)
                return row.Name == "water" ? KickCell.Water : row.Walkable && row.Name != "air" ? KickCell.Open : KickCell.Blocked;
        return KickCell.Blocked;
    }

    private static (int X, int Z) Delta(BomberDirection direction) => direction switch
    {
        BomberDirection.Up => (0, -1), BomberDirection.Right => (1, 0),
        BomberDirection.Down => (0, 1), BomberDirection.Left => (-1, 0), _ => (0, 0),
    };
}
