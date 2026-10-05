using System;
using System.Collections.Generic;

namespace Lumio.Bomber.Bots;

internal sealed class BotPaths(int count)
{
    public int[] Steps { get; } = CreateSteps(count);
    public int[] Parents { get; } = CreateSteps(count);
    public long[] Arrivals { get; } = new long[count];
    public int Length => Steps.Length;
    public int this[int cell] => Steps[cell];
    private static int[] CreateSteps(int count) { int[] values = new int[count]; Array.Fill(values, -1); return values; }
}

internal sealed class BotNavigation
{
    private readonly BomberBotObservation board;
    private readonly List<BotHazard>[] hazards;
    private readonly HashSet<int> occupied = [];

    public BotNavigation(BomberBotObservation observation, IReadOnlyList<BotBomb> perceived)
    {
        board = observation;
        hazards = new List<BotHazard>[board.Cells.Length];
        for (int i = 0; i < hazards.Length; i++) hazards[i] = [];
        foreach (BotHazard hazard in board.Hazards)
            if ((uint)hazard.Cell < hazards.Length) hazards[hazard.Cell].Add(hazard);
        foreach (BotBomb bomb in board.Bombs)
            if (bomb.Explodes > board.Tick) occupied.Add(bomb.Cell);
        foreach (BotBomb bomb in perceived)
            if (bomb.Explodes > board.Tick) occupied.Add(bomb.Cell);
        var starts = new long[perceived.Count];
        var blasts = new HashSet<int>[perceived.Count];
        for (int i = 0; i < perceived.Count; i++)
        {
            starts[i] = perceived[i].Explodes;
            BotBomb bomb = perceived[i];
            if (bomb.Up >= 0 && bomb.Right >= 0 && bomb.Down >= 0 && bomb.Left >= 0)
            {
                blasts[i] = [bomb.Cell];
                int[] lengths = [bomb.Up, bomb.Right, bomb.Down, bomb.Left];
                int[] offsets = [-board.Width, 1, board.Width, -1];
                for (int direction = 0; direction < offsets.Length; direction++)
                    for (int step = 1; step <= lengths[direction]; step++)
                    {
                        int cell = bomb.Cell + offsets[direction] * step;
                        if ((uint)cell < board.Cells.Length) blasts[i].Add(cell);
                    }
            }
            else blasts[i] = Blast(bomb.Cell, bomb.Power, bomb.Pierce);
        }
        // Earliest visible chain contact is a conservative forecast, never an authoritative explosion.
        var due = new PriorityQueue<int, long>();
        for (int i = 0; i < starts.Length; i++) due.Enqueue(i, starts[i]);
        while (due.TryDequeue(out int a, out long when))
        {
            if (when != starts[a]) continue;
            for (int b = 0; b < perceived.Count; b++)
                if (starts[b] > starts[a] && blasts[a].Contains(perceived[b].Cell))
                { starts[b] = starts[a]; due.Enqueue(b, starts[b]); }
        }
        for (int i = 0; i < perceived.Count; i++)
            foreach (int cell in blasts[i]) hazards[cell].Add(new(cell, starts[i], starts[i] + Math.Max(1, perceived[i].Ends - perceived[i].Explodes)));
    }

    public BotPaths Paths(int start)
    {
        var paths = new BotPaths(board.Cells.Length);
        paths.Steps[start] = 0;
        paths.Arrivals[start] = board.Tick;
        var queue = new PriorityQueue<int, long>(); queue.Enqueue(start, board.Tick);
        while (queue.TryDequeue(out int cell, out long due))
        {
            if (paths.Arrivals[cell] != due) continue;
            foreach (int next in Neighbors(cell, board.Width))
            {
                if (!board.Cells[next].Known || !board.Cells[next].Passable || occupied.Contains(next)) continue;
                // Half of each crossing lies in each material. Round upward for a conservative arrival.
                int sourceCost = board.Cells[cell].Water ? board.WaterTicksPerCell : board.TicksPerCell;
                int targetCost = board.Cells[next].Water ? board.WaterTicksPerCell : board.TicksPerCell;
                long arrival = due + (sourceCost + targetCost + 1L) / 2;
                if (paths[next] >= 0 && paths.Arrivals[next] <= arrival) continue;
                if (!Safe(cell, due, due + (sourceCost + 1L) / 2 - 1)
                    || !Safe(next, arrival - (targetCost + 1L) / 2, arrival + 1)) continue;
                paths.Steps[next] = paths[cell] + 1; paths.Arrivals[next] = arrival; paths.Parents[next] = cell;
                queue.Enqueue(next, arrival);
            }
        }
        return paths;
    }

    public bool Safe(int cell, long from, long until)
    {
        if (!InCircle(cell, until)) return false;
        foreach (BotHazard hazard in hazards[cell])
            if (from < hazard.Until && until >= hazard.From) return false;
        return true;
    }

    public bool Rest(int cell) => board.Cells[cell].Known && board.Cells[cell].Passable
        && Safe(cell, board.Tick, long.MaxValue);

    public bool InCircle(int cell, long tick)
    {
        int side = board.NextSafeSide > 0 && tick >= board.NextCircleTick ? board.NextSafeSide : board.SafeSide;
        if (side <= 0) return true;
        int minimum = (board.Width - side) / 2;
        int x = cell % board.Width, z = cell / board.Width;
        return x >= minimum && z >= minimum && x < minimum + side && z < minimum + side;
    }

    public HashSet<int> Blast(int cell, int power, int pierce)
    {
        var result = new HashSet<int> { cell };
        foreach (int direction in new[] { -board.Width, 1, board.Width, -1 })
        {
            int current = cell, passed = 0;
            for (int step = 0; step < power; step++)
            {
                int next = current + direction;
                if ((uint)next >= board.Cells.Length || (Math.Abs(direction) == 1 && next / board.Width != current / board.Width)) break;
                BotCell material = board.Cells[next];
                if (!material.Known) break;
                result.Add(next);
                if (material.BlocksBlast && (!material.Destructible || passed++ >= pierce)) break;
                current = next;
            }
        }
        return result;
    }

    public int Destructibles(int cell, int power)
    {
        int count = 0;
        foreach (int affected in Blast(cell, power, 0)) if (board.Cells[affected].Destructible) count++;
        return count;
    }

    public static IEnumerable<int> Neighbors(int cell, int width)
    {
        if (cell >= width) yield return cell - width;
        if (cell % width < width - 1) yield return cell + 1;
        if (cell < width * (width - 1)) yield return cell + width;
        if (cell % width > 0) yield return cell - 1;
    }
}
