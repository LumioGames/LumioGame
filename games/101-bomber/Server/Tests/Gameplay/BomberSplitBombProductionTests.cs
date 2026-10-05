using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberSplitBombProductionTests
{
    [Fact]
    public void ActualNativeExplosionCreatesFourEndpointChildrenWithOriginalSourceAndOneHalfSecondFuse()
    {
        using var scene = Open();
        NetEntityId source = scene.Lives[0];
        BomberBombState mother = Mother(scene, power: 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        BomberBombState[] children = scene.World.Each<BomberBombState>().Where(b => b.HitFamily.Value == mother.Entity).ToArray();
        Assert.Equal(4, children.Length);
        Assert.Equal(new[] { (5, 7), (7, 5), (7, 9), (9, 7) }, children.Select(b =>
        {
            Vector3 position = scene.World.Get<LogicTransform>(b.Entity).LocalPosition;
            return (BomberMatchRules.CellX(position), BomberMatchRules.CellZ(position));
        }).OrderBy(cell => cell.Item1).ThenBy(cell => cell.Item2).ToArray());
        Assert.All(children, child =>
        {
            Assert.Equal(source, child.SourceLife.Value);
            Assert.Equal(mother.Owner.Value, child.Owner.Value);
            Assert.Equal(mother.SourceLifeGeneration.Value, child.SourceLifeGeneration.Value);
            Assert.Equal(mother.ChainId.Value, child.ChainId.Value);
            Assert.Equal(0, child.BombKind.Value);
            Assert.Equal(1, child.Power.Value);
            Assert.Equal(10UL, child.FuseEndTick.Value - child.PlacedAtTick.Value);
            Assert.True(child.CapacityReturned.Value);
            Assert.Equal((int)BomberBombPhase.Fuse, child.Phase.Value);
        });
        long inventory = scene.World.Get<AttributeComponent>(source).GetBaseValue(BomberAttributeNames.AvailableBombs);
        ulong due = children[0].FuseEndTick.Value;
        while (scene.World.Tick <= due) scene.Manager.Tick();
        Assert.All(children, child => Assert.Equal((int)BomberBombPhase.Danger, child.Phase.Value));
        Assert.Equal(inventory, scene.World.Get<AttributeComponent>(source).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void ABlockedFirstCellHasNoEndpointChildAndDoesNotInventAnOriginChild()
    {
        using var scene = Open();
        scene.Write(8, 1, 7, 1023u << 8);
        BomberBombState mother = Mother(scene, power: 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        BomberBombState[] children = scene.World.Each<BomberBombState>().Where(b => b.HitFamily.Value == mother.Entity).ToArray();
        Assert.Equal(3, children.Length);
        Assert.Equal(0, mother.ReachRight.Value);
        Assert.DoesNotContain(children, b => scene.World.Get<LogicTransform>(b.Entity).LocalPosition == new Vector3(7.5f, 1.5f, 7.5f));
    }

    [Fact]
    public void MotherAndEndpointChildShareOneActualDamageContactAndRetainTheMotherUntilItsChildrenRetire()
    {
        using var scene = Open();
        World world = scene.World;
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(scene.Lives[1]), new Vector3(9.5f, 1.5f, 7.5f));
        BomberBombState mother = Mother(scene, power: 2);
        scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(4L, world.Get<AttributeComponent>(scene.Lives[1]).GetBaseValue(BomberAttributeNames.HealthPoints));
        ulong childDue = world.Each<BomberBombState>().Where(b => b.HitFamily.Value == mother.Entity).Select(b => b.FuseEndTick.Value).DefaultIfEmpty().Max();
        Assert.True(childDue > world.Tick);
        while (world.Tick <= childDue + 2) scene.Manager.Tick();
        Assert.Equal(4L, world.Get<AttributeComponent>(scene.Lives[1]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.True(world.IsLive(mother.Entity));
        Assert.Single(BomberEffectIntegrationTests.Events(world, "damage_applied"), e =>
            e.GetProperty("entityId").GetString() == mother.Entity.ToHex() && e.GetProperty("lifeId").GetString() == scene.Lives[1].ToHex());
        for (int tick = 0; tick < 20; tick++) scene.Manager.Tick();
        Assert.False(world.IsLive(mother.Entity));
        Assert.Empty(world.Each<BomberBombState>());
    }

    [Fact]
    public void EndpointChildCannotBeKickedAndActualGroundWaterExtinguishesWithoutReturningInventory()
    {
        using var scene = Open();
        BomberBombState mother = Mother(scene, power: 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        BomberBombState child = scene.World.Each<BomberBombState>().Single(b =>
            b.HitFamily.Value == mother.Entity && b.ChildDirection.Value == 2);
        NetEntityId childId = child.Entity;
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(scene.Lives[0]), new Vector3(8.5f, 1.5f, 7.5f));
        scene.World.Get<BomberPlayerState>(scene.Lives[0]).Facing.Value = (int)BomberDirection.Right;
        Assert.False(BomberBombKick.TryTarget(scene.World, scene.Lives[0], 2, out _, out bool available));
        Assert.True(available);
        scene.Manager.Tick();
        long inventory = scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs);
        scene.Write(9, BomberConfigBinding.For(scene.World).Map.GroundLayer, 7, 1027u << 8);
        scene.Manager.Tick();
        Assert.False(scene.World.IsLive(childId));
        Assert.Contains(BomberEffectIntegrationTests.Events(scene.World, "bomb_extinguished"), e =>
            e.GetProperty("entityId").GetString() == childId.ToHex());
        Assert.Equal(inventory, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void WithheldOriginalNativeTerrainReceiptRetainsAllFutureCreditsAndNeverPublishesChildrenEarly()
    {
        using var scene = Open();
        scene.Write(8, 1, 7, 1025u << 8);
        BomberBombState mother = Mother(scene, power: 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        BomberWorldRuntime runtime = scene.World.Single<BomberWorldRuntime>();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        string transaction = runtime.PendingVoxelTransactionIds[0];
        var original = scene.Adapter.CaptureResultCheckpoint();
        Assert.Single(original.Results);
        var withheld = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        using var binding = VoxelGameplayBinding.Bind(scene.Manager, withheld);
        scene.Manager.BindVoxelTick(withheld.PrepareVoxel, withheld.CommitVoxel);
        for (int tick = 0; tick < 12; tick++) scene.Manager.Tick();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(4, mother.FutureChildren.Value);
        Assert.Equal(0, mother.SplitSubmittedMask.Value);
        Assert.DoesNotContain(scene.World.Each<BomberBombState>(), b => b.ChildDirection.Value != 0);
        byte[] snapshot = scene.Manager.CaptureSnapshot();
        using (WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance, config: BomberConfigBinding.Load()))
        {
            Assert.Equal(snapshot, restored.CaptureSnapshot());
            Assert.Equal(4, restored.World.Get<BomberBombState>(mother.Entity).FutureChildren.Value);
        }
        var delivered = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = scene.World };
        delivered.RestoreResultCheckpoint(original);
        using var deliveryBinding = VoxelGameplayBinding.Bind(scene.Manager, delivered);
        scene.Manager.BindVoxelTick(delivered.PrepareVoxel, delivered.CommitVoxel);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(0, mother.FutureChildren.Value);
        Assert.Equal(4, scene.World.Each<BomberBombState>().Count(b => b.HitFamily.Value == mother.Entity));
    }

    [Fact]
    public void PairedCheckpointRestoresPublishedChildrenAndTheirExactSharedMotherWithoutReturningCreditsTwice()
    {
        using var scene = Open(persistence: true);
        BomberBombState mother = Mother(scene, power: 2);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(0, mother.FutureChildren.Value);
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture();
        Assert.True(captured.Succeeded);
        using WorldManager restored = BomberTestWorld.RestorePaired(captured.Checkpoint!.Value);
        BomberBombState resumedMother = restored.World.Get<BomberBombState>(mother.Entity);
        Assert.Equal(0, resumedMother.FutureChildren.Value);
        Assert.Equal(15, resumedMother.SplitResolvedMask.Value);
        Assert.Equal(4, restored.World.Each<BomberBombState>().Count(b => b.HitFamily.Value == mother.Entity));
        restored.Tick();
        Assert.Equal(0, resumedMother.FutureChildren.Value);
        Assert.Equal(4, restored.World.Each<BomberBombState>().Count(b => b.HitFamily.Value == mother.Entity));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    public void CorruptPersistedFutureOwnershipFailsHydration(int corruption)
    {
        using var scene = Open();
        BomberBombState mother = Mother(scene, power: 2);
        mother.FuseEndTick.Value = 100_000;
        scene.Manager.Tick();
        switch (corruption)
        {
            case 0: mother.FutureChildren.Value = 5; break;
            case 1: mother.SplitSubmittedMask.Value = 16; break;
            case 2: mother.SplitResolvedMask.Value = 1; break;
            case 3: mother.ChildDirection.Value = 5; break;
            case 4: mother.PromiseToken.Value = new string('x', 129); break;
        }
        byte[] snapshot = scene.Manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(snapshot,
            GeneratedRegistry.Instance, config: BomberConfigBinding.Load()));
    }

    internal static BomberTerrainProductionTests.Scene Open(bool persistence = false)
    {
        var scene = new BomberTerrainProductionTests.Scene(0, persistence: persistence);
        for (int z = 3; z <= 11; z++)
        for (int x = 3; x <= 11; x++) scene.Write(x, 1, z, 0);
        foreach (NetEntityId life in scene.Lives)
            BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(life), new Vector3(15.5f, 1.5f, 15.5f));
        return scene;
    }

    // The authored producer guard stays closed. This focused boundary creates an actual ECS bomb
    // and exercises the production Native HFSM/terrain/effect path for its approved shape.
    internal static BomberBombState Mother(BomberTerrainProductionTests.Scene scene, int power)
    {
        EntityOrder order = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[0], scene.Lives[0], 8901);
        BomberBombState mother = order.Get<BomberBombState>();
        mother.BombKind.Value = 4;
        mother.FutureChildren.Value = 4;
        mother.Power.Value = power;
        mother.CapacityReturned.Value = true;
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(7.5f, 1.5f, 7.5f));
        return mother;
    }
}
