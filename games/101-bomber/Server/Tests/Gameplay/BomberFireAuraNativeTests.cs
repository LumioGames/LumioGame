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
public sealed class BomberFireAuraNativeTests
{
    [Fact]
    public void ActualFiniteAuraAppliedOwnsProjectionCooldownAndProtectionRemoval()
    {
        using var scene = Open();
        var life = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        life.ProtectedUntilTick.Value = scene.World.Tick + 500;
        var request = StageFixture(scene);
        ulong submitted = scene.World.Tick;
        scene.Manager.Tick();
        var actual = Assert.Single(scene.World.Get<EffectComponent>(life.Entity).ActiveEffects);
        Assert.Equal(10111u, actual.TypeId);
        Assert.Equal(life.Entity, actual.Source);
        Assert.Equal(life.Entity, actual.Target);
        Assert.Equal(submitted, actual.AppliedTick);
        var skill = scene.World.Get<BomberSkillState>(life.Entity);
        Assert.Equal(actual.EndTick, skill.AuraUntilTick.Value);
        Assert.Equal(submitted, skill.CooldownFromTick.Value);
        Assert.Equal(submitted + skill.AuraCooldownTicks.Value, skill.CooldownUntilTick.Value);
        Assert.Equal(0UL, life.ProtectedUntilTick.Value);
        Assert.Equal(request.Handle.InstanceId, actual.Handle.InstanceId);
    }

    [Theory]
    [InlineData("participant")]
    [InlineData("match")]
    public void ActualAuraWithADifferentCapturedSourceIsRejectedWithoutCastSideEffects(string mutation)
    {
        using var scene = Open();
        var life = scene.World.Get<BomberPlayerState>(scene.Lives[0]);
        life.ProtectedUntilTick.Value = scene.World.Tick + 500;
        ulong protectedUntil = life.ProtectedUntilTick.Value;
        _ = StageFixture(scene, mutation);
        scene.Manager.Tick();
        Assert.DoesNotContain(scene.World.Get<EffectComponent>(life.Entity).ActiveEffects, row => row.TypeId == 10111u);
        var skill = scene.World.Get<BomberSkillState>(life.Entity);
        Assert.Equal(0UL, skill.AuraUntilTick.Value);
        Assert.Equal(0UL, skill.CooldownUntilTick.Value);
        Assert.Equal(protectedUntil, life.ProtectedUntilTick.Value);
    }

    [Fact]
    public void ActualNativeAuraCoverageWaitsOneSecondBeforeOneTrueBurnPulse()
    {
        using var scene = Open();
        _ = StageFixture(scene);
        scene.Manager.Tick();
        var source = scene.Lives[0];
        Assert.Contains(scene.World.Get<EffectComponent>(source).ActiveEffects, row => row.TypeId == 10111u);
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(scene.Lives[2]), new Vector3(6.5f, 1.5f, 5.5f));
        scene.Manager.Tick();
        ulong started = scene.World.Tick - 1;
        while (scene.World.Tick < started + 20) scene.Manager.Tick();
        var attributes = scene.World.Get<AttributeComponent>(scene.Lives[2]);
        Assert.Equal(6L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
        scene.Manager.Tick();
        Assert.Equal(4L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
        var facts = scene.World.Get<BomberFireFacts>(scene.World.Get<BomberPlayerState>(scene.Lives[2]).Participant.Value);
        Assert.Equal(10110u, facts.FireTypeId[0]);
        Assert.Equal(1, facts.FireStatus[0]);
        Assert.True(facts.FireReady[0]);
        Assert.Equal(2, facts.FireSourceKind[0]);
        Assert.Equal(source, facts.FireSource[0]);
        Assert.Equal(source, facts.FireSourceLife[0]);
        Assert.Equal(2L, facts.FireActual[0]);
    }

    [Fact]
    public void PairedNativeAuraRestoreRebindsTheActualHandleAndExpiresItsProjection()
    {
        using var scene = Open(persistence: true);
        var request = StageFixture(scene);
        scene.Manager.Tick(); scene.Manager.Tick();
        var actual = Assert.Single(scene.World.Get<EffectComponent>(scene.Lives[0]).ActiveEffects);
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture();
        Assert.True(captured.Succeeded, captured.ErrorCode);
        using var restored = BomberTestWorld.RestorePaired(captured.Checkpoint!.Value);
        var resumed = Assert.Single(restored.World.Get<EffectComponent>(scene.Lives[0]).ActiveEffects);
        Assert.Equal(actual.Handle.InstanceId, resumed.Handle.InstanceId);
        Assert.Equal(actual.Handle.Generation, resumed.Handle.Generation);
        Assert.Equal(actual.AppliedTick, resumed.AppliedTick);
        Assert.Equal(actual.EndTick, resumed.EndTick);
        Assert.NotEqual(request.Handle.WorldId, resumed.Handle.WorldId);
        restored.Tick();
        var skill = restored.World.Get<BomberSkillState>(scene.Lives[0]);
        Assert.Equal(resumed.Handle.WorldId.Value, skill.AuraEffectWorld.Value);
        Assert.Equal(resumed.EndTick, skill.AuraUntilTick.Value);
        while (restored.World.Tick <= resumed.EndTick) restored.Tick();
        Assert.Empty(restored.World.Get<EffectComponent>(scene.Lives[0]).ActiveEffects);
        Assert.Equal(0UL, skill.AuraUntilTick.Value);
    }

    private static BomberTerrainProductionTests.Scene Open(bool persistence = false)
    {
        var scene = BomberSplitBombProductionTests.Open(persistence);
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(scene.Lives[0]), new Vector3(5.5f, 1.5f, 5.5f));
        return scene;
    }

    private static EffectHandleResult StageFixture(BomberTerrainProductionTests.Scene scene, string? mutation = null)
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
        // This stages the finite Effect contract directly. It is an explicit
        // request-correlation fixture, not proof of the guarded public producer.
        var p = new BomberFireAuraEffect.Parameters { Duration = duration, Fx = "bomber.fire-aura",
            Participant = participant.Entity, Life = life.Entity, Generation = life.LifeGeneration.Value,
            MatchId = participant.MatchId.Value, Favorite = false, ChainId = chain };
        if (mutation == "participant") p.Participant = world.Get<BomberPlayerState>(scene.Lives[1]).Participant.Value;
        if (mutation == "match") p.MatchId++;
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
}
