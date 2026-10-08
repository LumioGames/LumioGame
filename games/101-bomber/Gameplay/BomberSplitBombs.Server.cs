using System;
using System.Linq;
using System.Numerics;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

internal static class BomberSplitBombs
{
    private static readonly (int X, int Z)[] Directions = { (0, -1), (1, 0), (0, 1), (-1, 0) };

    internal static bool HasSubmittedPromise(World world, string token) => SubmissionWitness(world, token, submitted: true) is not null;

    internal static string? SubmissionWitness(World world, string token, bool submitted)
    {
        if (token is null || token.Length != 40 || !token.StartsWith("split:", StringComparison.Ordinal) || token[38] != ':' ||
            token[39] is < '0' or > '3' || !NetEntityId.TryParse(token.Substring(6, 32), out NetEntityId id) ||
            id.IsDefault || id.InstanceId != world.InstanceId || !world.IsLive(id) ||
            !world.TypeOf(id).Is<BomberBombEntity>()) return null;
        BomberBombState mother = world.Get<BomberBombState>(id);
        mother.ValidateStorage();
        int direction = token[39] - '0';
        int bit = 1 << direction;
        bool owns = token == Token(id, direction) && mother.BombKind.Value == (int)BomberBombKind.ReservedSplit &&
            mother.ChildDirection.Value == 0 && mother.Phase.Value != (int)BomberBombPhase.Fuse &&
            mother.Phase.Value != (int)BomberBombPhase.Extinguished && mother.FutureChildren.Value > 0 &&
            ((mother.SplitSubmittedMask.Value & bit) != 0) == submitted && (mother.SplitResolvedMask.Value & bit) == 0 &&
            !world.Each<BomberBombState>().Any(child => world.IsLive(child.Entity) &&
                child.HitFamily.Value == id && child.ChildDirection.Value == direction + 1);
        if (!owns) return null;
        var position = world.Get<LogicTransform>(id).LocalPosition;
        return JsonSerializer.Serialize(new { Tick = world.Tick, Match = world.Single<BomberMatchState>().MatchId.Value,
            Token = token, Mother = id.ToHex(), Participant = mother.Owner.Value.ToHex(),
            Life = mother.SourceLife.Value.ToHex(), Generation = mother.SourceLifeGeneration.Value,
            Chain = mother.ChainId.Value, Shape = mother.BombKind.Value, Power = mother.Power.Value,
            Frenzy = mother.Frenzy.Value, Placed = mother.PlacedAtTick.Value, FuseEnd = mother.FuseEndTick.Value,
            Phase = mother.Phase.Value, Exploded = mother.ExplodedAtTick.Value,
            DangerUntil = mother.DangerUntilTick.Value, BurnUntil = mother.BurnUntilTick.Value,
            Family = mother.HitFamily.Value.ToHex(),
            Future = mother.FutureChildren.Value, Submitted = mother.SplitSubmittedMask.Value & ~bit,
            Resolved = mother.SplitResolvedMask.Value, X = position.X, Y = position.Y, Z = position.Z,
            Up = mother.ReachUp.Value, Right = mother.ReachRight.Value, Down = mother.ReachDown.Value, Left = mother.ReachLeft.Value });
    }

    private static string Token(NetEntityId mother, int direction) =>
        FormattableString.Invariant($"split:{mother.ToHex()}:{direction}");

    internal static void ObservePublished(World world, BomberBombState child)
    {
        if (child.ChildDirection.Value == 0 || !world.IsLive(child.Entity)) return;
        if (child.ChildDirection.Value is < 1 or > 4 || child.HitFamily.Value.IsDefault ||
            !world.IsLive(child.HitFamily.Value) || !world.TypeOf(child.HitFamily.Value).Is<BomberBombEntity>())
            throw new InvalidOperationException("Published Split child lost its durable mother.");
        BomberBombState mother = world.Get<BomberBombState>(child.HitFamily.Value);
        int bit = 1 << (child.ChildDirection.Value - 1);
        if (mother.BombKind.Value != (int)BomberBombKind.ReservedSplit || mother.ChildDirection.Value != 0 ||
            (mother.SplitSubmittedMask.Value & bit) == 0 || mother.Owner.Value != child.Owner.Value ||
            mother.SourceLife.Value != child.SourceLife.Value || mother.SourceLifeGeneration.Value != child.SourceLifeGeneration.Value ||
            mother.Frenzy.Value != child.Frenzy.Value ||
            mother.ChainId.Value != child.ChainId.Value || child.PromiseToken.Value != Token(mother.Entity, child.ChildDirection.Value - 1) ||
            world.Each<BomberBombState>().Any(other => world.IsLive(other.Entity) && other.Entity != child.Entity &&
                other.HitFamily.Value == mother.Entity && other.ChildDirection.Value == child.ChildDirection.Value))
            throw new InvalidOperationException("Published Split child does not match its exact submitted obligation.");
        // A restored published child can be observed again without returning another credit.
        if ((mother.SplitResolvedMask.Value & bit) != 0) return;
        Resolve(mother, bit);
    }

    internal static void Advance(World world)
    {
        foreach (BomberBombState mother in world.Each<BomberBombState>().Where(b =>
            b.BombKind.Value == (int)BomberBombKind.ReservedSplit && b.ChildDirection.Value == 0 &&
            b.Phase.Value != (int)BomberBombPhase.Fuse && b.Phase.Value != (int)BomberBombPhase.Extinguished).OrderBy(b => b.Entity).ToArray())
        {
            if (mother.FutureChildren.Value == 0 || BomberTerrainTransactions.HoldsSource(world, mother.Entity)) continue;
            // Endpoints are read only after every original terrain obligation has settled.
            // Withheld/unknown Native delivery retains both the mother and all future credits.
            if (BomberTerrainRead.For(world) is null) continue;
            int[] reaches = { mother.ReachUp.Value, mother.ReachRight.Value, mother.ReachDown.Value, mother.ReachLeft.Value };
            Vector3 origin = world.Get<LogicTransform>(mother.Entity).LocalPosition;
            for (int direction = 0; direction < 4; direction++)
            {
                int bit = 1 << direction;
                if (((mother.SplitSubmittedMask.Value | mother.SplitResolvedMask.Value) & bit) != 0) continue;
                if (reaches[direction] == 0) { Resolve(mother, bit); continue; }
                var delta = Directions[direction];
                int x = BomberMatchRules.CellX(origin) + delta.X * reaches[direction];
                int z = BomberMatchRules.CellZ(origin) + delta.Z * reaches[direction];
                // Record the stable owner before any structural call. Unknown submission is
                // never retried or reclaimed merely because a timer has elapsed.
                EntityOrder order = BomberBombAdmissions.CreateFromPromise(world, Token(mother.Entity, direction),
                    () => mother.SplitSubmittedMask.Value |= bit);
                BomberBombState child = order.Get<BomberBombState>();
                child.Owner.Value = mother.Owner.Value;
                child.SourceLife.Value = mother.SourceLife.Value;
                child.SourceLifeGeneration.Value = mother.SourceLifeGeneration.Value;
                child.Frenzy.Value = mother.Frenzy.Value;
                child.ChainId.Value = mother.ChainId.Value;
                child.HitFamily.Value = mother.Entity;
                child.ChildDirection.Value = direction + 1;
                child.Power.Value = 1;
                child.BombKind.Value = (int)BomberBombKind.Standard;
                child.Phase.Value = (int)BomberBombPhase.Fuse;
                child.CapacityReturned.Value = true;
                child.PlacedAtTick.Value = world.Tick;
                IBomberConfig config = BomberConfigBinding.For(world);
                uint delay = config.Tables.SkillLevels.Rows.Single(level => level.Name == "splitBomb_lv1").DurationMs;
                child.FuseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(delay, config.Game.TickRateHz));
                WritePosition(order.Get<LogicTransform>(), new Vector3(x + .5f, origin.Y, z + .5f));
            }
        }
    }

    internal static bool HoldsFamily(World world, BomberBombState mother) =>
        mother.FutureChildren.Value != 0 || world.Each<BomberBombState>().Any(child =>
            world.IsLive(child.Entity) && child.ChildDirection.Value != 0 && child.HitFamily.Value == mother.Entity);

    internal static void CancelUnsubmitted(BomberBombState bomb)
    {
        for (int direction = 0; direction < 4; direction++)
        {
            int bit = 1 << direction;
            if (bomb.FutureChildren.Value != 0 && ((bomb.SplitSubmittedMask.Value | bomb.SplitResolvedMask.Value) & bit) == 0)
                Resolve(bomb, bit);
        }
    }

    internal static BomberBombState DamageOwner(World world, BomberBombState bomb)
    {
        if (bomb.ChildDirection.Value == 0) return bomb;
        if (!world.IsLive(bomb.HitFamily.Value)) throw new InvalidOperationException("Split child has no live shared hit memory.");
        return world.Get<BomberBombState>(bomb.HitFamily.Value);
    }

    internal static void ExtinguishWater(World world, NativeHfsmDefinition definition)
    {
        var cells = BomberTerrainRead.For(world);
        if (cells is null) return;
        IBomberConfig config = BomberConfigBinding.For(world);
        foreach (BomberBombState child in world.Each<BomberBombState>().Where(b => b.ChildDirection.Value != 0 &&
            b.Phase.Value == (int)BomberBombPhase.Fuse).OrderBy(b => b.Entity).ToArray())
        {
            Vector3 position = world.Get<LogicTransform>(child.Entity).LocalPosition;
            int cell = checked(BomberMatchRules.CellZ(position) * config.Map.Width + BomberMatchRules.CellX(position));
            uint ground = cells[cell].BlockId >> 8;
            if (config.Tables.Blocks.Rows.Any(block => block.Enabled && block.BlockType == ground && block.Name == "water"))
                BomberBombLifecycle.Send(world, child, definition, BomberHfsmDefinitions.EventId.Extinguish);
        }
    }

    private static void Resolve(BomberBombState mother, int bit)
    {
        if ((mother.SplitResolvedMask.Value & bit) != 0 || mother.FutureChildren.Value <= 0)
            throw new InvalidOperationException("Split promise cannot be returned twice.");
        mother.SplitResolvedMask.Value |= bit;
        mother.FutureChildren.Value--;
    }

    private static void WritePosition(LogicTransform transform, Vector3 position) =>
        EcsRegistry.Generated(transform)!.WriteField("localPosition",
            FormattableString.Invariant($"{position.X:R},{position.Y:R},{position.Z:R}"), silent: true);
}
