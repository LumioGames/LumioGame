using System;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

// Component fixture evidence only: these worlds are never resumed as active matches.
[Collection("BomberWorld")]
public sealed class BomberBoundedObjectSnapshotTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void FullBoundedMemorySurvivesRealHydration(bool longTransaction)
    {
        using var fixture = new Fixture(longTransaction);
        byte[] snapshot = fixture.Manager.CaptureSnapshot();
        using WorldManager restored = Restore(snapshot);
        BomberBombState bomb = restored.World.Get<BomberBombState>(fixture.Bomb.Entity);
        BomberChestState chest = restored.World.Get<BomberChestState>(fixture.Chest.Entity);
        bomb.ValidateStorage();
        chest.ValidateStorage();
        Assert.Equal(fixture.Bomb.ReadSource(), bomb.ReadSource());
        Assert.Equal(Values(fixture.Bomb.HitParticipants), Values(bomb.HitParticipants));
        Assert.Equal(Values(fixture.Bomb.HitLives), Values(bomb.HitLives));
        Assert.Equal(Values(fixture.Bomb.HitLifeGenerations), Values(bomb.HitLifeGenerations));
        Assert.Equal(Values(fixture.Bomb.HitStates), Values(bomb.HitStates));
        Assert.Equal(Values(fixture.Bomb.ContactedChests), Values(bomb.ContactedChests));
        Assert.Equal(fixture.Chest.RequiredHits.Value, chest.RequiredHits.Value);
        Assert.Equal(fixture.Chest.RemainingHits.Value, chest.RemainingHits.Value);
        Assert.Equal(Values(fixture.Chest.HitBombs), Values(chest.HitBombs));
        Assert.Equal(fixture.Chest.PendingTransactionId.Value, chest.PendingTransactionId.Value);
        Assert.Equal(fixture.Chest.HasPendingTransaction.Value, chest.HasPendingTransaction.Value);
        Assert.Equal(fixture.Chest.PendingMatchId.Value, chest.PendingMatchId.Value);
        Assert.Equal(fixture.Chest.PendingSubmittedTick.Value, chest.PendingSubmittedTick.Value);
        BomberWorldRuntime pending = restored.World.Single<BomberWorldRuntime>();
        pending.ValidatePending(BomberConfigBinding.For(restored.World), 17);
        Assert.Equal(Values(fixture.Pending.PendingSourceLifeGenerations), Values(pending.PendingSourceLifeGenerations));
        Assert.Equal(snapshot, restored.CaptureSnapshot());
        Assert.Throws<InvalidOperationException>(() => chest.InitializeHitBudget());
        Assert.Equal(snapshot, restored.CaptureSnapshot());
    }

    [Theory]
    [InlineData("Owner")]
    [InlineData("SourceLife")]
    [InlineData("SourceLifeGeneration")]
    [InlineData("HitParticipants")]
    [InlineData("HitLives")]
    [InlineData("HitLifeGenerations")]
    [InlineData("HitStates")]
    [InlineData("ContactedChests")]
    [InlineData("HitBombs")]
    [InlineData("PendingTransactionId")]
    [InlineData("PendingMatchId")]
    [InlineData("PendingSubmittedTick")]
    [InlineData("PendingSourceLifeGenerations")]
    public void OneSupportedColumnChangesSnapshotHashAndHydrates(string field)
    {
        byte[] baseline;
        using (var first = new Fixture()) baseline = first.Manager.CaptureSnapshot();
        using var fixture = new Fixture();
        Assert.Equal(baseline, fixture.Manager.CaptureSnapshot());
        switch (field)
        {
            case "Owner": fixture.Bomb.Owner.Value = fixture.Participants[2]; break;
            case "SourceLife": fixture.Bomb.SourceLife.Value = fixture.Lives[1]; break;
            case "SourceLifeGeneration": fixture.Bomb.SourceLifeGeneration.Value++; break;
            case "HitParticipants": fixture.Bomb.HitParticipants[0] = fixture.Participants[2]; break;
            case "HitLives": fixture.Bomb.HitLives[0] = fixture.Lives[1]; break;
            case "HitLifeGenerations": fixture.Bomb.HitLifeGenerations[0]++; break;
            case "HitStates": fixture.Bomb.HitStates[0] = (int)BomberHitStorageState.ContactApplied; break;
            case "ContactedChests": fixture.Bomb.ContactedChests[0] = fixture.OtherChest; break;
            case "HitBombs": fixture.Chest.HitBombs[0] = fixture.OtherBomb; break;
            case "PendingTransactionId": fixture.Chest.PendingTransactionId.Value += "a"; break;
            case "PendingMatchId": fixture.Chest.PendingMatchId.Value++; break;
            case "PendingSubmittedTick": fixture.Chest.PendingSubmittedTick.Value--; break;
            case "PendingSourceLifeGenerations": fixture.Pending.PendingSourceLifeGenerations[0]++; break;
            default: throw new ArgumentOutOfRangeException(nameof(field));
        }
        fixture.Validate();
        byte[] changed = fixture.Manager.CaptureSnapshot();
        Assert.NotEqual(SHA256.HashData(baseline), SHA256.HashData(changed));
        using WorldManager restored = Restore(changed);
        restored.World.Get<BomberBombState>(fixture.Bomb.Entity).ValidateStorage();
        restored.World.Get<BomberChestState>(fixture.Chest.Entity).ValidateStorage();
        restored.World.Single<BomberWorldRuntime>().ValidatePending(BomberConfigBinding.For(restored.World), 17);
        Assert.Equal(changed, restored.CaptureSnapshot());
    }

    // These three values are coupled by invariants. An isolated mutation must still
    // affect serialization, but cannot truthfully be called a supported hydrated state.
    [Theory]
    [InlineData("RequiredHits")]
    [InlineData("RemainingHits")]
    [InlineData("HasPendingTransaction")]
    public void CoupledColumnIsSerializedAndInvalidIsolatedChangeRejectsHydration(string field)
    {
        using var fixture = new Fixture();
        byte[] before = fixture.Manager.CaptureSnapshot();
        switch (field)
        {
            case "RequiredHits": fixture.Chest.RequiredHits.Value++; break;
            case "RemainingHits": fixture.Chest.RemainingHits.Value++; break;
            case "HasPendingTransaction": fixture.Chest.HasPendingTransaction.Value = false; break;
        }
        byte[] malformed = fixture.Manager.CaptureSnapshot();
        Assert.NotEqual(SHA256.HashData(before), SHA256.HashData(malformed));
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => Restore(malformed));
        Assert.Equal(malformed, fixture.Manager.CaptureSnapshot());
    }

    [Theory]
    [InlineData("parallel-length")]
    [InlineData("hit-duplicate")]
    [InlineData("hit-state")]
    [InlineData("hit-generation")]
    [InlineData("hit-foreign-instance")]
    [InlineData("source-foreign-instance")]
    [InlineData("contact-foreign-instance")]
    [InlineData("contact-duplicate")]
    [InlineData("chest-duplicate")]
    [InlineData("chest-foreign-instance")]
    [InlineData("pending-partial")]
    [InlineData("pending-generation-length")]
    public void MalformedMemoryIsRejectedByRealHydrationWithoutClearingSource(string corruption)
    {
        using var fixture = new Fixture();
        BomberBombState bomb = fixture.Bomb;
        BomberChestState chest = fixture.Chest;
        switch (corruption)
        {
            case "parallel-length": bomb.HitLives.RemoveAt(0); break;
            case "hit-duplicate": bomb.HitParticipants[1] = bomb.HitParticipants[0]; break;
            case "hit-state": bomb.HitStates[0] = 99; break;
            case "hit-generation": bomb.HitLifeGenerations[0] = 0; break;
            case "hit-foreign-instance": bomb.HitLives[0] = Foreign(bomb.HitLives[0]); break;
            case "source-foreign-instance": bomb.SourceLife.Value = Foreign(bomb.SourceLife.Value); break;
            case "contact-foreign-instance": bomb.ContactedChests[0] = Foreign(bomb.ContactedChests[0]); break;
            case "contact-duplicate": bomb.ContactedChests.Add(bomb.ContactedChests[0]); break;
            case "chest-duplicate": chest.HitBombs[1] = chest.HitBombs[0]; break;
            case "chest-foreign-instance": chest.HitBombs[0] = Foreign(chest.HitBombs[0]); break;
            case "pending-partial": chest.PendingTransactionId.Value = ""; break;
            case "pending-generation-length": fixture.Pending.PendingSourceLifeGenerations.Add(1); break;
        }
        byte[] malformed = fixture.Manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => Restore(malformed));
        Assert.Equal(malformed, fixture.Manager.CaptureSnapshot());
    }

    [Theory]
    [InlineData("BomberBombState.hitParticipants", 2, 8)]
    [InlineData("BomberBombState.contactedChests", 1, 5)]
    [InlineData("BomberChestState.hitBombs", 3, 3)]
    public void OverCapacitySnapshotRejectsHydrationWithoutChangingSource(string field, int count, int capacity)
    {
        using var fixture = new Fixture();
        byte[] original = fixture.Manager.CaptureSnapshot();
        string[] extra = Enumerable.Range(count, capacity + 1 - count)
            .Select(index => new NetEntityId(fixture.Bomb.Entity.InstanceId, (ulong)(1000 + index)).ToHex()).ToArray();
        byte[] malformed = BomberSnapshotCorruption.AppendListEntries(original, field, count, extra);
        Assert.NotEqual(SHA256.HashData(original), SHA256.HashData(malformed));
        FormatException error = BomberTestWorld.AssertOwnerFailure<FormatException>(() => Restore(malformed));
        Assert.Equal("exceeds_max_capacity", error.Message);
        fixture.Validate();
        Assert.Equal(original, fixture.Manager.CaptureSnapshot());
    }

    private static T[] Values<T>(SyncList<T> values) => Enumerable.Range(0, values.Count).Select(i => values[i]).ToArray();

    private static NetEntityId Foreign(NetEntityId id) => new(id.InstanceId + 1, id.Counter);

    private static WorldManager Restore(byte[] snapshot)
    {
        WorldManager manager = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        manager.RequireBoundSpatialIndex();

        return manager;
    }

    private sealed class Fixture : IDisposable
    {
        internal WorldManager Manager { get; } = BomberTestWorld.Start();
        internal BomberBombState Bomb { get; }
        internal BomberChestState Chest { get; }
        internal BomberWorldRuntime Pending { get; }
        internal NetEntityId[] Participants { get; }
        internal NetEntityId[] Lives { get; }
        internal NetEntityId OtherChest { get; }
        internal NetEntityId OtherBomb { get; }

        internal Fixture(bool longTransaction = false)
        {
            EntityOrder[] participants = Enumerable.Range(0, 8).Select(_ => Manager.World.Commands.Create<BomberParticipantEntity>()).ToArray();
            EntityOrder[] lives = Enumerable.Range(0, 2).Select(i => BomberTestWorld.QueuePlayer(Manager.World, "bounded-snapshot-" + i)).ToArray();
            EntityOrder[] bombs = Enumerable.Range(0, 4).Select(_ => Manager.World.Commands.Create<BomberBombEntity>()).ToArray();
            EntityOrder[] chests = Enumerable.Range(0, 2).Select(_ => Manager.World.Commands.Create<BomberChestEntity>()).ToArray();
            Manager.Tick();
            Participants = participants.Select(x => x.AssignedId).ToArray();
            Lives = lives.Select(x => x.AssignedId).ToArray();
            for (int i = 0; i < participants.Length; i++)
            {
                BomberParticipantState participant = Manager.World.Get<BomberParticipantState>(Participants[i]);
                participant.Slot.Value = i;
                participant.MatchId.Value = 17;
            }
            Manager.World.Single<BomberMatchState>().MatchId.Value = 17;
            Bomb = Manager.World.Get<BomberBombState>(bombs[0].AssignedId);
            Chest = Manager.World.Get<BomberChestState>(chests[0].AssignedId);
            OtherBomb = bombs[3].AssignedId;
            OtherChest = chests[1].AssignedId;
            foreach (EntityOrder chest in chests) Manager.World.Get<BomberChestState>(chest.AssignedId).InitializeHitBudget();
            Bomb.SetSource(new(Participants[0], Lives[0], 7));
            for (int i = 0; i < 2; i++) Bomb.TryReserveHit(new(Participants[i], Lives[i], (ulong)(11 + i)));
            Bomb.CommitContact(new(Participants[1], Lives[1], 12));
            Bomb.TryObserveChest(Chest.Entity);
            foreach (EntityOrder bomb in bombs.Take(3)) Chest.TryCountBomb(bomb.AssignedId);
            string transaction = longTransaction ? new string('\u754c', 4096) + "A" : "tx:\u975e\u6570\u5b57/000A-\u03b2";
            Chest.TrySetPending(new(transaction, 17, Manager.World.Tick));
            Pending = Manager.World.Single<BomberWorldRuntime>();
            IBomberConfig config = BomberConfigBinding.For(Manager.World);
            Pending.SetParticipants(Participants, config);
            Pending.RecordPending("pending-voxel", Manager.World.Tick, 17,
                new[] { new BomberPendingVoxelCell(new VoxelWriteEntry(1, 2, 3, 1), 0,
                    BomberVoxelIntentKind.Initialize, Participants[0], Lives[0], 7, Bomb.Entity, default, 0) }, config);
            Validate();
        }

        internal void Validate()
        {
            Bomb.ValidateStorage();
            Chest.ValidateStorage();
            Pending.ValidatePending(BomberConfigBinding.For(Manager.World), 17);
        }

        public void Dispose() => Manager.Dispose();
    }
}
