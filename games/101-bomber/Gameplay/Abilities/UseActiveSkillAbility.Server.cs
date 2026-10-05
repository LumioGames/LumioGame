using System;
using System.Collections.Generic;
using System.Globalization;
using System.Numerics;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

public sealed partial class UseActiveSkillAbility
{
    static partial void ValidateAuthoritative(World world, NetEntityId playerId, uint skillId,
        SkillLevelsRow level, ref string? failureCode)
    {
        if (skillId == 3u)
        {
            if (level.RangeCells <= 0 || level.CooldownMs == 0)
                failureCode = "active_skill_unavailable";
            else if (!TryBlinkLanding(world, playerId, level.RangeCells, out _, out _, out bool terrainAvailable))
                failureCode = terrainAvailable ? "skill_no_landing" : "skill_terrain_unavailable";
        }
        else if (skillId == 2u && (level.DurationMs == 0 || level.CooldownMs == 0))
            failureCode = "active_skill_unavailable";
        else if (skillId == 4u)
        {
            var skill = world.Get<BomberSkillState>(playerId);
            if (level.DurationMs == 0 || level.CooldownMs == 0 ||
                !BomberSpecialBombResolver.TryResolveSlot(BomberConfigBinding.For(world), skill, out int kind))
                failureCode = "active_skill_unavailable";
            else if (kind == (int)BomberBombKind.ReservedFire &&
                !BomberFavoriteFireZones.CanReserve(world, playerId,
                    Ticks.FromMilliseconds(level.DurationMs, BomberConfigBinding.For(world).Game.TickRateHz), out failureCode))
                return;
        }
        else if (skillId == 13u)
        {
            if (level.RangeCells <= 0 || level.CooldownMs == 0 || level.FavoriteCooldownMs == 0)
                failureCode = "active_skill_unavailable";
            else if (!BomberBombKick.TryTarget(world, playerId, level.RangeCells, out _, out bool terrainAvailable))
                failureCode = terrainAvailable ? "skill_no_target" : "skill_terrain_unavailable";
        }
    }

    static partial void ExecuteAuthoritative(World world, NetEntityId playerId,
        BomberSkillState state, SkillLevelsRow level)
    {
        ulong cooldown = Ticks.FromMilliseconds(level.CooldownMs, BomberConfigBinding.For(world).Game.TickRateHz);
        var before = world.Get<LogicTransform>(playerId).LocalPosition;
        int fromX = BomberMatchRules.CellX(before);
        int fromZ = BomberMatchRules.CellZ(before);
        ulong duration = 0;
        if (state.ActiveSkillId.Value == 3u)
        {
            if (!TryBlinkLanding(world, playerId, level.RangeCells, out int landingX, out int landingZ, out _)) return;
            MoveAbility.WritePosition(world, playerId,
                new Vector3(landingX + 0.5f, before.Y, landingZ + 0.5f), nameof(MoveAbility));
            BomberInputMemory.ClearMovement(world.Get<BomberPlayerState>(playerId));
            state.TeleportSequence.Value = checked(state.TeleportSequence.Value + 1);
            if (BomberSpecialBombResolver.TryResolveSlot(BomberConfigBinding.For(world), state, out int kind) && kind == 7)
                BomberBombButton.DetonateOwned(world, world.Get<BomberPlayerState>(playerId).Participant.Value);
        }
        else if (state.ActiveSkillId.Value == 13u)
        {
            if (!BomberBombKick.TryTarget(world, playerId, level.RangeCells, out BomberBombState? target, out _) || target is null) return;
            BomberBombKick.Start(world, target, (BomberDirection)world.Get<BomberPlayerState>(playerId).Facing.Value, playerId);
            if (state.BombSkillId.Value == 7u &&
                BomberSpecialBombResolver.TryResolveSlot(BomberConfigBinding.For(world), state, out int kind) &&
                kind == (int)BomberBombKind.Pierce)
                cooldown = Ticks.FromMilliseconds(level.FavoriteCooldownMs, BomberConfigBinding.For(world).Game.TickRateHz);
        }
        else if (state.ActiveSkillId.Value == 4u)
        {
            BomberFiniteSkills.SubmitAura(world, playerId, state, level, fromX, fromZ);
            return;
        }
        else
        {
            BomberFiniteSkills.SubmitBubble(world, playerId, state, level, fromX, fromZ);
            return;
        }
        state.CooldownFromTick.Value = world.Tick;
        state.CooldownUntilTick.Value = checked(world.Tick + cooldown);
        BomberPlayerState player = world.Get<BomberPlayerState>(playerId);
        if (!player.Participant.Value.IsDefault && world.IsLive(player.Participant.Value))
        {
            BomberStatistics statistics = world.Get<BomberStatistics>(player.Participant.Value);
            statistics.SkillCasts.Value = checked(statistics.SkillCasts.Value + 1);
        }
        RecordSkillCast(world, playerId, state, level.Level, duration, fromX, fromZ, world.Tick);
    }

    private static bool TryBlinkLanding(World world, NetEntityId playerId, int range,
        out int landingX, out int landingZ, out bool terrainAvailable)
    {
        landingX = landingZ = 0;
        terrainAvailable = false;
        IBomberConfig config = BomberConfigBinding.For(world);
        VoxelCellQuery[]? cells = BomberTerrainRead.For(world);
        if (cells is null) return false;
        terrainAvailable = true;
        Vector3 position = world.Get<LogicTransform>(playerId).LocalPosition;
        int fromX = BomberMatchRules.CellX(position);
        int fromZ = BomberMatchRules.CellZ(position);
        return FindBlinkLanding(config, cells, fromX, fromZ,
            (BomberDirection)world.Get<BomberPlayerState>(playerId).Facing.Value, range,
            (x, z) => HasUnexplodedBomb(world, x, z),
            out landingX, out landingZ);
    }

    private static bool HasUnexplodedBomb(World world, int x, int z)
    {
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            if (bomb.Phase.Value != (int)BomberBombPhase.Fuse) continue;
            Vector3 position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            if (BomberMatchRules.CellX(position) == x && BomberMatchRules.CellZ(position) == z) return true;
        }
        return false;
    }

    internal static bool FindBlinkLanding(IBomberConfig config, IReadOnlyList<VoxelCellQuery> cells,
        int fromX, int fromZ, BomberDirection facing, int range, Func<int, int, bool> hasBomb,
        out int landingX, out int landingZ)
    {
        landingX = landingZ = 0;
        MapRow map = config.Map;
        int area = checked(map.Width * map.Depth);
        if (cells.Count != checked(area * 2) || range <= 0) return false;
        (int dx, int dz) = facing switch
        {
            BomberDirection.Up => (0, -1), BomberDirection.Right => (1, 0),
            BomberDirection.Down => (0, 1), BomberDirection.Left => (-1, 0),
            _ => (0, 0)
        };
        if (dx == 0 && dz == 0) return false;
        bool found = false;
        for (int step = 1; step <= range; step++)
        {
            int x = fromX + dx * step;
            int z = fromZ + dz * step;
            if (x < map.BoundaryCells || z < map.BoundaryCells ||
                x >= map.Width - map.BoundaryCells || z >= map.Depth - map.BoundaryCells) break;
            int index = z * map.Width + x;
            uint ground = cells[index].BlockId >> 8;
            uint obstacle = cells[area + index].BlockId >> 8;
            if (!TryBlock(config, ground, out bool groundWalkable, out _) || !groundWalkable ||
                !TryBlock(config, obstacle, out bool obstacleWalkable, out bool obstacleDestructible))
                break;
            if (!obstacleWalkable)
            {
                if (!obstacleDestructible) break;
                continue;
            }
            if (obstacle != 0 || hasBomb(x, z)) continue;
            landingX = x;
            landingZ = z;
            found = true;
        }
        return found;
    }

    private static bool TryBlock(IBomberConfig config, uint blockType, out bool walkable, out bool destructible)
    {
        foreach (var row in config.Tables.Blocks.Rows)
            if (row.BlockType == blockType && row.Enabled)
            {
                walkable = row.Walkable;
                destructible = row.Destructible;
                return true;
            }
        walkable = destructible = false;
        return false;
    }

    internal static void RecordSkillCast(World world, NetEntityId playerId, BomberSkillState state,
        int level, ulong duration, int fromX, int fromZ, ulong appliedTick)
    {
        BomberPlayerState player = world.Get<BomberPlayerState>(playerId);
        var position = world.Get<LogicTransform>(playerId).LocalPosition;
        world.Single<BomberPresentationJournal>().Append(world, "skill_cast",
            world.Single<BomberMatchState>().MatchId.Value,
            world.Single<BomberWorldRuntime>().AllocateEventSequence(),
            player.Participant.Value, playerId, player.LifeGeneration.Value,
            x: BomberMatchRules.CellX(position), z: BomberMatchRules.CellZ(position),
            data: new Dictionary<string, string> {
                ["skillId"] = state.ActiveSkillId.Value.ToString(CultureInfo.InvariantCulture),
                ["skillLevel"] = level.ToString(CultureInfo.InvariantCulture),
                ["fromX"] = fromX.ToString(CultureInfo.InvariantCulture),
                ["fromZ"] = fromZ.ToString(CultureInfo.InvariantCulture),
                ["untilTick"] = (appliedTick + duration).ToString(CultureInfo.InvariantCulture) }, occurredTick: appliedTick);
    }
}
