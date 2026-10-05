using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberStatisticsProductionTests
{
    [Fact]
    public void RejectedHealthReservationDoesNotCountAndAcceptedSpecialPickupCountsOnce()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        var player = world.Get<BomberPlayerState>(lives[0]);
        var statistics = world.Get<BomberStatistics>(player.Participant.Value);
        EntityOrder rejected = BomberGrowthHealthTests.Item(world, lives[0], (int)BomberPickupKind.GoldenHeart);
        manager.Tick();
        world.Get<AbilityComponent>(lives[0]).Activate<PickupAbility, PickupAbility.Input>(new PickupAbility.Input { Target = rejected.AssignedId });
        world.Get<BomberPickupItem>(rejected.AssignedId).Kind.Value = -1;
        manager.Tick(); manager.Tick();
        Assert.Equal(0, statistics.Pickups.Value);
        Assert.True(world.Get<BomberPickupItem>(rejected.AssignedId).ClaimedBy.Value.IsDefault);
        var config = Lumio.Bomber.Gameplay.Config.BomberConfigBinding.For(world);
        uint skill = config.Tables.Skills.Rows.First(row =>
            Lumio.Bomber.Gameplay.Config.BomberSpecialBombResolver.TryResolve(config, row.Id, out _)).Id;
        EntityOrder accepted = BomberGrowthHealthTests.Item(world, lives[0], (int)BomberPickupKind.Skill);
        accepted.Get<BomberPickupItem>().SkillId.Value = skill;
        accepted.Get<BomberPickupItem>().SkillLevel.Value = 1;
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.False(world.IsLive(accepted.AssignedId));
        Assert.Equal(skill, world.Get<BomberSkillState>(lives[0]).BombSkillId.Value);
        Assert.Equal(1, statistics.Pickups.Value);
        Assert.Equal(0, statistics.PeakHats.Value);
        EntityOrder same = BomberGrowthHealthTests.Item(world, lives[0], (int)BomberPickupKind.Skill);
        same.Get<BomberPickupItem>().SkillId.Value = skill;
        same.Get<BomberPickupItem>().SkillLevel.Value = 1;
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.True(world.IsLive(same.AssignedId));
        Assert.Equal(1, statistics.Pickups.Value);
    }

    [Fact]
    public void WarmupAndPodiumDoNotAccumulateCrownTime()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        BomberGrowthHealthTests.Take(manager, lives[0], 0);
        var match = world.Single<BomberMatchState>();
        NetEntityId king = match.HatKing.Value;
        Assert.False(king.IsDefault);
        ulong held = world.Get<BomberStatistics>(king).HatKingTicks.Value;
        match.PhaseEndTick.Value = checked(world.Tick + 200);
        match.Phase.Value = (int)BomberMatchPhase.Warmup;
        manager.Tick(); manager.Tick();
        Assert.Equal(held, world.Get<BomberStatistics>(king).HatKingTicks.Value);
        match.Phase.Value = (int)BomberMatchPhase.Podium;
        manager.Tick(); manager.Tick();
        Assert.Equal(held, world.Get<BomberStatistics>(king).HatKingTicks.Value);
    }

    [Fact]
    public void AppliedPickupsAndPeakHatsAreCountedOnceAndPersistAcrossRestore()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        NetEntityId participant = world.Get<BomberPlayerState>(lives[0]).Participant.Value;
        for (int i = 0; i < 4; i++) BomberGrowthHealthTests.Take(manager, lives[0], 0);
        var statistics = world.Get<BomberStatistics>(participant);
        Assert.Equal(4, statistics.Pickups.Value);
        Assert.Equal(4, statistics.PeakHats.Value);
        EntityOrder capped = BomberGrowthHealthTests.Item(world, lives[0], 0);
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.True(world.IsLive(capped.AssignedId));
        Assert.Equal(4, statistics.Pickups.Value);
        Assert.Equal(4, statistics.PeakHats.Value);
        byte[] snapshot = manager.CaptureSnapshot();
        using WorldManager restored = BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance,
            config: Lumio.Bomber.Gameplay.Config.BomberConfigBinding.Load());
        Assert.Equal(4, restored.World.Get<BomberStatistics>(participant).Pickups.Value);
        Assert.Equal(4, restored.World.Get<BomberStatistics>(participant).PeakHats.Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void OnlyTheActualLethalEnemyHitEarnsOneKill(bool suicide)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        NetEntityId victim = world.Get<BomberPlayerState>(lives[0]).Participant.Value;
        NetEntityId killer = world.Get<BomberPlayerState>(lives[suicide ? 0 : 3]).Participant.Value;
        for (int i = 0; i < 4; i++)
            BomberEffectIntegrationTests.Bomb(world, lives[suicide ? 0 : i + 1], lives[0], checked((ulong)(3100 + i)));
        manager.Tick(); manager.Tick(); manager.Tick();
        Assert.False(world.IsLive(lives[0]));
        Assert.Single(BomberEffectIntegrationTests.Events(world, "death"));
        Assert.Equal(suicide ? 0 : 1, world.Get<BomberStatistics>(killer).Kills.Value);
        Assert.Equal(0, world.Get<BomberStatistics>(victim).Kills.Value);
        manager.Tick(); manager.Tick();
        Assert.Equal(suicide ? 0 : 1, world.Get<BomberStatistics>(killer).Kills.Value);
        Assert.Equal(suicide ? 0 : 1, world.Each<BomberStatistics>().Sum(s => s.Kills.Value));
    }

    [Fact]
    public void CrownPreservesTheIncumbentOnTiesAndCountsOnlyActualHeldTicks()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        var match = world.Single<BomberMatchState>();
        NetEntityId first = world.Get<BomberPlayerState>(lives[1]).Participant.Value;
        NetEntityId challenger = world.Get<BomberPlayerState>(lives[0]).Participant.Value;
        Assert.True(match.HatKing.Value.IsDefault);
        BomberGrowthHealthTests.Take(manager, lives[1], 0);
        Assert.Equal(first, match.HatKing.Value);
        BomberGrowthHealthTests.Take(manager, lives[0], 0);
        Assert.Equal(first, match.HatKing.Value);
        Assert.Single(BomberEffectIntegrationTests.Events(world, "hat_king_changed"));
        ulong held = world.Get<BomberStatistics>(first).HatKingTicks.Value;
        for (int i = 0; i < 5; i++) manager.Tick();
        Assert.Equal(held + 5, world.Get<BomberStatistics>(first).HatKingTicks.Value);
        Assert.Equal(0UL, world.Get<BomberStatistics>(challenger).HatKingTicks.Value);
        BomberGrowthHealthTests.Take(manager, lives[0], 1);
        Assert.Equal(challenger, match.HatKing.Value);
        Assert.Equal(2, BomberEffectIntegrationTests.Events(world, "hat_king_changed").Length);
        held = world.Get<BomberStatistics>(first).HatKingTicks.Value;
        manager.Tick(); manager.Tick();
        Assert.Equal(held, world.Get<BomberStatistics>(first).HatKingTicks.Value);
    }
}
