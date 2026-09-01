using System;

namespace Lumio.Game.ServerGameplay;

/// <summary>Persist-only last-message fields for one entity. Chat history is never included.</summary>
/// <param name="NetEntityId">Entity id captured at snapshot time.</param>
/// <param name="AccountId">Stable account value carried on the entity.</param>
/// <param name="EntityType">Player or Bot.</param>
/// <param name="LastMessageText">ChatComponent.lastMessageText.</param>
/// <param name="LastMessageTick">ChatComponent.lastMessageTick.</param>
/// <param name="HistoryCount">Chat history rows; always zero because history is not persisted.</param>
public readonly record struct ChatPersistEntity(
    ulong NetEntityId,
    string AccountId,
    GameEntityKind EntityType,
    string LastMessageText,
    ulong LastMessageTick,
    int HistoryCount = 0);

/// <summary>Component-level Snapshot/Restore material for one Room. Excludes live events.</summary>
/// <param name="Entities">Persist-only last-message rows.</param>
public readonly record struct ChatPersistSnapshot(ChatPersistEntity[] Entities);

/// <summary>Internal last-message row captured from <see cref="ChatRoomWorld"/>.</summary>
/// <param name="NetEntityId">Entity id.</param>
/// <param name="LastMessageText">Persisted text.</param>
/// <param name="LastMessageTick">Persisted tick.</param>
public readonly record struct ChatPersistEntityState(
    ulong NetEntityId,
    string LastMessageText,
    ulong LastMessageTick);
