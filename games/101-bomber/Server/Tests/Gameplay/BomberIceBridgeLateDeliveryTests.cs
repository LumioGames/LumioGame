using System;
using System.Linq;
using System.Numerics;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;
using VoxelCommitDisposition = Lumio.GameRuntime.Coordination.VoxelCommitDisposition;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberIceBridgeLateDeliveryTests
{
    private const int X = 6, Z = 5;
    private const uint Water = 1027u << 8, Ice = 1031u << 8;

    // Private, uncompiled regression draft. No production fields/clocks/outcomes are authored.
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void GenuineRemoteOrFrenzyFuseSurvivesCommittedWaterPastItsOriginalDeadline(bool frenzy)
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        var bridge = FreezeAndAccept(scene);
        var bridgeId = bridge.Entity;
        var bridgeIdentity = (bridge.ResourceGeneration.Value, bridge.FreezeToken.Value,
            bridge.AppliedTick.Value, bridge.ExpiresAtTick.Value);
        while (scene.World.Tick < bridge.ExpiresAtTick.Value - 16) scene.TickControlled();
        NetEntityId life = scene.Lives[0];
        var player = scene.World.Get<BomberPlayerState>(life);
        var participant = scene.World.Get<BomberParticipantState>(player.Participant.Value);
        if (frenzy)
        {
            BomberGrowthHealthTests.Take(scene.Manager, life, 7);
            Assert.True(BomberFrenzy.IsActive(scene.World, participant, life));
            Assert.True(scene.World.Get<BomberHealthFacts>(life).Ready[0]);
            Assert.Equal(1, scene.World.Get<BomberHealthFacts>(life).Status[0]);
        }
        long inventoryBefore = Available(scene, life);
        var bomb = Place(scene, 0, remote: !frenzy, 3, 3);
        scene.TickControlled(); // Actual Native HFSM initialization of the published bomb.
        BombIdentity identity = CaptureIdentity(bomb);
        ulong placed = bomb.PlacedAtTick.Value, due = bomb.FuseEndTick.Value, chain = bomb.ChainId.Value;
        var config = BomberConfigBinding.For(scene.World);
        uint actualFuseMs = frenzy ? config.Game.FrenzyFuseMs : config.SkillLevel(
            scene.World.Get<BomberSkillState>(life).BombSkillId.Value, 1).DurationMs;
        Assert.Equal(checked(placed + Ticks.FromMilliseconds(actualFuseMs, config.Game.TickRateHz)), due);
        Assert.Equal(frenzy, bomb.Frenzy.Value);
        Assert.Equal(frenzy ? 0 : 7, bomb.BombKind.Value);
        long heldInventory = frenzy ? inventoryBefore : inventoryBefore - 1;
        Assert.Equal(heldInventory, Available(scene, life));
        Position(scene.World, bomb.Entity, X, Z); // Existing12 geometry-only birth fixture boundary.
        using var definition = BomberHfsmDefinitions.Compile(scene.World, BomberHfsmKind.Bomb);
        var machine = scene.World.Get<BomberHfsmState>(bomb.Entity);
        var witness = (machine.MachineKey.Value, machine.Epoch.Value, machine.StepSeq.Value);
        AwaitWater(scene);
        Assert.True(scene.World.Tick < due);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var original = Original(scene, scene.Adapter);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        ulong submitted = runtime.PendingVoxelSubmittedTicks[0], revision = GroundRevision(scene);
        Assert.Null(scene.Adapter.BindingGet(Address(scene).Section, Address(scene).Offset));
        Assert.Equal(bridgeId, runtime.PendingChests[0]);
        Assert.Equal(Ice, runtime.PendingOldBlocks[0]); Assert.Equal(Water, runtime.PendingNewBlocks[0]);
        Assert.True(revision > runtime.PendingExpectedRevisions[0]);
        using (Withhold(scene))
        {
            var held = VoxelGameplayBinding.Resolve(scene.Manager)!;
            while (scene.World.Tick < checked(due + 2))
            {
                scene.TickControlled();
                Assert.Empty(held.CaptureResultCheckpoint().Results);
                AssertHeld();
            }
            Assert.True(scene.World.Tick > due);
            AssertHeld();
        }
        DeliverAndTick(scene, original);
        Assert.False(scene.World.IsLive(identity.Entity));
        AssertRetired(scene, bridgeId); AssertOneExtinguishment(scene, identity);
        Assert.Equal(inventoryBefore, Available(scene, life));
        if (frenzy) Assert.Equal(0, participant.FrenzyBombPromises.Count);
        Assert.DoesNotContain(BomberEffectIntegrationTests.Events(scene.World, "bomb_exploded"),
            row => row.GetProperty("entityId").GetString() == identity.Entity.ToHex());
        DeliverAndTick(scene, original);
        AssertOneExtinguishment(scene, identity);
        Assert.Equal(inventoryBefore, Available(scene, life));
        if (frenzy) Assert.Equal(0, participant.FrenzyBombPromises.Count);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal("", runtime.IceBridgePromises.Value);

        void AssertHeld()
        {
            Assert.True(scene.World.IsLive(identity.Entity));
            var current = scene.World.Get<BomberBombState>(identity.Entity);
            Assert.Equal(identity, CaptureIdentity(current));
            Assert.Equal(placed, current.PlacedAtTick.Value); Assert.Equal(due, current.FuseEndTick.Value);
            Assert.Equal(chain, current.ChainId.Value); Assert.Equal(frenzy, current.Frenzy.Value);
            Assert.Equal(frenzy ? 0 : 7, current.BombKind.Value);
            Assert.Equal((int)BomberBombPhase.Fuse, current.Phase.Value);
            Assert.Equal(0UL, current.ExplodedAtTick.Value); Assert.Equal(0UL, current.DangerUntilTick.Value);
            Assert.Equal(0UL, current.BurnUntilTick.Value); Assert.False(current.CapacityReturned.Value);
            var actual = scene.World.Get<BomberHfsmState>(identity.Entity);
            Assert.Equal(witness, (actual.MachineKey.Value, actual.Epoch.Value, actual.StepSeq.Value));
            Assert.Equal(BomberHfsmDefinitions.State.BombStationary,
                actual.ReadSnapshot(definition, BomberHfsmKind.Bomb, actual.MachineKey.Value).ActivePath[^1].State);
            Assert.Equal(heldInventory, Available(scene, life));
            Assert.True(scene.World.IsLive(bridgeId));
            Assert.Equal(bridgeIdentity, (bridge.ResourceGeneration.Value, bridge.FreezeToken.Value,
                bridge.AppliedTick.Value, bridge.ExpiresAtTick.Value));
            Assert.Equal(Water, GroundBlock(scene)); Assert.Equal(revision, GroundRevision(scene));
            Assert.Null(VoxelGameplayBinding.Resolve(scene.Manager)!.BindingGet(Address(scene).Section, Address(scene).Offset));
            Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
            Assert.Equal(submitted, runtime.PendingVoxelSubmittedTicks[0]);
            var debt = Debt(scene, bridge);
            Assert.Equal(4, debt.GetProperty("Phase").GetInt32());
            Assert.True(debt.GetProperty("MutationSubmitted").GetBoolean());
            Assert.Equal(transaction, debt.GetProperty("TransactionId").GetString());
            Assert.DoesNotContain(BomberEffectIntegrationTests.Events(scene.World, "bomb_extinguished"),
                row => row.GetProperty("entityId").GetString() == identity.Entity.ToHex());
            Assert.DoesNotContain(BomberEffectIntegrationTests.Events(scene.World, "bomb_exploded"),
                row => row.GetProperty("entityId").GetString() == identity.Entity.ToHex());
        }
    }

    [Fact]
    public void RealDryDetonationCannotCrossThePendingTerrainGateToRewriteAHeldWaterFusesChainOrClock()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        var bridge = FreezeAndAccept(scene);
        while (scene.World.Tick < bridge.ExpiresAtTick.Value - 16) scene.TickControlled();
        var target = Place(scene, 0, remote: true, 3, 3);
        Position(scene.World, target.Entity, X, Z);
        var source = Place(scene, 1, remote: false, X - 1, Z);
        Position(scene.World, source.SourceLife.Value, 15, 15);
        scene.TickControlled();
        var targetIdentity = CaptureIdentity(target); var sourceIdentity = CaptureIdentity(source);
        ulong targetPlaced = target.PlacedAtTick.Value, targetDue = target.FuseEndTick.Value, targetChain = target.ChainId.Value;
        ulong sourceDue = source.FuseEndTick.Value, sourceChain = source.ChainId.Value;
        Assert.NotEqual(targetChain, sourceChain);
        Assert.True(source.Power.Value >= 1); // The held target would be in the first dry-source arm cell.
        Assert.Equal(new Vector3(X - .5f, 1.5f, Z + .5f), scene.World.Get<LogicTransform>(source.Entity).LocalPosition);
        AwaitWater(scene);
        Assert.True(scene.World.Tick < sourceDue); Assert.True(sourceDue < targetDue);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var original = Original(scene, scene.Adapter);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        using (Withhold(scene))
        {
            while (scene.World.Tick <= sourceDue) scene.TickControlled();
            Assert.True(scene.World.IsLive(sourceIdentity.Entity));
            Assert.Equal(sourceIdentity, CaptureIdentity(source));
            Assert.Equal((int)BomberBombPhase.Danger, source.Phase.Value);
            Assert.Equal(sourceDue, source.ExplodedAtTick.Value);
            Assert.Equal(sourceDue, source.FuseEndTick.Value); Assert.Equal(sourceChain, source.ChainId.Value);
            Assert.Equal(4, source.TerrainContinuations.Count);
            for (int index = 0; index < source.TerrainContinuations.Count; index++)
                Assert.True(BomberTerrainTransactions.Decode<BomberTerrainContinuation>(source.TerrainContinuations[index]).Unstarted);
            var occurrence = Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "bomb_exploded"),
                row => row.GetProperty("entityId").GetString() == sourceIdentity.Entity.ToHex());
            Assert.Equal(sourceIdentity.SourceLife.ToHex(), occurrence.GetProperty("lifeId").GetString());
            // Actual natural explosion reached the origin only. The ordinary pending gate
            // prevents cross-cell blast traversal; this does not claim chain-admission execution.
            Assert.True(scene.World.IsLive(targetIdentity.Entity));
            Assert.Equal(targetIdentity, CaptureIdentity(target));
            Assert.Equal((int)BomberBombPhase.Fuse, target.Phase.Value);
            Assert.Equal(targetPlaced, target.PlacedAtTick.Value); Assert.Equal(targetDue, target.FuseEndTick.Value);
            Assert.Equal(targetChain, target.ChainId.Value); Assert.Equal(0UL, target.ExplodedAtTick.Value);
            Assert.False(target.CapacityReturned.Value); Assert.Equal(0L, Available(scene, targetIdentity.SourceLife));
            Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
        }
        DeliverAndTick(scene, original);
        Assert.False(scene.World.IsLive(targetIdentity.Entity)); AssertOneExtinguishment(scene, targetIdentity);
        Assert.Equal(1L, Available(scene, targetIdentity.SourceLife));
        DeliverAndTick(scene, original);
        AssertOneExtinguishment(scene, targetIdentity); Assert.Equal(1L, Available(scene, targetIdentity.SourceLife));
    }
    [Fact]
    public void LongWithheldActualOldLifeRemoteKeepsOneOriginalCreditAndNeverTargetsItsLandedSuccessor()
    {
        using var fixture = new Fixture(dropAllCapacity: true);
        var scene = fixture.Scene;
        BomberIceBridgeState bridge = FreezeAndAccept(scene);
        for (int tick = 0; tick < 5; tick++) scene.TickControlled();
        NetEntityId placingLife = scene.Lives[0];
        Position(scene.World, placingLife, 13, 13);
        EntityOrder capacityItem = BomberGrowthHealthTests.Item(scene.World, placingLife, (int)BomberPickupKind.Capacity);
        scene.TickControlled();
        var pickup = scene.World.Get<AbilityComponent>(placingLife).Activate<PickupAbility, PickupAbility.Input>(
            new PickupAbility.Input { Target = capacityItem.AssignedId });
        Assert.True(pickup.Succeeded, pickup.FailureCode);
        scene.TickControlled(); scene.TickControlled();
        Assert.False(scene.World.IsLive(capacityItem.AssignedId));
        Assert.Equal(2L, scene.World.Get<AttributeComponent>(placingLife).GetCurrentValue(BomberAttributeNames.BombCapacity));
        Assert.Equal(2L, Available(scene, placingLife));
        Assert.Equal(1000, BomberConfigBinding.For(scene.World).Drops.DeathDropPermille);
        BomberBombState remote = Place(scene, 0, remote: true, 13, 13);
        BombIdentity remoteIdentity = CaptureIdentity(remote);
        ulong remotePlaced = remote.PlacedAtTick.Value, remoteDue = remote.FuseEndTick.Value, remoteChain = remote.ChainId.Value;
        NetEntityId oldLife = remote.SourceLife.Value;
        ulong oldGeneration = remote.SourceLifeGeneration.Value;
        var participant = scene.World.Get<BomberParticipantState>(remote.Owner.Value);
        // Natural placement spacing keeps the dry original-life control Fuse live through late delivery+duplicate.
        for (int tick = 0; tick < 16; tick++) scene.TickControlled();
        BomberBombState dryRemote = Place(scene, 0, remote: true, 15, 13);
        scene.TickControlled(); // Initialize both genuinely published bombs through the normal Native path.
        BombIdentity dryIdentity = CaptureIdentity(dryRemote);
        ulong dryPlaced = dryRemote.PlacedAtTick.Value, dryFuseEnd = dryRemote.FuseEndTick.Value;
        Assert.NotEqual(remoteIdentity.Entity, dryIdentity.Entity);
        Assert.Equal(oldLife, dryIdentity.SourceLife);
        Assert.Equal(oldGeneration, dryIdentity.SourceLifeGeneration);
        Assert.Equal(remoteIdentity.Owner, dryIdentity.Owner);
        Assert.Equal(0L, Available(scene, oldLife));
        Position(scene.World, remote.Entity, X, Z);
        Position(scene.World, oldLife, 13, 11); // Leave the dry bomb's cell before actual death/drops.
        AssertDryRemote();
        for (int hit = 0; hit < 3; hit++)
        {
            _ = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], oldLife, checked((ulong)(900 + hit)));
            scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        }
        if (scene.World.IsLive(oldLife))
        {
            _ = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], oldLife, 903);
            scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        }
        Assert.False(scene.World.IsLive(oldLife));
        while (scene.World.Tick < bridge.ExpiresAtTick.Value - 4 &&
            (participant.CurrentLife.Value == oldLife || participant.CurrentLife.Value.IsDefault ||
             !scene.World.IsLive(participant.CurrentLife.Value) || participant.SuccessorPending.Value)) scene.TickControlled();
        NetEntityId successor = participant.CurrentLife.Value;
        Assert.NotEqual(oldLife, successor);
        Assert.True(scene.World.IsLive(successor));
        Assert.False(participant.SuccessorPending.Value);
        var newLife = scene.World.Get<BomberPlayerState>(successor);
        Assert.False(newLife.RestorePending.Value);
        Assert.True(newLife.LifePhase.Value is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable);
        Assert.True(newLife.LifeGeneration.Value > oldGeneration);
        Assert.Equal(1L, scene.World.Get<AttributeComponent>(successor).GetCurrentValue(BomberAttributeNames.BombCapacity));
        AssertDryRemote();
        long before = Available(scene, successor);
        Assert.Equal(0L, before);
        Assert.Equal(oldLife, remote.SourceLife.Value);
        Assert.Equal(oldGeneration, remote.SourceLifeGeneration.Value);
        AwaitWater(scene);
        AssertAllFuse(scene, new[] { remote });
        AssertDryRemote();
        VoxelResultCheckpoint original = Original(scene, scene.Adapter);
        using (Withhold(scene))
        {
            while (scene.World.Tick < checked(remoteDue + 2))
            {
                scene.TickControlled();
                Assert.True(scene.World.IsLive(remoteIdentity.Entity));
                Assert.Equal(remoteIdentity, CaptureIdentity(remote));
                Assert.Equal((int)BomberBombPhase.Fuse, remote.Phase.Value);
                Assert.Equal(remotePlaced, remote.PlacedAtTick.Value);
                Assert.Equal(remoteDue, remote.FuseEndTick.Value);
                Assert.Equal(remoteChain, remote.ChainId.Value);
                Assert.Equal(0UL, remote.ExplodedAtTick.Value);
                Assert.False(remote.CapacityReturned.Value);
                AssertDryRemote();
                Assert.Equal(before, Available(scene, successor));
            }
            Assert.True(scene.World.Tick > remoteDue);
        }
        DeliverAndTick(scene, original);
        Assert.False(scene.World.IsLive(remoteIdentity.Entity));
        AssertDryRemote();
        Assert.Equal(0L, BomberInventory.Available(scene.World, participant.Entity, 1));
        Assert.Equal(before, Available(scene, successor));
        AssertOneExtinguishment(scene, remoteIdentity);
        DeliverAndTick(scene, original);
        AssertDryRemote();
        Assert.Equal(0L, BomberInventory.Available(scene.World, participant.Entity, 1));
        Assert.Equal(before, Available(scene, successor));
        AssertOneExtinguishment(scene, remoteIdentity);

        void AssertDryRemote()
        {
            Assert.True(scene.World.IsLive(dryIdentity.Entity));
            BomberBombState actual = scene.World.Get<BomberBombState>(dryIdentity.Entity);
            Assert.Equal(dryIdentity, CaptureIdentity(actual));
            Assert.Equal(oldLife, actual.SourceLife.Value);
            Assert.Equal(oldGeneration, actual.SourceLifeGeneration.Value);
            Assert.Equal(participant.Entity, actual.Owner.Value);
            Assert.Equal(7, actual.BombKind.Value);
            Assert.False(actual.Frenzy.Value);
            Assert.False(actual.CapacityReturned.Value);
            Assert.Equal((int)BomberBombPhase.Fuse, actual.Phase.Value);
            Assert.Equal(dryPlaced, actual.PlacedAtTick.Value);
            Assert.Equal(dryFuseEnd, actual.FuseEndTick.Value);
            Assert.True(dryFuseEnd > scene.World.Tick);
            Assert.Equal(new Vector3(15.5f, 1.5f, 13.5f), scene.World.Get<LogicTransform>(actual.Entity).LocalPosition);
            uint dryGround = scene.Native.ReadCell(new VoxelWorldCoordinate(15,
                checked((byte)BomberConfigBinding.For(scene.World).Map.GroundLayer), 13)).BlockId;
            Assert.NotEqual(Water, dryGround);
            Assert.NotEqual(Ice, dryGround);
            Assert.DoesNotContain(BomberEffectIntegrationTests.Events(scene.World, "bomb_extinguished"),
                e => e.GetProperty("entityId").GetString() == dryIdentity.Entity.ToHex());
        }
    }

    private static BomberBombState Blast(BomberTerrainProductionTests.Scene scene, int kind, int x = 5)
    {
        var order = scene.Bomb();
        var bomb = order.Get<BomberBombState>();
        bomb.BombKind.Value = kind;
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(x + .5f, 1.5f, Z + .5f));
        return bomb;
    }

    private static BomberIceBridgeState AwaitNativeBridge(BomberTerrainProductionTests.Scene scene)
    {
        for (int tick = 0; tick < 8 && GroundBlock(scene) != Ice; tick++) scene.TickControlled();
        Assert.Equal(Ice, GroundBlock(scene));
        var bridge = Assert.Single(scene.World.Each<BomberIceBridgeState>());
        AssertBound(scene, bridge);
        Assert.Equal(scene.World.Single<BomberMatchState>().MatchId.Value, bridge.MatchId.Value);
        Assert.True(bridge.ResourceGeneration.Value > 0);
        Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        return bridge;
    }

    private static BomberIceBridgeState FreezeAndAccept(BomberTerrainProductionTests.Scene scene)
    {
        _ = Blast(scene, (int)BomberBombKind.Freeze);
        BomberIceBridgeState bridge = AwaitNativeBridge(scene);
        ulong submitted = scene.World.Single<BomberWorldRuntime>().PendingVoxelSubmittedTicks[0];
        _ = Original(scene, scene.Adapter);
        scene.TickControlled();
        AssertAcceptedBridge(scene, bridge, submitted);
        return bridge;
    }

    private static void AssertAcceptedBridge(BomberTerrainProductionTests.Scene scene, BomberIceBridgeState bridge, ulong submitted)
    {
        AssertBound(scene, bridge);
        Assert.Equal(submitted, bridge.AppliedTick.Value);
        Assert.Equal(checked(submitted + Ticks.FromMilliseconds(8000, BomberConfigBinding.For(scene.World).Game.TickRateHz)), bridge.ExpiresAtTick.Value);
    }

    private static void AwaitWater(BomberTerrainProductionTests.Scene scene)
    {
        ulong latest = checked(scene.World.Tick + Ticks.FromMilliseconds(8000, BomberConfigBinding.For(scene.World).Game.TickRateHz) + 8);
        while (scene.World.Tick <= latest && GroundBlock(scene) != Water) scene.TickControlled();
        Assert.Equal(Water, GroundBlock(scene));
        Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
    }

    private static JsonElement Debt(BomberTerrainProductionTests.Scene scene, BomberIceBridgeState bridge)
    {
        string encoded = scene.World.Single<BomberWorldRuntime>().IceBridgePromises.Value;
        Assert.InRange(Encoding.UTF8.GetByteCount(encoded), 1, 65536);
        using var document = JsonDocument.Parse(encoded);
        var rows = document.RootElement.EnumerateArray().ToArray();
        Assert.InRange(rows.Length, 1, 60);
        JsonElement row = Assert.Single(rows, r => r.GetProperty("FreezeToken").GetString() == bridge.FreezeToken.Value);
        Assert.Equal(bridge.Entity.ToHex(), row.GetProperty("Bridge").GetString());
        Assert.Equal(bridge.ResourceGeneration.Value, row.GetProperty("Generation").GetUInt64());
        Assert.Equal(bridge.MatchId.Value, row.GetProperty("Match").GetUInt64());
        return row.Clone();
    }

    private static VoxelResultCheckpoint Original(BomberTerrainProductionTests.Scene scene, HostVoxelWorldAdapter adapter)
    {
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        VoxelResultCheckpoint checkpoint = adapter.CaptureResultCheckpoint();
        var result = Assert.Single(checkpoint.Results, r => r.TransactionId == runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(0, result.Outcome.Status);
        Assert.Equal(VoxelTxnState.Applied, result.Outcome.State);
        Assert.Equal(VoxelCommitDisposition.Original, result.Outcome.Disposition);
        Assert.True(result.Outcome.TokenConsumed);
        Assert.False(result.Outcome.Receipt.OriginalReceiptBytes.IsEmpty);
        var section = Assert.Single(result.Outcome.Receipt.Sections!);
        Assert.Equal(runtime.PendingSections[0], section.SectionKey);
        Assert.True(section.UpToSectionRevision > runtime.PendingExpectedRevisions[0]);
        return checkpoint;
    }

    private static BomberBombState Place(BomberTerrainProductionTests.Scene scene, int slot, bool remote, int x, int z)
    {
        NetEntityId life = scene.Lives[slot];
        var skill = scene.World.Get<BomberSkillState>(life);
        skill.BombSkillId.Value = remote ? BomberConfigBinding.For(scene.World).Tables.Skills.Rows.Single(s => s.Slot == "Bomb" && s.BombKindCode == 7 && !s.IsCombo).Id : 0;
        skill.BombSkillLevel.Value = remote ? 1 : 0;
        Position(scene.World, life, x, z);
        var owner = scene.World.Get<AbilityComponent>(life);
        Assert.True(PlaceBombAbility.CanPlace(owner, out string? reason), reason);
        var admitted = owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        Assert.True(admitted.Succeeded, admitted.FailureCode);
        scene.TickControlled();
        var player = scene.World.Get<BomberPlayerState>(life);
        var bomb = Assert.Single(scene.World.Each<BomberBombState>(), b => b.SourceLife.Value == life && b.Owner.Value == player.Participant.Value &&
            scene.World.Get<LogicTransform>(b.Entity).LocalPosition == new Vector3(x + .5f, 1.5f, z + .5f));
        Assert.Equal(remote ? 7 : 0, bomb.BombKind.Value);
        Assert.Equal(player.LifeGeneration.Value, bomb.SourceLifeGeneration.Value);
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        return bomb;
    }

    private static void AssertAllFuse(BomberTerrainProductionTests.Scene scene, BomberBombState[] bombs)
    {
        foreach (var bomb in bombs)
        {
            Assert.True(scene.World.IsLive(bomb.Entity));
            Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
            Assert.True(bomb.FuseEndTick.Value > scene.World.Tick);
            Assert.Equal(new Vector3(X + .5f, 1.5f, Z + .5f), scene.World.Get<LogicTransform>(bomb.Entity).LocalPosition);
        }
    }

    private readonly record struct BombIdentity(NetEntityId Entity, NetEntityId SourceLife, ulong SourceLifeGeneration, NetEntityId Owner);
    private static BombIdentity CaptureIdentity(BomberBombState bomb) =>
        new(bomb.Entity, bomb.SourceLife.Value, bomb.SourceLifeGeneration.Value, bomb.Owner.Value);

    private static void AssertOneExtinguishment(BomberTerrainProductionTests.Scene scene, BombIdentity bomb)
    {
        var occurrence = Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "bomb_extinguished"), e => e.GetProperty("entityId").GetString() == bomb.Entity.ToHex());
        Assert.Equal(bomb.SourceLife.ToHex(), occurrence.GetProperty("lifeId").GetString());
        Assert.Equal(bomb.Owner.ToHex(), occurrence.GetProperty("participantId").GetString());
        Assert.Equal(bomb.SourceLifeGeneration.ToString(System.Globalization.CultureInfo.InvariantCulture), occurrence.GetProperty("lifeGeneration").GetString());
    }

    private static void AssertBound(BomberTerrainProductionTests.Scene scene, BomberIceBridgeState bridge)
    {
        Assert.Equal(Ice, GroundBlock(scene));
        Assert.True(scene.World.IsLive(bridge.Entity));
        Assert.True(scene.World.TypeOf(bridge.Entity).Is<BomberIceBridgeEntity>());
        var at = Address(scene);
        Assert.Equal(bridge.Entity.ToHex(), scene.Adapter.BindingGet(at.Section, at.Offset));
    }

    private static void AssertRetired(BomberTerrainProductionTests.Scene scene, NetEntityId bridge)
    {
        Assert.Equal(Water, GroundBlock(scene));
        var at = Address(scene);
        Assert.Null(scene.Adapter.BindingGet(at.Section, at.Offset));
        Assert.False(scene.World.IsLive(bridge));
    }

    private static AdapterBinding Withhold(BomberTerrainProductionTests.Scene scene) => BindCandidate(scene, null);
    private static void DeliverAndTick(BomberTerrainProductionTests.Scene scene, VoxelResultCheckpoint original)
    {
        using var binding = BindCandidate(scene, original);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
    }

    private static AdapterBinding BindCandidate(BomberTerrainProductionTests.Scene scene, VoxelResultCheckpoint? original)
    {
        var candidate = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        if (original is not null) candidate.RestoreResultCheckpoint(original);
        candidate.SetBindingPolicy(scene.Adapter.BindingPolicy);
        IDisposable binding = VoxelGameplayBinding.Bind(scene.Manager, candidate);
        scene.Manager.BindVoxelTick(candidate.PrepareVoxel, candidate.CommitVoxel);
        return new AdapterBinding(scene, binding);
    }

    private static (ulong Section, int Offset) Address(BomberTerrainProductionTests.Scene scene) =>
        BomberTerrainTransactions.Address(BomberConfigBinding.For(scene.World).Map, X, BomberConfigBinding.For(scene.World).Map.GroundLayer, Z);
    private static uint GroundBlock(BomberTerrainProductionTests.Scene scene) =>
        scene.Native.ReadCell(new VoxelWorldCoordinate(X, checked((byte)BomberConfigBinding.For(scene.World).Map.GroundLayer), Z)).BlockId;
    private static ulong GroundRevision(BomberTerrainProductionTests.Scene scene) =>
        scene.Native.ReadCell(new VoxelWorldCoordinate(X, checked((byte)BomberConfigBinding.For(scene.World).Map.GroundLayer), Z)).SectionRevision;
    private static long Available(BomberTerrainProductionTests.Scene scene, NetEntityId life) =>
        scene.World.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.AvailableBombs);
    private static void Position(World world, NetEntityId entity, int x, int z) =>
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(entity), new Vector3(x + .5f, 1.5f, z + .5f));

    private sealed class AdapterBinding(BomberTerrainProductionTests.Scene scene, IDisposable binding) : IDisposable
    {
        public void Dispose()
        {
            binding.Dispose();
            scene.Manager.BindVoxelTick(scene.Adapter.PrepareVoxel, scene.Adapter.CommitVoxel);
        }
    }

    private sealed class Fixture : IDisposable
    {
        // Same private, budgeted Remote capability as existing real Remote tests.
        // No M2 map, ice enabled flag, maxima or formal producer guard is changed.
        private readonly BomberObjectBudgetTests.AuthoredFixture authored;
        internal BomberTerrainProductionTests.Scene Scene { get; }

        internal Fixture(bool dropAllCapacity = false)
        {
            // Only the old-Life isolation case opts into the existing supported full-loss profile value.
            authored = dropAllCapacity
                ? new BomberObjectBudgetTests.AuthoredFixture(("bomb_kinds", "Remote", "enabled", "true"),
                    ("drops", "default", "death_drop_permille", "1000"))
                : new BomberObjectBudgetTests.AuthoredFixture(("bomb_kinds", "Remote", "enabled", "true"));
            Scene = new BomberTerrainProductionTests.Scene(0, configDirectory: authored.Compile(), controlled: true);
            for (int z = 3; z <= 15; z++)
                for (int x = 3; x <= 15; x++) Scene.Write(x, 1, z, 0);
            Scene.Write(X, 0, Z, Water);
            Assert.Equal(Water, GroundBlock(Scene));
            Assert.Equal("LegacyPillars", BomberConfigBinding.For(Scene.World).Map.LayoutKind);
            Assert.False(BomberConfigBinding.For(Scene.World).Tables.Blocks.Rows.Single(b => b.Name == "ice").Enabled);
            foreach (NetEntityId life in Scene.Lives) Position(Scene.World, life, 15, 15);
        }

        public void Dispose() { Scene.Dispose(); authored.Dispose(); }
    }
}
