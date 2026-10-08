using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay;

public sealed partial class BomberNewMatchEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters p)
    {
        BomberPlayerState life = context.World.Get<BomberPlayerState>(context.Target);
        BomberParticipantState participant = context.World.Get<BomberParticipantState>(p.Participant);
        return p.Row == 0 && p.Kind == -2 && p.Item.IsDefault && p.Life == context.Target && context.Source == p.Life &&
            participant.MatchId.Value == p.MatchId && participant.CurrentLife.Value == p.Life &&
            participant.LifeGeneration.Value == p.Generation && life.Participant.Value == p.Participant &&
            life.LifeGeneration.Value == p.Generation && life.MaximumHealth.Value == p.MaximumBefore &&
            life.GoldenHeartCount.Value == p.GoldBefore && life.RestorePending.Value && life.RestoreIntent.Value == p.Intent &&
            p.Points == 6 && p.MaximumAfter == 6 && p.GoldAfter == 0 && p.HatsAfter == 0 &&
            p.PowerSeed >= 1 && p.CapacitySeed >= 1 && p.SpeedTierSeed >= 0 && p.MovementSpeedSeed > 0;
    }

    public override void Apply(in EffectApplyContext context, in Parameters p)
    {
        AttributeComponent attributes = context.World.Get<AttributeComponent>(context.Target);
        long before = attributes.GetBase("HealthPoints").Value;
        attributes.GetBase("BombPower").Value = p.PowerSeed;
        attributes.GetBase("BombCapacity").Value = p.CapacitySeed;
        attributes.GetBase("AvailableBombs").Value = p.CapacitySeed;
        attributes.GetBase("SpeedTier").Value = p.SpeedTierSeed;
        attributes.GetBase("MovementSpeedMilli").Value = p.MovementSpeedSeed;
        attributes.GetBase("HealthPoints").Value = p.Points;
        context.CompleteFact(before, p.Points, p.Points - before);
    }
}
