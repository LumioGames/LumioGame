using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.EntityTypes;

namespace Lumio.Bomber.Gameplay;

[AbilityType(5u, Prediction = PredictionKind.AuthorityOnly)]
public sealed class SelectCharacterAbility : AbilityType<SelectCharacterAbility.Input>
{
    public const uint TypeId = 5u;
    public struct Input : IAbilityInput
    {
        public uint CharacterId;
        public void Write(IList<object?> args) => args.Add(CharacterId.ToString(CultureInfo.InvariantCulture));
        public bool TryRead(IReadOnlyList<object?> args, int start) =>
            args is not null && start >= 0 && start == args.Count - 1 &&
            uint.TryParse(args[start]?.ToString(), NumberStyles.None, CultureInfo.InvariantCulture, out CharacterId);
    }
    public override bool CanActivate(in Input input, AbilityComponent owner, out string? failureCode)
    {
        failureCode = null;
        if (owner is null) { failureCode = "ability_owner_missing"; return false; }
        World world = owner.World;
        BomberMatchState match = world.Single<BomberMatchState>();
        BomberMatchPhase phase = (BomberMatchPhase)match.Phase.Value;
        if (phase is BomberMatchPhase.Running or BomberMatchPhase.FinalCircle or BomberMatchPhase.Podium)
        { failureCode = "character_selection_closed"; return false; }
        uint character = CanonicalCharacter(input.CharacterId);
        if (!TryConfiguredCharacter(BomberConfigBinding.For(world), character, out _))
        { failureCode = "character_unknown"; return false; }
        if (!world.IsLive(owner.Entity) || !world.TypeOf(owner.Entity).Is<PlayerEntity>() ||
            !TryCurrentParticipant(world, match, owner.Entity, out _))
        { failureCode = "character_selection_stale_life"; return false; }
        return true;
    }
    public override void Execute(in Input input, AbilityComponent owner)
    {
        if (!CanActivate(input, owner, out _)) return;
        World world = owner.World;
        BomberPlayerState player = world.Get<BomberPlayerState>(owner.Entity);
        uint character = CanonicalCharacter(input.CharacterId);
        BomberMatchState match = world.Single<BomberMatchState>();
        _ = TryCurrentParticipant(world, match, owner.Entity, out BomberParticipantState? participant);
        BomberSkillState skill = world.Get<BomberSkillState>(owner.Entity);
        // The first browser choice arrives after Welcome, which can follow Warmup entry.
        // Only an unbound entry may bind here; subsequent choices retain the next-Warmup latch.
        if ((BomberMatchPhase)match.Phase.Value == BomberMatchPhase.Warmup &&
            world.Tick < match.PhaseEndTick.Value && participant is not null &&
            participant.SelectedForMatchCharacterId.Value == 0 && skill.CharacterId.Value == 0 &&
            TryConfiguredCharacter(BomberConfigBinding.For(world), character, out CharactersRow row))
        {
            participant.SelectedForMatchCharacterId.Value = checked((int)character);
            world.Get<BomberStatistics>(participant.Entity).CharacterId.Value = checked((int)character);
            participant.NextCharacterId.Value = 0;
            player.NextCharacterId.Value = 0;
            BindCharacter(skill, row);
            return;
        }
        player.NextCharacterId.Value = checked((int)character);
        if (participant is not null) participant.NextCharacterId.Value = checked((int)character);
    }

    internal static bool TryConfiguredCharacter(IBomberConfig config, uint id, out CharactersRow row) =>
        config.Tables.Characters.TryGet(id, out row) && row.BoundLevel > 0 && row.BoundSkillId != 0 &&
        row.BoundSlot is "Active" or "Passive";

    internal static void BindCharacter(BomberSkillState skill, CharactersRow row)
    {
        uint character = row.Id;
        skill.CharacterId.Value = character;
        skill.ActiveSkillId.Value = 0;
        skill.ActiveSkillLevel.Value = 0;
        skill.ActiveSkillBound.Value = false;
        skill.PassiveSkillId.Value = 0;
        skill.PassiveSkillLevel.Value = 0;
        skill.PassiveSkillBound.Value = false;
        if (row.BoundSlot == "Active")
        {
            skill.ActiveSkillId.Value = row.BoundSkillId;
            skill.ActiveSkillLevel.Value = row.BoundLevel;
            skill.ActiveSkillBound.Value = true;
        }
        else
        {
            skill.PassiveSkillId.Value = row.BoundSkillId;
            skill.PassiveSkillLevel.Value = row.BoundLevel;
            skill.PassiveSkillBound.Value = true;
        }
    }

    private static bool TryCurrentParticipant(World world, BomberMatchState match, NetEntityId life,
        out BomberParticipantState? participant)
    {
        participant = null;
        BomberPlayerState player = world.Get<BomberPlayerState>(life);
        if (!player.Participant.Value.IsDefault)
        {
            if (!world.IsLive(player.Participant.Value) ||
                !world.TypeOf(player.Participant.Value).Is<BomberParticipantEntity>()) return false;
            participant = world.Get<BomberParticipantState>(player.Participant.Value);
        }
        else
        {
            foreach (BomberParticipantState candidate in world.Each<BomberParticipantState>())
            {
                if (candidate.CurrentLife.Value != life) continue;
                if (participant is not null) return false;
                participant = candidate;
            }
            if (participant is null)
                return match.MatchId.Value == 0 && !world.Each<BomberParticipantState>().Any();
        }
        return participant.CurrentLife.Value == life && participant.LifeGeneration.Value != 0 &&
            participant.LifeGeneration.Value == player.LifeGeneration.Value &&
            participant.MatchId.Value == match.MatchId.Value;
    }

    private static uint CanonicalCharacter(uint id) => id is >= 1 and <= 5 ? 118000u + id : id;
}
