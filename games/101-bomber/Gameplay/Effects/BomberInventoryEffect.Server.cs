using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

public sealed partial class BomberInventoryEffect
{
    public override bool CanSettle(in EffectApplyContext context, in Parameters p)
    {
        var world = context.World;
        var participant = world.Get<BomberParticipantState>(p.Participant);
        var life = world.Get<BomberPlayerState>(context.Target);
        var attributes = world.Get<AttributeComponent>(context.Target);
        return context.Source == p.Life && context.Target == p.Life && participant.CurrentLife.Value == p.Life &&
            participant.MatchId.Value == p.MatchId && participant.LifeGeneration.Value == p.Generation &&
            life.Participant.Value == p.Participant && life.LifeGeneration.Value == p.Generation &&
            life.LifePhase.Value < (int)BomberLifePhase.AwaitingRespawn && !life.RestorePending.Value &&
            world.Get<BomberSuccessorLife>(p.Life).PreparedRevision.Value != 0 &&
            attributes.GetBase("HealthPoints").Value > 0 && attributes.GetCurrent("BombCapacity").Value == p.Capacity &&
            p.Available == BomberInventory.Available(world, p.Participant, p.Capacity);
    }

    public override void Apply(in EffectApplyContext context, in Parameters p) =>
        context.World.Get<AttributeComponent>(context.Target).GetBase("AvailableBombs").Value = p.Available;
}
