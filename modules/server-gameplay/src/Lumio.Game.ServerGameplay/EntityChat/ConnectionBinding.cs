namespace Lumio.Game.ServerGameplay;

/// <summary>C-2 binding five-tuple after Room admission.</summary>
/// <param name="AccountId">Persistent business identity.</param>
/// <param name="RoomId">Isolated Room World id.</param>
/// <param name="NetEntityId">Opaque never-reused Game Entity id (decimal u64 on the chat.event wire).</param>
/// <param name="EntityType">Server-classified Player or Bot.</param>
/// <param name="ConnectionGeneration">Binding epoch; reconnect/takeover increments it.</param>
public readonly record struct ConnectionBinding(
    string AccountId,
    string RoomId,
    ulong NetEntityId,
    GameEntityKind EntityType,
    ulong ConnectionGeneration);

/// <summary>Server resolution of a live or retained NetEntityId.</summary>
/// <param name="NetEntityId">Resolved entity id.</param>
/// <param name="RoomId">Home Room.</param>
/// <param name="EntityType">Classified kind.</param>
/// <param name="AccountId">Stable account identity carried as a value, never an AccountEntity reference.</param>
public readonly record struct EntityResolution(
    ulong NetEntityId,
    string RoomId,
    GameEntityKind EntityType,
    string AccountId);
