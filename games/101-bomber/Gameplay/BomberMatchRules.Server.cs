using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

internal static partial class BomberMatchRules
{
    internal const string RoomId = "bomber-room";

    internal static ulong Emit(World world, string eventName, ulong matchId, string? detail = null, ulong? occurredTick = null)
    {
        BomberMatchState match = world.Single<BomberMatchState>();
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        ulong sequence = runtime.AllocateEventSequence();
        string suffix = string.IsNullOrWhiteSpace(detail) ? string.Empty : " " + detail;
        match.EmitGameplayLog($"event={eventName} roomId={RoomId} matchId={matchId} gameTick={occurredTick ?? world.Tick} eventSequence={sequence}{suffix}");
        return sequence;
    }
}
