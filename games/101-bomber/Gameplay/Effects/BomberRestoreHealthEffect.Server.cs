using System;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.Components;
namespace Lumio.Bomber.Gameplay;
public sealed partial class BomberRestoreHealthEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters p)
    {
        BomberPlayerState life = context.World.Get<BomberPlayerState>(context.Target);
        BomberParticipantState participant = context.World.Get<BomberParticipantState>(p.Participant);
        return p.Life == context.Target && context.Source == p.Life &&
            participant.MatchId.Value == p.MatchId && participant.CurrentLife.Value == p.Life &&
            participant.LifeGeneration.Value == p.Generation && life.Participant.Value == p.Participant &&
            life.LifeGeneration.Value == p.Generation && life.MaximumHealth.Value > 0 &&
            life.RestorePending.Value && life.RestoreIntent.Value == p.Intent;
    }
    public override void Apply(in EffectApplyContext context, in Parameters p)
    {
        AttributeComponent attributes = context.World.Get<AttributeComponent>(context.Target);
        long before = attributes.GetBase("HealthPoints").Value;
        long maximum = context.World.Get<BomberPlayerState>(context.Target).MaximumHealth.Value;
        long after = maximum;
        attributes.GetBase("HealthPoints").Value = after;
        context.CompleteFact(before, after, after - before);
    }
}
