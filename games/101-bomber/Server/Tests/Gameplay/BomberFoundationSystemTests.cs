using System;
using System.Linq;
using System.Threading;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFoundationSystemTests
{
    [Fact]
    public void RegisteredTickStartsBothNativeMachinesOnlyOnce()
    {
        using WorldManager manager = BomberTestWorld.Start();
        var foundation = Assert.Single(GeneratedRegistry.Instance.Systems, s => s.Id == "BomberFoundationSystem");
        Assert.Equal(TickPhase.ProcessorPlan, foundation.Phase);
        Assert.Contains("BomberFoundationSystem", Assert.Single(GeneratedRegistry.Instance.Systems, s => s.Id == "BombSystem").After);
        BomberHfsmState match = manager.World.Get<BomberHfsmState>(manager.World.Single<BomberWorldRuntime>().Entity);
        BomberFinalCircleHfsmState circle = manager.World.Single<BomberFinalCircleHfsmState>();
        Assert.False(match.SnapshotPresent.Value);
        manager.Tick();
        Assert.True(match.SnapshotPresent.Value);
        Assert.True(circle.SnapshotPresent.Value);
        Assert.Equal(new[] { BomberHfsmDefinitions.State.MatchWaiting }, Values(match.ActiveStates));
        Assert.Equal(new[] { BomberHfsmDefinitions.State.CircleInactive }, Values(circle.ActiveStates));
        Assert.Equal(1UL, match.MachineKey.Value);
        Assert.Equal(2UL, circle.MachineKey.Value);
        string before = Machines(manager);
        manager.Tick();
        manager.Tick();
        Assert.Equal(before, Machines(manager));
        Assert.Equal(2UL, manager.World.Single<BomberWorldRuntime>().NextHfsmMachineKey.Value);
    }

    [Fact]
    public void GeneratedRestoreKeepsExactSnapshotsAndAllocator()
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder participant = manager.World.Commands.Create<BomberParticipantEntity>();
        participant.Get<BomberParticipantState>().Slot.Value = 0;
        manager.Tick();
        manager.World.Single<BomberWorldRuntime>().SetParticipants(new[] { participant.AssignedId }, BomberConfigBinding.For(manager.World));
        using var definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        BomberHfsmState match = manager.World.Get<BomberHfsmState>(manager.World.Single<BomberWorldRuntime>().Entity);
        // A noninitial Native snapshot makes an accidental restart observable.
        var next = definition.Send(match.ReadSnapshot(definition, BomberHfsmKind.Match, match.MachineKey.Value),
            BomberHfsmDefinitions.EventId.WorldReady);
        Assert.True(match.StorePlan(next, definition, BomberHfsmKind.Match, match.MachineKey.Value));
        string before = Machines(manager);
        using WorldManager restored = Restore(manager);
        restored.Tick();
        restored.Tick();
        Assert.Equal(before, Machines(restored));
        Assert.Equal(2UL, restored.World.Single<BomberWorldRuntime>().NextHfsmMachineKey.Value);
        Assert.Equal(participant.AssignedId, restored.World.Single<BomberWorldRuntime>().ParticipantIds[0]);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void RestoredInvalidRosterFailsBeforeEitherMachineStarts(bool wrongSlot)
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberWorldRuntime runtime = manager.World.Single<BomberWorldRuntime>();
        if (wrongSlot)
        {
            EntityOrder participant = manager.World.Commands.Create<BomberParticipantEntity>();
            participant.Get<BomberParticipantState>().Slot.Value = 7;
            manager.Tick();
            runtime.ParticipantIds.Add(participant.AssignedId);
            manager.World.Get<BomberHfsmState>(manager.World.Single<BomberWorldRuntime>().Entity).SnapshotPresent.Value = false;
            manager.World.Single<BomberFinalCircleHfsmState>().SnapshotPresent.Value = false;
        }
        else runtime.ParticipantIds.Add(new NetEntityId(runtime.Entity.InstanceId, 987654));
        using WorldManager restored = Restore(manager);
        ulong keyBefore = restored.World.Single<BomberWorldRuntime>().NextHfsmMachineKey.Value;
        InvalidOperationException failure = Assert.Throws<InvalidOperationException>(() => restored.Tick());
        Assert.Contains(wrongSlot ? "not ordered by slot" : "is not live", failure.Message);
        Assert.False(restored.World.Get<BomberHfsmState>(restored.World.Single<BomberWorldRuntime>().Entity).SnapshotPresent.Value);
        Assert.False(restored.World.Single<BomberFinalCircleHfsmState>().SnapshotPresent.Value);
        Assert.Equal(keyBefore, restored.World.Single<BomberWorldRuntime>().NextHfsmMachineKey.Value);
    }

    [Fact]
    public void ExistingHighKeyIsPreservedAndMissingMachineUsesAllocator()
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberWorldRuntime runtime = manager.World.Single<BomberWorldRuntime>();
        runtime.NextHfsmMachineKey.Value = 1000;
        ulong key = runtime.AllocateHfsmMachineKey();
        using var definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        BomberHfsmState match = manager.World.Get<BomberHfsmState>(manager.World.Single<BomberWorldRuntime>().Entity);
        match.StorePlan(definition.Start(key, 5), definition, BomberHfsmKind.Match, key);
        manager.Tick();
        Assert.Equal(key, match.MachineKey.Value);
        Assert.Equal(5UL, match.Epoch.Value);
        Assert.Equal(1002UL, manager.World.Single<BomberFinalCircleHfsmState>().MachineKey.Value);
    }

    [Fact]
    public void StaleAllocatorFailsWithoutOverwritingExistingSnapshot()
    {
        using WorldManager manager = BomberTestWorld.Start();
        using var definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        manager.World.Get<BomberHfsmState>(manager.World.Single<BomberWorldRuntime>().Entity).StorePlan(definition.Start(900, 1), definition, BomberHfsmKind.Match, 900);
        string before = Machines(manager);
        Assert.Contains("exceeds the persisted allocator", Assert.Throws<InvalidOperationException>(() => manager.Tick()).Message);
        Assert.Equal(before, Machines(manager));
        Assert.Equal(0UL, manager.World.Single<BomberWorldRuntime>().NextHfsmMachineKey.Value);
    }

    [Fact]
    public void ExistingNotStartedSnapshotIsNotStartedOrRewrittenByFoundation()
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberWorldRuntime runtime = manager.World.Single<BomberWorldRuntime>();
        ulong key = runtime.AllocateHfsmMachineKey();
        using var definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        BomberHfsmState match = manager.World.Get<BomberHfsmState>(runtime.Entity);
        match.StoreSnapshot(Lumio.Engine.NativeLoader.HfsmSnapshot.NotStarted(definition.Fingerprint, key), definition, BomberHfsmKind.Match, key);
        using WorldManager restored = Restore(manager);
        restored.Tick();
        BomberHfsmState copy = restored.World.Get<BomberHfsmState>(runtime.Entity);
        Assert.True(copy.SnapshotPresent.Value);
        Assert.Equal(key, copy.MachineKey.Value);
        Assert.Equal(0UL, copy.Epoch.Value);
        Assert.Equal(0, copy.ActiveStates.Count);
        Assert.Equal(2UL, restored.World.Single<BomberFinalCircleHfsmState>().MachineKey.Value);
    }

    [Fact]
    public void ExhaustedAllocatorFailsBeforePartialInitialization()
    {
        using WorldManager manager = BomberTestWorld.Start();
        manager.World.Single<BomberWorldRuntime>().NextHfsmMachineKey.Value = ulong.MaxValue - 1;
        string before = Machines(manager);
        Assert.IsType<OverflowException>(Assert.Throws<InvalidOperationException>(() => manager.Tick()).InnerException);
        Assert.Equal(before, Machines(manager));
        Assert.Equal(ulong.MaxValue - 1, manager.World.Single<BomberWorldRuntime>().NextHfsmMachineKey.Value);
    }

    [Fact]
    public void CorruptRestoredIdentityFailsBeforeMissingMachineStarts()
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberWorldRuntime runtime = manager.World.Single<BomberWorldRuntime>();
        ulong key = runtime.AllocateHfsmMachineKey();
        using var definition = BomberHfsmDefinitions.Compile(manager.World, BomberHfsmKind.Match);
        BomberHfsmState match = manager.World.Get<BomberHfsmState>(runtime.Entity);
        match.StorePlan(definition.Start(key, 1), definition, BomberHfsmKind.Match, key);
        match.OwnerEntity.Value = new NetEntityId(runtime.Entity.InstanceId, 900);
        using WorldManager restored = Restore(manager);
        string before = Machines(restored);
        Assert.Contains("owner mismatch", Assert.Throws<InvalidOperationException>(() => restored.Tick()).Message);
        Assert.Equal(before, Machines(restored));
        Assert.Equal(key, restored.World.Single<BomberWorldRuntime>().NextHfsmMachineKey.Value);
    }

    private static WorldManager Restore(WorldManager manager)
    {
        WorldManager restored = BomberTestWorld.Restore(manager.CaptureSnapshot(), GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();

        return restored;
    }

    private static T[] Values<T>(SyncList<T> list) => Enumerable.Range(0, list.Count).Select(i => list[i]).ToArray();

    private static string Machines(WorldManager manager)
    {
        BomberHfsmState m = manager.World.Get<BomberHfsmState>(manager.World.Single<BomberWorldRuntime>().Entity);
        BomberFinalCircleHfsmState c = manager.World.Single<BomberFinalCircleHfsmState>();
        return $"{m.SnapshotPresent.Value}|{m.OwnerEntity.Value}|{m.MachineKind.Value}|{m.SnapshotSchemaVersion.Value}|{m.Fingerprint.Value}|{m.MachineKey.Value}|{m.Epoch.Value}|{m.StepSeq.Value}|{m.NextActivationSeq.Value}|{m.Lifecycle.Value}|{string.Join(',', Values(m.ActiveStates))}|{string.Join(',', Values(m.ActiveActivations))};" +
            $"{c.SnapshotPresent.Value}|{c.OwnerEntity.Value}|{c.MachineKind.Value}|{c.SnapshotSchemaVersion.Value}|{c.Fingerprint.Value}|{c.MachineKey.Value}|{c.Epoch.Value}|{c.StepSeq.Value}|{c.NextActivationSeq.Value}|{c.Lifecycle.Value}|{string.Join(',', Values(c.ActiveStates))}|{string.Join(',', Values(c.ActiveActivations))}";
    }
}
