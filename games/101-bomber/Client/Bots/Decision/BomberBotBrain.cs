using System;
using System.Collections.Generic;

namespace Lumio.Bomber.Bots;

internal sealed class BomberBotBrain(BotPolicy policy, ulong seed)
{
    private ulong random = seed == 0 ? 1 : seed;
    private ulong perceptionRandom = (seed ^ 0x5bd1e995UL) | 1;
    private readonly Dictionary<string, (long Seen, int Delay, int Power)> perceived = new(StringComparer.Ordinal);
    private BotBehavior behavior;
    private long behaviorUntil;
    private long nextSkillRoll;
    private long lastBombRequest = long.MinValue / 2;
    private long nextThink;
    private long nextEngage;
    private int rememberedGoal = -1;
    private bool dangerSeen;
    private long reactionUntil;

    public BotDecision Decide(BomberBotObservation observation)
    {
        ArgumentNullException.ThrowIfNull(observation);
        if (observation.Width <= 0 || observation.Cells.Length != observation.Width * observation.Width
            || (uint)observation.Self.Cell >= observation.Cells.Length || observation.TicksPerCell <= 0)
            throw new ArgumentException("Invalid confirmed Bot observation.", nameof(observation));
        UpdatePerception(observation);
        var navigation = new BotNavigation(observation, VisibleBombs(observation));
        int start = observation.Self.Cell;
        BotPaths paths = navigation.Paths(start);
        bool circleWarning = !navigation.InCircle(start, observation.Tick + observation.TicksPerCell * observation.Width);
        bool urgent = !navigation.Safe(start, observation.Tick, observation.Tick + observation.TicksPerCell * 2L + policy.EscapeMarginTicks)
            || circleWarning;
        if (urgent)
        {
            if (policy.OwnCellReaction && !circleWarning)
            {
                bool ownThreat = false;
                foreach (BotBomb bomb in observation.Bombs)
                    if (bomb.Owner == observation.Self.Participant && navigation.Blast(bomb.Cell, bomb.Power, bomb.Pierce).Contains(start)) ownThreat = true;
                if (!dangerSeen)
                    reactionUntil = observation.Tick + (ownThreat ? 0 : policy.ReactionMin
                        + Next(ref random, Math.Max(1, policy.ReactionMax - policy.ReactionMin + 1)));
                dangerSeen = true;
                if (!ownThreat && observation.Tick < reactionUntil)
                    return new(BotMove.None, false, false, behavior, start);
            }
            int escape = PickRest(observation, navigation, paths);
            return Choice(observation, paths, escape, false, Skill(observation, true, navigation));
        }
        dangerSeen = false;
        if (observation.Tick < nextThink && (uint)rememberedGoal < paths.Length && paths[rememberedGoal] >= 0
            && navigation.Rest(rememberedGoal))
            return Choice(observation, paths, rememberedGoal, false, false);
        nextThink = observation.Tick + Math.Max(1, policy.ThinkEvery);
        if (observation.Tick >= behaviorUntil)
        {
            int total = policy.FarmWeight + policy.HuntWeight + policy.CollectWeight + policy.RoamWeight;
            int pick = Next(ref random, Math.Max(1, total));
            behavior = pick < policy.FarmWeight ? BotBehavior.Farm
                : (pick -= policy.FarmWeight) < policy.HuntWeight ? BotBehavior.Hunt
                : (pick -= policy.HuntWeight) < policy.CollectWeight ? BotBehavior.Collect : BotBehavior.Roam;
            behaviorUntil = observation.Tick + policy.BehaviorMinTicks
                + Next(ref random, Math.Max(1, policy.BehaviorMaxTicks - policy.BehaviorMinTicks));
        }
        if (behavior != BotBehavior.Hunt && observation.AvailableBombs > 0 && observation.Tick >= nextEngage)
        {
            nextEngage = observation.Tick + policy.EngageCheckTicks;
            bool nearby = false;
            foreach (BotActor actor in observation.Actors)
                if (actor.Id != observation.Self.Id && (uint)actor.Cell < paths.Length && paths[actor.Cell] >= 0
                    && paths[actor.Cell] <= policy.EngageSteps && HumanPenalty(observation, actor) == 0) nearby = true;
            if (nearby && ((policy.FrenzyBypass && observation.SafeSide > 0 && observation.SafeSide <= policy.ShowdownSide)
                || Roll(ref random, Scale(policy.EngageChancePermille, policy.EngageScalePermille))))
            {
                behavior = BotBehavior.Hunt;
                behaviorUntil = observation.Tick + policy.EngageMinTicks
                    + Next(ref random, Math.Max(1, policy.EngageMaxTicks - policy.EngageMinTicks));
            }
        }
        int goal = PickGoal(observation, navigation, paths);
        int ownBombs = 0;
        bool occupied = false;
        foreach (BotBomb bomb in observation.Bombs)
        {
            if (bomb.Owner == observation.Self.Participant && bomb.Explodes > observation.Tick) ownBombs++;
            if (bomb.Cell == start && bomb.Explodes > observation.Tick) occupied = true;
        }
        if (!occupied && observation.AvailableBombs > 0 && !observation.Cells[start].Water
            && ownBombs < policy.AttackBombLimit && observation.Tick - lastBombRequest >= policy.ThinkEvery
            && WorthBomb(observation, navigation, start))
        {
            var forecast = new List<BotBomb>(VisibleBombs(observation))
            {
                new("intended-placement", observation.Self.Participant, start, observation.BombPower, 0,
                    observation.Tick + observation.FuseTicks, observation.Tick + observation.FuseTicks + observation.FlameTicks),
            };
            var gate = new BotNavigation(observation, forecast);
            BotPaths escapePaths = gate.Paths(start);
            int escape = PickRest(observation, gate, escapePaths);
            bool showdown = observation.SafeSide > 0 && observation.SafeSide <= policy.ShowdownSide;
            bool attack = showdown && policy.FrenzyBypass;
            if (!attack && policy.TrapPermille > 0)
                foreach (BotActor enemy in observation.Actors)
                {
                    if (enemy.Id == observation.Self.Id || !gate.Blast(start, observation.BombPower, 0).Contains(enemy.Cell)) continue;
                    BotPaths enemyPaths = gate.Paths(enemy.Cell);
                    if (PickRest(observation, gate, enemyPaths) < 0 && Roll(ref random, policy.TrapPermille)) { attack = true; break; }
                }
            int blastChance = behavior switch
            {
                BotBehavior.Farm => policy.FarmBlastPermille, BotBehavior.Hunt => policy.HuntBlastPermille,
                BotBehavior.Collect => policy.CollectBlastPermille, _ => policy.RoamBlastPermille,
            };
            if (!attack) attack = !Roll(ref perceptionRandom, policy.AttackSkipPermille)
                && Roll(ref random, Scale(blastChance, policy.BlastScalePermille));
            if (attack && escape != start && escape >= 0 && escapePaths.Arrivals[escape] - observation.Tick + policy.EscapeMarginTicks < observation.FuseTicks)
            {
                lastBombRequest = observation.Tick;
                return Choice(observation, escapePaths, escape, true, false);
            }
            if (attack && showdown && observation.Self.Health - observation.DamagePoints >= policy.TradeMinHealth)
                foreach (BotActor enemy in observation.Actors)
                    if (enemy.Id != observation.Self.Id && enemy.Health > 0 && enemy.Health < observation.Self.Health
                        && enemy.InvulnerableUntil <= observation.Tick + observation.FuseTicks
                        && enemy.Health <= observation.DamagePoints && gate.Blast(start, observation.BombPower, 0).Contains(enemy.Cell)
                        && Roll(ref perceptionRandom, policy.TradePermille))
                    {
                        lastBombRequest = observation.Tick;
                        return new(BotMove.None, true, false, BotBehavior.Hunt, start);
                    }
        }
        if (Roll(ref random, policy.NoisePermille))
        {
            var neighbors = new List<int>();
            for (int i = 0; i < paths.Length; i++)
                if (paths[i] == 1 && navigation.Rest(i)) neighbors.Add(i);
            if (neighbors.Count > 0) goal = neighbors[Next(ref random, neighbors.Count)];
        }
        rememberedGoal = goal;
        return Choice(observation, paths, goal, false, Skill(observation, false, navigation));
    }

    private void UpdatePerception(BomberBotObservation board)
    {
        var current = new HashSet<string>(StringComparer.Ordinal);
        foreach (BotBomb bomb in board.Bombs)
        {
            current.Add(bomb.Id);
            if (perceived.ContainsKey(bomb.Id)) continue;
            bool own = bomb.Owner == board.Self.Participant;
            int delay = own || policy.OwnCellReaction ? 0 : policy.ReactionMin + Next(ref perceptionRandom, Math.Max(1, policy.ReactionMax - policy.ReactionMin + 1));
            int power = !own && Roll(ref perceptionRandom, policy.UnderestimatePermille) ? Math.Max(1, bomb.Power - 1) : bomb.Power;
            perceived.Add(bomb.Id, (board.Tick, delay, power));
        }
        foreach (string id in new List<string>(perceived.Keys))
            if (!current.Contains(id)) perceived.Remove(id);
    }

    private List<BotBomb> VisibleBombs(BomberBotObservation board)
    {
        var result = new List<BotBomb>();
        foreach (BotBomb bomb in board.Bombs)
        {
            var perception = perceived[bomb.Id];
            if (bomb.Explodes <= board.Tick || board.Tick - perception.Seen >= perception.Delay)
                result.Add(bomb with { Power = perception.Power });
        }
        return result;
    }

    private static int PickRest(BomberBotObservation board, BotNavigation navigation, BotPaths paths)
    {
        int best = -1;
        for (int cell = 0; cell < paths.Length; cell++)
            if (paths[cell] >= 0 && navigation.Rest(cell)
                && (best < 0 || paths.Arrivals[cell] < paths.Arrivals[best])) best = cell;
        return best;
    }

    private int PickGoal(BomberBotObservation board, BotNavigation navigation, BotPaths paths)
    {
        int best = board.Self.Cell;
        double bestScore = double.NegativeInfinity;
        foreach (BotPickup pickup in board.Pickups)
        {
            if ((uint)pickup.Cell >= paths.Length || paths[pickup.Cell] < 0) continue;
            if (!navigation.Rest(pickup.Cell))
            {
                long arrival = paths.Arrivals[pickup.Cell];
                if (!navigation.Safe(pickup.Cell, arrival, arrival + board.TicksPerCell)
                    || !Roll(ref perceptionRandom, policy.RiskyPickupPermille)) continue;
            }
            double score = (pickup.Kind == 3 && board.Self.Health < 6 ? 40 : 18) - paths[pickup.Cell];
            if (score > bestScore) { best = pickup.Cell; bestScore = score; }
        }
        if (bestScore > 0) return best;
        for (int cell = 0; cell < paths.Length; cell++)
        {
            if (paths[cell] <= 0 || !navigation.Rest(cell)) continue;
            double score = -paths[cell];
            int bricks = navigation.Destructibles(cell, board.BombPower);
            if (behavior is BotBehavior.Farm or BotBehavior.Collect) score += bricks * 12;
            if (behavior == BotBehavior.Hunt || bricks == 0)
                foreach (BotActor actor in board.Actors)
                {
                    if (actor.Id == board.Self.Id) continue;
                    double target = 16 + actor.Hats - Distance(cell, actor.Cell, board.Width) * 2 - HumanPenalty(board, actor);
                    score = Math.Max(score, target - paths[cell]);
                }
            if (behavior == BotBehavior.Roam) score += paths[cell] * 1.5;
            if (score > bestScore) { best = cell; bestScore = score; }
        }
        return best;
    }

    private int HumanPenalty(BomberBotObservation board, BotActor actor)
    {
        if (!actor.Human || actor.Id == board.HatKing || Distance(board.Self.Cell, actor.Cell, board.Width) <= policy.HumanNearCells) return 0;
        int rank = 0;
        int ownDistance = Distance(board.Self.Cell, actor.Cell, board.Width);
        foreach (BotActor other in board.Actors)
            if (!other.Human && other.Id != board.Self.Id
                && (Distance(other.Cell, actor.Cell, board.Width) < ownDistance
                    || (Distance(other.Cell, actor.Cell, board.Width) == ownDistance && string.CompareOrdinal(other.Id, board.Self.Id) < 0))) rank++;
        return rank >= policy.HumanChasers ? policy.HumanPenalty : 0;
    }

    private bool WorthBomb(BomberBotObservation board, BotNavigation navigation, int cell)
    {
        if (navigation.Destructibles(cell, board.BombPower) > 0) return true;
        HashSet<int> blast = navigation.Blast(cell, board.BombPower, 0);
        foreach (BotActor actor in board.Actors)
            if (actor.Id != board.Self.Id && blast.Contains(actor.Cell) && HumanPenalty(board, actor) == 0) return true;
        return false;
    }

    private bool Skill(BomberBotObservation board, bool danger, BotNavigation navigation)
    {
        if (!board.SkillReady || board.ActiveSkill == 0 || board.Tick < nextSkillRoll) return false;
        bool useful = false;
        if (board.ActiveSkill is 2 or 9)
            useful = !navigation.Safe(board.Self.Cell, board.Tick, board.Tick + policy.SkillLeadTicks);
        else if (board.ActiveSkill is 3 or 8)
        {
            int landing = -1;
            foreach (int cell in FacingRay(board))
            {
                if (!board.Cells[cell].Known || (!board.Cells[cell].Passable && !board.Cells[cell].Destructible)) break;
                if (!board.Cells[cell].Passable) continue;
                bool occupied = false;
                foreach (BotBomb bomb in board.Bombs) if (bomb.Cell == cell && bomb.Explodes > board.Tick) occupied = true;
                if (!occupied) landing = cell;
            }
            useful = danger && landing >= 0 && navigation.Rest(landing);
        }
        else if (board.ActiveSkill == 13)
        {
            foreach (int cell in FacingRay(board))
            {
                foreach (BotBomb bomb in board.Bombs)
                    if (bomb.Cell == cell && bomb.Explodes > board.Tick) useful = true;
                if (!board.Cells[cell].Known || !board.Cells[cell].Passable || useful) break;
            }
        }
        else if (board.ActiveSkill == 4)
            foreach (BotActor actor in board.Actors)
                if (actor.Id != board.Self.Id && Distance(board.Self.Cell, actor.Cell, board.Width) <= board.ActiveRange) useful = true;
        if (!useful) return false;
        nextSkillRoll = board.Tick + policy.SkillRetryTicks;
        return Roll(ref perceptionRandom, policy.SkillUsePermille);
    }

    private static IEnumerable<int> FacingRay(BomberBotObservation board)
    {
        int dx = board.Facing == BotMove.Right ? 1 : board.Facing == BotMove.Left ? -1 : 0;
        int dz = board.Facing == BotMove.Down ? 1 : board.Facing == BotMove.Up ? -1 : 0;
        if (dx == 0 && dz == 0) yield break;
        for (int step = 1; step <= board.ActiveRange; step++)
        {
            int x = board.Self.Cell % board.Width + dx * step, z = board.Self.Cell / board.Width + dz * step;
            if ((uint)x >= board.Width || (uint)z >= board.Width) yield break;
            yield return z * board.Width + x;
        }
    }

    private BotDecision Choice(BomberBotObservation board, BotPaths paths, int goal, bool bomb, bool skill)
    {
        if (goal < 0 || goal == board.Self.Cell) return new(BotMove.None, bomb, skill, behavior, goal);
        int cell = goal;
        while (paths.Parents[cell] != board.Self.Cell)
        {
            int previous = paths.Parents[cell];
            if (previous < 0) return new(BotMove.None, false, skill, behavior, goal);
            cell = previous;
        }
        int delta = cell - board.Self.Cell;
        BotMove move = delta == -board.Width ? BotMove.Up : delta == board.Width ? BotMove.Down
            : delta == 1 ? BotMove.Right : delta == -1 ? BotMove.Left : BotMove.None;
        return new(move, bomb, skill, behavior, goal);
    }

    private static int Distance(int a, int b, int width) => Math.Abs(a % width - b % width) + Math.Abs(a / width - b / width);
    private static int Scale(int chance, int scale) => checked((int)Math.Min(1000, (long)chance * scale / 1000));
    private static bool Roll(ref ulong state, int permille) => permille >= 1000 || (permille > 0 && Next(ref state, 1000) < permille);
    private static int Next(ref ulong state, int bound)
    {
        state ^= state << 13; state ^= state >> 7; state ^= state << 17;
        return (int)(state % (uint)bound);
    }
}
