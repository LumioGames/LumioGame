using System;
using System.Buffers.Binary;
using System.Text;
using System.Threading;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Samples.Username.Components.Chat;

namespace Lumio.Game.ServerGameplay;

/// <summary>
/// Gameplay admit / SetMessage surface. The unique ChatComponent lives in
/// <c>Lumio.GameRuntime.Samples.Username.Server</c>; Game does not own a world or queue.
/// </summary>
public static class ChatSetMessageSystem
{
    /// <summary>
    /// Decodes a frozen InputCommand envelope, then admits <see cref="ChatInput"/> into the World Manager inbox.
    /// Hash mismatch is reported before any component write.
    /// </summary>
    public static ChatOperationResult AdmitEnvelope(
        WorldManager manager,
        string roomId,
        string connectionId,
        ulong connectionGeneration,
        InputCommandEnvelope envelope)
    {
        if (!InputCommandEnvelope.TryDecodeChatText(envelope, out string text, out string errorCode))
        {
            return ChatOperationResult.Rejected(errorCode);
        }

        return Admit(manager, roomId, connectionId, connectionGeneration, new ChatInput(text));
    }

    /// <summary>
    /// Admits <paramref name="input"/> into the World Manager inbox. Network-thread safe; does not write ChatComponent.
    /// </summary>
    public static ChatOperationResult Admit(
        WorldManager manager,
        string roomId,
        string connectionId,
        ulong connectionGeneration,
        ChatInput input)
    {
        if (manager is null)
        {
            throw new ArgumentNullException(nameof(manager));
        }

        _ = roomId;
        _ = connectionGeneration;
        if (input.Text is null)
        {
            throw new ArgumentException("ChatInput.Text is required.", nameof(input));
        }

        if (Encoding.UTF8.GetByteCount(input.Text) > ChatMapping.MaxTextUtf8Bytes)
        {
            return ChatOperationResult.Rejected(ChatErrorCodes.ChatTextTooLong);
        }

        if (!manager.TryGetSession(connectionId, out NetEntityId sender))
        {
            return ChatOperationResult.Rejected("binding_not_found");
        }

        manager.Enqueue(new InputCommandMessage(ChatMapping.InputMappingId, sender, EncodeUtf8Prefixed(input.Text), connectionId));
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

        if (Encoding.UTF8.GetByteCount(text) > ChatMapping.MaxTextUtf8Bytes)
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

    private static byte[] EncodeUtf8Prefixed(string text)
    {
        byte[] utf8 = Encoding.UTF8.GetBytes(text ?? string.Empty);
        byte[] payload = new byte[4 + utf8.Length];
        BinaryPrimitives.WriteUInt32LittleEndian(payload, (uint)utf8.Length);
        Buffer.BlockCopy(utf8, 0, payload, 4, utf8.Length);
        return payload;
    }
}
