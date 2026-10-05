using System;

namespace Lumio.Bomber.Gameplay;

/// <summary>ADR0039 half-heart units; hats are derived from upgrades, never a spendable currency.</summary>
public static class BomberGrowth
{
    public const int InitialHealth = 6;
    public const int MaximumGoldenHearts = 3;
    public const int HealthLimit = 16;

    public static int MaximumHealth(int hats, int goldenHeartCount)
    {
        return checked(InitialHealth + 2 * Math.Min(2, hats / 4) + 2 * Math.Min(3, goldenHeartCount));
    }

    public static bool IsBoss(int maximumHealth) => maximumHealth >= 12;

    internal static string? UpgradeAttribute(int kind) => (BomberPickupKind)kind switch
    {
        BomberPickupKind.Power => Config.BomberAttributeNames.BombPower,
        BomberPickupKind.Capacity => Config.BomberAttributeNames.BombCapacity,
        BomberPickupKind.Speed => Config.BomberAttributeNames.SpeedTier,
        _ => null,
    };
}
