using System;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

public sealed partial class BomberBurnDamageEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters p)
    {
        if (p.Points != BomberMatchRules.HalfHeartsPerBomb || p.Cause != (int)BomberDamageCause.Fire ||
            p.Row != 0 || p.FactOwner != p.Participant || p.Life != context.Target) return false;
        var world = context.World;
        var life = world.Get<BomberPlayerState>(p.Life);
        var participant = world.Get<BomberParticipantState>(p.Participant);
        var facts = world.Get<BomberFireFacts>(p.FactOwner);
        return facts.FireStatus.Count == 1 && facts.FireStatus[0] == 0 &&
            facts.FireHandleWorld[0] == context.Handle.WorldId.Value &&
            facts.FireHandleInstance[0] == context.Handle.InstanceId.Value && facts.FireHandleGeneration[0] == context.Handle.Generation &&
            facts.FireSource[0] == context.Source && facts.FireTarget[0] == p.Life &&
            facts.FireMatchId[0] == p.MatchId && facts.FireParticipant[0] == p.Participant && facts.FireLife[0] == p.Life &&
            facts.FireGeneration[0] == p.Generation && facts.FireSourceParticipant[0] == p.SourceParticipant &&
            facts.FireSourceLife[0] == p.SourceLife && facts.FireSourceGeneration[0] == p.SourceGeneration &&
            facts.FireFamily[0] == p.Family && facts.FireChainId[0] == p.ChainId && facts.FireCause[0] == p.Cause &&
            facts.FireSourceKind[0] == p.SourceKind && facts.FirePulse[0] == p.Pulse &&
            life.Participant.Value == p.Participant && life.LifeGeneration.Value == p.Generation &&
            participant.CurrentLife.Value == p.Life && participant.LifeGeneration.Value == p.Generation &&
            participant.MatchId.Value == p.MatchId && life.LifePhase.Value < (int)BomberLifePhase.AwaitingRespawn &&
            life.ProtectedUntilTick.Value <= world.Tick &&
            !world.Get<EffectComponent>(p.Life).HasActiveEffect(10107u, world.Tick) &&
            world.Get<AttributeComponent>(p.Life).GetBase("HealthPoints").Value > 0;
    }

    public override void Apply(in EffectApplyContext context, in Parameters p)
    {
        AttributeComponent attributes = context.World.Get<AttributeComponent>(context.Target);
        long before = attributes.GetBase(BomberAttributeNames.HealthPoints).Value;
        long after = Math.Max(0, before - p.Points);
        attributes.GetBase(BomberAttributeNames.HealthPoints).Value = after;
        context.CompleteFact(before, after, before - after);
    }
}
