using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Persistence;
using Lumio.GameRuntime.Hosting;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberCircleRespawnTests
{
    [Theory]
    [InlineData(-1)]
    [InlineData(0)]
    [InlineData(25)]
    public void PrearrangedRealSuccessorLandsInTheCurrentCircleWhenTransferArrivesAtOrAfterShrink(int lateness)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true, controlled: true);
        var world = scene.World;
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        var old = scene.Lives[0];
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        ulong generation = participant.LifeGeneration.Value;
        for (ulong chain = 9901; chain < 9904; chain++)
            BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        scene.TickControlled(false); scene.TickControlled(false); scene.TickControlled(false);
        Assert.False(world.IsLive(old));
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, participant.LifePhase.Value);
        match.PhaseEndTick.Value = world.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        scene.TickControlled(false);
        var circle = world.Single<BomberFinalCircleState>();
        ulong due = checked((ulong)((long)circle.NextEffectiveTick.Value + lateness));
        while (world.Tick < due - 1) scene.TickControlled(false);
        Assert.Single(scene.PendingTransfers);
        // Actual Host transfer request is queued one Tick before the selected
        // boundary, then consumed by the real Runtime owner on that boundary.
        scene.TickControlled(); scene.TickControlled();
        var transfer = Assert.Single(scene.TransferResults, result => result.Operation == "transfer" &&
            result.CommitFact == Lumio.Wire.SuccessorCommitFact.Applied);
        Assert.Equal(due, transfer.CommitTick);
        // Transfer commits after ProcessorPlan; Game consumes that owner fact in
        // the following ProcessorPlan, never in the plan that preceded it.
        scene.TickControlled();
        Assert.Equal(13, circle.CurrentSide.Value);
        Assert.NotEqual(old, participant.CurrentLife.Value);
        Assert.True(world.IsLive(participant.CurrentLife.Value));
        Assert.Equal(generation + 1, participant.LifeGeneration.Value);
        var player = world.Get<BomberPlayerState>(participant.CurrentLife.Value);
        Assert.Equal(participant.Entity, player.Participant.Value);
        Assert.Equal(participant.LifeGeneration.Value, player.LifeGeneration.Value);
        Assert.Equal(6, world.Get<AttributeComponent>(player.Entity).GetCurrentValue(BomberAttributeNames.HealthPoints));
        Assert.True(scene.ControlledBinding!.TryResolveConnectionState("successor-0", out var controlled, out _));
        Assert.Equal(player.Entity, controlled);
        Assert.Equal((int)BomberLifePhase.Protected, player.LifePhase.Value);
        Vector3 position = world.Get<LogicTransform>(player.Entity).LocalPosition;
        int left = (config.Map.Width - circle.CurrentSide.Value) / 2;
        Assert.InRange(BomberMatchRules.CellX(position), left, left + circle.CurrentSide.Value - 1);
        Assert.InRange(BomberMatchRules.CellZ(position), left, left + circle.CurrentSide.Value - 1);
        foreach (var other in world.Each<BomberPlayerState>().Where(p => p.Entity != player.Entity &&
            p.LifePhase.Value is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable))
        {
            var threat = world.Get<LogicTransform>(other.Entity).LocalPosition;
            Assert.True(Math.Abs(BomberMatchRules.CellX(position) - BomberMatchRules.CellX(threat)) +
                Math.Abs(BomberMatchRules.CellZ(position) - BomberMatchRules.CellZ(threat)) >= config.Map.SpawnMinDistance);
        }
        Assert.Single(scene.TransferResults, result => result.Operation == "transfer" &&
            result.CommitFact == Lumio.Wire.SuccessorCommitFact.Applied);
    }

    [Fact]
    public void AppliedTransferWithNoLegalLandRetainsBirthQualificationAndRejectsInputUntilLandReturns()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true, controlled: true);
        var world = scene.World;
        var old = scene.Lives[0];
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        for (ulong chain = 9911; chain < 9914; chain++)
            BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        for (int i = 0; i < 160 && scene.PendingTransfers.Count == 0; i++) scene.TickControlled(false);
        var request = Assert.Single(scene.PendingTransfers);
        RewriteGround(scene, 1027u << 8, 990010);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        Assert.Single(scene.TransferResults, r => r.Operation == "transfer" && r.CommitFact == Lumio.Wire.SuccessorCommitFact.Applied);
        Assert.Equal(request.SuccessorEntityId, participant.CurrentLife.Value);
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, participant.LifePhase.Value);
        Assert.True(participant.SuccessorPending.Value);
        Assert.True(world.Get<BomberRespawnCarry>(participant.Entity).CarryPresent.Value);
        Assert.False(BomberMatchRules.IsPlayerInputOpen(world, participant.CurrentLife.Value));
        var place = new PlaceBombAbility();
        Assert.False(place.CanActivate(new PlaceBombAbility.Input(), world.Get<AbilityComponent>(participant.CurrentLife.Value), out var denied));
        Assert.Equal("bomber_match_not_ready", denied);
        for (int i = 0; i < 3; i++) scene.TickControlled();
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, participant.LifePhase.Value);
        RewriteGround(scene, 1022u << 8, 990011);
        scene.TickControlled();
        Assert.Equal((int)BomberLifePhase.Protected, participant.LifePhase.Value);
        Assert.False(participant.SuccessorPending.Value);
        Assert.False(world.Get<BomberRespawnCarry>(participant.Entity).CarryPresent.Value);
        Assert.True(BomberMatchRules.IsPlayerInputOpen(world, participant.CurrentLife.Value));
        Assert.Single(scene.TransferResults, r => r.Operation == "transfer");
    }

    [Theory]
    [InlineData("live")]
    [InlineData("paired")]
    [InlineData("refused")]
    [InlineData("new-threat")]
    [InlineData("invalid-arms")]
    [InlineData("invalid-generation")]
    public void LandingWaitsForOriginalReceiptOfAtMostTwoSoftSafetyArms(string mode)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true, controlled: true, persistence: true,
            budget: mode == "refused" ? new WorldIngressBudget(1, 1, 1, 1) : null);
        var world = scene.World;
        var old = scene.Lives[0];
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        for (ulong chain = 9921; chain < 9924; chain++)
            BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        for (int i = 0; i < 160 && scene.PendingTransfers.Count == 0; i++) scene.TickControlled(false);
        Assert.Single(scene.PendingTransfers);
        RewriteGround(scene, 1027u << 8, 990020);
        scene.Write(11, 0, 11, 1022u << 8);
        scene.Write(12, 0, 11, 1022u << 8);
        scene.Write(11, 0, 12, 1022u << 8);
        scene.Write(12, 1, 11, 1025u << 8);
        scene.Write(11, 1, 12, 1025u << 8);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        var runtime = world.Single<BomberWorldRuntime>();
        IDisposable? recovery = null;
        if (mode == "refused")
        {
            Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
            Assert.Equal((int)BomberLifePhase.AwaitingRespawn, participant.LifePhase.Value);
            Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(12, 1, 11)).BlockId);
            Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(11, 1, 12)).BlockId);
            for (int i = 0; i < 3; i++) scene.TickControlled();
            Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
            var owner = NativeWorldVoxelResources.Require(scene.Manager).Adapter;
            recovery = VoxelGameplayBinding.Bind(scene.Manager, owner);
            scene.Manager.BindVoxelTick(owner.PrepareVoxel, owner.CommitVoxel);
            scene.TickControlled();
        }
        using var recovered = recovery;
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(2, runtime.PendingSections.Count);
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, participant.LifePhase.Value);
        Assert.False(BomberMatchRules.IsPlayerInputOpen(world, participant.CurrentLife.Value));
        Assert.All(world.Each<BomberStatistics>(), stats => Assert.Equal(0, stats.DestroyedBlocks.Value));
        Assert.Empty(world.Each<BomberPickupItem>());
        if (mode is "invalid-arms" or "invalid-generation")
        {
            if (mode == "invalid-arms")
            {
                var wrong = BomberTerrainTransactions.Address(BomberConfigBinding.For(world).Map, 10, 1, 11);
                runtime.PendingSections[1] = wrong.Section;
                runtime.PendingCellOffsets[1] = wrong.Offset;
            }
            else runtime.PendingSourceLifeGenerations[1]++;
            Assert.Throws<InvalidOperationException>(() => scene.TickControlled());
            return;
        }
        if (mode == "paired")
        {
            string transaction = runtime.PendingVoxelTransactionIds[0];
            Assert.True(world.TryGetService<WorldPersistenceSubsystem>(out var persistence));
            var captured = persistence!.Capture();
            Assert.True(captured.Succeeded, captured.ErrorCode);
            using var restored = BomberTestWorld.RestorePaired(captured.Checkpoint!.Value);
            Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
            Assert.Equal(transaction, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds[0]);
            var resumed = restored.World.Get<BomberParticipantState>(participant.Entity);
            Assert.Equal((int)BomberLifePhase.AwaitingRespawn, resumed.LifePhase.Value);
            Assert.Equal(participant.CurrentLife.Value, resumed.CurrentLife.Value);
            restored.Tick();
            Assert.Equal(0, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
            Assert.Equal((int)BomberLifePhase.Protected, resumed.LifePhase.Value);
            Assert.Equal(new Vector3(11.5f, 1.5f, 11.5f), restored.World.Get<LogicTransform>(resumed.CurrentLife.Value).LocalPosition);
            Assert.Empty(restored.World.Each<BomberPickupItem>());
            restored.Tick();
            Assert.Equal(0, restored.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
            return;
        }
        if (mode == "new-threat")
        {
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(scene.Lives[1]), new Vector3(11.5f, 1.5f, 11.5f));
            scene.TickControlled();
            Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
            Assert.Equal((int)BomberLifePhase.AwaitingRespawn, participant.LifePhase.Value);
            Assert.False(BomberMatchRules.IsPlayerInputOpen(world, participant.CurrentLife.Value));
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(scene.Lives[1]), new Vector3(1.5f, 1.5f, 2.5f));
        }
        scene.TickControlled();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal((int)BomberLifePhase.Protected, participant.LifePhase.Value);
        Assert.Equal(new Vector3(11.5f, 1.5f, 11.5f), world.Get<LogicTransform>(participant.CurrentLife.Value).LocalPosition);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(12, 1, 11)).BlockId);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(11, 1, 12)).BlockId);
        Assert.All(world.Each<BomberStatistics>(), stats => Assert.Equal(0, stats.DestroyedBlocks.Value));
        Assert.Empty(world.Each<BomberPickupItem>());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    public void DeadlineClosesAnAppliedButUnlandedSuccessorWithoutLaterReopeningIt(int delay)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, m2: true, controlled: true);
        var world = scene.World;
        var old = scene.Lives[0];
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        for (ulong chain = 9931; chain < 9934; chain++)
            BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        for (int i = 0; i < 160 && scene.PendingTransfers.Count == 0; i++) scene.TickControlled(false);
        Assert.Single(scene.PendingTransfers);
        RewriteGround(scene, 1027u << 8, 990030);
        var match = world.Single<BomberMatchState>();
        var config = BomberConfigBinding.For(world);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        Assert.Single(scene.TransferResults, r => r.Operation == "transfer" && r.CommitFact == Lumio.Wire.SuccessorCommitFact.Applied);
        Assert.NotEqual(old, participant.CurrentLife.Value);
        Assert.True(world.IsLive(participant.CurrentLife.Value));
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, participant.LifePhase.Value);
        match.PhaseEndTick.Value = world.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
        scene.TickControlled();
        Assert.Equal((int)BomberMatchPhase.FinalCircle, match.Phase.Value);
        ulong deadline = world.Tick + checked((ulong)delay);
        match.PhaseEndTick.Value = deadline;
        while (world.Tick <= deadline + 1) scene.TickControlled();
        Assert.Equal((int)BomberMatchPhase.Podium, match.Phase.Value);
        Assert.Equal(deadline, match.EndTick.Value);
        Assert.Equal((int)BomberLifePhase.Eliminated, participant.LifePhase.Value);
        Assert.Equal(deadline, participant.EliminatedTick.Value);
        Assert.Equal((int)BomberLifePhase.Eliminated, world.Get<BomberPlayerState>(participant.CurrentLife.Value).LifePhase.Value);
        Assert.Equal(deadline, world.Get<BomberPlayerState>(participant.CurrentLife.Value).EliminatedTick.Value);
        Assert.False(participant.SuccessorPending.Value);
        var result = Assert.Single(world.Single<BomberResults>().ReadRetained(config.Game.PlayerCount));
        var row = Assert.Single(result.Rows, r => r.Participant == participant.Entity);
        Assert.False(row.Survived);
        Assert.Equal(deadline, row.EliminatedTick);
        Assert.Equal(participant.CurrentLife.Value, row.Life);
        Assert.Equal(participant.LifeGeneration.Value, row.LifeGeneration);
        RewriteGround(scene, 1022u << 8, 990031);
        scene.TickControlled(); scene.TickControlled();
        Assert.Equal((int)BomberLifePhase.Eliminated, participant.LifePhase.Value);
        Assert.False(BomberMatchRules.IsPlayerInputOpen(world, participant.CurrentLife.Value));
    }

    private static void RewriteGround(BomberTerrainProductionTests.Scene scene, uint block, ulong transaction)
    {
        var config = BomberConfigBinding.For(scene.World);
        var writes = new System.Collections.Generic.List<VoxelBlockWriteEntry>();
        for (int z = 0; z < config.Map.Depth; z++)
        for (int x = 0; x < config.Map.Width; x++)
        {
            var read = scene.Native.ReadCell(new VoxelWorldCoordinate(x, 0, z));
            writes.Add(new(new VoxelSectionKey(x >> 4, 0, z >> 4),
                checked((ushort)(((z & 15) << 4) | (x & 15))), block, read.SectionRevision));
        }
        using var token = scene.Native.PrepareWriteV2(transaction, writes.ToArray(), Array.Empty<VoxelBindingMutationEntry>());
        var requirements = scene.Native.GetOutputRequirements(token);
        Assert.Equal(0, scene.Native.CommitV3(token, new VoxelWriteReceipt[requirements.SectionCapacity],
            new byte[requirements.ReceiptByteCapacity]).Status);
    }
}
