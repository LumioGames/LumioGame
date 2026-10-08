using System.Linq;
using System;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFireExposureReviewTests
{
    [Fact]
    public void AnActualCoverageGapDiscardsPartialExposureBeforeReentry()
    {
        using var scene = Open();
        var bomb = BeginBurn(scene);
        Enter(scene);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        Assert.Equal(6L, Health(scene));
        Move(scene, 15, 15);
        scene.Manager.Tick();
        var facts = scene.World.Get<BomberSkillState>(scene.Lives[2]);
        Assert.True(facts.FireExposureEntity.Value.IsDefault);
        Move(scene, 8, 7);
        scene.Manager.Tick();
        ulong restarted = facts.FireExposureFromTick.Value;
        while (scene.World.Tick < restarted + 20) scene.Manager.Tick();
        Assert.Equal(6L, Health(scene));
        scene.Manager.Tick();
        Assert.Equal(4L, Health(scene));
        Assert.Equal(bomb.Entity, PulseFacts(scene.World, scene.Lives[2]).FireSource[0]);
        Assert.Equal(1UL, facts.FirePulseSequence.Value);
    }

    [Fact]
    public void RealNativeBubbleProtectionClearsExistingBurnExposure()
    {
        using var scene = Open();
        _ = BeginBurn(scene);
        Enter(scene);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        var life = scene.Lives[2];
        var skill = scene.World.Get<BomberSkillState>(life);
        Assert.False(skill.FireExposureEntity.Value.IsDefault);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(scene.World).Tables.Characters.Rows.Single(c => c.Id == 118002));
        new UseActiveSkillAbility().Execute(default, scene.World.Get<AbilityComponent>(life));
        scene.Manager.Tick(); scene.Manager.Tick();
        Assert.Contains(scene.World.Get<EffectComponent>(life).ActiveEffects, row => row.TypeId == 10107u);
        Assert.True(skill.FireExposureEntity.Value.IsDefault);
        Assert.Equal(0UL, skill.FireExposureFromTick.Value);
        Assert.Equal(6L, Health(scene));
        Assert.Empty(BomberEffectIntegrationTests.Events(scene.World, "damage_applied"));
    }

    [Fact]
    public void PairedRestoreKeepsActualBurnAndPartialExposureUntilOneTruePulse()
    {
        using var scene = Open(persistence: true);
        var bomb = BeginBurn(scene);
        Enter(scene);
        for (int i = 0; i < 4; i++) scene.Manager.Tick();
        var facts = scene.World.Get<BomberSkillState>(scene.Lives[2]);
        ulong started = facts.FireExposureFromTick.Value;
        Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture();
        Assert.True(captured.Succeeded, captured.ErrorCode);
        using var restored = BomberTestWorld.RestorePaired(captured.Checkpoint!.Value);
        var resumed = restored.World.Get<BomberSkillState>(scene.Lives[2]);
        Assert.Equal(started, resumed.FireExposureFromTick.Value);
        Assert.Equal(bomb.Entity, resumed.FireExposureEntity.Value);
        while (restored.World.Tick < started + 20) restored.Tick();
        Assert.Equal(6L, restored.World.Get<AttributeComponent>(scene.Lives[2]).GetBaseValue(BomberAttributeNames.HealthPoints));
        restored.Tick();
        Assert.Equal(4L, restored.World.Get<AttributeComponent>(scene.Lives[2]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var pulse = PulseFacts(restored.World, scene.Lives[2]);
        Assert.Equal(1, pulse.FireStatus[0]);
        Assert.True(pulse.FireReady[0]);
        Assert.Equal(10110u, pulse.FireTypeId[0]);
        Assert.Equal(bomb.Entity, pulse.FireSource[0]);
        Assert.Equal(2L, pulse.FireActual[0]);
        Assert.Equal(1UL, resumed.FirePulseSequence.Value);
    }

    [Fact]
    public void ActualLethalBurnFactCrossesTheExistingDeathStructureBarrier()
    {
        using var scene = Open();
        var bomb = BeginBurn(scene);
        var target = scene.Lives[2];
        var life = scene.World.Get<BomberPlayerState>(target);
        var participant = scene.World.Get<BomberParticipantState>(life.Participant.Value);
        var attributes = scene.World.Get<AttributeComponent>(target);
        attributes.SetBaseValue(BomberAttributeNames.HealthPoints, 2);
        attributes.SetCurrentValue(BomberAttributeNames.HealthPoints, 2);
        Enter(scene, 2);
        var skill = scene.World.Get<BomberSkillState>(target);
        var facts = PulseFacts(scene.World, target);
        ulong started = skill.FireExposureFromTick.Value;
        while (scene.World.Tick <= started + 20) scene.Manager.Tick();
        Assert.Equal(0L, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(1, facts.FireStatus[0]);
        Assert.True(facts.FireReady[0]);
        Assert.Equal(10110u, facts.FireTypeId[0]);
        Assert.Equal(bomb.Entity, facts.FireSource[0]);
        Assert.Equal(2L, facts.FireBefore[0]);
        Assert.Equal(0L, facts.FireAfter[0]);
        Assert.Equal(2L, facts.FireActual[0]);
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, life.LifePhase.Value);
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, participant.LifePhase.Value);
        Assert.True(participant.DeathStructurePending.Value);
        Assert.Equal(target, participant.DeathStructureLife.Value);
        Assert.Equal(life.LifeGeneration.Value, participant.DeathStructureGeneration.Value);
        scene.Manager.Tick();
        Assert.False(scene.World.IsLive(target));
        var death = Assert.Single(BomberEffectIntegrationTests.Events(scene.World, "death"), e =>
            e.GetProperty("lifeId").GetString() == target.ToHex());
        Assert.Equal("burn", death.GetProperty("cause").GetString());
        Assert.Equal(bomb.SourceLife.Value.ToHex(), death.GetProperty("sourceLifeId").GetString());
    }

    [Theory]
    [InlineData("future-clock")]
    [InlineData("source-participant")]
    [InlineData("source-chain")]
    public void CorruptSelectedExposureFailsHydrationWithoutChangingItsSourceSnapshot(string mutation)
    {
        using var scene = Open();
        _ = BeginBurn(scene);
        Enter(scene);
        var facts = scene.World.Get<BomberSkillState>(scene.Lives[2]);
        switch (mutation)
        {
            case "future-clock": facts.FireExposureLastTick.Value = scene.World.Tick + 1; break;
            case "source-participant": facts.FireExposureParticipant.Value =
                scene.World.Get<BomberPlayerState>(scene.Lives[1]).Participant.Value; break;
            case "source-chain": facts.FireExposureChainId.Value++; break;
            default: throw new InvalidOperationException("Unknown exposure mutation.");
        }
        byte[] snapshot = scene.Manager.CaptureSnapshot();
        BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() => BomberTestWorld.Restore(snapshot,
            GeneratedRegistry.Instance, config: BomberConfigBinding.Load()));
        Assert.Equal(snapshot, scene.Manager.CaptureSnapshot());
    }

    private static BomberTerrainProductionTests.Scene Open(bool persistence = false) => BomberSplitBombProductionTests.Open(persistence);

    private static BomberBombState BeginBurn(BomberTerrainProductionTests.Scene scene)
    {
        var order = BomberEffectIntegrationTests.Bomb(scene.World, scene.Lives[0], scene.Lives[0], 9301);
        var bomb = order.Get<BomberBombState>();
        bomb.BombKind.Value = (int)BomberBombKind.ReservedFire;
        bomb.Power.Value = 1;
        bomb.CapacityReturned.Value = true;
        BomberEffectIntegrationTests.Position(order.Get<LogicTransform>(), new Vector3(7.5f, 1.5f, 7.5f));
        scene.Manager.Tick(); scene.Manager.Tick();
        ulong dangerEnd = bomb.DangerUntilTick.Value;
        while (scene.World.Tick < dangerEnd) scene.Manager.Tick();
        return bomb;
    }

    private static void Enter(BomberTerrainProductionTests.Scene scene, long expectedHealth = 6)
    {
        Move(scene, 8, 7);
        scene.Manager.Tick();
        Assert.Equal((int)BomberBombPhase.Burn, Assert.Single(scene.World.Each<BomberBombState>()).Phase.Value);
        Assert.Equal(expectedHealth, Health(scene));
    }

    private static void Move(BomberTerrainProductionTests.Scene scene, int x, int z) =>
        BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(scene.Lives[2]), new Vector3(x + .5f, 1.5f, z + .5f));

    private static long Health(BomberTerrainProductionTests.Scene scene) =>
        scene.World.Get<AttributeComponent>(scene.Lives[2]).GetBaseValue(BomberAttributeNames.HealthPoints);

    private static BomberFireFacts PulseFacts(World world, NetEntityId life) =>
        world.Get<BomberFireFacts>(world.Get<BomberPlayerState>(life).Participant.Value);
}
