using System;

namespace Lumio.Game.ServerGameplay;

/// <summary>
/// Authoritative last-message component attached to PlayerEntity and BotEntity.
/// Fields are persist-only and never part of the client property-sync stream.
/// </summary>
public sealed class ChatComponent
{
    /// <summary>Creates an immutable snapshot of the last committed message.</summary>
    /// <param name="lastMessageText">Last committed UTF-8 text.</param>
    /// <param name="lastMessageTick">Authoritative tick at which <c>SetMessage</c> committed.</param>
    public ChatComponent(string lastMessageText, ulong lastMessageTick)
    {
        LastMessageText = lastMessageText ?? throw new ArgumentNullException(nameof(lastMessageText));
        LastMessageTick = lastMessageTick;
    }

    /// <summary>Last committed message text (mapping field <c>lastMessageText</c>).</summary>
    public string LastMessageText { get; }

    /// <summary>Last committed logical tick (mapping field <c>lastMessageTick</c>).</summary>
    public ulong LastMessageTick { get; }
}
