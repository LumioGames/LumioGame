using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class CharacterConfigTests
{
    [Theory]
    [InlineData(5u)]
    [InlineData(118005u)]
    public void FifthCharacterBindsOneActiveLevelAndPreservesEveryAttribute(uint characterId)
    {
        using var scene = new BomberTerrainProductionTests.Scene(0);
        WorldManager manager = scene.Manager;
        var world = manager.World;
        var entity = scene.Lives[0];
        // This case covers next-round selection. Initial unbound entry is covered separately.
        BomberMatchState match = world.Single<BomberMatchState>();
        match.Phase.Value = (int)BomberMatchPhase.Results;
        var tables = BomberConfigBinding.For(world).Tables;
        var attributes = world.Get<AttributeComponent>(entity);
        var seeds = tables.Attributes.Rows.ToDictionary(row => row.Name, row => attributes.GetBaseValue(row.Name));
        var owner = world.Get<AbilityComponent>(entity);
        var ability = new SelectCharacterAbility();
        var input = new SelectCharacterAbility.Input { CharacterId = characterId };
        Assert.True(ability.CanActivate(input, owner, out _));
        ability.Execute(input, owner);
        Assert.Equal(0u, world.Get<BomberSkillState>(entity).CharacterId.Value);
        match.PhaseEndTick.Value = world.Tick;
        ulong oldMatch = match.MatchId.Value;
        for (int i = 0; i < 80 && match.MatchId.Value == oldMatch; i++) manager.Tick();
        Assert.Equal(oldMatch + 1, match.MatchId.Value);
        var state = world.Get<BomberSkillState>(entity);
        Assert.Equal(118005u, state.CharacterId.Value);
        Assert.Equal(118005, world.Get<BomberParticipantState>(world.Get<BomberPlayerState>(entity).Participant.Value).SelectedForMatchCharacterId.Value);
        Assert.Equal(13u, state.ActiveSkillId.Value);
        Assert.Equal(1, state.ActiveSkillLevel.Value);
        Assert.True(state.ActiveSkillBound.Value);
        Assert.Equal(0u, state.PassiveSkillId.Value);
        Assert.Equal(0, state.PassiveSkillLevel.Value);
        Assert.False(state.PassiveSkillBound.Value);
        Assert.All(seeds, pair => Assert.Equal(pair.Value, attributes.GetBaseValue(pair.Key)));
        var level = Assert.Single(tables.SkillLevels.Rows, row => row.SkillId == 13u);
        Assert.Equal(4000u, level.CooldownMs);
        Assert.Equal(3000u, level.FavoriteCooldownMs);
        Assert.Equal(2, level.RangeCells);
        Assert.Equal("UntilObstacle", level.RangeMode);

        foreach (var phase in new[] { BomberMatchPhase.Running, BomberMatchPhase.FinalCircle, BomberMatchPhase.Podium })
        {
            world.Single<BomberMatchState>().Phase.Value = (int)phase;
            Assert.False(ability.CanActivate(input, owner, out var reason));
            Assert.Equal("character_selection_closed", reason);
        }
        match.Phase.Value = (int)BomberMatchPhase.Results;
        Assert.True(ability.CanActivate(input, owner, out _));
        match.Phase.Value = (int)BomberMatchPhase.Warmup;
        Assert.False(ability.CanActivate(new SelectCharacterAbility.Input { CharacterId = 118006 }, owner, out var unknown));
        Assert.Equal("character_unknown", unknown);
    }
}
