using System;
using RuntimeChat = Lumio.GameRuntime.Replication.Chat;

namespace Lumio.Game.ServerGameplay;

/// <summary>
/// Gameplay SetMessage system. Writes run on a Runtime <c>EcsWorld</c> through
/// <c>EcsCommandBufferCommit</c>; Game does not own a world, ingress queue, or <c>RunTick</c>.
/// </summary>
public static class ChatSetMessageSystem
{
    /// <summary>
    /// Decodes a frozen InputCommand envelope, then admits <see cref="ChatInput"/> into Runtime Ingress.
    /// Hash mismatch is reported before any component write.
    /// </summary>
    public static ChatOperationResult AdmitEnvelope(
        RuntimeChat.ChatCommandRuntime runtime,
        string roomId,
        string connectionId,
        ulong connectionGeneration,
        InputCommandEnvelope envelope)
    {
        if (!InputCommandEnvelope.TryDecodeChatText(envelope, out string text, out string errorCode))
        {
            return ChatOperationResult.Rejected(errorCode);
        }

        return Admit(runtime, roomId, connectionId, connectionGeneration, new ChatInput(text));
    }

    /// <summary>
    /// Admits <paramref name="input"/> into Runtime bounded Ingress. Network-thread safe; does not write ChatComponent.
    /// </summary>
    public static ChatOperationResult Admit(
        RuntimeChat.ChatCommandRuntime runtime,
        string roomId,
        string connectionId,
        ulong connectionGeneration,
        ChatInput input)
    {
        if (runtime is null)
        {
            throw new ArgumentNullException(nameof(runtime));
        }

        RuntimeChat.ChatMappingResult result = runtime.AdmitInput(
            roomId,
            connectionId,
            connectionGeneration,
            new RuntimeChat.ChatInput(input.Text));
        return Map(result, ChatOperationKind.Admitted);
    }

    /// <summary>
    /// Authoritative SetMessage. Must run on the Simulation Owner Thread inside Runtime command commit.
    /// Off-thread calls fail-stop with zero component writes.
    /// </summary>
    public static ChatOperationResult SetMessage(
        RuntimeChat.ChatCommandRuntime runtime,
        string roomId,
        string netEntityId,
        string text)
    {
        if (runtime is null)
        {
            throw new ArgumentNullException(nameof(runtime));
        }

        RuntimeChat.ChatMappingResult result = runtime.SetMessage(roomId, netEntityId, text);
        return Map(result, ChatOperationKind.Committed);
    }

    /// <summary>Reads persist-only last-message fields from the Runtime world.</summary>
    public static bool TryGetComponent(
        RuntimeChat.ChatCommandRuntime runtime,
        string netEntityId,
        out ChatComponent component)
    {
        if (runtime is null)
        {
            throw new ArgumentNullException(nameof(runtime));
        }

        if (runtime.TryGetLastMessage(netEntityId, out string? text, out ulong tick))
        {
            component = new ChatComponent(text ?? string.Empty, tick);
            return true;
        }

        component = null!;
        return false;
    }

    private static ChatOperationResult Map(RuntimeChat.ChatMappingResult result, ChatOperationKind successKind)
    {
        if (result.Succeeded)
        {
            return successKind == ChatOperationKind.Admitted
                ? ChatOperationResult.Admitted()
                : ChatOperationResult.Committed();
        }

        string code = result.Code ?? ChatErrorCodes.WorldFaulted;
        if (string.Equals(code, ChatErrorCodes.ChatTextTooLong, StringComparison.Ordinal)
            || string.Equals(code, ChatErrorCodes.ChatRateExceeded, StringComparison.Ordinal)
            || string.Equals(code, ChatErrorCodes.QueueFull, StringComparison.Ordinal))
        {
            return ChatOperationResult.Rejected(code);
        }

        if (string.Equals(code, "runtime_failure", StringComparison.Ordinal))
        {
            string detail = result.Detail ?? string.Empty;
            if (detail.Contains("Simulation Owner Thread", StringComparison.Ordinal))
            {
                return ChatOperationResult.Fatal(ChatErrorCodes.OwnerThreadViolation);
            }

            if (detail.Contains("not live", StringComparison.Ordinal))
            {
                return ChatOperationResult.Rejected(ChatErrorCodes.EntityDestroyed);
            }

            return ChatOperationResult.Rejected(ChatErrorCodes.WorldFaulted);
        }

        return ChatOperationResult.Rejected(code);
    }
}
