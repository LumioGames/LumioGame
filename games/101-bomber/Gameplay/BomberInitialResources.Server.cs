using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

/// <summary>Warmup producer input and obligations, never an alternate terrain store.</summary>
internal static class BomberInitialResources
{
    internal const int PlanByteLimit = 32768;

    internal static void Configure(World world, M2Layout layout)
    {
        ValidateLayout(layout);
        var runtime = world.Single<BomberWorldRuntime>();
        var map = BomberConfigBinding.For(world).Map;
        _ = BomberTerrainBudget.Calculate(BomberConfigBinding.For(world), layout);
        if (runtime.InitialResourcePhase.Value != 0 || runtime.InitialResourcePlan.Value != "" ||
            runtime.TerrainInitialMatchId.Value != 0 || layout.Size != map.Width || layout.Size != map.Depth)
            throw new InvalidOperationException("Initial resources cannot replace an existing generation.");
        runtime.InitialResourcePlan.Value = EncodePlan(layout);
        runtime.InitialResourcePhase.Value = 1;
    }

    internal static string EncodePlan(M2Layout layout)
    {
        ValidateLayout(layout);
        string input = JsonSerializer.Serialize(layout);
        if (Encoding.UTF8.GetByteCount(input) > PlanByteLimit) throw new InvalidOperationException("Initial resource input byte budget exceeded.");
        return input;
    }

    internal static void ValidateLayout(M2Layout layout)
    {
        M2Layout expected = M2InitialLayout.Plan(layout.Size);
        if (layout.Players != expected.Players || layout.Potential != expected.Potential ||
            layout.Water != expected.Water || layout.Pillars != expected.Pillars ||
            layout.Cells.Count > M2BudgetEnvelope.DestructibleCap(layout.Potential))
            throw new InvalidOperationException("Initial layout differs from its admitted map envelope.");
        foreach (var kind in new[] { M2CellKind.Wood, M2CellKind.Iron, M2CellKind.Gold, M2CellKind.Barrel })
            if (layout.Count(kind) != expected.Count(kind)) throw new InvalidOperationException("Required resource count is missing.");
        var occupied = new Dictionary<(int, int), M2CellKind>();
        foreach (var cell in layout.Cells)
            if (!Enum.IsDefined(cell.Kind) || cell.X <= 0 || cell.Z <= 0 || cell.X >= layout.Size - 1 || cell.Z >= layout.Size - 1 ||
                M2InitialLayout.IsSafetyCell(layout.Size, cell.X, cell.Z) || !M2InitialLayout.IsTierCell(layout.Size, cell) ||
                !occupied.TryAdd((cell.X, cell.Z), cell.Kind))
                throw new InvalidOperationException("Initial layout violates occupancy or clearance.");
        foreach (var cell in layout.Cells)
            foreach (var at in new[] { (layout.Size - 1 - cell.X, cell.Z), (cell.X, layout.Size - 1 - cell.Z),
                (layout.Size - 1 - cell.X, layout.Size - 1 - cell.Z) })
                if (!occupied.TryGetValue(at, out var kind) || kind != cell.Kind)
                    throw new InvalidOperationException("Initial resources are not mirror symmetric.");
    }

    internal static void Produce(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        if (runtime.InitialResourcePhase.Value == 0 && config.Map.LayoutKind != "LegacyPillars" &&
            match.Phase.Value == (int)BomberMatchPhase.Warmup)
            Configure(world, M2InitialLayout.Plan(config.Map.Width, match.Seed.Value));
        if (runtime.InitialResourcePhase.Value is 0 or 3 || runtime.PendingVoxelTransactionIds.Count != 0) return;
        var layout = Read(runtime);
        var read = BomberTerrainRead.For(world);
        if (read is null) return;
        int area = checked(layout.Size * layout.Size);
        uint floor = config.Tables.Blocks.Rows.Single(r => r.Name == "floor").BlockType << 8;
        uint water = config.Tables.Blocks.Rows.Single(r => r.Name == "water").BlockType;
        uint pillar = config.Tables.Blocks.Rows.Single(r => r.Name == "hardPillar").BlockType;
        if (runtime.InitialResourcePhase.Value == 1)
        {
            uint boundary = config.Tables.Blocks.Rows.Single(r => r.Name == "iron").BlockType << 8;
            for (int z = 0; z < layout.Size; z++)
            for (int x = 0; x < layout.Size; x++)
            {
                int cell = z * layout.Size + x;
                uint expectedGround = M2InitialLayout.IsWaterCell(layout.Size, x, z) ? water << 8 : floor;
                uint expectedObstacle = x == 0 || z == 0 || x == layout.Size - 1 || z == layout.Size - 1 ? boundary
                    : M2InitialLayout.IsPillarCell(layout.Size, x, z) ? pillar << 8 : 0;
                if (read[cell].BlockId != expectedGround || read[area + cell].BlockId != expectedObstacle)
                    throw new InvalidOperationException("Initial Native base differs at an exact authored cell.");
            }
            int actualWater = 0, actualPillars = 0, potential = 0;
            for (int z = 1; z < layout.Size - 1; z++)
            for (int x = 1; x < layout.Size - 1; x++)
            {
                int i = z * layout.Size + x;
                if ((read[i].BlockId >> 8) == water) actualWater++;
                if ((read[area + i].BlockId >> 8) == pillar) actualPillars++;
                if (read[i].BlockId == floor && read[area + i].BlockId == 0) potential++;
            }
            if (actualWater != layout.Water || actualPillars != layout.Pillars || potential != layout.Potential)
                throw new InvalidOperationException("Initial Native cells do not match the validated M2 base.");
            foreach (var cell in layout.Cells)
                if (read[cell.Z * layout.Size + cell.X].BlockId != floor || read[area + cell.Z * layout.Size + cell.X].BlockId != 0)
                    throw new InvalidOperationException("Initial resource candidate is not known Native open land.");
            foreach (var cell in layout.Cells)
            {
                if (cell.Kind == M2CellKind.Barrel)
                {
                    int index = cell.Z * layout.Size + cell.X;
                    runtime.InitialBarrelReservations.Add(index);
                    var barrel = world.Commands.Create<BomberBarrelEntity>().Get<BomberBarrelState>();
                    barrel.ResourceGeneration.Value = 1;
                    barrel.InitialResourceMatch.Value = match.MatchId.Value;
                    barrel.InitialResourceCell.Value = index;
                    continue;
                }
                if (cell.Kind == M2CellKind.Soft) continue;
                var tier = config.Tables.Chest.Rows.Single(r => r.Name == cell.Kind.ToString());
                var order = world.Commands.Create<BomberChestEntity>();
                var chest = order.Get<BomberChestState>();
                chest.ResourceTier.Value = tier.Id; chest.ResourceGeneration.Value = 1;
                chest.RequiredHits.Value = chest.RemainingHits.Value = tier.IndependentBombHits;
                chest.InitialResourceMatch.Value = match.MatchId.Value;
                chest.InitialResourceCell.Value = cell.Z * layout.Size + cell.X;
            }
            runtime.InitialResourcePhase.Value = 2;
            return;
        }
        var adapter = VoxelGameplayBinding.Resolve(world.Manager)!;
        uint chestBlock = config.Tables.Blocks.Rows.Single(r => r.Name == "chest").BlockType;
        uint barrelBlock = config.Tables.Blocks.Rows.Single(r => r.Name == "barrel").BlockType;
        uint softBlock = config.Tables.Blocks.Rows.Single(r => r.Name == "softBrick").BlockType;
        if (!adapter.BindingPolicy.Any(p => p.BlockType == chestBlock) || !adapter.BindingPolicy.Any(p => p.BlockType == barrelBlock))
            adapter.SetBindingPolicy(adapter.BindingPolicy.Where(p => p.BlockType != chestBlock && p.BlockType != barrelBlock)
                .Concat(new[] { new VoxelBindingPolicyEntry(chestBlock, world.Registry.WireName(typeof(BomberChestEntity))),
                    new VoxelBindingPolicyEntry(barrelBlock, world.Registry.WireName(typeof(BomberBarrelEntity))) }).ToArray());
        else
            // Each match creates new chest identities. Runtime, as sole candidate-list
            // owner, must derive the now-live generation before its first bind.
            adapter.RefreshBindingContext();
        var production = layout.Cells.ToArray();
        var writes = new List<BomberPendingVoxelCell>();
        var bindings = new List<VoxelBindingOp>();
        foreach (var cell in production.Skip(runtime.InitialResourceCursor.Value).Take(128))
        {
            int index = cell.Z * layout.Size + cell.X;
            if (read[index].BlockId != floor || read[area + index].BlockId != 0)
                throw new InvalidOperationException("Initial resource target changed before staging.");
            var address = BomberTerrainTransactions.Address(config.Map, cell.X, config.Map.ObstacleLayer, cell.Z);
            NetEntityId chest = default;
            uint block = softBlock;
            if (cell.Kind != M2CellKind.Soft)
            {
                chest = cell.Kind == M2CellKind.Barrel
                    ? world.Each<BomberBarrelState>().Single(c => c.InitialResourceMatch.Value == match.MatchId.Value && c.InitialResourceCell.Value == index).Entity
                    : world.Each<BomberChestState>().Single(c => c.InitialResourceMatch.Value == match.MatchId.Value && c.InitialResourceCell.Value == index).Entity;
                block = cell.Kind == M2CellKind.Barrel ? barrelBlock : chestBlock;
                bindings.Add(new(address.Section, address.Offset, chest.ToHex()) { ExpectedSectionRevision = read[area + index].SectionRevision });
            }
            writes.Add(new(new(address.Section, address.Offset, block << 8, read[area + index].SectionRevision), 0,
                BomberVoxelIntentKind.Initialize, default, default, 0, default, chest, 0));
        }
        if (writes.Count != 0) BomberTerrainTransactions.Initialize(world, writes, bindings);
    }

    internal static void Accept(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        var layout = Read(runtime);
        int required = layout.Cells.Count;
        if (runtime.InitialResourceCursor.Value > required) throw new InvalidOperationException("Initial resource receipt counted twice.");
        if (runtime.InitialResourceCursor.Value != required) return;
        var read = BomberTerrainRead.For(world) ?? throw new InvalidOperationException("Initial completion requires Native cell evidence.");
        var config = BomberConfigBinding.For(world);
        var adapter = VoxelGameplayBinding.Resolve(world.Manager)!;
        int area = checked(layout.Size * layout.Size);
        foreach (var cell in layout.Cells)
        {
            int index = cell.Z * layout.Size + cell.X;
            uint block = config.Tables.Blocks.Rows.Single(r => r.Name == (cell.Kind == M2CellKind.Soft ? "softBrick" : cell.Kind == M2CellKind.Barrel ? "barrel" : "chest")).BlockType << 8;
            var address = BomberTerrainTransactions.Address(config.Map, cell.X, config.Map.ObstacleLayer, cell.Z);
            NetEntityId expected = cell.Kind == M2CellKind.Soft ? default : cell.Kind == M2CellKind.Barrel
                ? world.Each<BomberBarrelState>().Single(c => c.InitialResourceMatch.Value == world.Single<BomberMatchState>().MatchId.Value && c.InitialResourceCell.Value == index).Entity
                : world.Each<BomberChestState>().Single(c => c.InitialResourceMatch.Value == world.Single<BomberMatchState>().MatchId.Value && c.InitialResourceCell.Value == index).Entity;
            if (read[area + index].BlockId != block || adapter.BindingGet(address.Section, address.Offset) != (expected.IsDefault ? null : expected.ToHex()))
                throw new InvalidOperationException("Initial completion lost its exact Native resource or binding.");
        }
        runtime.TerrainInitialMatchId.Value = world.Single<BomberMatchState>().MatchId.Value;
        runtime.InitialResourcePhase.Value = 3;
        // Keep the bounded authored provenance; completion must still validate exact cells and counts.
    }

    private static M2Layout Read(BomberWorldRuntime runtime)
    {
        if (Encoding.UTF8.GetByteCount(runtime.InitialResourcePlan.Value) > PlanByteLimit)
            throw new InvalidOperationException("Initial resource input byte budget exceeded.");
        var layout = JsonSerializer.Deserialize<M2Layout>(runtime.InitialResourcePlan.Value)
            ?? throw new InvalidOperationException("Missing initial resource provenance.");
        ValidateLayout(layout);
        return layout;
    }

    internal static void ValidateMemory(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        ulong match = world.Single<BomberMatchState>().MatchId.Value;
        int phase = runtime.InitialResourcePhase.Value;
        int cursor = runtime.InitialResourceCursor.Value;
        var chests = world.Each<BomberChestState>().Where(c => world.IsLive(c.Entity) && c.InitialResourceMatch.Value != 0).ToArray();
        var boundBarrels = world.Each<BomberBarrelState>().Where(c => world.IsLive(c.Entity) && c.InitialResourceMatch.Value != 0).ToArray();
        bool ownedInitialize = runtime.PendingVoxelTransactionIds.Count == 1 &&
            runtime.PendingVoxelTransactionIds[0].StartsWith("bomber-terrain:", StringComparison.Ordinal) &&
            Enumerable.Range(0, runtime.PendingKinds.Count).Any(i => runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.Initialize);
        if (phase is < 0 or > 3 || (phase == 0) != (runtime.InitialResourcePlan.Value == "") ||
            (phase < 3 && runtime.TerrainInitialMatchId.Value != 0))
            throw new InvalidOperationException("Initial resource lifecycle has inconsistent persisted fields.");
        if (ownedInitialize && phase != 2)
            throw new InvalidOperationException("Owned initial pending work requires an active planned generation.");
        if (phase == 0)
        {
            if (cursor != 0 || runtime.InitialBarrelReservations.Count != 0 || chests.Length != 0 || boundBarrels.Length != 0)
                throw new InvalidOperationException("Inactive initial resources own no generation fields.");
            return;
        }
        var layout = Read(runtime);
        _ = BomberTerrainBudget.Calculate(config, layout);
        var production = layout.Cells.ToArray();
        if (layout.Size != config.Map.Width || layout.Size != config.Map.Depth || cursor < 0 || cursor > production.Length ||
            (phase == 1 && (cursor != 0 || runtime.InitialBarrelReservations.Count != 0 || chests.Length != 0 || boundBarrels.Length != 0)) ||
            (phase == 2 && (match == 0 || cursor >= production.Length || cursor % 128 != 0)) ||
            (phase == 3 && (match == 0 || runtime.TerrainInitialMatchId.Value != match || cursor != production.Length)))
            throw new InvalidOperationException("Initial resource cursor/counts do not match their lifecycle.");
        if (phase >= 2)
        {
            var barrels = layout.Cells.Where(c => c.Kind == M2CellKind.Barrel).Select(c => c.Z * layout.Size + c.X).OrderBy(c => c).ToArray();
            var actual = Enumerable.Range(0, runtime.InitialBarrelReservations.Count).Select(i => runtime.InitialBarrelReservations[i]).OrderBy(c => c);
            if (!barrels.SequenceEqual(actual)) throw new InvalidOperationException("Initial barrel reservations differ from their exact planned cells.");
            foreach (var chest in chests) ValidateChest(world, chest);
            foreach (var barrel in boundBarrels) ValidateBarrel(world, barrel);
            if (chests.Select(c => c.InitialResourceCell.Value).Distinct().Count() != chests.Length ||
                (phase == 2 && chests.Length != production.Count(c => c.Kind is not (M2CellKind.Soft or M2CellKind.Barrel))) ||
                boundBarrels.Select(c => c.InitialResourceCell.Value).Distinct().Count() != boundBarrels.Length ||
                boundBarrels.Length > layout.Count(M2CellKind.Barrel) || (phase == 2 && boundBarrels.Length != layout.Count(M2CellKind.Barrel)))
                throw new InvalidOperationException("Initial resource chest locations are duplicated or missing.");
        }
        if (ownedInitialize)
        {
            var batch = production.Skip(cursor).Take(128).ToArray();
            if (phase != 2 || batch.Length != runtime.PendingKinds.Count)
                throw new InvalidOperationException("Initial pending batch does not match its lifecycle cursor.");
            for (int i = 0; i < batch.Length; i++)
            {
                var cell = batch[i];
                var address = BomberTerrainTransactions.Address(config.Map, cell.X, config.Map.ObstacleLayer, cell.Z);
                uint block = config.Tables.Blocks.Rows.Single(r => r.Name == (cell.Kind == M2CellKind.Soft ? "softBrick" : cell.Kind == M2CellKind.Barrel ? "barrel" : "chest")).BlockType << 8;
                var chest = chests.SingleOrDefault(c => c.InitialResourceCell.Value == cell.Z * layout.Size + cell.X);
                var barrel = boundBarrels.SingleOrDefault(c => c.InitialResourceCell.Value == cell.Z * layout.Size + cell.X);
                if (runtime.PendingKinds[i] != (int)BomberVoxelIntentKind.Initialize ||
                    runtime.PendingSections[i] != address.Section || runtime.PendingCellOffsets[i] != address.Offset ||
                    runtime.PendingOldBlocks[i] != 0 || runtime.PendingNewBlocks[i] != block ||
                    runtime.PendingChests[i] != (cell.Kind == M2CellKind.Barrel ? barrel?.Entity ?? default : chest?.Entity ?? default))
                    throw new InvalidOperationException("Initial pending cell lost its exact plan/chest association.");
            }
        }
    }

    internal static void ValidateBarrel(World world, BomberBarrelState barrel)
    {
        if (barrel.InitialResourceMatch.Value == 0)
        {
            if (barrel.InitialResourceCell.Value != 0) throw new InvalidOperationException("Unowned initial barrel cell.");
            return;
        }
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        int index = barrel.InitialResourceCell.Value;
        if (runtime.InitialResourcePhase.Value is not (2 or 3) || barrel.InitialResourceMatch.Value != world.Single<BomberMatchState>().MatchId.Value ||
            barrel.ResourceGeneration.Value != 1 || index < 0 || index >= checked(config.Map.Width * config.Map.Depth) ||
            !Read(runtime).Cells.Any(c => c.Kind == M2CellKind.Barrel && c.X == index % config.Map.Width && c.Z == index / config.Map.Width) ||
            world.Each<BomberBarrelState>().Any(c => c.Entity != barrel.Entity && world.IsLive(c.Entity) &&
                c.InitialResourceMatch.Value == barrel.InitialResourceMatch.Value && c.InitialResourceCell.Value == index))
            throw new InvalidOperationException("Initial barrel does not uniquely match its planned cell and generation.");
    }

    internal static void ValidateChest(World world, BomberChestState chest)
    {
        if (chest.InitialResourceMatch.Value == 0)
        {
            if (chest.InitialResourceCell.Value != 0) throw new InvalidOperationException("Unowned initial chest cell.");
            return;
        }
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        int index = chest.InitialResourceCell.Value;
        if (runtime.InitialResourcePhase.Value is not (2 or 3) || chest.InitialResourceMatch.Value != world.Single<BomberMatchState>().MatchId.Value ||
            chest.ResourceGeneration.Value != 1 || index < 0 || index >= checked(config.Map.Width * config.Map.Depth))
            throw new InvalidOperationException("Initial chest match/cell/generation is invalid.");
        var layout = Read(runtime);
        var matches = layout.Cells.Where(c => c.X == index % config.Map.Width && c.Z == index / config.Map.Width &&
            c.Kind is M2CellKind.Wood or M2CellKind.Iron or M2CellKind.Gold).ToArray();
        if (layout.Size != config.Map.Width || layout.Size != config.Map.Depth || matches.Length != 1 ||
            chest.ResourceTier.Value != BomberResourceRewardRules.Named(config, matches[0].Kind.ToString()).Id ||
            world.Each<BomberChestState>().Any(c => c.Entity != chest.Entity && world.IsLive(c.Entity) &&
                c.InitialResourceMatch.Value == chest.InitialResourceMatch.Value && c.InitialResourceCell.Value == index))
            throw new InvalidOperationException("Initial chest does not uniquely match its planned cell and tier.");
    }
}
