using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay;

public sealed partial class BomberSuccessorRestoreEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters p)
    {
        BomberPlayerState life = context.World.Get<BomberPlayerState>(context.Target);
        BomberParticipantState participant = context.World.Get<BomberParticipantState>(p.Participant);
        BomberSuccessorState state = context.World.Get<BomberSuccessorState>(p.Participant);
        return context.Source == p.OldLife && !context.World.IsLive(p.OldLife) &&
            participant.CurrentLife.Value == p.OldLife && participant.MatchId.Value == p.MatchId &&
            state.DormantLife.Value == context.Target && state.NextLifeGeneration.Value == p.Generation &&
            state.IntentGeneration.Value == p.Intent && state.Eligible.Value &&
            context.World.Get<BomberSuccessorLife>(context.Target).PreparedRevision.Value == p.Revision && p.Revision != 0 &&
            life.Participant.Value == p.Participant && life.LifeGeneration.Value == p.Generation &&
            life.LifePhase.Value == (int)BomberLifePhase.AwaitingRespawn && p.Health == life.MaximumHealth.Value &&
            p.Power >= 1 && p.Capacity >= 1 && p.Available >= 0 && p.Available <= p.Capacity && p.Speed >= 0 && p.MovementSpeed > 0;
    }

    public override void Apply(in EffectApplyContext context, in Parameters p)
    {
        AttributeComponent attributes = context.World.Get<AttributeComponent>(context.Target);
        attributes.GetBase("BombPower").Value = p.Power;
        attributes.GetBase("BombCapacity").Value = p.Capacity;
        attributes.GetBase("AvailableBombs").Value = p.Available;
        attributes.GetBase("SpeedTier").Value = p.Speed;
        attributes.GetBase("MovementSpeedMilli").Value = p.MovementSpeed;
        attributes.GetBase("HealthPoints").Value = p.Health;
    }
}
