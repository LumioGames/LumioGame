using System;
using System.Collections.Generic;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation.Determinism;

namespace Lumio.Bomber.Gameplay.Config;

public enum M2CellKind
{
    Wood,
    Iron,
    Gold,
    Barrel,
    Soft,
}

public readonly record struct M2Cell(int X, int Z, M2CellKind Kind);

/// <summary>
/// Deterministic initial destructibles for one ADR0048 map. This does not write voxels or admit a room.
/// </summary>
public static class M2InitialLayout
{
    // The unseeded authoring envelope remains stable for saved migration fixtures.
    public static M2Layout Plan(int size) => Plan(ForSize(size), null);

    public static M2Layout Plan(int size, ulong seed) => Plan(ForSize(size), seed);

    private static Spec ForSize(int size) => size switch
    {
        19 => new Spec(19, 8, 3, 2, 2, 5, 8, 4, 4, true, false),
        23 => new Spec(23, 12, 4, 4, 3, 7, 12, 8, 4, true, true),
        27 => new Spec(27, 16, 5, 6, 4, 8, 16, 12, 4, true, true),
        _ => throw new ArgumentOutOfRangeException(nameof(size)),
    };

    public static bool IsWaterCell(int size, int x, int z) => IsWater(ForSize(size), (size - 1) / 2, x, z);

    public static bool IsPillarCell(int size, int x, int z)
    {
        var spec = ForSize(size);
        int center = (size - 1) / 2;
        return x > 0 && z > 0 && x < size - 1 && z < size - 1 && !IsWaterCell(size, x, z) &&
            Math.Max(Math.Abs(x - center), Math.Abs(z - center)) >= spec.Radius && x % 2 == 0 && z % 2 == 0;
    }

    public static bool IsTierCell(int size, M2Cell cell)
    {
        var spec = ForSize(size);
        int center = (size - 1) / 2, distance = Math.Max(Math.Abs(cell.X - center), Math.Abs(cell.Z - center));
        return cell.Kind switch
        {
            M2CellKind.Wood => distance > spec.MiddleMax,
            M2CellKind.Iron => distance > spec.CoreMax && distance <= spec.MiddleMax,
            M2CellKind.Gold => distance <= spec.CoreMax,
            M2CellKind.Barrel => distance > spec.CoreMax,
            M2CellKind.Soft => true,
            _ => false,
        };
    }

    private static M2Layout Plan(Spec spec, ulong? seed)
    {
        // Initial placement is a single per-match work unit. Its logical tick is zero,
        // so connection timing or delayed Native receipts cannot change the chosen map.
        var rng = new DeterminismContext(seed ?? 0, 0, RuntimeSchema.SchemaEpoch)
            .OpenRngStream(FormattableString.Invariant($"bomber.initial-layout.{spec.Size}"));
        bool randomized = seed.HasValue;
        int center = (spec.Size - 1) / 2;
        var potential = new HashSet<(int X, int Z)>();
        int water = 0;
        int pillars = 0;
        for (int z = 0; z < spec.Size; z++)
        for (int x = 0; x < spec.Size; x++)
        {
            bool border = x < 1 || z < 1 || x >= spec.Size - 1 || z >= spec.Size - 1;
            bool wet = IsWater(spec, center, x, z);
            if (wet) water++;
            int distance = Math.Max(Math.Abs(x - center), Math.Abs(z - center));
            bool pillar = !border && !wet && distance >= spec.Radius && x % 2 == 0 && z % 2 == 0;
            if (pillar) pillars++;
            if (!border && !wet && !pillar) potential.Add((x, z));
        }

        var reservedEmpty = new HashSet<(int X, int Z)>();
        foreach (var cell in potential)
        {
            int dx = Math.Abs(cell.X - center);
            int dz = Math.Abs(cell.Z - center);
            bool plaza = dx <= 1 && dz <= 1;
            bool bridge = (dx == spec.Radius && cell.Z == center) || (dz == spec.Radius && cell.X == center);
            if (plaza || bridge || IsSafetyCell(spec.Size, cell.X, cell.Z)) reservedEmpty.Add(cell);
        }

        var open = new HashSet<(int X, int Z)>(potential);
        open.ExceptWith(reservedEmpty);
        var placed = new List<M2Cell>();
        PlaceQuads(spec, center, open, placed, M2CellKind.Gold, spec.Gold / 4, static (spec, distance) => distance <= spec.CoreMax, randomized, ref rng);
        if (spec.OuterBarrels) PlaceQuads(spec, center, open, placed, M2CellKind.Barrel, 1, static (spec, distance) => distance > spec.MiddleMax, randomized, ref rng);
        if (spec.MiddleBarrels) PlaceQuads(spec, center, open, placed, M2CellKind.Barrel, 1, static (spec, distance) => distance > spec.CoreMax && distance <= spec.MiddleMax, randomized, ref rng);
        PlaceQuads(spec, center, open, placed, M2CellKind.Iron, spec.Iron / 4, static (spec, distance) => distance > spec.CoreMax && distance <= spec.MiddleMax, randomized, ref rng);
        PlaceQuads(spec, center, open, placed, M2CellKind.Wood, spec.Wood / 4, static (spec, distance) => distance > spec.MiddleMax, randomized, ref rng);

        int reserved = spec.Wood + spec.Iron + spec.Gold + (spec.OuterBarrels ? 4 : 0) + (spec.MiddleBarrels ? 4 : 0);
        int softBudget = M2BudgetEnvelope.SoftBlockRemainder(potential.Count, reserved);
        PlaceQuads(spec, center, open, placed, M2CellKind.Soft, int.MaxValue, static (_, _) => true, randomized, ref rng, softBudget);
        PlacePairs(spec, center, open, placed, softBudget, randomized, ref rng);

        return new M2Layout(spec.Size, spec.Players, water, pillars, potential.Count, placed);
    }

    private static void PlaceQuads(Spec spec, int center, HashSet<(int X, int Z)> open, List<M2Cell> placed,
        M2CellKind kind, int groups, Func<Spec, int, bool> ring, bool randomized, ref DeterministicRngStream rng, int softCeiling = int.MaxValue)
    {
        var reps = new List<(int X, int Z, int Distance)>();
        for (int z = 0; z < center; z++)
        for (int x = 0; x < center; x++)
        {
            int distance = Math.Max(center - x, center - z);
            if (!ring(spec, distance)) continue;
            var orbit = Orbit(spec.Size, x, z);
            if (orbit.TrueForAll(open.Contains)) reps.Add((x, z, distance));
        }
        reps.Sort(static (left, right) =>
        {
            int byDistance = left.Distance.CompareTo(right.Distance);
            if (byDistance != 0) return byDistance;
            int byX = left.X.CompareTo(right.X);
            return byX != 0 ? byX : left.Z.CompareTo(right.Z);
        });
        if (randomized) Shuffle(reps, ref rng);
        int placedGroups = 0;
        foreach (var rep in reps)
        {
            if (placedGroups == groups) break;
            int soft = Count(placed, M2CellKind.Soft);
            if (kind == M2CellKind.Soft && soft + 4 > softCeiling) break;
            foreach (var cell in Orbit(spec.Size, rep.X, rep.Z))
            {
                open.Remove(cell);
                placed.Add(new M2Cell(cell.X, cell.Z, kind));
            }
            placedGroups++;
        }
        if (kind != M2CellKind.Soft && placedGroups != groups)
            throw new InvalidOperationException($"m2_layout: {kind} placed {placedGroups * 4} of {groups * 4} on {spec.Size}.");
    }

    private static void PlacePairs(Spec spec, int center, HashSet<(int X, int Z)> open, List<M2Cell> placed, int softCeiling,
        bool randomized, ref DeterministicRngStream rng)
    {
        var reps = new List<(int X, int Z)>();
        for (int z = 0; z < center; z++)
            if (open.Contains((center, z)) && open.Contains((center, spec.Size - 1 - z))) reps.Add((center, z));
        for (int x = 0; x < center; x++)
            if (open.Contains((x, center)) && open.Contains((spec.Size - 1 - x, center))) reps.Add((x, center));
        reps.Sort(static (left, right) =>
        {
            int byX = left.X.CompareTo(right.X);
            return byX != 0 ? byX : left.Z.CompareTo(right.Z);
        });
        if (randomized) Shuffle(reps, ref rng);
        foreach (var rep in reps)
        {
            if (Count(placed, M2CellKind.Soft) + 2 > softCeiling) break;
            var pair = rep.X == center
                ? new[] { (rep.X, rep.Z), (rep.X, spec.Size - 1 - rep.Z) }
                : new[] { (rep.X, rep.Z), (spec.Size - 1 - rep.X, rep.Z) };
            foreach (var cell in pair)
            {
                open.Remove(cell);
                placed.Add(new M2Cell(cell.Item1, cell.Item2, M2CellKind.Soft));
            }
        }
    }

    private static void Shuffle<T>(List<T> candidates, ref DeterministicRngStream rng)
    {
        for (int last = candidates.Count - 1; last > 0; last--)
        {
            int selected = checked((int)(rng.NextUInt32() % (uint)(last + 1)));
            (candidates[last], candidates[selected]) = (candidates[selected], candidates[last]);
        }
    }

    private static int Count(List<M2Cell> placed, M2CellKind kind)
    {
        int count = 0;
        foreach (var cell in placed) if (cell.Kind == kind) count++;
        return count;
    }

    public static bool IsSafetyCell(int size, int x, int z)
    {
        if (size is not (19 or 23 or 27)) throw new ArgumentOutOfRangeException(nameof(size));
        int center = (size - 1) / 2, edge = size - 2;
        int radius = size == 19 ? 3 : size == 23 ? 4 : 5;
        int dx = Math.Abs(x - center), dz = Math.Abs(z - center);
        if ((dx <= 1 && dz <= 1) || (dx == 0 && dz <= radius + 1) || (dz == 0 && dx <= radius + 1)) return true;
        var spawns = new List<(int X, int Z)> { (1, 1), (edge, 1), (1, edge), (edge, edge) };
        var edges = size == 19 ? new[] { center } : size == 23 ? new[] { 7, size - 1 - 7 } : new[] { 7, center, size - 1 - 7 };
        foreach (int k in edges) { spawns.Add((k, 1)); spawns.Add((1, k)); spawns.Add((edge, k)); spawns.Add((k, edge)); }
        foreach (var spawn in spawns)
            if (Math.Abs(x - spawn.X) + Math.Abs(z - spawn.Z) <= 1) return true;
        return false;
    }

    private static List<(int X, int Z)> Orbit(int size, int x, int z) =>
        new() { (x, z), (size - 1 - x, z), (x, size - 1 - z), (size - 1 - x, size - 1 - z) };

    private static bool IsWater(Spec spec, int center, int x, int z)
    {
        int dx = Math.Abs(x - center);
        int dz = Math.Abs(z - center);
        if (Math.Max(dx, dz) == spec.Radius && dx != 0 && dz != 0) return true;
        for (int i = 0; i < spec.Branch; i++)
            if (dx == spec.Radius + 1 + i / 2 && dz == spec.Radius + (i + 1) / 2) return true;
        return false;
    }

    private readonly record struct Spec(
        int Size, int Players, int Radius, int Branch, int CoreMax, int MiddleMax,
        int Wood, int Iron, int Gold, bool OuterBarrels, bool MiddleBarrels);
}

public sealed record M2Layout(int Size, int Players, int Water, int Pillars, int Potential, IReadOnlyList<M2Cell> Cells)
{
    public int Count(M2CellKind kind)
    {
        int count = 0;
        foreach (var cell in Cells) if (cell.Kind == kind) count++;
        return count;
    }
}
