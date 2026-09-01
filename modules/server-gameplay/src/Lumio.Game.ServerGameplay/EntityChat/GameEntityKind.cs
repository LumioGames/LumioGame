namespace Lumio.Game.ServerGameplay;

/// <summary>Game ECS entity kind derived from the authenticated login name, never a client field.</summary>
public enum GameEntityKind
{
    /// <summary>Ordinary Browser/client account.</summary>
    Player = 0,

    /// <summary>Bot-namespace account admitted with Bot-tool context.</summary>
    Bot = 1
}

/// <summary>Classifies an authenticated login name into PlayerEntity or BotEntity.</summary>
public static class GameEntityKindRules
{
    /// <summary>
    /// Bot namespace plus Bot-tool context creates a BotEntity; every other admitted name is a PlayerEntity.
    /// </summary>
    public static GameEntityKind Classify(string loginName, bool botToolContext)
    {
        return BotLaunchNames.IsBotNamespace(loginName) && botToolContext
            ? GameEntityKind.Bot
            : GameEntityKind.Player;
    }
}
