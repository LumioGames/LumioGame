using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using KernelHandle = Lumio.Engine.NativeLoader.KernelHandle;
using Lumio.GameRuntime.Coordination;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberRegenerationProductionTests
{
    private static readonly string[] ResourceChestNames = { "Wood", "Iron", "Gold" };

    [Fact]
    public void FirstEightSecondWaveAddsOnlyWholeSafeOrbitsWithinTheSharedCap()
    {
        using var authored = Configuration();
        using var scene = new Scene(authored.Compile());
        scene.ClearSoftResources();
        uint[] before = scene.ReadTerrain();
        Assert.True(scene.AvailableOrbits(before) >= 2, "Fixture needs two actual safe Native orbits.");
        scene.ReachFirstWave(before);
        var additions = Additions(scene, before);
        Assert.InRange(additions.Count, 4, checked(scene.Config.Regeneration.MaxMirrorOrbits * 4));
        Assert.Equal(0, additions.Count % 4);
        foreach (var cell in additions)
        {
            Assert.False(M2InitialLayout.IsSafetyCell(19, cell.X, cell.Z));
            Assert.NotEqual(scene.Block("water"), before[cell.Z * 19 + cell.X]);
            Assert.Equal(0u, before[361 + cell.Z * 19 + cell.X]);
            foreach (NetEntityId life in scene.Lives)
            {
                Vector3 position = scene.World.Get<LogicTransform>(life).LocalPosition;
                Assert.True(Math.Abs(cell.X - (int)MathF.Floor(position.X)) +
                    Math.Abs(cell.Z - (int)MathF.Floor(position.Z)) >= scene.Config.Regeneration.ThreatDistanceCells);
            }
            var orbit = Orbit(cell.X, cell.Z);
            Assert.All(orbit, mirrored => Assert.Contains(mirrored, additions));
            uint product = scene.Read(cell.X, 1, cell.Z);
            Assert.All(orbit, mirrored => Assert.Equal(product, scene.Read(mirrored.X, 1, mirrored.Z)));
            scene.AssertActualResource(cell.X, cell.Z);
        }
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Empty(scene.World.Each<BomberBombState>());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ACompleteOrbitIsRequiredEvenWhenOnlyOneMirrorMemberIsWater(bool oneWaterCell)
    {
        using var authored = Configuration();
        using var scene = new Scene(authored.Compile());
        scene.IsolateOrbit(retainedSoft: 0);
        if (oneWaterCell) scene.Author(new[] { (13, 0, 13, scene.Block("water")) });
        uint[] before = scene.ReadTerrain();
        Assert.Equal(oneWaterCell ? 0 : 1, scene.AvailableOrbits(before));
        scene.ReachFirstWave(before);
        var additions = Additions(scene, before);
        Assert.Equal(oneWaterCell ? 0 : 4, additions.Count);
        if (!oneWaterCell)
        {
            Assert.All(Orbit(5, 5), cell => Assert.Contains(cell, additions));
            Assert.All(Orbit(5, 5), cell => scene.AssertActualResource(cell.X, cell.Z));
        }
        else Assert.Equal(before, scene.ReadTerrain());
    }

    [Fact]
    public void OneHundredFiveSecondStopPreventsTheNextWaveWhileTheMatchIsStillRunning()
    {
        using var authored = Configuration();
        using var scene = new Scene(authored.Compile());
        // Retain real resources above the final-circle 20% gate but below the
        // regeneration 60% target, so a phase transition cannot explain the stop.
        int retained = checked((scene.InitialResources + 3) / 4);
        Assert.True(scene.InitialResources >= 40, "Fixture needs a positive Native denominator with room for one group.");
        scene.IsolateOrbit(retained);
        uint[] firstBefore = scene.ReadTerrain();
        scene.ReachFirstWave(firstBefore);
        Assert.Equal(4, Additions(scene, firstBefore).Count);
        BomberMatchState match = scene.World.Single<BomberMatchState>();
        BomberFinalCircleState circle = scene.World.Single<BomberFinalCircleState>();
        ulong stop = checked(match.StartTick.Value + scene.Ticks(105000));
        Assert.Equal(stop, circle.RegenStopTick.Value);
        while (scene.World.Tick <= stop) scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        // Open a second actual complete orbit only after the deadline. The first
        // product and its actual binding remain untouched, regardless of its kind.
        scene.Author(Orbit(4, 5).Select(cell => (cell.X, 1, cell.Z, 0u))
            .Concat(Orbit(4, 5).Select(cell => (cell.X, 0, cell.Z, scene.Block("floor")))));
        uint[] afterStop = scene.ReadTerrain();
        int remaining = scene.CountResources(afterStop);
        Assert.True(checked((long)remaining * 1000) >= checked((long)scene.InitialResources * scene.Config.FinalCircle.ResourceThresholdPermille));
        Assert.True(checked((long)remaining * 1000) < checked((long)scene.InitialResources * scene.Config.Regeneration.TargetInitialPermille));
        Assert.True(scene.AvailableOrbits(afterStop) >= 1);
        ulong nextWave = checked(match.StartTick.Value + scene.Ticks(112000));
        while (scene.World.Tick < nextWave + 4) scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        Assert.Equal(afterStop, scene.ReadTerrain());
    }

    private static BomberObjectBudgetTests.AuthoredFixture Configuration() => new(
        ("game", "default", "match_duration_ms", "240000"),
        ("game", "default", "skills_enabled", "false"),
        ("game", "default", "central_supply_enabled", "false"),
        ("regeneration", "default", "stop_before_final_ms", "20000"));

    private static List<(int X, int Z)> Orbit(int x, int z) => new()
    {
        (x, z), (18 - x, z), (x, 18 - z), (18 - x, 18 - z),
    };

    private static List<(int X, int Z)> Additions(Scene scene, uint[] before)
    {
        var result = new List<(int X, int Z)>();
        for (int z = 0; z < 19; z++)
        for (int x = 0; x < 19; x++)
            if (before[361 + z * 19 + x] == 0 && scene.Read(x, 1, z) != 0) result.Add((x, z));
        return result;
    }

    [Fact]
    public void ActualFirstWaveOriginalConsumesOneCompleteNativePhotoWithoutRepeatingCellReads()
    {
        using var authored = Configuration();
        using var scene = new Scene(authored.Compile());
        scene.ClearSoftResources();
        uint[] before = scene.ReadTerrain();
        Assert.True(scene.AvailableOrbits(before) >= 2);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var original = NativeWorldVoxelResources.Require(scene.Manager).Adapter;
        Assert.Equal(0, original.QueuedCount);
        Assert.Empty(original.CaptureResultCheckpoint().Results);
        var forwarding = new NativeReadWitness(original.Abi);
        var observed = new HostVoxelWorldAdapter(scene.Native.NativeHandle, forwarding) { World = scene.World };
        observed.SetBindingPolicy(original.BindingPolicy);
        IDisposable binding = VoxelGameplayBinding.Bind(scene.Manager, observed);
        scene.Manager.BindVoxelTick(observed.PrepareVoxel, observed.CommitVoxel);
        try
        {
            ulong first = checked(scene.World.Single<BomberMatchState>().StartTick.Value + scene.Ticks(scene.Config.Regeneration.FirstTriggerMs));
            Assert.True(scene.World.Tick < first);
            while (scene.World.Tick < first) scene.Manager.Tick();
            Assert.Equal(before, scene.ReadTerrain());
            scene.Manager.Tick();
            Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
            int cells = runtime.PendingSections.Count;
            Assert.InRange(cells, 4, checked(scene.Config.Regeneration.MaxMirrorOrbits * 4));
            Assert.Equal(0, cells % 4);
            var result = Assert.Single(observed.CaptureResultCheckpoint().Results,
                row => row.TransactionId == runtime.PendingVoxelTransactionIds[0]);
            Assert.Equal(0, result.Outcome.Status);
            Assert.Equal(VoxelTxnState.Applied, result.Outcome.State);
            Assert.Equal(Lumio.GameRuntime.Coordination.VoxelCommitDisposition.Original, result.Outcome.Disposition);
            Assert.True(result.Outcome.TokenConsumed);
            Assert.False(result.Outcome.Receipt.OriginalReceiptBytes.IsEmpty);
            Assert.Equal(result.Outcome.ReceiptByteCount, checked((uint)result.Outcome.Receipt.OriginalReceiptBytes.Length));
            Assert.NotEmpty(result.Outcome.Receipt.Sections!);

            // Only the genuine Original-consumption Tick is measured. SDK Native
            // reads used by the setup/observations do not enter this forwarding ABI.
            forwarding.Recording = true;
            try { scene.Manager.Tick(); }
            finally { forwarding.Recording = false; }
            Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
            Assert.Equal("", runtime.RegenerationPromises.Value);
            Assert.Equal(cells, Additions(scene, before).Count);
            int area = checked(scene.Config.Map.Width * scene.Config.Map.Depth);
            var expected = new List<(ulong Section, int Offset)>(checked(area * 2));
            for (int layer = 0; layer < 2; layer++)
            for (int z = 0; z < scene.Config.Map.Depth; z++)
            for (int x = 0; x < scene.Config.Map.Width; x++)
                expected.Add(BomberTerrainTransactions.Address(scene.Config.Map, x,
                    layer == 0 ? scene.Config.Map.GroundLayer : scene.Config.Map.ObstacleLayer, z));

            // Host.Read(list) legitimately expands to individual ABI reads inside
            // the SDK. Measure actual requested addresses: a single full two-layer
            // photo must contain each cell exactly once, with no earlier per-row
            // probes and no second photo by later rules in the same Tick.
            Assert.Equal(checked(area * 2), forwarding.Reads.Count);
            Assert.Equal(checked(area * 2), forwarding.Reads.Distinct().Count());
            Assert.Equal(expected.ToArray(), forwarding.Reads.ToArray());
            foreach (var group in forwarding.Reads.GroupBy(address => address)) Assert.Single(group);
        }
        finally
        {
            forwarding.Recording = false;
            binding.Dispose();
            _ = VoxelGameplayBinding.Bind(scene.Manager, original);
            scene.Manager.BindVoxelTick(original.PrepareVoxel, original.CommitVoxel);
        }
    }

    [Fact]
    public void ZeroFirstTriggerKeepsItsLogicalScheduleAndTheNextActualNativeWave()
    {
        using var authored = new BomberObjectBudgetTests.AuthoredFixture(
            ("game", "default", "match_duration_ms", "240000"),
            ("game", "default", "skills_enabled", "false"),
            ("game", "default", "central_supply_enabled", "false"),
            ("regeneration", "default", "stop_before_final_ms", "20000"),
            ("regeneration", "default", "first_trigger_ms", "0"));
        using var scene = new Scene(authored.Compile(), expectedFirstTrigger: 0);
        var match = scene.World.Single<BomberMatchState>();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        Assert.Equal(match.MatchId.Value, runtime.RegenerationMatchId.Value);
        ulong next = checked(match.StartTick.Value + scene.Ticks(scene.Config.Regeneration.IntervalMs));
        Assert.Equal(next, runtime.RegenerationNextTick.Value);
        Assert.True(scene.World.Tick < next);
        scene.ClearSoftResources();
        uint[] before = scene.ReadTerrain();
        Assert.True(scene.AvailableOrbits(before) >= 2);
        while (scene.World.Tick <= next + 2) scene.Manager.Tick();
        var additions = Additions(scene, before);
        Assert.InRange(additions.Count, 4, checked(scene.Config.Regeneration.MaxMirrorOrbits * 4));
        Assert.Equal(0, additions.Count % 4);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal("", runtime.RegenerationPromises.Value);
        Assert.Equal(checked(next + scene.Ticks(scene.Config.Regeneration.IntervalMs)), runtime.RegenerationNextTick.Value);
        Assert.All(additions, cell => scene.AssertActualResource(cell.X, cell.Z));
    }

    // Observation-only decorator of the already owning, real Native facade.
    // Every return, out parameter and mutation delegates unchanged. This is not
    // a terrain dictionary, fake outcome, receipt or synthetic revision source.
    private sealed class NativeReadWitness(INativeVoxelAbi inner) : INativeVoxelAbi
    {
        internal bool Recording { get; set; }
        internal List<(ulong Section, int Offset)> Reads { get; } = new();

        public VoxelCellQuery Read(KernelHandle world, ulong section, int offset)
        {
            VoxelCellQuery result = inner.Read(world, section, offset);
            if (Recording) Reads.Add((section, offset));
            return result;
        }

        public VoxelBatchValidation ValidateBatchForCoalescing(KernelHandle world, in VoxelApplyBatch candidate) =>
            inner.ValidateBatchForCoalescing(world, candidate);
        public int OpenPrediction(KernelHandle world, in VoxelPredictionConfig config, out IVoxelPredictionSession? session) =>
            inner.OpenPrediction(world, config, out session);
        public Lumio.GameRuntime.Coordination.VoxelSweepHit Sweep(KernelHandle world, Lumio.GameRuntime.Coordination.VoxelWorldPoint center,
            Lumio.GameRuntime.Coordination.VoxelWorldPoint halfExtents, Lumio.GameRuntime.Coordination.VoxelWorldPoint displacement) =>
            inner.Sweep(world, center, halfExtents, displacement);
        public Lumio.GameRuntime.Coordination.VoxelRaycastHit Raycast(KernelHandle world, Lumio.GameRuntime.Coordination.VoxelWorldPoint origin,
            Lumio.GameRuntime.Coordination.VoxelWorldPoint direction, float maxDistance) => inner.Raycast(world, origin, direction, maxDistance);
        public Lumio.GameRuntime.Coordination.VoxelOverlapHit Overlap(KernelHandle world, Lumio.GameRuntime.Coordination.VoxelWorldPoint center,
            Lumio.GameRuntime.Coordination.VoxelWorldPoint halfExtents) => inner.Overlap(world, center, halfExtents);
        public VoxelApplyReceipt Apply(KernelHandle world, in VoxelApplyBatch batch) => inner.Apply(world, batch);
        public VoxelMutationOutcome ApplyWithResult(KernelHandle world, in VoxelApplyBatch batch) => inner.ApplyWithResult(world, batch);
        public VoxelMutationOutcome QueryReceipt(KernelHandle world, string transaction) => inner.QueryReceipt(world, transaction);
        public void ReplaceBindingContext(KernelHandle world, IReadOnlyList<VoxelBindingPolicyEntry> policy,
            IReadOnlyList<VoxelBindingEntityEntry> entities) => inner.ReplaceBindingContext(world, policy, entities);
        public string? BindingGet(KernelHandle world, ulong section, int offset) => inner.BindingGet(world, section, offset);
        public Lumio.GameRuntime.Coordination.VoxelSweepHit SweepMiss(KernelHandle world) => inner.SweepMiss(world);
        public Lumio.GameRuntime.Coordination.VoxelSweepHit SweepUnresolved(KernelHandle world) => inner.SweepUnresolved(world);
        public bool TryReadSectionBindings(KernelHandle world, ulong section, out IReadOnlyList<SectionBindingEntry> entries,
            out ulong revision) => inner.TryReadSectionBindings(world, section, out entries, out revision);
        public bool TryReadSectionBindingsBudgeted(KernelHandle world, ulong section, Action<long> reserve,
            out IReadOnlyList<SectionBindingEntry> entries, out ulong revision) =>
            inner.TryReadSectionBindingsBudgeted(world, section, reserve, out entries, out revision);
        public SectionResidencyOutcome AcknowledgeSectionDurability(KernelHandle world, ulong section, ulong generation,
            ulong revision) => inner.AcknowledgeSectionDurability(world, section, generation, revision);
        public SectionResidencyOutcome UnloadSection(KernelHandle world, ulong section, ulong generation, ulong revision) =>
            inner.UnloadSection(world, section, generation, revision);
        public SectionResidencyOutcome ReleaseSection(KernelHandle world, ulong section) => inner.ReleaseSection(world, section);
        public SectionResidencyOutcome LoadSection(KernelHandle world, ulong section, SectionLoadEnvelope envelope,
            ReadOnlyMemory<byte> payload) => inner.LoadSection(world, section, envelope, payload);
    }

    // Observations are read directly from the SDK Native world. No copied grid
    // is attached to gameplay and no regeneration method is called by the test.
    private sealed class Scene : IDisposable
    {
        private ulong transaction = 991810;
        internal readonly WorldManager Manager;
        internal readonly NativeVoxelWorld Native;
        internal readonly NetEntityId[] Lives;
        internal readonly IBomberConfig Config;
        internal readonly int InitialResources;
        internal World World => Manager.World;

        internal Scene(string configDirectory, uint expectedFirstTrigger = 8000)
        {
            Manager = BomberTestWorld.Start(configDirectory: configDirectory, withMap: true, receiptLimit: 64);
            Native = NativeWorldVoxelResources.Require(Manager).Voxel;
            Config = BomberConfigBinding.For(World);
            try
            {
                Assert.Equal(19, Config.Map.Width);
                Assert.Equal(19, Config.Map.Depth);
                Assert.Equal(8, Config.Game.PlayerCount);
                Assert.Equal("LegacyPillars", Config.Map.LayoutKind);
                Assert.Equal(expectedFirstTrigger, Config.Regeneration.FirstTriggerMs);
                Assert.Equal(8000u, Config.Regeneration.IntervalMs);
                Assert.Equal(2, Config.Regeneration.MaxMirrorOrbits);
                Assert.Equal(115000u, Config.FinalCircle.DurationMs);
                AuthorInitialSoftResources();
                uint[] originalTerrain = ReadTerrain();
                var orders = Enumerable.Range(0, 8).Select(i => BomberTestWorld.QueuePlayer(World, "regeneration-" + i)).ToArray();
                Manager.Tick(); Manager.Tick();
                Lives = orders.Select(order => order.AssignedId).ToArray();
                ulong limit = checked(World.Tick + Ticks(Config.Game.WarmupMs) + 16);
                while (World.Single<BomberMatchState>().Phase.Value != (int)BomberMatchPhase.Running && World.Tick < limit) Manager.Tick();
                Assert.Equal((int)BomberMatchPhase.Running, World.Single<BomberMatchState>().Phase.Value);
                Assert.Empty(Additions(this, originalTerrain));
                foreach (NetEntityId life in Lives)
                    BomberEffectIntegrationTests.Position(World.Get<LogicTransform>(life), new Vector3(9.5f, 1.5f, 9.5f));
                BomberFinalCircleState circle = World.Single<BomberFinalCircleState>();
                if (!circle.ResourceCountInitialized.Value) Manager.Tick();
                Assert.True(circle.ResourceCountInitialized.Value);
                InitialResources = CountResources(ReadTerrain());
                Assert.Equal(64, InitialResources);
                Assert.Equal(InitialResources, circle.InitialResourceCount.Value);
                Assert.Equal(0, World.Single<BomberWorldRuntime>().InitialResourcePhase.Value);
                Assert.Equal(0, World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
            }
            catch
            {
                Manager.Dispose();
                throw;
            }
        }

        internal ulong Ticks(uint milliseconds) => Lumio.GameRuntime.Ecs.Ticks.FromMilliseconds(milliseconds, Config.Game.TickRateHz);
        internal uint Block(string name) => checked(Config.Tables.Blocks.Rows.Single(row => row.Name == name).BlockType << 8);
        internal uint Read(int x, int y, int z) => Native.ReadCell(new VoxelWorldCoordinate(x, checked((byte)y), z)).BlockId;
        internal uint[] ReadTerrain() => Enumerable.Range(0, 722).Select(index => Read(index % 19, index / 361, index % 361 / 19)).ToArray();

        private void AuthorInitialSoftResources()
        {
            // The official Legacy capture is the static floor/pillar base, not
            // random resource truth. Author a real, symmetric 64-cell input before
            // the production census; never assign a counter or a resource fact.
            var reserved = Orbit(5, 5).Concat(Orbit(4, 5)).ToHashSet();
            var soft = new List<(int X, int Y, int Z, uint Block)>();
            int potential = 0;
            for (int z = 1; z < 18; z++)
            for (int x = 1; x < 18; x++)
                if (Read(x, 0, z) == Block("floor") && Read(x, 1, z) == 0) potential++;
            for (int z = 1; z < 9 && soft.Count < 64; z++)
            for (int x = 1; x < 9 && soft.Count < 64; x++)
            {
                var orbit = Orbit(x, z);
                if (!orbit.All(cell => !reserved.Contains(cell) && !M2InitialLayout.IsSafetyCell(19, cell.X, cell.Z) &&
                    Read(cell.X, 0, cell.Z) == Block("floor") && Read(cell.X, 1, cell.Z) == 0)) continue;
                soft.AddRange(orbit.Select(cell => (cell.X, 1, cell.Z, Block("softBrick"))));
            }
            Assert.Equal(64, soft.Count);
            Assert.True(checked(soft.Count * 1000) <= checked(potential * Config.Map.SoftBrickPermille));
            Author(soft);
            Assert.Equal(64, CountResources(ReadTerrain()));
        }

        internal int CountResources(uint[] terrain)
        {
            int result = 0;
            for (int z = 0; z < 19; z++)
            for (int x = 0; x < 19; x++)
            {
                uint block = terrain[361 + z * 19 + x];
                if (block == Block("softBrick")) result++;
                else if (block == Block("chest"))
                {
                    var address = BomberTerrainTransactions.Address(Config.Map, x, 1, z);
                    string? binding = NativeWorldVoxelResources.Require(Manager).Adapter.BindingGet(address.Section, address.Offset);
                    Assert.True(NetEntityId.TryParse(binding!, out NetEntityId id));
                    Assert.True(World.IsLive(id));
                    uint tier = World.Get<BomberChestState>(id).ResourceTier.Value;
                    if (Config.Tables.Chest.Rows.Any(row => row.Id == tier && row.Name is "Wood" or "Iron" or "Gold")) result++;
                }
            }
            return result;
        }

        internal void ClearSoftResources() => Author(Enumerable.Range(0, 361)
            .Where(index => Read(index % 19, 1, index / 19) == Block("softBrick"))
            .Select(index => (index % 19, 1, index / 19, 0u)));

        internal void IsolateOrbit(int retainedSoft)
        {
            var open = Orbit(5, 5);
            var later = Orbit(4, 5);
            var retained = Enumerable.Range(0, 361).Select(index => (X: index % 19, Z: index / 19))
                .Where(cell => !open.Contains(cell) && !later.Contains(cell) && Read(cell.X, 1, cell.Z) == Block("softBrick"))
                .Take(retainedSoft).ToHashSet();
            Assert.Equal(retainedSoft, retained.Count);
            var writes = new List<(int X, int Y, int Z, uint Block)>();
            for (int z = 1; z < 18; z++)
            for (int x = 1; x < 18; x++)
                if (!retained.Contains((x, z))) writes.Add((x, 1, z, open.Contains((x, z)) || M2InitialLayout.IsSafetyCell(19, x, z) ? 0u : Block("hardPillar")));
            // The candidate floor is real authoring, then the negative changes
            // exactly one of its four actual ground cells to catalog water.
            writes.AddRange(open.Select(cell => (cell.X, 0, cell.Z, Block("floor"))));
            Author(writes);
        }

        internal void Author(IEnumerable<(int X, int Y, int Z, uint Block)> source)
        {
            VoxelBlockWriteEntry[] writes = source.Select(cell => new VoxelBlockWriteEntry(
                new VoxelSectionKey(cell.X >> 4, checked((byte)(cell.Y >> 4)), cell.Z >> 4),
                checked((ushort)(((cell.Y & 15) << 8) | ((cell.Z & 15) << 4) | (cell.X & 15))), cell.Block,
                Native.ReadCell(new VoxelWorldCoordinate(cell.X, checked((byte)cell.Y), cell.Z)).SectionRevision)).ToArray();
            using var token = Native.PrepareWriteV2(transaction++, writes, Array.Empty<VoxelBindingMutationEntry>());
            var limits = Native.GetOutputRequirements(token);
            Assert.Equal(0, Native.CommitV3(token, new VoxelWriteReceipt[limits.SectionCapacity], new byte[limits.ReceiptByteCapacity]).Status);
        }

        internal int AvailableOrbits(uint[] terrain)
        {
            int count = 0;
            for (int z = 1; z < 9; z++)
            for (int x = 1; x < 9; x++)
                if (Orbit(x, z).All(cell => terrain[361 + cell.Z * 19 + cell.X] == 0 &&
                    terrain[cell.Z * 19 + cell.X] != Block("water") && !M2InitialLayout.IsSafetyCell(19, cell.X, cell.Z) &&
                    Math.Abs(cell.X - 9) + Math.Abs(cell.Z - 9) >= Config.Regeneration.ThreatDistanceCells)) count++;
            return count;
        }

        internal void ReachFirstWave(uint[] before)
        {
            ulong first = checked(World.Single<BomberMatchState>().StartTick.Value + Ticks(Config.Regeneration.FirstTriggerMs));
            Assert.True(World.Tick < first);
            while (World.Tick < first) Manager.Tick();
            Assert.Equal(before, ReadTerrain());
            // Includes real Native commit and next-frame receipt consumption,
            // while staying far before the second 8-second opportunity.
            for (int i = 0; i < 4; i++) Manager.Tick();
        }

        internal void AssertActualResource(int x, int z)
        {
            uint block = Read(x, 1, z);
            Assert.Contains(block, new[] { Block("softBrick"), Block("chest"), Block("barrel") });
            if (block == Block("softBrick")) return;
            var address = BomberTerrainTransactions.Address(Config.Map, x, 1, z);
            string? binding = NativeWorldVoxelResources.Require(Manager).Adapter.BindingGet(address.Section, address.Offset);
            Assert.True(NetEntityId.TryParse(binding!, out NetEntityId id));
            Assert.True(World.IsLive(id));
            if (block == Block("chest"))
            {
                Assert.True(World.TypeOf(id).Is<BomberChestEntity>());
                Assert.True(World.Get<BomberChestState>(id).ResourceGeneration.Value > 1);
                uint tier = World.Get<BomberChestState>(id).ResourceTier.Value;
                Assert.Contains(Config.Tables.Chest.Rows.Single(row => row.Id == tier).Name, ResourceChestNames);
            }
            else
            {
                Assert.True(World.TypeOf(id).Is<BomberBarrelEntity>());
                Assert.True(World.Get<BomberBarrelState>(id).ResourceGeneration.Value > 1);
            }
        }

        public void Dispose() => Manager.Dispose();
    }
}
