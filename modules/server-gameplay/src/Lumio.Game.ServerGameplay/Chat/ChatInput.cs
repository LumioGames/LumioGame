namespace Lumio.Game.ServerGameplay;

/// <summary>Gameplay ChatInput: message text only. Sender, sequence and tick are not client-supplied.</summary>
/// <param name="Text">UTF-8 chat text. Bounded by <see cref="ChatMapping.MaxTextUtf8Bytes"/>.</param>
public readonly record struct ChatInput(string Text);
