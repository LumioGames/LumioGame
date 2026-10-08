using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Engine.SDK;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberSeededLayoutTests
{
    [Theory]
    [InlineData(19)]
    [InlineData(23)]
    [InlineData(27)]
    public void OneHundredSeedsProduceReproducibleDistinctLegalMirroredLayouts(int size)
    {
        MethodInfo? seededPlan = typeof(M2InitialLayout).GetMethod("Plan", new[] { typeof(int), typeof(ulong) });
        Assert.NotNull(seededPlan);
        M2Layout Plan(ulong seed) => (M2Layout)seededPlan.Invoke(null, new object[] { size, seed })!;
        var fingerprints = new HashSet<string>(StringComparer.Ordinal);
        M2Layout envelope = M2InitialLayout.Plan(size);
        for (ulong seed = 1; seed <= 100; seed++)
        {
            M2Layout layout = Plan(seed);
            Assert.Equal(Fingerprint(layout), Fingerprint(Plan(seed)));
            Assert.Equal(envelope.Potential, layout.Potential);
            Assert.Equal(envelope.Water, layout.Water);
            Assert.Equal(envelope.Pillars, layout.Pillars);
            Assert.InRange(layout.Cells.Count, 1, M2BudgetEnvelope.DestructibleCap(layout.Potential));
            Assert.True(layout.Potential - layout.Cells.Count >= layout.Players * 9);
            foreach (M2CellKind kind in Enum.GetValues<M2CellKind>().Where(kind => kind != M2CellKind.Soft))
                Assert.Equal(envelope.Count(kind), layout.Count(kind));
            var cells = layout.Cells.ToDictionary(cell => (cell.X, cell.Z), cell => cell.Kind);
            foreach (M2Cell cell in layout.Cells)
            {
                Assert.False(M2InitialLayout.IsSafetyCell(size, cell.X, cell.Z));
                Assert.False(M2InitialLayout.IsWaterCell(size, cell.X, cell.Z));
                Assert.False(M2InitialLayout.IsPillarCell(size, cell.X, cell.Z));
                Assert.True(M2InitialLayout.IsTierCell(size, cell));
                Assert.Equal(cell.Kind, cells[(size - 1 - cell.X, cell.Z)]);
                Assert.Equal(cell.Kind, cells[(cell.X, size - 1 - cell.Z)]);
                Assert.Equal(cell.Kind, cells[(size - 1 - cell.X, size - 1 - cell.Z)]);
            }
            fingerprints.Add(Fingerprint(layout));
        }
        Assert.True(fingerprints.Count > 1, "The selected seed must affect actual resource cells, not just ordering or report metadata.");
    }

    [Fact]
    public void ActualNativeNextRoundReplansResourcesFromItsNewAuthoritativeSeed()
    {
        using var scene = new BomberTerrainProductionTests.Scene(0, 5, 5, m2: true);
        var runtime = scene.World.Single<BomberWorldRuntime>();
        var match = scene.World.Single<BomberMatchState>();
        BomberInitialResources.Configure(scene.World, M2InitialLayout.Plan(19));
        for (int i = 0; i < 8 && runtime.InitialResourcePhase.Value != 3; i++) scene.Manager.Tick();
        Assert.Equal(3, runtime.InitialResourcePhase.Value);
        M2Layout first = JsonSerializer.Deserialize<M2Layout>(runtime.InitialResourcePlan.Value)!;
        ulong oldSeed = match.Seed.Value;
        BomberRoundRolloverTests.EndRound(scene);
        Assert.Equal(2UL, match.MatchId.Value);
        Assert.NotEqual(oldSeed, match.Seed.Value);
        for (int i = 0; i < 8 && runtime.InitialResourcePhase.Value != 3; i++) scene.Manager.Tick();
        Assert.Equal(3, runtime.InitialResourcePhase.Value);
        M2Layout second = JsonSerializer.Deserialize<M2Layout>(runtime.InitialResourcePlan.Value)!;
        Assert.NotEqual(Fingerprint(first), Fingerprint(second));
        Assert.Equal(2UL, runtime.TerrainInitialMatchId.Value);
        foreach (M2Cell cell in second.Cells)
        {
            uint expected = cell.Kind == M2CellKind.Barrel ? 1032u << 8 : cell.Kind == M2CellKind.Soft ? 1025u << 8 : 1028u << 8;
            Assert.Equal(expected, scene.Native.ReadCell(new VoxelWorldCoordinate(cell.X, 1, cell.Z)).BlockId);
        }
        Assert.Empty(scene.World.Each<BomberPickupItem>());
    }

    private static string Fingerprint(M2Layout layout) => string.Join(";", layout.Cells.OrderBy(cell => cell.Z).ThenBy(cell => cell.X)
        .Select(cell => FormattableString.Invariant($"{cell.X},{cell.Z}:{cell.Kind}")));
}
