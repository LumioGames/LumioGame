using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation.Determinism;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberRoundRolloverTests
{
    [Fact]
    public void AcceptedTerrainDebtSurvivesRolloverAndWaitsForTheNewNativeResourceGeneration()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, 5, 5, m2: true);
        var world = scene.World;
        var runtime = world.Single<BomberWorldRuntime>();
        var match = world.Single<BomberMatchState>();
        var config = BomberConfigBinding.For(world);
        BomberInitialResources.Configure(world, M2InitialLayout.Plan(19));
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.Equal(3, runtime.InitialResourcePhase.Value);
        uint wood = config.Tables.Chest.Rows.Single(r => r.Name == "Wood").Id;
        var chest = world.Each<BomberChestState>().First(c => c.ResourceTier.Value == wood &&
            scene.Native.ReadCell(new VoxelWorldCoordinate(c.InitialResourceCell.Value % config.Map.Width,
                1, c.InitialResourceCell.Value / config.Map.Width + 1)).BlockId >> 8 is not (1028u or 1032u));
        int x = chest.InitialResourceCell.Value % config.Map.Width;
        int z = chest.InitialResourceCell.Value / config.Map.Width;
        // Author an open bomb origin beside the real initialized sparse-bound chest.
        scene.Write(x, 1, z + 1, 0);
        var bomb = scene.Bomb();
        bomb.Get<BomberBombState>().Power.Value = 1;
        BomberEffectIntegrationTests.Position(bomb.Get<LogicTransform>(), new System.Numerics.Vector3(x + .5f, 1.5f, z + 1.5f));
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        for (int iz = 0; iz < config.Map.Depth; iz++)
        for (int ix = 0; ix < config.Map.Width; ix++) scene.Write(ix, 0, iz, 1027u << 8);
        for (int i = 0; i < 16 && (world.IsLive(chest.Entity) || runtime.PendingVoxelTransactionIds.Count != 0 ||
            world.Get<BomberBombState>(bomb.AssignedId).TerrainContinuations.Count != 0); i++) scene.Manager.Tick();
        Assert.False(world.IsLive(chest.Entity));
        Assert.InRange(runtime.TerrainRewards.Count, 1, 16);
        Assert.Empty(world.Each<BomberPickupItem>());
        var accepted = Enumerable.Range(0, runtime.TerrainRewards.Count)
            .Select(i => BomberTerrainTransactions.Decode<BomberTerrainReward>(runtime.TerrainRewards[i])).ToArray();
        ulong originalMatch = match.MatchId.Value;
        EndRound(scene);
        Assert.Equal(originalMatch + 1, match.MatchId.Value);
        Assert.Equal(accepted.Length, runtime.TerrainRewards.Count);
        Assert.Empty(world.Each<BomberPickupItem>());
        for (int i = 0; i < 16 && runtime.InitialResourcePhase.Value != 3; i++)
        {
            scene.Manager.Tick();
            if (runtime.InitialResourcePhase.Value != 3)
            {
                Assert.Equal(accepted.Length, runtime.TerrainRewards.Count);
                Assert.Empty(world.Each<BomberPickupItem>());
            }
        }
        Assert.Equal(3, runtime.InitialResourcePhase.Value);
        scene.Manager.Tick();
        Assert.Equal(0, runtime.TerrainRewards.Count);
        var placed = world.Each<BomberPickupItem>().ToArray();
        Assert.Equal(accepted.Length, placed.Length);
        foreach (var reward in accepted)
        {
            var item = Assert.Single(placed, p => p.TerrainTransaction.Value == reward.Transaction && p.TerrainOrdinal.Value == reward.Index);
            Assert.Equal(originalMatch, item.DropMatchId.Value);
            Assert.Equal(reward.Participant, item.DropParticipant.Value.ToHex());
            Assert.Equal(reward.Life, item.DroppedBy.Value.ToHex());
            Assert.Equal(reward.Generation, item.DropLifeGeneration.Value);
            Assert.Equal(reward.Occurred, item.DropOccurrenceTick.Value);
            Assert.Equal(reward.Bomb, item.TerrainSourceBomb.Value.ToHex());
            Assert.Equal(reward.Family, item.TerrainSourceFamily.Value.ToHex());
            var at = world.Get<LogicTransform>(item.Entity).LocalPosition;
            Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate((int)at.X, 1, (int)at.Z)).BlockId);
        }
        scene.Manager.Tick();
        Assert.Equal(accepted.Length, world.Each<BomberPickupItem>().Count());
    }

    [Fact]
    public void RoundCleanupWaitsForItsActualOriginalReceiptBeforeChangingMatchIdentity()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8);
        var match = scene.World.Single<BomberMatchState>();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        ulong originalMatch = match.MatchId.Value;
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = scene.World.Tick;
        scene.Manager.Tick();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        var original = scene.Adapter.CaptureResultCheckpoint();
        var result = Assert.Single(original.Results);
        Assert.Equal(transaction, result.TransactionId);
        Assert.Equal(VoxelTxnState.Applied, result.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Original, result.Outcome.Disposition);
        Assert.True(result.Outcome.TokenConsumed);
        Assert.Equal(originalMatch, match.MatchId.Value);
        var held = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var heldBinding = VoxelGameplayBinding.Bind(scene.Manager, held);
        scene.Manager.BindVoxelTick(held.PrepareVoxel, held.CommitVoxel);
        for (int i = 0; i < 3; i++)
        {
            scene.Manager.Tick();
            Assert.Equal(originalMatch, match.MatchId.Value);
            Assert.Equal((int)BomberMatchPhase.Results, match.Phase.Value);
            Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
            Assert.Equal(1, runtime.PendingVoxelMatchIds.Count);
            Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
            Assert.Equal(originalMatch, runtime.PendingVoxelMatchIds[0]);
        }
        var delivered = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        delivered.RestoreResultCheckpoint(original);
        using var deliveredBinding = VoxelGameplayBinding.Bind(scene.Manager, delivered);
        scene.Manager.BindVoxelTick(delivered.PrepareVoxel, delivered.CommitVoxel);
        for (int i = 0; i < 80 && match.MatchId.Value == originalMatch; i++) scene.Manager.Tick();
        Assert.Equal(originalMatch + 1, match.MatchId.Value);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
    }

    [Fact]
    public void RefusedCleanupKeepsOldMatchClosedAndRetriesOnTheRealNativeAdapter()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8,
            budget: new WorldIngressBudget(1, 1, 1, 1));
        var match = scene.World.Single<BomberMatchState>();
        ulong originalMatch = match.MatchId.Value;
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = scene.World.Tick;
        for (int i = 0; i < 3; i++)
        {
            scene.Manager.Tick();
            Assert.Equal(originalMatch, match.MatchId.Value);
            Assert.Equal((int)BomberMatchPhase.Results, match.Phase.Value);
            Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
            Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        }
        var admitted = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var binding = VoxelGameplayBinding.Bind(scene.Manager, admitted);
        scene.Manager.BindVoxelTick(admitted.PrepareVoxel, admitted.CommitVoxel);
        for (int i = 0; i < 80 && match.MatchId.Value == originalMatch; i++) scene.Manager.Tick();
        Assert.Equal(originalMatch + 1, match.MatchId.Value);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
    }

    [Fact]
    public void TwoNativeRoundsRetireOldResourcesAndReinitializeTheSameRoom()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, 5, 5, m2: true);
        var world = scene.World;
        var runtime = world.Single<BomberWorldRuntime>();
        var match = world.Single<BomberMatchState>();
        var layout = M2InitialLayout.Plan(19);
        BomberInitialResources.Configure(world, layout);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.Equal(3, runtime.InitialResourcePhase.Value);
        var participants = world.Each<BomberParticipantState>().OrderBy(p => p.Slot.Value).Select(p => p.Entity).ToArray();
        ulong instance = world.InstanceId;
        for (ulong round = 1; round <= 2; round++)
        {
            Assert.Equal(round, match.MatchId.Value);
            var oldChests = world.Each<BomberChestState>().Select(c => c.Entity).ToArray();
            Assert.Equal(16, oldChests.Length);
            var life = scene.Lives[0];
            var player = world.Get<BomberPlayerState>(life);
            var skill = world.Get<BomberSkillState>(life);
            for (int i = 0; i < 3; i++) Take(scene, life, (BomberPickupKind)i);
            Take(scene, life, BomberPickupKind.GoldenHeart);
            Assert.Equal(3, player.HatCount.Value);
            Assert.Equal(1, player.GoldenHeartCount.Value);
            ulong heldCharacter = skill.CharacterId.Value;
            skill.CooldownFromTick.Value = world.Tick;
            skill.CooldownUntilTick.Value = world.Tick + 5000;
            skill.BubbleUntilTick.Value = skill.AuraUntilTick.Value = skill.FrozenUntilTick.Value = world.Tick + 5000;
            skill.FreezeImmuneUntilTick.Value = skill.ToxinUntilTick.Value = skill.ShockUntilTick.Value = world.Tick + 5000;
            skill.RegenNextTick.Value = skill.LastDamageTick.Value = world.Tick;
            skill.ToxinSource.Value = scene.Lives[1];
            skill.TeleportSequence.Value = 7;
            var oldPickup = world.Commands.Create<BomberPickupItemEntity>();
            oldPickup.Get<BomberPickupItem>().Kind.Value = (int)BomberPickupKind.GoldenHeart;
            scene.Manager.Tick();
            // Advance only clock premises; the real rule reducer publishes Podium/results.
            ulong seed = match.Seed.Value;
            EndRound(scene);
            Assert.Equal(round + 1, match.MatchId.Value);
            Assert.Equal(instance, world.InstanceId);
            var expectedSeed = new DeterminismContext(seed, match.StartTick.Value, RuntimeSchema.SchemaEpoch)
                .OpenRngStream(FormattableString.Invariant($"bomber.match.{round + 1}"));
            Assert.Equal(expectedSeed.NextUInt64(), match.Seed.Value);
            Assert.NotEqual(seed, match.Seed.Value);
            Assert.Equal(heldCharacter, skill.CharacterId.Value);
            Assert.Equal((0, 0, 6), (player.HatCount.Value, player.GoldenHeartCount.Value, player.MaximumHealth.Value));
            var attributes = world.Get<AttributeComponent>(life);
            var config = BomberConfigBinding.For(world);
            foreach (var name in new[] { BomberAttributeNames.HealthPoints, BomberAttributeNames.BombPower,
                BomberAttributeNames.BombCapacity, BomberAttributeNames.AvailableBombs, BomberAttributeNames.SpeedTier })
            {
                Assert.Equal(config.Attribute(name).Initial, attributes.GetBaseValue(name));
                Assert.Equal(config.Attribute(name).Initial, attributes.GetCurrentValue(name));
            }
            var fact = world.Get<BomberHealthFacts>(life);
            Assert.Equal(10104u, fact.TypeId[0]);
            Assert.Equal(1, fact.Status[0]);
            Assert.True(fact.Ready[0]);
            Assert.False(player.RestorePending.Value);
            Assert.Equal(0UL, skill.CooldownFromTick.Value + skill.CooldownUntilTick.Value + skill.BubbleUntilTick.Value +
                skill.AuraUntilTick.Value + skill.FrozenUntilTick.Value + skill.FreezeImmuneUntilTick.Value +
                skill.ToxinUntilTick.Value + skill.ShockUntilTick.Value + skill.LastDamageTick.Value + skill.RegenNextTick.Value + skill.TeleportSequence.Value);
            Assert.True(skill.ToxinSource.Value.IsDefault);
            Assert.Equal(participants, world.Each<BomberParticipantState>().OrderBy(p => p.Slot.Value).Select(p => p.Entity));
            Assert.All(oldChests, id => Assert.False(world.IsLive(id)));
            Assert.False(world.IsLive(oldPickup.AssignedId));
            for (int i = 0; i < 10 && runtime.InitialResourcePhase.Value != 3; i++) scene.Manager.Tick();
            Assert.True(runtime.InitialResourcePhase.Value == 3,
                $"round={round} phase={runtime.InitialResourcePhase.Value} cursor={runtime.InitialResourceCursor.Value} pending={runtime.PendingVoxelTransactionIds.Count} sequence={runtime.NextVoxelTransactionSequence.Value}" +
                (runtime.PendingVoxelTransactionIds.Count == 1 ? $" outcome={scene.Adapter.QueryTransaction(runtime.PendingVoxelTransactionIds[0])}" : ""));
            Assert.Equal(round + 1, runtime.TerrainInitialMatchId.Value);
            Assert.All(world.Each<BomberChestState>(), chest => Assert.Equal(round + 1, chest.InitialResourceMatch.Value));
            Assert.Equal(16, world.Each<BomberChestState>().Count());
            Assert.Equal(4, runtime.InitialBarrelReservations.Count);
            Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
            Assert.Equal(0, runtime.TerrainRewards.Count);
            Assert.Empty(world.Each<BomberPickupItem>());
            Assert.Empty(world.Each<BomberBombState>());
            // The new match owns a fresh seeded plan; its Native cells must match that
            // exact generation rather than the first round's migration fixture.
            var nextLayout = M2InitialLayout.Plan(19, match.Seed.Value);
            foreach (var cell in nextLayout.Cells)
            {
                uint expected = cell.Kind == M2CellKind.Barrel ? 1032u << 8 : cell.Kind == M2CellKind.Soft ? 1025u << 8 : 1028u << 8;
                Assert.Equal(expected, scene.Native.ReadCell(new VoxelWorldCoordinate(cell.X, 1, cell.Z)).BlockId);
            }
            match.PhaseEndTick.Value = world.Tick;
            scene.Manager.Tick();
            Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        }
    }

    private static void Take(BomberTerrainProductionTests.Scene scene, NetEntityId life, BomberPickupKind kind)
    {
        var order = scene.World.Commands.Create<BomberPickupItemEntity>();
        order.Get<BomberPickupItem>().Kind.Value = (int)kind;
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), scene.World.Get<LogicTransform>(life).LocalPosition);
        scene.Manager.Tick();
        scene.World.Get<AbilityComponent>(life).Activate<PickupAbility, PickupAbility.Input>(new() { Target = order.AssignedId });
        scene.Manager.Tick();
        scene.Manager.Tick();
        Assert.False(scene.World.IsLive(order.AssignedId));
    }

    internal static void EndRound(BomberTerrainProductionTests.Scene scene)
    {
        var match = scene.World.Single<BomberMatchState>();
        var config = BomberConfigBinding.For(scene.World);
        if (match.Phase.Value == (int)BomberMatchPhase.Warmup)
        {
            match.PhaseEndTick.Value = scene.World.Tick;
            scene.Manager.Tick();
        }
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        match.PhaseEndTick.Value = checked(scene.World.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz));
        scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.FinalCircle, match.Phase.Value);
        match.PhaseEndTick.Value = scene.World.Tick;
        scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Podium, match.Phase.Value);
        Assert.Equal((int)BomberEndReason.TimeLimit, match.EndReason.Value);
        ulong oldMatch = match.MatchId.Value;
        int deadline = checked((int)Ticks.FromMilliseconds(config.Game.PodiumMs + config.Game.ResultsMs, config.Game.TickRateHz) + 80);
        for (int i = 0; i < deadline && match.MatchId.Value == oldMatch; i++) scene.Manager.Tick();
    }
}
