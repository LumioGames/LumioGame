using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.SDK;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFrenzyBarrelIntegrationTests
{
    [Fact]
    public void ActualFrenzyPlacementTransfersItsImmunityToTheNativeTriggeredBarrelBomb()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        var barrel = scene.World.Commands.Create<BomberBarrelEntity>();
        barrel.Get<BomberBarrelState>().ResourceGeneration.Value = 1;
        scene.Manager.Tick();
        scene.Adapter.SetBindingPolicy(new[] { new VoxelBindingPolicyEntry(1032,
            scene.World.Registry.WireName(typeof(BomberBarrelEntity))) });
        var before = scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5));
        var write = new VoxelWriteEntry(0, 256 + 5 * 16 + 6, 1032u << 8, before.SectionRevision);
        Assert.Equal(VoxelStageStatus.Staged, scene.Adapter.TryStageMutation(new[] { write },
            new[] { new VoxelBindingOp(0, write.CellOffset, barrel.AssignedId.ToHex())
                { ExpectedSectionRevision = write.ExpectedSectionRevision } }, "frenzy-barrel-fixture").Status);
        scene.Manager.Tick();
        BomberGrowthHealthTests.Take(scene.Manager, scene.Lives[0], 7);
        var life = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        var participant = scene.World.Get<BomberParticipantState>(life.Participant.Value);
        Assert.True(BomberFrenzy.IsActive(scene.World, participant, life.Entity));
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(life.Entity), new Vector3(5.5f, 1.5f, 5.5f));
        var ability = scene.World.Get<AbilityComponent>(life.Entity);
        Assert.True(PlaceBombAbility.CanPlace(ability, out string? reason), reason);
        ability.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
        scene.Manager.Tick();
        var source = Assert.Single(scene.World.Each<BomberBombState>());
        Assert.True(source.Frenzy.Value);
        ulong fuse = source.FuseEndTick.Value;
        while (scene.World.Tick <= fuse + 2) scene.Manager.Tick();
        Assert.False(scene.World.IsLive(barrel.AssignedId));
        Assert.Equal(0u, scene.Native.ReadCell(new VoxelWorldCoordinate(6, 1, 5)).BlockId);
        var produced = Assert.Single(scene.World.Each<BomberBombState>(), b => b.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal));
        Assert.True(produced.Frenzy.Value, "The durable barrel transfer must retain the source bomb's Frenzy immunity.");
        Assert.True(produced.CapacityReturned.Value);
        Assert.Equal(source.SourceLife.Value, produced.SourceLife.Value);
        Assert.Equal(source.SourceLifeGeneration.Value, produced.SourceLifeGeneration.Value);
        Assert.Equal(source.Owner.Value, produced.Owner.Value);
        Assert.Equal(source.ChainId.Value, produced.ChainId.Value);
        Assert.Equal(3, produced.Power.Value);
        while (scene.World.Tick <= produced.FuseEndTick.Value + 2) scene.Manager.Tick();
        Assert.Equal(6L, scene.World.Get<AttributeComponent>(life.Entity).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(0, participant.FrenzyBombPromises.Count);
    }
}
