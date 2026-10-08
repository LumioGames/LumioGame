using System;
using System.IO;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Replication.Binding;
using Lumio.Wire;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberTerrainProductionTests
{
    internal sealed class Scene : IDisposable
    {
        private readonly IDisposable? budgetBinding;
        private ulong authoredTransaction = 900100;
        internal readonly NativeVoxelWorld Native;
        internal readonly WorldManager Manager;
        internal readonly HostVoxelWorldAdapter Adapter;
        internal readonly NetEntityId[] Lives;
        internal World World => Manager.World;
        internal readonly EntityBindingQuery? ControlledBinding;
        internal readonly System.Collections.Generic.List<SuccessorTransferRequest> PendingTransfers = new();
        internal readonly System.Collections.Generic.List<SuccessorResult> TransferResults = new();

        internal Scene(uint obstacle, int x = 6, int z = 5, bool m2 = false, WorldIngressBudget? budget = null, ulong initialTicks = 0, uint receiptLimit = 64, string? configDirectory = null, bool controlled = false, bool persistence = false)
        {
            var admission = controlled ? new BomberAdmissionFixture() : null;
            Manager = BomberTestWorld.Start(admission: admission, configDirectory: configDirectory, withMap: true, receiptLimit: receiptLimit, persistence: persistence);
            NativeWorldVoxelResources resources = NativeWorldVoxelResources.Require(Manager);
            Native = resources.Voxel;
            Adapter = budget is null ? resources.Adapter : new HostVoxelWorldAdapter(Native.NativeHandle, new VoxelFacadeNativeAbi(Native), budget) { World = World };
            if (budget is not null)
            {
                // Fault-inject only the adapter admission budget, as these existing cases
                // require. The real owner/Native world and normal retry budget stay intact.
                budgetBinding = VoxelGameplayBinding.Bind(Manager, Adapter);
                Manager.BindVoxelTick(Adapter.PrepareVoxel, Adapter.CommitVoxel);
            }
            if (m2) AuthorM2Base();
            Write(x, 1, z, obstacle);
            if (controlled)
            {
                ControlledBinding = EntityBindingQuery.Create(Manager);
                for (int i = 0; i < 8; i++)
                    admission!.Enqueue("successor-" + i, "effects-" + i, "bomber-test", "player", WireProfile.SuccessorBindingReceiptsPartsV1);
                Manager.Tick(); Manager.Tick(); Manager.Tick();
                Lives = Enumerable.Range(0, 8).Select(i =>
                {
                    Assert.True(ControlledBinding.TryResolveConnectionState("successor-" + i, out NetEntityId id, out _));
                    return id;
                }).ToArray();
                World.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Running;
                foreach (NetEntityId id in Lives)
                {
                    World.Get<BomberPlayerState>(id).LifePhase.Value = (int)BomberLifePhase.Vulnerable;
                    World.Get<BomberPlayerState>(id).ProtectedUntilTick.Value = 0;
                }
                _ = Manager.DrainOutbox();
                admission!.PublishAndSettle();
            }
            else
            {
                while (World.Tick < initialTicks) Manager.Tick();
                var orders = Enumerable.Range(0, 8).Select(i => BomberTestWorld.QueuePlayer(World, "effects-" + i)).ToArray();
                Manager.Tick(); Manager.Tick(); Manager.Tick();
                Lives = orders.Select(o => o.AssignedId).ToArray();
                World.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Running;
                foreach (var id in Lives)
                {
                    World.Get<BomberPlayerState>(id).LifePhase.Value = (int)BomberLifePhase.Vulnerable;
                    World.Get<BomberPlayerState>(id).ProtectedUntilTick.Value = 0;
                }
            }
            World.Single<BomberMatchState>().PhaseEndTick.Value = checked(World.Tick +
                Ticks.FromMilliseconds(BomberConfigBinding.For(World).Game.MatchDurationMs, BomberConfigBinding.For(World).Game.TickRateHz));
            for (int i = 0; i < Lives.Length; i++)
                BomberEffectIntegrationTests.Position(World.Get<LogicTransform>(Lives[i]), new Vector3(1.5f, 1.5f, 1.5f + i));
            BomberEffectIntegrationTests.Position(World.Get<LogicTransform>(Lives[0]), new Vector3(7.5f, 1.5f, 5.5f));
        }

        private void AuthorM2Base()
        {
            const int size = 19, center = 9, radius = 3;
            var writes = new System.Collections.Generic.List<VoxelBlockWriteEntry>();
            for (int y = 0; y < 2; y++)
                for (int z = 0; z < size; z++)
                    for (int x = 0; x < size; x++)
                    {
                        int dx = Math.Abs(x - center), dz = Math.Abs(z - center);
                        bool water = (Math.Max(dx, dz) == radius && dx != 0 && dz != 0) ||
                            Enumerable.Range(0, 2).Any(i => dx == radius + 1 + i / 2 && dz == radius + (i + 1) / 2);
                        bool border = x == 0 || z == 0 || x == size - 1 || z == size - 1;
                        bool pillar = !border && !water && Math.Max(dx, dz) >= radius && x % 2 == 0 && z % 2 == 0;
                        uint block = y == 0 ? (water ? 1027u : 1022u) << 8 : border ? 1023u << 8 : pillar ? 1024u << 8 : 0;
                        var read = Native.ReadCell(new VoxelWorldCoordinate(x, (byte)y, z));
                        writes.Add(new(new VoxelSectionKey(x >> 4, 0, z >> 4), (ushort)((y << 8) | ((z & 15) << 4) | (x & 15)), block, read.SectionRevision));
                    }
            using var token = Native.PrepareWriteV2(900001, writes.ToArray(), Array.Empty<VoxelBindingMutationEntry>());
            var limits = Native.GetOutputRequirements(token);
            Assert.Equal(0, Native.CommitV3(token, new VoxelWriteReceipt[limits.SectionCapacity], new byte[limits.ReceiptByteCapacity]).Status);
        }

        internal void Write(int x, int y, int z, uint block)
        {
            var address = new VoxelWorldCoordinate(x, checked((byte)y), z);
            var before = Native.ReadCell(address);
            using var token = Native.PrepareWriteV2(authoredTransaction++,
                new[] { new VoxelBlockWriteEntry(new VoxelSectionKey(x >> 4, (byte)(y >> 4), z >> 4),
                    (ushort)(((y & 15) << 8) | ((z & 15) << 4) | (x & 15)), block, before.SectionRevision) },
                Array.Empty<VoxelBindingMutationEntry>());
            var limits = Native.GetOutputRequirements(token);
            var result = Native.CommitV3(token, new VoxelWriteReceipt[limits.SectionCapacity], new byte[limits.ReceiptByteCapacity]);
            Assert.Equal(0, result.Status);
        }

        internal EntityOrder Bomb(bool pierce = false)
        {
            EntityOrder order = BomberEffectIntegrationTests.Bomb(World, Lives[1], Lives[0], 101);
            BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(5.5f, 1.5f, 5.5f));
            order.Get<BomberBombState>().PierceLayers.Value = pierce ? 6 : 0;
            order.Get<BomberBombState>().Power.Value = 4;
            return order;
        }

        internal NetEntityId Chest(string tier)
        {
            var order = World.Commands.Create<BomberChestEntity>();
            Manager.Tick();
            var chest = World.Get<BomberChestState>(order.AssignedId);
            chest.InitializeTier(BomberConfigBinding.For(World).Tables.Chest.Rows.Single(r => r.Name == tier).Id, 1);
            Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1028, World.Registry.WireName(typeof(BomberChestEntity))) });
            var before = Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5));
            var entry = new VoxelWriteEntry(0, 256 + 5 * 16 + 6, 1028u << 8, before.SectionRevision);
            var result = Adapter.TryStageMutation(new[] { entry },
                new[] { new VoxelBindingOp(0, entry.CellOffset, order.AssignedId.ToHex()) { ExpectedSectionRevision = entry.ExpectedSectionRevision } }, "fixture-chest");
            Assert.Equal(VoxelStageStatus.Staged, result.Status);
            Manager.Tick();
            Assert.Equal(order.AssignedId.ToHex(), Adapter.BindingGet(0, entry.CellOffset));
            return order.AssignedId;
        }

        // This is a Runtime owner integration driver, not full Host/Platform acceptance.
        // It transports actual requests using the authenticated accounts admitted above.
        internal void TickControlled(bool deliverTransfers = true)
        {
            Manager.Tick();
            var outbox = Manager.DrainOutbox();
            PendingTransfers.AddRange(outbox.SuccessorRequests);
            TransferResults.AddRange(outbox.SuccessorResults);
            if (!deliverTransfers) return;
            foreach (SuccessorTransferRequest request in PendingTransfers)
            {
                int slot = World.Get<BomberParticipantState>(request.ParticipantId).Slot.Value;
                Manager.Enqueue(new TransferSuccessorConnectionMessage(request, "successor-" + slot,
                    "effects-" + slot, "bomber-test", WireProfile.SuccessorBindingReceiptsPartsV1));
            }
            PendingTransfers.Clear();
        }

        public void Dispose() { budgetBinding?.Dispose(); ControlledBinding?.Dispose(); Manager.Dispose(); }
    }

    [Fact]
    public void HardTerrainStopsBeforeVictimAndReportsActualReach()
    {
        using var scene = new Scene(1023u << 8);
        EntityOrder order = scene.Bomb();
        scene.Manager.Tick();
        scene.Manager.Tick();
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(0, scene.World.Get<BomberBombState>(order.AssignedId).ReachRight.Value);
    }

    [Fact]
    public void SoftDestructionCommitsBeforeLootStatisticsAndPierce()
    {
        using var scene = new Scene(1025u << 8);
        EntityOrder order = scene.Bomb(pierce: true);
        scene.Manager.Tick();
        scene.Manager.Tick();
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        var bomb = scene.World.Get<BomberBombState>(order.AssignedId);
        Assert.Equal(0, scene.World.Get<BomberStatistics>(bomb.Owner.Value).DestroyedBlocks.Value);
        Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        scene.Manager.Tick();
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(1, scene.World.Get<BomberStatistics>(bomb.Owner.Value).DestroyedBlocks.Value);
        scene.Manager.Tick();
        Assert.Equal(1, scene.World.Get<BomberStatistics>(bomb.Owner.Value).DestroyedBlocks.Value);
    }

    [Fact]
    public void GoldRequiresTwoIndependentFamiliesAndOriginalDigBeforePiercing()
    {
        using var scene = new Scene(0);
        var chestId = scene.Chest("Gold");
        var first = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(1, scene.World.Get<BomberChestState>(chestId).RemainingHits.Value);
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var child = scene.Bomb(true);
        child.Get<BomberBombState>().HitFamily.Value = first.AssignedId;
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(1, scene.World.Get<BomberChestState>(chestId).RemainingHits.Value);
        var second = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(scene.World.IsLive(chestId));
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        scene.Manager.Tick();
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var bomb = scene.World.Get<BomberBombState>(second.AssignedId);
        Assert.Equal(1, scene.World.Get<BomberStatistics>(bomb.Owner.Value).DestroyedBlocks.Value);
        int rewards = scene.World.Each<BomberPickupItem>().Count() + scene.World.Single<BomberWorldRuntime>().TerrainRewards.Count;
        Assert.InRange(rewards, 3, 4);
        scene.Manager.Tick();
        Assert.Equal(rewards, scene.World.Each<BomberPickupItem>().Count() + scene.World.Single<BomberWorldRuntime>().TerrainRewards.Count);
    }

    [Theory]
    [InlineData("Gold", true, false)]
    [InlineData("Gold", true, true)]
    [InlineData("Wood", false, false)]
    [InlineData("Wood", false, true)]
    [InlineData("Iron", false, false)]
    [InlineData("Iron", false, true)]
    public void BoundTerminalRefusalPreservesCommittedHitsAndAllowsNewFamily(string tier, bool firstHit, bool revisionConflict)
    {
        using var scene = new Scene(0, budget: new WorldIngressBudget(2, 65536, 2, 65536));
        var chestId = scene.Chest(tier);
        var chest = scene.World.Get<BomberChestState>(chestId);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        if (firstHit)
        {
            var first = scene.Bomb(true);
            scene.Manager.Tick(); scene.Manager.Tick();
            Assert.Equal(first.AssignedId, chest.HitBombs[0]);
            Assert.Equal(1, chest.RemainingHits.Value);
        }
        var terminal = scene.Bomb(true);
        scene.Manager.Tick();
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(7, 1, 7));
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageWrite(new[] { new VoxelWriteEntry(0,
            256 + 7 * 16 + 7, 1025u << 8, before.SectionRevision) },
            $"independent-{tier}-{revisionConflict}").Status);
        if (!revisionConflict)
            Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageWrite(new[] { new VoxelWriteEntry(0,
                256 + 7 * 16 + 8, 1025u << 8, before.SectionRevision) },
                $"capacity-{tier}").Status);
        scene.Manager.Tick();
        if (revisionConflict)
        {
            Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
            string transaction = runtime.PendingVoxelTransactionIds[0];
            Assert.Equal(VoxelTxnState.Aborted, scene.Adapter.CaptureResultCheckpoint().Results.Single(r =>
                r.TransactionId == transaction).Outcome.State);
        }
        scene.Manager.Tick();
        Assert.True(scene.World.IsLive(chestId));
        Assert.Equal(1028u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal(chestId.ToHex(), scene.Adapter.BindingGet(0, 256 + 5 * 16 + 6));
        Assert.Equal(firstHit ? 1 : 0, chest.HitBombs.Count);
        Assert.Equal(1, chest.RemainingHits.Value);
        Assert.False(chest.HasPendingTransaction.Value);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(0, runtime.TerrainReservedPickups.Value);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Equal(0, runtime.TerrainRewards.Count);
        Assert.Equal(0, scene.World.Get<BomberStatistics>(scene.World.Get<BomberBombState>(terminal.AssignedId).Owner.Value).DestroyedBlocks.Value);
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(0, scene.World.Get<BomberBombState>(terminal.AssignedId).ContactedChests.Count);

        var next = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(scene.World.IsLive(chestId));
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        scene.Manager.Tick();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(1, scene.World.Get<BomberStatistics>(scene.World.Get<BomberBombState>(next.AssignedId).Owner.Value).DestroyedBlocks.Value);
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        scene.Manager.Tick();
        Assert.Equal(1, scene.World.Get<BomberStatistics>(scene.World.Get<BomberBombState>(next.AssignedId).Owner.Value).DestroyedBlocks.Value);
    }

    [Fact]
    public void BoundGoldTerminalDebtSurvivesDuplicateUnknownAndHydrationUntilOriginal()
    {
        using var scene = new Scene(0, receiptLimit: 1);
        var chestId = scene.Chest("Gold");
        var first = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(first.AssignedId, scene.World.Get<BomberChestState>(chestId).HitBombs[0]);
        var terminal = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var bomb = scene.World.Get<BomberBombState>(terminal.AssignedId);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string transaction = runtime.PendingVoxelTransactionIds[0];
        string detail = runtime.TerrainPendingDetails[0];
        var original = scene.Adapter.CaptureResultCheckpoint();
        Assert.Equal(VoxelCommitDisposition.Original, Assert.Single(original.Results).Outcome.Disposition);
        Assert.False(scene.World.IsLive(chestId));
        Assert.Equal(0, bomb.ContactedChests.Count);
        Assert.Equal(0, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
        byte[] snapshot = scene.Manager.CaptureSnapshot();
        using (var restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()))
        {
            restored.RequireBoundSpatialIndex();
            Assert.Equal(snapshot, restored.CaptureSnapshot());
        }

        var held = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var heldBinding = VoxelGameplayBinding.Bind(scene.Manager, held);
        scene.Manager.BindVoxelTick(held.PrepareVoxel, held.CommitVoxel);
        var writes = new[] { new VoxelWriteEntry(runtime.PendingSections[0], runtime.PendingCellOffsets[0],
            runtime.PendingNewBlocks[0], runtime.PendingExpectedRevisions[0]) };
        Assert.Equal(VoxelStageStatus.Staged, held.TryStageDigThrough(writes[0].SectionKey, writes[0].CellOffset,
            writes[0].ExpectedSectionRevision, transaction, VoxelSubmissionIntent.Replay).Status);
        scene.Manager.Tick();
        Assert.Equal(VoxelCommitDisposition.Duplicate, Assert.Single(held.CaptureResultCheckpoint().Results).Outcome.Disposition);
        scene.Manager.Tick();
        Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(detail, runtime.TerrainPendingDetails[0]);
        Assert.Equal(0, bomb.ContactedChests.Count);
        var read = scene.Native.ReadCell(new VoxelWorldCoordinate(7, 1, 7));
        Assert.Equal(VoxelStageStatus.Staged, held.TryStageWrite(new[] { new VoxelWriteEntry(0,
            256 + 7 * 16 + 7, 1025u << 8, read.SectionRevision) }, "evict-bound-gold-history").Status);
        scene.Manager.Tick();
        Assert.Equal(VoxelTxnState.Unknown, held.QueryTransaction(transaction).State);
        Assert.Equal(VoxelStageStatus.OutcomeUnknown, held.TryStageDigThrough(writes[0].SectionKey, writes[0].CellOffset,
            writes[0].ExpectedSectionRevision, transaction, VoxelSubmissionIntent.Replay).Status);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(detail, runtime.TerrainPendingDetails[0]);
        Assert.Equal(0, bomb.ContactedChests.Count);
        Assert.True(runtime.TerrainReservedPickups.Value > 0);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Equal(0, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));

        Assert.Empty(BomberChestJournalTests.Rows(scene.World, "crate_opened"));
        Assert.Empty(BomberChestJournalTests.Rows(scene.World, "final_chest_opened"));
        var delivered = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        delivered.RestoreResultCheckpoint(original);
        using var deliveryBinding = VoxelGameplayBinding.Bind(scene.Manager, delivered);
        scene.Manager.BindVoxelTick(delivered.PrepareVoxel, delivered.CommitVoxel);
        scene.Manager.Tick();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(1, bomb.ContactedChests.Count);
        Assert.Equal(chestId, bomb.ContactedChests[0]);
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        int rewards = scene.World.Each<BomberPickupItem>().Count() + runtime.TerrainRewards.Count;
        Assert.InRange(rewards, 3, 4);
        scene.Manager.Tick();
        Assert.Equal(rewards, scene.World.Each<BomberPickupItem>().Count() + runtime.TerrainRewards.Count);
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(s => s.DestroyedBlocks.Value));
        Assert.Single(BomberChestJournalTests.Rows(scene.World, "crate_opened"));
        Assert.Empty(BomberChestJournalTests.Rows(scene.World, "final_chest_opened"));
    }

    [Fact]
    public void WaterCoversItsCellThenStops()
    {
        using var scene = new Scene(0);
        scene.Write(6, 0, 5, 1027u << 8);
        var bomb = scene.Bomb();
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(1, scene.World.Get<BomberBombState>(bomb.AssignedId).ReachRight.Value);
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void TwoSimultaneousSourcesDestroyOneCellAndIssueOneStatistic()
    {
        using var scene = new Scene(1025u << 8);
        var first = scene.Bomb(true); var second = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        var source = scene.World.Get<BomberBombState>(first.AssignedId);
        Assert.Equal(1, scene.World.Get<BomberStatistics>(source.Owner.Value).DestroyedBlocks.Value);
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(0, scene.World.Get<BomberBombState>(second.AssignedId).ReachRight.Value);
    }

    [Fact]
    public void RevisionRefusalNeverOpensPierceOrAwardsAStatistic()
    {
        using var scene = new Scene(1025u << 8);
        var order = scene.Bomb(true);
        scene.Manager.Tick();
        var revision = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).SectionRevision;
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageWrite(new[] { new VoxelWriteEntry(0, 256 + 7 * 16 + 7,
            1025u << 8, revision) }, "earlier-independent-producer").Status);
        scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string transaction = runtime.PendingVoxelTransactionIds[0];
        Assert.Equal(VoxelTxnState.Aborted, scene.Adapter.CaptureResultCheckpoint().Results.Single(r => r.TransactionId == transaction).Outcome.State);
        Assert.Equal(VoxelTxnState.Unknown, scene.Adapter.QueryTransaction(transaction).State);
        Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        scene.Manager.Tick();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(0, runtime.TerrainReservedPickups.Value);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(0, scene.World.Get<BomberStatistics>(scene.World.Get<BomberBombState>(order.AssignedId).Owner.Value).DestroyedBlocks.Value);
    }

    [Fact]
    public void AcceptedUndrainedCheckpointRetainsExactOriginalDeliveryAndNativeRestore()
    {
        using var scene = new Scene(1025u << 8);
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var transaction = runtime.PendingVoxelTransactionIds[0];
        byte[] ecs = scene.Manager.CaptureSnapshot();
        byte[] native = scene.Native.Capture();
        var checkpoint = scene.Adapter.CaptureResultCheckpoint();
        Assert.Single(checkpoint.Results);
        Assert.Equal(transaction, checkpoint.Results[0].TransactionId);
        Assert.Equal(VoxelCommitDisposition.Original, checkpoint.Results[0].Outcome.Disposition);
        Assert.True(checkpoint.Results[0].Outcome.TokenConsumed);
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(ecs, scene.Manager.CaptureSnapshot());
        using var sdk = LumioEngineSdk.LoadNative(Lumio.Bomber.Tests.EngineRelease.NativeLibrary);
        using var restored = sdk.CreateVoxelWorld("Authority", 8, 64,
            File.ReadAllBytes(Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Server/Assets/Maps/official-catalog.json")));
        restored.Restore(native);
        Assert.Equal(0u, restored.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        var adapter = new HostVoxelWorldAdapter(restored.NativeHandle, new VoxelFacadeNativeAbi(restored)) { World = scene.World };
        adapter.RestoreResultCheckpoint(checkpoint);
        using var binding = VoxelGameplayBinding.Bind(scene.Manager, adapter);
        scene.Manager.BindVoxelTick(adapter.PrepareVoxel, adapter.CommitVoxel);
        scene.Manager.Tick();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Empty(adapter.CaptureResultCheckpoint().Results);
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        scene.Manager.Tick();
        Assert.Empty(adapter.CaptureResultCheckpoint().Results);
    }

    [Fact]
    public void HistoricalAppliedWithoutOriginalDeliveryRetainsObligationAndPreventsRollover()
    {
        using var scene = new Scene(1025u << 8);
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var transaction = runtime.PendingVoxelTransactionIds[0];
        var adapter = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        Assert.Equal(VoxelTxnState.Applied, adapter.QueryTransaction(transaction).State);
        Assert.Equal(VoxelCommitDisposition.None, adapter.QueryTransaction(transaction).Disposition);
        Assert.Equal(VoxelTxnState.Unknown, adapter.QueryTransaction("unknown-original-id").State);
        using var binding = VoxelGameplayBinding.Bind(scene.Manager, adapter);
        scene.Manager.BindVoxelTick(adapter.PrepareVoxel, adapter.CommitVoxel);
        var match = scene.World.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.Results; match.PhaseEndTick.Value = scene.World.Tick;
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(1UL, match.MatchId.Value);
        Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(1, runtime.TerrainReservedPickups.Value);
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Empty(scene.World.Each<BomberPickupItem>());
    }

    [Fact]
    public void InitialResourceGenerationCommitsInBoundedBatchesWithoutMintingLoot()
    {
        using var scene = new Scene(0, 5, 5, m2: true);
        var layout = M2InitialLayout.Plan(19);
        BomberInitialResources.Configure(scene.World, layout);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        scene.Manager.Tick();
        Assert.Equal(2, runtime.InitialResourcePhase.Value);
        Assert.Equal(0UL, runtime.TerrainInitialMatchId.Value);
        Assert.Equal(16, scene.World.Each<BomberChestState>().Count());
        scene.Manager.Tick();
        Assert.Equal(0, runtime.InitialResourceCursor.Value);
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(0UL, runtime.TerrainInitialMatchId.Value);
        scene.Manager.Tick();
        Assert.Equal(128, runtime.InitialResourceCursor.Value);
        Assert.Equal(0UL, runtime.TerrainInitialMatchId.Value);
        scene.Manager.Tick();
        Assert.Equal(1UL, runtime.TerrainInitialMatchId.Value);
        Assert.Equal(3, runtime.InitialResourcePhase.Value);
        Assert.Equal(layout.Cells.Count, runtime.InitialResourceCursor.Value);
        Assert.Equal(4, runtime.InitialBarrelReservations.Count);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Equal(0, runtime.TerrainRewards.Count);
        foreach (var cell in layout.Cells)
        {
            uint expected = cell.Kind == M2CellKind.Barrel ? 1032u << 8 : cell.Kind == M2CellKind.Soft ? 1025u << 8 : 1028u << 8;
            Assert.Equal(expected, scene.Native.ReadCell(new VoxelWorldCoordinate(cell.X, 1, cell.Z)).BlockId);
        }
    }

    [Theory]
    [InlineData(128, false)]
    [InlineData(1024, true)]
    public void ActualSdkByteCreditsBoundStagingBeforeMutation(long bytes, bool accepted)
    {
        using var scene = new Scene(1025u << 8, budget: new WorldIngressBudget(1, bytes, 1, bytes));
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(accepted ? 1 : 0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(accepted ? 1 : 0, runtime.TerrainReservedPickups.Value);
        Assert.Equal(accepted ? 0u : 1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        scene.Manager.Tick();
        Assert.Equal(accepted ? 4L : 6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void ExhaustedPickupCapacityRefusesBeforeAnyTerrainMutation()
    {
        using var scene = new Scene(1025u << 8);
        int limit = BomberConfigBinding.For(scene.World).ObjectBudgets.PickupCapacity;
        for (int i = 0; i < limit; i++) scene.World.Commands.Create<BomberPickupItemEntity>();
        scene.Manager.Tick();
        var order = scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(limit, scene.World.Each<BomberPickupItem>().Count());
        Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().TerrainReservedPickups.Value);
        Assert.Equal(0, scene.World.Get<BomberStatistics>(scene.World.Get<BomberBombState>(order.AssignedId).Owner.Value).DestroyedBlocks.Value);
    }

    [Fact]
    public void LastPickupReservationAllowsTheNeighboringAcceptedCase()
    {
        using var scene = new Scene(1025u << 8);
        int limit = BomberConfigBinding.For(scene.World).ObjectBudgets.PickupCapacity;
        for (int i = 0; i < limit - 1; i++) scene.World.Commands.Create<BomberPickupItemEntity>();
        scene.Manager.Tick();
        var order = scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().TerrainReservedPickups.Value);
        scene.Manager.Tick();
        Assert.Equal(1, scene.World.Get<BomberStatistics>(scene.World.Get<BomberBombState>(order.AssignedId).Owner.Value).DestroyedBlocks.Value);
        Assert.InRange(scene.World.Each<BomberPickupItem>().Count() + scene.World.Single<BomberWorldRuntime>().TerrainRewards.Count, limit - 1, limit);
    }

    [Fact]
    public void ActualNativeRetainedReceiptLimitRefusesWithoutTerrainOrRewardMutation()
    {
        using var scene = new Scene(1025u << 8, receiptLimit: 1);
        var bomb = scene.Bomb(true); scene.Manager.Tick();
        var read = scene.Native.ReadCell(new VoxelWorldCoordinate(7, 1, 7));
        using var held = scene.Native.PrepareWriteV2(999001,
            new[] { new VoxelBlockWriteEntry(new VoxelSectionKey(0, 0, 0), 256 + 7 * 16 + 7, 1025u << 8, read.SectionRevision) },
            Array.Empty<VoxelBindingMutationEntry>());
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        Assert.Equal(0, scene.World.Get<BomberStatistics>(scene.World.Get<BomberBombState>(bomb.AssignedId).Owner.Value).DestroyedBlocks.Value);
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void LateOriginalReceiptDoesNotEraseAReplacementCellGeneration()
    {
        using var scene = new Scene(1025u << 8);
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        scene.Write(6, 1, 5, 1023u << 8);
        scene.Manager.Tick();
        Assert.Equal(1023u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        // The receipt belongs to the removed generation. New hard terrain must still stop the ray.
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Theory]
    [InlineData("Wood", 1, 1)]
    [InlineData("Iron", 1, 2)]
    public void ConfiguredOneHitChestTiersRetainTheirExactRewardCountBounds(string tier, int minimum, int maximum)
    {
        using var scene = new Scene(0);
        var chest = scene.Chest(tier);
        var bomb = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(scene.World.IsLive(chest));
        Assert.Empty(scene.World.Each<BomberPickupItem>());
        scene.Manager.Tick();
        Assert.InRange(scene.World.Each<BomberPickupItem>().Count() + scene.World.Single<BomberWorldRuntime>().TerrainRewards.Count, minimum, maximum);
        Assert.Equal(1, scene.World.Get<BomberStatistics>(scene.World.Get<BomberBombState>(bomb.AssignedId).Owner.Value).DestroyedBlocks.Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void DelayedOriginalAfterSourceDeathKeepsOriginalAttribution(bool requireNewLife)
    {
        using var scene = new Scene(1025u << 8, controlled: requireNewLife);
        var source = scene.World.Get<BomberPlayerState>(scene.Lives[1]);
        NetEntityId sourceId = source.Entity;
        var owner = scene.World.Get<BomberParticipantState>(source.Participant.Value);
        ulong generation = source.LifeGeneration.Value;
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(sourceId), new Vector3(5.5f, 1.5f, 5.5f));
        scene.World.Get<AttributeComponent>(sourceId).SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        var bomb = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var checkpoint = scene.Adapter.CaptureResultCheckpoint();
        var delayed = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var delayBinding = VoxelGameplayBinding.Bind(scene.Manager, delayed);
        scene.Manager.BindVoxelTick(delayed.PrepareVoxel, delayed.CommitVoxel);
        ulong wait = Ticks.FromMilliseconds(BomberConfigBinding.For(scene.World).Life.RespawnMs, BomberConfigBinding.For(scene.World).Game.TickRateHz) + 16;
        for (ulong i = 0; i < wait && (owner.CurrentLife.Value == sourceId || owner.CurrentLife.Value.IsDefault); i++) scene.TickControlled();
        Assert.False(scene.World.IsLive(sourceId));
        if (requireNewLife)
        {
            Assert.False(owner.CurrentLife.Value.IsDefault);
            Assert.NotEqual(sourceId, owner.CurrentLife.Value);
            Assert.True(owner.LifeGeneration.Value > generation);
            Assert.True(scene.World.IsLive(owner.CurrentLife.Value));
            Assert.Equal(owner.Entity, scene.World.Get<BomberPlayerState>(owner.CurrentLife.Value).Participant.Value);
            Assert.Equal(owner.LifeGeneration.Value, scene.World.Get<BomberPlayerState>(owner.CurrentLife.Value).LifeGeneration.Value);
            Assert.Equal(6, scene.World.Get<AttributeComponent>(owner.CurrentLife.Value).GetCurrentValue(BomberAttributeNames.HealthPoints));
            Assert.True(scene.ControlledBinding!.TryResolveConnectionState("successor-1", out NetEntityId controlledLife, out _));
            Assert.Equal(owner.CurrentLife.Value, controlledLife);
        }
        Assert.Equal(0, scene.World.Get<BomberStatistics>(owner.Entity).DestroyedBlocks.Value);
        var accepted = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        accepted.RestoreResultCheckpoint(checkpoint);
        using var acceptedBinding = VoxelGameplayBinding.Bind(scene.Manager, accepted);
        scene.Manager.BindVoxelTick(accepted.PrepareVoxel, accepted.CommitVoxel);
        scene.Manager.Tick();
        var facts = scene.World.Get<BomberDamageFacts>(bomb.AssignedId);
        int row = Enumerable.Range(0, facts.Target.Count).Single(i => facts.Target[i] == scene.Lives[0]);
        Assert.Equal(sourceId, facts.SourceLife[row]);
        Assert.Equal(generation, facts.SourceGeneration[row]);
        Assert.Equal(owner.Entity, facts.SourceParticipant[row]);
        Assert.Equal(1, scene.World.Get<BomberStatistics>(owner.Entity).DestroyedBlocks.Value);
        // Re-delivering an exact retained Original after settlement cannot issue again.
        var duplicate = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        duplicate.RestoreResultCheckpoint(checkpoint);
        using var duplicateBinding = VoxelGameplayBinding.Bind(scene.Manager, duplicate);
        scene.Manager.BindVoxelTick(duplicate.PrepareVoxel, duplicate.CommitVoxel);
        scene.Manager.Tick();
        Assert.Equal(1, scene.World.Get<BomberStatistics>(owner.Entity).DestroyedBlocks.Value);
        Assert.Equal(4L, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void CoupledActiveSnapshotKeepsPendingBytesButRefusesTickResume()
    {
        using var scene = new Scene(1025u << 8);
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        byte[] source = scene.Manager.CaptureSnapshot();
        using var restored = BomberTestWorld.Restore(source, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();
        Assert.Equal(source, restored.CaptureSnapshot());
        var error = Assert.ThrowsAny<Exception>(() => restored.Tick());
        Assert.Contains("bomber_active_resume_unsupported", error.ToString(), StringComparison.Ordinal);
        Assert.Equal(source, scene.Manager.CaptureSnapshot());
    }

    [Theory]
    [InlineData("missing-detail")]
    [InlineData("foreign-family")]
    [InlineData("future-submission")]
    [InlineData("wrong-tier")]
    public void MalformedTerrainHydrationRejectsWithoutClearingSource(string corruption)
    {
        using var scene = new Scene(1025u << 8);
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var row = BomberTerrainTransactions.Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[0]);
        switch (corruption)
        {
            case "missing-detail": runtime.TerrainPendingDetails.Clear(); break;
            case "foreign-family":
                runtime.TerrainPendingDetails[0] = BomberTerrainTransactions.Encode(row with
                { Family = new NetEntityId(scene.World.InstanceId + 1, runtime.PendingSourceBombs[0].Counter).ToHex() }); break;
            case "future-submission": runtime.PendingVoxelSubmittedTicks[0] = scene.World.Tick + 1; break;
            case "wrong-tier": runtime.TerrainPendingDetails[0] = BomberTerrainTransactions.Encode(row with { Tier = 1 }); break;
        }
        byte[] malformed = scene.Manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(malformed, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load()));
        Assert.Equal(malformed, scene.Manager.CaptureSnapshot());
    }
}
