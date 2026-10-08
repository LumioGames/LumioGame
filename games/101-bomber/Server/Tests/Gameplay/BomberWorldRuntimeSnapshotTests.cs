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

[Collection("BomberWorld")]
public sealed class BomberWorldRuntimeSnapshotTests
{
    [Fact]
    public void WorldRuntimeSurvivesGeneratedSnapshotWithFullIdentitiesAndEveryPendingColumn()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder player = BomberTestWorld.QueuePlayer(manager.World, "world-runtime-snapshot");
        EntityOrder participant = manager.World.Commands.Create<BomberParticipantEntity>();
        participant.Get<BomberParticipantState>().Slot.Value = 0;
        participant.Get<BomberParticipantState>().MatchId.Value = 42;
        manager.Tick();
        NetEntityId worldId = manager.World.Single<BomberMatchState>().Entity;
        manager.World.Get<BomberMatchState>(worldId).MatchId.Value = 42;
        BomberWorldRuntime state = manager.World.Get<BomberWorldRuntime>(worldId);
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        state.SetParticipants(new[] { participant.AssignedId }, config);
        Assert.Equal(2UL, state.NextHfsmMachineKey.Value);
        Assert.Equal(3UL, state.AllocateHfsmMachineKey());
        Assert.Equal(1UL, state.AllocateEventSequence());
        Assert.Equal(1UL, state.AllocateChainId());
        Assert.Equal(1UL, state.AllocateVoxelTransactionSequence());
        var cell = new BomberPendingVoxelCell(new VoxelWriteEntry(17, 23, 456, 8), 123,
            BomberVoxelIntentKind.DestroySoft, player.AssignedId, player.AssignedId, 9,
            new NetEntityId(worldId.InstanceId, 987), default, 1);
        state.RecordPending("sdk-transaction:string-1", manager.World.Tick, 42, new[] { cell }, config);
        byte[] snapshot = manager.CaptureSnapshot();
        using WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();

        BomberWorldRuntime copy = restored.World.Get<BomberWorldRuntime>(worldId);
        copy.ValidateRoster(BomberConfigBinding.For(restored.World));
        copy.ValidatePending(config, 42);
        Assert.Equal(snapshot, restored.CaptureSnapshot());
        Assert.Equal(participant.AssignedId, copy.ParticipantIds[0]);
        Assert.Equal(3UL, copy.NextHfsmMachineKey.Value);
        Assert.Equal(1UL, copy.NextEventSequence.Value);
        Assert.Equal(1UL, copy.NextChainId.Value);
        Assert.Equal(1UL, copy.NextVoxelTransactionSequence.Value);
        Assert.Equal("sdk-transaction:string-1", copy.PendingVoxelTransactionIds[0]);
        Assert.Equal(manager.World.Tick, copy.PendingVoxelSubmittedTicks[0]);
        Assert.Equal(42UL, copy.PendingVoxelMatchIds[0]);
        Assert.Equal(17UL, copy.PendingSections[0]);
        Assert.Equal(23, copy.PendingCellOffsets[0]);
        Assert.Equal(8UL, copy.PendingExpectedRevisions[0]);
        Assert.Equal(123U, copy.PendingOldBlocks[0]);
        Assert.Equal(456U, copy.PendingNewBlocks[0]);
        Assert.Equal((int)BomberVoxelIntentKind.DestroySoft, copy.PendingKinds[0]);
        Assert.Equal(player.AssignedId, copy.PendingParticipants[0]);
        Assert.Equal(player.AssignedId, copy.PendingSourceLives[0]);
        Assert.Equal(9UL, copy.PendingSourceLifeGenerations[0]);
        Assert.Equal(new NetEntityId(worldId.InstanceId, 987), copy.PendingSourceBombs[0]);
        Assert.Equal(default(NetEntityId), copy.PendingChests[0]);
        Assert.Equal(1UL, copy.PendingChainIds[0]);
    }

    [Fact]
    public void PlacementReservationSurvivesGeneratedSnapshot()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder participant = manager.World.Commands.Create<BomberParticipantEntity>();
        participant.Get<BomberParticipantState>().Slot.Value = 0;
        participant.Get<BomberParticipantState>().MatchId.Value = 7;
        manager.Tick();
        BomberWorldRuntime state = manager.World.Single<BomberWorldRuntime>();
        BomberMatchState match = manager.World.Single<BomberMatchState>();
        match.MatchId.Value = 7;
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        state.ReserveBombPlacement(manager.World.Tick, 7, 3 * config.Map.Width + 4,
            participant.AssignedId, config);
        byte[] snapshot = manager.CaptureSnapshot();
        using WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();

        BomberWorldRuntime copy = restored.World.Single<BomberWorldRuntime>();
        Assert.Equal(snapshot, restored.CaptureSnapshot());
        Assert.Equal(manager.World.Tick, copy.BombPlacementTick.Value);
        Assert.Equal(7UL, copy.BombPlacementMatchId.Value);
        Assert.Equal(1, copy.BombPlacementCells.Count);
        Assert.Equal(3 * config.Map.Width + 4, copy.BombPlacementCells[0]);
        Assert.Equal(participant.AssignedId, copy.BombPlacementParticipants[0]);
    }

    [Fact]
    public void InvalidPlacementReservationRejectsHydrateWithoutChangingValidSnapshot()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder participant = manager.World.Commands.Create<BomberParticipantEntity>();
        participant.Get<BomberParticipantState>().Slot.Value = 0;
        participant.Get<BomberParticipantState>().MatchId.Value = 7;
        manager.Tick();
        BomberWorldRuntime state = manager.World.Single<BomberWorldRuntime>();
        BomberMatchState match = manager.World.Single<BomberMatchState>();
        match.MatchId.Value = 7;
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        state.ReserveBombPlacement(manager.World.Tick, 7, 3 * config.Map.Width + 4,
            participant.AssignedId, config);
        byte[] valid = SHA256.HashData(manager.CaptureSnapshot());
        Assert.False(state.CanReserveBombPlacement(manager.World.Tick, 7, 3 * config.Map.Width + 4,
            participant.AssignedId, config));
        Assert.Equal(valid, SHA256.HashData(manager.CaptureSnapshot()));
        state.BombPlacementCells.Add(state.BombPlacementCells[0]);
        state.BombPlacementParticipants.Add(participant.AssignedId);
        AssertRestoreRejects(manager);
        state.BombPlacementCells.RemoveAt(1);
        state.BombPlacementParticipants.RemoveAt(1);
        state.BombPlacementTick.Value = manager.World.Tick + 1;
        AssertRestoreRejects(manager);
    }

    [Fact]
    public void PlacementReservationsResetAtNextTickOrMatch()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder participant = manager.World.Commands.Create<BomberParticipantEntity>();
        participant.Get<BomberParticipantState>().Slot.Value = 0;
        participant.Get<BomberParticipantState>().MatchId.Value = 7;
        manager.Tick();
        BomberWorldRuntime state = manager.World.Single<BomberWorldRuntime>();
        BomberMatchState match = manager.World.Single<BomberMatchState>();
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        int cell = 3 * config.Map.Width + 4;
        match.MatchId.Value = 7;
        state.ReserveBombPlacement(manager.World.Tick, 7, cell, participant.AssignedId, config);
        Assert.False(state.CanReserveBombPlacement(manager.World.Tick, 7, cell, participant.AssignedId, config));
        manager.Tick();
        state.ReserveBombPlacement(manager.World.Tick, 7, cell, participant.AssignedId, config);
        Assert.Equal(1, state.BombPlacementCells.Count);
        match.MatchId.Value = 8;
        state.ReserveBombPlacement(manager.World.Tick, 8, cell, participant.AssignedId, config);
        Assert.Equal(1, state.BombPlacementCells.Count);
        Assert.Equal(8UL, state.BombPlacementMatchId.Value);
    }

    [Fact]
    public void CountersRejectOverflowAndInvalidPendingLeavesSnapshotUnchanged()
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberWorldRuntime state = manager.World.Single<BomberWorldRuntime>();
        manager.World.Single<BomberMatchState>().MatchId.Value = 1;
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        state.NextEventSequence.Value = ulong.MaxValue;
        byte[] before = SHA256.HashData(manager.CaptureSnapshot());
        Assert.Throws<OverflowException>(() => state.AllocateEventSequence());
        Assert.Equal(before, SHA256.HashData(manager.CaptureSnapshot()));

        int limit = state.PendingCellLimit(config);
        BomberPendingVoxelCell[] tooMany = Enumerable.Range(0, limit + 1)
            .Select(i => new BomberPendingVoxelCell(new VoxelWriteEntry(1, i, 2, 1), 1,
                BomberVoxelIntentKind.Initialize, default, default, 0, default, default, 0)).ToArray();
        Assert.Throws<InvalidOperationException>(() => state.RecordPending("overbudget", 1, 1, tooMany, config));
        Assert.Equal(before, SHA256.HashData(manager.CaptureSnapshot()));

        var valid = new BomberPendingVoxelCell(new VoxelWriteEntry(1, 1, 2, 1), 1,
            BomberVoxelIntentKind.Initialize, default, default, 0, default, default, 0);
        Assert.Throws<InvalidOperationException>(() => state.RecordPending("duplicate", 1, 1, new[] { valid, valid }, config));
        Assert.Equal(before, SHA256.HashData(manager.CaptureSnapshot()));
        state.RecordPending("unknown-kept", manager.World.Tick, 1, new[] { valid }, config);
        byte[] pending = SHA256.HashData(manager.CaptureSnapshot());
        Assert.Throws<InvalidOperationException>(() => state.RecordPending("second", 2, 1, new[] { valid }, config));
        Assert.Equal(pending, SHA256.HashData(manager.CaptureSnapshot()));
        state.PendingNewBlocks.Add(3);
        Assert.Throws<InvalidOperationException>(() => state.ValidatePending(config, 1));
    }

    [Fact]
    public void RosterIsSlotOrderedFixedAndHydratedShapeIsValidated()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder first = manager.World.Commands.Create<BomberParticipantEntity>();
        EntityOrder second = manager.World.Commands.Create<BomberParticipantEntity>();
        first.Get<BomberParticipantState>().Slot.Value = 0;
        second.Get<BomberParticipantState>().Slot.Value = 1;
        manager.Tick();
        BomberWorldRuntime state = manager.World.Single<BomberWorldRuntime>();
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        NetEntityId[] ordered = { first.AssignedId, second.AssignedId };
        Assert.Throws<InvalidOperationException>(() => state.SetParticipants(ordered.Reverse().ToArray(), config));
        state.SetParticipants(ordered, config);
        byte[] fixedSnapshot = manager.CaptureSnapshot();
        state.SetParticipants(ordered, config);
        Assert.Equal(fixedSnapshot, manager.CaptureSnapshot());
        Assert.Throws<InvalidOperationException>(() => state.SetParticipants(new[] { first.AssignedId }, config));
        Assert.Throws<InvalidOperationException>(() => state.SetParticipants(new[] { first.AssignedId, first.AssignedId }, config));
        Assert.Throws<InvalidOperationException>(() => state.SetParticipants(new[] { first.AssignedId, default }, config));
        Assert.Throws<InvalidOperationException>(() => state.SetParticipants(new[] { first.AssignedId, new NetEntityId(first.AssignedId.InstanceId + 1, second.AssignedId.Counter) }, config));
        Assert.Equal(fixedSnapshot, manager.CaptureSnapshot());

        state.ParticipantIds.Add(default);
        Assert.Throws<InvalidOperationException>(() => state.ValidateRoster(config));
        AssertRestoreRejects(manager);
        state.ParticipantIds.RemoveAt(state.ParticipantIds.Count - 1);
        state.ParticipantIds.Add(first.AssignedId);
        AssertRestoreRejects(manager);
        state.ParticipantIds.RemoveAt(state.ParticipantIds.Count - 1);
        state.ParticipantIds.Add(new NetEntityId(first.AssignedId.InstanceId + 1, 20));
        AssertRestoreRejects(manager);
        state.ParticipantIds.RemoveAt(state.ParticipantIds.Count - 1);
        for (int i = state.ParticipantIds.Count; i < config.Game.PlayerCount; i++)
            state.ParticipantIds.Add(new NetEntityId(first.AssignedId.InstanceId, checked((ulong)(1000 + i))));
        byte[] fullRoster = manager.CaptureSnapshot();
        Assert.Equal("exceeds_max_capacity", Assert.Throws<InvalidOperationException>(() => state.ParticipantIds.Add(first.AssignedId)).Message);
        Assert.Equal(fullRoster, manager.CaptureSnapshot());
        byte[] overRoster = BomberSnapshotCorruption.AppendListEntries(fullRoster, "BomberWorldRuntime.participantIds", config.Game.PlayerCount, first.AssignedId.ToHex());
        BomberTestWorld.AssertOwnerFailure<FormatException>(() => { using var restored = BomberTestWorld.Restore(overRoster, GeneratedRegistry.Instance, config: BomberConfigBinding.Load()); });
        Assert.Throws<InvalidOperationException>(() => state.ValidateRoster(config));
        // Over-capacity hydration is asserted against overRoster above; the live container cannot hold that input.
        while (state.ParticipantIds.Count > 2) state.ParticipantIds.RemoveAt(state.ParticipantIds.Count - 1);
        manager.World.Get<BomberParticipantState>(second.AssignedId).Slot.Value = 0;
        Assert.Throws<InvalidOperationException>(() => state.ValidateRoster(config));
    }

    [Fact]
    public void PendingRejectsForeignSourceWrongMatchAndSecondHeader()
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberWorldRuntime state = manager.World.Single<BomberWorldRuntime>();
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        manager.World.Single<BomberMatchState>().MatchId.Value = 7;
        var good = new BomberPendingVoxelCell(new VoxelWriteEntry(1, 2, 3, 1), 0,
            BomberVoxelIntentKind.Initialize, default, default, 0, default, default, 0);
        var foreign = good with { SourceLife = new NetEntityId(state.Entity.InstanceId + 1, 1) };
        byte[] before = manager.CaptureSnapshot();
        Assert.Throws<InvalidOperationException>(() => state.RecordPending("foreign", 1, 7, new[] { foreign }, config));
        Assert.Throws<InvalidOperationException>(() => state.RecordPending("wrong-match", 1, 8, new[] { good }, config));
        Assert.Equal(before, manager.CaptureSnapshot());
        state.RecordPending("kept", manager.World.Tick, 7, new[] { good }, config);
        byte[] kept = manager.CaptureSnapshot();
        Assert.Equal("exceeds_max_capacity", Assert.Throws<InvalidOperationException>(() => state.PendingVoxelTransactionIds.Add("second")).Message);
        state.ValidatePending(config, 7);
        Assert.Equal(kept, manager.CaptureSnapshot());
        byte[] overHeader = BomberSnapshotCorruption.AppendListEntries(kept, "BomberWorldRuntime.pendingVoxelTransactionIds", 1, "second");
        BomberTestWorld.AssertOwnerFailure<FormatException>(() => { using var restored = BomberTestWorld.Restore(overHeader, GeneratedRegistry.Instance, config: BomberConfigBinding.Load()); });
    }

    [Fact]
    public void VoxelFrameRejectsStaleTickAndReturnsSortedLastWritePerCell()
    {
        IBomberConfig config = BomberConfigBinding.Read();
        int limit = checked(config.Map.Width * config.Map.Depth * 2);
        var frame = new Lumio.Bomber.Gameplay.BomberVoxelFrame();
        frame.Begin(20, new uint[limit], config);
        Assert.Equal(0U, frame.Read(0, 20));
        Assert.Throws<InvalidOperationException>(() => frame.Read(0, 21));
        Assert.Throws<InvalidOperationException>(() => frame.Begin(20, new uint[limit], config));
        frame.Merge(new VoxelWriteEntry(2, 5, 1, 1), 20);
        frame.Merge(new VoxelWriteEntry(1, 9, 2, 1), 20);
        frame.Merge(new VoxelWriteEntry(2, 5, 3, 1), 20);
        VoxelWriteEntry[] ordered = frame.OrderedWrites(20);
        Assert.Equal(2, ordered.Length);
        Assert.Equal((1UL, 9), (ordered[0].SectionKey, ordered[0].CellOffset));
        Assert.Equal((2UL, 5), (ordered[1].SectionKey, ordered[1].CellOffset));
        Assert.Equal(3U, ordered[1].BlockId);
        frame.End();
        Assert.Throws<InvalidOperationException>(() => frame.OrderedWrites(20));
    }

    private static void AssertRestoreRejects(WorldManager manager)
    {
        byte[] invalidSnapshot = manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(invalidSnapshot,
            GeneratedRegistry.Instance, config: BomberConfigBinding.Load()));
    }
}
