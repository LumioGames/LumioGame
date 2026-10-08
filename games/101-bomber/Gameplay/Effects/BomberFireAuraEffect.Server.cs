using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

public sealed partial class BomberFireAuraEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters p)
    {
        var world = context.World;
        if (context.Source != p.Life || context.Target != p.Life ||
            !world.IsLive(p.Life) || !world.TypeOf(p.Life).Is<PlayerEntity>() ||
            !world.IsLive(p.Participant) || !world.TypeOf(p.Participant).Is<BomberParticipantEntity>()) return false;
        var player = world.Get<BomberPlayerState>(p.Life);
        var skill = world.Get<BomberSkillState>(p.Life);
        return BomberFiniteSkills.MatchesAuraRequest(world, player, skill, in p) &&
            player.LifePhase.Value < (int)BomberLifePhase.AwaitingRespawn && !player.RestorePending.Value &&
            world.Get<AttributeComponent>(p.Life).GetBaseValue(BomberAttributeNames.HealthPoints) > 0 &&
            skill.ActiveSkillId.Value == 4 && skill.ActiveSkillBound.Value && skill.AuraOutcome.Value == 1 &&
            skill.AuraCooldownTicks.Value != 0 &&
            skill.AuraEffectWorld.Value == context.Handle.WorldId.Value &&
            skill.AuraEffectInstance.Value == context.Handle.InstanceId.Value &&
            skill.AuraEffectGeneration.Value == context.Handle.Generation &&
            !world.Get<EffectComponent>(p.Life).HasActiveEffect(10111u, world.Tick);
    }

    internal static Parameters ReadActualRow(FiniteEffectView row) =>
        new BomberFireAuraEffect().CreateGeneratedCodec()!.Decode(row.Payload.ToArray());
}
