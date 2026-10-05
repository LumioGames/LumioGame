using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

public sealed partial class BomberFreezeEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters p) =>
        BomberFiniteSkills.MatchesAppliedSurvivingDamage(context, p.Participant, p.Life, p.Generation, p.MatchId,
            p.DamageOwner, p.DamageRow, p.DamageWorld, p.DamageInstance, p.DamageGeneration, false) &&
        !context.World.Get<EffectComponent>(context.Target).HasActiveEffect(10108u, context.World.Tick) &&
        !context.World.Get<EffectComponent>(context.Target).HasActiveEffect(10109u, context.World.Tick);
}
