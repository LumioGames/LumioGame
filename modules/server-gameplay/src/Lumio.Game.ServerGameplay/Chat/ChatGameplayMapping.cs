namespace Lumio.Game.ServerGameplay;

/// <summary>
/// Chat mapping identifiers that <c>lumio.gameplay-envelope.v1</c> freezes but Runtime
/// <see cref="Lumio.GameRuntime.Replication.Chat.ChatMapping"/> does not expose. Envelope-wide
/// identifiers and bounds live there and are consumed from there — never redeclared here.
/// </summary>
public static class ChatGameplayMapping
{
    /// <summary>Delta-live-only event mapping. Kind = event.</summary>
    public const string EventMappingId = "chat.event";

    /// <summary>Persist-only component mapping. Kind = componentState; never on the wire.</summary>
    public const string ComponentMappingId = "chat.component";

    /// <summary>chat.event field order (C-1′: sender is two u64 LE, not a u128 primitive).</summary>
    public static readonly string[] EventFieldOrder =
    {
        "messageId",
        "roomSequence",
        "senderNetEntityIdInstanceId",
        "senderNetEntityIdCounter",
        "text",
        "appliedTick"
    };

    /// <summary>chat.component field order.</summary>
    public static readonly string[] ComponentFieldOrder = { "lastMessageText", "lastMessageTick" };
}
