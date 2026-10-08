using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

internal static class BomberInventory
{
    internal static long Available(World world, NetEntityId participant, long capacity) => Math.Max(0,
        capacity - world.Each<BomberBombState>().Count(b => b.Owner.Value == participant &&
            !b.Frenzy.Value && b.Phase.Value == (int)BomberBombPhase.Fuse && !b.CapacityReturned.Value));

    internal static void ReconcileSuccessors(World world)
    {
        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>())
        {
            NetEntityId target = participant.CurrentLife.Value;
            if (!world.IsLive(target) || world.Get<BomberSuccessorLife>(target).PreparedRevision.Value == 0) continue;
            BomberPlayerState life = world.Get<BomberPlayerState>(target);
            if (life.Participant.Value != participant.Entity || life.LifeGeneration.Value != participant.LifeGeneration.Value ||
                life.LifePhase.Value >= (int)BomberLifePhase.AwaitingRespawn || life.RestorePending.Value) continue;
            var attributes = world.Get<AttributeComponent>(target);
            long capacity = attributes.GetCurrentValue(BomberAttributeNames.BombCapacity);
            long available = Available(world, participant.Entity, capacity);
            if (attributes.GetBaseValue(BomberAttributeNames.AvailableBombs) == available) continue;
            // A fresh current-life settlement reconciles ownership. Old bomb results
            // keep their old life correlation and cannot target this new life.
            var p = new BomberInventoryEffect.Parameters { Available = available, Fx = "bomber.inventory",
                Participant = participant.Entity, Life = target, Generation = participant.LifeGeneration.Value,
                MatchId = participant.MatchId.Value, Capacity = capacity };
            _ = Effects.Apply<BomberInventoryEffect, BomberInventoryEffect.Parameters>(world, target, in p, target);
        }
    }
}
