using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation.Determinism;

namespace Lumio.Bomber.Gameplay;

/// <summary>Owns finite stage issuance; the chest position exists only in Native binding.</summary>
internal static class BomberStrongChests
{
    internal static void Produce(World world)
    {
        var match = world.Single<BomberMatchState>();
        var circle = world.Single<BomberFinalCircleState>();
        if (match.Phase.Value != (int)BomberMatchPhase.FinalCircle || world.Tick >= match.PhaseEndTick.Value ||
            !BomberTerrainTransactions.FrameAvailable(world)) return;
        if (BomberTerrainRead.For(world) is null || VoxelGameplayBinding.Resolve(world.Manager) is null) return;
        var config = BomberConfigBinding.For(world);
        var stages = config.Tables.CircleStages.Rows.OrderBy(row => row.AtMs).ToArray();
        for (int i = 0; i < stages.Length; i++)
        {
            var stage = stages[i];
            uint bit = 1u << i;
            if (!stage.SpawnChest || ((circle.ChestIssuedStageMask.Value | circle.ChestUnavailableStageMask.Value) & bit) != 0 ||
                world.Tick < Preview(world, stage)) continue;
            var chest = world.Each<BomberChestState>().SingleOrDefault(c => world.IsLive(c.Entity) &&
                c.StrongSpawnMatch.Value == match.MatchId.Value && c.StrongSpawnStage.Value == stage.Id);
            if (!TrySelect(world, stage, out int x, out int z))
            {
                circle.ChestUnavailableStageMask.Value |= bit;
                if (chest is not null) world.Commands.Destroy(chest.Entity);
                Journal(world, "chest_unavailable", stage.Id, default, null, null, "no_legal_cell");
                continue;
            }
            if (chest is null)
            {
                var order = world.Commands.Create<BomberChestEntity>();
                var state = order.Get<BomberChestState>();
                state.RequiredHits.Value = state.RemainingHits.Value = config.Chest.IndependentBombHits;
                state.StrongSpawnMatch.Value = match.MatchId.Value; state.StrongSpawnStage.Value = stage.Id;
                return;
            }
            var read = BomberTerrainRead.For(world)!;
            var cell = read[config.Map.Width * config.Map.Depth + z * config.Map.Width + x];
            var address = BomberTerrainTransactions.Address(config.Map, x, config.Map.ObstacleLayer, z);
            var adapter = VoxelGameplayBinding.Resolve(world.Manager)!;
            uint chestBlock = config.Tables.Blocks.Rows.Single(row => row.Name == "chest").BlockType;
            if (!adapter.BindingPolicy.Any(row => row.BlockType == chestBlock))
            {
                if (!adapter.TrySetBindingPolicy(adapter.BindingPolicy.Concat(new[] { new VoxelBindingPolicyEntry(chestBlock, world.Registry.WireName(typeof(BomberChestEntity))) }).ToArray())) return;
            }
            else if (!adapter.TryRefreshBindingContext()) return;
            BomberTerrainTransactions.SpawnStrongChest(world, new(new(address.Section, address.Offset, chestBlock << 8, cell.SectionRevision),
                0, BomberVoxelIntentKind.StrongChest, default, default, 0, default, chest.Entity, 0), stage.Id, x, z);
            return;
        }
    }

    private static bool TrySelect(World world, CircleStagesRow stage, out int x, out int z)
    {
        x = z = 0;
        var read = BomberTerrainRead.For(world);
        var adapter = VoxelGameplayBinding.Resolve(world.Manager);
        if (read is null || adapter is null) return false;
        var config = BomberConfigBinding.For(world);
        var circle = world.Single<BomberFinalCircleState>();
        int side = Math.Min(stage.SideCells, circle.CurrentSide.Value), startX = (config.Map.Width - side) / 2,
            startZ = (config.Map.Depth - side) / 2, area = config.Map.Width * config.Map.Depth;
        var players = world.Each<BomberPlayerState>().Where(p => world.IsLive(p.Entity) &&
                p.LifePhase.Value is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable)
            .Select(p => world.Get<LogicTransform>(p.Entity).LocalPosition)
            .Select(p => (X: BomberMatchRules.CellX(p), Z: BomberMatchRules.CellZ(p))).ToArray();
        var blocked = BomberTerrainTransactions.PickupCells(world);
        blocked.UnionWith(players);
        foreach (var bomb in world.Each<BomberBombState>().Where(b => world.IsLive(b.Entity)))
        {
            var at = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            blocked.Add((BomberMatchRules.CellX(at), BomberMatchRules.CellZ(at)));
        }
        var far = new List<(int X, int Z)>(); var near = new List<(int X, int Z)>();
        for (int cz = startZ; cz < startZ + side; cz++)
        for (int cx = startX; cx < startX + side; cx++)
        {
            int index = cz * config.Map.Width + cx;
            var ground = config.Tables.Blocks.Rows.SingleOrDefault(r => r.BlockType == read[index].BlockId >> 8);
            if (!Allowed(config, stage, cx, cz) || !ground.Enabled || !ground.Walkable || ground.Name is "air" or "water" ||
                read[area + index].BlockId != 0 || blocked.Contains((cx, cz))) continue;
            var address = BomberTerrainTransactions.Address(config.Map, cx, config.Map.ObstacleLayer, cz);
            if (adapter.BindingGet(address.Section, address.Offset) is not null) continue;
            (players.All(p => Math.Abs(p.X - cx) + Math.Abs(p.Z - cz) >= 2) ? far : near).Add((cx, cz));
        }
        var candidates = far.Count != 0 ? far : near;
        if (candidates.Count == 0) return false;
        var rng = new DeterminismContext(world.Single<BomberMatchState>().Seed.Value, Preview(world, stage), RuntimeSchema.SchemaEpoch)
            .OpenRngStream(FormattableString.Invariant($"bomber.strong-chest.{stage.Id}"));
        (x, z) = candidates[checked((int)(rng.NextUInt32() % (uint)candidates.Count))];
        return true;
    }

    private static bool Allowed(IBomberConfig config, CircleStagesRow stage, int x, int z)
    {
        int startX = (config.Map.Width - stage.SideCells) / 2, startZ = (config.Map.Depth - stage.SideCells) / 2;
        int dx = x - config.Map.Width / 2, dz = z - config.Map.Depth / 2;
        return x >= startX && z >= startZ && x < startX + stage.SideCells && z < startZ + stage.SideCells &&
            !(config.Chest.ExcludeCenter && dx == 0 && dz == 0) &&
            !(config.Chest.ExcludeEarlyCenterCross && stage.SideCells > 3 && (dx == 0 || dz == 0) && Math.Abs(dx) <= 2 && Math.Abs(dz) <= 2);
    }

    private static ulong Preview(World world, CircleStagesRow stage)
    {
        var config = BomberConfigBinding.For(world);
        return checked(world.Single<BomberFinalCircleState>().TriggerTick.Value +
            Ticks.FromMilliseconds(stage.AtMs, config.Game.TickRateHz) - Ticks.FromMilliseconds(config.FinalCircle.PreviewMs, config.Game.TickRateHz));
    }

    internal static void Validate(World world)
    {
        var circle = world.Single<BomberFinalCircleState>();
        var match = world.Single<BomberMatchState>();
        var config = BomberConfigBinding.For(world);
        var stages = config.Tables.CircleStages.Rows.OrderBy(row => row.AtMs).ToArray();
        uint allowed = 0;
        for (int i = 0; i < stages.Length; i++)
            if (stages[i].SpawnChest && circle.TriggerTick.Value != 0 && world.Tick >= Preview(world, stages[i])) allowed |= 1u << i;
        if (((circle.ChestIssuedStageMask.Value | circle.ChestUnavailableStageMask.Value) & ~allowed) != 0 ||
            (circle.ChestIssuedStageMask.Value & circle.ChestUnavailableStageMask.Value) != 0)
            throw new InvalidOperationException("Strong chest stage memory is not an eligible exclusive outcome.");
        var seen = new HashSet<uint>();
        foreach (var chest in world.Each<BomberChestState>().Where(c => world.IsLive(c.Entity)))
        {
            if (chest.StrongSpawnStage.Value == 0 && chest.StrongSpawnMatch.Value == 0) continue;
            int index = Array.FindIndex(stages, s => s.Id == chest.StrongSpawnStage.Value);
            if (index < 0 || !stages[index].SpawnChest || chest.StrongSpawnMatch.Value != match.MatchId.Value ||
                chest.ResourceTier.Value != 0 || chest.InitialResourceMatch.Value != 0 || !seen.Add(chest.StrongSpawnStage.Value) ||
                (allowed & (1u << index)) == 0 || (circle.ChestUnavailableStageMask.Value & (1u << index)) != 0)
                throw new InvalidOperationException("Strong chest lost its unique stage issuance identity.");
        }
    }

    internal static void ValidatePending(World world, int index, BomberTerrainDetail detail)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        var stage = config.Tables.CircleStages.Rows.SingleOrDefault(r => r.Id == detail.CircleStage);
        var address = BomberTerrainTransactions.Address(config.Map, detail.X, config.Map.ObstacleLayer, detail.Z);
        if (runtime.PendingKinds.Count != 1 || index != 0 || stage.Id == 0 || !stage.SpawnChest ||
            !Allowed(config, stage, detail.X, detail.Z) || detail.Occurred != runtime.PendingVoxelSubmittedTicks[0] ||
            detail.Occurred < Preview(world, stage) || detail.Reserved != 0 || detail.Rewards.Length != 0 || detail.Family != "" ||
            detail.Tier != 0 || detail.CellGeneration != 0 || runtime.PendingSections[index] != address.Section ||
            runtime.PendingCellOffsets[index] != address.Offset || runtime.PendingOldBlocks[index] != 0 ||
            runtime.PendingNewBlocks[index] != config.Tables.Blocks.Rows.Single(r => r.Name == "chest").BlockType << 8 ||
            !runtime.PendingParticipants[index].IsDefault || !runtime.PendingSourceLives[index].IsDefault ||
            runtime.PendingSourceLifeGenerations[index] != 0 || !runtime.PendingSourceBombs[index].IsDefault || runtime.PendingChainIds[index] != 0 ||
            !world.IsLive(runtime.PendingChests[index]) || !world.TypeOf(runtime.PendingChests[index]).Is<BomberChestEntity>())
            throw new InvalidOperationException("Strong chest binding lost its exact stage/cell provenance.");
        var chest = world.Get<BomberChestState>(runtime.PendingChests[index]);
        if (chest.StrongSpawnStage.Value != stage.Id || chest.StrongSpawnMatch.Value != runtime.PendingVoxelMatchIds[0])
            throw new InvalidOperationException("Strong chest binding identifies another issuance.");
    }

    internal static void ValidateApplied(World world, int index, BomberTerrainDetail detail)
    {
        ValidatePending(world, index, detail);
        var runtime = world.Single<BomberWorldRuntime>();
        if (VoxelGameplayBinding.Resolve(world.Manager)!.BindingGet(runtime.PendingSections[index], runtime.PendingCellOffsets[index]) !=
            runtime.PendingChests[index].ToHex()) throw new InvalidOperationException("Original strong chest mutation did not establish its exact Native binding.");
    }

    internal static void Accept(World world, NetEntityId chest, BomberTerrainDetail detail)
    {
        var stages = BomberConfigBinding.For(world).Tables.CircleStages.Rows.OrderBy(r => r.AtMs).ToArray();
        int ordinal = Array.FindIndex(stages, s => s.Id == detail.CircleStage);
        var circle = world.Single<BomberFinalCircleState>();
        uint mask = 1u << ordinal;
        if ((circle.ChestIssuedStageMask.Value & mask) != 0) throw new InvalidOperationException("Strong chest Original was consumed twice.");
        circle.ChestIssuedStageMask.Value |= mask;
        Journal(world, "chest_spawn", detail.CircleStage, chest, detail.X, detail.Z, "original");
    }

    private static void Journal(World world, string kind, uint stage, NetEntityId chest, int? x, int? z, string cause) =>
        world.Single<BomberPresentationJournal>().Append(world, kind, world.Single<BomberMatchState>().MatchId.Value,
            world.Single<BomberWorldRuntime>().AllocateEventSequence(), entity: chest, x: x, z: z, cause: cause,
            data: new Dictionary<string, string> { ["stageId"] = stage.ToString(CultureInfo.InvariantCulture) });
}
