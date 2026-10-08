using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberHfsmFoundationTests
{
    [Fact]
    public void SevenGraphsCompileAndStartThroughTheWorldNativeContext()
    {
        using WorldManager manager = BomberTestWorld.Start();
        foreach (BomberHfsmKind kind in Enum.GetValues<BomberHfsmKind>())
        {
            using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(manager.World, kind);
            Assert.NotEqual(0UL, definition.Fingerprint);
            Assert.True(definition.MaxPath >= 1);
            Assert.True(definition.StateCount >= 2);
            HfsmPlan start = definition.Start((ulong)kind, 1);
            Assert.Equal(HfsmOutcome.Started, start.Outcome);
            Assert.NotNull(start.Next);
            Assert.InRange(start.Next.ActivePath.Count, 1, (int)definition.MaxPath);
            Assert.Equal(1UL, start.Next.Epoch);
            Assert.All(start.Next.ActivePath, entry => Assert.NotEqual(0UL, entry.ActivationSeq));
        }
    }

    [Fact]
    public void GeneratedWorldSnapshotRestoresBothMachinesAndNativeCanContinue()
    {
        using WorldManager manager = BomberTestWorld.Start();
        NetEntityId worldId = manager.World.Single<BomberMatchState>().Entity;
        BomberHfsmState match = manager.World.Get<BomberHfsmState>(worldId);
        BomberFinalCircleHfsmState circle = manager.World.Get<BomberFinalCircleHfsmState>(worldId);
        using NativeHfsmDefinition matchDefinition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        using NativeHfsmDefinition circleDefinition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.FinalCircle);
        Assert.True(match.StorePlan(matchDefinition.Start(101, 1), matchDefinition, BomberHfsmKind.Match, 101));
        Assert.True(circle.StorePlan(circleDefinition.Start(102, 1), circleDefinition, 102));
        HfsmSnapshot originalMatch = match.ReadSnapshot(matchDefinition, BomberHfsmKind.Match, 101);
        HfsmSnapshot originalCircle = circle.ReadSnapshot(circleDefinition, 102);
        byte[] bytes = manager.CaptureSnapshot();

        using WorldManager restored = BomberTestWorld.Restore(bytes, GeneratedRegistry.Instance,
            config: Config.BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();
        using NativeHfsmDefinition restoredMatch = BomberHfsmDefinitions.Compile(restored.World, BomberHfsmKind.Match);
        using NativeHfsmDefinition restoredCircle = BomberHfsmDefinitions.Compile(restored.World, BomberHfsmKind.FinalCircle);
        AssertSnapshot(originalMatch, restored.World.Get<BomberHfsmState>(worldId).ReadSnapshot(restoredMatch, BomberHfsmKind.Match, 101));
        AssertSnapshot(originalCircle, restored.World.Get<BomberFinalCircleHfsmState>(worldId).ReadSnapshot(restoredCircle, 102));
        HfsmPlan uninterrupted = matchDefinition.Send(originalMatch, BomberHfsmDefinitions.EventId.WorldReady);
        HfsmPlan resumed = restoredMatch.Send(restored.World.Get<BomberHfsmState>(worldId).ReadSnapshot(restoredMatch, BomberHfsmKind.Match, 101),
            BomberHfsmDefinitions.EventId.WorldReady);
        Assert.Equal(uninterrupted.Outcome, resumed.Outcome);
        Assert.Equal(uninterrupted.Actions.Select(a => a.Action), resumed.Actions.Select(a => a.Action));
        AssertSnapshot(uninterrupted.Next!, resumed.Next!);
    }

    [Fact]
    public void CanonicalNotStartedSnapshotSurvivesGeneratedPersistenceAndCanThenStart()
    {
        using WorldManager manager = BomberTestWorld.Start();
        NetEntityId worldId = manager.World.Single<BomberMatchState>().Entity;
        BomberHfsmState state = manager.World.Get<BomberHfsmState>(worldId);
        using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        HfsmSnapshot preStart = HfsmSnapshot.NotStarted(definition.Fingerprint, 211);
        state.StoreSnapshot(preStart, definition, BomberHfsmKind.Match, 211);
        AssertSnapshot(preStart, state.ReadSnapshot(definition, BomberHfsmKind.Match, 211));
        Assert.Throws<InvalidOperationException>(() => state.StoreSnapshot(preStart with { Epoch = 1 },
            definition, BomberHfsmKind.Match, 211));
        Assert.Throws<InvalidOperationException>(() => state.StoreSnapshot(preStart with { StepSeq = 1 },
            definition, BomberHfsmKind.Match, 211));
        Assert.Throws<InvalidOperationException>(() => state.StoreSnapshot(preStart with { NextActivationSeq = 2 },
            definition, BomberHfsmKind.Match, 211));

        using WorldManager restored = BomberTestWorld.Restore(manager.CaptureSnapshot(), GeneratedRegistry.Instance,
            config: Config.BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();
        using NativeHfsmDefinition restoredDefinition = BomberHfsmDefinitions.Compile(restored.World, BomberHfsmKind.Match);
        BomberHfsmState restoredState = restored.World.Get<BomberHfsmState>(worldId);
        AssertSnapshot(preStart, restoredState.ReadSnapshot(restoredDefinition, BomberHfsmKind.Match, 211));
        HfsmPlan started = restoredDefinition.Start(211, 1);
        Assert.True(restoredState.StorePlan(started, restoredDefinition, BomberHfsmKind.Match, 211));
        Assert.Equal(HfsmLifecycle.Running, restoredState.ReadSnapshot(restoredDefinition, BomberHfsmKind.Match, 211).Lifecycle);
    }

    [Fact]
    public void FullOwnerAndKindSchemaChecksRejectCorruptFields()
    {
        using WorldManager manager = BomberTestWorld.Start(instance: 501);
        NetEntityId owner = manager.World.Single<BomberMatchState>().Entity;
        BomberHfsmState state = manager.World.Get<BomberHfsmState>(owner);
        using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        state.StorePlan(definition.Start(421, 1), definition, BomberHfsmKind.Match, 421);
        NetEntityId foreignWorldSameCounter = new(owner.InstanceId + 1, owner.Counter);
        Assert.NotEqual(owner, foreignWorldSameCounter);
        state.OwnerEntity.Value = foreignWorldSameCounter;
        Assert.Throws<InvalidOperationException>(() => state.ReadSnapshot(definition, BomberHfsmKind.Match, 421));
        state.OwnerEntity.Value = owner;
        state.MachineKind.Value = (int)BomberHfsmKind.Chest;
        Assert.Throws<InvalidOperationException>(() => state.ReadSnapshot(definition, BomberHfsmKind.Match, 421));
        state.MachineKind.Value = (int)BomberHfsmKind.Match;
        state.SnapshotSchemaVersion.Value = state.SnapshotSchemaVersion.Value + 1;
        Assert.Throws<InvalidOperationException>(() => state.ReadSnapshot(definition, BomberHfsmKind.Match, 421));
    }

    [Fact]
    public void HighBitUlongIdentityAndCountersSurviveGeneratedWorldSnapshot()
    {
        using WorldManager manager = BomberTestWorld.Start();
        NetEntityId owner = manager.World.Single<BomberMatchState>().Entity;
        BomberHfsmState state = manager.World.Get<BomberHfsmState>(owner);
        using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        const ulong key = ulong.MaxValue - 8;
        HfsmSnapshot started = definition.Start(key, 1).Next!;
        HfsmSnapshot high = started with
        {
            Epoch = ulong.MaxValue - 7,
            StepSeq = ulong.MaxValue - 6,
            NextActivationSeq = ulong.MaxValue - 5,
            ActivePath = started.ActivePath.Select(entry => entry with { ActivationSeq = ulong.MaxValue - 6 }).ToArray(),
        };
        state.StoreSnapshot(high, definition, BomberHfsmKind.Match, key);
        using WorldManager restored = BomberTestWorld.Restore(manager.CaptureSnapshot(), GeneratedRegistry.Instance,
            config: Config.BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();
        using NativeHfsmDefinition restoredDefinition = BomberHfsmDefinitions.Compile(restored.World, BomberHfsmKind.Match);
        AssertSnapshot(high, restored.World.Get<BomberHfsmState>(owner).ReadSnapshot(restoredDefinition, BomberHfsmKind.Match, key));
    }

    [Fact]
    public void RejectedNativePlanAndInvalidSnapshotNeverOverwritePersistedFields()
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberHfsmState state = manager.World.Get<BomberHfsmState>(manager.World.Single<BomberMatchState>().Entity);
        using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        state.StorePlan(definition.Start(301, 1), definition, BomberHfsmKind.Match, 301);
        byte[] before = manager.CaptureSnapshot();
        HfsmSnapshot current = state.ReadSnapshot(definition, BomberHfsmKind.Match, 301);
        HfsmPlan rejected = definition.Send(current, 999999);
        Assert.Equal(HfsmOutcome.Rejected, rejected.Outcome);
        Assert.False(state.StorePlan(rejected, definition, BomberHfsmKind.Match, 301));
        Assert.Equal(before, manager.CaptureSnapshot());
        Assert.Throws<InvalidOperationException>(() => state.StoreSnapshot(current with { Fingerprint = current.Fingerprint ^ 1 },
            definition, BomberHfsmKind.Match, 301));
        Assert.Throws<InvalidOperationException>(() => state.ReadSnapshot(definition, BomberHfsmKind.Match, 302));
        var tooDeep = current with { ActivePath = Enumerable.Repeat(current.ActivePath[0], checked((int)definition.MaxPath + 1)).ToArray() };
        Assert.Throws<InvalidOperationException>(() => state.StoreSnapshot(tooDeep, definition, BomberHfsmKind.Match, 301));
        Assert.Throws<InvalidOperationException>(() => state.StoreSnapshot(current with { Lifecycle = (HfsmLifecycle)99 },
            definition, BomberHfsmKind.Match, 301));
        Assert.Equal(before, manager.CaptureSnapshot());
    }

    [Fact]
    public void MismatchedPersistedPairsFailBeforeNativeEvaluation()
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberHfsmState state = manager.World.Get<BomberHfsmState>(manager.World.Single<BomberMatchState>().Entity);
        using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        state.StorePlan(definition.Start(307, 1), definition, BomberHfsmKind.Match, 307);
        state.ActiveActivations.Add(999);
        Assert.Throws<InvalidOperationException>(() => state.ReadSnapshot(definition, BomberHfsmKind.Match, 307));
    }

    [Fact]
    public void GuardMissingAndStaleScopedDeliveryAreNativeRejections()
    {
        using WorldManager manager = BomberTestWorld.Start();
        using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Bomb);
        HfsmSnapshot fuse = definition.Start(404, 1).Next!;
        HfsmPlan danger = definition.Send(fuse, BomberHfsmDefinitions.EventId.FuseElapsed);
        Assert.Equal(HfsmOutcome.Transitioned, danger.Outcome);
        HfsmPlan missing = definition.Send(danger.Next!, BomberHfsmDefinitions.EventId.DangerElapsed);
        Assert.Equal(HfsmOutcome.Rejected, missing.Outcome);
        Assert.Equal(HfsmRejectReason.GuardMissing, missing.RejectReason);
        Assert.Null(missing.Next);
        var oldScope = new HfsmDeliveryScope(fuse.ActivePath[^1].State, fuse.ActivePath[^1].ActivationSeq, fuse.Epoch);
        HfsmPlan stale = definition.Send(danger.Next!, BomberHfsmDefinitions.EventId.DangerElapsed,
            new Dictionary<uint, bool> { [BomberHfsmDefinitions.Guard.CanBurn] = true }, oldScope);
        Assert.Equal(HfsmOutcome.Rejected, stale.Outcome);
        Assert.Equal(HfsmRejectReason.StaleDelivery, stale.RejectReason);
    }

    private static void AssertSnapshot(HfsmSnapshot expected, HfsmSnapshot actual)
    {
        Assert.Equal(expected.Fingerprint, actual.Fingerprint);
        Assert.Equal(expected.MachineKey, actual.MachineKey);
        Assert.Equal(expected.Epoch, actual.Epoch);
        Assert.Equal(expected.StepSeq, actual.StepSeq);
        Assert.Equal(expected.NextActivationSeq, actual.NextActivationSeq);
        Assert.Equal(expected.Lifecycle, actual.Lifecycle);
        Assert.Equal(expected.ActivePath, actual.ActivePath);
    }
}
