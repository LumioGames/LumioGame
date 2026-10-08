using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BombButtonProductionTests
{
    [Fact]
    public void SameAuthorityTickBeginEndPlacesOneOrdinaryBombThroughTheActualRpcBatch()
    {
        using var scene = Ready();
        Queue(scene, 1, 1); Queue(scene, 3, 2);
        scene.Manager.Tick();
        Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(2, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void HeldAndDuplicateBeginCannotTurnOneGestureIntoMoreOrdinaryPlacements()
    {
        using var scene = Ready();
        Queue(scene, 1, 1); scene.Manager.Tick();
        MovementInputMemoryTests.Position(scene, new Vector3(6.5f, 1.5f, 7.5f));
        Queue(scene, 2, 2); Queue(scene, 2, 3); scene.Manager.Tick();
        Queue(scene, 1, 4); scene.Manager.Tick();
        Queue(scene, 3, 5); scene.Manager.Tick();
        Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(2, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(0)]
    [InlineData(5)]
    public void NonBeginEdgesCannotInventAnOrdinaryButtonPress(int phase)
    {
        using var scene = Ready();
        Queue(scene, phase, 1); scene.Manager.Tick();
        Assert.Empty(scene.World.Each<BomberBombState>());
        Assert.Equal(3, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    internal static void Queue(BomberTerrainProductionTests.Scene scene, int phase, uint sequence) =>
        MovementInputMemoryTests.Queue(scene, phase is 3 or 4 ? "BombButtonReleaseAbility" : "BombButtonAbility",
            new ButtonInput(phase), sequence);

    internal static BomberTerrainProductionTests.Scene Ready()
    {
        var scene = MovementInputMemoryTests.OpenScene();
        MovementInputMemoryTests.Position(scene, MovementInputMemoryTests.Center);
        var attributes = scene.World.Get<AttributeComponent>(scene.Lives[0]);
        attributes.SetBaseValue(BomberAttributeNames.BombCapacity, 3);
        attributes.SetCurrentValue(BomberAttributeNames.BombCapacity, 3);
        attributes.SetBaseValue(BomberAttributeNames.AvailableBombs, 3);
        attributes.SetCurrentValue(BomberAttributeNames.AvailableBombs, 3);
        return scene;
    }

    private readonly struct ButtonInput(int phase) : IAbilityInput
    {
        public void Write(IList<object?> args) => args.Add(phase.ToString(CultureInfo.InvariantCulture));
        public bool TryRead(IReadOnlyList<object?> args, int start) => false;
    }
}
