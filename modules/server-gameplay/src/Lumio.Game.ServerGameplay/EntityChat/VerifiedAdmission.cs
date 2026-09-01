namespace Lumio.Game.ServerGameplay;

/// <summary>
/// Result of C-3 <c>verify_admission</c>. The Game host never accepts a username/password in place of this.
/// </summary>
/// <param name="AccountId">Stable Account Server identity.</param>
/// <param name="LoginName">Authenticated login name used for entity-kind classification.</param>
/// <param name="BotToolContext">True when the admission credential carries a valid Bot-tool claim.</param>
public readonly record struct VerifiedAdmission(string AccountId, string LoginName, bool BotToolContext);
