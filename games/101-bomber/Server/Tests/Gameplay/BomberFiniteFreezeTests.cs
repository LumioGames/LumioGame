using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Hosting;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberFiniteFreezeTests
{
    // Input-focused tests keep their terrain setup. Their status comes from the
    // production damage fact and the real Native settlement, never an Until edit.
    internal static EffectHandle FreezeForInputFixture(WorldManager manager, NetEntityId life)
    {
        World world = manager.World;
        var player = world.Get<BomberPlayerState>(life);
        player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        player.ProtectedUntilTick.Value = 0;
        world.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Running;
        NetEntityId source = world.Each<BomberPlayerState>().First(p => p.Entity != life).Entity;
        var order = BomberEffectIntegrationTests.Bomb(world, source, source, 260);
        order.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        order.Get<BomberBombState>().FuseEndTick.Value = world.Tick + 100;
        manager.Tick();
        var bomb = world.Get<BomberBombState>(order.AssignedId);
        var position = world.Get<LogicTransform>(life).LocalPosition;
        BomberEffectBusiness.ReserveDamage(world, world.Single<BomberMatchState>(), bomb, player,
            BomberMatchRules.CellX(position), BomberMatchRules.CellZ(position));
        BomberEffectBusiness.SubmitDamage(world, bomb);
        manager.Tick();
        return Assert.Single(world.Get<EffectComponent>(life).ActiveEffects, row => row.TypeId == 10108u).Handle;
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void FreezeContactRejectsAsAWholeAtTheRequestCapacityBoundaryAndRetries(int remainingRequests)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives, WireProfile.SuccessorBindingReceiptsPartsV1);
        World world = manager.World;
        var bomb = BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 250);
        bomb.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick();
        var fillerLife = world.Get<BomberPlayerState>(lives[7]);
        var filler = new BomberInventoryEffect.Parameters {
            Available = 1, Capacity = 1, Fx = "", Life = fillerLife.Entity, Participant = fillerLife.Participant.Value,
            Generation = fillerLife.LifeGeneration.Value, MatchId = world.Single<BomberMatchState>().MatchId.Value };
        int capacity = GasWorldContext.Require(world).EffectLimits.PendingRequests;
        for (int i = 0; i < capacity - remainingRequests; i++)
        {
            var admitted = Effects.Apply<BomberInventoryEffect, BomberInventoryEffect.Parameters>(world, fillerLife.Entity, in filler, fillerLife.Entity);
            Assert.True(admitted.Succeeded, $"Filler {i}: {admitted.GeneratedErrorId}");
        }
        manager.Tick();
        Assert.Equal(6, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Empty(world.Get<EffectComponent>(lives[0]).ActiveEffects);
        var facts = world.Get<BomberDamageFacts>(bomb.AssignedId);
        int row = Enumerable.Range(0, facts.Target.Count).Single(i => facts.Target[i] == lives[0]);
        Assert.Equal(2, facts.Status[row]);
        Assert.False(facts.Ready[row]);
        Assert.False(world.Get<BomberBombState>(bomb.AssignedId).HitDependentsAdmitted[row]);
        manager.Tick();
        Assert.Equal(4, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10108u);
        Assert.Equal(1, facts.Status[0]);
        Assert.True(facts.Ready[0]);
        Assert.True(world.Get<BomberBombState>(bomb.AssignedId).HitDependentsAdmitted[0]);
    }

    [Theory]
    [InlineData(false, 1)]
    [InlineData(false, 2)]
    [InlineData(true, 1)]
    [InlineData(true, 2)]
    public void BreakingFreezeRequiresDamageAndImmunityAdmissionWithoutAnImpossibleRefreeze(bool freezeBomb, int remainingRequests)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives, WireProfile.SuccessorBindingReceiptsPartsV1);
        World world = manager.World;
        EntityOrder first = BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 251);
        first.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick(); manager.Tick();
        ulong dangerEnd = world.Get<BomberBombState>(first.AssignedId).DangerUntilTick.Value;
        while (world.Tick <= dangerEnd) manager.Tick();
        var frozen = Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects);
        EntityOrder second = BomberEffectIntegrationTests.Bomb(world, lives[2], lives[0], 252);
        if (freezeBomb) second.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick();
        FillRequests(world, lives[7], remainingRequests);
        manager.Tick();
        bool accepted = remainingRequests == 2;
        Assert.Equal(accepted ? 2 : 4, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var facts = world.Get<BomberDamageFacts>(second.AssignedId);
        Assert.Equal(accepted ? 1 : 2, facts.Status[0]);
        Assert.Equal(accepted, facts.Ready[0]);
        Assert.Equal(accepted, world.Get<BomberBombState>(second.AssignedId).HitDependentsAdmitted[0]);
        if (!accepted)
        {
            Assert.Equal(frozen.Handle, Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects).Handle);
            manager.Tick();
        }
        Assert.Equal(2, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var immunity = Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10109u);
        Assert.Equal(20UL, immunity.Duration);
        Assert.Equal(0UL, world.Get<BomberSkillState>(lives[0]).FrozenUntilTick.Value);
        manager.Tick();
        Assert.DoesNotContain(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10108u);
        Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10109u);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void QueuedFreezeRejectsDestroyedOrChangedLifeBeforeDamageSettlement(bool destroy)
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        EntityOrder order = BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 253);
        order.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        order.Get<BomberBombState>().FuseEndTick.Value = world.Tick + 100;
        manager.Tick();
        var bomb = world.Get<BomberBombState>(order.AssignedId);
        var player = world.Get<BomberPlayerState>(lives[0]);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        var position = world.Get<LogicTransform>(lives[0]).LocalPosition;
        BomberEffectBusiness.ReserveDamage(world, world.Single<BomberMatchState>(), bomb, player,
            BomberMatchRules.CellX(position), BomberMatchRules.CellZ(position));
        BomberEffectBusiness.SubmitDamage(world, bomb);
        Assert.True(bomb.HitDependentsAdmitted[0]);
        if (destroy) world.Commands.Destroy(lives[0]);
        else { player.LifeGeneration.Value++; participant.LifeGeneration.Value++; }
        manager.Tick();
        var facts = world.Get<BomberDamageFacts>(order.AssignedId);
        Assert.Equal(2, facts.Status[0]);
        Assert.False(facts.Ready[0]);
        if (destroy) Assert.False(world.IsLive(lives[0]));
        else
        {
            Assert.Equal(6, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
            Assert.Empty(world.Get<EffectComponent>(lives[0]).ActiveEffects);
        }
        manager.Tick();
        Assert.Equal(0, bomb.HitParticipants.Count);
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "damage_applied"));
    }

    internal static void FillRequests(World world, NetEntityId life, int remaining)
    {
        var player = world.Get<BomberPlayerState>(life);
        var filler = new BomberInventoryEffect.Parameters {
            Available = 1, Capacity = 1, Fx = "", Life = life, Participant = player.Participant.Value,
            Generation = player.LifeGeneration.Value, MatchId = world.Single<BomberMatchState>().MatchId.Value };
        int capacity = GasWorldContext.Require(world).EffectLimits.PendingRequests;
        for (int i = 0; i < capacity - remaining; i++)
        {
            var admitted = Effects.Apply<BomberInventoryEffect, BomberInventoryEffect.Parameters>(world, life, in filler, life);
            Assert.True(admitted.Succeeded, $"Filler {i}: {admitted.GeneratedErrorId}");
        }
    }

    [Fact]
    public void OfficialNoDamageProfileFreezesWithoutHealthLossOrBreakingItsOwnFreeze()
    {
        string config = System.IO.Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "Server/Config/Profiles/freeze-no-damage");
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives, configDirectory: config);
        World world = manager.World;
        Assert.False(BomberConfigBinding.For(world).SkillRules.FreezeBombDamages);
        EntityOrder first = BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 254);
        first.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick(); manager.Tick();
        var active = Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10108u);
        Assert.Equal(6, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var fact = world.Get<BomberDamageFacts>(first.AssignedId);
        Assert.True(fact.Ready[0]);
        Assert.Equal(1, fact.Status[0]);
        Assert.Equal(0L, fact.Actual[0]);
        EntityOrder second = BomberEffectIntegrationTests.Bomb(world, lives[2], lives[0], 255);
        second.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick(); manager.Tick();
        var still = Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects);
        Assert.Equal(active.Handle, still.Handle);
        Assert.Equal(active.EndTick, still.EndTick);
        Assert.Equal(6, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        manager.Tick();
        Assert.Empty(BomberEffectIntegrationTests.Events(world, "damage_applied"));
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public void PairedCheckpointPreservesFreezeOrImmunityAndRebindsOnlyItsOwnerHandle(bool immunity, bool removeEarly)
    {
        using WorldManager manager = SkillAuthorityTests.StartedMatch(out NetEntityId life, withMap: true, persistence: true);
        World world = manager.World;
        world.Single<BomberMatchState>().Phase.Value = (int)BomberMatchPhase.Running;
        var player = world.Get<BomberPlayerState>(life);
        player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
        player.ProtectedUntilTick.Value = 0;
        NetEntityId source = world.Each<BomberPlayerState>().First(p => p.Entity != life).Entity;
        var first = BomberEffectIntegrationTests.Bomb(world, source, life, 240);
        first.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick(); manager.Tick();
        if (immunity)
        {
            BomberEffectIntegrationTests.Bomb(world, source, life, 241);
            manager.Tick(); manager.Tick(); manager.Tick();
        }
        uint type = immunity ? 10109u : 10108u;
        var active = Assert.Single(world.Get<EffectComponent>(life).ActiveEffects);
        Assert.Equal(type, active.TypeId);
        Assert.Equal(immunity ? 2L : 4L, world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.True(world.TryGetService<WorldPersistenceSubsystem>(out var persistence));
        var captured = persistence!.Capture();
        Assert.True(captured.Succeeded, captured.ErrorCode);
        using WorldManager restored = BomberTestWorld.RestorePaired(captured.Checkpoint!.Value);
        Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
        var actual = Assert.Single(restored.World.Get<EffectComponent>(life).ActiveEffects);
        Assert.NotEqual(active.Handle.WorldId, actual.Handle.WorldId);
        Assert.Equal(active.Handle.InstanceId, actual.Handle.InstanceId);
        Assert.Equal(active.Handle.Generation, actual.Handle.Generation);
        Assert.Equal(active.EndTick, actual.EndTick);
        Assert.False(Effects.Remove(restored.World, active.Handle).Succeeded);
        restored.Tick();
        var skill = restored.World.Get<BomberSkillState>(life);
        Assert.Equal(actual.Handle.WorldId.Value, immunity ? skill.FreezeImmunityEffectWorld.Value : skill.FreezeEffectWorld.Value);
        Assert.Equal(actual.EndTick, immunity ? skill.FreezeImmuneUntilTick.Value : skill.FrozenUntilTick.Value);
        if (removeEarly)
        {
            Assert.True(Effects.Remove(restored.World, actual.Handle).Succeeded);
            restored.Tick();
        }
        else while (restored.World.Tick <= actual.EndTick) restored.Tick();
        Assert.Empty(restored.World.Get<EffectComponent>(life).ActiveEffects);
        Assert.Equal(0UL, immunity ? skill.FreezeImmuneUntilTick.Value : skill.FrozenUntilTick.Value);
    }

    [Fact]
    public void BubbleRejectsFreezeDamageAndBothStatusRequests()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        var skill = world.Get<BomberSkillState>(lives[0]);
        SelectCharacterAbility.BindCharacter(skill, BomberConfigBinding.For(world).Tables.Characters.Rows.Single(r => r.Id == 118002));
        new UseActiveSkillAbility().Execute(default, world.Get<AbilityComponent>(lives[0]));
        manager.Tick();
        var bomb = BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 242);
        bomb.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick(); manager.Tick();
        Assert.Equal(6, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(10107u, Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects).TypeId);
        Assert.Equal(0UL, skill.FrozenUntilTick.Value + skill.FreezeImmuneUntilTick.Value);
    }

    [Fact]
    public void ANewFreezeOnTheOldExpiryTickKeepsTheNewOwnerProjection()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        var first = BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 230);
        first.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick(); manager.Tick();
        var old = Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects);
        while (world.Tick < old.EndTick - 1) manager.Tick();
        var next = BomberEffectIntegrationTests.Bomb(world, lives[2], lives[0], 231);
        next.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick(); manager.Tick();
        var active = Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects);
        Assert.NotEqual(old.Handle, active.Handle);
        Assert.Equal(old.EndTick, active.AppliedTick);
        Assert.Equal(10108u, active.TypeId);
        Assert.Equal(active.EndTick, world.Get<BomberSkillState>(lives[0]).FrozenUntilTick.Value);
        Assert.Equal(2, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
    }

    [Fact]
    public void SurvivingFreezeBlastCreatesSameTickOwnerRowAndIgnoresProjectionTampering()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        EntityOrder order = BomberEffectIntegrationTests.Bomb(world, lives[1], lives[0], 201);
        order.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        manager.Tick(); manager.Tick();
        var frozen = Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10108u);
        Assert.Equal(world.Tick - 1, frozen.AppliedTick);
        Assert.Equal(40UL, frozen.Duration);
        Assert.Equal(frozen.AppliedTick + 40, frozen.EndTick);
        Assert.Equal(4, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var damage = world.Get<BomberDamageFacts>(order.AssignedId);
        int row = Enumerable.Range(0, damage.Target.Count).Single(i => damage.Target[i] == lives[0]);
        Assert.True(damage.Ready[row]);
        Assert.Equal(damage.Tick[row], frozen.AppliedTick);
        world.Get<BomberSkillState>(lives[0]).FrozenUntilTick.Value = 0;
        Assert.False(new MoveAbility().CanActivate(new MoveAbility.Input { PrimaryDirection = BomberDirection.Right }, world.Get<AbilityComponent>(lives[0]), out string? reason));
        Assert.Equal("player_frozen", reason);
        while (world.Tick <= frozen.EndTick) manager.Tick();
        Assert.DoesNotContain(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10108u);
        world.Get<BomberSkillState>(lives[0]).FrozenUntilTick.Value = world.Tick + 100;
        Assert.True(new MoveAbility().CanActivate(new MoveAbility.Input { PrimaryDirection = BomberDirection.Right }, world.Get<AbilityComponent>(lives[0]), out reason), reason);
    }

    [Fact]
    public void LaterSameTickDamageBreaksFreezeAndCreatesOwnerImmunityWithoutRefreezing()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        foreach (int source in new[] { 1, 2 })
        {
            var bomb = BomberEffectIntegrationTests.Bomb(world, lives[source], lives[0], (ulong)(210 + source));
            bomb.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        }
        manager.Tick(); manager.Tick();
        Assert.Equal(2, world.Get<AttributeComponent>(lives[0]).GetBaseValue(BomberAttributeNames.HealthPoints));
        var immune = Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10109u);
        Assert.Equal(world.Tick - 1, immune.AppliedTick);
        Assert.Equal(20UL, immune.Duration);
        Assert.Equal(0UL, world.Get<BomberSkillState>(lives[0]).FrozenUntilTick.Value);
        Assert.True(new MoveAbility().CanActivate(new MoveAbility.Input { PrimaryDirection = BomberDirection.Right }, world.Get<AbilityComponent>(lives[0]), out string? reason), reason);
        manager.Tick();
        Assert.DoesNotContain(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10108u);
        Assert.Single(world.Get<EffectComponent>(lives[0]).ActiveEffects, row => row.TypeId == 10109u);
    }

    [Fact]
    public void LethalFreezeBlastNeverCreatesASuccessorStatus()
    {
        using WorldManager manager = BomberEffectIntegrationTests.Start(out NetEntityId[] lives);
        World world = manager.World;
        foreach (int source in new[] { 1, 2, 3 })
        {
            var bomb = BomberEffectIntegrationTests.Bomb(world, lives[source], lives[0], (ulong)(220 + source));
            bomb.Get<BomberBombState>().BombKind.Value = (int)BomberBombKind.Freeze;
        }
        manager.Tick(); manager.Tick();
        Assert.Equal((int)BomberLifePhase.AwaitingRespawn, world.Get<BomberPlayerState>(lives[0]).LifePhase.Value);
        manager.Tick();
        Assert.False(world.IsLive(lives[0]));
    }
}
