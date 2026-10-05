using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Client.Bot;
using Lumio.Client.Gameplay.ECS;
using Lumio.GameRuntime.Coordination;

namespace Lumio.Bomber.Bots;

internal static class BomberPlayObservation
{
    internal static string CurrentAttribute(string name) => "AttributeComponent." + char.ToLowerInvariant(name[0]) + name[1..] + "Current";
    internal static bool TryRead(BotWorldView view, IBomberConfig config, IReadOnlySet<string> humans,
        out BomberBotObservation observation)
    {
        observation = null!;
        if (!view.Bound || !view.HasSelf || !view.WorldEntity.Found) return false;
        string self = view.Self.NetEntityId, world = view.WorldEntity.NetEntityId;
        ReplicaWorldPosition position = view.WorldPositions[self];
        if (!position.Found || !Number(view, self, CurrentAttribute(BomberAttributeNames.HealthPoints), out long health)
            || !Number(view, self, CurrentAttribute(BomberAttributeNames.BombPower), out long power)
            || !Number(view, self, CurrentAttribute(BomberAttributeNames.AvailableBombs), out long available)
            || !Number(view, self, CurrentAttribute(BomberAttributeNames.MovementSpeedMilli), out long speed)
            || speed <= 0 || !Number(view, self, "BomberPlayerState.lifePhase", out long phase)
            || phase is not ((int)BomberLifePhase.Protected) and not ((int)BomberLifePhase.Vulnerable)) return false;
        int width = config.Map.Width;
        int selfCell = Cell(position, width);
        if ((uint)selfCell >= width * width) return false;
        var cells = new BotCell[width * width];
        var blockRows = config.Tables.Blocks.Rows.ToDictionary(row => row.BlockType);
        for (int z = 0; z < width; z++)
        for (int x = 0; x < width; x++)
        {
            ReplicaVoxelCell ground = Voxel(view, x, config.Map.GroundLayer, z);
            ReplicaVoxelCell obstacle = Voxel(view, x, config.Map.ObstacleLayer, z);
            if (!ground.HasBlockId || !obstacle.HasBlockId || !blockRows.TryGetValue(ground.BlockId >> 8, out var floor)
                || !blockRows.TryGetValue(obstacle.BlockId >> 8, out var wall)) continue;
            bool water = !floor.PlaceBomb || !wall.PlaceBomb;
            cells[z * width + x] = new(true, floor.Walkable && wall.Walkable,
                floor.BlastStop || wall.BlastStop, wall.Destructible, water);
        }
        long tick = checked((long)Field(view, world, "BomberMatchState.phase").ObservedTick);
        var actors = new List<BotActor>();
        var bombs = new List<BotBomb>();
        var pickups = new List<BotPickup>();
        var hazards = new List<BotHazard>();
        foreach (BotVisibleEntity entity in view.VisibleEntities.All)
        {
            ReplicaWorldPosition p = view.WorldPositions[entity.NetEntityId];
            if (!p.Found) continue;
            int cell = Cell(p, width);
            if ((uint)cell >= cells.Length) continue;
            string id = entity.NetEntityId;
            if (entity.EntityType == "player")
            {
                if (!Number(view, id, "BomberPlayerState.lifePhase", out long life) || life > (int)BomberLifePhase.Vulnerable) continue;
                string participant = Text(view, id, "BomberPlayerState.participant");
                actors.Add(new(id, participant, cell, Int(view, id, CurrentAttribute(BomberAttributeNames.HealthPoints)),
                    Int(view, id, "BomberPlayerState.hatCount"), humans.Contains(participant),
                    Math.Max(Long(view, id, "BomberPlayerState.protectedUntilTick"), Long(view, id, "BomberSkillState.bubbleUntilTick"))));
            }
            else if (entity.EntityType == "bomberBomb")
            {
                int bombPhase = Int(view, id, "BomberBombState.phase");
                if (bombPhase >= (int)BomberBombPhase.Extinguished) continue;
                long fuse = Long(view, id, bombPhase == (int)BomberBombPhase.Fuse
                    ? "BomberBombState.fuseEndTick" : "BomberBombState.explodedAtTick");
                long end = bombPhase == (int)BomberBombPhase.Fuse ? fuse + Ticks(config, config.Bomb.DangerMs)
                    : Math.Max(Long(view, id, "BomberBombState.dangerUntilTick"), Long(view, id, "BomberBombState.burnUntilTick"));
                bombs.Add(new(id, Text(view, id, "BomberBombState.owner"), cell,
                    Int(view, id, "BomberBombState.power"), Int(view, id, "BomberBombState.pierceLayers"), fuse, end,
                    bombPhase == (int)BomberBombPhase.Fuse ? -1 : Int(view, id, "BomberBombState.reachUp"),
                    bombPhase == (int)BomberBombPhase.Fuse ? -1 : Int(view, id, "BomberBombState.reachRight"),
                    bombPhase == (int)BomberBombPhase.Fuse ? -1 : Int(view, id, "BomberBombState.reachDown"),
                    bombPhase == (int)BomberBombPhase.Fuse ? -1 : Int(view, id, "BomberBombState.reachLeft")));
            }
            else if (entity.EntityType == "bomberPickupItem")
                pickups.Add(new(cell, Int(view, id, "BomberPickupItem.kind")));
            else if (entity.EntityType == "bomberFireZone")
            {
                long until = Long(view, id, "BomberFireZoneState.untilTick");
                bool region = Field(view, id, "BomberFireZoneState.regionCoverage").Value.Boolean == true;
                if (region)
                {
                    long from = Long(view, id, "BomberFireZoneState.fromTick");
                    string sourceLife = Text(view, id, "BomberFireZoneState.sourceLife");
                    int regionPhase = Int(view, id, "BomberFireZoneState.phase");
                    if (regionPhase == 1 && from <= tick && until > tick && sourceLife != self)
                        foreach (var at in BomberFireRegionCoverage.Cells(cell % width, cell / width,
                            Int(view, id, "BomberFireZoneState.coverageMask")))
                            if ((uint)at.X < width && (uint)at.Z < width) hazards.Add(new(at.Z * width + at.X, from, until));
                    continue;
                }
                int direction = Int(view, id, "BomberFireZoneState.direction");
                int length = Int(view, id, "BomberFireZoneState.length");
                int dx = direction == 2 ? 1 : direction == 4 ? -1 : 0;
                int dz = direction == 3 ? 1 : direction == 1 ? -1 : 0;
                for (int step = 0; step <= length; step++)
                {
                    int x = cell % width + dx * step, z = cell / width + dz * step;
                    if ((uint)x >= width || (uint)z >= width) break;
                    hazards.Add(new(z * width + x, tick, until));
                }
            }
        }
        string ownParticipant = Text(view, self, "BomberPlayerState.participant");
        uint activeSkill = checked((uint)Long(view, self, "BomberSkillState.activeSkillId"));
        int activeLevel = Int(view, self, "BomberSkillState.activeSkillLevel");
        int activeRange = config.Tables.SkillLevels.Rows.Where(row => row.SkillId == activeSkill && row.Level == activeLevel)
            .Select(row => row.RangeCells).FirstOrDefault();
        observation = new()
        {
            Width = width, Cells = cells, Tick = tick,
            Self = new(self, ownParticipant, selfCell, checked((int)health), Int(view, self, "BomberPlayerState.hatCount"), humans.Contains(ownParticipant)),
            Actors = actors, Bombs = bombs, Pickups = pickups, Hazards = hazards,
            TicksPerCell = checked((int)Math.Max(1, (config.Game.TickRateHz * 1000L + speed - 1) / speed)),
            WaterTicksPerCell = checked((int)Math.Max(1, (config.Game.TickRateHz * 1000000L + speed * config.Movement.WaterSpeedPermille - 1)
                / (speed * config.Movement.WaterSpeedPermille))),
            BombPower = checked((int)power), AvailableBombs = checked((int)available),
            FuseTicks = Ticks(config, config.Bomb.FuseMs), FlameTicks = Ticks(config, config.Bomb.DangerMs),
            DamagePoints = checked((int)config.Bomb.DamagePoints),
            SafeSide = Int(view, world, "BomberFinalCircleState.currentSide"),
            NextSafeSide = Int(view, world, "BomberFinalCircleState.nextSide"),
            NextCircleTick = Long(view, world, "BomberFinalCircleState.nextEffectiveTick"),
            HatKing = Text(view, world, "BomberMatchState.hatKing"),
            ActiveSkill = activeSkill, ActiveRange = activeRange,
            Facing = (BotMove)Int(view, self, "BomberPlayerState.facing"),
            SkillReady = config.Game.SkillsEnabled && Long(view, self, "BomberSkillState.cooldownUntilTick") <= tick
                && Long(view, self, "BomberSkillState.frozenUntilTick") <= tick
                && Long(view, self, "BomberSkillState.bubbleUntilTick") <= tick,
        };
        return true;
    }

    private static int Ticks(IBomberConfig config, uint ms) => checked((int)(ms * config.Game.TickRateHz / 1000));
    private static int Cell(ReplicaWorldPosition p, int width) => (int)MathF.Floor(p.Z) * width + (int)MathF.Floor(p.X);
    private static ReplicaVoxelCell Voxel(BotWorldView view, int x, int y, int z) => view.Voxels[
        VoxelPackedSection.Encode(x >> 4, checked((byte)(y >> 4)), z >> 4),
        (x & 15) | ((z & 15) << 4) | ((y & 15) << 8)];
    internal static ReplicaFieldObservation Field(BotWorldView view, string entity, string attribute)
    {
        ReplicaFieldObservation value = view.Fields[entity, attribute];
        return value.Found && value.RoomId == view.Self.RoomId && value.NetEntityId == entity && value.AttributeId == attribute ? value : default;
    }
    internal static bool Number(BotWorldView view, string entity, string attribute, out long number)
    {
        ReplicaFieldObservation field = Field(view, entity, attribute);
        if (field.Found && field.Value.WholeNumber is { } signed) { number = signed; return true; }
        if (field.Found && field.Value.Magnitude is { } unsigned && unsigned <= long.MaxValue) { number = (long)unsigned; return true; }
        number = 0; return false;
    }
    internal static long Long(BotWorldView view, string entity, string attribute) => Number(view, entity, attribute, out long value) ? value : 0;
    internal static ulong Unsigned(BotWorldView view, string entity, string attribute)
    {
        ReplicaFieldObservation field = Field(view, entity, attribute);
        if (field.Value.Magnitude is { } unsigned) return unsigned;
        return field.Value.WholeNumber is >= 0 and { } signed ? (ulong)signed : 0;
    }
    internal static int Int(BotWorldView view, string entity, string attribute) => checked((int)Long(view, entity, attribute));
    internal static string Text(BotWorldView view, string entity, string attribute) => Field(view, entity, attribute).Value.Text ?? string.Empty;
}
