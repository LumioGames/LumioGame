using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberTerrainNativeBoundsTests
{
    [Theory]
    [InlineData(9, true)]
    [InlineData(8, true)]
    public void ReleasedMutationDoesNotEnforceTheSeparateRegionPinBudget(int sections, bool accepted)
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8);
        // P04's eight-section creation option budgets explicit region pins, not mutation sections.
        // Keep the real nine-section counterexample; the managed SDK exposes no region-pin declaration.
        var origin = new VoxelSectionKey(0, 0, 0);
        ulong revision = scene.Native.ReadCell(new VoxelWorldCoordinate(0, 0, 0)).SectionRevision;
        byte[] payload; VoxelSectionExportResult record;
        using (var export = scene.Native.OpenSectionExport(new(1, 1024 * 1024, 1024 * 1024)))
        using (var snapshot = export.Acquire(origin, revision))
        {
            Assert.Equal(5, export.Read(snapshot, null, Span<byte>.Empty, out var size));
            payload = new byte[size.RequiredBytes];
            Assert.Equal(0, export.Read(snapshot, null, payload, out record));
        }
        for (int i = 0; i < 5; i++)
            scene.Native.LoadSectionFromRecord(new(10 + i, 0, 0), record.Encoding, revision, payload, record.PayloadSha256.Span);
        var keys = new[] { (0, 0), (1, 0), (0, 1), (1, 1), (10, 0), (11, 0), (12, 0), (13, 0), (14, 0) };
        var writes = keys.Take(sections).Select(k => new VoxelWriteEntry(VoxelPackedSection.Encode(k.Item1, 0, k.Item2),
            0, 1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(k.Item1 * 16, 0, k.Item2 * 16)).SectionRevision)).ToArray();
        Assert.All(writes, w => Assert.True(scene.Adapter.Read(new[] { (w.SectionKey, w.CellOffset) })[0].HasBlockId));
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageWrite(writes, "native-section-boundary").Status);
        scene.Manager.Tick();
        var outcome = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results).Outcome;
        Assert.Equal(accepted ? VoxelTxnState.Applied : VoxelTxnState.Aborted, outcome.State);
        Assert.Equal(accepted ? VoxelCommitDisposition.Original : VoxelCommitDisposition.None, outcome.Disposition);
        Assert.Equal(accepted ? 0 : (int)VoxelErrorCode.ResidencyPinExceedsBudget, outcome.Status);
        foreach (var key in keys.Take(sections))
            Assert.Equal(accepted ? 1025u << 8 : 1022u << 8,
                scene.Native.ReadCell(new VoxelWorldCoordinate(key.Item1 * 16, 0, key.Item2 * 16)).BlockId);
        Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        scene.Manager.Tick();
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().TerrainReservedPickups.Value);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Equal(0, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void IndependentNativeOutputSectionExhaustionAndAcceptedNeighbor(bool retainSection, bool accepted)
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8);
        // This independent producer owns its delivery queue. Game retains its normal adapter;
        // only the ordinary manager prepare/commit binding drives this producer's Native work.
        var producer = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native),
            new WorldIngressBudget(2, 65536, 2, 65536)) { World = scene.World };
        scene.Manager.BindVoxelTick(producer.PrepareVoxel, producer.CommitVoxel);
        ulong revision = scene.Native.ReadCell(new VoxelWorldCoordinate(1, 0, 0)).SectionRevision;
        Assert.Equal(VoxelStageStatus.Staged, producer.TryStageWrite(new[] { new VoxelWriteEntry(0, 1, 1025u << 8, revision) }, "retained-section-credit").Status);
        scene.Manager.Tick();
        Assert.Equal(1u, Assert.Single(producer.CaptureResultCheckpoint().Results).Outcome.SectionCount);
        if (!retainSection) Assert.Single(producer.DrainResults().Results);
        var keys = new[] { (X: 0, Section: 0UL), (X: 16, Section: VoxelPackedSection.Encode(1, 0, 0)) };
        var writes = keys.Select(k => new VoxelWriteEntry(k.Section, 0, 1025u << 8,
            scene.Native.ReadCell(new VoxelWorldCoordinate(k.X, 0, 0)).SectionRevision)).ToArray();
        Assert.Equal(VoxelStageStatus.Staged, producer.TryStageWrite(writes, "two-native-sections").Status);
        scene.Manager.Tick();
        var outcome = producer.CaptureResultCheckpoint().Results.Single(r => r.TransactionId == "two-native-sections").Outcome;
        Assert.Equal(accepted ? VoxelTxnState.Applied : VoxelTxnState.Aborted, outcome.State);
        Assert.Equal(accepted ? VoxelCommitDisposition.Original : VoxelCommitDisposition.None, outcome.Disposition);
        Assert.Equal(accepted ? 0 : 5, outcome.Status);
        Assert.Equal(2u, outcome.SectionCount); // Actual Native output requirements, independent of Game lists and bytes.
        Assert.True(outcome.TokenConsumed);
        foreach (var key in keys)
            Assert.Equal(accepted ? 1025u << 8 : 1022u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(key.X, 0, 0)).BlockId);
        Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().TerrainReservedPickups.Value);
        Assert.Equal(0, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
    }

    [Fact]
    public void ActualNativeDuplicateRetainsOwnedObligationUntilOriginalDelivery()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1026u << 8);
        var bombOrder = scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        int priorHits = scene.World.Get<BomberBombState>(bombOrder.AssignedId).HitParticipants.Count;
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string transaction = runtime.PendingVoxelTransactionIds[0];
        string detail = runtime.TerrainPendingDetails[0];
        var original = scene.Adapter.CaptureResultCheckpoint();
        var adapter = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var binding = VoxelGameplayBinding.Bind(scene.Manager, adapter);
        scene.Manager.BindVoxelTick(adapter.PrepareVoxel, adapter.CommitVoxel);
        var writes = Enumerable.Range(0, runtime.PendingSections.Count).Select(i => new VoxelWriteEntry(
            runtime.PendingSections[i], runtime.PendingCellOffsets[i], runtime.PendingNewBlocks[i], runtime.PendingExpectedRevisions[i])).ToArray();
        Assert.Equal(VoxelStageStatus.Staged, adapter.TryStageWrite(writes, transaction, VoxelSubmissionIntent.Replay).Status);
        scene.Manager.Tick();
        var duplicate = Assert.Single(adapter.CaptureResultCheckpoint().Results);
        Assert.Equal(transaction, duplicate.TransactionId);
        Assert.Equal(VoxelCommitDisposition.Duplicate, duplicate.Outcome.Disposition);
        Assert.Equal(VoxelTxnState.Applied, duplicate.Outcome.State);
        Assert.True(duplicate.Outcome.TokenConsumed);
        scene.Manager.Tick(); // Game receives the actual Native Duplicate, never an invented receipt.
        Assert.Equal(detail, runtime.TerrainPendingDetails[0]);
        Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(1, runtime.TerrainReservedPickups.Value);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Equal(0, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
        Assert.Equal(priorHits, scene.World.Get<BomberBombState>(bombOrder.AssignedId).HitParticipants.Count);
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var delivered = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        delivered.RestoreResultCheckpoint(original);
        using var deliveryBinding = VoxelGameplayBinding.Bind(scene.Manager, delivered);
        scene.Manager.BindVoxelTick(delivered.PrepareVoxel, delivered.CommitVoxel);
        scene.Manager.Tick();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
        Assert.Equal(1, scene.World.Each<BomberPickupItem>().Count() + runtime.TerrainRewards.Count);
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        scene.Manager.Tick();
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
    }

    [Fact]
    public void OwnedUnknownAfterNativeHistoryEvictionCannotReissueOrLoseObligation()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1026u << 8, receiptLimit: 1);
        var bomb = scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        int priorHits = scene.World.Get<BomberBombState>(bomb.AssignedId).HitParticipants.Count;
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string transaction = runtime.PendingVoxelTransactionIds[0], detail = runtime.TerrainPendingDetails[0];
        var original = scene.Adapter.CaptureResultCheckpoint();
        var adapter = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var binding = VoxelGameplayBinding.Bind(scene.Manager, adapter);
        scene.Manager.BindVoxelTick(adapter.PrepareVoxel, adapter.CommitVoxel);
        var read = scene.Native.ReadCell(new VoxelWorldCoordinate(7, 1, 7));
        Assert.Equal(VoxelStageStatus.Staged, adapter.TryStageWrite(new[] { new VoxelWriteEntry(0, 256 + 7 * 16 + 7, 1025u << 8, read.SectionRevision) }, "evicts-owned-history").Status);
        scene.Manager.Tick();
        Assert.Equal(VoxelTxnState.Unknown, adapter.QueryTransaction(transaction).State);
        var writes = Enumerable.Range(0, runtime.PendingSections.Count).Select(i => new VoxelWriteEntry(
            runtime.PendingSections[i], runtime.PendingCellOffsets[i], runtime.PendingNewBlocks[i], runtime.PendingExpectedRevisions[i])).ToArray();
        Assert.Equal(VoxelStageStatus.OutcomeUnknown, adapter.TryStageWrite(writes, transaction, VoxelSubmissionIntent.Replay).Status);
        // Released replay admission returns OutcomeUnknown without creating a delivery row.
        // There is no supported non-faulting API to manufacture an owned Unknown delivery.
        Assert.DoesNotContain(adapter.CaptureResultCheckpoint().Results, r => r.TransactionId == transaction);
        for (int i = 0; i < 16; i++) scene.Manager.Tick();
        Assert.True(scene.World.IsLive(bomb.AssignedId));
        Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(detail, runtime.TerrainPendingDetails[0]);
        Assert.Equal(1, runtime.TerrainReservedPickups.Value);
        Assert.Equal(priorHits, scene.World.Get<BomberBombState>(bomb.AssignedId).HitParticipants.Count);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Equal(0, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var delivered = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        delivered.RestoreResultCheckpoint(original);
        using var deliveryBinding = VoxelGameplayBinding.Bind(scene.Manager, delivered);
        scene.Manager.BindVoxelTick(delivered.PrepareVoxel, delivered.CommitVoxel);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
        Assert.Equal(1, scene.World.Each<BomberPickupItem>().Count() + runtime.TerrainRewards.Count);
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }
}
