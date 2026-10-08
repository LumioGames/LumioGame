using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class SpecialBombProductionTests
{
    [Fact]
    public void ActualPlacePierceContinuesAfterTwoIndependentSuccessfulSoftBrickReceipts()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        BomberBombState bomb = PlacePierce(scene);
        Assert.Equal((int)BomberBombKind.Pierce, bomb.BombKind.Value);
        Assert.True(bomb.PierceLayers.Value > 0);
        MovementInputMemoryTests.Position(scene, new Vector3(6.5f, 1.5f, 6.5f));
        bomb.FuseEndTick.Value = scene.World.Tick;
        for (int i = 0; i < 5; i++) scene.Manager.Tick();
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(8, 1, 7)).BlockId);
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(7, 1, 7)).BlockId);
        Assert.Equal(3, bomb.ReachLeft.Value);
        Assert.Equal(0, bomb.TerrainContinuations.Count);
        Assert.Equal(1, scene.World.Get<AttributeComponent>(scene.Lives[0]).GetBaseValue(BomberAttributeNames.AvailableBombs));
    }

    [Fact]
    public void ActualPlacedPierceForecastMatchesTheCompleteTwoBrickRayBeforeAutomaticAssist()
    {
        using var scene = MovementInputMemoryTests.OpenScene();
        BomberBombState bomb = PlacePierce(scene);
        bomb.FuseEndTick.Value = scene.World.Tick + 1;
        Vector3 before = new(6.85f, 1.5f, 6.5f);
        MovementInputMemoryTests.Position(scene, before);
        MovementInputMemoryTests.QueueMove(scene, BomberDirection.Down, BomberDirection.None, true, 2);
        scene.Manager.Tick();
        MovementInputMemoryTests.AssertPosition(before, MovementInputMemoryTests.Position(scene));
        Assert.Equal((int)BomberBombPhase.Fuse, bomb.Phase.Value);
        Assert.Equal(0, bomb.ReachLeft.Value);
        Assert.Equal(0, bomb.TerrainContinuations.Count);
        Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(8, 1, 7)).BlockId);
        Assert.Equal(1025u << 8, scene.Native.ReadCell(new VoxelWorldCoordinate(7, 1, 7)).BlockId);
        for (int i = 0; i < 5; i++) scene.Manager.Tick();
        Assert.Equal(3, bomb.ReachLeft.Value);
    }

    private static BomberBombState PlacePierce(BomberTerrainProductionTests.Scene scene)
    {
        var config = BomberConfigBinding.For(scene.World);
        var skills = scene.World.Get<BomberSkillState>(scene.Lives[0]);
        skills.BombSkillId.Value = config.Tables.Skills.Rows.Single(s => s.Slot == "Bomb" &&
            s.BombKindCode == (uint)BomberBombKind.Pierce && !s.IsCombo).Id;
        skills.BombSkillLevel.Value = 1;
        var attributes = scene.World.Get<AttributeComponent>(scene.Lives[0]);
        attributes.SetBaseValue(BomberAttributeNames.BombPower, 3);
        attributes.SetCurrentValue(BomberAttributeNames.BombPower, 3);
        scene.Write(8, 1, 7, 1025u << 8);
        scene.Write(7, 1, 7, 1025u << 8);
        MovementInputMemoryTests.Position(scene, new Vector3(9.5f, 1.5f, 7.5f));
        MovementInputMemoryTests.Queue(scene, nameof(PlaceBombAbility), new PlaceBombAbility.Input(), 1);
        scene.Manager.Tick();
        BomberBombState bomb = Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Equal(3, bomb.Power.Value);
        Assert.Equal(0, attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        return bomb;
    }
}
