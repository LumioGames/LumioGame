using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Persistence;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFinalCircleProductionTests
{
    [Fact]
    public void RealNativeCircleAnnouncesAndAppliesEveryAuthoredStageAtItsExactTick()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true);
        var world = scene.World;
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        var circle = world.Single<BomberFinalCircleState>();
        foreach (var life in scene.Lives)
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(9.5f, 1.5f, 9.5f));
        // Place the existing authoritative match at its time-trigger boundary;
        // every subsequent Tick and stage duration remains the actual configured value.
        match.PhaseEndTick.Value = world.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        scene.Manager.Tick();
        ulong trigger = circle.TriggerTick.Value;
        Assert.Equal((int)BomberMatchPhase.FinalCircle, match.Phase.Value);
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FinalCircle);
        var machine = world.Single<BomberFinalCircleHfsmState>();
        foreach (var stage in config.Tables.CircleStages.Rows.OrderBy(row => row.AtMs))
        {
            ulong effective = trigger + Ticks.FromMilliseconds(stage.AtMs, config.Game.TickRateHz);
            ulong announce = effective - Ticks.FromMilliseconds(config.FinalCircle.PreviewMs, config.Game.TickRateHz);
            while (world.Tick <= announce) scene.Manager.Tick();
            Assert.Equal((int)stage.Id, circle.NextStageId.Value);
            Assert.Equal(stage.SideCells, circle.NextSide.Value);
            Assert.Equal(effective, circle.NextEffectiveTick.Value);
            Assert.Equal(BomberHfsmDefinitions.State.CirclePreview,
                machine.ReadSnapshot(definition, machine.MachineKey.Value).ActivePath[^1].State);
            while (world.Tick < effective) scene.Manager.Tick();
            Assert.NotEqual((int)stage.Id, circle.CurrentStageId.Value);
            ulong sequence = machine.StepSeq.Value;
            scene.Manager.Tick();
            Assert.Equal((int)stage.Id, circle.CurrentStageId.Value);
            Assert.Equal(stage.SideCells, circle.CurrentSide.Value);
            Assert.Equal((int)stage.PoisonPoints, circle.PoisonPoints.Value);
            Assert.True(machine.StepSeq.Value > sequence);
            Assert.Equal(BomberHfsmDefinitions.State.CircleEffective,
                machine.ReadSnapshot(definition, machine.MachineKey.Value).ActivePath[^1].State);
        }
        Assert.Equal(1, circle.CurrentSide.Value);
        Assert.Equal(trigger + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz), match.PhaseEndTick.Value);
    }

    [Fact]
    public void FiveCellStageClearsOnlyInteriorSoftTerrainThroughAnOriginalNativeReceipt()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true);
        var world = scene.World;
        var config = BomberConfigBinding.For(world);
        foreach (var life in scene.Lives)
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(9.5f, 1.5f, 9.5f));
        scene.Write(9, 1, 9, 1025u << 8);
        scene.Write(6, 1, 9, 1025u << 8);
        scene.Write(8, 1, 9, 1023u << 8);
        var match = world.Single<BomberMatchState>();
        match.PhaseEndTick.Value = world.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        scene.Manager.Tick();
        ulong trigger = world.Single<BomberFinalCircleState>().TriggerTick.Value;
        var stage = config.Tables.CircleStages.Rows.Single(row => row.SideCells == 5);
        ulong effective = trigger + Ticks.FromMilliseconds(stage.AtMs, config.Game.TickRateHz);
        while (world.Tick <= effective) scene.Manager.Tick();
        var runtime = world.Single<BomberWorldRuntime>();
        Assert.Equal((int)stage.Id, world.Single<BomberFinalCircleState>().CurrentStageId.Value);
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(9, 1, 9)).BlockId);
        Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 9)).BlockId);
        Assert.Equal(1023u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(8, 1, 9)).BlockId);
        scene.Manager.Tick();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Empty(world.Each<BomberPickupItem>());
        Assert.Equal(0, runtime.TerrainRewards.Count);
        Assert.All(world.Each<BomberStatistics>(), state => Assert.Equal(0, state.DestroyedBlocks.Value));
    }

    [Theory]
    [InlineData("Wood", false)]
    [InlineData("Iron", false)]
    [InlineData("Gold", false)]
    [InlineData("default", true)]
    public void CircleClearUsesBoundEntityRetirementAndPreservesStrongChest(string tier, bool remains)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true);
        var world = scene.World;
        var order = world.Commands.Create<BomberChestEntity>();
        scene.Manager.Tick();
        var chest = world.Get<BomberChestState>(order.AssignedId);
        if (tier == "default") chest.InitializeHitBudget();
        else chest.InitializeTier(BomberConfigBinding.For(world).Tables.Chest.Rows.Single(row => row.Name == tier).Id, 1);
        var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(world).Map, 9, 1, 9);
        scene.Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1028, world.Registry.WireName(typeof(BomberChestEntity))) });
        var native = scene.Native.ReadCell(new VoxelWorldCoordinate(9, 1, 9));
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageMutation(
            new[] { new VoxelWriteEntry(address.Section, address.Offset, 1028u << 8, native.SectionRevision) },
            new[] { new VoxelBindingOp(address.Section, address.Offset, order.AssignedId.ToHex()) { ExpectedSectionRevision = native.SectionRevision } },
            "circle-fixture-chest").Status);
        scene.Manager.Tick();
        AdvanceToFive(scene);
        Assert.Equal(remains, world.IsLive(order.AssignedId));
        Assert.Equal(remains ? 1028u << 8 : 0u, scene.Native.ReadCell(new VoxelWorldCoordinate(9, 1, 9)).BlockId);
        Assert.Equal(remains ? order.AssignedId.ToHex() : null, scene.Adapter.BindingGet(address.Section, address.Offset));
        scene.Manager.Tick();
        Assert.Equal(0, world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        Assert.Empty(world.Each<BomberPickupItem>());
        Assert.Equal(0, world.Single<BomberWorldRuntime>().TerrainRewards.Count);
        Assert.All(world.Each<BomberStatistics>(), state => Assert.Equal(0, state.DestroyedBlocks.Value));
        Assert.Empty(BomberChestJournalTests.Rows(world, "chest_hit"));
        Assert.Empty(BomberChestJournalTests.Rows(world, "final_chest_opened"));
        Assert.Empty(BomberChestJournalTests.Rows(world, "crate_opened"));
    }

    [Fact]
    public void RefusedCircleClearKeepsItsOriginalObligationAndRetriesAfterRealBudgetRecovery()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true, budget: new WorldIngressBudget(1, 1, 1, 1));
        scene.Write(9, 1, 9, 1025u << 8);
        AdvanceToFive(scene);
        Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(9, 1, 9)).BlockId);
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        for (int i = 0; i < 3; i++) scene.Manager.Tick();
        Assert.False(scene.World.Single<BomberFinalCircleState>().ClearCompleted(3));
        var owner = NativeWorldVoxelResources.Require(scene.Manager).Adapter;
        using var binding = VoxelGameplayBinding.Bind(scene.Manager, owner);
        scene.Manager.BindVoxelTick(owner.PrepareVoxel, owner.CommitVoxel);
        scene.Manager.Tick();
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(9, 1, 9)).BlockId);
        Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        scene.Manager.Tick();
        Assert.True(scene.World.Single<BomberFinalCircleState>().ClearCompleted(3));
        Assert.Empty(scene.World.Each<BomberPickupItem>());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void PairedRestoreResumesOriginalCircleReceiptAndNeverRepeatsACompletedStage(bool completed)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true, persistence: true);
        scene.Write(9, 1, 9, 1025u << 8);
        AdvanceToFive(scene);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string transaction = runtime.PendingVoxelTransactionIds[0];
        if (completed) scene.Manager.Tick();
        Assert.Equal(completed, scene.World.Single<BomberFinalCircleState>().ClearCompleted(3));
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        using var restored = BomberTestWorld.RestorePaired(capture.Checkpoint!.Value);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        var state = restored.World.Single<BomberFinalCircleState>();
        Assert.Equal(completed, state.ClearCompleted(3));
        if (!completed) Assert.Equal(transaction, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds[0]);
        ulong sequence = restored.World.Single<BomberFinalCircleHfsmState>().StepSeq.Value;
        restored.Tick();
        Assert.True(state.ClearCompleted(3));
        Assert.Equal(0, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        Assert.Equal(sequence, restored.World.Single<BomberFinalCircleHfsmState>().StepSeq.Value);
        Assert.Empty(restored.World.Each<BomberPickupItem>());
        Assert.All(restored.World.Each<BomberStatistics>(), statistics => Assert.Equal(0, statistics.DestroyedBlocks.Value));
        // A completed event is not a permanent scrubber. This later external
        // Native mutation belongs to another operation and survives this stage.
        scene.Manager.Tick();
        scene.Write(9, 1, 9, 1025u << 8);
        scene.Manager.Tick();
        Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(9, 1, 9)).BlockId);
    }

    private static void AdvanceToFive(BomberTerrainProductionTests.Scene scene)
    {
        var world = scene.World;
        var config = BomberConfigBinding.For(world);
        foreach (var life in scene.Lives)
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(9.5f, 1.5f, 9.5f));
        world.Single<BomberMatchState>().PhaseEndTick.Value = world.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        scene.Manager.Tick();
        ulong effective = world.Single<BomberFinalCircleState>().TriggerTick.Value +
            Ticks.FromMilliseconds(config.Tables.CircleStages.Rows.Single(stage => stage.SideCells == 5).AtMs, config.Game.TickRateHz);
        while (world.Tick <= effective) scene.Manager.Tick();
    }

    [Fact]
    public void RealCircleDeadlineSettlesAllEightThenResetsNativeMachineForSameRoomNextMatch()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true);
        AdvanceToFive(scene);
        var world = scene.World;
        var match = world.Single<BomberMatchState>();
        var machine = world.Single<BomberFinalCircleHfsmState>();
        ulong key = machine.MachineKey.Value, epoch = machine.Epoch.Value;
        ulong deadline = match.PhaseEndTick.Value, matchId = match.MatchId.Value;
        while (world.Tick <= deadline) scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Podium, match.Phase.Value);
        Assert.Equal(deadline, match.EndTick.Value);
        Assert.Equal((int)BomberEndReason.TimeLimit, match.EndReason.Value);
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FinalCircle);
        Assert.Equal(BomberHfsmDefinitions.State.CircleFinished,
            machine.ReadSnapshot(definition, key).ActivePath[^1].State);
        var oldChests = world.Each<BomberChestState>().Select(chest => chest.Entity).ToArray();
        var formerPillars = Enumerable.Range(0, 19 * 19).Select(index => (X: index % 19, Z: index / 19))
            .Where(cell =>
            {
                var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(world).Map, cell.X, 1, cell.Z);
                return scene.Adapter.BindingGet(address.Section, address.Offset) is not null &&
                    BomberRoundTransition.ExpectedBase(world, cell.X, 1, cell.Z) != 0;
            }).ToArray();
        Assert.NotEmpty(formerPillars);
        int limit = checked((int)Ticks.FromMilliseconds(BomberConfigBinding.For(world).Game.PodiumMs +
            BomberConfigBinding.For(world).Game.ResultsMs, BomberConfigBinding.For(world).Game.TickRateHz) + 80);
        for (int i = 0; i < limit && match.MatchId.Value == matchId; i++) scene.Manager.Tick();
        Assert.Equal(matchId + 1, match.MatchId.Value);
        Assert.Equal(key, machine.MachineKey.Value);
        Assert.Equal(epoch + 1, machine.Epoch.Value);
        Assert.Equal(BomberHfsmDefinitions.State.CircleInactive,
            machine.ReadSnapshot(definition, key).ActivePath[^1].State);
        Assert.Equal(0u, world.Single<BomberFinalCircleState>().ClearedStageMask.Value);
        Assert.Equal(0, world.Single<BomberFinalCircleState>().CurrentStageId.Value);
        Assert.Equal(8, world.Each<BomberParticipantState>().Count());
        Assert.All(oldChests, chest => Assert.False(world.IsLive(chest)));
        foreach (var cell in formerPillars)
        {
            var address = BomberTerrainTransactions.Address(BomberConfigBinding.For(world).Map, cell.X, 1, cell.Z);
            Assert.Null(scene.Adapter.BindingGet(address.Section, address.Offset));
            Assert.Equal(BomberRoundTransition.ExpectedBase(world, cell.X, 1, cell.Z),
                scene.Native.ReadCell(new VoxelWorldCoordinate(cell.X, 1, cell.Z)).BlockId);
        }
    }

    [Fact]
    public void PairedRestoreRejectsAClaimedCompletionForAFutureClearStage()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true, persistence: true);
        AdvanceToFive(scene);
        scene.Manager.Tick();
        scene.World.Single<BomberFinalCircleState>().ClearedStageMask.Value |= 1u << 5;
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        using var restored = BomberTestWorld.RestorePaired(capture.Checkpoint!.Value);
        Assert.Throws<InvalidOperationException>(() => restored.Tick());
    }

    [Fact]
    public void NativePreviewRejectsADifferentProjectedSide()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true);
        var config = BomberConfigBinding.For(scene.World);
        scene.World.Single<BomberMatchState>().PhaseEndTick.Value = scene.World.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        scene.Manager.Tick();
        scene.World.Single<BomberFinalCircleState>().NextSide.Value = 1;
        Assert.Throws<InvalidOperationException>(() => scene.Manager.Tick());
    }

    [Fact]
    public void OriginalTerrainDestructionTriggersCircleOnlyAfterTheRegenerationStopBoundary()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, m2: true);
        var world = scene.World;
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        ulong final = Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        ulong lead = Ticks.FromMilliseconds(config.Regeneration.StopBeforeFinalMs, config.Game.TickRateHz);
        ulong stopped = world.Tick + 30;
        match.PhaseEndTick.Value = stopped + lead + final;
        scene.Manager.Tick();
        var circle = world.Single<BomberFinalCircleState>();
        Assert.Equal(1, circle.InitialResourceCount.Value);
        Assert.Equal(1, circle.RemainingResourceCount.Value);
        Assert.Equal(stopped, circle.RegenStopTick.Value);
        scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal(1, world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        scene.Manager.Tick();
        Assert.Equal(0, world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        Assert.Equal(0, circle.RemainingResourceCount.Value);
        while (world.Tick < stopped) scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.FinalCircle, match.Phase.Value);
        Assert.Equal(stopped, circle.TriggerTick.Value);
        Assert.NotEqual((int)BomberEndReason.TimeLimit, circle.TriggerReason.Value);
        Assert.Equal(stopped + final, match.PhaseEndTick.Value);
    }

    [Fact]
    public void ExactlyTwentyPercentRemainsRunningUntilTheLastOriginalDestruction()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, m2: true);
        for (int x = 7; x <= 9; x++) scene.Write(x, 1, 5, 1025u << 8);
        scene.Write(15, 1, 15, 1025u << 8);
        var world = scene.World;
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        match.PhaseEndTick.Value = world.Tick + Ticks.FromMilliseconds(config.Regeneration.StopBeforeFinalMs +
            config.FinalCircle.DurationMs, config.Game.TickRateHz);
        scene.Manager.Tick();
        var circle = world.Single<BomberFinalCircleState>();
        Assert.Equal(5, circle.InitialResourceCount.Value);
        scene.Bomb(true);
        for (int i = 0; i < 12; i++) scene.Manager.Tick();
        Assert.Equal(1, circle.RemainingResourceCount.Value);
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        var bomb = scene.Bomb(true);
        BomberEffectIntegrationTests.Position(bomb.Get<LogicTransform>(), new Vector3(14.5f, 1.5f, 15.5f));
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(15, 1, 15)).BlockId);
        Assert.Equal(0, circle.RemainingResourceCount.Value);
        Assert.Equal((int)BomberMatchPhase.FinalCircle, match.Phase.Value);
        Assert.Equal((int)BomberCircleTriggerReason.ResourceThreshold, circle.TriggerReason.Value);
    }

    [Theory]
    [InlineData("Wood", 2)]
    [InlineData("Iron", 2)]
    [InlineData("Gold", 2)]
    [InlineData("default", 1)]
    public void ResourceCensusIncludesOnlySoftAndTheThreeResourceChestTiers(string tier, int expected)
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, m2: true);
        var world = scene.World;
        var config = BomberConfigBinding.For(world);
        world.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Warmup;
        world.Single<BomberMatchState>().PhaseEndTick.Value = world.Tick + 100;
        var order = world.Commands.Create<BomberChestEntity>();
        scene.Manager.Tick();
        var chest = world.Get<BomberChestState>(order.AssignedId);
        if (tier == "default") chest.InitializeHitBudget();
        else chest.InitializeTier(config.Tables.Chest.Rows.Single(row => row.Name == tier).Id, 1);
        var address = BomberTerrainTransactions.Address(config.Map, 9, 1, 9);
        scene.Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1028, world.Registry.WireName(typeof(BomberChestEntity))) });
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(9, 1, 9));
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageMutation(
            new[] { new VoxelWriteEntry(address.Section, address.Offset, 1028u << 8, before.SectionRevision) },
            new[] { new VoxelBindingOp(address.Section, address.Offset, order.AssignedId.ToHex()) { ExpectedSectionRevision = before.SectionRevision } },
            "resource-count-fixture").Status);
        scene.Manager.Tick();
        world.Single<BomberMatchState>().PhaseEndTick.Value = world.Tick;
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(expected, world.Single<BomberFinalCircleState>().InitialResourceCount.Value);
        Assert.Equal(expected, world.Single<BomberFinalCircleState>().RemainingResourceCount.Value);
    }

    [Fact]
    public void PairedRestoreKeepsInitialCensusAndPendingOriginalCannotTriggerFromEmptyNativeCells()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, m2: true, persistence: true);
        var world = scene.World;
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        match.PhaseEndTick.Value = world.Tick + Ticks.FromMilliseconds(config.Regeneration.StopBeforeFinalMs +
            config.FinalCircle.DurationMs, config.Game.TickRateHz);
        scene.Manager.Tick();
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        var delayed = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = world };
        using var delayedBinding = VoxelGameplayBinding.Bind(scene.Manager, delayed);
        scene.Manager.BindVoxelTick(delayed.PrepareVoxel, delayed.CommitVoxel);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.Equal(1, world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        Assert.Equal(1, world.Single<BomberFinalCircleState>().RemainingResourceCount.Value);
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        // Preserve the matched original owner receipt in the paired capture.
        using var originalBinding = VoxelGameplayBinding.Bind(scene.Manager, scene.Adapter);
        scene.Manager.BindVoxelTick(scene.Adapter.PrepareVoxel, scene.Adapter.CommitVoxel);
        Assert.True(world.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        using var restored = BomberTestWorld.RestorePaired(capture.Checkpoint!.Value);
        var circle = restored.World.Single<BomberFinalCircleState>();
        Assert.True(circle.ResourceCountInitialized.Value);
        Assert.Equal(1, circle.InitialResourceCount.Value);
        Assert.Equal(1, circle.RemainingResourceCount.Value);
        restored.Tick();
        Assert.Equal(1, circle.InitialResourceCount.Value);
        Assert.Equal(0, circle.RemainingResourceCount.Value);
        Assert.Equal((int)BomberMatchPhase.FinalCircle, restored.World.Single<BomberMatchState>().Phase.Value);
    }

    [Fact]
    public void LastSurvivorSettlementClosesTheActualCircleMachineBeforeItsDeadline()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true);
        var world = scene.World;
        var match = world.Single<BomberMatchState>();
        var config = BomberConfigBinding.For(world);
        match.PhaseEndTick.Value = world.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        scene.Manager.Tick();
        ulong deadline = match.PhaseEndTick.Value;
        // Isolate each victim's real explosion contact and retain one survivor.
        for (int i = 0; i < scene.Lives.Length; i++)
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(scene.Lives[i]), new Vector3(1.5f + 2 * i, 1.5f, 1.5f));
        for (int i = 0; i < 7; i++)
            for (int hit = 0; hit < 3; hit++)
            {
                var order = BomberEffectIntegrationTests.Bomb(world, scene.Lives[7], scene.Lives[i], checked((ulong)(9800 + i * 3 + hit)));
                order.Get<BomberBombState>().Power.Value = 1;
            }
        for (int i = 0; i < 5; i++) scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Podium, match.Phase.Value);
        Assert.Equal((int)BomberEndReason.LastSurvivor, match.EndReason.Value);
        Assert.True(match.EndTick.Value < deadline);
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FinalCircle);
        var machine = world.Single<BomberFinalCircleHfsmState>();
        Assert.Equal(BomberHfsmDefinitions.State.CircleFinished,
            machine.ReadSnapshot(definition, machine.MachineKey.Value).ActivePath[^1].State);
    }
}
