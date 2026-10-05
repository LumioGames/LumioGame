using System;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFireAuraProductionFixTests
{
    [Theory]
    [InlineData("generation")]
    [InlineData("family")]
    [InlineData("started")]
    public void SelectedActualBombExposureRejectsOtherSourceTupleOnRestore(string mutation)
    {
        using var scene = BomberSplitBombProductionTests.Open();
        _ = BeginBurn(scene);
        Move(scene, 2, 8, 7);
        scene.Manager.Tick();
        // The second normal tick also makes this a nonempty source on the original candidate.
        scene.Manager.Tick();
        var skill = scene.World.Get<BomberSkillState>(scene.Lives[2]);
        Assert.False(skill.FireExposureEntity.Value.IsDefault);
        switch (mutation)
        {
            case "generation": skill.FireExposureGeneration.Value++; break;
            case "family": skill.FireExposureFamily.Value = (int)BomberBombKind.Standard; break;
            case "started": skill.FireExposureStartedTick.Value++; break;
            default: throw new InvalidOperationException();
        }
        byte[] before = scene.Manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(before,
            GeneratedRegistry.Instance, config: BomberConfigBinding.Load()));
        Assert.Equal(before, scene.Manager.CaptureSnapshot());
    }

    [Theory]
    [InlineData("life")]
    [InlineData("generation")]
    [InlineData("chain")]
    public void ActualAuraRejectsAnotherCapturedLifeGenerationOrChain(string mutation)
    {
        using var scene = BomberSplitBombProductionTests.Open();
        Move(scene, 0, 5, 5);
        var source = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        source.ProtectedUntilTick.Value = scene.World.Tick + 500;
        ulong protection = source.ProtectedUntilTick.Value;
        _ = StageAura(scene, mutation);
        scene.Manager.Tick();
        Assert.DoesNotContain(scene.World.Get<EffectComponent>(source.Entity).ActiveEffects, row => row.TypeId == 10111u);
        var skill = scene.World.Get<BomberSkillState>(source.Entity);
        Assert.Equal(0UL, skill.AuraUntilTick.Value);
        Assert.Equal(0UL, skill.CooldownUntilTick.Value);
        Assert.Equal(protection, source.ProtectedUntilTick.Value);
    }

    [Fact]
    public void ActualAuraFollowsItsSourceAndNeverBurnsTheCaster()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        Move(scene, 0, 5, 5);
        _ = StageAura(scene);
        scene.Manager.Tick();
        Move(scene, 2, 6, 5);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.False(scene.World.Get<BomberSkillState>(scene.Lives[2]).FireExposureEntity.Value.IsDefault);
        Move(scene, 0, 10, 10);
        scene.Manager.Tick();
        Assert.True(scene.World.Get<BomberSkillState>(scene.Lives[2]).FireExposureEntity.Value.IsDefault);
        Move(scene, 2, 9, 10);
        scene.Manager.Tick();
        ulong started = scene.World.Get<BomberSkillState>(scene.Lives[2]).FireExposureFromTick.Value;
        while (scene.World.Tick <= started + 20) scene.Manager.Tick();
        Assert.Equal(4L, Health(scene, 2));
        Assert.Equal(6L, Health(scene, 0));
        var facts = scene.World.Get<BomberFireFacts>(scene.World.Get<BomberPlayerState>(scene.Lives[2]).Participant.Value);
        Assert.Equal(scene.Lives[0], facts.FireSource[0]);
        Assert.Equal(2, facts.FireSourceKind[0]);
    }

    [Fact]
    public void ActualAuraNeverCoversANativeBrickCell()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        Move(scene, 0, 5, 5);
        _ = StageAura(scene);
        scene.Manager.Tick();
        scene.Write(6, 1, 5, 1025u << 8);
        Move(scene, 2, 6, 5);
        for (int i = 0; i < 22; i++) scene.Manager.Tick();
        Assert.Equal(6L, Health(scene, 2));
        Assert.True(scene.World.Get<BomberSkillState>(scene.Lives[2]).FireExposureEntity.Value.IsDefault);
        Assert.Empty(BomberEffectIntegrationTests.Events(scene.World, "damage_applied"));
    }

    [Fact]
    public void ActualLethalExplosionEndsCasterAuraBeforeAnotherBurnPulse()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        Move(scene, 0, 5, 5);
        var source = scene.Lives[0];
        var attributes = scene.World.Get<AttributeComponent>(source);
        attributes.SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        attributes.SetCurrentValue(BomberAttributeNames.HealthPoints, 2);
        _ = StageAura(scene);
        scene.Manager.Tick();
        Move(scene, 2, 4, 4);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.False(scene.World.Get<BomberSkillState>(scene.Lives[2]).FireExposureEntity.Value.IsDefault);
        _ = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[1], source, 9601);
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Equal(0L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, scene.World.Get<BomberPlayerState>(source).LifePhase.Value);
        scene.Manager.Tick();
        Assert.False(scene.World.IsLive(source));
        Assert.DoesNotContain(scene.World.Each<EffectComponent>().SelectMany(component => component.ActiveEffects),
            row => row.TypeId == 10111u && row.Source == source);
        for (int i = 0; i < 21; i++) scene.Manager.Tick();
        Assert.Equal(6L, Health(scene, 2));
        Assert.True(scene.World.Get<BomberSkillState>(scene.Lives[2]).FireExposureEntity.Value.IsDefault);
    }

    [Fact]
    public void ActualAuraRemovalClearsCoverageBeforeAnotherBurnPulse()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        Move(scene, 0, 5, 5);
        var request = StageAura(scene);
        scene.Manager.Tick();
        Move(scene, 2, 6, 5);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.True(Effects.Remove(scene.World, request.Handle).Succeeded);
        scene.Manager.Tick();
        Assert.DoesNotContain(scene.World.Get<EffectComponent>(scene.Lives[0]).ActiveEffects, row => row.TypeId == 10111u);
        for (int i = 0; i < 21; i++) scene.Manager.Tick();
        Assert.Equal(6L, Health(scene, 2));
        Assert.True(scene.World.Get<BomberSkillState>(scene.Lives[2]).FireExposureEntity.Value.IsDefault);
        Assert.Equal(0UL, scene.World.Get<BomberSkillState>(scene.Lives[0]).AuraUntilTick.Value);
    }

    [Fact]
    public void ActualAuraRefreshKeepsTheSameRequestAndUsesItsActualNewEnd()
    {
        using var scene = BomberSplitBombProductionTests.Open();
        Move(scene, 0, 5, 5);
        var request = StageAura(scene);
        scene.Manager.Tick();
        var before = Assert.Single(scene.World.Get<EffectComponent>(scene.Lives[0]).ActiveEffects);
        for (int i = 0; i < 5; i++) scene.Manager.Tick();
        Assert.True(Effects.Refresh(scene.World, request.Handle).Succeeded);
        scene.Manager.Tick();
        var refreshed = Assert.Single(scene.World.Get<EffectComponent>(scene.Lives[0]).ActiveEffects);
        Assert.Equal(before.Handle, refreshed.Handle);
        Assert.Equal(before.AppliedTick, refreshed.AppliedTick);
        Assert.True(refreshed.EndTick > before.EndTick);
        Move(scene, 2, 6, 5);
        scene.Manager.Tick();
        Assert.Equal(refreshed.EndTick, scene.World.Get<BomberSkillState>(scene.Lives[0]).AuraUntilTick.Value);
        ulong started = scene.World.Get<BomberSkillState>(scene.Lives[2]).FireExposureFromTick.Value;
        while (scene.World.Tick <= started + 20) scene.Manager.Tick();
        Assert.Equal(4L, Health(scene, 2));
    }

    [Fact]
    public void ActualBombExposureRetainsDeadOriginalSourceLifeAcrossPairedRestore()
    {
        using var scene = BomberSplitBombProductionTests.Open(persistence: true);
        var bomb = BeginBurn(scene);
        var oldSource = scene.Lives[0];
        var attributes = scene.World.Get<AttributeComponent>(oldSource);
        attributes.SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        attributes.SetCurrentValue(BomberAttributeNames.HealthPoints, 2);
        Move(scene, 0, 8, 7);
        Move(scene, 2, 8, 7);
        scene.Manager.Tick();
        ulong started = scene.World.Get<BomberSkillState>(oldSource).FireExposureFromTick.Value;
        while (scene.World.Tick <= started + 20) scene.Manager.Tick();
        scene.Manager.Tick();
        Assert.False(scene.World.IsLive(oldSource));
        Assert.Equal(oldSource, bomb.SourceLife.Value);
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture();
        Assert.True(captured.Succeeded, captured.ErrorCode);
        using var restored = BomberTestWorld.RestorePaired(captured.Checkpoint!.Value);
        var exposure = restored.World.Get<BomberSkillState>(scene.Lives[2]);
        Assert.Equal(bomb.Entity, exposure.FireExposureEntity.Value);
        Assert.Equal(oldSource, exposure.FireExposureLife.Value);
        restored.Tick();
        Assert.Equal(oldSource, exposure.FireExposureLife.Value);
        Assert.Equal(4L, restored.World.Get<AttributeComponent>(scene.Lives[2]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    private static BomberBombState BeginBurn(BomberTerrainProductionTests.Scene scene)
    {
        var entity = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[0], scene.Lives[0], 9501);
        var bomb = entity.Get<BomberBombState>();
        bomb.BombKind.Value = (int)BomberBombKind.ReservedFire;
        bomb.Power.Value = 1;
        bomb.CapacityReturned.Value = true;
        BomberEffectIntegrationTests.Position(entity.Get<LogicTransform>(), new Vector3(7.5f, 1.5f, 7.5f));
        scene.Manager.Tick(); scene.Manager.Tick();
        while (scene.World.Tick < bomb.DangerUntilTick.Value) scene.Manager.Tick();
        return bomb;
    }

    private static EffectHandleResult StageAura(BomberTerrainProductionTests.Scene scene, string? mutation = null)
    {
        var world = scene.World;
        var life = world.Get<BomberPlayerState>(scene.Lives[0]);
        var participant = world.Get<BomberParticipantState>(life.Participant.Value);
        var skill = world.Get<BomberSkillState>(life.Entity);
        var config = BomberConfigBinding.For(world);
        SelectCharacterAbility.BindCharacter(skill, config.Tables.Characters.Rows.Single(c => c.Id == 118004));
        var level = config.SkillLevel(4, 1);
        var runtime = world.Single<BomberWorldRuntime>();
        ulong chain = checked(runtime.NextChainId.Value + 1);
        runtime.NextChainId.Value = chain;
        ulong duration = Ticks.FromMilliseconds(level.DurationMs, config.Game.TickRateHz);
        var p = new BomberFireAuraEffect.Parameters { Duration = duration, Fx = "bomber.fire-aura",
            Participant = participant.Entity, Life = life.Entity, Generation = life.LifeGeneration.Value,
            MatchId = participant.MatchId.Value, Favorite = false, ChainId = chain };
        if (mutation == "life") p.Life = scene.Lives[1];
        if (mutation == "generation") p.Generation++;
        if (mutation == "chain") p.ChainId++;
        var request = Effects.Apply<BomberFireAuraEffect, BomberFireAuraEffect.Parameters>(world, life.Entity, in p, life.Entity);
        Assert.True(request.Succeeded);
        skill.AuraEffectWorld.Value = request.Handle.WorldId.Value;
        skill.AuraEffectInstance.Value = request.Handle.InstanceId.Value;
        skill.AuraEffectGeneration.Value = request.Handle.Generation;
        skill.AuraDurationTicks.Value = duration;
        skill.AuraCooldownTicks.Value = Ticks.FromMilliseconds(level.CooldownMs, config.Game.TickRateHz);
        skill.AuraChainId.Value = chain;
        skill.AuraFavorite.Value = false;
        skill.AuraCastX.Value = 5; skill.AuraCastZ.Value = 5;
        skill.AuraOutcome.Value = 1;
        return request;
    }

    private static void Move(BomberTerrainProductionTests.Scene scene, int slot, int x, int z) =>
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(scene.Lives[slot]), new Vector3(x + .5f, 1.5f, z + .5f));

    private static long Health(BomberTerrainProductionTests.Scene scene, int slot) =>
        scene.World.Get<AttributeComponent>(scene.Lives[slot]).GetBaseValue(BomberAttributeNames.HealthPoints);
}
