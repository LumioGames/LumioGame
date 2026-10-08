using System;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.Components;
namespace Lumio.Bomber.Gameplay;

public sealed partial class BomberDamageEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters p)
    {
        BomberPlayerState life = context.World.Get<BomberPlayerState>(context.Target);
        BomberParticipantState participant = context.World.Get<BomberParticipantState>(p.Participant);
        BomberBombState bomb = context.World.Get<BomberBombState>(p.BombId);
        return (p.Points > 0 || (p.Points == 0 && p.Family == (int)BomberBombKind.Freeze && bomb.BombKind.Value == (int)BomberBombKind.Freeze)) &&
            p.Life == context.Target && p.BombId == context.Source &&
            p.Row >= 0 && p.Row < bomb.HitDependentsAdmitted.Count && bomb.HitDependentsAdmitted[p.Row] &&
            bomb.HitHandleWorlds[p.Row] == context.Handle.WorldId.Value &&
            bomb.HitHandleInstances[p.Row] == context.Handle.InstanceId.Value && bomb.HitHandleGenerations[p.Row] == context.Handle.Generation &&
            bomb.HitParticipants[p.Row] == p.Participant && bomb.HitLives[p.Row] == p.Life && bomb.HitLifeGenerations[p.Row] == p.Generation &&
            participant.MatchId.Value == p.MatchId && participant.CurrentLife.Value == p.Life &&
            participant.LifeGeneration.Value == p.Generation && life.Participant.Value == p.Participant &&
            life.LifeGeneration.Value == p.Generation && life.LifePhase.Value < 2 &&
            life.ProtectedUntilTick.Value <= context.World.Tick &&
            !context.World.Get<EffectComponent>(context.Target).HasActiveEffect(10107u, context.World.Tick) &&
            context.World.Get<AttributeComponent>(context.Target).GetBase("HealthPoints").Value > 0;
    }

    public override void Apply(in EffectApplyContext context, in Parameters p)
    {
        AttributeComponent attributes = context.World.Get<AttributeComponent>(context.Target);
        long before = attributes.GetBase("HealthPoints").Value;
        long after = Math.Max(0, before - p.Points);
        attributes.GetBase("HealthPoints").Value = after;
        context.CompleteFact(before, after, before - after);
    }
}
