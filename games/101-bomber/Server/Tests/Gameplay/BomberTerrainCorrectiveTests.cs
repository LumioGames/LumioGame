using System;
using System.Linq;
using System.Numerics;
using System.Reflection;
using System.Text.Json;
using Lumio.Config.Generated.Server;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberTerrainCorrectiveTests
{
    [Fact]
    public void InactiveOwnedInitializePendingRejectsActualHydration()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var world = scene.World;
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>().MatchId.Value;
        var address = BomberTerrainTransactions.Address(config.Map, 6, config.Map.ObstacleLayer, 5);
        var cell = new BomberPendingVoxelCell(new VoxelWriteEntry(address.Section, address.Offset, 1025u << 8,
            scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).SectionRevision), 0,
            BomberVoxelIntentKind.Initialize, default, default, 0, default, default, 0);
        runtime.RecordPending($"bomber-terrain:{world.InstanceId:x16}:{match:x16}:0000000000000001",
            world.Tick, match, new[] { cell }, config);
        runtime.TerrainPendingDetails.Add(BomberTerrainTransactions.Encode(new BomberTerrainDetail(0, 0, 0, 0,
            "", world.Tick, 0, Array.Empty<BomberTerrainReward>())));
        byte[] snapshot = scene.Manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()));
        Assert.Equal(snapshot, scene.Manager.CaptureSnapshot());
    }

    [Fact]
    public void PhaseTwoOwnedInitializePendingCaptureMatchesExactPlan()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, 5, 5, m2: true);
        BomberInitialResources.Configure(scene.World, M2InitialLayout.Plan(19));
        scene.Manager.Tick();
        scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(2, runtime.InitialResourcePhase.Value);
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        byte[] snapshot = scene.Manager.CaptureSnapshot();
        BomberTerrainTransactions.Validate(scene.World);
        Assert.Equal(snapshot, scene.Manager.CaptureSnapshot());
    }

    [Fact]
    public void AcceptedContinuationSurvivesRealUnavailableSectionAndReadRecovery()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8);
        var order = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var key = new VoxelSectionKey(0, 0, 0);
        ulong revision = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).SectionRevision;
        byte[] payload; VoxelSectionExportResult record;
        using (var export = scene.Native.OpenSectionExport(new(1, 1024 * 1024, 1024 * 1024)))
        using (var snapshot = export.Acquire(key, revision))
        {
            Assert.Equal(5, export.Read(snapshot, null, Span<byte>.Empty, out var size));
            payload = new byte[size.RequiredBytes];
            Assert.Equal(0, export.Read(snapshot, null, payload, out record));
        }
        scene.Native.ApplyDurabilityAck(key, record.WorldGeneration, revision);
        scene.Native.UnloadSection(key, record.WorldGeneration, revision);
        Assert.False(scene.Adapter.Read(new[] { (0UL, 256 + 5 * 16 + 6) })[0].HasBlockId);
        scene.Manager.Tick(); // Original is consumed, but its continuation has no authoritative read.
        var bomb = scene.World.Get<BomberBombState>(order.AssignedId);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(1, bomb.TerrainContinuations.Count);
        string obligation = bomb.TerrainContinuations[0];
        int rewards = runtime.TerrainRewards.Count;
        for (int i = 0; i < 16; i++) scene.Manager.Tick();
        Assert.True(scene.World.IsLive(order.AssignedId));
        Assert.Equal(obligation, bomb.TerrainContinuations[0]);
        Assert.Equal(rewards, runtime.TerrainRewards.Count);
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        scene.Native.LoadSectionFromRecord(key, record.Encoding, revision, payload, record.PayloadSha256.Span);
        scene.Manager.Tick();
        Assert.Equal(0, bomb.TerrainContinuations.Count);
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
    }

    [Fact]
    public void EffectiveSoftRowsDetermineInitialMaximum()
    {
        using var controlFixture = new BomberObjectBudgetTests.AuthoredFixture(("game", "default", "match_duration_ms", "360000"));
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(("game", "default", "match_duration_ms", "360000"),
            ("chest", "SoftOuter", "random_slots", "2"));
        string controlExport = controlFixture.Compile(), export = fixture.Compile();
        var control = BomberConfigBinding.Read(controlExport);
        var config = BomberConfigBinding.Read(export);
        _ = BomberConfigBinding.Load(controlExport);
        _ = BomberConfigBinding.Load(export);
        AssertPrivatePair(control, config, "SoftOuter", 1488);
        var layout = M2InitialLayout.Plan(19);
        var baseline = BomberTerrainBudget.Calculate(control, layout).InitialOutputCeiling;
        int outerSoft = layout.Cells.Count(c => c.Kind == M2CellKind.Soft && Math.Max(Math.Abs(c.X - 9), Math.Abs(c.Z - 9)) >= 6);
        Assert.True(outerSoft > 0);
        Assert.Equal(baseline + outerSoft, BomberTerrainBudget.Calculate(config, layout).InitialOutputCeiling);
    }

    [Theory]
    [InlineData("SoftOuter", "250", "30")]
    [InlineData("SoftMiddle", "1000", "0")]
    public void EffectiveTwoOutputSoftRowsFailClosedBeforeWorldAttachment(string name, string drop, string kick)
    {
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(("game", "default", "match_duration_ms", "420000"),
            ("chest", name, "random_slots", "2"), ("chest", name, "drop_permille", drop), ("chest", name, "kick_permille", kick));
        string export = fixture.Compile();
        var valid = BomberConfigBinding.Read();
        Assert.Equal(420000u, valid.Game.MatchDurationMs);
        Assert.Equal(8, valid.Game.PlayerCount);
        Assert.Equal(19, valid.Map.Width);
        Assert.Equal(19, valid.Map.Depth);
        Assert.Equal(20u, valid.Game.TickRateHz);
        Assert.Equal(1607, valid.ObjectBudgets.PickupCapacity);
        ulong match = Ticks.FromMilliseconds(valid.Game.MatchDurationMs, valid.Game.TickRateHz);
        ulong final = Ticks.FromMilliseconds(valid.FinalCircle.DurationMs, valid.Game.TickRateHz);
        ulong lead = Ticks.FromMilliseconds(valid.Regeneration.StopBeforeFinalMs, valid.Game.TickRateHz);
        ulong first = Ticks.FromMilliseconds(valid.Regeneration.FirstTriggerMs, valid.Game.TickRateHz);
        ulong interval = Ticks.FromMilliseconds(valid.Regeneration.IntervalMs, valid.Game.TickRateHz);
        Assert.Equal((8400UL, 2300UL, 1200UL, 160UL, 160UL), (match, final, lead, first, interval));
        ulong stop = match - final - lead;
        Assert.Equal(4900UL, stop);
        ulong waves = 1 + (stop - 1 - first) / interval;
        Assert.Equal(30UL, waves);
        Assert.Equal(240UL, waves * 4 * (ulong)valid.Regeneration.MaxMirrorOrbits);
        Assert.Equal(1712, 361 * 2 + 240 * 4 + 5 * 6);

        using var sentinel = new BomberTerrainProductionTests.Scene(1025u << 8);
        byte[] snapshot = sentinel.Manager.CaptureSnapshot();
        var floor = sentinel.Native.ReadCell(new VoxelWorldCoordinate(6, 0, 5));
        var obstacle = sentinel.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5));
        const string expected = "object_budgets.max_pickup_entities: required=1712, provisioned=1607.";
        Assert.Equal(expected, Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(export)).Message);
        Assert.Equal(snapshot, sentinel.Manager.CaptureSnapshot());
        Assert.Equal(floor, sentinel.Native.ReadCell(new VoxelWorldCoordinate(6, 0, 5)));
        Assert.Equal(obstacle, sentinel.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)));
        Assert.Equal(expected, Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Load(export)).Message);
        Assert.Equal(snapshot, sentinel.Manager.CaptureSnapshot());
        Assert.Equal(floor, sentinel.Native.ReadCell(new VoxelWorldCoordinate(6, 0, 5)));
        Assert.Equal(obstacle, sentinel.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)));
    }

    private static void AssertPrivatePair(IBomberConfig control, IBomberConfig mutated, string selectedRow, int requiredPickups)
    {
        var production = BomberConfigBinding.Read();
        Assert.Equal(420000u, production.Game.MatchDurationMs);
        foreach (var config in new[] { control, mutated })
        {
            Assert.Equal(360000u, config.Game.MatchDurationMs);
            Assert.Equal(8, config.Game.PlayerCount);
            Assert.Equal(19, config.Map.Width);
            Assert.Equal(19, config.Map.Depth);
            Assert.Equal(20u, config.Game.TickRateHz);
            Assert.Equal((2784, 1607, 336), (config.ObjectBudgets.BombCapacity, config.ObjectBudgets.PickupCapacity, config.ObjectBudgets.FireZoneCapacity));
            Assert.Equal(production.ObjectBudgetRules, config.ObjectBudgetRules);
            Assert.Equal(production.Map, config.Map);
            foreach (PropertyInfo table in typeof(BomberTypedTables).GetProperties(BindingFlags.Instance | BindingFlags.Public)
                .Where(p => p.Name is not ("Game" or "Chest")))
                Assert.Equal(JsonSerializer.Serialize(table.GetValue(production.Tables)), JsonSerializer.Serialize(table.GetValue(config.Tables)));
            foreach (PropertyInfo column in typeof(GameRow).GetProperties().Where(p => p.Name != nameof(GameRow.MatchDurationMs)))
                Assert.Equal(column.GetValue(production.Game), column.GetValue(config.Game));
            ulong match = Ticks.FromMilliseconds(config.Game.MatchDurationMs, config.Game.TickRateHz);
            ulong final = Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
            ulong lead = Ticks.FromMilliseconds(config.Regeneration.StopBeforeFinalMs, config.Game.TickRateHz);
            ulong first = Ticks.FromMilliseconds(config.Regeneration.FirstTriggerMs, config.Game.TickRateHz);
            ulong interval = Ticks.FromMilliseconds(config.Regeneration.IntervalMs, config.Game.TickRateHz);
            Assert.Equal((7200UL, 2300UL, 1200UL, 160UL, 160UL), (match, final, lead, first, interval));
            Assert.Equal(3700UL, match - final - lead);
            ulong waves = 1 + (match - final - lead - 1 - first) / interval;
            Assert.Equal(23UL, waves);
            Assert.Equal(184UL, waves * 4 * (ulong)config.Regeneration.MaxMirrorOrbits);
            Assert.Equal(4, BomberResourceRewardRules.Maximum(config, config.Tables.Chest.Rows.Single(r => r.Name == "Gold")));
            Assert.Equal(6, BomberResourceRewardRules.Maximum(config, config.Chest));
            Assert.Equal(5, config.Tables.CircleStages.Rows.Count(r => r.SpawnChest));
        }
        Assert.Equal(1127, 361 + 736 + 30);
        Assert.Equal(1488, 722 + 736 + 30);
        Assert.Equal(1127, control.ObjectBudgets.RequiredPickups);
        Assert.Equal(requiredPickups, mutated.ObjectBudgets.RequiredPickups);
        Assert.Equal(control.Game, mutated.Game);
        Assert.Equal(control.Tables.Chest.Rows.Count, mutated.Tables.Chest.Rows.Count);
        foreach (ChestRow row in control.Tables.Chest.Rows)
        {
            var other = mutated.Tables.Chest.Rows.Single(r => r.Id == row.Id);
            if (row.Name != selectedRow) { Assert.Equal(row, other); continue; }
            Assert.Equal(1, row.RandomSlots);
            Assert.Equal(2, other.RandomSlots);
            foreach (PropertyInfo column in typeof(ChestRow).GetProperties().Where(p => p.Name != nameof(ChestRow.RandomSlots)))
                Assert.Equal(column.GetValue(row), column.GetValue(other));
        }
    }

    [Theory]
    [InlineData("SoftCore")]
    [InlineData("Wood")]
    public void UnsupportedEffectiveRewardShapeFailsBeforeWorldAttachment(string tier)
    {
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(("chest", tier, "random_slots", "3"));
        string export = fixture.Compile();
        Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(export));
    }

    [Theory]
    [InlineData(1, false)]
    [InlineData(2, true)]
    public void RealDeathTransferAndDestructionShareTheLastSlots(int free, bool accepted)
    {
        using var scene = new BomberTerrainProductionTests.Scene(1026u << 8);
        var world = scene.World;
        BomberEffectIntegrationTests.ScheduleFinalCircle(world);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        scene.Write(11, 1, 4, 0);
        int limit = BomberConfigBinding.For(world).ObjectBudgets.PickupCapacity;
        for (int i = 0; i < limit - free; i++) world.Commands.Create<BomberPickupItemEntity>();
        scene.Manager.Tick();
        var victim = world.Get<BomberPlayerState>(scene.Lives[2]);
        var participant = world.Get<BomberParticipantState>(victim.Participant.Value);
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(victim.Entity), new Vector3(11.5f, 1.5f, 5.5f));
        world.Get<AttributeComponent>(victim.Entity).SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        world.Get<AttributeComponent>(victim.Entity).SetBaseValue(BomberAttributeNames.BombPower, 3);
        var killer = BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], victim.Entity, 901);
        killer.Get<BomberBombState>().Power.Value = 0;
        scene.Manager.Tick();
        var terrain = scene.Bomb(true);
        scene.Manager.Tick(); // Effect kills; second bomb becomes live.
        Assert.True(participant.DeathStructurePending.Value);
        int beforeBoundaryLive = -1, beforeBoundaryOccupied = -1, beforeBoundaryTotal = -1;
        scene.Manager.BindVoxelTick(() =>
        {
            beforeBoundaryLive = world.Each<BomberPickupItem>().Count(p => world.IsLive(p.Entity));
            beforeBoundaryOccupied = BomberTerrainTransactions.Occupied(world);
            beforeBoundaryTotal = checked(beforeBoundaryOccupied + BomberDeathDrops.PendingOutputs(world) + BomberTerrainTransactions.Reserved(world));
            scene.Adapter.PrepareVoxel();
        }, scene.Adapter.CommitVoxel);
        scene.Manager.Tick(); // Actual death transfer queues its pickup before terrain production.
        Assert.Equal(limit - free, beforeBoundaryLive);
        Assert.Equal(beforeBoundaryLive + 1, beforeBoundaryOccupied);
        Assert.Equal(limit - free + 1 + (accepted ? 1 : 0), beforeBoundaryTotal);
        Assert.True(beforeBoundaryTotal <= limit);
        var carry = world.Get<BomberRespawnCarry>(participant.Entity);
        Assert.False(world.IsLive(victim.Entity));
        Assert.Equal(1, carry.SelectedDropCount.Value);
        Assert.Equal(1, carry.PlacedDropCount.Value);
        Assert.Equal(0, BomberDeathDrops.PendingOutputs(world));
        var runtime = world.Single<BomberWorldRuntime>();
        Assert.Equal(accepted ? 1 : 0, runtime.TerrainReservedPickups.Value);
        Assert.Equal(accepted ? 0u : 1026u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal(limit - free + 1, world.Each<BomberPickupItem>().Count());
        Assert.True(world.Each<BomberPickupItem>().Count() + BomberTerrainTransactions.Reserved(world) <= limit);
        scene.Manager.Tick();
        Assert.Equal(accepted ? 1 : 0, world.Get<BomberStatistics>(world.Get<BomberBombState>(terrain.AssignedId).Owner.Value).DestroyedBlocks.Value);
        Assert.Equal(limit - free + 1 + (accepted ? 1 : 0), world.Each<BomberPickupItem>().Count() + runtime.TerrainRewards.Count);
        Assert.Equal(1, carry.PlacedDropCount.Value);
    }

    [Fact]
    public void WithheldOriginalRetainsSecondBombUntilRealDeliveryAndReadRecover()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8);
        var first = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var checkpoint = scene.Adapter.CaptureResultCheckpoint();
        var delayed = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var delayBinding = VoxelGameplayBinding.Bind(scene.Manager, delayed);
        scene.Manager.BindVoxelTick(delayed.PrepareVoxel, delayed.CommitVoxel);
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(scene.Lives[2]), new Vector3(13.5f, 1.5f, 7.5f));
        var second = scene.Bomb();
        BomberEffectIntegrationTests.Position(second.Get<LogicTransform>(), new Vector3(11.5f, 1.5f, 7.5f));
        scene.Manager.Tick(); scene.Manager.Tick();
        var bomb = scene.World.Get<BomberBombState>(second.AssignedId);
        ulong occurred = bomb.ExplodedAtTick.Value;
        Assert.Equal(4, bomb.TerrainContinuations.Count);
        for (int i = 0; i < 16; i++) scene.Manager.Tick();
        Assert.True(scene.World.IsLive(first.AssignedId));
        Assert.True(scene.World.IsLive(second.AssignedId));
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[2]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(occurred, bomb.ExplodedAtTick.Value);
        byte[] pending = scene.Manager.CaptureSnapshot();
        using (var restored = BomberTestWorld.Restore(pending, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()))
        {
            restored.RequireBoundSpatialIndex();

            Assert.Equal(pending, restored.CaptureSnapshot());
        }
        delayed.RestoreResultCheckpoint(checkpoint);
        ulong damageTick = scene.World.Tick;
        scene.Manager.Tick();
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[2]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var facts = scene.World.Get<BomberDamageFacts>(second.AssignedId);
        int row = Enumerable.Range(0, facts.Target.Count).Single(i => facts.Target[i] == scene.Lives[2]);
        Assert.Equal(occurred, bomb.ExplodedAtTick.Value);
        Assert.Equal(damageTick, facts.Tick[row]); // Effect occurrence is the actual recovered damage Tick.
        Assert.Equal(bomb.SourceLife.Value, facts.SourceLife[row]);
        Assert.Equal(0, bomb.TerrainContinuations.Count);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[2]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
    }

    [Theory]
    [InlineData(1, "cursor")]
    [InlineData(1, "barrel")]
    [InlineData(1, "completion-marker")]
    [InlineData(2, "cursor")]
    [InlineData(2, "missing-chest")]
    [InlineData(2, "missing-barrels")]
    [InlineData(2, "pending-cell")]
    public void InitialLifecycleHydrationRejectsInconsistentPartialGenerations(int phase, string corruption)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, 5, 5, m2: true);
        BomberInitialResources.Configure(scene.World, M2InitialLayout.Plan(19));
        if (phase == 2) scene.Manager.Tick();
        if (corruption == "pending-cell") scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(phase, runtime.InitialResourcePhase.Value);
        switch (corruption)
        {
            case "cursor": runtime.InitialResourceCursor.Value = 1; break;
            case "barrel": runtime.InitialBarrelReservations.Add(20); break;
            case "completion-marker": runtime.TerrainInitialMatchId.Value = 1; break;
            case "missing-chest": scene.World.Each<BomberChestState>().First().InitialResourceMatch.Value = 0; break;
            case "missing-barrels": runtime.InitialBarrelReservations.Clear(); break;
            case "pending-cell": runtime.PendingNewBlocks[0] = 0; break;
        }
        byte[] bytes = scene.Manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(bytes, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()));
        Assert.Equal(bytes, scene.Manager.CaptureSnapshot());
    }

    [Theory]
    [InlineData("SoftMiddle", 1025u, 1, false)]
    [InlineData("SoftMiddle", 1025u, 2, true)]
    [InlineData("Wood", 1026u, 1, false)]
    [InlineData("Wood", 1026u, 2, true)]
    public void EffectiveMultiOutputRowsReserveBeforeNativeMutation(string name, uint block, int free, bool accepted)
    {
        using var controlFixture = new BomberObjectBudgetTests.AuthoredFixture(("game", "default", "match_duration_ms", "360000"),
            ("chest", name, "drop_permille", "1000"), ("chest", name, "kick_permille", "0"));
        using var fixture = new BomberObjectBudgetTests.AuthoredFixture(("game", "default", "match_duration_ms", "360000"), ("chest", name, "random_slots", "2"),
            ("chest", name, "drop_permille", "1000"), ("chest", name, "kick_permille", "0"));
        string controlExport = controlFixture.Compile(), export = fixture.Compile();
        var control = BomberConfigBinding.Read(controlExport);
        var config = BomberConfigBinding.Read(export);
        _ = BomberConfigBinding.Load(controlExport);
        _ = BomberConfigBinding.Load(export);
        AssertPrivatePair(control, config, name, name == "SoftMiddle" ? 1488 : 1127);
        using var scene = new BomberTerrainProductionTests.Scene(block << 8, configDirectory: export);
        int limit = BomberConfigBinding.For(scene.World).ObjectBudgets.PickupCapacity;
        for (int i = 0; i < limit - free; i++) scene.World.Commands.Create<BomberPickupItemEntity>();
        scene.Manager.Tick();
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(accepted ? 0u : block << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(accepted ? 2 : 0, runtime.TerrainReservedPickups.Value);
        scene.Manager.Tick();
        Assert.Equal(limit - free + (accepted ? 2 : 0), scene.World.Each<BomberPickupItem>().Count() + runtime.TerrainRewards.Count);
        Assert.Equal(accepted ? 1 : 0, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
    }

    [Theory]
    [InlineData("negative-cell")]
    [InlineData("out-of-map")]
    [InlineData("foreign-match")]
    [InlineData("duplicate-cell")]
    [InlineData("wrong-tier")]
    [InlineData("completed-zero-cursor")]
    [InlineData("missing-barrels")]
    [InlineData("wrong-barrels")]
    public void InitialResourceHydrationRejectsMalformedProvenanceWithoutChangingSource(string corruption)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, 5, 5, m2: true);
        BomberInitialResources.Configure(scene.World, M2InitialLayout.Plan(19));
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var chests = scene.World.Each<BomberChestState>().ToArray();
        switch (corruption)
        {
            case "negative-cell": chests[0].InitialResourceCell.Value = -1; break;
            case "out-of-map": chests[0].InitialResourceCell.Value = 361; break;
            case "foreign-match": chests[0].InitialResourceMatch.Value++; break;
            case "duplicate-cell": chests[1].InitialResourceCell.Value = chests[0].InitialResourceCell.Value; break;
            case "wrong-tier": chests.Single(c => c.InitialResourceCell.Value == chests.First(c => c.ResourceTier.Value ==
                BomberConfigBinding.For(scene.World).Tables.Chest.Rows.Single(r => r.Name == "Wood").Id).InitialResourceCell.Value)
                .ResourceTier.Value = BomberConfigBinding.For(scene.World).Tables.Chest.Rows.Single(r => r.Name == "Iron").Id; break;
            case "completed-zero-cursor": runtime.InitialResourceCursor.Value = 0; break;
            case "missing-barrels": runtime.InitialBarrelReservations.Clear(); break;
            case "wrong-barrels": runtime.InitialBarrelReservations[0] = 20; break;
        }
        byte[] bytes = scene.Manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(bytes, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()));
        Assert.Equal(bytes, scene.Manager.CaptureSnapshot());
    }
}
