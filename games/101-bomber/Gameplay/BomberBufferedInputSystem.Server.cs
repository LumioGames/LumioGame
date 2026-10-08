using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

// Continues accepted input memory on the existing ApplyInputs phase, after this tick's RPCs.
[System(TickPhase.ApplyInputs)]
public sealed class BomberBufferedInputSystem : EcsSystem
{
    private static readonly PlaceBombAbility Placement = new();
    public override void Execute(World world)
    {
        foreach (BomberPlayerState player in world.Each<BomberPlayerState>())
        {
            if (!BomberInputMemory.IsCurrent(world, player) || BomberFiniteSkills.HasFreeze(world, player.Entity))
            {
                BomberInputMemory.Clear(player);
                continue;
            }
            BomberInputMemory.Prepare(world, player);
            BomberBombButton.Expire(world, player);
            if (player.PendingTurnUntilTick.Value <= world.Tick)
            {
                player.PendingTurnUntilTick.Value = 0;
                player.PendingTurnDirection.Value = 0;
            }
            if (player.PendingPlaceUntilTick.Value == 0) continue;
            AbilityComponent owner = world.Get<AbilityComponent>(player.Entity);
            var placement = new PlaceBombAbility.Input { ContinueBuffered = true };
            if (!Placement.CanActivate(placement, owner, out _)) player.PendingPlaceUntilTick.Value = 0;
            else owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(placement);
        }
    }
}
