using System;
using System.IO;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberSpeedGrowthTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("speed-3300")]
    [InlineData("speed-3800")]
    public void EverySpeedPickupChangesActualNativeMovementThroughTheConfiguredCap(string? profile)
    {
        string? directory = profile is null ? null : Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Server/Config/Profiles", profile);
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true, configDirectory: directory);
        World world = scene.World;
        NetEntityId life = scene.Lives[0];
        IBomberConfig config = BomberConfigBinding.For(world);
        for (int tier = 0; tier <= 8; tier++)
        {
            if (tier != 0) BomberGrowthHealthTests.Take(scene.Manager, life, (int)BomberPickupKind.Speed);
            Assert.Equal(tier, world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.SpeedTier));
            AssertActualMovement(scene, life, config.SpeedTier(tier).SpeedMilli);
        }
    }

    [Fact]
    public void RealSuccessorAndNextMatchRestoreTheirOwnConfiguredMovementSpeed()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        IBomberConfig config = BomberConfigBinding.For(world);
        NetEntityId old = scene.Lives[0];
        var participant = world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(old).Participant.Value);
        for (int i = 0; i < 8; i++) BomberGrowthHealthTests.Take(scene.Manager, old, (int)BomberPickupKind.Speed);
        for (ulong chain = 12000; chain < 12005; chain++) BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], old, chain);
        ulong wait = Ticks.FromMilliseconds(config.Life.RespawnMs, config.Game.TickRateHz) + 20;
        for (ulong i = 0; i < wait && participant.CurrentLife.Value == old; i++) scene.TickControlled();
        NetEntityId current = participant.CurrentLife.Value;
        Assert.NotEqual(old, current);
        Assert.True(world.IsLive(current));
        Assert.Equal(2UL, participant.LifeGeneration.Value);
        Assert.True(scene.ControlledBinding!.TryResolveConnectionState("successor-0", out NetEntityId controlled, out _));
        Assert.Equal(current, controlled);
        long tier = world.Get<AttributeComponent>(current).GetBaseValue(BomberAttributeNames.SpeedTier);
        Assert.InRange(tier, 1, 8);
        AssertActualMovement(scene, current, config.SpeedTier(tier).SpeedMilli);
        BomberRoundRolloverTests.EndRound(scene);
        Assert.Equal(0, world.Get<AttributeComponent>(participant.CurrentLife.Value).GetBaseValue(BomberAttributeNames.SpeedTier));
        Assert.Equal(config.SpeedTier(0).SpeedMilli, world.Get<AttributeComponent>(participant.CurrentLife.Value).GetBaseValue(BomberAttributeNames.MovementSpeedMilli));
    }

    private static void AssertActualMovement(BomberTerrainProductionTests.Scene scene, NetEntityId life, long speed)
    {
        for (int x = 4; x <= 11; x++)
        {
            scene.Write(x, 0, 5, 1022u << 8);
            scene.Write(x, 1, 5, 0);
        }
        scene.TickControlled();
        World world = scene.World;
        BomberEffectIntegrationTests.Position(world.Get<LogicTransform>(life), new Vector3(5.5f, 1.5f, 5.5f));
        var attributes = world.Get<AttributeComponent>(life);
        Assert.Equal(speed, attributes.GetBaseValue(BomberAttributeNames.MovementSpeedMilli));
        Assert.Equal(speed, attributes.GetCurrentValue(BomberAttributeNames.MovementSpeedMilli));
        Assert.True(world.Get<AbilityComponent>(life).Activate<MoveAbility, MoveAbility.Input>(
            new MoveAbility.Input { PrimaryDirection = BomberDirection.Right }).Succeeded);
        scene.TickControlled();
        float actual = world.Get<LogicTransform>(life).LocalPosition.X - 5.5f;
        double expected = speed / 1000d / BomberConfigBinding.For(world).Game.TickRateHz;
        Assert.InRange(Math.Abs(actual - expected), 0, 0.00001);
    }
}
