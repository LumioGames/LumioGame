using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberMultiArmTerrainTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void OneBombRetainsEveryArmWhenSparseAndOrdinaryWritesRequireSeparateNativeTransactions(bool chestFirst)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var chest = scene.Chest("Wood");
        int x = chestFirst ? 6 : 5, z = chestFirst ? 6 : 5;
        int softX = chestFirst ? 7 : 5, softZ = chestFirst ? 6 : 4;
        scene.Write(x, 1, z, 0);
        scene.Write(softX, 1, softZ, 1025u << 8);
        var order = scene.Bomb();
        order.Get<BomberBombState>().Power.Value = 1;
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(x + .5f, 1.5f, z + .5f));
        scene.Manager.Tick(); scene.Manager.Tick();
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var bomb = scene.World.Get<BomberBombState>(order.AssignedId);
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        string firstTransaction = runtime.PendingVoxelTransactionIds[0];
        Assert.Equal(chestFirst ? 1025u << 8 : 0u,
            scene.Native.ReadCell(new VoxelWorldCoordinate(softX, 1, softZ)).BlockId);
        Assert.Equal(!chestFirst, scene.World.IsLive(chest));
        Assert.Equal(1, bomb.TerrainContinuations.Count);
        ulong exploded = bomb.ExplodedAtTick.Value;
        scene.Manager.Tick();
        Assert.Equal(1, runtime.PendingVoxelTransactionIds.Count);
        Assert.NotEqual(firstTransaction, runtime.PendingVoxelTransactionIds[0]);
        Assert.Equal(order.AssignedId, runtime.PendingSourceBombs[0]);
        Assert.Equal(bomb.SourceLife.Value, runtime.PendingSourceLives[0]);
        Assert.Equal(bomb.SourceLifeGeneration.Value, runtime.PendingSourceLifeGenerations[0]);
        Assert.False(scene.World.IsLive(chest));
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(softX, 1, softZ)).BlockId);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.Equal(0, bomb.TerrainContinuations.Count);
        Assert.Equal(2, scene.World.Get<BomberStatistics>(bomb.Owner.Value).DestroyedBlocks.Value);
        Assert.Equal(exploded, bomb.ExplodedAtTick.Value);
        var items = scene.World.Each<BomberPickupItem>().Where(p => p.TerrainSourceBomb.Value == order.AssignedId).ToArray();
        Assert.NotEmpty(items);
        Assert.All(items, item =>
        {
            Assert.Equal(order.AssignedId, item.TerrainSourceFamily.Value);
            Assert.Equal(bomb.SourceLife.Value, item.DroppedBy.Value);
            Assert.Equal(exploded, item.DropOccurrenceTick.Value);
        });
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.Equal(2, scene.World.Get<BomberStatistics>(bomb.Owner.Value).DestroyedBlocks.Value);
    }
}
