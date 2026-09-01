using System;

namespace Lumio.Game.ServerGameplay;

/// <summary>Room entity counts for the 101-entity acceptance.</summary>
/// <param name="BotCount">BotEntity count.</param>
/// <param name="PlayerCount">PlayerEntity count.</param>
/// <param name="Total">Bot plus Player.</param>
/// <param name="NetEntityIds">Live NetEntityId values; never includes tombstones.</param>
/// <param name="EntityTypes">Kind per <see cref="NetEntityIds"/> index (bot/player).</param>
public readonly record struct RoomCensus(
    int BotCount,
    int PlayerCount,
    int Total,
    ulong[] NetEntityIds,
    GameEntityKind[] EntityTypes);

/// <summary>One Room tick's committed chat events.</summary>
/// <param name="AppliedTick">Authoritative tick.</param>
/// <param name="Events">Live events emitted this tick; the world does not retain history.</param>
public readonly record struct RoomTickResult(ulong AppliedTick, ChatMessageEvent[] Events);
