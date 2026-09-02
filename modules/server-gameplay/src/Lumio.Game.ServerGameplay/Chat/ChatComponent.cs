using System;
using Lumio.GameRuntime.Ecs.Annotations;

namespace Lumio.Game.ServerGameplay;

/// <summary>
/// Authoritative last-message component attached to PlayerEntity and BotEntity.
/// Dimensions come from N-04 field annotations (persistent / not-replicated / server-only).
/// </summary>
[EcsComponent]
public sealed class ChatComponent
{
    /// <summary>Creates an empty last-message component.</summary>
    public ChatComponent()
        : this(string.Empty, 0UL)
    {
    }

    /// <summary>Creates a snapshot of the last committed message.</summary>
    /// <param name="lastMessageText">Last committed UTF-8 text.</param>
    /// <param name="lastMessageTick">Authoritative tick at which <c>SetMessage</c> committed.</param>
    public ChatComponent(string lastMessageText, ulong lastMessageTick)
    {
        LastMessageText = lastMessageText ?? throw new ArgumentNullException(nameof(lastMessageText));
        LastMessageTick = lastMessageTick;
        LastMessagePersistOnly = string.Empty;
    }

    /// <summary>Last committed message text (mapping field <c>lastMessageText</c>).</summary>
    [Persist]
    public string LastMessageText { get; set; }

    /// <summary>Last committed logical tick (mapping field <c>lastMessageTick</c>).</summary>
    [Persist]
    public ulong LastMessageTick { get; set; }

    /// <summary>
    /// Persist-only probe field aligned with the N-04 declaration table.
    /// It is not a live client property-sync stream and is not a chat.component mapping field.
    /// </summary>
    [Persist]
    public string LastMessagePersistOnly { get; set; } = string.Empty;
}
