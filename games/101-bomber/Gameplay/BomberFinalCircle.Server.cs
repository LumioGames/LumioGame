using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

/// <summary>Consumes the existing Native circle machine and original terrain receipts.</summary>
internal static class BomberFinalCircle
{
    internal static bool ResourceThresholdReached(World world, BomberMatchState match, IBomberConfig config)
    {
        ulong duration = Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        // A running match has a full-match deadline. No unsigned subtraction may
        // turn an earlier (e.g. restored lobby) deadline into a future schedule.
        if (match.PhaseEndTick.Value < duration) return false;
        var circle = world.Single<BomberFinalCircleState>();
        var read = BomberTerrainRead.For(world);
        var adapter = VoxelGameplayBinding.Resolve(world.Manager);
        if (read is null || adapter is null) return false;
        int remaining = 0, area = checked(config.Map.Width * config.Map.Depth);
        for (int z = 0; z < config.Map.Depth; z++)
        for (int x = 0; x < config.Map.Width; x++)
        {
            var cell = read[area + z * config.Map.Width + x];
            var block = config.Tables.Blocks.Rows.SingleOrDefault(row => row.BlockType == cell.BlockId >> 8);
            if (block.Name == "softBrick") remaining++;
            else if (block.Name == "chest")
            {
                var address = BomberTerrainTransactions.Address(config.Map, x, config.Map.ObstacleLayer, z);
                string? binding = adapter.BindingGet(address.Section, address.Offset);
                if (binding is null || !NetEntityId.TryParse(binding, out var entity) || !world.IsLive(entity) ||
                    !world.TypeOf(entity).Is<BomberChestEntity>())
                    throw new InvalidOperationException("Resource census found an invalid Native chest binding.");
                var chest = world.Get<BomberChestState>(entity);
                chest.ValidateStorage();
                if (chest.ResourceTier.Value == 0) continue;
                var tier = config.Tables.Chest.Rows.Single(row => row.Id == chest.ResourceTier.Value);
                if (tier.Name is "Wood" or "Iron" or "Gold") remaining++;
            }
        }
        if (!circle.ResourceCountInitialized.Value)
        {
            ulong timeTrigger = match.PhaseEndTick.Value - duration;
            ulong lead = Ticks.FromMilliseconds(config.Regeneration.StopBeforeFinalMs, config.Game.TickRateHz);
            circle.InitialResourceCount.Value = remaining;
            circle.RegenStopTick.Value = timeTrigger > lead ? timeTrigger - lead : 0;
            circle.ResourceCountInitialized.Value = true;
        }
        else if (circle.InitialResourceCount.Value < 0 || circle.InitialResourceCount.Value > area)
            throw new InvalidOperationException("Initial resource census exceeds its map bounds.");
        circle.RemainingResourceCount.Value = remaining;
        return circle.InitialResourceCount.Value > 0 && world.Tick >= circle.RegenStopTick.Value &&
            checked((long)remaining * 1000) < checked((long)circle.InitialResourceCount.Value * config.FinalCircle.ResourceThresholdPermille);
    }

    internal static void Advance(World world)
    {
        var match = world.Single<BomberMatchState>();
        if (match.Phase.Value != (int)BomberMatchPhase.FinalCircle)
        {
            if (world.Single<BomberFinalCircleState>().TriggerTick.Value != 0 &&
                match.Phase.Value is (int)BomberMatchPhase.Podium or (int)BomberMatchPhase.Results)
                Finish(world);
            return;
        }
        var config = BomberConfigBinding.For(world);
        var stages = config.Tables.CircleStages.Rows.OrderBy(row => row.AtMs).ToArray();
        if (stages.Length is < 1 or > 32) throw new InvalidOperationException("Invalid circle stage count.");
        var circle = world.Single<BomberFinalCircleState>();
        uint allowedClears = 0;
        for (int i = 0; i < stages.Length; i++)
            if (stages[i].ClearSoft && checked(circle.TriggerTick.Value + Ticks.FromMilliseconds(stages[i].AtMs, config.Game.TickRateHz)) <= world.Tick)
                allowedClears |= 1u << i;
        if ((circle.ClearedStageMask.Value & ~allowedClears) != 0)
            throw new InvalidOperationException("Circle completion memory names an ineligible stage.");
        var machine = world.Single<BomberFinalCircleHfsmState>();
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FinalCircle);
        for (int steps = 0; steps < stages.Length * 2 + 1; steps++)
        {
            var snapshot = machine.ReadSnapshot(definition, machine.MachineKey.Value);
            uint leaf = snapshot.ActivePath[^1].State;
            if (leaf == BomberHfsmDefinitions.State.CircleFinished) break;
            int current = circle.CurrentStageId.Value == 0 ? -1 : Array.FindIndex(stages, row => row.Id == circle.CurrentStageId.Value);
            if (circle.CurrentStageId.Value != 0 && current < 0) throw new InvalidOperationException("Unknown current circle stage.");
            if (current >= 0 && (circle.CurrentSide.Value != stages[current].SideCells || circle.PoisonPoints.Value != stages[current].PoisonPoints))
                throw new InvalidOperationException("Circle geometry disagrees with its applied stage.");
            int next = current + 1;
            if (next >= stages.Length) break;
            var stage = stages[next];
            ulong effective = checked(circle.TriggerTick.Value + Ticks.FromMilliseconds(stage.AtMs, config.Game.TickRateHz));
            ulong preview = Ticks.FromMilliseconds(config.FinalCircle.PreviewMs, config.Game.TickRateHz);
            if (effective < preview || effective - preview < circle.TriggerTick.Value)
                throw new InvalidOperationException("Circle preview precedes its trigger.");
            uint eventId;
            if (leaf == BomberHfsmDefinitions.State.CirclePreview)
            {
                if (circle.NextStageId.Value != stage.Id || circle.NextEffectiveTick.Value != effective ||
                    circle.NextSide.Value != stage.SideCells || circle.NextAnnounceTick.Value != effective - preview)
                    throw new InvalidOperationException("Circle preview disagrees with its Native state.");
                if (world.Tick < effective) break;
                eventId = BomberHfsmDefinitions.EventId.StageDue;
            }
            else if (leaf is BomberHfsmDefinitions.State.CircleInactive or BomberHfsmDefinitions.State.CircleEffective)
            {
                if (world.Tick < effective - preview) break;
                eventId = leaf == BomberHfsmDefinitions.State.CircleInactive
                    ? BomberHfsmDefinitions.EventId.CircleBegin : BomberHfsmDefinitions.EventId.MoreStages;
            }
            else throw new InvalidOperationException("An active circle has an invalid Native leaf.");
            var plan = definition.Send(snapshot, eventId);
            if (plan.Outcome != HfsmOutcome.Transitioned || !machine.StorePlan(plan, definition, machine.MachineKey.Value))
                throw new InvalidOperationException("Native rejected the due circle transition.");
            foreach (var action in plan.Actions)
            {
                switch (action.Action)
                {
                    case BomberHfsmDefinitions.Action.BeginCircle:
                        circle.CurrentSide.Value = config.Map.Width;
                        break;
                    case BomberHfsmDefinitions.Action.AnnounceStage:
                        circle.NextStageId.Value = checked((int)stage.Id);
                        circle.NextSide.Value = stage.SideCells;
                        circle.NextAnnounceTick.Value = effective - preview;
                        circle.NextEffectiveTick.Value = effective;
                        Journal(world, "circle_preview", stage.Id, stage.SideCells, effective);
                        break;
                    case BomberHfsmDefinitions.Action.ApplyStage:
                        circle.CurrentStageId.Value = checked((int)stage.Id);
                        circle.CurrentSide.Value = stage.SideCells;
                        circle.PoisonPoints.Value = checked((int)stage.PoisonPoints);
                        circle.NextStageId.Value = circle.NextSide.Value = 0;
                        circle.NextAnnounceTick.Value = circle.NextEffectiveTick.Value = 0;
                        Journal(world, "circle_effective", stage.Id, stage.SideCells, effective);
                        break;
                    default: throw new InvalidOperationException("Unsupported Native circle action.");
                }
            }
        }
        // A refused or interrupted clear remains due. Completion is published only
        // after its original receipt was consumed and the real Native cells are empty.
        for (int i = 0; i < stages.Length; i++)
        {
            var stage = stages[i];
            ulong effective = checked(circle.TriggerTick.Value + Ticks.FromMilliseconds(stage.AtMs, config.Game.TickRateHz));
            if (!stage.ClearSoft || world.Tick < effective || circle.ClearCompleted(i)) continue;
            if (!Clear(world, stage.Id, stage.SideCells)) break;
            circle.CompleteClear(i);
        }
        BomberStrongChests.Produce(world);
        if (world.Tick >= match.PhaseEndTick.Value) Finish(world);
    }

    private static void Finish(World world)
    {
        var machine = world.Single<BomberFinalCircleHfsmState>();
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FinalCircle);
        var snapshot = machine.ReadSnapshot(definition, machine.MachineKey.Value);
        if (snapshot.ActivePath[^1].State != BomberHfsmDefinitions.State.CircleFinished)
        {
            var plan = definition.Send(snapshot, BomberHfsmDefinitions.EventId.AllStagesDone);
            if (plan.Outcome != HfsmOutcome.Transitioned || !machine.StorePlan(plan, definition, machine.MachineKey.Value) ||
                plan.Actions.Count != 1 || plan.Actions[0].Action != BomberHfsmDefinitions.Action.FinishCircle)
                throw new InvalidOperationException("Native rejected the circle settlement.");
        }
    }

    internal static void Reset(World world)
    {
        var machine = world.Single<BomberFinalCircleHfsmState>();
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FinalCircle);
        var before = machine.ReadSnapshot(definition, machine.MachineKey.Value);
        var start = definition.Start(before.MachineKey, checked(before.Epoch + 1));
        if (start.Outcome != HfsmOutcome.Started || start.Actions.Count != 0 ||
            !machine.StorePlan(start, definition, before.MachineKey))
            throw new InvalidOperationException("Native rejected the next match circle initialization.");
        world.Single<BomberFinalCircleState>().ResetClear();
    }

    private static bool Clear(World world, uint stageId, int side)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        if (runtime.PendingVoxelTransactionIds.Count != 0) return false;
        var read = BomberTerrainRead.For(world);
        var adapter = VoxelGameplayBinding.Resolve(world.Manager);
        if (read is null || adapter is null) return false;
        var config = BomberConfigBinding.For(world);
        var map = config.Map;
        int startX = (map.Width - side) / 2, startZ = (map.Depth - side) / 2;
        var writes = new List<BomberPendingVoxelCell>(25);
        for (int z = startZ; z < startZ + side; z++)
        for (int x = startX; x < startX + side; x++)
        {
            var cell = read[map.Width * map.Depth + z * map.Width + x];
            var block = config.Tables.Blocks.Rows.SingleOrDefault(row => row.BlockType == cell.BlockId >> 8);
            if (!Clearable(block.Name)) continue;
            var address = BomberTerrainTransactions.Address(map, x, map.ObstacleLayer, z);
            NetEntityId chest = default;
            string? binding = adapter.BindingGet(address.Section, address.Offset);
            if (block.SparseBinding != "none")
            {
                if (binding is null || !NetEntityId.TryParse(binding, out chest) || !world.IsLive(chest) ||
                    !world.TypeOf(chest).Is<BomberChestEntity>())
                    throw new InvalidOperationException("Circle clear found an invalid resource chest binding.");
                var state = world.Get<BomberChestState>(chest);
                state.ValidateStorage();
                if (state.ResourceTier.Value == 0) continue;
                var tier = config.Tables.Chest.Rows.Single(row => row.Id == state.ResourceTier.Value);
                if (tier.Name is not ("Wood" or "Iron" or "Gold")) continue;
            }
            else if (binding is not null) throw new InvalidOperationException("Soft circle cell has a foreign sparse binding.");
            var intent = new BomberPendingVoxelCell(new(address.Section, address.Offset, 0, cell.SectionRevision), cell.BlockId,
                BomberVoxelIntentKind.CircleClear, default, default, 0, default, chest, 0);
            // DigThrough owns the bound entity retirement and must remain a single-cell operation.
            if (!chest.IsDefault)
            {
                BomberTerrainTransactions.ClearCircle(world, new[] { intent }, stageId);
                return false;
            }
            writes.Add(intent);
        }
        if (writes.Count == 0) return true;
        BomberTerrainTransactions.ClearCircle(world, writes, stageId);
        return false;
    }

    internal static void ValidateClear(World world, int index, BomberTerrainDetail detail)
    {
        var config = BomberConfigBinding.For(world);
        var circle = world.Single<BomberFinalCircleState>();
        var stage = config.Tables.CircleStages.Rows.SingleOrDefault(row => row.Id == detail.CircleStage);
        var runtime = world.Single<BomberWorldRuntime>();
        var block = config.Tables.Blocks.Rows.SingleOrDefault(row => row.BlockType == runtime.PendingOldBlocks[index] >> 8);
        if (stage.Id == 0 || !stage.ClearSoft || circle.TriggerTick.Value == 0 || !Clearable(block.Name) ||
            checked(circle.TriggerTick.Value + Ticks.FromMilliseconds(stage.AtMs, config.Game.TickRateHz)) > runtime.PendingVoxelSubmittedTicks[0] ||
            runtime.PendingNewBlocks[index] != 0 || !runtime.PendingParticipants[index].IsDefault ||
            !runtime.PendingSourceLives[index].IsDefault || runtime.PendingSourceLifeGenerations[index] != 0 ||
            !runtime.PendingSourceBombs[index].IsDefault || runtime.PendingChainIds[index] != 0 ||
            (block.SparseBinding == "none") != runtime.PendingChests[index].IsDefault ||
            (!runtime.PendingChests[index].IsDefault && runtime.PendingKinds.Count != 1))
            throw new InvalidOperationException("Circle clear lost its exact ownerless stage provenance.");
        if (runtime.PendingChests[index].IsDefault)
        {
            if (detail.Tier != 0 || detail.CellGeneration != 0)
                throw new InvalidOperationException("Unbound circle clear has a chest identity.");
        }
        else
        {
            var tier = config.Tables.Chest.Rows.SingleOrDefault(row => row.Id == detail.Tier);
            if (tier.Name is not ("Wood" or "Iron" or "Gold") || detail.CellGeneration == 0)
                throw new InvalidOperationException("Circle clear does not identify a resource chest generation.");
            if (world.IsLive(runtime.PendingChests[index]))
            {
                var chest = world.Get<BomberChestState>(runtime.PendingChests[index]);
                if (chest.ResourceTier.Value != detail.Tier || chest.ResourceGeneration.Value != detail.CellGeneration)
                    throw new InvalidOperationException("Circle clear resource generation changed before receipt.");
            }
        }
        int startX = (config.Map.Width - stage.SideCells) / 2, startZ = (config.Map.Depth - stage.SideCells) / 2;
        for (int z = startZ; z < startZ + stage.SideCells; z++)
        for (int x = startX; x < startX + stage.SideCells; x++)
        {
            var address = BomberTerrainTransactions.Address(config.Map, x, config.Map.ObstacleLayer, z);
            if (address.Section == runtime.PendingSections[index] && address.Offset == runtime.PendingCellOffsets[index]) return;
        }
        throw new InvalidOperationException("Circle clear cell is outside its original stage bounds.");
    }

    private static bool Clearable(string? block) => block is "softBrick" or "chest";

    private static void Journal(World world, string kind, uint stage, int side, ulong effective)
    {
        var match = world.Single<BomberMatchState>();
        world.Single<BomberPresentationJournal>().Append(world, kind, match.MatchId.Value,
            world.Single<BomberWorldRuntime>().AllocateEventSequence(), data: new Dictionary<string, string>
            {
                ["stageId"] = stage.ToString(CultureInfo.InvariantCulture),
                ["side"] = side.ToString(CultureInfo.InvariantCulture),
                ["effectiveTick"] = effective.ToString(CultureInfo.InvariantCulture),
            });
    }
}
