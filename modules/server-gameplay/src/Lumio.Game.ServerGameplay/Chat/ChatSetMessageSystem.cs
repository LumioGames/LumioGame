using System;
using System.Text;
using System.Threading;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Samples.Username.Components.Chat;
using RuntimeChatMapping = Lumio.GameRuntime.Replication.Chat.ChatMapping;

namespace Lumio.Game.ServerGameplay;

/// <summary>
/// Gameplay admit / SetMessage surface. The unique ChatComponent lives in
/// <c>Lumio.GameRuntime.Samples.Username.Server</c>; Game does not own a world or queue.
/// </summary>
public static class ChatSetMessageSystem
{
    /// <summary>Decodes and validates a Runtime C-1 InputCommand, then admits its typed message.</summary>
    public static ChatOperationResult AdmitEnvelope(
        WorldManager manager,
        string roomId,
        NetEntityId sender,
        string connectionId,
        ulong connectionGeneration,
        ReadOnlySpan<byte> envelope)
    {
        InputCommandMessage input;
        try
        {
            input = WireCodec.DecodeInput(envelope, sender);
        }
        catch (FormatException exception)
        {
            return ChatOperationResult.Rejected(MapRuntimeCodecError(exception));
        }

        return Admit(manager, roomId, sender, connectionId, connectionGeneration, input);
    }

    /// <summary>Admits a Runtime-validated typed chat command into the World Manager inbox.</summary>
    public static ChatOperationResult Admit(
        WorldManager manager,
        string roomId,
        NetEntityId sender,
        string connectionId,
        ulong connectionGeneration,
        InputCommandMessage input)
    {
        if (manager is null)
        {
            throw new ArgumentNullException(nameof(manager));
        }

        _ = roomId;
        if (input is null)
        {
            throw new ArgumentNullException(nameof(input));
        }

        if (input.Sender != sender)
        {
            return ChatOperationResult.Rejected(ChatErrorCodes.BadEnvelope);
        }

        if (input.Commands.Count != 1 || input.MappingId != RuntimeChatMapping.InputMappingId)
        {
            return ChatOperationResult.Rejected(input.Commands.Count == 1
                ? ChatErrorCodes.UnknownCommandType
                : ChatErrorCodes.BadEnvelope);
        }

        if (!WireCodec.TryReadUtf8Payload(input.Payload.Span, out string text))
        {
            return ChatOperationResult.Rejected(ChatErrorCodes.UndecodablePayload);
        }

        if (Encoding.UTF8.GetByteCount(text) > RuntimeChatMapping.MaxTextUtf8Bytes)
        {
            return ChatOperationResult.Rejected(ChatErrorCodes.ChatTextTooLong);
        }

        manager.Enqueue(new InputCommandMessage(input.Sequence, sender, input.Commands, connectionId, connectionGeneration));
        return ChatOperationResult.Admitted();
    }

    /// <summary>
    /// Authoritative SetMessage. Calls Runtime <see cref="ChatComponent.SendMessage"/> on the owner thread.
    /// Off-thread calls are rejected with zero component writes.
    /// </summary>
    public static ChatOperationResult SetMessage(
        WorldManager manager,
        string roomId,
        NetEntityId netEntityId,
        string text)
    {
        if (manager is null)
        {
            throw new ArgumentNullException(nameof(manager));
        }

        _ = roomId;
        if (text is null)
        {
            throw new ArgumentNullException(nameof(text));
        }

        if (Encoding.UTF8.GetByteCount(text) > RuntimeChatMapping.MaxTextUtf8Bytes)
        {
            return ChatOperationResult.Rejected(ChatErrorCodes.ChatTextTooLong);
        }

        if (manager.OwnerThread is not null
            && Environment.CurrentManagedThreadId != manager.OwnerThread.ManagedThreadId
            && !ReferenceEquals(Thread.CurrentThread, manager.OwnerThread))
        {
            return ChatOperationResult.Fatal(ChatErrorCodes.OwnerThreadViolation);
        }

        if (!manager.World.IsLive(netEntityId))
        {
            return ChatOperationResult.Rejected(ChatErrorCodes.EntityDestroyed);
        }

        manager.World.Get<ChatComponent>(netEntityId).SendMessage(text);
        return ChatOperationResult.Committed();
    }

    /// <summary>Reads persist-only last-message fields from the Runtime ChatComponent.</summary>
    public static bool TryGetComponent(
        WorldManager manager,
        NetEntityId netEntityId,
        out ChatComponent component)
    {
        if (manager is null)
        {
            throw new ArgumentNullException(nameof(manager));
        }

        if (!manager.World.IsLive(netEntityId))
        {
            component = null!;
            return false;
        }

        component = manager.World.Get<ChatComponent>(netEntityId);
        return true;
    }

    private static string MapRuntimeCodecError(FormatException exception)
    {
        string detail = exception.Message;
        if (detail.Contains(ChatErrorCodes.BadPayloadHash, StringComparison.OrdinalIgnoreCase))
        {
            return ChatErrorCodes.BadPayloadHash;
        }

        if (detail.Contains(ChatErrorCodes.UndecodablePayload, StringComparison.OrdinalIgnoreCase))
        {
            return ChatErrorCodes.UndecodablePayload;
        }

        if (detail.Contains(ChatErrorCodes.BlockOrderViolation, StringComparison.OrdinalIgnoreCase))
        {
            return ChatErrorCodes.BlockOrderViolation;
        }

        if (detail.Contains("unknown command", StringComparison.OrdinalIgnoreCase))
        {
            return ChatErrorCodes.UnknownCommandType;
        }

        return ChatErrorCodes.BadEnvelope;
    }
}
