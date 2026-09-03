namespace Lumio.Game.ServerGameplay;

/// <summary>Authoritative live chat notification emitted after a committed <c>SetMessage</c>.</summary>
/// <param name="MessageId">Server-generated message id; never reused.</param>
/// <param name="RoomSequence">Strictly increasing room chat sequence.</param>
/// <param name="SenderNetEntityId">Sender as C-2 32-hex (instanceId || counter), not a u128 primitive.</param>
/// <param name="Text">Committed message text.</param>
/// <param name="AppliedTick">Authoritative tick at which the component update committed.</param>
public readonly record struct ChatMessageEvent(
    ulong MessageId,
    ulong RoomSequence,
    string SenderNetEntityId,
    string Text,
    ulong AppliedTick);
