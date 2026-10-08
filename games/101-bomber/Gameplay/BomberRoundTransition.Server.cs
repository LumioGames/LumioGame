using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

/// <summary>Old-match cleanup uses the ordinary persisted Native transaction owner.</summary>
internal static class BomberRoundTransition
{
    internal static bool CanMaterializePendingWealth(World world)
    {
        var match = world.Single<BomberMatchState>();
        var runtime = world.Single<BomberWorldRuntime>();
        if (match.Phase.Value == (int)BomberMatchPhase.Results && world.Tick >= match.PhaseEndTick.Value) return false;
        if (runtime.InitialResourcePhase.Value is 1 or 2) return false;
        return match.Phase.Value != (int)BomberMatchPhase.Warmup || runtime.InitialResourcePhase.Value == 3 ||
            BomberConfigBinding.For(world).Map.LayoutKind == "LegacyPillars";
    }

    internal static bool Prepare(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        if (BomberFavoriteFireZones.HasPending(world) || world.Each<BomberFireFacts>().Any(f => f.FireStatus.Count != 0)) return false;
        if (BomberCentralSupply.HasPending(world) || BomberRegeneration.HasPending(world) || BomberIceBridges.HasPending(world)) return false;
        if (runtime.PendingVoxelTransactionIds.Count != 0 || runtime.BarrelBombPromises.Value != "" || runtime.InitialResourcePhase.Value is 1 or 2 ||
            world.Each<BomberBombState>().Any(b => b.TerrainContinuations.Count != 0 ||
                Enumerable.Range(0, b.HitStates.Count).Any(i => b.HitStates[i] == (int)BomberHitStorageState.Pending)) ||
            world.Each<BomberParticipantState>().Any(p => p.DeathStructurePending.Value) ||
            world.Each<BomberHealthFacts>().Any(f => f.TypeId.Count != 0 && f.TypeId[0] != 0)) return false;

        bool retiringEffects = false;
        foreach (var effects in world.Each<EffectComponent>())
        foreach (var active in effects.ActiveEffects)
        {
            retiringEffects = true;
            _ = Effects.Remove(world, active.Handle);
        }
        if (retiringEffects) return false;

        // Completed results retire ordinary objects; accepted-but-unmaterialized wealth
        // remains owned by its old-match debt and gets the vacated space on later ticks.
        foreach (var item in world.Each<BomberPickupItem>().ToArray())
        {
            if (!item.ClaimedBy.Value.IsDefault) return false;
            world.Commands.Destroy(item.Entity);
        }
        if (world.Each<BomberPickupItem>().Any(item => world.IsLive(item.Entity) && item.SupplyMatchId.Value != 0))
            return false;
        if (world.Each<BomberBombState>().Any()) return false;
        var adapter = VoxelGameplayBinding.Resolve(world.Manager);
        if (adapter is null)
            return runtime.InitialResourcePhase.Value == 0;
        var read = BomberTerrainRead.For(world);
        if (read is null) return false;
        var config = BomberConfigBinding.For(world);
        int area = checked(config.Map.Width * config.Map.Depth);
        var writes = new List<BomberPendingVoxelCell>(128);
        for (int layer = 0; layer < 2; layer++)
        for (int z = 0; z < config.Map.Depth; z++)
        for (int x = 0; x < config.Map.Width; x++)
        {
            int y = layer == 0 ? config.Map.GroundLayer : config.Map.ObstacleLayer;
            var address = BomberTerrainTransactions.Address(config.Map, x, y, z);
            var cell = read[layer * area + z * config.Map.Width + x];
            uint expected = ExpectedBase(world, x, y, z);
            string? binding = adapter.BindingGet(address.Section, address.Offset);
            if (binding is not null)
            {
                if (!NetEntityId.TryParse(binding, out var chest) || !world.IsLive(chest) ||
                    y != config.Map.ObstacleLayer ||
                    !((world.TypeOf(chest).Is<BomberChestEntity>() && cell.BlockId >> 8 == config.Tables.Blocks.Rows.Single(row => row.Name == "chest").BlockType) ||
                      (world.TypeOf(chest).Is<BomberBarrelEntity>() && cell.BlockId >> 8 == config.Tables.Blocks.Rows.Single(row => row.Name == "barrel").BlockType)))
                    throw new InvalidOperationException("Round cleanup found a foreign sparse binding.");
                // Native DigThrough owns both the exact voxel and its bound entity retirement.
                // A late-circle chest may occupy a cleared authored pillar: retire its binding
                // first, then restore that cell's authored base in a following ordinary receipt.
                BomberTerrainTransactions.ClearRound(world, new[] { new BomberPendingVoxelCell(
                    new(address.Section, address.Offset, 0, cell.SectionRevision), cell.BlockId,
                    BomberVoxelIntentKind.Clear, default, default, 0, default, chest, 0) });
                return false;
            }
            if (cell.BlockId == expected || writes.Count == 128) continue;
            writes.Add(new(new(address.Section, address.Offset, expected, cell.SectionRevision), cell.BlockId,
                BomberVoxelIntentKind.Clear, default, default, 0, default, default, 0));
        }
        if (writes.Count != 0)
        {
            BomberTerrainTransactions.ClearRound(world, writes);
            return false;
        }
        return BomberTerrainTransactions.Occupied(world) == world.Each<BomberPickupItem>().Count();
    }

    internal static uint ExpectedBase(World world, int x, int y, int z)
    {
        var config = BomberConfigBinding.For(world);
        var map = config.Map;
        bool m2 = world.Single<BomberWorldRuntime>().InitialResourcePlan.Value.Length != 0 || map.LayoutKind != "LegacyPillars";
        uint Block(string name) => config.Tables.Blocks.Rows.Single(r => r.Name == name).BlockType << 8;
        if (y == map.GroundLayer) return Block(m2 && M2InitialLayout.IsWaterCell(map.Width, x, z) ? "water" : "floor");
        if (y != map.ObstacleLayer) throw new InvalidOperationException("Round cleanup is outside the declared terrain layers.");
        if (x < map.BoundaryCells || z < map.BoundaryCells || x >= map.Width - map.BoundaryCells || z >= map.Depth - map.BoundaryCells)
            return Block("iron");
        bool pillar = m2 ? M2InitialLayout.IsPillarCell(map.Width, x, z) : x % map.HardPillarStride == 0 && z % map.HardPillarStride == 0;
        return pillar ? Block("hardPillar") : 0;
    }

    internal static void ValidateClear(World world, int index)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        var match = world.Single<BomberMatchState>();
        var map = BomberConfigBinding.For(world).Map;
        if (match.Phase.Value != (int)BomberMatchPhase.Results || world.Tick < match.PhaseEndTick.Value ||
            !runtime.PendingParticipants[index].IsDefault || !runtime.PendingSourceLives[index].IsDefault ||
            runtime.PendingSourceLifeGenerations[index] != 0 || !runtime.PendingSourceBombs[index].IsDefault ||
            runtime.PendingChainIds[index] != 0)
            throw new InvalidOperationException("Round cleanup is not an ownerless post-results intent.");
        for (int layer = 0; layer < 2; layer++)
        for (int z = 0; z < map.Depth; z++)
        for (int x = 0; x < map.Width; x++)
        {
            int y = layer == 0 ? map.GroundLayer : map.ObstacleLayer;
            var address = BomberTerrainTransactions.Address(map, x, y, z);
            if (address.Section != runtime.PendingSections[index] || address.Offset != runtime.PendingCellOffsets[index]) continue;
            bool bound = !runtime.PendingChests[index].IsDefault;
            if (runtime.PendingNewBlocks[index] != (bound ? 0 : ExpectedBase(world, x, y, z)) ||
                (bound && (runtime.PendingKinds.Count != 1 || y != map.ObstacleLayer ||
                    !BomberConfigBinding.For(world).Tables.Blocks.Rows.Any(row => (row.Name is "chest" or "barrel") &&
                        row.BlockType == runtime.PendingOldBlocks[index] >> 8))))
                throw new InvalidOperationException("Round cleanup no longer identifies the exact authored base.");
            return;
        }
        throw new InvalidOperationException("Round cleanup cell is outside the declared map.");
    }

    internal static void StartNextGeneration(World world, ulong seed)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        if (runtime.PendingVoxelTransactionIds.Count != 0 || runtime.BarrelBombPromises.Value != "" || world.Each<BomberBarrelState>().Any())
            throw new InvalidOperationException("A new match cannot change the identity of an outstanding terrain receipt.");
        if (BomberCentralSupply.HasPending(world))
            throw new InvalidOperationException("A new match cannot discard unpublished central supply.");
        if (BomberIceBridges.HasPending(world) || world.Each<BomberIceBridgeState>().Any())
            throw new InvalidOperationException("A new match cannot discard a bridge binding or retirement owner.");
        if (BomberFavoriteFireZones.HasPending(world) || world.Each<BomberFireZoneState>().Any(z => z.RegionCoverage.Value) ||
            world.Each<BomberFireFacts>().Any(f => f.FireStatus.Count != 0))
            throw new InvalidOperationException("A new match cannot discard retained fire source or finite/result debt.");
        BomberRegeneration.ResetForNextMatch(world);
        runtime.SupplyAnnouncedMatchId.Value = 0;
        runtime.SupplyIssuedMatchId.Value = 0;
        string plan = runtime.InitialResourcePlan.Value.Length == 0 ? "" :
            BomberInitialResources.EncodePlan(M2InitialLayout.Plan(BomberConfigBinding.For(world).Map.Width, seed));
        runtime.TerrainInitialMatchId.Value = 0;
        runtime.InitialResourceCursor.Value = 0;
        runtime.InitialResourcePlan.Value = plan;
        runtime.InitialResourcePhase.Value = plan.Length == 0 ? 0 : 1;
        runtime.InitialBarrelReservations.Clear();
        runtime.BombPlacementTick.Value = runtime.BombPlacementMatchId.Value = 0;
        runtime.BombPlacementCells.Clear();
        runtime.BombPlacementParticipants.Clear();
        foreach (var chest in world.Each<BomberChestState>().ToArray()) world.Commands.Destroy(chest.Entity);
        foreach (var fire in world.Each<BomberFireZoneState>().Where(f => !f.RegionCoverage.Value).ToArray()) world.Commands.Destroy(fire.Entity);
    }

    internal static void ResetParticipant(World world, BomberParticipantState participant)
    {
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        // Non-spendable transfer debt keeps its original match/life tuple until actual placement.
        // Only spendable respawn inheritance belongs to the ending match.
        carry.CarryPresent.Value = false;
        carry.PowerBase.Value = carry.CapacityBase.Value = carry.SpeedTierBase.Value = carry.AvailableBombs.Value = 0;
        carry.CharacterId.Value = 0;
        carry.BombSkillId.Value = carry.BombLevel.Value = 0;
        carry.BombBound.Value = false;
        carry.BombCombinationOriginA.Value = carry.BombOriginALevel.Value = carry.BombCombinationOriginB.Value = carry.BombOriginBLevel.Value = 0;
        carry.BombOriginABound.Value = carry.BombOriginBBound.Value = false;
        carry.ActiveSkillId.Value = carry.ActiveLevel.Value = 0;
        carry.ActiveBound.Value = false;
        carry.ActiveCombinationOriginA.Value = carry.ActiveOriginALevel.Value = carry.ActiveCombinationOriginB.Value = carry.ActiveOriginBLevel.Value = 0;
        carry.ActiveOriginABound.Value = carry.ActiveOriginBBound.Value = false;
        carry.PassiveSkillId.Value = carry.PassiveLevel.Value = 0;
        carry.PassiveBound.Value = false;
        carry.PassiveCombinationOriginA.Value = carry.PassiveOriginALevel.Value = carry.PassiveCombinationOriginB.Value = carry.PassiveOriginBLevel.Value = 0;
        carry.PassiveOriginABound.Value = carry.PassiveOriginBBound.Value = false;
        if (!participant.DeathDropPending.Value)
        {
            carry.PendingBombLevel.Value = 0;
            carry.DropMatchId.Value = carry.DropGeneration.Value = carry.DropOccurrenceTick.Value = 0;
            carry.DropLife.Value = default;
            carry.DropOriginX.Value = carry.DropOriginZ.Value = carry.SelectedDropCount.Value = carry.PlacedDropCount.Value = 0;
            participant.DeathCellX.Value = participant.DeathCellZ.Value = 0;
            participant.TerminalLife.Value = default;
            participant.TerminalGeneration.Value = participant.TerminalMatchId.Value = participant.TerminalOccurrenceTick.Value = 0;
            participant.TerminalCaptureTick.Value = participant.TerminalDestructionTick.Value = participant.DeathConsumedCount.Value = 0;
            participant.TerminalBaseSample.Clear();
            participant.TerminalCurrentSample.Clear();
        }
        if (participant.CurrentLife.Value.IsDefault || !world.IsLive(participant.CurrentLife.Value)) return;
        var skill = world.Get<BomberSkillState>(participant.CurrentLife.Value);
        skill.BombSkillId.Value = skill.ComboSourceA.Value = skill.ComboSourceB.Value = 0;
        skill.BombSkillLevel.Value = skill.ComboLevelA.Value = skill.ComboLevelB.Value = 0;
        skill.BombSkillBound.Value = false;
        skill.CooldownFromTick.Value = skill.CooldownUntilTick.Value = 0;
        skill.BubbleUntilTick.Value = skill.AuraUntilTick.Value = skill.FrozenUntilTick.Value = skill.FreezeImmuneUntilTick.Value = 0;
        skill.ToxinUntilTick.Value = skill.ShockUntilTick.Value = skill.LastDamageTick.Value = skill.RegenNextTick.Value = 0;
        skill.ToxinSource.Value = default;
        skill.TeleportSequence.Value = 0;
        skill.BubbleEffectWorld.Value = skill.BubbleEffectInstance.Value = skill.BubbleDurationTicks.Value = skill.BubbleCooldownTicks.Value = 0;
        skill.BubbleEffectGeneration.Value = 0;
        skill.BubbleOutcome.Value = skill.BubbleCastX.Value = skill.BubbleCastZ.Value = 0;
        skill.FreezeRequestTick.Value = skill.FreezeDurationTicks.Value = skill.FreezeImmunityDurationTicks.Value = 0;
        skill.FreezeEffectWorld.Value = skill.FreezeEffectInstance.Value = skill.FreezeImmunityEffectWorld.Value = skill.FreezeImmunityEffectInstance.Value = 0;
        skill.FreezeEffectGeneration.Value = skill.FreezeImmunityEffectGeneration.Value = 0;
    }
}
