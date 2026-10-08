using System.Linq;
using System;
using System.Reflection;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class PlacementInputMemoryTests
{
    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 0)]
    public void ActualNativeInputRetriesOnlyInsideTheSdkTruncatedWindow(int delay, int expectedBombs)
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center);
        var inventory = scene.World.Get<AttributeComponent>(scene.Lives[0]);
        inventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 0);
        var config = BomberConfigBinding.For(scene.World);
        Assert.Equal(125u, config.Movement.PlaceBufferMs);
        Assert.Equal(2UL, Ticks.FromMilliseconds(config.Movement.PlaceBufferMs, config.Game.TickRateHz));
        MovementInputMemoryTests.Queue(scene, nameof(PlaceBombAbility), new PlaceBombAbility.Input(), 1);
        scene.Manager.Tick();
        Assert.Empty(scene.World.Each<BomberBombState>());
        for (int i = 1; i < delay; i++) scene.Manager.Tick();
        inventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 1);
        // The fixture restores both authoritative ledgers. SetBase alone is not a GAS settlement.
        inventory.SetCurrentValue(BomberAttributeNames.AvailableBombs, 1);
        scene.Manager.Tick();
        Assert.Equal(expectedBombs, scene.World.Each<BomberBombState>().Count());
        Assert.Equal(1 - expectedBombs, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(0UL, scene.World.Get<BomberPlayerState>(scene.Lives[0]).PendingPlaceUntilTick.Value);
    }

    [Fact]
    public void ActualFuseExitReleasesInventoryAndConsumesBufferedIntentOnce()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center);
        MovementInputMemoryTests.Queue(scene, nameof(PlaceBombAbility), new PlaceBombAbility.Input(), 1);
        scene.Manager.Tick();
        BomberBombState old = Assert.Single(scene.World.Each<BomberBombState>());
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center - System.Numerics.Vector3.UnitX * 2);
        old.FuseEndTick.Value = scene.World.Tick;
        MovementInputMemoryTests.Queue(scene, nameof(PlaceBombAbility), new PlaceBombAbility.Input(), 2);
        scene.Manager.Tick();
        Assert.Equal((int)BomberBombPhase.Danger, old.Phase.Value);
        Assert.Equal(1, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetCurrentValue(BomberAttributeNames.AvailableBombs));
        scene.Manager.Tick();
        BomberBombState placed = Assert.Single(scene.World.Each<BomberBombState>(), b => b.Phase.Value == (int)BomberBombPhase.Fuse);
        Assert.NotEqual(old.Entity, placed.Entity);
        Assert.Equal(0UL, scene.World.Get<BomberPlayerState>(scene.Lives[0]).PendingPlaceUntilTick.Value);
        scene.Manager.Tick();
        Assert.Single(scene.World.Each<BomberBombState>(), b => b.Phase.Value == (int)BomberBombPhase.Fuse);
    }

    [Fact]
    public void AStructuralOwnerExceptionCannotLeaveAnAutomaticallyReplayedIntent()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center);
        var player = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        var owner = scene.World.Get<AbilityComponent>(scene.Lives[0]);
        // Exercise the real owner rejection after the Game placement reservation.
        // Commands.Create has no OutcomeUnknown DTO; the buffer must not retry any throw.
        FieldInfo lifecycle = typeof(World).GetField("LifecycleCallbacksActive", BindingFlags.Instance | BindingFlags.NonPublic)!;
        lifecycle.SetValue(scene.World, true);
        try
        {
            var error = Assert.Throws<InvalidOperationException>(() => new PlaceBombAbility().Execute(default, owner));
            Assert.Contains("Structural Commands.Create", error.Message, StringComparison.Ordinal);
        }
        finally { lifecycle.SetValue(scene.World, false); }
        Assert.Equal(0UL, player.PendingPlaceUntilTick.Value);
        Assert.Equal(1, scene.World.Single<BomberWorldRuntime>().BombPlacementCells.Count);
        scene.Manager.Tick(); scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(1, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Theory]
    [InlineData("water")]
    [InlineData("death")]
    [InlineData("phase")]
    [InlineData("match")]
    [InlineData("life")]
    public void BufferedPlacementCannotCrossHardCancellation(string reason)
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center);
        var player = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        var inventory = scene.World.Get<AttributeComponent>(scene.Lives[0]);
        inventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 0);
        MovementInputMemoryTests.Queue(scene, nameof(PlaceBombAbility), new PlaceBombAbility.Input(), 1);
        scene.Manager.Tick();
        Assert.True(player.PendingPlaceUntilTick.Value > scene.World.Tick);
        switch (reason)
        {
            case "water": scene.Write(7, 0, 7, 1027u << 8); break;
            case "death": player.LifePhase.Value = (int)BomberLifePhase.AwaitingRespawn; break;
            case "phase": scene.World.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Podium; break;
            case "match": scene.World.Single<BomberMatchState>().MatchId.Value++; break;
            default: player.LifeGeneration.Value++; break;
        }
        inventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 1);
        scene.Manager.Tick();
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(0UL, player.PendingPlaceUntilTick.Value);
    }
}
