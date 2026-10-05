using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberBombCapacityTests
{
    [Fact]
    public void UnpublishedSplitOrdersReserveMotherAndAllFourFutureChildrenBeforeAnotherSameTickProducer()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        World world = scene.World;
        int limit = BomberConfigBinding.For(world).ObjectBudgets.BombCapacity;
        int mothers = limit / 5;
        BomberPlayerState source = world.Get<BomberPlayerState>(scene.Lives[0]);
        for (int index = 0; index < mothers; index++)
        {
            Assert.True(BomberBombAdmissions.CanCreatePrimary(world, 4));
            BomberBombState bomb = BomberBombAdmissions.CreatePrimary(world, 4).Get<BomberBombState>();
            bomb.BombKind.Value = (int)BomberBombKind.ReservedSplit;
            bomb.Owner.Value = source.Participant.Value;
            bomb.SourceLife.Value = source.Entity;
            bomb.SourceLifeGeneration.Value = source.LifeGeneration.Value;
            bomb.Power.Value = 1;
            bomb.FuseEndTick.Value = 100_000;
            bomb.CapacityReturned.Value = true;
        }
        Assert.Empty(world.Each<BomberBombState>());
        Assert.False(BomberBombAdmissions.CanCreatePrimary(world, 4));
        Assert.Throws<System.InvalidOperationException>(() => BomberBombAdmissions.CreatePrimary(world, 4));
        for (int remaining = limit - mothers * 5; remaining > 0; remaining--)
        {
            Assert.True(BomberBombAdmissions.CanCreatePrimary(world));
            BomberBombAdmissions.CreatePrimary(world);
        }
        Assert.False(BomberBombAdmissions.CanCreatePrimary(world));
        Assert.False(BomberBombAdmissions.CanReserve(world, 1));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void ActualLiveOccupancyAndUnpublishedPlacementShareTheConfiguredBombLimit(int freeSlots)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, persistence: true);
        scene.Write(7, 1, 7, 0);
        scene.Write(9, 1, 7, 0);
        World world = scene.World;
        int limit = BomberConfigBinding.For(world).ObjectBudgets.BombCapacity;
        // A boundary occupancy fixture, not a claim that one player's ordinary
        // inventory can produce this census. Every row is a real published ECS bomb.
        for (int offset = 0; offset < limit - freeSlots;)
        {
            int stop = System.Math.Min(offset + 48, limit - freeSlots);
            while (offset < stop)
            {
                var order = world.Commands.Create<BomberBombEntity>();
                var bomb = order.Get<BomberBombState>();
                var life = world.Get<BomberPlayerState>(scene.Lives[1]);
                bomb.Owner.Value = life.Participant.Value;
                bomb.SourceLife.Value = life.Entity;
                bomb.SourceLifeGeneration.Value = life.LifeGeneration.Value;
                bomb.FuseEndTick.Value = 100_000;
                bomb.Power.Value = 1;
                bomb.ChainId.Value = (ulong)(100_000 + offset);
                bomb.PlacementRecorded.Value = true;
                BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(1.5f, 1.5f, 1.5f));
                offset++;
            }
            scene.Manager.Tick();
        }
        Assert.Equal(limit - freeSlots, world.Each<BomberBombState>().Count());
        var attributes = world.Get<AttributeComponent>(scene.Lives[0]);
        attributes.SetBaseValue(BomberAttributeNames.BombCapacity, 3);
        attributes.SetCurrentValue(BomberAttributeNames.BombCapacity, 3);
        attributes.SetBaseValue(BomberAttributeNames.AvailableBombs, 3);
        attributes.SetCurrentValue(BomberAttributeNames.AvailableBombs, 3);
        var owner = world.Get<AbilityComponent>(scene.Lives[0]);
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(scene.Lives[0]), new Vector3(7.5f, 1.5f, 7.5f));
        if (freeSlots != 0)
        {
            Assert.True(PlaceBombAbility.CanPlace(owner, out string? firstFailure), firstFailure);
            owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
            Assert.Equal(2, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
            // The create is still an EntityOrder, so counting only live rows is insufficient.
            Assert.Equal(limit - 1, world.Each<BomberBombState>().Count());
            BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(scene.Lives[0]), new Vector3(9.5f, 1.5f, 7.5f));
        }
        Assert.False(PlaceBombAbility.CanPlace(owner, out string? reason));
        Assert.Equal("bomb_cell_reserved", reason);
        scene.Manager.Tick();
        Assert.Equal(limit, world.Each<BomberBombState>().Count());
        Assert.False(PlaceBombAbility.CanPlace(owner, out _));
        Assert.True(world.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture();
        Assert.True(captured.Succeeded);
        using WorldManager restored = BomberTestWorld.RestorePaired(captured.Checkpoint!.Value);
        Assert.Equal(limit, restored.World.Each<BomberBombState>().Count());
        var restoredOwner = restored.World.Get<AbilityComponent>(scene.Lives[0]);
        Assert.False(PlaceBombAbility.CanPlace(restoredOwner, out _));
        NetEntityId retired = restored.World.Each<BomberBombState>().First().Entity;
        restored.World.Commands.Destroy(retired);
        // Queuing destruction alone is not a returned entity slot.
        Assert.False(PlaceBombAbility.CanPlace(restoredOwner, out _));
        restored.Tick();
        Assert.False(restored.World.IsLive(retired));
        Assert.Equal(limit - 1, restored.World.Each<BomberBombState>().Count());
        Assert.True(PlaceBombAbility.CanPlace(restoredOwner, out string? releasedReason), releasedReason);
    }
}
