using System;
using System.Globalization;
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
using Lumio.GameRuntime.Persistence;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberTraversalLifecycleNativeTests
{
    private static readonly string[] RemainingHitCounts = { "2", "1", "0" };
    [Theory]
    [InlineData("power", "storage")]
    [InlineData("power", "runtime")]
    [InlineData("power", "paired")]
    [InlineData("origin", "storage")]
    [InlineData("origin", "runtime")]
    [InlineData("origin", "paired")]
    public void ActualFrozenNativeExplosionRefusesASingleChangedCurrentGeometryColumn(string field, string boundary)
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, persistence: true);
        var order = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var bomb = scene.World.Get<BomberBombState>(order.AssignedId);
        AssertFrozen(bomb, 5, 5, 4);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string transaction = Assert.Single(Enumerable.Range(0, runtime.PendingVoxelTransactionIds.Count)
            .Select(i => runtime.PendingVoxelTransactionIds[i]));
        var original = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results,
            row => row.TransactionId == transaction);
        Assert.Equal(VoxelTxnState.Applied, original.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Original, original.Outcome.Disposition);
        Assert.True(original.Outcome.TokenConsumed);
        Assert.False(original.Outcome.Receipt.OriginalReceiptBytes.IsEmpty);
        BomberSourceIdentity source = bomb.ReadSource();
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var good = persistence!.Capture();
        Assert.True(good.Succeeded, good.ErrorCode);
        using (var positive = RestorePaired(scene, good.Checkpoint!.Value))
        {
            Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, positive.CompletedRestore);
            var copy = positive.World.Get<BomberBombState>(bomb.Entity);
            AssertFrozen(copy, 5, 5, 4);
            Assert.Equal(source, copy.ReadSource());
            Assert.Equal(5, copy.TraversalArms[1]);
            BomberTerrainTransactions.ValidateTraversalOwners(positive.World);
        }
        SaveCut(good.Checkpoint!.Value, "frozen-positive-" + field + "-" + boundary);
        int destroyed = scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value;
        int contacts = bomb.ContactedChests.Count;
        int rewards = runtime.TerrainRewards.Count;
        string detail = runtime.TerrainPendingDetails[0];
        var arms = Enumerable.Range(0, 4).Select(i => bomb.TraversalArms[i]).ToArray();
        var beforePosition = scene.World.Get<LogicTransform>(bomb.Entity).LocalPosition;
        if (field == "power") bomb.Power.Value++;
        else BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(bomb.Entity),
            beforePosition + Vector3.UnitX);
        byte[] bad = scene.Manager.CaptureSnapshot();
        var error = boundary switch
        {
            "storage" => Assert.Throws<InvalidOperationException>(bomb.ValidateStorage),
            "runtime" => BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => {
                using var rejected = BomberTestWorld.Restore(bad, GeneratedRegistry.Instance, config: BomberConfigBinding.Load());
            }),
            "paired" => RefusePaired(),
            _ => throw new InvalidOperationException("Unknown frozen-column boundary."),
        };
        Assert.Contains("frozen explosion", error.Message, StringComparison.Ordinal);
        Assert.Equal(bad, scene.Manager.CaptureSnapshot());
        Assert.Equal(destroyed, scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value);
        Assert.Equal(contacts, bomb.ContactedChests.Count);
        Assert.Equal(rewards, runtime.TerrainRewards.Count);
        Assert.Equal(detail, runtime.TerrainPendingDetails[0]);
        Assert.Equal(arms, Enumerable.Range(0, 4).Select(i => bomb.TraversalArms[i]).ToArray());
        Assert.Equal(original.Outcome.Receipt.OriginalReceiptBytes.ToArray(),
            Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results,
                row => row.TransactionId == transaction).Outcome.Receipt.OriginalReceiptBytes.ToArray());
        InvalidOperationException RefusePaired()
        {
            var corrupted = persistence.Capture();
            Assert.True(corrupted.Succeeded, corrupted.ErrorCode);
            SaveCut(corrupted.Checkpoint!.Value, "frozen-negative-" + field);
            return BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => {
                using var rejected = RestorePaired(scene, corrupted.Checkpoint.Value);
            });
        }
    }

    [Fact]
    public void OfficialPairedRecoveryTransfersAnActualNativeOriginalExactlyOnceAndSealsOrdinaryZeroRemaining()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, persistence: true);
        var order = scene.Bomb(false);
        scene.Manager.Tick(); scene.Manager.Tick();
        var bomb = scene.World.Get<BomberBombState>(order.AssignedId);
        AssertFrozen(bomb, 5, 5, 4);
        Assert.Equal(5, bomb.TraversalArms[1]);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var detail = BomberTerrainTransactions.Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[0]);
        Assert.Equal(0, detail.Remaining);
        Assert.Equal(1, bomb.TraversalDistance(detail.X, detail.Z, detail.Direction));
        BomberSourceIdentity source = bomb.ReadSource();
        int destroyed = scene.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value;
        byte[] sourceSnapshot = scene.Manager.CaptureSnapshot();
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var pending = persistence!.Capture();
        Assert.True(pending.Succeeded, pending.ErrorCode);
        SaveCut(pending.Checkpoint!.Value, "pending-ordinary-zero");
        using var restored = RestorePaired(scene, pending.Checkpoint.Value);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        var copy = restored.World.Get<BomberBombState>(bomb.Entity);
        AssertFrozen(copy, 5, 5, 4);
        Assert.Equal(source, copy.ReadSource());
        Assert.Equal(5, copy.TraversalArms[1]);
        BomberTerrainTransactions.ValidateTraversalOwners(restored.World);
        restored.Tick();
        Assert.Equal(6, copy.TraversalArms[1]);
        Assert.Equal(0, copy.TerrainContinuations.Count);
        Assert.Equal(0, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        Assert.Equal(destroyed + 1, restored.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value);
        Assert.Equal(source, copy.ReadSource());
        Assert.Equal(sourceSnapshot, scene.Manager.CaptureSnapshot());
        Assert.True(restored.World.TryGetService<WorldPersistenceSubsystem>(out var acceptedPersistence));
        var accepted = acceptedPersistence!.Capture();
        Assert.True(accepted.Succeeded, accepted.ErrorCode);
        SaveCut(accepted.Checkpoint!.Value, "accepted-ordinary-zero");
        using var after = RestorePaired(scene, accepted.Checkpoint.Value);
        var afterSource = after.World.Get<BomberBombState>(bomb.Entity);
        Assert.Equal(6, afterSource.TraversalArms[1]);
        BomberTerrainTransactions.ValidateTraversalOwners(after.World);
        after.Tick();
        Assert.Equal(destroyed + 1, after.World.Get<BomberStatistics>(source.Participant).DestroyedBlocks.Value);
        Assert.Equal(6, afterSource.TraversalArms[1]);
    }

    [Fact]
    public void PublicFuseKickFreezesItsActualMovedExplosionOriginAndDangerRefusesAnotherKick()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        World world = scene.World;
        BomberBombState bomb = BomberSplitBombProductionTests.Mother(scene, power: 2);
        bomb.FuseEndTick.Value = checked(world.Tick + 4);
        scene.Manager.Tick();
        BomberSourceIdentity source = bomb.ReadSource();
        var placed = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
        NetEntityId kicker = scene.Lives[1];
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(kicker), new Vector3(6.5f, 1.5f, 7.5f));
        world.Get<BomberPlayerState>(kicker).Facing.Value = (int)BomberDirection.Right;
        var skills = world.Get<BomberSkillState>(kicker);
        skills.CharacterId.Value = 118005;
        skills.ActiveSkillId.Value = 13;
        skills.ActiveSkillLevel.Value = 1;
        skills.ActiveSkillBound.Value = true;
        var ability = new UseActiveSkillAbility();
        var owner = world.Get<AbilityComponent>(kicker);
        Assert.True(ability.CanActivate(default, owner, out string? reason), reason);
        ability.Execute(default, owner);
        Assert.Equal(-1, bomb.TraversalPower.Value);
        Assert.Equal(0, bomb.TraversalArms.Count);
        ulong due = bomb.FuseEndTick.Value;
        while (world.Tick <= due) scene.Manager.Tick();
        var exploded = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
        Assert.NotEqual(placed, exploded);
        AssertFrozen(bomb, BomberMatchRules.CellX(exploded), BomberMatchRules.CellZ(exploded), 2);
        Assert.Equal(source, bomb.ReadSource());
        Assert.Equal((int)BomberBombPhase.Danger, bomb.Phase.Value);
        Assert.Equal(0, bomb.KickDirection.Value);
        var arms = Enumerable.Range(0, 4).Select(i => bomb.TraversalArms[i]).ToArray();
        Assert.False(BomberBombKick.TryTarget(world, kicker, 2, out _, out bool available));
        Assert.True(available);
        Assert.Throws<InvalidOperationException>(() => BomberBombKick.Start(world, bomb, BomberDirection.Right, kicker));
        Assert.Equal(exploded, world.Get<LogicTransform>(bomb.Entity).LocalPosition);
        Assert.Equal(arms, Enumerable.Range(0, 4).Select(i => bomb.TraversalArms[i]).ToArray());
        Assert.Equal(source, bomb.ReadSource());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    public void ActualPendingNativeOriginalCannotLoseItsOwnedArmAtTheQuiescentCut(int replacementState)
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, persistence: true);
        var order = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var bomb = scene.World.Get<BomberBombState>(order.AssignedId);
        AssertFrozen(bomb, 5, 5, 4);
        Assert.Equal(5, bomb.TraversalArms[1]);
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var good = persistence!.Capture();
        Assert.True(good.Succeeded, good.ErrorCode);
        using (var positive = RestorePaired(scene, good.Checkpoint!.Value))
            BomberTerrainTransactions.ValidateTraversalOwners(positive.World);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string detail = runtime.TerrainPendingDetails[0];
        string transaction = runtime.PendingVoxelTransactionIds[0];
        var original = Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results,
            row => row.TransactionId == transaction);
        Assert.Equal(VoxelCommitDisposition.Original, original.Outcome.Disposition);
        Assert.True(original.Outcome.TokenConsumed);
        int destroyed = scene.World.Get<BomberStatistics>(bomb.Owner.Value).DestroyedBlocks.Value;
        int rewards = runtime.TerrainRewards.Count;
        bomb.TraversalArms[1] = replacementState;
        byte[] source = scene.Manager.CaptureSnapshot();
        var error = Assert.Throws<InvalidOperationException>(() => BomberTerrainTransactions.ValidateTraversalOwners(scene.World));
        Assert.Contains("pending Native owner differs", error.Message, StringComparison.Ordinal);
        Assert.Equal(source, scene.Manager.CaptureSnapshot());
        Assert.Equal(detail, runtime.TerrainPendingDetails[0]);
        Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(destroyed, scene.World.Get<BomberStatistics>(bomb.Owner.Value).DestroyedBlocks.Value);
        Assert.Equal(rewards, runtime.TerrainRewards.Count);
        Assert.Empty(bomb.ContactedChests.Values);
        Assert.Equal(original.Outcome.Receipt.OriginalReceiptBytes.ToArray(),
            Assert.Single(scene.Adapter.CaptureResultCheckpoint().Results,
                row => row.TransactionId == transaction).Outcome.Receipt.OriginalReceiptBytes.ToArray());
    }

    [Fact]
    public void ActualFinishedOrdinaryArmCannotAcquireASyntheticUnstartedContinuation()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, persistence: true);
        var order = scene.Bomb(false);
        scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        var bomb = scene.World.Get<BomberBombState>(order.AssignedId);
        AssertFrozen(bomb, 5, 5, 4);
        Assert.Equal(6, bomb.TraversalArms[1]);
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var good = persistence!.Capture();
        Assert.True(good.Succeeded, good.ErrorCode);
        using (var positive = RestorePaired(scene, good.Checkpoint!.Value))
            BomberTerrainTransactions.ValidateTraversalOwners(positive.World);
        bomb.TerrainContinuations.Add(BomberTerrainTransactions.Encode(new BomberTerrainContinuation(
            5, 5, 1, 4, BomberTerrainTransactions.Family(bomb).ToHex(), bomb.ExplodedAtTick.Value, Unstarted: true)));
        byte[] source = scene.Manager.CaptureSnapshot();
        var error = Assert.Throws<InvalidOperationException>(bomb.ValidateStorage);
        Assert.Contains("continuation rewinds its durable arm", error.Message, StringComparison.Ordinal);
        Assert.Equal(source, scene.Manager.CaptureSnapshot());
        Assert.Equal(6, bomb.TraversalArms[1]);
    }
    [Theory]
    [InlineData("Gold", true, false)]
    [InlineData("Gold", true, true)]
    [InlineData("Wood", false, false)]
    [InlineData("Wood", false, true)]
    [InlineData("Iron", false, false)]
    [InlineData("Iron", false, true)]
    public void NativeRefusalSealsTheExactTraversalWithoutRewindingItsCommittedHistory(string tier, bool firstHit, bool revisionConflict)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, budget: new WorldIngressBudget(2, 65536, 2, 65536));
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
        var refusedSource = scene.World.Get<BomberBombState>(terminal.AssignedId);
        AssertFrozen(refusedSource, 5, 5, 4);
        Assert.Equal(6, refusedSource.TraversalArms[1]);
        BomberTerrainTransactions.ValidateTraversalOwners(scene.World);
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
    public void NativeGoldUnknownAndDuplicateKeepExactPendingUntilItsOriginalTransfersOnce()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, receiptLimit: 1);
        var chestId = scene.Chest("Gold");
        var first = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(first.AssignedId, scene.World.Get<BomberChestState>(chestId).HitBombs[0]);
        var terminal = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var bomb = scene.World.Get<BomberBombState>(terminal.AssignedId);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        string transaction = runtime.PendingVoxelTransactionIds[0];
        AssertFrozen(bomb, 5, 5, 4);
        Assert.Equal(5, bomb.TraversalArms[1]);
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
        Assert.Equal(5, bomb.TraversalArms[1]);
        BomberTerrainTransactions.ValidateTraversalOwners(scene.World);
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
        Assert.Equal(5, bomb.TraversalArms[1]);
        BomberTerrainTransactions.ValidateTraversalOwners(scene.World);
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
        Assert.Equal(6, bomb.TraversalArms[1]);
        BomberTerrainTransactions.ValidateTraversalOwners(scene.World);
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

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void NativeHistoricalLifeDeathCannotReleaseItsExactPendingTraversalOrRetargetOriginal(bool requireNewLife)
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8, controlled: requireNewLife);
        var source = scene.World.Get<BomberPlayerState>(scene.Lives[1]);
        NetEntityId sourceId = source.Entity;
        var owner = scene.World.Get<BomberParticipantState>(source.Participant.Value);
        ulong generation = source.LifeGeneration.Value;
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(sourceId), new Vector3(5.5f, 1.5f, 5.5f));
        scene.World.Get<AttributeComponent>(sourceId).SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        var bomb = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var checkpoint = scene.Adapter.CaptureResultCheckpoint();
        var sourceBomb = scene.World.Get<BomberBombState>(bomb.AssignedId);
        AssertFrozen(sourceBomb, 5, 5, 4);
        Assert.Equal(5, sourceBomb.TraversalArms[1]);
        var delayed = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var delayBinding = VoxelGameplayBinding.Bind(scene.Manager, delayed);
        scene.Manager.BindVoxelTick(delayed.PrepareVoxel, delayed.CommitVoxel);
        ulong wait = Ticks.FromMilliseconds(BomberConfigBinding.For(scene.World).Life.RespawnMs, BomberConfigBinding.For(scene.World).Game.TickRateHz) + 16;
        for (ulong i = 0; i < wait && (owner.CurrentLife.Value == sourceId || owner.CurrentLife.Value.IsDefault); i++) scene.TickControlled();
        Assert.False(scene.World.IsLive(sourceId));
        Assert.Equal(5, sourceBomb.TraversalArms[1]);
        Assert.Equal(sourceId, sourceBomb.SourceLife.Value);
        Assert.Equal(generation, sourceBomb.SourceLifeGeneration.Value);
        sourceBomb.ValidateStorage();
        BomberTerrainTransactions.ValidateTraversalOwners(scene.World);
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
    public void NativeStrongNonterminalContactFinishesAndTerminalPreObservationTransfersTheSameChestOnce()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var chest = StrongChest(scene);
        scene.World.Single<BomberPresentationJournal>().Reset();
        var first = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(2, scene.World.Get<BomberChestState>(chest).RemainingHits.Value);
        var firstSource = scene.World.Get<BomberBombState>(first.AssignedId);
        AssertFrozen(firstSource, 5, 5, 4);
        Assert.Equal(6, firstSource.TraversalArms[1]);
        Assert.Equal(chest, Assert.Single(firstSource.ContactedChests.Values));
        var same = scene.Bomb(true);
        same.Get<BomberBombState>().HitFamily.Value = first.AssignedId;
        scene.Manager.Tick(); scene.Manager.Tick();
        var second = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var last = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(scene.World.IsLive(chest));
        var terminalSource = scene.World.Get<BomberBombState>(last.AssignedId);
        Assert.Equal(5, terminalSource.TraversalArms[1]);
        Assert.Equal(chest, Assert.Single(terminalSource.ContactedChests.Values));
        BomberTerrainTransactions.ValidateTraversalOwners(scene.World);
        Assert.Empty(BomberChestJournalTests.Rows(scene.World, "final_chest_opened"));
        Assert.Equal(0, scene.World.Each<BomberStatistics>().Sum(row => row.DestroyedBlocks.Value));
        var hits = BomberChestJournalTests.Rows(scene.World, "chest_hit");
        Assert.Equal(RemainingHitCounts, hits.Select(row => row.GetProperty("data").GetProperty("remainingHits").GetString()));
        Assert.Equal(new[] { first.AssignedId.ToHex(), second.AssignedId.ToHex(), last.AssignedId.ToHex() },
            hits.Select(row => row.GetProperty("data").GetProperty("bombId").GetString()));
        foreach (var row in hits)
        {
            Assert.Equal(chest.ToHex(), row.GetProperty("entityId").GetString());
            Assert.Equal("0", row.GetProperty("data").GetProperty("resourceTier").GetString());
        }
        ulong settlementTick = scene.World.Tick;
        scene.Manager.Tick();
        Assert.Equal(6, terminalSource.TraversalArms[1]);
        Assert.Equal(chest, Assert.Single(terminalSource.ContactedChests.Values));
        var opened = Assert.Single(BomberChestJournalTests.Rows(scene.World, "final_chest_opened"));
        var source = scene.World.Get<BomberBombState>(last.AssignedId);
        Assert.Equal(chest.ToHex(), opened.GetProperty("entityId").GetString());
        Assert.Equal(source.Owner.Value.ToHex(), opened.GetProperty("sourceParticipantId").GetString());
        Assert.Equal(source.SourceLife.Value.ToHex(), opened.GetProperty("sourceLifeId").GetString());
        Assert.Equal("101", opened.GetProperty("data").GetProperty("chainId").GetString());
        Assert.Equal(last.AssignedId.ToHex(), opened.GetProperty("data").GetProperty("bombId").GetString());
        Assert.Equal(settlementTick.ToString(CultureInfo.InvariantCulture), opened.GetProperty("tick").GetString());
        Assert.Equal(6, opened.GetProperty("x").GetInt32());
        Assert.Equal(5, opened.GetProperty("z").GetInt32());
        for (int i = 0; i < 3; i++) scene.Manager.Tick();
        Assert.Equal(3, BomberChestJournalTests.Rows(scene.World, "chest_hit").Length);
        Assert.Single(BomberChestJournalTests.Rows(scene.World, "final_chest_opened"));
        Assert.Empty(BomberChestJournalTests.Rows(scene.World, "crate_opened"));
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(row => row.DestroyedBlocks.Value));
    }

    [Fact]
    public void NativeStrongRefusalPreservesItsPreObservedChestAndSealsTheExactArm()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var chest = StrongChest(scene);
        scene.World.Single<BomberPresentationJournal>().Reset();
        for (int i = 0; i < 2; i++) { scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick(); }
        var refused = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native),
            new WorldIngressBudget(1, 1, 1, 1))
        { World = scene.World };
        var third = scene.Bomb(true);
        using (VoxelGameplayBinding.Bind(scene.Manager, refused))
        {
            scene.Manager.BindVoxelTick(refused.PrepareVoxel, refused.CommitVoxel);
            scene.Manager.Tick(); scene.Manager.Tick();
            Assert.Equal(0, scene.World.Get<BomberChestState>(chest).RemainingHits.Value);
            var refusedSource = scene.World.Get<BomberBombState>(third.AssignedId);
            AssertFrozen(refusedSource, 5, 5, 4);
            Assert.Equal(6, refusedSource.TraversalArms[1]);
            Assert.Equal(chest, Assert.Single(refusedSource.ContactedChests.Values));
            BomberTerrainTransactions.ValidateTraversalOwners(scene.World);
            Assert.Empty(BomberChestJournalTests.Rows(scene.World, "final_chest_opened"));
            Assert.Equal(3, BomberChestJournalTests.Rows(scene.World, "chest_hit").Length);
            Assert.Equal(0, scene.World.Each<BomberStatistics>().Sum(row => row.DestroyedBlocks.Value));
        }
        using var rebound = VoxelGameplayBinding.Bind(scene.Manager, scene.Adapter);
        scene.Manager.BindVoxelTick(scene.Adapter.PrepareVoxel, scene.Adapter.CommitVoxel);
        scene.Manager.Tick(); scene.Manager.Tick();
        var child = scene.Bomb(true);
        child.Get<BomberBombState>().HitFamily.Value = third.AssignedId;
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.True(scene.World.IsLive(chest));
        Assert.Empty(BomberChestJournalTests.Rows(scene.World, "final_chest_opened"));
        scene.Bomb(true); scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.False(scene.World.IsLive(chest));
        Assert.Equal(3, BomberChestJournalTests.Rows(scene.World, "chest_hit").Length);
        Assert.Single(BomberChestJournalTests.Rows(scene.World, "final_chest_opened"));
        Assert.Equal(1, scene.World.Each<BomberStatistics>().Sum(row => row.DestroyedBlocks.Value));
    }


    private static void AssertFrozen(BomberBombState bomb, int x, int z, int power)
    {
        Assert.Equal(x, bomb.TraversalOriginX.Value);
        Assert.Equal(z, bomb.TraversalOriginZ.Value);
        Assert.Equal(power, bomb.TraversalPower.Value);
        Assert.Equal(power, bomb.Power.Value);
        Assert.Equal(4, bomb.TraversalArms.Count);
        Assert.NotEqual(0UL, bomb.ExplodedAtTick.Value);
        bomb.ValidateStorage();
    }

    private static WorldManager RestorePaired(BomberTerrainProductionTests.Scene scene, DualCutCheckpointPayload cut) =>
        BomberWorldNativeFixture.Engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance) {
            InstanceId = 1, Config = BomberConfigBinding.Load(),
            Catalog = System.IO.File.ReadAllBytes(System.IO.Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot,
                "Server", "Assets", "Maps", "official-catalog.json")),
            Snapshot = cut.Runtime, VoxelSnapshot = cut.Voxel,
            Subsystems = new IWorldSubsystem[] { new WorldPersistenceSubsystem() },
        });

    private static void SaveCut(DualCutCheckpointPayload cut, string label)
    {
        string directory = System.IO.Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, ".run",
            "terrain-reset-cut-artifacts", label + "-" + Guid.NewGuid().ToString("N"));
        System.IO.Directory.CreateDirectory(directory);
        System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory, "runtime.packet"), cut.Runtime);
        System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory, "native.snapshot"), cut.Voxel);
        Console.WriteLine("ACTUAL_TERRAIN_RESET_CUT " + System.Text.Json.JsonSerializer.Serialize(new {
            label, directory, cut.Tick, cut.RuntimeSha256, cut.VoxelSha256,
        }));
    }    private static NetEntityId StrongChest(BomberTerrainProductionTests.Scene scene)
    {
        var order = scene.World.Commands.Create<BomberChestEntity>();
        scene.Manager.Tick();
        scene.World.Get<BomberChestState>(order.AssignedId).InitializeHitBudget();
        scene.Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1028, scene.World.Registry.WireName(typeof(BomberChestEntity))) });
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5));
        var entry = new VoxelWriteEntry(0, 256 + 5 * 16 + 6, 1028u << 8, before.SectionRevision);
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageMutation(new[] { entry },
            new[] { new VoxelBindingOp(0, entry.CellOffset, order.AssignedId.ToHex()) { ExpectedSectionRevision = entry.ExpectedSectionRevision } },
            "chest-journal-fixture").Status);
        scene.Manager.Tick();
        return order.AssignedId;
    }
}
