using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

internal static partial class BomberFrenzy
{
    internal static bool IsActive(World world, BomberParticipantState participant, NetEntityId life) =>
        BomberConfigBinding.For(world).Game.FrenzyEnabled &&
        participant.CurrentLife.Value == life && participant.FrenzyLife.Value == life &&
        participant.FrenzyUntilTick.Value > world.Tick;

    internal static bool IsSelfImmune(BomberBombState bomb, BomberPlayerState player) =>
        bomb.Frenzy.Value && bomb.SourceLife.Value == player.Entity &&
        bomb.SourceLifeGeneration.Value == player.LifeGeneration.Value;
}
