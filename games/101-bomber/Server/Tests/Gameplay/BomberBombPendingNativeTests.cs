using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Coordination.VoxelAdapters;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberBombPendingNativeTests
{
    [Fact]
    public void OriginalNativeDeliveryKeepsBombAndRefusesNewPlacementUntilItActuallyArrives()
    {
        using var scene = new BomberTerrainProductionTests.Scene(1025u << 8);
        var order = scene.Bomb(true);
        scene.Manager.Tick(); scene.Manager.Tick();
        var world = scene.World;
        var runtime = world.Single<BomberWorldRuntime>();
        var source = world.Get<BomberBombState>(order.AssignedId);
        var original = scene.Adapter.CaptureResultCheckpoint();
        string transaction = runtime.PendingVoxelTransactionIds[0];
        Assert.Single(original.Results);
        var held = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = world };
        using var heldBinding = VoxelGameplayBinding.Bind(scene.Manager, held);
        scene.Manager.BindVoxelTick(held.PrepareVoxel, held.CommitVoxel);
        Assert.Equal(VoxelTxnState.Applied, held.QueryTransaction(transaction).State);
        Assert.Equal(VoxelCommitDisposition.None, held.QueryTransaction(transaction).Disposition);
        var owner = world.Get<AbilityComponent>(scene.Lives[0]);
        for (int i = 0; i < 30; i++)
        {
            scene.Manager.Tick();
            Assert.True(world.IsLive(source.Entity));
            Assert.Equal(transaction, runtime.PendingVoxelTransactionIds[0]);
            Assert.False(PlaceBombAbility.CanPlace(owner, out string? reason));
            Assert.Equal("bomb_terrain_blocked", reason);
            Assert.Single(world.Each<BomberBombState>());
        }
        Assert.True(source.DangerUntilTick.Value < world.Tick);
        var delivered = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native)) { World = world };
        delivered.RestoreResultCheckpoint(original);
        using var deliveredBinding = VoxelGameplayBinding.Bind(scene.Manager, delivered);
        scene.Manager.BindVoxelTick(delivered.PrepareVoxel, delivered.CommitVoxel);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.False(world.IsLive(order.AssignedId));
        Assert.True(PlaceBombAbility.CanPlace(owner, out string? available), available);
    }
}
