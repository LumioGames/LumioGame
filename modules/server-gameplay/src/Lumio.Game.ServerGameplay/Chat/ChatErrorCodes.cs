namespace Lumio.Game.ServerGameplay;

/// <summary>Stable codes for Chat apply outcomes. Wire reject codes match <c>lumio.gameplay-envelope.v1</c>.</summary>
public static class ChatErrorCodes
{
    /// <summary>ChatInput/ChatMessageEvent text exceeds 512 UTF-8 bytes.</summary>
    public const string ChatTextTooLong = "chat_text_too_long";

    /// <summary>More than one chat.input from the same sender in one authoritative tick.</summary>
    public const string ChatRateExceeded = "chat_rate_exceeded";

    /// <summary>Ingress queue at <see cref="ChatMapping.IngressQueueCapacity"/>.</summary>
    public const string QueueFull = "queue_full";

    /// <summary>A component write ran off the simulation owner thread (fail-stop, not a wire Error).</summary>
    public const string OwnerThreadViolation = "owner_thread_violation";

    /// <summary>SetMessage targeted a destroyed or never-created entity.</summary>
    public const string EntityDestroyed = "entity_destroyed";

    /// <summary>The room world has already fail-stopped.</summary>
    public const string WorldFaulted = "world_faulted";

    /// <summary>InputCommand messageType or command-array shape is illegal.</summary>
    public const string BadEnvelope = "bad_envelope";

    /// <summary>CommandBlock.mappingId is unregistered or not kind=command.</summary>
    public const string UnknownCommandType = "unknown_command_type";

    /// <summary>payloadSha256 does not match the decoded payload bytes.</summary>
    public const string BadPayloadHash = "bad_payload_hash";

    /// <summary>payload is not valid LumioBinV1 for the mapping fieldOrder.</summary>
    public const string UndecodablePayload = "undecodable_payload";

    /// <summary>CommandBlock mappingId array is not strictly ascending unique.</summary>
    public const string BlockOrderViolation = "block_order_violation";
}
