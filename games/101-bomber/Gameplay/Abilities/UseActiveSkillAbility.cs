using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Config;

namespace Lumio.Bomber.Gameplay;

[AbilityType(4u, Prediction = PredictionKind.AuthorityOnly)]
public sealed partial class UseActiveSkillAbility : AbilityType<UseActiveSkillAbility.Input>
{
    public const uint TypeId = 4u;
    public struct Input : IAbilityInput
    {
        public void Write(IList<object?> args) { }
        public bool TryRead(IReadOnlyList<object?> args, int start) => args is not null && start >= 0 && start == args.Count;
    }
    public override bool CanActivate(in Input input, AbilityComponent owner, out string? failureCode)
    {
        failureCode = null;
        if (owner is null) { failureCode = "ability_owner_missing"; return false; }
        if (!BomberMatchRules.IsPlayerInputOpen(owner.World, owner.Entity))
        { failureCode = "bomber_match_not_ready"; return false; }
        IBomberConfig config = BomberConfigBinding.For(owner.World);
        if (!config.Game.SkillsEnabled) { failureCode = "skills_disabled"; return false; }
        BomberSkillState state = owner.World.Get<BomberSkillState>(owner.Entity);
        if (BomberFiniteSkills.HasFreeze(owner.World, owner.Entity))
        { failureCode = "player_frozen"; return false; }
        if (state.ActiveSkillId.Value == 0) { failureCode = "active_skill_empty"; return false; }
        if (state.BubbleOutcome.Value != 0 || state.AuraOutcome.Value != 0)
        { failureCode = "active_skill_pending"; return false; }
        if (state.CooldownUntilTick.Value > owner.World.Tick) { failureCode = "active_skill_cooldown"; return false; }
        if (!config.Tables.Skills.TryGet(state.ActiveSkillId.Value, out SkillsRow skill) ||
            skill.Slot != "Active" || skill.Trigger != "Activate")
        { failureCode = "active_skill_invalid"; return false; }
        if (state.ActiveSkillLevel.Value <= 0 ||
            !config.Tables.SkillLevels.Rows.Any(row => row.SkillId == skill.Id && row.Level == state.ActiveSkillLevel.Value))
        { failureCode = "active_skill_level_invalid"; return false; }
        if (skill.Id is not (2u or 3u or 4u or 13u))
        { failureCode = "active_skill_unavailable"; return false; }
        if (!state.ActiveSkillBound.Value ||
            !config.Tables.Characters.TryGet(state.CharacterId.Value, out CharactersRow character) ||
            character.BoundSlot != "Active" || character.BoundSkillId != skill.Id ||
            character.BoundLevel != state.ActiveSkillLevel.Value)
        { failureCode = "active_skill_not_bound"; return false; }
        SkillLevelsRow level = config.SkillLevel(skill.Id, state.ActiveSkillLevel.Value);
        ValidateAuthoritative(owner.World, owner.Entity, skill.Id, level, ref failureCode);
        if (failureCode is not null) return false;
        return true;
    }
    public override void Execute(in Input input, AbilityComponent owner)
    {
        if (!CanActivate(input, owner, out _)) return;
        World world = owner.World;
        BomberSkillState state = world.Get<BomberSkillState>(owner.Entity);
        SkillLevelsRow level = BomberConfigBinding.For(world).SkillLevel(state.ActiveSkillId.Value, state.ActiveSkillLevel.Value);
        ExecuteAuthoritative(world, owner.Entity, state, level);
    }

    static partial void ValidateAuthoritative(World world, NetEntityId playerId, uint skillId,
        SkillLevelsRow level, ref string? failureCode);
    static partial void ExecuteAuthoritative(World world, NetEntityId playerId,
        BomberSkillState state, SkillLevelsRow level);
}
