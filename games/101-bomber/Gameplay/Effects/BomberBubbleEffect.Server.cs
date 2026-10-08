using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

public sealed partial class BomberBubbleEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters p)
    {
        var world = context.World;
        var player = world.Get<BomberPlayerState>(context.Target);
        var participant = world.Get<BomberParticipantState>(p.Participant);
        var skill = world.Get<BomberSkillState>(context.Target);
        return context.Source == p.Life && context.Target == p.Life && player.Participant.Value == p.Participant &&
            participant.CurrentLife.Value == p.Life && participant.MatchId.Value == p.MatchId &&
            participant.LifeGeneration.Value == p.Generation && player.LifeGeneration.Value == p.Generation &&
            player.LifePhase.Value < (int)BomberLifePhase.AwaitingRespawn && !player.RestorePending.Value &&
            world.Get<AttributeComponent>(p.Life).GetBase("HealthPoints").Value > 0 &&
            skill.ActiveSkillId.Value == 2 && skill.ActiveSkillBound.Value && skill.BubbleOutcome.Value == 1 &&
            skill.BubbleDurationTicks.Value == p.Duration && skill.BubbleEffectWorld.Value == context.Handle.WorldId.Value &&
            skill.BubbleEffectInstance.Value == context.Handle.InstanceId.Value && skill.BubbleEffectGeneration.Value == context.Handle.Generation &&
            !world.Get<EffectComponent>(p.Life).HasActiveEffect(10107u, world.Tick);
    }
}
