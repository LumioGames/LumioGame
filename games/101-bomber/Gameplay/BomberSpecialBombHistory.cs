using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Lumio.Bomber.Gameplay;

/// <summary>Bounded, canonical match history of the six M2 special bomb identities.</summary>
public static class BomberSpecialBombHistory
{
    public static string Encode(IEnumerable<uint> values)
    {
        string text = string.Join(",", values.Select(value => value.ToString(CultureInfo.InvariantCulture)));
        _ = Decode(text);
        return text;
    }

    public static uint[] Decode(string text)
    {
        if (text is null || text.Length > 65) throw Invalid();
        if (text.Length == 0) return Array.Empty<uint>();
        string[] parts = text.Split(',');
        if (parts.Length > 6) throw Invalid();
        var values = new uint[parts.Length];
        for (int i = 0; i < parts.Length; i++)
        {
            if (!uint.TryParse(parts[i], NumberStyles.None, CultureInfo.InvariantCulture, out uint value) ||
                value == 0 || parts[i] != value.ToString(CultureInfo.InvariantCulture) ||
                Array.IndexOf(values, value, 0, i) >= 0) throw Invalid();
            values[i] = value;
        }
        return values;
    }

    private static InvalidOperationException Invalid() => new("Invalid bounded special bomb history.");
}
