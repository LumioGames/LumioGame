using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFiniteBubbleTests
{
    [Fact]
    public void FrozenBubbleCapacityCoversEveryPublishedRowControlAndPayload()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        EffectLimits limits = GasWorldContext.Require(scene.World).EffectLimits;
        Assert.Equal(256, limits.PendingRequests);
        Assert.Equal(24, limits.LiveRows);
        Assert.Equal(3, limits.PerTargetRows);
        Assert.Equal(56, limits.PendingControls);
        Assert.Equal(192, limits.MaxPayloadBytes);
        Assert.Equal(360, limits.ResultRecords);
        Assert.Equal(6000, limits.ReducerWrites);
        Assert.True(limits.ResultRecords >= limits.PendingRequests + limits.PendingControls + 2 * limits.LiveRows);
    }
    [Fact]
    public void ActualBubbleCastUsesARealFiniteEffectBeforePublicProjection()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        NetEntityId life = scene.Lives[0];
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows.Single(r => r.Id == 118002));
        ulong start = world.Tick;
        new UseActiveSkillAbility().Execute(default, world.Get<AbilityComponent>(life));
        Assert.Equal(0UL, skill.BubbleUntilTick.Value);
        Assert.Equal(0UL, skill.CooldownUntilTick.Value);
        scene.TickControlled();
        var active = Assert.Single(world.Get<EffectComponent>(life).ActiveEffects);
        Assert.Equal(10107u, active.TypeId);
        Assert.Equal(life, active.Source);
        Assert.Equal(life, active.Target);
        Assert.Equal(start, active.AppliedTick);
        Assert.False(active.Suppressed);
        Assert.Equal(active.EndTick, skill.BubbleUntilTick.Value);
    }

    [Fact]
    public void AnEditedPresentationProjectionCannotGrantBubbleProtection()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        NetEntityId life = scene.Lives[0];
        world.Get<BomberSkillState>(life).BubbleUntilTick.Value = world.Tick + 5000;
        Assert.Empty(world.Get<EffectComponent>(life).ActiveEffects);
        BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], life, 8101);
        scene.TickControlled(); scene.TickControlled();
        Assert.Equal(4, world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void NativeBubbleOwnsProtectionAndExpiryDespitePresentationEdits()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        NetEntityId life = scene.Lives[0];
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows.Single(r => r.Id == 118002));
        new UseActiveSkillAbility().Execute(default, world.Get<AbilityComponent>(life));
        scene.TickControlled(); scene.TickControlled();
        var active = Assert.Single(world.Get<EffectComponent>(life).ActiveEffects);
        skill.BubbleUntilTick.Value = 0;
        Assert.False(new PlaceBombAbility().CanActivate(default, world.Get<AbilityComponent>(life), out string? reason));
        Assert.Equal("player_control_locked", reason);
        BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], life, 8102);
        scene.TickControlled(); scene.TickControlled();
        Assert.Equal(6, world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints));
        while (world.Tick < active.EndTick) scene.TickControlled();
        skill.BubbleUntilTick.Value = world.Tick + 5000;
        BomberEffectIntegrationTests.Bomb(world, scene.Lives[1], life, 8103);
        scene.TickControlled(); scene.TickControlled();
        Assert.Empty(world.Get<EffectComponent>(life).ActiveEffects);
        Assert.Equal(0UL, skill.BubbleUntilTick.Value);
        Assert.Equal(4, world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void PairedCheckpointPreservesActualBubbleIdentityAndRemainingLifetime(bool removeEarly)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId life, withMap: true, persistence: true);
        World world = manager.World;
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows.Single(r => r.Id == 118002));
        new UseActiveSkillAbility().Execute(default, world.Get<AbilityComponent>(life));
        manager.Tick(); manager.Tick();
        var active = Assert.Single(world.Get<EffectComponent>(life).ActiveEffects);
        Assert.True(world.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture();
        Assert.True(captured.Succeeded, captured.ErrorCode);
        using WorldManager restored = BomberTestWorld.RestorePaired(captured.Checkpoint!.Value);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        var restoredActive = Assert.Single(restored.World.Get<EffectComponent>(life).ActiveEffects);
        // The owner rebinds a cold restore to a fresh WorldId; the original
        // allocation identity and lifetime survive (Runtime FiniteEffectRestoreTests).
        Assert.NotEqual(active.Handle.WorldId, restoredActive.Handle.WorldId);
        Assert.Equal(GasWorldContext.Require(restored.World).WorldId, restoredActive.Handle.WorldId);
        Assert.Equal(active.Handle.InstanceId, restoredActive.Handle.InstanceId);
        Assert.Equal(active.Handle.Generation, restoredActive.Handle.Generation);
        Assert.Equal(active.AppliedTick, restoredActive.AppliedTick);
        Assert.Equal(active.EndTick, restoredActive.EndTick);
        Assert.False(Effects.Remove(restored.World, active.Handle).Succeeded);
        manager.Tick(); restored.Tick();
        Assert.Equal(restoredActive.Handle.WorldId.Value, restored.World.Get<BomberSkillState>(life).BubbleEffectWorld.Value);
        if (removeEarly)
        {
            ulong cooldown = restored.World.Get<BomberSkillState>(life).CooldownUntilTick.Value;
            Assert.True(Effects.Remove(restored.World, restoredActive.Handle).Succeeded);
            restored.Tick();
            Assert.Empty(restored.World.Get<EffectComponent>(life).ActiveEffects);
            Assert.Equal(0UL, restored.World.Get<BomberSkillState>(life).BubbleUntilTick.Value);
            Assert.Equal(cooldown, restored.World.Get<BomberSkillState>(life).CooldownUntilTick.Value);
            Assert.Equal(0, restored.World.Get<BomberSkillState>(life).BubbleOutcome.Value);
            return;
        }
        while (world.Tick <= active.EndTick)
        {
            manager.Tick(); restored.Tick();
            Assert.Equal(BomberFiniteSkills.HasBubble(world, life), BomberFiniteSkills.HasBubble(restored.World, life));
            Assert.Equal(world.Get<BomberSkillState>(life).BubbleUntilTick.Value, restored.World.Get<BomberSkillState>(life).BubbleUntilTick.Value);
        }
        Assert.Empty(world.Get<EffectComponent>(life).ActiveEffects);
        Assert.Empty(restored.World.Get<EffectComponent>(life).ActiveEffects);
    }

    [Fact]
    public void NextMatchWaitsForRealFiniteRemovalBeforeClearingItsCorrelation()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        NetEntityId life = scene.Lives[0];
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows.Single(r => r.Id == 118002));
        new UseActiveSkillAbility().Execute(default, world.Get<AbilityComponent>(life));
        scene.TickControlled(); scene.TickControlled();
        var active = Assert.Single(world.Get<EffectComponent>(life).ActiveEffects);
        var match = world.Single<BomberMatchState>();
        ulong oldMatch = match.MatchId.Value;
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick;
        Assert.False(BomberRoundTransition.Prepare(world));
        Assert.Equal(active.Handle.InstanceId.Value, skill.BubbleEffectInstance.Value);
        Assert.Equal(oldMatch, match.MatchId.Value);
        scene.TickControlled();
        Assert.Empty(world.Get<EffectComponent>(life).ActiveEffects);
        for (int i = 0; i < 12 && match.MatchId.Value == oldMatch; i++) scene.TickControlled();
        Assert.Equal(oldMatch + 1, match.MatchId.Value);
        Assert.Equal(0UL, skill.BubbleEffectWorld.Value + skill.BubbleEffectInstance.Value + skill.BubbleUntilTick.Value);
        Assert.Equal(0u, skill.BubbleEffectGeneration.Value);
        Assert.Equal(0, skill.BubbleOutcome.Value);
    }

    [Fact]
    public void EightActualParticipantsCanHoldAndRemoveTheirFiniteBubblesTogether()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        foreach (NetEntityId life in scene.Lives)
        {
            var skill = world.Get<BomberSkillState>(life);
            SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows.Single(r => r.Id == 118002));
            new UseActiveSkillAbility().Execute(default, world.Get<AbilityComponent>(life));
        }
        scene.TickControlled(); scene.TickControlled();
        Assert.Equal(8, world.Each<EffectComponent>().Sum(c => c.ActiveEffects.Count));
        foreach (NetEntityId life in scene.Lives)
        {
            var effect = Assert.Single(world.Get<EffectComponent>(life).ActiveEffects);
            Assert.True(Effects.Remove(world, effect.Handle).Succeeded);
        }
        scene.TickControlled();
        Assert.Equal(0, world.Each<EffectComponent>().Sum(c => c.ActiveEffects.Count));
        Assert.All(scene.Lives, life => Assert.Equal(0UL, world.Get<BomberSkillState>(life).BubbleUntilTick.Value));
    }

    [Fact]
    public void RefusedFiniteAdmissionCannotSpendCooldownOrPublishCast()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, controlled: true);
        World world = scene.World;
        NetEntityId life = scene.Lives[0];
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows.Single(r => r.Id == 118002));
        var player = world.Get<BomberPlayerState>(life);
        var p = new BomberBubbleEffect.Parameters { Duration = 70, Fx = "bomber.bubble", Life = life, Participant = player.Participant.Value,
            Generation = player.LifeGeneration.Value, MatchId = world.Single<BomberMatchState>().MatchId.Value };
        EffectHandleResult last = default;
        int admitted = 0, maximum = GasWorldContext.Require(world).EffectLimits.PendingRequests;
        for (int i = 0; i <= maximum; i++)
        {
            last = Effects.Apply<BomberBubbleEffect, BomberBubbleEffect.Parameters>(world, life, in p, life);
            if (!last.Succeeded) break;
            admitted++;
        }
        Assert.InRange(admitted, 1, maximum);
        Assert.False(last.Succeeded);
        Assert.Equal("effect_admission_capacity", last.GeneratedErrorId);
        new UseActiveSkillAbility().Execute(default, world.Get<AbilityComponent>(life));
        Assert.Equal(0UL, skill.CooldownUntilTick.Value);
        Assert.Equal(0UL, skill.BubbleUntilTick.Value);
        Assert.Equal(0, skill.BubbleOutcome.Value);
        scene.TickControlled(); scene.TickControlled();
        Assert.Empty(world.Get<EffectComponent>(life).ActiveEffects);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "skill_cast"));
        Assert.Equal(0, world.Get<BomberStatistics>(player.Participant.Value).SkillCasts.Value);
    }
}
