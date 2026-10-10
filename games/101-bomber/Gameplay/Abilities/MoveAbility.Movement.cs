using System;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

public sealed partial class MoveAbility
{
    static partial void ExecuteMovement(World world, NetEntityId player,
        BomberDirection primary, BomberDirection secondary, bool turnPressed)
    {
        IBomberConfig config = BomberConfigBinding.For(world);
        BomberPlayerState memory = world.Get<BomberPlayerState>(player);
        BomberInputMemory.Prepare(world, memory);
        BomberDirection carryBuffer = turnPressed
            ? (config.Movement.TurnBufferTicks > 0 ? primary : BomberDirection.None)
            : (memory.PendingTurnUntilTick.Value > world.Tick
                ? (BomberDirection)memory.PendingTurnDirection.Value : BomberDirection.None);
        bool needsPrevious = carryBuffer != BomberDirection.None &&
            (primary == carryBuffer || primary == BomberDirection.None);
        BomberDirection previous = needsPrevious && world.Tick > 0 && memory.LastMoveTick.Value == world.Tick - 1
            ? (BomberDirection)memory.LastMoveDirection.Value : BomberDirection.None;
        memory.LastMoveTick.Value = world.Tick;
        memory.LastMoveDirection.Value = 0;
        if (turnPressed)
        {
            memory.PendingTurnDirection.Value = (int)primary;
            memory.PendingTurnUntilTick.Value = primary == BomberDirection.None ? 0 :
                checked(world.Tick + config.Movement.TurnBufferTicks);
        }
        BomberDirection buffered = memory.PendingTurnUntilTick.Value > world.Tick
            ? (BomberDirection)memory.PendingTurnDirection.Value : BomberDirection.None;
        long speedMilli = world.Get<AttributeComponent>(player)
            .GetCurrentValue(BomberAttributeNames.MovementSpeedMilli);
        if (speedMilli <= 0 || config.Game.TickRateHz <= 0) return;
        BomberMovementTerrain? cells = BomberTerrainRead.ForMovement(world);
        if (cells is null) return;

        Vector3 current = world.Get<LogicTransform>(player).LocalPosition;
        int tolerance = AssistTolerance(world, memory, config);
        ReadOnlySpan<bool> danger = BomberMovementDanger.Read(world, config, cells);
        if (!cells.IsAvailable) return;
        bool safe = !IsDangerous(danger, config.Map.Width, BomberMatchRules.CellX(current), BomberMatchRules.CellZ(current));
        BomberDirection carry = buffered != BomberDirection.None &&
            (primary == buffered || primary == BomberDirection.None) && Perpendicular(previous, buffered)
            ? previous : BomberDirection.None;
        Span<BomberDirection> choices = stackalloc BomberDirection[4]
            { buffered, primary, Perpendicular(primary, secondary) ? secondary : BomberDirection.None, carry };
        for (int i = 0; i < choices.Length; i++)
        {
            BomberDirection direction = choices[i];
            if (direction == BomberDirection.None || ContainsDirection(choices[..i], direction)) continue;
            bool advanced = TryAdvance(world, player, config, cells, current, direction, speedMilli, tolerance, danger,
                avoidDanger: i >= 2 && safe, out Vector3 next, out bool slid);
            if (!cells.IsAvailable) return;
            if (!advanced) continue;
            if (i == 0)
            {
                float cross = direction is BomberDirection.Left or BomberDirection.Right ? next.Z : next.X;
                memory.PendingTurnUntilTick.Value = MathF.Abs(cross - (MathF.Floor(cross) + 0.5f)) > 0.0001f
                    ? checked(world.Tick + 2UL) : 0;
                if (memory.PendingTurnUntilTick.Value == 0) memory.PendingTurnDirection.Value = 0;
            }
            if (slid)
            {
                memory.LastAssistTick.Value = world.Tick;
                memory.AssistToleranceMilli.Value = tolerance;
            }
            memory.LastMoveDirection.Value = (int)direction;
            WritePosition(world, player, next, nameof(MoveAbility));
            return;
        }
    }

    private static bool ContainsDirection(ReadOnlySpan<BomberDirection> choices, BomberDirection direction)
    {
        foreach (BomberDirection choice in choices)
            if (choice == direction) return true;
        return false;
    }

    private static int AssistTolerance(World world, BomberPlayerState memory, IBomberConfig config)
    {
        ulong previous = memory.LastAssistTick.Value;
        if (previous != 0 && world.Tick > 0 && previous == world.Tick - 1)
            return memory.AssistToleranceMilli.Value;
        bool recent = previous != 0 && previous <= world.Tick && world.Tick - previous <= config.Movement.RepeatWindowTicks;
        return recent ? config.Movement.RepeatAssistMilli : config.Movement.CornerAssistMilli;
    }

    private static bool TryAdvance(World world, NetEntityId player, IBomberConfig config,
        BomberMovementTerrain cells, Vector3 current, BomberDirection direction, long speedMilli,
        int toleranceMilli, ReadOnlySpan<bool> danger, bool avoidDanger, out Vector3 next, out bool slid)
    {
        next = current;
        slid = false;
        (int dx, int dz) = Delta(direction);
        if (dx == 0 && dz == 0) return false;
        bool alongX = dx != 0;
        int sign = alongX ? dx : dz;
        double axis = alongX ? current.X : current.Z;
        float cross = alongX ? current.Z : current.X;
        int crossCell = (int)MathF.Floor(cross);
        double offset = cross - (crossCell + 0.5d);

        int cell = (int)Math.Floor(axis);
        int x = alongX ? cell : crossCell;
        int z = alongX ? crossCell : cell;
        if (!TryTerrain(config, cells, x, z, out bool currentWater)) return false;
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
            if (IsFuseBombAt(world, bomb, x, z) && !CanLeaveOwnBomb(world, player, bomb))
                return false;

        double seconds = 1d / config.Game.TickRateHz;
        double drySpeed = speedMilli / 1000d;
        if (Math.Abs(offset) > 0.0001d)
        {
            int targetX = alongX ? cell + sign : crossCell;
            int targetZ = alongX ? crossCell : cell + sign;
            if (Math.Abs(offset) > toleranceMilli / 1000d ||
                !TryTerrain(config, cells, targetX, targetZ, out _) || HasFuseBomb(world, targetX, targetZ) ||
                IsDangerous(danger, config.Map.Width, targetX, targetZ)) return false;
            double speed = drySpeed * (currentWater ? config.Movement.WaterSpeedPermille / 1000d : 1d);
            if (speed <= 0) return false;
            double correction = Math.Min(Math.Abs(offset), speed * seconds);
            cross = (float)(cross - Math.Sign(offset) * correction);
            seconds = Math.Max(0, seconds - correction / speed);
            slid = correction > 0;
        }
        while (seconds > 0)
        {
            x = alongX ? cell : crossCell;
            z = alongX ? crossCell : cell;
            if (!TryTerrain(config, cells, x, z, out bool water)) break;
            double speed = drySpeed * (water ? config.Movement.WaterSpeedPermille / 1000d : 1d);
            if (speed <= 0) break;
            double center = cell + 0.5d;
            bool toBoundary = sign * (center - axis) <= 0;
            double target;
            if (!toBoundary)
                target = center;
            else
            {
                int nextCell = cell + sign;
                int nextX = alongX ? nextCell : crossCell;
                int nextZ = alongX ? crossCell : nextCell;
                if (!TryTerrain(config, cells, nextX, nextZ, out _) ||
                    HasFuseBomb(world, nextX, nextZ) ||
                    (avoidDanger && IsDangerous(danger, config.Map.Width, nextX, nextZ)))
                    break;
                target = sign > 0 ? cell + 1 : cell;
            }
            double duration = Math.Abs(target - axis) / speed;
            if (seconds < duration)
            {
                axis += sign * speed * seconds;
                break;
            }
            axis = target;
            seconds -= duration;
            // Carry directional ownership across an exact boundary, including a
            // zero-distance negative crossing; floor(axis) still names its source.
            if (toBoundary) cell += sign;
        }
        next = alongX ? new Vector3((float)axis, current.Y, cross) : new Vector3(cross, current.Y, (float)axis);
        return next != current;
    }

    private static bool TryTerrain(IBomberConfig config, BomberMovementTerrain cells, int x, int z, out bool water)
    {
        water = false;
        MapRow map = config.Map;
        if (x < map.BoundaryCells || z < map.BoundaryCells ||
            x >= map.Width - map.BoundaryCells || z >= map.Depth - map.BoundaryCells) return false;
        int index = z * map.Width + x;
        uint ground = cells[index].BlockId >> 8;
        uint obstacle = cells[map.Width * map.Depth + index].BlockId >> 8;
        if (obstacle != 0 || ground == 0) return false;
        foreach (BlocksRow block in config.Tables.Blocks.Rows)
            if (block.BlockType == ground && block.Enabled && block.Walkable && block.Name != "air")
            {
                water = block.Name == "water";
                return true;
            }
        return false;
    }

    private static bool HasFuseBomb(World world, int x, int z)
    {
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
            if (IsFuseBombAt(world, bomb, x, z)) return true;
        return false;
    }

    private static bool IsFuseBombAt(World world, BomberBombState bomb, int x, int z)
    {
        if (bomb.Phase.Value != (int)BomberBombPhase.Fuse) return false;
        Vector3 position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
        return BomberMatchRules.CellX(position) == x && BomberMatchRules.CellZ(position) == z;
    }

    private static bool CanLeaveOwnBomb(World world, NetEntityId playerId, BomberBombState bomb)
    {
        BomberPlayerState player = world.Get<BomberPlayerState>(playerId);
        if (bomb.KickStartTick.Value != 0 || bomb.KickDirection.Value != 0 ||
            player.Participant.Value.IsDefault || player.LifeGeneration.Value == 0 ||
            bomb.Owner.Value != player.Participant.Value || bomb.SourceLife.Value != playerId ||
            bomb.SourceLifeGeneration.Value != player.LifeGeneration.Value ||
            !world.IsLive(player.Participant.Value)) return false;
        BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
        return participant.CurrentLife.Value == playerId &&
            participant.LifeGeneration.Value == player.LifeGeneration.Value;
    }

    private static bool IsDangerous(ReadOnlySpan<bool> danger, int width, int x, int z) =>
        x >= 0 && z >= 0 && x < width && z < danger.Length / width && danger[z * width + x];

    private static bool Perpendicular(BomberDirection primary, BomberDirection secondary)
    {
        (int px, int pz) = Delta(primary);
        (int sx, int sz) = Delta(secondary);
        return (px != 0 || pz != 0) && (sx != 0 || sz != 0) && px * sx + pz * sz == 0;
    }

    private static (int X, int Z) Delta(BomberDirection direction) => direction switch
    {
        BomberDirection.Up => (0, -1), BomberDirection.Right => (1, 0),
        BomberDirection.Down => (0, 1), BomberDirection.Left => (-1, 0), _ => (0, 0),
    };
}

