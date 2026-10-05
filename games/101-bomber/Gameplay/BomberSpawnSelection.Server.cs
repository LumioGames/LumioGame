using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation.Determinism;

namespace Lumio.Bomber.Gameplay;

/// <summary>Finite, current-frame selection over the Native terrain read, never a terrain store.</summary>
internal static class BomberSpawnSelection
{
    internal static bool TrySelect(World world, BomberParticipantState participant, out Vector3 position)
    {
        position = default;
        var config = BomberConfigBinding.For(world);
        var read = BomberTerrainRead.For(world);
        if (read is null) return false;
        var map = config.Map;
        int area = checked(map.Width * map.Depth);
        var distance = new int[area];
        Array.Fill(distance, checked(map.Width + map.Depth));
        var hazards = new bool[area];
        void Threat(Vector3 at)
        {
            int x = BomberMatchRules.CellX(at), z = BomberMatchRules.CellZ(at);
            if (x >= 0 && z >= 0 && x < map.Width && z < map.Depth) distance[z * map.Width + x] = 0;
        }
        void Hazard(int x, int z)
        {
            if (x >= 0 && z >= 0 && x < map.Width && z < map.Depth) hazards[z * map.Width + x] = true;
        }
        foreach (var player in world.Each<BomberPlayerState>())
            if (world.IsLive(player.Entity) && player.Participant.Value != participant.Entity &&
                player.LifePhase.Value is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable)
                Threat(world.Get<LogicTransform>(player.Entity).LocalPosition);
        foreach (var bomb in world.Each<BomberBombState>())
        {
            if (!world.IsLive(bomb.Entity) || bomb.Phase.Value >= (int)BomberBombPhase.Extinguished) continue;
            var at = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            Threat(at);
            int x = BomberMatchRules.CellX(at), z = BomberMatchRules.CellZ(at);
            Hazard(x, z);
            if (bomb.Phase.Value != (int)BomberBombPhase.Danger || bomb.DangerUntilTick.Value <= world.Tick) continue;
            for (int d = 1; d <= bomb.ReachUp.Value; d++) Hazard(x, z - d);
            for (int d = 1; d <= bomb.ReachDown.Value; d++) Hazard(x, z + d);
            for (int d = 1; d <= bomb.ReachLeft.Value; d++) Hazard(x - d, z);
            for (int d = 1; d <= bomb.ReachRight.Value; d++) Hazard(x + d, z);
        }
        // Exact Manhattan distance transform: O(map area + active threats), even
        // when many bounded bombs share a cell. Walls do not shorten safety distance.
        for (int z = 0; z < map.Depth; z++)
        for (int x = 0; x < map.Width; x++)
        {
            int i = z * map.Width + x;
            if (x > 0) distance[i] = Math.Min(distance[i], distance[i - 1] + 1);
            if (z > 0) distance[i] = Math.Min(distance[i], distance[i - map.Width] + 1);
        }
        for (int z = map.Depth - 1; z >= 0; z--)
        for (int x = map.Width - 1; x >= 0; x--)
        {
            int i = z * map.Width + x;
            if (x + 1 < map.Width) distance[i] = Math.Min(distance[i], distance[i + 1] + 1);
            if (z + 1 < map.Depth) distance[i] = Math.Min(distance[i], distance[i + map.Width] + 1);
        }
        int left = map.BoundaryCells, top = map.BoundaryCells;
        int right = map.Width - map.BoundaryCells - 1, bottom = map.Depth - map.BoundaryCells - 1;
        if (world.Single<BomberMatchState>().Phase.Value == (int)BomberMatchPhase.FinalCircle)
        {
            int side = world.Single<BomberFinalCircleState>().CurrentSide.Value;
            if (side > 0)
            {
                left = Math.Max(left, (map.Width - side) / 2);
                top = Math.Max(top, (map.Depth - side) / 2);
                right = Math.Min(right, (map.Width + side) / 2 - 1);
                bottom = Math.Min(bottom, (map.Depth + side) / 2 - 1);
            }
        }
        var land = config.Tables.Blocks.Rows.Where(b => b.Enabled && b.Walkable && b.Name is not ("water" or "air"))
            .Select(b => checked((uint)b.BlockType)).ToHashSet();
        bool Arm(int x, int z, out bool soft)
        {
            soft = false;
            if (x < left || z < top || x > right || z > bottom) return false;
            int i = z * map.Width + x;
            if (!land.Contains(read[i].BlockId >> 8) || hazards[i]) return false;
            uint obstacle = read[area + i].BlockId;
            if (obstacle == 0) return true;
            soft = config.Tables.Blocks.Rows.Any(b => b.BlockType == obstacle >> 8 && b.Name == "softBrick" && b.SparseBinding == "none");
            return soft;
        }
        var free = new List<(int Cell, int[] Clears)>(area);
        var clearing = new List<(int Cell, int[] Clears)>(area);
        for (int z = top; z <= bottom; z++)
        for (int x = left; x <= right; x++)
        {
            if (distance[z * map.Width + x] < map.SpawnMinDistance || !Arm(x, z, out bool centerSoft) || centerSoft) continue;
            int[]? best = null;
            foreach (int dx in new[] { 1, -1 })
            foreach (int dz in new[] { 1, -1 })
            {
                if (!Arm(x + dx, z, out bool xSoft) || !Arm(x, z + dz, out bool zSoft)) continue;
                var clears = new List<int>(2);
                if (xSoft) clears.Add(z * map.Width + x + dx);
                if (zSoft) clears.Add((z + dz) * map.Width + x);
                if (best is null || clears.Count < best.Length) best = clears.ToArray();
            }
            if (best is not null) (best.Length == 0 ? free : clearing).Add((z * map.Width + x, best));
        }
        var candidates = free.Count != 0 ? free : clearing;
        if (candidates.Count == 0) return false;
        var match = world.Single<BomberMatchState>();
        var rng = new DeterminismContext(match.Seed.Value, world.Tick, RuntimeSchema.SchemaEpoch)
            .OpenRngStream(FormattableString.Invariant($"bomber.spawn.{participant.Entity.ToHex()}.{participant.LifeGeneration.Value}"));
        var choice = candidates[checked((int)(rng.NextUInt32() % (uint)candidates.Count))];
        int selected = choice.Cell;
        if (choice.Clears.Length != 0)
        {
            var adapter = VoxelGameplayBinding.Resolve(world.Manager);
            if (adapter is null) return false;
            var writes = new List<BomberPendingVoxelCell>(choice.Clears.Length);
            foreach (int i in choice.Clears)
            {
                var cell = read[area + i];
                var address = BomberTerrainTransactions.Address(map, i % map.Width, map.ObstacleLayer, i / map.Width);
                if (adapter.BindingGet(address.Section, address.Offset) is not null)
                    throw new InvalidOperationException("Soft spawn arm has a foreign Native sparse binding.");
                writes.Add(new(new(address.Section, address.Offset, 0, cell.SectionRevision), cell.BlockId,
                    BomberVoxelIntentKind.SpawnClear, participant.Entity, participant.CurrentLife.Value,
                    participant.LifeGeneration.Value, default, default, 0));
            }
            BomberTerrainTransactions.ClearSpawn(world, writes, selected % map.Width, selected / map.Width);
            // A submitted write is not terrain. Only a later Original receipt and
            // a new complete selection over the current world can allow birth.
            return false;
        }
        position = new Vector3(selected % map.Width + .5f, map.ObstacleLayer + .5f, selected / map.Width + .5f);
        return true;
    }

    internal static void ValidateClear(World world, int index, BomberTerrainDetail row)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        NetEntityId participantId = runtime.PendingParticipants[index], life = runtime.PendingSourceLives[index];
        if (runtime.PendingKinds.Count is < 1 or > 2 || participantId.IsDefault || !world.IsLive(participantId) ||
            life.IsDefault || !world.IsLive(life) || row.X < 0 || row.X >= config.Map.Width || row.Z < 0 || row.Z >= config.Map.Depth ||
            row.Reserved != 0 || row.Rewards.Length != 0 || row.Family != "" || row.Tier != 0 || row.CellGeneration != 0 || row.CircleStage != 0 ||
            row.Occurred != runtime.PendingVoxelSubmittedTicks[0] || runtime.PendingNewBlocks[index] != 0 ||
            !runtime.PendingChests[index].IsDefault || !runtime.PendingSourceBombs[index].IsDefault || runtime.PendingChainIds[index] != 0 ||
            !config.Tables.Blocks.Rows.Any(b => b.BlockType == runtime.PendingOldBlocks[index] >> 8 && b.Name == "softBrick" && b.SparseBinding == "none"))
            throw new InvalidOperationException("Spawn clearance lost its bounded soft-cell provenance.");
        var participant = world.Get<BomberParticipantState>(participantId);
        if (participant.CurrentLife.Value != life || participant.LifeGeneration.Value != runtime.PendingSourceLifeGenerations[index] ||
            world.Get<BomberPlayerState>(life).Participant.Value != participantId ||
            world.Get<BomberPlayerState>(life).LifeGeneration.Value != participant.LifeGeneration.Value)
            throw new InvalidOperationException("Spawn clearance changed its current Life owner.");
        int Axis(int rowIndex)
        {
            foreach (var delta in new[] { (X: 1, Z: 0), (X: -1, Z: 0), (X: 0, Z: 1), (X: 0, Z: -1) })
            {
                int x = row.X + delta.X, z = row.Z + delta.Z;
                if (x < 0 || z < 0 || x >= config.Map.Width || z >= config.Map.Depth) continue;
                var address = BomberTerrainTransactions.Address(config.Map, x, config.Map.ObstacleLayer, z);
                if (runtime.PendingSections[rowIndex] == address.Section && runtime.PendingCellOffsets[rowIndex] == address.Offset)
                    return delta.X == 0 ? 1 : 0;
            }
            throw new InvalidOperationException("Spawn clearance cell is not an adjacent safety arm.");
        }
        int axis = Axis(index);
        for (int i = 0; i < runtime.PendingKinds.Count; i++)
        {
            var other = BomberTerrainTransactions.Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]);
            if (runtime.PendingKinds[i] != (int)BomberVoxelIntentKind.SpawnClear || runtime.PendingParticipants[i] != participantId ||
                runtime.PendingSourceLives[i] != life || other.X != row.X || other.Z != row.Z)
                throw new InvalidOperationException("Spawn clearance mixed independent landing requests.");
            if (i != index && Axis(i) == axis)
                throw new InvalidOperationException("Spawn clearance arms are not perpendicular.");
        }
    }
}
