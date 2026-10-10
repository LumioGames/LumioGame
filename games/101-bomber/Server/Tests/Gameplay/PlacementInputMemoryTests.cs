using System.Linq;
using System;
using System.Reflection;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Engine.SDK;
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
            default: player.LifeGeneration.Value++; break;
        }
        inventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 1);
        scene.Manager.Tick();
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(0UL, player.PendingPlaceUntilTick.Value);
    }

    [Fact]
    public void BufferedOldMatchPlacementCannotCrossRealRollover()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        var (player, inventory) = PrepareRolloverPlacement(scene, staleMatch: true);
        scene.Manager.Tick();
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(1, inventory.GetCurrentValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(0UL, player.PendingPlaceUntilTick.Value);
        Assert.Equal(scene.World.Single<BomberMatchState>().MatchId.Value, player.InputMemoryMatchId.Value);
    }

    [Fact]
    public void BufferedCurrentMatchPlacementAfterRealRolloverExecutesExactlyOnce()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        var (player, inventory) = PrepareRolloverPlacement(scene, staleMatch: false);
        scene.Manager.Tick();
        var bomb = Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(player.Entity, bomb.SourceLife.Value);
        Assert.Equal(0, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(0, inventory.GetCurrentValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(0UL, player.PendingPlaceUntilTick.Value);
        Assert.Equal(scene.World.Single<BomberMatchState>().MatchId.Value, player.InputMemoryMatchId.Value);
        scene.Manager.Tick();
        Assert.Equal(bomb.Entity, Assert.Single(scene.World.Each<BomberBombState>()).Entity);
        Assert.Equal(0, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(0, inventory.GetCurrentValue(BomberAttributeNames.AvailableBombs));
    }

    private static (BomberPlayerState Player, AttributeComponent Inventory) PrepareRolloverPlacement(
        BomberTerrainProductionTests.Scene scene, bool staleMatch)
    {
        var world = scene.World;
        var match = world.Single<BomberMatchState>();
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        ulong oldMatch = match.MatchId.Value;
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center);
        var oldPlayer = world.Get<BomberPlayerState>(scene.Lives[0]);
        var participant = world.Get<BomberParticipantState>(oldPlayer.Participant.Value);
        var oldInventory = world.Get<AttributeComponent>(oldPlayer.Entity);
        oldInventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 0);
        oldInventory.SetCurrentValue(BomberAttributeNames.AvailableBombs, 0);
        MovementInputMemoryTests.Queue(scene, nameof(PlaceBombAbility), new PlaceBombAbility.Input(), 1);
        scene.Manager.Tick();
        Assert.Empty(world.Each<BomberBombState>());
        Assert.True(oldPlayer.PendingPlaceUntilTick.Value > world.Tick);
        Assert.Equal(oldMatch, oldPlayer.InputMemoryMatchId.Value);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.False(BomberRegeneration.HasPending(world));
        Assert.Equal("", runtime.RegenerationPromises.Value);
        Assert.Equal(oldMatch, runtime.RegenerationMatchId.Value);
        ulong resourceGeneration = runtime.NextResourceGeneration.Value;

        BomberRoundRolloverTests.EndRound(scene);
        Assert.Equal(oldMatch + 1, match.MatchId.Value);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.False(BomberRegeneration.HasPending(world));
        Assert.Equal(0UL, runtime.RegenerationMatchId.Value);
        Assert.Equal(0UL, runtime.RegenerationNextTick.Value);
        Assert.True(runtime.NextResourceGeneration.Value >= resourceGeneration);
        Assert.Equal((int)BomberMatchPhase.Warmup, match.Phase.Value);
        match.PhaseEndTick.Value = world.Tick;
        scene.Manager.Tick();
        scene.Manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Running, match.Phase.Value);
        Assert.Equal(match.MatchId.Value, runtime.RegenerationMatchId.Value);
        Assert.Equal(match.StartTick.Value + Ticks.FromMilliseconds(config.Regeneration.FirstTriggerMs, config.Game.TickRateHz),
            runtime.RegenerationNextTick.Value);
        Assert.Equal(0, runtime.PendingVoxelTransactionIds.Count);
        Assert.False(BomberRegeneration.HasPending(world));

        var player = world.Get<BomberPlayerState>(participant.CurrentLife.Value);
        Assert.True(world.IsLive(player.Entity));
        Assert.Equal(participant.Entity, player.Participant.Value);
        Assert.Equal(match.MatchId.Value, participant.MatchId.Value);
        Assert.Equal(player.Entity, participant.CurrentLife.Value);
        Assert.True(player.LifeGeneration.Value > 0);
        Assert.Equal(participant.LifeGeneration.Value, player.LifeGeneration.Value);
        Assert.Equal(participant.LifePhase.Value, player.LifePhase.Value);
        Assert.True(BomberInputMemory.IsCurrent(world, player));
        Assert.True(BomberMatchRules.IsPlayerInputOpen(world, player.Entity));
        MoveAbility.WritePosition(world, player.Entity, MovementInputMemoryTests.Center, nameof(MoveAbility));
        Assert.Equal(1022u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(7, 0, 7)).BlockId);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(7, 1, 7)).BlockId);
        var inventory = world.Get<AttributeComponent>(player.Entity);
        inventory.SetBaseValue(BomberAttributeNames.AvailableBombs, 1);
        inventory.SetCurrentValue(BomberAttributeNames.AvailableBombs, 1);
        Assert.Equal(1, inventory.GetBaseValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(1, inventory.GetCurrentValue(BomberAttributeNames.AvailableBombs));
        Assert.Equal(125u, config.Movement.PlaceBufferMs);
        ulong window = Ticks.FromMilliseconds(config.Movement.PlaceBufferMs, config.Game.TickRateHz);
        Assert.Equal(2UL, window);
        // Probe retained old-match intent on a coherent world, with the same live window as the current-match control.
        player.InputMemoryMatchId.Value = staleMatch ? oldMatch : match.MatchId.Value;
        player.PendingPlaceUntilTick.Value = checked(world.Tick + window);
        Assert.True(player.PendingPlaceUntilTick.Value > world.Tick);
        Assert.Equal(staleMatch, player.InputMemoryMatchId.Value != match.MatchId.Value);
        Assert.True(PlaceBombAbility.CanPlace(world.Get<AbilityComponent>(player.Entity), out string? reason), reason);
        return (player, inventory);
    }
}
