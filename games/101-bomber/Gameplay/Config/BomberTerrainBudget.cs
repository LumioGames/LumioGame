using System;
using System.Linq;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Config;

/// <summary>Terrain-only bounds; these do not certify the simultaneous M2 producer set.</summary>
public readonly record struct BomberTerrainBudget(int CellsPerBatch, int RetainedSourceBombs, int InitialOutputCeiling,
    int PendingDetailBytes, int PendingRewardBytes)
{
    public static BomberTerrainBudget Calculate(IBomberConfig config, M2Layout layout)
    {
        BomberResourceRewardRules.Validate(config);
        int output = 0;
        foreach (var cell in layout.Cells)
        {
            if (cell.Kind == M2CellKind.Barrel) continue;
            var row = cell.Kind == M2CellKind.Soft ? BomberResourceRewardRules.Soft(config, layout.Size, cell.X, cell.Z)
                : BomberResourceRewardRules.Named(config, cell.Kind.ToString());
            output = checked(output + BomberResourceRewardRules.Maximum(config, row));
        }
        const int mutations = 64;
        // One pending Native batch and one already accepted cohort awaiting the existing Effect business phase.
        int retained = checked(mutations * 2);
        ulong ordinary = checked((ulong)config.Game.PlayerCount * (ulong)config.ObjectBudgets.PlacementsPerParticipantTick *
            checked(Ticks.FromMilliseconds(config.Bomb.FuseMs, config.Game.TickRateHz) + Ticks.FromMilliseconds(config.Bomb.DangerMs, config.Game.TickRateHz) +
                (ulong)config.ObjectBudgets.ReservationRetirementSlackTicks));
        if (config.Map.LayoutKind == "LegacyPillars" && ordinary + (ulong)retained > (ulong)config.ObjectBudgets.BombCapacity)
            throw new InvalidOperationException("Terrain pending-source cohorts exceed the effective bomb capacity.");
        if (output > config.ObjectBudgets.PickupCapacity)
            throw new InvalidOperationException("Initial resource outputs exceed the effective pickup capacity.");
        return new(mutations, retained, output, checked(mutations * 4096), checked(config.ObjectBudgets.PickupCapacity * 4096));
    }
}
