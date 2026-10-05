using System;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
namespace Lumio.Bomber.Gameplay;
public sealed partial class BomberHealEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters p)
    {
        World world = context.World;
        BomberPlayerState life = world.Get<BomberPlayerState>(context.Target);
        BomberParticipantState participant = world.Get<BomberParticipantState>(p.Participant);
        AttributeComponent attributes = world.Get<AttributeComponent>(context.Target);
        if (p.Row != 0 || p.Life != context.Target || context.Source != p.Life ||
            participant.MatchId.Value != p.MatchId || participant.CurrentLife.Value != p.Life ||
            participant.LifeGeneration.Value != p.Generation || life.Participant.Value != p.Participant ||
            life.LifeGeneration.Value != p.Generation || life.MaximumHealth.Value != p.MaximumBefore ||
            life.GoldenHeartCount.Value != p.GoldBefore || life.RestorePending.Value || life.LifePhase.Value >= 2 ||
            attributes.GetBase("HealthPoints").Value <= 0) return false;
        if (p.Item.IsDefault) return p.Kind == -1 && p.Points > 0 && p.MaximumAfter == p.MaximumBefore && p.GoldAfter == p.GoldBefore;
        BomberPickupItem item = world.Get<BomberPickupItem>(p.Item);
        if (item.ClaimedBy.Value != p.Life || item.Kind.Value != p.Kind || p.GoldBefore < 0 || p.GoldAfter > 3) return false;
        if (p.Kind >= 0 && p.Kind <= 2)
        {
            long current = 0;
            long basis = 0;
            if (p.Kind == 0) { basis = attributes.GetBase("BombPower").Value; current = attributes.GetCurrent("BombPower").Value; }
            if (p.Kind == 1) { basis = attributes.GetBase("BombCapacity").Value; current = attributes.GetCurrent("BombCapacity").Value; }
            if (p.Kind == 2)
            {
                basis = attributes.GetBase("SpeedTier").Value;
                current = attributes.GetCurrent("SpeedTier").Value;
                if (p.MovementSpeedAfter <= 0 || p.MovementSpeedAfter < attributes.GetBase("MovementSpeedMilli").Value) return false;
            }
            if (p.UpgradeBefore != basis || p.UpgradeBefore != current || p.UpgradeAfter != p.UpgradeBefore + 1 ||
                p.HatsAfter != life.HatCount.Value + 1 || p.GoldAfter != p.GoldBefore) return false;
        }
        else if (p.Kind == 5)
        {
            if (p.GoldAfter != p.GoldBefore + 1 || p.HatsAfter != life.HatCount.Value) return false;
        }
        else if (p.Kind == 3)
            return p.Points == 2 && p.MaximumAfter == p.MaximumBefore && p.GoldAfter == p.GoldBefore &&
                p.HatsAfter == life.HatCount.Value && attributes.GetBase("HealthPoints").Value != p.MaximumBefore;
        else if (p.Kind == (int)BomberPickupKind.Frenzy)
            return !(participant.CurrentLife.Value == p.Life && participant.FrenzyLife.Value == p.Life &&
                    participant.FrenzyUntilTick.Value > world.Tick) &&
                p.Points == Math.Max(0, p.MaximumBefore - attributes.GetBase("HealthPoints").Value) &&
                p.MaximumAfter == p.MaximumBefore && p.GoldAfter == p.GoldBefore &&
                p.HatsAfter == life.HatCount.Value;
        else return false;
        return p.MaximumAfter == BomberGrowth.MaximumHealth(p.HatsAfter, p.GoldAfter) &&
            p.MaximumAfter >= p.MaximumBefore && p.Points == p.MaximumAfter - p.MaximumBefore;
    }

    public override void Apply(in EffectApplyContext context, in Parameters p)
    {
        AttributeComponent attributes = context.World.Get<AttributeComponent>(context.Target);
        if (p.Kind == 0) attributes.GetBase("BombPower").Value = p.UpgradeAfter;
        if (p.Kind == 1)
        {
            attributes.GetBase("BombCapacity").Value = p.UpgradeAfter;
            attributes.GetBase("AvailableBombs").Value = Math.Min(p.UpgradeAfter, attributes.GetBase("AvailableBombs").Value + 1);
        }
        if (p.Kind == 2)
        {
            attributes.GetBase("SpeedTier").Value = p.UpgradeAfter;
            attributes.GetBase("MovementSpeedMilli").Value = p.MovementSpeedAfter;
        }
        long before = attributes.GetBase("HealthPoints").Value;
        long maximum = p.MaximumAfter;
        long after = Math.Min(maximum, before + Math.Min(p.Points, Math.Max(0, maximum - before)));
        attributes.GetBase("HealthPoints").Value = after;
        context.CompleteFact(before, after, after - before);
    }
}
