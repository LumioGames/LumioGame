namespace Lumio.Game.ServerGameplay;

/// <summary>
/// Chat mapping identifiers this repository owns. ADR-060 / R5-01 removed <c>chat.event</c> and
/// <c>chat.component</c> from <c>lumio.gameplay-envelope.v1</c> — a chat event now travels as the
/// <c>ChatComponent.OnChatMessage</c> ClientRpc record and last-message state is persist-only — so neither
/// is an envelope mapping. Envelope-wide identifiers and bounds live in Runtime
/// <see cref="Lumio.GameRuntime.Replication.Chat.ChatMapping"/> and are consumed from there — never
/// redeclared here.
/// </summary>
public static class ChatGameplayMapping
{
    /// <summary>Live-only event mapping: never persisted, never replayed on reconnect. Kind = event.</summary>
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
