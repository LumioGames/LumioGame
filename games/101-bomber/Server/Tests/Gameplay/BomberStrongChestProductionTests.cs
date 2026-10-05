using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Persistence;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberStrongChestProductionTests
{
    [Fact]
    public void ApprovedStrongChestConfigurationIncludesGoldenHeartAndExactMaximumOutput()
    {
        using var manager = BomberTestWorld.Start();
        var config = BomberConfigBinding.For(manager.World);
        Assert.Equal(200, config.Chest.GoldHeartPermille);
        Assert.Equal(6, BomberResourceRewardRules.Maximum(config, config.Chest));
        Assert.Equal(1351, config.ObjectBudgets.RequiredPickups);
    }

    [Theory]
    [InlineData("true")]
    [InlineData("false")]
    public void OriginalStrongChestGoldenHeartActuallyMaterializesWithoutEnteringTheSpecialPool(string skills)
    {
        using var configFixture = new BomberObjectBudgetTests.AuthoredFixture(("chest", "default", "gold_heart_permille", "1000"),
            ("game", "default", "skills_enabled", skills));
        using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: configFixture.Compile());
        var chest = CreateStrongChest(scene);
        for (int i = 0; i < 3; i++) { scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick(); }
        Assert.False(scene.World.IsLive(chest));
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        scene.Manager.Tick();
        Assert.Single(scene.World.Each<BomberPickupItem>(), item => item.Kind.Value == (int)BomberPickupKind.GoldenHeart);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.DoesNotContain(Enumerable.Range(0, runtime.TerrainRewards.Count), i =>
            BomberTerrainTransactions.Decode<BomberTerrainReward>(runtime.TerrainRewards[i]).Kind == (int)BomberPickupKind.GoldenHeart);
        Assert.Equal(skills == "true" ? 6 : 5, scene.World.Each<BomberPickupItem>().Count() + runtime.TerrainRewards.Count);
    }

    [Fact]
    public void FirstActualCirclePreviewCreatesOneStrongChestThroughNativeBinding()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true);
        var world = scene.World;
        var config = BomberConfigBinding.For(world);
        foreach (var life in scene.Lives)
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(9.5f, 1.5f, 9.5f));
        world.Single<BomberMatchState>().PhaseEndTick.Value = world.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        Assert.Empty(world.Each<BomberChestState>());
        scene.Manager.Tick();
        var stage = config.Tables.CircleStages.Rows.OrderBy(row => row.AtMs).First();
        ulong announce = world.Single<BomberFinalCircleState>().TriggerTick.Value +
            Ticks.FromMilliseconds(stage.AtMs - config.FinalCircle.PreviewMs, config.Game.TickRateHz);
        while (world.Tick < announce) scene.Manager.Tick();
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        var chest = Assert.Single(world.Each<BomberChestState>());
        Assert.Equal(3, chest.RemainingHits.Value);
        Assert.Equal(0u, chest.ResourceTier.Value);
        int bound = 0, start = (config.Map.Width - stage.SideCells) / 2, center = config.Map.Width / 2;
        for (int z = 0; z < config.Map.Depth; z++)
        for (int x = 0; x < config.Map.Width; x++)
        {
            var address = BomberTerrainTransactions.Address(config.Map, x, config.Map.ObstacleLayer, z);
            if (scene.Adapter.BindingGet(address.Section, address.Offset) != chest.Entity.ToHex()) continue;
            bound++;
            Assert.InRange(x, start, start + stage.SideCells - 1);
            Assert.InRange(z, start, start + stage.SideCells - 1);
            Assert.False((x == center || z == center) && Math.Abs(x - center) <= 2 && Math.Abs(z - center) <= 2);
            Assert.Equal(1028u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(x, 1, z)).BlockId);
        }
        Assert.Equal(1, bound);
        for (int i = 0; i < 5; i++) scene.Manager.Tick();
        Assert.Single(world.Each<BomberChestState>());
        Assert.Equal(0, world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
    }

    [Fact]
    public void EveryPreviewIssuesExactlyOnceAndTheOneCellStageIssuesNone()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true);
        Trigger(scene);
        var world = scene.World;
        var config = BomberConfigBinding.For(world);
        var circle = world.Single<BomberFinalCircleState>();
        var stages = config.Tables.CircleStages.Rows.OrderBy(row => row.AtMs).ToArray();
        uint expectedMask = 0;
        for (int i = 0; i < stages.Length; i++)
        {
            var stage = stages[i];
            ulong preview = circle.TriggerTick.Value + Ticks.FromMilliseconds(stage.AtMs - config.FinalCircle.PreviewMs, config.Game.TickRateHz);
            while (world.Tick < preview + 3) scene.Manager.Tick();
            if (stage.SpawnChest) expectedMask |= 1u << i;
            Assert.Equal(expectedMask, circle.ChestIssuedStageMask.Value);
            Assert.Equal(0u, circle.ChestUnavailableStageMask.Value);
            var issued = world.Each<BomberChestState>().ToArray();
            Assert.Equal(stages.Take(i + 1).Count(row => row.SpawnChest), issued.Length);
            if (stage.SpawnChest)
                Assert.Single(issued, chest => chest.StrongSpawnStage.Value == stage.Id && chest.StrongSpawnMatch.Value == world.Single<BomberMatchState>().MatchId.Value);
            else
            {
                Assert.Equal(1, stage.SideCells);
                Assert.DoesNotContain(issued, chest => chest.StrongSpawnStage.Value == stage.Id);
            }
        }
        Assert.Equal(31u, expectedMask);
    }

    [Fact]
    public void StrongChestCountsThreeDistinctFamiliesAndOnlyOriginalDigIssuesRewards()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var world = scene.World;
        var chestId = CreateStrongChest(scene);
        var first = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(2, world.Get<BomberChestState>(chestId).RemainingHits.Value);
        var sameFamily = scene.Bomb(true);
        sameFamily.Get<BomberBombState>().HitFamily.Value = first.AssignedId;
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(2, world.Get<BomberChestState>(chestId).RemainingHits.Value);
        var second = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(1, world.Get<BomberChestState>(chestId).RemainingHits.Value);
        Assert.Empty(world.Each<BomberPickupItem>());
        scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(world.IsLive(chestId));
        Assert.Empty(world.Each<BomberPickupItem>());
        Assert.Equal(0, world.Single<BomberWorldRuntime>().TerrainRewards.Count);
        Assert.Equal(1, world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        scene.Manager.Tick();
        var rewards = world.Each<BomberPickupItem>().Select(row => row.Kind.Value).Concat(
            Enumerable.Range(0, world.Single<BomberWorldRuntime>().TerrainRewards.Count).Select(i =>
                BomberTerrainTransactions.Decode<BomberTerrainReward>(world.Single<BomberWorldRuntime>().TerrainRewards[i]).Kind)).ToArray();
        foreach (var kind in new[] { BomberPickupKind.Power, BomberPickupKind.Capacity, BomberPickupKind.Speed, BomberPickupKind.Health })
            Assert.Single(rewards, row => row == (int)kind);
        Assert.Single(rewards, row => row == (int)BomberPickupKind.Skill);
        Assert.InRange(rewards.Length, 5, 6);
        Assert.Equal(1, world.Each<BomberStatistics>().Sum(row => row.DestroyedBlocks.Value));
    }

    private static NetEntityId CreateStrongChest(BomberTerrainProductionTests.Scene scene)
    {
        var order = scene.World.Commands.Create<BomberChestEntity>();
        scene.Manager.Tick();
        scene.World.Get<BomberChestState>(order.AssignedId).InitializeHitBudget();
        scene.Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1028, scene.World.Registry.WireName(typeof(BomberChestEntity))) });
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5));
        var entry = new VoxelWriteEntry(0, 256 + 5 * 16 + 6, 1028u << 8, before.SectionRevision);
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageMutation(new[] { entry },
            new[] { new VoxelBindingOp(0, entry.CellOffset, order.AssignedId.ToHex()) { ExpectedSectionRevision = entry.ExpectedSectionRevision } },
            "strong-chest-fixture").Status);
        scene.Manager.Tick();
        return order.AssignedId;
    }

    [Fact]
    public void RefusedThirdFamilyStaysSaturatedAndOnlyANewBombMayRetry()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var world = scene.World;
        var chestId = CreateStrongChest(scene);
        for (int i = 0; i < 2; i++) { scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick(); }
        var refused = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native),
            new WorldIngressBudget(1, 1, 1, 1)) { World = world };
        var third = scene.Bomb(true);
        using (VoxelGameplayBinding.Bind(scene.Manager, refused))
        {
            scene.Manager.BindVoxelTick(refused.PrepareVoxel, refused.CommitVoxel);
            scene.Manager.Tick(); scene.Manager.Tick();
            var chest = world.Get<BomberChestState>(chestId);
            Assert.Equal(0, chest.RemainingHits.Value);
            Assert.Equal(3, chest.HitBombs.Count);
            Assert.False(chest.HasPendingTransaction.Value);
            Assert.Equal(0, world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        }
        using var rebound = VoxelGameplayBinding.Bind(scene.Manager, scene.Adapter);
        scene.Manager.BindVoxelTick(scene.Adapter.PrepareVoxel, scene.Adapter.CommitVoxel);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.True(world.IsLive(chestId));
        Assert.Empty(world.Each<BomberPickupItem>());
        var child = scene.Bomb(true);
        child.Get<BomberBombState>().HitFamily.Value = third.AssignedId;
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.True(world.IsLive(chestId));
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(world.IsLive(chestId));
        scene.Manager.Tick();
        Assert.Equal(1, world.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void PairedRestorePreservesPendingOrAcceptedStrongChestWithoutReissuing(bool accepted)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true, persistence: true);
        Trigger(scene);
        scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        var chest = Assert.Single(scene.World.Each<BomberChestState>());
        if (accepted) scene.Manager.Tick();
        Assert.Equal(accepted ? 1u : 0u, scene.World.Single<BomberFinalCircleState>().ChestIssuedStageMask.Value);
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var capture = persistence!.Capture();
        Assert.True(capture.Succeeded, capture.ErrorCode);
        using var restored = BomberTestWorld.RestorePaired(capture.Checkpoint!.Value);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        if (!accepted) Assert.Equal(transaction, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds[0]);
        for (int i = 0; i < 3; i++) restored.Tick();
        Assert.Equal(chest.Entity, Assert.Single(restored.World.Each<BomberChestState>()).Entity);
        Assert.Equal(1u, restored.World.Single<BomberFinalCircleState>().ChestIssuedStageMask.Value);
        Assert.Equal(0, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
    }

    [Fact]
    public void NoLegalCandidateIsFiniteAuditedAndDoesNotSpendAnIssuance()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true);
        for (int z = 3; z <= 15; z++)
        for (int x = 3; x <= 15; x++)
            if (x != 9 || z != 9) scene.Write(x, 0, z, 1027u << 8);
        Trigger(scene);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.Empty(scene.World.Each<BomberChestState>());
        var state = scene.World.Single<BomberFinalCircleState>();
        Assert.Equal(0u, state.ChestIssuedStageMask.Value);
        Assert.Equal(1u, state.ChestUnavailableStageMask.Value);
        var entries = scene.World.Single<BomberPresentationJournal>().Entries;
        Assert.Single(Enumerable.Range(0, entries.Count), i => entries[i].Contains("chest_unavailable", StringComparison.Ordinal));
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
    }

    [Fact]
    public void RefusedBindingRetainsOneEntityAndIssuesOnceAfterActualBudgetRecovery()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true, budget: new WorldIngressBudget(1, 1, 1, 1));
        Trigger(scene);
        for (int i = 0; i < 3; i++) scene.Manager.Tick();
        var chest = Assert.Single(scene.World.Each<BomberChestState>());
        Assert.Equal(0u, scene.World.Single<BomberFinalCircleState>().ChestIssuedStageMask.Value);
        Assert.Equal(0u, scene.World.Single<BomberFinalCircleState>().ChestUnavailableStageMask.Value);
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        var owner = NativeWorldVoxelResources.Require(scene.Manager).Adapter;
        using var binding = VoxelGameplayBinding.Bind(scene.Manager, owner);
        scene.Manager.BindVoxelTick(owner.PrepareVoxel, owner.CommitVoxel);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(chest.Entity, Assert.Single(scene.World.Each<BomberChestState>()).Entity);
        Assert.Equal(1u, scene.World.Single<BomberFinalCircleState>().ChestIssuedStageMask.Value);
    }

    private static void Trigger(BomberTerrainProductionTests.Scene scene)
    {
        var world = scene.World;
        foreach (var life in scene.Lives)
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(9.5f, 1.5f, 9.5f));
        var config = BomberConfigBinding.For(world);
        world.Single<BomberMatchState>().PhaseEndTick.Value = world.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        scene.Manager.Tick();
    }
}
