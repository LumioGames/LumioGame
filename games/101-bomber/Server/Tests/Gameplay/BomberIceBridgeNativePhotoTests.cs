using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Xunit;
using KernelHandle = Lumio.Engine.NativeLoader.KernelHandle;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberIceBridgeNativePhotoTests
{
    private const int X = 6, Z = 5;
    private const uint Water = 1027u << 8, Ice = 1031u << 8;

    [Theory]
    [InlineData("freezeOriginal")]
    [InlineData("activeOwner")]
    [InlineData("waterOriginal")]
    public void ActualBridgeTickUsesOneCompleteTwoLayerNativePhoto(string phase)
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        var runtime = scene.World.Single<BomberWorldRuntime>();
        HostVoxelWorldAdapter originalAdapter = scene.Adapter;
        Assert.Equal(0, originalAdapter.QueuedCount);
        Assert.Empty(originalAdapter.CaptureResultCheckpoint().Results);
        var forwarding = new NativeReadWitness(originalAdapter.Abi);
        var observed = new HostVoxelWorldAdapter(scene.Native.NativeHandle, forwarding) { World = scene.World };
        observed.SetBindingPolicy(originalAdapter.BindingPolicy);
        IDisposable binding = VoxelGameplayBinding.Bind(scene.Manager, observed);
        scene.Manager.BindVoxelTick(observed.PrepareVoxel, observed.CommitVoxel);
        try
        {
            var order = scene.Bomb();
            order.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
            BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(5.5f, 1.5f, Z + .5f));
            for (int tick = 0; tick < 8 && GroundBlock(scene) != Ice; tick++) scene.TickControlled();
            Assert.Equal(Ice, GroundBlock(scene));
            var bridge = Assert.Single(scene.World.Each<BomberIceBridgeState>());
            NetEntityId bridgeId = bridge.Entity;
            Assert.Equal(bridgeId.ToHex(), observed.BindingGet(Address(scene).Section, Address(scene).Offset));
            VoxelResultCheckpoint freezeOriginal = ActualOriginal(scene, observed);
            ulong freezeSubmitted = runtime.PendingVoxelSubmittedTicks[0];
            Assert.Equal(0UL, bridge.AppliedTick.Value);
            Assert.Equal(0UL, bridge.ExpiresAtTick.Value);

            if (phase != "freezeOriginal")
            {
                scene.TickControlled();
                Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
                Assert.Equal(freezeSubmitted, bridge.AppliedTick.Value);
                Assert.Equal(checked(freezeSubmitted + Ticks.FromMilliseconds(8000,
                    BomberConfigBinding.For(scene.World).Game.TickRateHz)), bridge.ExpiresAtTick.Value);
                Assert.True(scene.World.IsLive(bridgeId));
                Assert.Equal(Ice, GroundBlock(scene));
            }

            if (phase == "waterOriginal")
            {
                ulong latest = checked(bridge.ExpiresAtTick.Value + 8);
                while (scene.World.Tick <= latest && GroundBlock(scene) != Water) scene.TickControlled();
                Assert.Equal(Water, GroundBlock(scene));
                Assert.Null(observed.BindingGet(Address(scene).Section, Address(scene).Offset));
                Assert.True(scene.World.IsLive(bridgeId));
                Assert.Equal(Ice, runtime.PendingOldBlocks[0]);
                Assert.Equal(Water, runtime.PendingNewBlocks[0]);
                Assert.Equal(bridgeId, runtime.PendingChests[0]);
                VoxelResultCheckpoint waterOriginal = ActualOriginal(scene, observed);
                Assert.Empty(waterOriginal.AppliedDigs);
                Assert.Empty(waterOriginal.DestroyedEntities);
                Assert.NotEqual(Assert.Single(freezeOriginal.Results).TransactionId,
                    Assert.Single(waterOriginal.Results).TransactionId);
            }
            else if (phase == "activeOwner")
            {
                Assert.Empty(observed.CaptureResultCheckpoint().Results);
                Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
            }
            else Assert.Equal("freezeOriginal", phase);

            // Measure only this normal production Tick. Setup and witness SDK
            // ReadCell calls do not traverse this recording ABI decorator.
            forwarding.Reads.Clear();
            forwarding.Recording = true;
            try { scene.TickControlled(); }
            finally { forwarding.Recording = false; }

            Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
            if (phase == "waterOriginal")
            {
                Assert.False(scene.World.IsLive(bridgeId));
                Assert.Equal(Water, GroundBlock(scene));
                Assert.Null(observed.BindingGet(Address(scene).Section, Address(scene).Offset));
            }
            else
            {
                Assert.True(scene.World.IsLive(bridgeId));
                Assert.Equal(Ice, GroundBlock(scene));
                Assert.Equal(bridgeId.ToHex(), observed.BindingGet(Address(scene).Section, Address(scene).Offset));
                Assert.Equal(freezeSubmitted, bridge.AppliedTick.Value);
                Assert.Equal(checked(freezeSubmitted + Ticks.FromMilliseconds(8000,
                    BomberConfigBinding.For(scene.World).Game.TickRateHz)), bridge.ExpiresAtTick.Value);
            }

            var map = BomberConfigBinding.For(scene.World).Map;
            int area = checked(map.Width * map.Depth);
            var expected = new List<(ulong Section, int Offset)>(checked(area * 2));
            for (int layer = 0; layer < 2; layer++)
            for (int z = 0; z < map.Depth; z++)
            for (int x = 0; x < map.Width; x++)
                expected.Add(BomberTerrainTransactions.Address(map, x,
                    layer == 0 ? map.GroundLayer : map.ObstacleLayer, z));
            // Host.Read expands its one complete photo into ABI cell reads.
            // Exact count/order/uniqueness detects both owner/cohort probes and
            // a later complete photo repeated by another production consumer.
            Assert.Equal(checked(area * 2), forwarding.Reads.Count);
            Assert.Equal(checked(area * 2), forwarding.Reads.Distinct().Count());
            Assert.Equal(expected.ToArray(), forwarding.Reads.ToArray());
            foreach (var group in forwarding.Reads.GroupBy(address => address)) Assert.Single(group);
        }
        finally
        {
            forwarding.Recording = false;
            binding.Dispose();
            scene.Manager.BindVoxelTick(originalAdapter.PrepareVoxel, originalAdapter.CommitVoxel);
        }
    }

    private static VoxelResultCheckpoint ActualOriginal(BomberTerrainProductionTests.Scene scene, HostVoxelWorldAdapter adapter)
    {
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        VoxelResultCheckpoint checkpoint = adapter.CaptureResultCheckpoint();
        var result = Assert.Single(checkpoint.Results, row => row.TransactionId == runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(0, result.Outcome.Status);
        Assert.Equal(VoxelTxnState.Applied, result.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Original, result.Outcome.Disposition);
        Assert.True(result.Outcome.TokenConsumed);
        Assert.False(result.Outcome.Receipt.OriginalReceiptBytes.IsEmpty);
        Assert.Equal(result.Outcome.ReceiptByteCount, checked((uint)result.Outcome.Receipt.OriginalReceiptBytes.Length));
        var section = Assert.Single(result.Outcome.Receipt.Sections!);
        Assert.Equal(runtime.PendingSections[0], section.SectionKey);
        Assert.True(section.UpToSectionRevision > runtime.PendingExpectedRevisions[0]);
        return checkpoint;
    }

    private static (ulong Section, int Offset) Address(BomberTerrainProductionTests.Scene scene) =>
        BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, X,
            BomberConfigBinding.For(scene.World).Map.GroundLayer, Z);
    private static uint GroundBlock(BomberTerrainProductionTests.Scene scene) =>
        scene.Native.ReadCell(new VoxelWorldCoordinate(X,
            checked((byte)BomberConfigBinding.For(scene.World).Map.GroundLayer), Z)).BlockId;


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

    private sealed class Fixture : IDisposable
    {
        private readonly BomberObjectBudgetTests.AuthoredFixture authored = new(("bomb_kinds", "Remote", "enabled", "true"));
        internal BomberTerrainProductionTests.Scene Scene { get; }

        internal Fixture()
        {
            Scene = new BomberTerrainProductionTests.Scene(0, configDirectory: authored.Compile(), controlled: true);
            for (int z = 3; z <= 15; z++)
            for (int x = 3; x <= 15; x++) Scene.Write(x, 1, z, 0);
            Scene.Write(X, 0, Z, Water);
            Assert.Equal(Water, GroundBlock(Scene));
            Assert.Equal("LegacyPillars", BomberConfigBinding.For(Scene.World).Map.LayoutKind);
            Assert.False(BomberConfigBinding.For(Scene.World).Tables.Blocks.Rows.Single(block => block.Name == "ice").Enabled);
            foreach (NetEntityId life in Scene.Lives)
                BomberEffectIntegrationTests.Position(Scene.World.Get<LogicTransform>(life), new Vector3(15.5f, 1.5f, 15.5f));
        }

        public void Dispose() { Scene.Dispose(); authored.Dispose(); }
    }
}
