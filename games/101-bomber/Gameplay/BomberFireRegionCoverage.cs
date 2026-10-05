using System;
using System.Collections.Generic;

namespace Lumio.Bomber.Gameplay;

/// <summary>Shared Game region bit order: z=-1..1, then x=-1..1; mask zero is empty.</summary>
public static class BomberFireRegionCoverage
{
    public static IEnumerable<(int X, int Z)> Cells(int x, int z, int mask)
    {
        if ((mask & ~511) != 0 || mask < 0) throw new ArgumentOutOfRangeException(nameof(mask));
        for (int bit = 0; bit < 9; bit++)
            if ((mask & (1 << bit)) != 0) yield return (x + bit % 3 - 1, z + bit / 3 - 1);
    }

    public static bool Contains(int x, int z, int mask, int atX, int atZ)
    {
        if ((mask & ~511) != 0 || mask < 0) throw new ArgumentOutOfRangeException(nameof(mask));
        int dx = atX - x, dz = atZ - z;
        return dx is >= -1 and <= 1 && dz is >= -1 and <= 1 &&
            (mask & (1 << ((dz + 1) * 3 + dx + 1))) != 0;
    }
}
