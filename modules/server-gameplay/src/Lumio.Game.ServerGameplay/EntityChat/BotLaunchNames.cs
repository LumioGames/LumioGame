using System;
using System.Globalization;

namespace Lumio.Game.ServerGameplay;

/// <summary>Bot launcher name loop: <c>Bot01</c> through <c>Bot100</c>.</summary>
public static class BotLaunchNames
{
    /// <summary>Main acceptance Bot count.</summary>
    public const int Count = 100;

    private static readonly string[] Cached = Build();

    /// <summary>Cached <c>Bot01</c>…<c>Bot100</c> names in loop order.</summary>
    public static string[] All => Cached;

    /// <summary>Formats one Bot login name. Index is 1-based.</summary>
    public static string Format(int index)
    {
        if (index < 1 || index > Count)
        {
            throw new ArgumentOutOfRangeException(nameof(index));
        }

        return "Bot" + index.ToString("D2", CultureInfo.InvariantCulture);
    }

    /// <summary>True when <paramref name="loginName"/> matches <c>Bot</c> plus decimal digits.</summary>
    public static bool IsBotNamespace(string loginName)
    {
        if (loginName is null || loginName.Length < 4 || !loginName.StartsWith("Bot", StringComparison.Ordinal))
        {
            return false;
        }

        for (int i = 3; i < loginName.Length; i++)
        {
            char c = loginName[i];
            if (c < '0' || c > '9')
            {
                return false;
            }
        }

        return true;
    }

    private static string[] Build()
    {
        var names = new string[Count];
        for (int i = 0; i < Count; i++)
        {
            names[i] = Format(i + 1);
        }

        return names;
    }
}
