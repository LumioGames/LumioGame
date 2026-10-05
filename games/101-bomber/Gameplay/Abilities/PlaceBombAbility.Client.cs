using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay;

public sealed partial class PlaceBombAbility
{
    private static partial bool CanProduceFrenzy(World world, BomberParticipantState participant, out string? failureCode)
    {
        failureCode = "bomb_authority_required";
        return false;
    }

    private static partial EntityOrder CreateFrenzyBomb(World world, BomberParticipantState participant,
        BomberPlayerState life, int power, ulong nextChain, int x, int z, float y, ulong fuseEnd) =>
        throw new System.InvalidOperationException("Frenzy bomb creation requires the authoritative world.");

    private static partial EntityOrder CreateBomb(World world, int futureChildren) =>
        throw new System.InvalidOperationException("Bomb creation requires the authoritative world.");
    internal static partial bool IsPlacableTerrain(World world, int x, int z) => false;
    private static partial bool CanReserve(World world, BomberWorldRuntime runtime,
        ulong matchId, int cell, NetEntityId participant, int futureChildren) => false;
    private static partial void Reserve(World world, BomberWorldRuntime runtime,
        ulong matchId, int cell, NetEntityId participant) { }
}
