using System;
using System.Linq;

namespace Lumio.Bomber.Bots;

internal static class BotLineup
{
    internal static string Select(int index, int count, int rookie, int normal, int hard)
    {
        if (count <= 0 || index < 0 || index >= count || rookie < 0 || normal < 0 || hard < 0 || rookie + normal + hard <= 0)
            throw new ArgumentOutOfRangeException(nameof(count));
        int[] weights = [rookie, normal, hard], shares = new int[3];
        int sum = checked(weights.Sum()), remaining = count;
        for (int i = 0; i < 3; i++) { shares[i] = checked(count * weights[i]) / sum; remaining -= shares[i]; }
        foreach (int i in Enumerable.Range(0, 3).OrderByDescending(i => count * weights[i] % sum).ThenBy(i => i).Take(remaining)) shares[i]++;
        return index < shares[0] ? "rookie" : index < shares[0] + shares[1] ? "normal" : "hard";
    }
}
