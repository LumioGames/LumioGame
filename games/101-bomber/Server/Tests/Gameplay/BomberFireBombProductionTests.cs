using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFireBombProductionTests
{
    [Fact]
    public void ActualNativeBombEntersBurnForOneAndAHalfSecondsAndRetiresItsOriginalEntity()
    {
        using var scene = Open();
        BomberBombState bomb = Fire(scene, scene.Lives[0], 7, 7);
        scene.Manager.Tick(); scene.Manager.Tick();
        NetEntityId bombId = bomb.Entity;
        ulong dangerEnd = bomb.DangerUntilTick.Value;
        while (scene.World.Tick <= dangerEnd) scene.Manager.Tick();
        Assert.True(scene.World.IsLive(bombId), "The original Fire bomb must survive DangerElapsed in its Native Burn phase.");
        Assert.Equal((int)BomberBombPhase.Burn, bomb.Phase.Value);
        Assert.Equal(dangerEnd + 30, bomb.BurnUntilTick.Value);
        Assert.True(scene.World.IsLive(bomb.Entity));
        Assert.Single(scene.World.Each<BomberBombState>());
        Assert.Empty(scene.World.Each<BomberFireZoneState>());
        using (var definition = BomberHfsmDefinitions.Compile(scene.World, BomberHfsmKind.Bomb))
        {
            BomberHfsmState state = scene.World.Get<BomberHfsmState>(bomb.Entity);
            Assert.Equal(BomberHfsmDefinitions.State.BombBurn,
                state.ReadSnapshot(definition, BomberHfsmKind.Bomb, state.MachineKey.Value).ActivePath[^1].State);
        }
        ulong burnEnd = bomb.BurnUntilTick.Value;
        while (scene.World.Tick <= burnEnd) scene.Manager.Tick();
        Assert.False(scene.World.IsLive(bombId));
        Assert.Empty(scene.World.Each<BomberBombState>());
    }

    [Fact]
    public void ActualOverlappingResidueWaitsOneContinuousSecondAndSettlesOneTrueEffectWithOriginalSource()
    {
        using var scene = Open();
        BomberBombState first = Fire(scene, scene.Lives[0], 7, 7);
        _ = Fire(scene, scene.Lives[1], 9, 7);
        scene.Manager.Tick(); scene.Manager.Tick();
        NetEntityId firstId = first.Entity;
        ulong dangerEnd = first.DangerUntilTick.Value;
        while (scene.World.Tick < dangerEnd) scene.Manager.Tick();
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(scene.Lives[2]), new Vector3(8.5f, 1.5f, 7.5f));
        scene.Manager.Tick();
        Assert.True(scene.World.IsLive(firstId), "Residue must remain an actual bomb entity during its exposure window.");
        Assert.Equal((int)BomberBombPhase.Burn, first.Phase.Value);
        Assert.Equal(6L, Health(scene, scene.Lives[2]));
        while (scene.World.Tick < dangerEnd + 20) scene.Manager.Tick();
        Assert.Equal(6L, Health(scene, scene.Lives[2]));
        scene.Manager.Tick();
        Assert.Equal(4L, Health(scene, scene.Lives[2]));
        scene.Manager.Tick();
        var applied = Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "damage_applied"), e =>
            e.GetProperty("lifeId").GetString() == scene.Lives[2].ToHex());
        Assert.Equal(first.Owner.Value.ToHex(), applied.GetProperty("sourceParticipantId").GetString());
        Assert.Equal(first.SourceLife.Value.ToHex(), applied.GetProperty("sourceLifeId").GetString());
        Assert.Equal("burn", applied.GetProperty("cause").GetString());
        Assert.True(scene.World.Get<BomberSkillState>(scene.Lives[2]).LastDamageTick.Value > 0);
    }

    private static long Health(BomberTerrainProductionTests.Scene scene, NetEntityId life) =>
        scene.World.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints);

    private static BomberTerrainProductionTests.Scene Open()
    {
        var scene = new BomberTerrainProductionTests.Scene(0);
        for (int z = 3; z <= 11; z++)
        for (int x = 3; x <= 11; x++) scene.Write(x, 1, z, 0);
        foreach (NetEntityId life in scene.Lives)
            BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(life), new Vector3(15.5f, 1.5f, 15.5f));
        return scene;
    }

    private static BomberBombState Fire(BomberTerrainProductionTests.Scene scene, NetEntityId source, int x, int z)
    {
        EntityOrder order = BomberEffectIntegrationTests.Bomb(scene.World, source, source, checked((ulong)(9100 + x)));
        BomberBombState bomb = order.Get<BomberBombState>();
        bomb.BombKind.Value = (int)BomberBombKind.ReservedFire;
        bomb.Power.Value = 1;
        bomb.CapacityReturned.Value = true;
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(x + .5f, 1.5f, z + .5f));
        return bomb;
    }
}
