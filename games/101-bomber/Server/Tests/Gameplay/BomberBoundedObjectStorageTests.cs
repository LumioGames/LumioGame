using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberBoundedObjectStorageTests
{
    [Fact]
    public void EightParticipantHitsAreBoundedAndFullLocalIdentitiesAreRequired()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder bombOrder = manager.World.Commands.Create<BomberBombEntity>();
        EntityOrder[] participants = Enumerable.Range(0, 9).Select(_ => manager.World.Commands.Create<BomberParticipantEntity>()).ToArray();
        EntityOrder[] lives = Enumerable.Range(0, 9).Select(i => BomberTestWorld.QueuePlayer(manager.World, "bounded-" + i)).ToArray();
        manager.Tick();
        BomberBombState bomb = manager.World.Get<BomberBombState>(bombOrder.AssignedId);
        BomberTargetIdentity[] targets = participants.Select((p, i) => new BomberTargetIdentity(p.AssignedId, lives[i].AssignedId, (ulong)i + 1)).ToArray();
        foreach (var target in targets.Take(8)) Assert.Equal(BomberStorageAdmission.Added, bomb.TryReserveHit(target));
        byte[] full = manager.CaptureSnapshot();
        Assert.Equal(BomberStorageAdmission.CapacityExceeded, bomb.TryReserveHit(targets[8]));
        Assert.Equal(BomberStorageAdmission.Duplicate, bomb.TryReserveHit(targets[0] with { Life = lives[8].AssignedId, LifeGeneration = 10 }));
        Assert.Throws<InvalidOperationException>(() => bomb.TryReserveHit(targets[0] with { Participant = new NetEntityId(bomb.Entity.InstanceId + 1, targets[0].Participant.Counter) }));
        Assert.Throws<InvalidOperationException>(() => bomb.TryReserveHit(targets[0] with { Participant = new NetEntityId(bomb.Entity.InstanceId, 0) }));
        Assert.Throws<InvalidOperationException>(() => bomb.TryReserveHit(targets[0] with { Life = default }));
        Assert.Throws<InvalidOperationException>(() => bomb.TryReserveHit(targets[0] with { LifeGeneration = 0 }));
        Assert.Equal(full, manager.CaptureSnapshot());
        Assert.Equal(8, bomb.HitParticipants.Count);
        bomb.ValidateStorage();
    }

    [Fact]
    public void SourceSurvivesDestructionAndOnlyExactPendingLifeCanCommitOrRelease()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder participant = manager.World.Commands.Create<BomberParticipantEntity>();
        EntityOrder life = BomberTestWorld.QueuePlayer(manager.World, "source-life");
        EntityOrder nextLife = BomberTestWorld.QueuePlayer(manager.World, "next-life");
        EntityOrder order = manager.World.Commands.Create<BomberBombEntity>();
        manager.Tick();
        BomberBombState bomb = manager.World.Get<BomberBombState>(order.AssignedId);
        var source = new BomberSourceIdentity(participant.AssignedId, life.AssignedId, 1);
        bomb.SetSource(source);
        bomb.SetSource(source);
        byte[] before = manager.CaptureSnapshot();
        Assert.Throws<InvalidOperationException>(() => bomb.SetSource(source with { LifeGeneration = 2 }));
        Assert.Throws<InvalidOperationException>(() => bomb.SetSource(source with { Life = default }));
        Assert.Equal(before, manager.CaptureSnapshot());
        var oldTarget = new BomberTargetIdentity(participant.AssignedId, life.AssignedId, 1);
        var nextTarget = oldTarget with { Life = nextLife.AssignedId, LifeGeneration = 2 };
        Assert.Equal(BomberStorageAdmission.Added, bomb.TryReserveHit(oldTarget));
        manager.World.Commands.Destroy(life.AssignedId);
        manager.Tick();
        Assert.Equal(source, bomb.ReadSource());
        Assert.False(bomb.CommitContact(nextTarget));
        Assert.False(bomb.ReleaseRejectedHit(nextTarget));
        Assert.False(bomb.CommitContact(oldTarget with { LifeGeneration = 2 }));
        Assert.False(bomb.ReleaseRejectedHit(oldTarget with { Life = nextLife.AssignedId }));
        Assert.True(bomb.TryReadHit(participant.AssignedId, out var stored, out var state));
        Assert.Equal(oldTarget, stored);
        Assert.Equal(BomberHitStorageState.Pending, state);
        Assert.True(bomb.ReleaseRejectedHit(oldTarget));
        Assert.False(bomb.ReleaseRejectedHit(oldTarget));
        Assert.Equal(BomberStorageAdmission.Added, bomb.TryReserveHit(nextTarget));
        // Successful contact needs no damage amount (for example, a zero-damage status contact).
        Assert.True(bomb.CommitContact(nextTarget));
        Assert.False(bomb.CommitContact(nextTarget));
        Assert.False(bomb.ReleaseRejectedHit(nextTarget));
        Assert.Equal(BomberStorageAdmission.Duplicate, bomb.TryReserveHit(oldTarget));
        Assert.True(bomb.TryReadHit(participant.AssignedId, out stored, out state));
        Assert.Equal(nextTarget, stored);
        Assert.Equal(BomberHitStorageState.ContactApplied, state);
    }

    [Fact]
    public void ChestContactsDuringPendingStayObservedAndCountNeverExceedsThreshold()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder[] bombs = Enumerable.Range(0, 5).Select(_ => manager.World.Commands.Create<BomberBombEntity>()).ToArray();
        EntityOrder[] chests = Enumerable.Range(0, 6).Select(_ => manager.World.Commands.Create<BomberChestEntity>()).ToArray();
        manager.Tick();
        BomberChestState chest = manager.World.Get<BomberChestState>(chests[0].AssignedId);
        chest.InitializeHitBudget();
        chest.InitializeHitBudget();
        for (int i = 0; i < 3; i++)
        {
            Assert.Equal(BomberStorageAdmission.Added, manager.World.Get<BomberBombState>(bombs[i].AssignedId).TryObserveChest(chest.Entity));
            Assert.Equal(BomberStorageAdmission.Added, chest.TryCountBomb(bombs[i].AssignedId));
        }
        Assert.Equal(0, chest.RemainingHits.Value);
        Assert.Throws<InvalidOperationException>(() => chest.InitializeHitBudget());
        Assert.Equal(BomberStorageAdmission.Duplicate, chest.TryCountBomb(bombs[2].AssignedId));
        var pending = new BomberChestPendingReference("opening", 1, manager.World.Tick);
        Assert.True(chest.TrySetPending(pending));
        BomberBombState lingering = manager.World.Get<BomberBombState>(bombs[3].AssignedId);
        Assert.Equal(BomberStorageAdmission.Added, lingering.TryObserveChest(chest.Entity));
        Assert.Equal(BomberStorageAdmission.CapacityExceeded, chest.TryCountBomb(lingering.Entity));
        Assert.True(chest.TryClearPending(pending));
        Assert.Equal(BomberStorageAdmission.Duplicate, lingering.TryObserveChest(chest.Entity));
        BomberBombState fresh = manager.World.Get<BomberBombState>(bombs[4].AssignedId);
        Assert.Equal(BomberStorageAdmission.Added, fresh.TryObserveChest(chest.Entity));
        Assert.Equal(BomberStorageAdmission.CapacityExceeded, chest.TryCountBomb(fresh.Entity));
        Assert.Equal(3, chest.HitBombs.Count);
        foreach (var extra in chests.Skip(1).Take(4)) Assert.Equal(BomberStorageAdmission.Added, fresh.TryObserveChest(extra.AssignedId));
        byte[] full = manager.CaptureSnapshot();
        Assert.Equal(BomberStorageAdmission.CapacityExceeded, fresh.TryObserveChest(chests[5].AssignedId));
        Assert.Equal(BomberStorageAdmission.Duplicate, fresh.TryObserveChest(chest.Entity));
        Assert.Equal(full, manager.CaptureSnapshot());
        Assert.Equal(5, fresh.ContactedChests.Count);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void PendingReferencePreservesOpaqueStringAndClearsOnlyExactReference(bool longValue)
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder[] orders = Enumerable.Range(0, 2).Select(_ => manager.World.Commands.Create<BomberChestEntity>()).ToArray();
        EntityOrder[] bombs = Enumerable.Range(0, 3).Select(_ => manager.World.Commands.Create<BomberBombEntity>()).ToArray();
        manager.Tick();
        string transaction = longValue ? new string('界', 4096) + "A" : "tx:\u975e\u6570\u5b57/000A-\u03b2";
        var pending = new BomberChestPendingReference(transaction, 19, manager.World.Tick - 1);
        foreach (var order in orders)
        {
            BomberChestState chest = manager.World.Get<BomberChestState>(order.AssignedId);
            chest.InitializeHitBudget();
            Assert.Throws<InvalidOperationException>(() => chest.TrySetPending(pending));
            foreach (var bomb in bombs) chest.TryCountBomb(bomb.AssignedId);
            Assert.Throws<InvalidOperationException>(() => chest.TrySetPending(pending with { TransactionId = "" }));
            Assert.Throws<InvalidOperationException>(() => chest.TrySetPending(pending with { MatchId = 0 }));
            Assert.True(chest.TrySetPending(pending));
            Assert.True(chest.TrySetPending(pending));
            Assert.Equal(transaction, chest.PendingTransactionId.Value);
            byte[] before = manager.CaptureSnapshot();
            foreach (var stale in new[] { pending with { TransactionId = transaction.Replace("A", "a") }, pending with { MatchId = 20 }, pending with { SubmittedTick = manager.World.Tick } })
            {
                Assert.False(chest.PendingMatches(stale));
                Assert.False(chest.TryClearPending(stale));
                Assert.False(chest.TrySetPending(stale));
            }
            Assert.Equal(before, manager.CaptureSnapshot());
        }
        foreach (var order in orders)
        {
            BomberChestState chest = manager.World.Get<BomberChestState>(order.AssignedId);
            Assert.True(chest.PendingMatches(pending));
            Assert.True(chest.TryClearPending(pending));
            Assert.False(chest.TryClearPending(pending));
            Assert.False(chest.HasPendingTransaction.Value);
            Assert.Equal("", chest.PendingTransactionId.Value);
            Assert.Equal(0UL, chest.PendingMatchId.Value);
            Assert.Equal(0UL, chest.PendingSubmittedTick.Value);
            Assert.Equal(3, chest.HitBombs.Count);
            Assert.Equal(0, chest.RemainingHits.Value);
            Assert.Equal(0, chest.Phase.Value);
        }
    }

    [Fact]
    public void MalformedParallelMemoryIsRejectedWithoutClearingIt()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder order = manager.World.Commands.Create<BomberBombEntity>();
        EntityOrder chestOrder = manager.World.Commands.Create<BomberChestEntity>();
        manager.Tick();
        BomberBombState bomb = manager.World.Get<BomberBombState>(order.AssignedId);
        bomb.HitParticipants.Add(chestOrder.AssignedId);
        byte[] malformed = manager.CaptureSnapshot();
        Assert.Throws<InvalidOperationException>(() => bomb.ValidateStorage());
        Assert.Throws<InvalidOperationException>(() => bomb.TryObserveChest(chestOrder.AssignedId));
        Assert.Equal(malformed, manager.CaptureSnapshot());
        BomberChestState chest = manager.World.Get<BomberChestState>(chestOrder.AssignedId);
        chest.InitializeHitBudget();
        chest.RemainingHits.Value--;
        Assert.Throws<InvalidOperationException>(() => chest.ValidateStorage());
        Assert.Equal(2, chest.RemainingHits.Value);
    }

    [Fact]
    public void ReleasingMiddleHitPreservesAllOtherAlignedTuples()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder order = manager.World.Commands.Create<BomberBombEntity>();
        EntityOrder[] participants = Enumerable.Range(0, 3).Select(_ => manager.World.Commands.Create<BomberParticipantEntity>()).ToArray();
        EntityOrder[] lives = Enumerable.Range(0, 3).Select(i => BomberTestWorld.QueuePlayer(manager.World, "aligned-" + i)).ToArray();
        manager.Tick();
        BomberBombState bomb = manager.World.Get<BomberBombState>(order.AssignedId);
        var targets = participants.Select((p, i) => new BomberTargetIdentity(p.AssignedId, lives[i].AssignedId, (ulong)i + 10)).ToArray();
        foreach (var target in targets) bomb.TryReserveHit(target);
        bomb.CommitContact(targets[2]);
        Assert.True(bomb.ReleaseRejectedHit(targets[1]));
        Assert.False(bomb.TryReadHit(targets[1].Participant, out _, out _));
        Assert.True(bomb.TryReadHit(targets[0].Participant, out var first, out var firstState));
        Assert.Equal(targets[0], first);
        Assert.Equal(BomberHitStorageState.Pending, firstState);
        Assert.True(bomb.TryReadHit(targets[2].Participant, out var last, out var lastState));
        Assert.Equal(targets[2], last);
        Assert.Equal(BomberHitStorageState.ContactApplied, lastState);
        Assert.Equal(2, bomb.HitParticipants.Count);
        bomb.ValidateStorage();
    }

    [Theory]
    [InlineData("hit-duplicate")]
    [InlineData("hit-state")]
    [InlineData("hit-generation")]
    [InlineData("hit-foreign")]
    [InlineData("contact-duplicate")]
    [InlineData("contact-overflow")]
    [InlineData("source-partial")]
    [InlineData("source-zero-counter")]
    [InlineData("chest-duplicate")]
    [InlineData("chest-overflow")]
    [InlineData("chest-foreign")]
    [InlineData("pending-partial")]
    public void CorruptAuthoritativeMemoryFailsValidation(string corruption)
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder order = manager.World.Commands.Create<BomberBombEntity>();
        EntityOrder chestOrder = manager.World.Commands.Create<BomberChestEntity>();
        manager.Tick();
        BomberBombState bomb = manager.World.Get<BomberBombState>(order.AssignedId);
        BomberChestState chest = manager.World.Get<BomberChestState>(chestOrder.AssignedId);
        chest.InitializeHitBudget();
        var target = new BomberTargetIdentity(chest.Entity, bomb.Entity, 1);
        bomb.TryReserveHit(target);
        bomb.TryObserveChest(chest.Entity);
        chest.TryCountBomb(bomb.Entity);
        Action validate = bomb.ValidateStorage;
        if (corruption is "contact-overflow" or "chest-overflow")
        {
            var list = corruption == "contact-overflow" ? bomb.ContactedChests : chest.HitBombs;
            int capacity = corruption == "contact-overflow" ? 5 : 3;
            while (list.Count < capacity) list.Add(new NetEntityId(bomb.Entity.InstanceId, checked((ulong)(1000 + list.Count))));
            if (corruption == "chest-overflow") chest.RemainingHits.Value = 0;
            byte[] valid = manager.CaptureSnapshot();
            var excess = new NetEntityId(bomb.Entity.InstanceId, 9999);
            Assert.Equal("exceeds_max_capacity", Assert.Throws<InvalidOperationException>(() => list.Add(excess)).Message);
            Assert.Equal(valid, manager.CaptureSnapshot());
            byte[] corrupt = BomberSnapshotCorruption.AppendListEntries(valid,
                corruption == "contact-overflow" ? "BomberBombState.contactedChests" : "BomberChestState.hitBombs", capacity, excess.ToHex());
            Assert.Equal("exceeds_max_capacity", BomberTestWorld.AssertOwnerFailure<FormatException>(() =>
            {
                using WorldManager restored = BomberTestWorld.Restore(corrupt, GeneratedRegistry.Instance,
                    config: BomberConfigBinding.Load());
            }).Message);
            Assert.Equal(valid, manager.CaptureSnapshot());
            return;
        }
        switch (corruption)
        {
            case "hit-duplicate":
                bomb.HitParticipants.Add(target.Participant); bomb.HitLives.Add(target.Life);
                bomb.HitLifeGenerations.Add(2); bomb.HitStates.Add(1);
                break;
            case "hit-state": bomb.HitStates[0] = 99; break;
            case "hit-generation": bomb.HitLifeGenerations[0] = 0; break;
            case "hit-foreign": bomb.HitLives[0] = new NetEntityId(bomb.Entity.InstanceId + 1, bomb.Entity.Counter); break;
            case "contact-duplicate": bomb.ContactedChests.Add(chest.Entity); break;
            case "contact-overflow":
                for (ulong i = 0; i < 5; i++) bomb.ContactedChests.Add(new NetEntityId(bomb.Entity.InstanceId, 1000 + i));
                break;
            case "source-partial": bomb.Owner.Value = chest.Entity; break;
            case "source-zero-counter": bomb.Owner.Value = new NetEntityId(bomb.Entity.InstanceId, 0); break;
            case "chest-duplicate":
                chest.HitBombs.Add(bomb.Entity); chest.RemainingHits.Value = 1; validate = chest.ValidateStorage;
                break;
            case "chest-overflow":
                for (ulong i = 0; i < 3; i++) chest.HitBombs.Add(new NetEntityId(bomb.Entity.InstanceId, 1000 + i));
                chest.RemainingHits.Value = -1; validate = chest.ValidateStorage;
                break;
            case "chest-foreign":
                chest.HitBombs[0] = new NetEntityId(bomb.Entity.InstanceId + 1, bomb.Entity.Counter); validate = chest.ValidateStorage;
                break;
            case "pending-partial": chest.PendingTransactionId.Value = "orphan"; validate = chest.ValidateStorage; break;
        }
        byte[] before = manager.CaptureSnapshot();
        Assert.Throws<InvalidOperationException>(validate);
        Assert.Equal(before, manager.CaptureSnapshot());
    }

    [Fact]
    public void PendingVoxelSourceLifeAndGenerationMustBePairedBeforeAnyWrite()
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberWorldRuntime world = manager.World.Single<BomberWorldRuntime>();
        manager.World.Single<BomberMatchState>().MatchId.Value = 7;
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        ulong submittedTick = manager.World.Tick;
        var cell = new BomberPendingVoxelCell(new VoxelWriteEntry(1, 2, 3, 1), 0,
            BomberVoxelIntentKind.Initialize, default, default, 0, default, default, 0);
        byte[] before = manager.CaptureSnapshot();
        foreach (var invalid in new[] { cell with { SourceLifeGeneration = 1 }, cell with { SourceLife = world.Entity } })
            Assert.Throws<InvalidOperationException>(() => world.RecordPending("invalid", submittedTick, 7, new[] { invalid }, config));
        Assert.Equal(before, manager.CaptureSnapshot());
        world.RecordPending("absent", submittedTick, 7, new[] { cell }, config);
        Assert.Equal(0UL, world.PendingSourceLifeGenerations[0]);
        world.ClearPending("absent", config, 7);
        Assert.Equal(0, world.PendingSourceLifeGenerations.Count);
        world.RecordPending("present", submittedTick, 7, new[] { cell with { SourceLife = world.Entity, SourceLifeGeneration = 99 } }, config);
        world.ValidatePending(config, 7);
        world.PendingSourceLifeGenerations[0] = 0;
        Assert.Throws<InvalidOperationException>(() => world.ValidatePending(config, 7));
    }
}
