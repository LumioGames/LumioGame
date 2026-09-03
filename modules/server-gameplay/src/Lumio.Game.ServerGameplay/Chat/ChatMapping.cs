namespace Lumio.Game.ServerGameplay;

/// <summary>
/// Frozen Chat mapping identifiers and bounded-input limits from
/// <c>lumio.gameplay-envelope.v1</c>. This is a typed consumption surface, not a second protocol.
/// </summary>
public static class ChatMapping
{
    /// <summary>Contract id of the frozen gameplay envelope.</summary>
    public const string ContractId = "lumio.gameplay-envelope.v1";

    /// <summary>InputCommand tenant mapping. Kind = command.</summary>
    public const string InputMappingId = "chat.input";

    /// <summary>Delta-live-only event mapping. Kind = event.</summary>
    public const string EventMappingId = "chat.event";

    /// <summary>Persist-only component mapping. Kind = componentState; never on the wire.</summary>
    public const string ComponentMappingId = "chat.component";

    /// <summary>UTF-8 byte cap for chat.input / chat.event text.</summary>
    public const int MaxTextUtf8Bytes = 512;

    /// <summary>At most one committed chat.input per sender per authoritative tick.</summary>
    public const int MaxChatInputPerSenderPerTick = 1;

    /// <summary>Ingress queue bound from the envelope <c>limits.ingressQueuePerConnection</c>.</summary>
    public const int IngressQueueCapacity = 64;

    /// <summary>Bounded-input policy is reject, never silent drop.</summary>
    public const string BoundedInputPolicy = "reject";

    /// <summary>chat.input field order.</summary>
    public static readonly string[] InputFieldOrder = { "text" };

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
