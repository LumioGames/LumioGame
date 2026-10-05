using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

public sealed class M2InitialLayoutTests
{
    [Theory]
    [InlineData(19, 8, 28, 48, 213, 8, 4, 4, 4)]
    [InlineData(23, 12, 44, 80, 317, 12, 8, 4, 8)]
    [InlineData(27, 16, 60, 104, 461, 16, 12, 4, 8)]
    public void ThreeMapsPlaceMirroredCratesAndBarrelsInsideTheDestructibleCap(
        int size, int players, int water, int pillars, int potential, int wood, int iron, int gold, int barrels)
    {
        M2Layout layout = M2InitialLayout.Plan(size);
        Assert.Equal(players, layout.Players);
        Assert.Equal(water, layout.Water);
        Assert.Equal(pillars, layout.Pillars);
        Assert.Equal(potential, layout.Potential);
        Assert.Equal(wood, layout.Count(M2CellKind.Wood));
        Assert.Equal(iron, layout.Count(M2CellKind.Iron));
        Assert.Equal(gold, layout.Count(M2CellKind.Gold));
        Assert.Equal(barrels, layout.Count(M2CellKind.Barrel));
        int cap = M2BudgetEnvelope.DestructibleCap(potential);
        int reserved = wood + iron + gold + barrels;
        Assert.True(layout.Cells.Count <= cap);
        Assert.True(layout.Count(M2CellKind.Soft) <= cap - reserved);
        Assert.Equal(0, layout.Count(M2CellKind.Soft) % 2);

        int center = (size - 1) / 2;
        var occupied = layout.Cells.ToDictionary(cell => (cell.X, cell.Z), cell => cell.Kind);
        foreach (var cell in layout.Cells)
        {
            Assert.Equal(cell.Kind, occupied[(size - 1 - cell.X, cell.Z)]);
            Assert.Equal(cell.Kind, occupied[(cell.X, size - 1 - cell.Z)]);
            int dx = Math.Abs(cell.X - center);
            int dz = Math.Abs(cell.Z - center);
            Assert.False(dx <= 1 && dz <= 1);
        }
    }
}
