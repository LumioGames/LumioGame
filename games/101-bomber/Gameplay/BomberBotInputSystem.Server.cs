using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

[System(TickPhase.ProcessorPlan)]
[After(typeof(BombSystem))]
public sealed class BomberBotInputSystem : EcsSystem
{
    public override void Execute(World world)
    {
        if (world.Single<BomberMatchState>().Phase.Value is not ((int)BomberMatchPhase.Running) and not ((int)BomberMatchPhase.FinalCircle) ||
            !world.Each<BomberParticipantState>().Any(p => p.IsBot.Value)) return;
        var config = BomberConfigBinding.For(world);
        VoxelCellQuery[]? cells = BomberTerrainRead.For(world);
        if (cells is null) return;
        int width = config.Map.Width, area = checked(width * config.Map.Depth);
        var walkable = new bool[area];
        for (int cell = 0; cell < area; cell++)
        {
            int x = cell % width, z = cell / width;
            walkable[cell] = x >= config.Map.BoundaryCells && z >= config.Map.BoundaryCells &&
                x < width - config.Map.BoundaryCells && z < config.Map.Depth - config.Map.BoundaryCells &&
                cells[area + cell].BlockId == 0 && config.Tables.Blocks.Rows.Any(b =>
                    b.BlockType == cells[cell].BlockId >> 8 && b.Enabled && b.Walkable && b.Name is not ("air" or "water"));
        }
        // This is a per-tick decision projection over real Native cells and ECS bombs.
        // It reserves no terrain and neither predicts damage nor writes player position.
        var hazard = BomberMovementDanger.Read(world, config, new BomberMovementTerrain(cells)).ToArray();
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            if (bomb.Phase.Value != (int)BomberBombPhase.Fuse) continue;
            Vector3 at = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            MarkBlast(config, cells, hazard, BomberMatchRules.CellX(at), BomberMatchRules.CellZ(at), bomb.Power.Value);
            int bombCell = BomberMatchRules.CellZ(at) * width + BomberMatchRules.CellX(at);
            if ((uint)bombCell < (uint)area) walkable[bombCell] = false;
        }
        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>().OrderBy(p => p.Slot.Value))
        {
            if (!participant.IsBot.Value || participant.CurrentLife.Value.IsDefault || !world.IsLive(participant.CurrentLife.Value) ||
                !BomberMatchRules.IsPlayerInputOpen(world, participant.CurrentLife.Value)) continue;
            BomberPlayerState player = world.Get<BomberPlayerState>(participant.CurrentLife.Value);
            if (!player.IsBot.Value || player.LifeGeneration.Value != participant.LifeGeneration.Value) continue;
            AbilityComponent owner = world.Get<AbilityComponent>(player.Entity);
            Vector3 position = world.Get<LogicTransform>(player.Entity).LocalPosition;
            int x = BomberMatchRules.CellX(position), z = BomberMatchRules.CellZ(position), origin = z * width + x;
            if ((uint)origin >= (uint)area) continue;
            bool centered = MathF.Abs(position.X - x - .5f) < .08f && MathF.Abs(position.Z - z - .5f) < .08f;
            if (!hazard[origin] && centered && world.Tick >= player.BotLastBombTick.Value + Ticks.FromMilliseconds(3000, config.Game.TickRateHz) &&
                PlaceBombAbility.CanPlace(owner, out _))
            {
                bool[] after = (bool[])hazard.Clone();
                MarkBlast(config, cells, after, x, z, checked((int)world.Get<AttributeComponent>(player.Entity).GetCurrentValue(BomberAttributeNames.BombPower)));
                int escape = NextStep(config, walkable, after, origin, escape: true, participant.Slot.Value, world.Tick);
                if (escape >= 0)
                {
                    owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
                    player.BotLastBombTick.Value = world.Tick;
                    player.BotTargetCell.Value = escape;
                    after.CopyTo(hazard, 0);
                }
            }
            int target = player.BotTargetCell.Value;
            if (target < 0 || target >= area || (!hazard[origin] && hazard[target]) || !walkable[target] ||
                Vector2.DistanceSquared(new Vector2(position.X, position.Z), new Vector2(target % width + .5f, target / width + .5f)) < .0064f)
            {
                target = NextStep(config, walkable, hazard, origin, hazard[origin], participant.Slot.Value, world.Tick);
                player.BotTargetCell.Value = target;
            }
            if (target < 0) continue;
            float dx = target % width + .5f - position.X, dz = target / width + .5f - position.Z;
            BomberDirection direction = MathF.Abs(dx) > MathF.Abs(dz)
                ? dx > 0 ? BomberDirection.Right : BomberDirection.Left
                : dz > 0 ? BomberDirection.Down : BomberDirection.Up;
            owner.Activate<MoveAbility, MoveAbility.Input>(new MoveAbility.Input { PrimaryDirection = direction });
        }
    }

    private static int NextStep(IBomberConfig config, bool[] walkable, bool[] hazard, int origin, bool escape, int slot, ulong tick)
    {
        int width = config.Map.Width, area = walkable.Length;
        var first = new int[area];
        Array.Fill(first, -1);
        var queue = new int[area];
        int head = 0, tail = 1, chosen = -1, best = int.MaxValue;
        queue[0] = origin;
        first[origin] = origin;
        while (head < tail)
        {
            int cell = queue[head++], x = cell % width, z = cell / width;
            if (cell != origin && !hazard[cell])
            {
                if (escape) return first[cell];
                int score = Math.Abs(x - width / 2) + Math.Abs(z - config.Map.Depth / 2);
                score = score * area + (int)(((ulong)cell + (ulong)slot * 17 + tick / 80) % (ulong)area);
                if (score < best) { best = score; chosen = first[cell]; }
            }
            for (int i = 0; i < 4; i++)
            {
                int direction = (i + slot) % 4;
                int next = direction switch { 0 => x + 1 < width ? cell + 1 : -1, 1 => z + 1 < config.Map.Depth ? cell + width : -1,
                    2 => x > 0 ? cell - 1 : -1, _ => z > 0 ? cell - width : -1 };
                if (next < 0 || first[next] != -1 || !walkable[next] || !escape && hazard[next]) continue;
                first[next] = cell == origin ? next : first[cell];
                queue[tail++] = next;
            }
        }
        return chosen;
    }

    private static void MarkBlast(IBomberConfig config, VoxelCellQuery[] terrain, bool[] hazard, int x, int z, int power)
    {
        int width = config.Map.Width, area = hazard.Length;
        if (x < 0 || z < 0 || x >= width || z >= config.Map.Depth) return;
        hazard[z * width + x] = true;
        for (int direction = 0; direction < 4; direction++)
        for (int distance = 1; distance <= power; distance++)
        {
            int nx = x + (direction == 0 ? distance : direction == 2 ? -distance : 0);
            int nz = z + (direction == 1 ? distance : direction == 3 ? -distance : 0);
            if (nx < 0 || nz < 0 || nx >= width || nz >= config.Map.Depth) break;
            int cell = nz * width + nx;
            BlocksRow obstacle = config.Tables.Blocks.Rows.First(b => b.BlockType == terrain[area + cell].BlockId >> 8);
            if (obstacle.BlastStop && !obstacle.CoverBeforeStop || obstacle.Destructible) break;
            hazard[cell] = true;
            if (obstacle.BlastStop) break;
        }
    }
}
