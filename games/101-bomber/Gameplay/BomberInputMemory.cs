using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

internal static class BomberInputMemory
{
    internal static bool IsCurrent(World world, BomberPlayerState player)
    {
        if (!BomberMatchRules.IsPlayerInputOpen(world, player.Entity) || player.Participant.Value.IsDefault ||
            !world.IsLive(player.Participant.Value) || player.LifeGeneration.Value == 0) return false;
        BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
        return participant.CurrentLife.Value == player.Entity &&
            participant.LifeGeneration.Value == player.LifeGeneration.Value &&
            participant.MatchId.Value == world.Single<BomberMatchState>().MatchId.Value;
    }

    internal static void Prepare(World world, BomberPlayerState player)
    {
        ulong match = world.Single<BomberMatchState>().MatchId.Value;
        if (player.InputMemoryMatchId.Value == match) return;
        Clear(player);
        player.InputMemoryMatchId.Value = match;
    }

    internal static void Clear(BomberPlayerState player)
    {
        player.InputMemoryMatchId.Value = 0;
        ClearMovement(player);
        player.LastAssistTick.Value = 0;
        player.AssistToleranceMilli.Value = 0;
        player.PendingPlaceUntilTick.Value = 0;
        BomberBombButton.Clear(player);
    }

    internal static void ClearMovement(BomberPlayerState player)
    {
        player.PendingTurnDirection.Value = 0;
        player.PendingTurnUntilTick.Value = 0;
        player.LastMoveDirection.Value = 0;
        player.LastMoveTick.Value = 0;
    }
}

