using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberDurableHighlightsTests
{
    [Fact]
    public void TickSettlementRetainsDeadCharacterAndFinalOneHeartSurvivorThenNextMatchClearsCounters()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        // Rollover must receive real terrain receipts; an unloaded section intentionally retains blast arms.
        BomberTestWorld.LoadTerrainMap(manager);
        World world = manager.World;
        NetEntityId victim = world.Get<BomberPlayerState>(lives[0]).Participant.Value;
        NetEntityId survivor = world.Get<BomberPlayerState>(lives[1]).Participant.Value;
        var match = world.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.Warmup;
        match.PhaseEndTick.Value = world.Tick + 200;
        world.Get<AbilityComponent>(lives[0]).Activate<SelectCharacterAbility, SelectCharacterAbility.Input>(
            new SelectCharacterAbility.Input { CharacterId = 4 });
        manager.Tick();
        Assert.Equal(118004, world.Get<BomberStatistics>(victim).CharacterId.Value);
        match.Phase.Value = (int)BomberMatchPhase.Running;
        EntityOrder special = BomberGrowthHealthTests.Item(world, lives[0], (int)BomberPickupKind.Skill);
        special.Get<BomberPickupItem>().SkillId.Value = 6;
        special.Get<BomberPickupItem>().SkillLevel.Value = 1;
        manager.Tick(); manager.Tick(); manager.Tick();
        BomberGrowthHealthTests.Take(manager, lives[0], (int)BomberPickupKind.GoldenHeart);
        BomberEffectIntegrationTests.ScheduleFinalCircle(world);
        for (int i = 0; i < 5; i++) BomberEffectIntegrationTests.Bomb(world, lives[2], lives[0], checked((ulong)(4400 + i)));
        for (int i = 0; i < 2; i++) BomberEffectIntegrationTests.Bomb(world, lives[2], lives[1], checked((ulong)(4410 + i)));
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.False(world.IsLive(lives[0]));
        Assert.Equal(2L, world.Get<AttributeComponent>(lives[1]).GetBaseValue(BomberAttributeNames.HealthPoints));
        match.PhaseEndTick.Value = world.Tick + 1;
        manager.Tick(); manager.Tick();
        Assert.Equal((int)BomberMatchPhase.Podium, match.Phase.Value);
        var results = world.Single<BomberResults>();
        for (int i = 0; i < 8 && results.PublishedGeneration.Value == 0; i++) manager.Tick();
        var completed = Assert.Single(results.ReadRetained(lives.Length));
        BomberResultRow dead = completed.Rows.Single(row => row.Participant == victim);
        Assert.Equal(118004, dead.Character);
        Assert.Equal(1, dead.Deaths);
        Assert.Equal(8, dead.PeakHealthPoints);
        Assert.Equal(1, dead.GoldenHeartPickups);
        Assert.Equal("6", dead.SpecialBombHistory);
        Assert.Equal(1, completed.Rows.Single(row => row.Participant == survivor).ClutchEscapes);
        Assert.Equal(0, world.Get<BomberStatistics>(survivor).ClutchEscapes.Value);
        byte[] saved = manager.CaptureSnapshot();
        using (WorldManager restored = BomberTestWorld.Restore(saved, GeneratedRegistry.Instance, config: BomberConfigBinding.Load()))
        {
            BomberCompletedMatch recovered = Assert.Single(restored.World.Single<BomberResults>().ReadRetained(lives.Length));
            Assert.Equal(completed.Rows.ToArray(), recovered.Rows.ToArray());
        }
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick;
        for (int i = 0; i < 80 && match.MatchId.Value == completed.MatchId; i++) manager.Tick();
        var runtime = world.Single<BomberWorldRuntime>();
        Assert.True(match.MatchId.Value > completed.MatchId,
            $"Rollover remained at {world.Tick}: phase={match.Phase.Value}, transactions={runtime.PendingVoxelTransactionIds.Count}, initial={runtime.InitialResourcePhase.Value}, " +
            $"bombs={world.Each<BomberBombState>().Count()}, health={world.Each<BomberHealthFacts>().Count(f => f.TypeId.Count != 0 && f.TypeId[0] != 0)}, " +
            $"death={world.Each<BomberParticipantState>().Count(p => p.DeathStructurePending.Value)}, effects={world.Each<EffectComponent>().Sum(e => e.ActiveEffects.Count)}, " +
            string.Join(";", world.Each<BomberBombState>().Select(b =>
                $"phase={b.Phase.Value}/danger={b.DangerUntilTick.Value}/continuations={b.TerrainContinuations.Count}/hits={string.Join(',', b.HitStates.Values)}")));
        foreach (BomberStatistics statistics in world.Each<BomberStatistics>())
        {
            Assert.Equal(0, statistics.Deaths.Value);
            Assert.Equal(0, statistics.BossKills.Value);
            Assert.Equal(0, statistics.ClutchEscapes.Value);
            Assert.Equal(0, statistics.GoldenHeartPickups.Value);
            Assert.Empty(statistics.SpecialBombHistory.Values);
        }
        Assert.Equal(completed.Rows.ToArray(), Assert.Single(results.ReadRetained(lives.Length)).Rows.ToArray());
    }

    [Theory]
    [InlineData("0")]
    [InlineData("06")]
    [InlineData("6,6")]
    [InlineData("6,7,10,11,12,13,14")]
    [InlineData("4294967296")]
    [InlineData("6, 7")]
    public void MalformedBoundedHistoryIsRejected(string text) =>
        Assert.Throws<InvalidOperationException>(() => BomberSpecialBombHistory.Decode(text));

    [Fact]
    public void MaximumUIntHistoryIsCanonicalAndRoundTripsAllSixPositions()
    {
        uint[] values = Enumerable.Range(0, 6).Select(offset => uint.MaxValue - checked((uint)offset)).ToArray();
        string text = BomberSpecialBombHistory.Encode(values);
        Assert.Equal(65, text.Length);
        Assert.Equal(values, BomberSpecialBombHistory.Decode(text));
        Assert.Equal(string.Empty, BomberSpecialBombHistory.Encode(Array.Empty<uint>()));
    }

    [Fact]
    public void SuccessfulGoldenGrowthAndHealingRestoreAllHighlightsWithoutEventHistory()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        manager.Tick();
        var player = world.Get<BomberPlayerState>(lives[0]);
        var stats = world.Get<BomberStatistics>(player.Participant.Value);
        Assert.Equal(BomberGrowth.InitialHealth, stats.PeakHealthPoints.Value);
        BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 4101);
        BomberEffectIntegrationTests.Bomb(world, lives[2], lives[0], 4102);
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.Equal(2L, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        BomberGrowthHealthTests.Take(manager, lives[0], (int)BomberPickupKind.Health);
        Assert.Equal(1, stats.ClutchEscapes.Value);
        for (int i = 0; i < 3; i++) BomberGrowthHealthTests.Take(manager, lives[0], (int)BomberPickupKind.GoldenHeart);
        Assert.Equal(3, stats.GoldenHeartPickups.Value);
        Assert.Equal(12, stats.PeakHealthPoints.Value);
        manager.Tick(); manager.Tick();
        Assert.Equal(1, stats.ClutchEscapes.Value);
        byte[] before = manager.CaptureSnapshot();
        using WorldManager restored = BomberTestWorld.Restore(before, GeneratedRegistry.Instance, config: BomberConfigBinding.Load());
        var retained = restored.World.Get<BomberStatistics>(player.Participant.Value);
        Assert.Equal(3, retained.GoldenHeartPickups.Value);
        Assert.Equal(12, retained.PeakHealthPoints.Value);
        Assert.Equal(1, retained.ClutchEscapes.Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void LethalBossDamageCountsOneDeathAndOnlyAnEnemyBossKill(bool suicide)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        NetEntityId victim = world.Get<BomberPlayerState>(lives[0]).Participant.Value;
        NetEntityId killerLife = lives[suicide ? 0 : 1];
        NetEntityId killer = world.Get<BomberPlayerState>(killerLife).Participant.Value;
        for (int i = 0; i < 3; i++) BomberGrowthHealthTests.Take(manager, lives[0], (int)BomberPickupKind.GoldenHeart);
        for (int i = 0; i < 7; i++) BomberEffectIntegrationTests.Bomb(world, killerLife, lives[0], checked((ulong)(4200 + i)));
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.False(world.IsLive(lives[0]));
        Assert.Equal(1, world.Get<BomberStatistics>(victim).Deaths.Value);
        Assert.Equal(suicide ? 0 : 1, world.Get<BomberStatistics>(killer).BossKills.Value);
        Assert.Equal(12, world.Get<BomberStatistics>(victim).PeakHealthPoints.Value);
        manager.Tick(); manager.Tick();
        Assert.Equal(1, world.Get<BomberStatistics>(victim).Deaths.Value);
        Assert.Equal(0, world.Get<BomberStatistics>(victim).ClutchEscapes.Value);
    }

    [Fact]
    public void SpecialBombHistoryPreservesFirstAcquisitionOrderAcrossReplacementAndDeath()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives, WireProfile.SuccessorBindingV1);
        World world = manager.World;
        var config = BomberConfigBinding.For(world);
        uint[] skills = config.Tables.Skills.Rows.Where(row => BomberSpecialBombResolver.TryResolve(config, row.Id, out _))
            .Select(row => row.Id).Take(2).ToArray();
        Assert.Equal(2, skills.Length);
        var stats = world.Get<BomberStatistics>(world.Get<BomberPlayerState>(lives[0]).Participant.Value);
        foreach (uint skill in new[] { skills[0], skills[1], skills[0] })
        {
            EntityOrder order = BomberGrowthHealthTests.Item(world, lives[0], (int)BomberPickupKind.Skill);
            order.Get<BomberPickupItem>().SkillId.Value = skill;
            order.Get<BomberPickupItem>().SkillLevel.Value = 1;
            manager.Tick(); manager.Tick(); manager.Tick();
            Assert.Equal(skill, world.Get<BomberSkillState>(lives[0]).BombSkillId.Value);
        }
        Assert.Equal(skills, stats.SpecialBombHistory.Values.ToArray());
        for (int i = 0; i < 4; i++) BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], checked((ulong)(4300 + i)));
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.Equal(0L, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(1, stats.Deaths.Value);
        Assert.Equal(skills, stats.SpecialBombHistory.Values.ToArray());
    }
}
