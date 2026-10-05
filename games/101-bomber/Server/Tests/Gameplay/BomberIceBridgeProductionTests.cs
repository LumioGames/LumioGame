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
public sealed class BomberIceBridgeProductionTests
{
    private const int X = 6, Z = 5;
    private const uint Water = 1027u << 8, Ice = 1031u << 8;

    [Fact]
    public void ActualFreezeContactOwnsNativeBindingSourceDebtAndTheOriginalEightSecondClock()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        var source = Blast(scene, (int)BomberBombKind.Freeze);
        BomberIceBridgeState bridge = AwaitNativeBridge(scene);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        ulong submitted = runtime.PendingVoxelSubmittedTicks[0];
        VoxelResultCheckpoint original = Original(scene, scene.Adapter);
        Assert.True(scene.World.IsLive(bridge.Entity));
        Assert.Equal(0UL, bridge.AppliedTick.Value);
        Assert.Equal(0UL, bridge.ExpiresAtTick.Value);
        Assert.False(string.IsNullOrWhiteSpace(bridge.FreezeToken.Value));
        Assert.InRange(Encoding.UTF8.GetByteCount(bridge.FreezeToken.Value), 1, 128);
        JsonElement debt = Debt(scene, bridge);
        Assert.Equal(source.Entity.ToHex(), debt.GetProperty("SourceBomb").GetString());
        Assert.Equal(source.SourceLife.Value.ToHex(), debt.GetProperty("SourceLife").GetString());
        Assert.Equal(source.SourceLifeGeneration.Value, debt.GetProperty("SourceLifeGeneration").GetUInt64());
        Assert.Equal(source.Owner.Value.ToHex(), debt.GetProperty("SourceParticipant").GetString());
        Assert.Equal(source.ChainId.Value, debt.GetProperty("ChainId").GetUInt64());
        Assert.Equal(runtime.PendingVoxelTransactionIds[0], debt.GetProperty("TransactionId").GetString());
        Assert.True(debt.GetProperty("MutationSubmitted").GetBoolean());
        byte[] snapshot = scene.Manager.CaptureSnapshot();
        Assert.True(snapshot.AsSpan().IndexOf(Encoding.UTF8.GetBytes(bridge.FreezeToken.Value)) >= 0);
        scene.TickControlled();
        AssertAcceptedBridge(scene, bridge, submitted);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(bridge.ExpiresAtTick.Value, Debt(scene, bridge).GetProperty("ExpiresAtTick").GetUInt64());
        Assert.Equal(VoxelCommitDisposition.Original, Assert.Single(original.Results).Outcome.Disposition);
    }

    [Fact]
    public void ASecondRealFreezeKeepsTheFirstBindingGenerationTokenAndDeadline()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        BomberIceBridgeState bridge = FreezeAndAccept(scene);
        var identity = (bridge.Entity, bridge.ResourceGeneration.Value, bridge.FreezeToken.Value,
            bridge.AppliedTick.Value, bridge.ExpiresAtTick.Value);
        ulong revision = GroundRevision(scene);
        _ = Blast(scene, (int)BomberBombKind.Freeze);
        for (int tick = 0; tick < 6; tick++) scene.TickControlled();
        Assert.Equal(identity, (bridge.Entity, bridge.ResourceGeneration.Value, bridge.FreezeToken.Value,
            bridge.AppliedTick.Value, bridge.ExpiresAtTick.Value));
        Assert.Equal(revision, GroundRevision(scene));
        AssertBound(scene, bridge);
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
        _ = Debt(scene, bridge);
    }

    [Theory]
    [InlineData((int)BomberBombKind.Standard)]
    [InlineData((int)BomberBombKind.Freeze)]
    public void OrdinaryDangerContactsDoNotMeltARealBridge(int kind)
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        BomberIceBridgeState bridge = FreezeAndAccept(scene);
        ulong deadline = bridge.ExpiresAtTick.Value;
        _ = Blast(scene, kind);
        for (int tick = 0; tick < 6; tick++) scene.TickControlled();
        AssertBound(scene, bridge);
        Assert.Equal(deadline, bridge.ExpiresAtTick.Value);
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
    }

    [Fact]
    public void ActualFireMeltsWithOneAtomicWaterAndBindingClearButRetiresOnlyAfterOriginal()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        BomberIceBridgeState bridge = FreezeAndAccept(scene);
        NetEntityId bridgeId = bridge.Entity;
        _ = Blast(scene, (int)BomberBombKind.ReservedFire);
        AwaitWater(scene);
        var at = Address(scene);
        Assert.Null(scene.Adapter.BindingGet(at.Section, at.Offset));
        Assert.True(scene.World.IsLive(bridge.Entity));
        VoxelResultCheckpoint original = Original(scene, scene.Adapter);
        Assert.Empty(original.AppliedDigs);
        Assert.Empty(original.DestroyedEntities);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(Water, runtime.PendingNewBlocks[0]);
        Assert.Equal(Ice, runtime.PendingOldBlocks[0]);
        Assert.Equal(bridge.Entity, runtime.PendingChests[0]);
        _ = Debt(scene, bridge);
        for (int tick = 0; tick < 3; tick++) scene.TickControlled();
        AssertRetired(scene, bridgeId);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void SameTickFireContactWinsBeforeAnyWaterFreezeSubmission(bool freezeFirst)
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        if (freezeFirst)
        {
            _ = Blast(scene, (int)BomberBombKind.Freeze, 5);
            _ = Blast(scene, (int)BomberBombKind.ReservedFire, 7);
        }
        else
        {
            _ = Blast(scene, (int)BomberBombKind.ReservedFire, 7);
            _ = Blast(scene, (int)BomberBombKind.Freeze, 5);
        }
        for (int tick = 0; tick < 8; tick++) scene.TickControlled();
        Assert.Equal(Water, GroundBlock(scene));
        Assert.Empty(scene.World.Each<BomberIceBridgeState>());
        Assert.Equal("", scene.World.Single<BomberWorldRuntime>().IceBridgePromises.Value);
        Assert.Equal(0, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
    }

    [Fact]
    public void ExpiryOriginalExtinguishesEveryStationaryRemoteAndFrenzyFuseExactlyOnce()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        BomberIceBridgeState bridge = FreezeAndAccept(scene);
        NetEntityId bridgeId = bridge.Entity;
        while (scene.World.Tick < bridge.ExpiresAtTick.Value - 16) scene.TickControlled();
        BomberBombState ordinary = Place(scene, 0, remote: false, 3, 3);
        BomberBombState remote = Place(scene, 1, remote: true, 13, 3);
        NetEntityId frenzyLife = scene.Lives[2];
        BomberGrowthHealthTests.Take(scene.Manager, frenzyLife, 7);
        var frenzyPlayer = scene.World.Get<BomberPlayerState>(frenzyLife);
        var frenzyParticipant = scene.World.Get<BomberParticipantState>(frenzyPlayer.Participant.Value);
        Assert.True(BomberFrenzy.IsActive(scene.World, frenzyParticipant, frenzyLife));
        Assert.True(scene.World.Get<BomberHealthFacts>(frenzyLife).Ready[0]);
        Assert.Equal(1, scene.World.Get<BomberHealthFacts>(frenzyLife).Status[0]);
        long frenzyInventory = Available(scene, frenzyLife);
        BomberBombState frenzy = Place(scene, 2, remote: false, 13, 7);
        Assert.True(frenzy.Frenzy.Value);
        Assert.Equal(0, frenzy.BombKind.Value);
        Assert.Equal(frenzyInventory, Available(scene, frenzyLife));
        var bombs = new[] { ordinary, remote, frenzy };
        BombIdentity[] identities = bombs.Select(CaptureIdentity).ToArray();
        foreach (var bomb in bombs) Position(scene.World, bomb.Entity, X, Z);
        Assert.Equal(0L, Available(scene, ordinary.SourceLife.Value));
        Assert.Equal(0L, Available(scene, remote.SourceLife.Value));
        Assert.False(ordinary.CapacityReturned.Value);
        Assert.False(remote.CapacityReturned.Value);
        AwaitWater(scene);
        AssertAllFuse(scene, bombs);
        Assert.True(scene.World.IsLive(bridge.Entity));
        VoxelResultCheckpoint original = Original(scene, scene.Adapter);
        using (Withhold(scene))
        {
            for (int tick = 0; tick < 3; tick++) scene.TickControlled();
            AssertAllFuse(scene, bombs);
            Assert.Equal(0L, Available(scene, ordinary.SourceLife.Value));
            Assert.Equal(0L, Available(scene, remote.SourceLife.Value));
            Assert.Equal(frenzyInventory, Available(scene, frenzyLife));
            Assert.True(scene.World.IsLive(bridge.Entity));
            Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count);
            _ = Debt(scene, bridge);
        }
        DeliverAndTick(scene, original);
        AssertRetired(scene, bridgeId);
        foreach (BombIdentity bomb in identities)
        {
            Assert.False(scene.World.IsLive(bomb.Entity));
            AssertOneExtinguishment(scene, bomb);
        }
        Assert.Equal(1L, Available(scene, identities[0].SourceLife));
        Assert.Equal(1L, Available(scene, identities[1].SourceLife));
        Assert.Equal(frenzyInventory, Available(scene, frenzyLife));
        Assert.Equal(0, frenzyParticipant.FrenzyBombPromises.Count);
        Assert.DoesNotContain(scene.World.Each<BomberBombState>(), b => b.Frenzy.Value && b.Owner.Value == frenzyParticipant.Entity);
        DeliverAndTick(scene, original);
        foreach (BombIdentity bomb in identities) AssertOneExtinguishment(scene, bomb);
        Assert.Equal(1L, Available(scene, identities[0].SourceLife));
        Assert.Equal(1L, Available(scene, identities[1].SourceLife));
        Assert.Equal(frenzyInventory, Available(scene, frenzyLife));
        Assert.Equal(0, frenzyParticipant.FrenzyBombPromises.Count);
    }

    [Fact]
    public void ARealOldLifeRemoteCannotReturnItsMeltCreditToAnActuallyLandedSuccessor()
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
        NetEntityId oldLife = remote.SourceLife.Value;
        ulong oldGeneration = remote.SourceLifeGeneration.Value;
        var participant = scene.World.Get<BomberParticipantState>(remote.Owner.Value);
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
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
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

    [Fact]
    public void RetainedOldWaterOriginalCannotMeltOrRetireTheReplacementGeneration()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        BomberIceBridgeState first = FreezeAndAccept(scene);
        var firstIdentity = (Entity: first.Entity, Generation: first.ResourceGeneration.Value, Token: first.FreezeToken.Value);
        BomberBombState fire = Blast(scene, (int)BomberBombKind.ReservedFire);
        AwaitWater(scene);
        NetEntityId fireId = fire.Entity;
        Assert.True(scene.World.IsLive(fireId));
        VoxelResultCheckpoint oldOriginal = Original(scene, scene.Adapter);
        scene.TickControlled(); scene.TickControlled(); scene.TickControlled();
        AssertRetired(scene, firstIdentity.Entity);
        IBomberConfig config = BomberConfigBinding.For(scene.World);
        ulong latestFireRetirement = checked(scene.World.Tick + Ticks.FromMilliseconds(config.Bomb.DangerMs, config.Game.TickRateHz)
            + Ticks.FromMilliseconds(config.Tables.SkillLevels.Rows.Single(level => level.Name == "fireBomb_lv1").DurationMs, config.Game.TickRateHz) + 8);
        while (scene.World.IsLive(fireId) && scene.World.Tick <= latestFireRetirement) scene.TickControlled();
        Assert.False(scene.World.IsLive(fireId));
        BomberIceBridgeState replacement = FreezeAndAccept(scene);
        Assert.NotEqual(firstIdentity.Entity, replacement.Entity);
        Assert.True(replacement.ResourceGeneration.Value > firstIdentity.Generation);
        Assert.NotEqual(firstIdentity.Token, replacement.FreezeToken.Value);
        var identity = (replacement.Entity, replacement.ResourceGeneration.Value, replacement.AppliedTick.Value, replacement.ExpiresAtTick.Value);
        DeliverAndTick(scene, oldOriginal);
        AssertBound(scene, replacement);
        Assert.Equal(identity, (replacement.Entity, replacement.ResourceGeneration.Value, replacement.AppliedTick.Value, replacement.ExpiresAtTick.Value));
        _ = Debt(scene, replacement);
    }

    [Fact]
    public void ARealStandardExplosionCoversWaterWithoutProducingAnIceIdentity()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        _ = Blast(scene, (int)BomberBombKind.Standard);
        for (int tick = 0; tick < 8; tick++) scene.TickControlled();
        Assert.Equal(Water, GroundBlock(scene));
        Assert.Empty(scene.World.Each<BomberIceBridgeState>());
        Assert.Equal("", scene.World.Single<BomberWorldRuntime>().IceBridgePromises.Value);
    }

    [Fact]
    public void WithheldWaterOriginalKeepsTheActualStationaryFusePastItsUnchangedDeadline()
    {
        using var fixture = new Fixture();
        var scene = fixture.Scene;
        IBomberConfig config = BomberConfigBinding.For(scene.World);
        BomberIceBridgeState bridge = FreezeAndAccept(scene);
        NetEntityId bridgeId = bridge.Entity;
        var bridgeIdentity = (bridge.ResourceGeneration.Value, bridge.FreezeToken.Value,
            bridge.AppliedTick.Value, bridge.ExpiresAtTick.Value);
        while (scene.World.Tick < bridge.ExpiresAtTick.Value - 16) scene.TickControlled();

        // Real public placement on dry ground; only the already published bomb's
        // geometry is moved to the bridge, as in the existing all-Fuse fixture.
        BomberBombState bomb = Place(scene, 0, remote: false, 3, 3);
        scene.TickControlled(); // The published row reaches its real Native HFSM phase.
        BombIdentity identity = CaptureIdentity(bomb);
        ulong placed = bomb.PlacedAtTick.Value, fuseEnd = bomb.FuseEndTick.Value, chain = bomb.ChainId.Value;
        Assert.False(bomb.Frenzy.Value);
        Assert.Equal((int)BomberBombKind.Standard, bomb.BombKind.Value);
        Assert.Equal(checked(placed + Ticks.FromMilliseconds(config.Bomb.FuseMs, config.Game.TickRateHz)), fuseEnd);
        Assert.True(chain > 0);
        Position(scene.World, bomb.Entity, X, Z);
        Assert.Equal(0L, Available(scene, identity.SourceLife));
        using var definition = BomberHfsmDefinitions.Compile(scene.World, BomberHfsmKind.Bomb);
        var machine = scene.World.Get<BomberHfsmState>(identity.Entity);
        var nativeWitness = (machine.MachineKey.Value, machine.Epoch.Value, machine.StepSeq.Value);
        Assert.Equal(BomberHfsmDefinitions.State.BombStationary,
            machine.ReadSnapshot(definition, BomberHfsmKind.Bomb, machine.MachineKey.Value).ActivePath[^1].State);

        AwaitWater(scene);
        AssertAllFuse(scene, new[] { bomb });
        Assert.True(fuseEnd > scene.World.Tick);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        ulong submitted = runtime.PendingVoxelSubmittedTicks[0];
        Assert.Equal(Ice, runtime.PendingOldBlocks[0]);
        Assert.Equal(Water, runtime.PendingNewBlocks[0]);
        Assert.Equal(bridgeId, runtime.PendingChests[0]);
        VoxelResultCheckpoint original = Original(scene, scene.Adapter);
        Assert.Equal(transaction, Assert.Single(original.Results).TransactionId);
        Assert.Empty(original.AppliedDigs);
        Assert.Empty(original.DestroyedEntities);
        ulong waterRevision = GroundRevision(scene);
        Assert.True(waterRevision > runtime.PendingExpectedRevisions[0]);
        ulong afterDeadline = checked(fuseEnd + 2);

        void AssertHeldWithoutSettlement()
        {
            Assert.True(scene.World.IsLive(identity.Entity), "A committed water cut cannot lose its held Fuse before Original delivery.");
            var current = scene.World.Get<BomberBombState>(identity.Entity);
            Assert.Equal(identity, CaptureIdentity(current));
            Assert.Equal(placed, current.PlacedAtTick.Value);
            Assert.Equal(fuseEnd, current.FuseEndTick.Value);
            Assert.Equal(chain, current.ChainId.Value);
            Assert.Equal((int)BomberBombPhase.Fuse, current.Phase.Value);
            Assert.Equal(0UL, current.ExplodedAtTick.Value);
            Assert.Equal(0UL, current.DangerUntilTick.Value);
            Assert.Equal(0UL, current.BurnUntilTick.Value);
            Assert.False(current.CapacityReturned.Value);
            Assert.Equal(new Vector3(X + .5f, 1.5f, Z + .5f), scene.World.Get<LogicTransform>(identity.Entity).LocalPosition);
            var currentMachine = scene.World.Get<BomberHfsmState>(identity.Entity);
            Assert.Equal(nativeWitness, (currentMachine.MachineKey.Value, currentMachine.Epoch.Value, currentMachine.StepSeq.Value));
            Assert.Equal(BomberHfsmDefinitions.State.BombStationary,
                currentMachine.ReadSnapshot(definition, BomberHfsmKind.Bomb, currentMachine.MachineKey.Value).ActivePath[^1].State);
            Assert.Equal(0L, Available(scene, identity.SourceLife));
            Assert.DoesNotContain(BomberEffectIntegrationTests.Events(scene.World, "bomb_exploded"),
                e => e.GetProperty("entityId").GetString() == identity.Entity.ToHex());
            Assert.DoesNotContain(BomberEffectIntegrationTests.Events(scene.World, "bomb_extinguished"),
                e => e.GetProperty("entityId").GetString() == identity.Entity.ToHex());
            Assert.Equal(Water, GroundBlock(scene));
            Assert.Equal(waterRevision, GroundRevision(scene));
            var at = Address(scene);
            Assert.Null(scene.Adapter.BindingGet(at.Section, at.Offset));
            Assert.True(scene.World.IsLive(bridgeId));
            Assert.Equal(bridgeIdentity, (bridge.ResourceGeneration.Value, bridge.FreezeToken.Value,
                bridge.AppliedTick.Value, bridge.ExpiresAtTick.Value));
            Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
            Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
            Assert.Equal(submitted, runtime.PendingVoxelSubmittedTicks[0]);
            JsonElement debt = Debt(scene, bridge);
            Assert.Equal(4, debt.GetProperty("Phase").GetInt32());
            Assert.Equal(transaction, debt.GetProperty("TransactionId").GetString());
            Assert.True(debt.GetProperty("MutationSubmitted").GetBoolean());
            Assert.Equal(submitted, debt.GetProperty("SubmittedTick").GetUInt64());
        }

        using (Withhold(scene))
        {
            HostVoxelWorldAdapter held = VoxelGameplayBinding.Resolve(scene.Manager)!;
            Assert.NotSame(scene.Adapter, held);
            Assert.Empty(held.CaptureResultCheckpoint().Results);
            AssertHeldWithoutSettlement();
            while (scene.World.Tick < afterDeadline)
            {
                scene.TickControlled();
                Assert.Empty(held.CaptureResultCheckpoint().Results);
                AssertHeldWithoutSettlement();
            }
            Assert.True(scene.World.Tick > fuseEnd);
        }

        // Deliver the preserved SDK Original, then its exact duplicate; no receipt
        // payload, phase, Fuse clock, inventory or successful bridge fact is authored.
        DeliverAndTick(scene, original);
        AssertRetired(scene, bridgeId);
        Assert.False(scene.World.IsLive(identity.Entity));
        AssertOneExtinguishment(scene, identity);
        Assert.Equal(1L, Available(scene, identity.SourceLife));
        Assert.DoesNotContain(BomberEffectIntegrationTests.Events(scene.World, "bomb_exploded"),
            e => e.GetProperty("entityId").GetString() == identity.Entity.ToHex());
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal("", runtime.IceBridgePromises.Value);
        DeliverAndTick(scene, original);
        AssertOneExtinguishment(scene, identity);
        Assert.Equal(1L, Available(scene, identity.SourceLife));
        AssertRetired(scene, bridgeId);
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
