using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Simulation;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class CharacterSelectionBoundaryTests
{
    [Theory]
    [InlineData(1u, 118001u, 0u, 1u)]
    [InlineData(2u, 118002u, 2u, 0u)]
    [InlineData(3u, 118003u, 3u, 0u)]
    [InlineData(4u, 118004u, 4u, 0u)]
    [InlineData(5u, 118005u, 13u, 0u)]
    public void FirstChoiceWaitsForInitialWarmupAndBindsConfiguredRole(
        uint alias, uint character, uint active, uint passive)
    {
        using WorldManager manager = BomberTestWorld.Start();
        EntityOrder[] orders = Enumerable.Range(0, 8)
            .Select(i => BomberTestWorld.QueuePlayer(manager.World, "first-choice-" + i)).ToArray();
        manager.Tick();
        NetEntityId life = orders[0].AssignedId;
        Assert.True(manager.World.Get<BomberPlayerState>(life).Participant.Value.IsDefault);
        Queue(manager, life, alias, 1);
        manager.Tick();
        Assert.Equal(0u, manager.World.Get<BomberSkillState>(life).CharacterId.Value);
        manager.Tick();

        World world = manager.World;
        BomberPlayerState player = world.Get<BomberPlayerState>(life);
        BomberParticipantState seat = world.Get<BomberParticipantState>(player.Participant.Value);
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        AttributeComponent attributes = world.Get<AttributeComponent>(life);
        Assert.Equal(BomberMatchPhase.Warmup, (BomberMatchPhase)world.Single<BomberMatchState>().Phase.Value);
        Assert.Equal((int)character, seat.SelectedForMatchCharacterId.Value);
        Assert.Equal(0, seat.NextCharacterId.Value);
        Assert.Equal(character, skill.CharacterId.Value);
        Assert.Equal(active, skill.ActiveSkillId.Value);
        Assert.Equal(passive, skill.PassiveSkillId.Value);
        Assert.Equal(active != 0, skill.ActiveSkillBound.Value);
        Assert.Equal(passive != 0, skill.PassiveSkillBound.Value);
        Assert.Equal(6, attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
        Assert.Equal(2, attributes.GetBaseValue(BomberAttributeNames.BombPower));
        Assert.Equal(1, attributes.GetBaseValue(BomberAttributeNames.BombCapacity));
    }

    [Fact]
    public void ResultsChoiceLatchesAtNextWarmupAndLateWarmupChoiceWaitsAnotherMatch()
    {
        using WorldManager manager = Started(out NetEntityId life);
        World world = manager.World;
        BomberPlayerState player = world.Get<BomberPlayerState>(life);
        BomberParticipantState seat = world.Get<BomberParticipantState>(player.Participant.Value);
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        BomberMatchState match = world.Single<BomberMatchState>();
        ulong cooldown = world.Tick + 1000;
        skill.CooldownUntilTick.Value = cooldown;
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick + 10;
        Queue(manager, life, 2, 1);
        manager.Tick();
        Assert.Equal(118002, seat.NextCharacterId.Value);
        Assert.Equal(0u, skill.CharacterId.Value);
        Assert.Equal(cooldown, skill.CooldownUntilTick.Value);

        match.PhaseEndTick.Value = world.Tick;
        manager.Tick();
        Assert.Equal(BomberMatchPhase.Warmup, (BomberMatchPhase)match.Phase.Value);
        Assert.Equal(118002, seat.SelectedForMatchCharacterId.Value);
        Assert.Equal(118002u, skill.CharacterId.Value);
        Assert.Equal(cooldown, skill.CooldownUntilTick.Value);

        Queue(manager, life, 3, 2);
        manager.Tick();
        Assert.Equal(118003, seat.NextCharacterId.Value);
        Assert.Equal(118002, seat.SelectedForMatchCharacterId.Value);
        Assert.Equal(118002u, skill.CharacterId.Value);
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick;
        manager.Tick();
        Assert.Equal(118003, seat.SelectedForMatchCharacterId.Value);
        Assert.Equal(118003u, skill.CharacterId.Value);
    }

    [Fact]
    public void LastAcceptedChoiceWinsAndWrongGenerationCannotChangeTheSeat()
    {
        using WorldManager manager = Started(out NetEntityId life);
        World world = manager.World;
        BomberPlayerState player = world.Get<BomberPlayerState>(life);
        BomberParticipantState seat = world.Get<BomberParticipantState>(player.Participant.Value);
        BomberMatchState match = world.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick + 20;
        Queue(manager, life, 2, 1);
        manager.Tick();
        Queue(manager, life, 5, 2);
        manager.Tick();
        Assert.Equal(118005, seat.NextCharacterId.Value);
        player.LifeGeneration.Value++;
        Queue(manager, life, 3, 3);
        manager.Tick();
        Assert.Equal(118005, seat.NextCharacterId.Value);
        player.LifeGeneration.Value = seat.LifeGeneration.Value;
        Queue(manager, life, 118006, 4);
        manager.Tick();
        Assert.Equal(118005, seat.NextCharacterId.Value);
        match.PhaseEndTick.Value = world.Tick;
        manager.Tick();
        Assert.Equal(118005, seat.SelectedForMatchCharacterId.Value);
    }

    [Fact]
    public void WrongLiveEntityAndStaleCurrentLifeReferencesRejectWithoutThrowing()
    {
        using WorldManager manager = Started(out NetEntityId life);
        World world = manager.World;
        BomberPlayerState player = world.Get<BomberPlayerState>(life);
        NetEntityId seatId = player.Participant.Value;
        BomberParticipantState seat = world.Get<BomberParticipantState>(seatId);
        NetEntityId otherLife = world.Each<BomberPlayerState>().First(other => other.Entity != life).Entity;
        var ability = new SelectCharacterAbility();
        var input = new SelectCharacterAbility.Input { CharacterId = 118002 };
        AbilityComponent owner = world.Get<AbilityComponent>(life);

        player.Participant.Value = otherLife;
        Assert.False(ability.CanActivate(input, owner, out string? wrongType));
        Assert.Equal("character_selection_stale_life", wrongType);
        player.Participant.Value = seatId;
        seat.CurrentLife.Value = otherLife;
        Assert.False(ability.CanActivate(input, owner, out string? wrongLife));
        Assert.Equal("character_selection_stale_life", wrongLife);
        seat.CurrentLife.Value = life;
        seat.LifeGeneration.Value++;
        Assert.False(ability.CanActivate(input, owner, out string? wrongGeneration));
        Assert.Equal("character_selection_stale_life", wrongGeneration);
        Assert.Equal(0, seat.NextCharacterId.Value);
    }

    [Fact]
    public void QueuedWrongEntityAndStaleCurrentLifeCannotChangeSeat()
    {
        using WorldManager manager = Started(out NetEntityId life);
        World world = manager.World;
        BomberPlayerState player = world.Get<BomberPlayerState>(life);
        BomberParticipantState seat = world.Get<BomberParticipantState>(player.Participant.Value);
        BomberMatchState match = world.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick + 20;

        Queue(manager, seat.Entity, 2, 1);
        manager.Tick();
        Assert.Equal(0, seat.NextCharacterId.Value);

        seat.CurrentLife.Value = default;
        Queue(manager, life, 2, 1);
        manager.Tick();
        Assert.Equal(0, seat.NextCharacterId.Value);
        Assert.Equal(0, player.NextCharacterId.Value);

        seat.CurrentLife.Value = life;
        Queue(manager, life, 3, 2);
        manager.Tick();
        Assert.Equal(118003, seat.NextCharacterId.Value);
    }

    [Fact]
    public void PendingChoiceSurvivesDestroyedLifeAndBindsReplacementAtWarmup()
    {
        using WorldManager manager = Started(out NetEntityId life);
        World world = manager.World;
        BomberParticipantState seat = world.Get<BomberParticipantState>(
            world.Get<BomberPlayerState>(life).Participant.Value);
        BomberMatchState match = world.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick + 10;
        Queue(manager, life, 5, 1);
        manager.Tick();
        Assert.Equal(118005, seat.NextCharacterId.Value);
        seat.CurrentLife.Value = default;
        world.Commands.Destroy(life);
        manager.Tick();
        Assert.False(world.IsLive(life));
        Assert.Equal(118005, seat.NextCharacterId.Value);

        match.PhaseEndTick.Value = world.Tick;
        manager.Tick();
        Assert.Equal(118005, seat.SelectedForMatchCharacterId.Value);
        EntityOrder replacement = BomberTestWorld.QueuePlayer(world, "replacement");
        manager.Tick();
        BomberPlayerState body = world.Get<BomberPlayerState>(replacement.AssignedId);
        seat.CurrentLife.Value = replacement.AssignedId;
        seat.LifeGeneration.Value = 2;
        body.LifeGeneration.Value = 2;
        manager.Tick();
        Assert.Equal(seat.Entity, body.Participant.Value);
        Assert.Equal(118005u, world.Get<BomberSkillState>(replacement.AssignedId).CharacterId.Value);
        Assert.Equal(13u, world.Get<BomberSkillState>(replacement.AssignedId).ActiveSkillId.Value);
    }

    [Fact]
    public void RespawnRestoresLatchedRoleAndPreservesPendingNextMatchChoice()
    {
        using WorldManager manager = Started(out NetEntityId life);
        World world = manager.World;
        BomberPlayerState player = world.Get<BomberPlayerState>(life);
        BomberParticipantState seat = world.Get<BomberParticipantState>(player.Participant.Value);
        BomberMatchState match = world.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.Results;
        match.PhaseEndTick.Value = world.Tick + 10;
        Queue(manager, life, 2, 1);
        manager.Tick();
        match.PhaseEndTick.Value = world.Tick;
        manager.Tick();
        Assert.Equal(118002, seat.SelectedForMatchCharacterId.Value);
        Queue(manager, life, 3, 2);
        manager.Tick();
        Assert.Equal(118003, seat.NextCharacterId.Value);
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        skill.CharacterId.Value = 0;
        skill.ActiveSkillId.Value = 0;
        skill.ActiveSkillBound.Value = false;
        player.LifePhase.Value = (int)BomberLifePhase.AwaitingRespawn;
        player.RespawnAtTick.Value = world.Tick;
        manager.Tick();
        manager.Tick();
        NetEntityId successor = seat.CurrentLife.Value;
        Assert.NotEqual(life, successor);
        BomberSkillState reboundSkill = world.Get<BomberSkillState>(successor);
        Assert.Equal(118002u, reboundSkill.CharacterId.Value);
        Assert.Equal(2u, reboundSkill.ActiveSkillId.Value);
        Assert.True(reboundSkill.ActiveSkillBound.Value);
        Assert.Equal(118003, seat.NextCharacterId.Value);
    }

    private static WorldManager Started(out NetEntityId life)
    {
        WorldManager manager = BomberTestWorld.Start();
        EntityOrder[] orders = Enumerable.Range(0, 8)
            .Select(i => BomberTestWorld.QueuePlayer(manager.World, "selection-" + i)).ToArray();
        manager.Tick(); manager.Tick(); manager.Tick();
        life = orders[0].AssignedId;
        return manager;
    }

    private static void Queue(WorldManager manager, NetEntityId life, uint character, uint sequence)
    {
        var args = new List<object?> { nameof(SelectCharacterAbility) };
        new SelectCharacterAbility.Input { CharacterId = character }.Write(args);
        args.Add(sequence.ToString(CultureInfo.InvariantCulture));
        MethodInfo encode = typeof(WireCodec).GetMethod("EncodeServerRpc", BindingFlags.Static | BindingFlags.NonPublic,
            null, new[] { typeof(string), typeof(string), typeof(object[]) }, null)!;
        byte[] payload = (byte[])encode.Invoke(null, new object[] { nameof(AbilityComponent), "Activate", args.ToArray() })!;
        manager.Enqueue(new InputCommandMessage(sequence, WireCodec.ServerRpc, life, payload));
    }
}
