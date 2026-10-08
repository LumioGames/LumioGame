using System;

// Browser gameplay also targets netstandard2.1, which has no ThrowIfNegative helpers.
#pragma warning disable CA1512

namespace Lumio.Bomber.Gameplay.Config;

/// <summary>
/// Integer envelopes from ADR0048. These counts do not admit an M2 room.
/// </summary>
public static class M2BudgetEnvelope
{
    public static int DestructibleCap(int potentialCells)
    {
        if (potentialCells < 0) throw new ArgumentOutOfRangeException(nameof(potentialCells));
        return checked(potentialCells * 65) / 100;
    }

    public static int SoftBlockRemainder(int potentialCells, int reservedCratesAndBarrels)
    {
        int cap = DestructibleCap(potentialCells);
        if (reservedCratesAndBarrels < 0 || reservedCratesAndBarrels > cap)
            throw new InvalidOperationException("m2_budget: reserved destructibles exceed the potential-cell cap.");
        return cap - reservedCratesAndBarrels;
    }

    public static int RegenWaves(int stopExclusiveMs, int intervalMs, int firstTriggerMs)
    {
        if (stopExclusiveMs < 0) throw new ArgumentOutOfRangeException(nameof(stopExclusiveMs));
        if (intervalMs <= 0) throw new ArgumentOutOfRangeException(nameof(intervalMs));
        if (firstTriggerMs < 0) throw new ArgumentOutOfRangeException(nameof(firstTriggerMs));
        int count = 0;
        for (int time = firstTriggerMs; time < stopExclusiveMs;)
        {
            count++;
            time = checked(time + intervalMs);
        }
        return count;
    }
}
