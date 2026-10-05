using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation.Determinism;

namespace Lumio.Bomber.Gameplay;

internal static class BomberDeathDrops
{
    internal static void Partition(World world, BomberMatchState match, BomberParticipantState participant)
    {
        IBomberConfig config = BomberConfigBinding.For(world);
        BomberRespawnCarry carry = world.Get<BomberRespawnCarry>(participant.Entity);
        if (carry.DropMatchId.Value == participant.MatchId.Value && carry.DropLife.Value == participant.DeathStructureLife.Value &&
            carry.DropGeneration.Value == participant.DeathStructureGeneration.Value && carry.DropOccurrenceTick.Value == participant.DeathStructureTick.Value)
            return;
        if (Pending(carry) != 0) carry.DeferredDeathDebts.Add(BomberDeathDebt.Read(carry).Encode());
        carry.PendingBombSkill.Value = 0;
        carry.PendingBombLevel.Value = 0;
        carry.DropMatchId.Value = participant.MatchId.Value;
        carry.DropLife.Value = participant.DeathStructureLife.Value;
        carry.DropGeneration.Value = participant.DeathStructureGeneration.Value;
        carry.DropOccurrenceTick.Value = participant.DeathStructureTick.Value;
        carry.DropOriginX.Value = participant.DeathCellX.Value;
        carry.DropOriginZ.Value = participant.DeathCellZ.Value;
        // The packaged schema epoch is the one used by HostTickRequest/TickRunner.
        var context = new DeterminismContext(match.Seed.Value, carry.DropOccurrenceTick.Value, RuntimeSchema.SchemaEpoch);
        var rng = context.OpenRngStream("bomber.death." + participant.Entity.ToHex() + "." + carry.DropGeneration.Value);
        bool final = participant.LifePhase.Value == (int)BomberLifePhase.Eliminated;
        int rate = final ? config.Drops.FinalDeathDropPermille : config.Drops.DeathDropPermille;
        carry.PendingPower.Value = Roll(carry.PowerBase.Value, config.Attribute(BomberAttributeNames.BombPower), rate, ref rng);
        carry.PendingCapacity.Value = Roll(carry.CapacityBase.Value, config.Attribute(BomberAttributeNames.BombCapacity), rate, ref rng);
        carry.PendingSpeed.Value = Roll(carry.SpeedTierBase.Value, config.Attribute(BomberAttributeNames.SpeedTier), rate, ref rng);
        carry.PowerBase.Value -= carry.PendingPower.Value;
        carry.CapacityBase.Value -= carry.PendingCapacity.Value;
        carry.SpeedTierBase.Value -= carry.PendingSpeed.Value;
        carry.AvailableBombs.Value = Math.Min(carry.AvailableBombs.Value, carry.CapacityBase.Value);
        // Current candidate has one exchangeable special-bomb slot. Character abilities remain identity.
        if (carry.BombSkillId.Value != 0 && (final || rng.NextUInt32() % 1000 < config.SkillRules.DeathDropPermille))
        {
            carry.PendingBombSkill.Value = checked((uint)carry.BombSkillId.Value);
            carry.PendingBombLevel.Value = carry.BombLevel.Value;
            carry.BombSkillId.Value = 0;
            carry.BombLevel.Value = 0;
            carry.BombBound.Value = false;
            carry.BombCombinationOriginA.Value = carry.BombCombinationOriginB.Value = 0;
            carry.BombOriginALevel.Value = carry.BombOriginBLevel.Value = 0;
        }
        BomberPlayerState oldLife = world.Get<BomberPlayerState>(carry.DropLife.Value);
        carry.PendingGoldenHearts.Value = oldLife.GoldenHeartCount.Value;
        oldLife.GoldenHeartCount.Value = 0;
        if (carry.PendingGoldenHearts.Value != 0)
            world.Single<BomberPresentationJournal>().Append(world, "gold_heart_dropped", carry.DropMatchId.Value,
                world.Single<BomberWorldRuntime>().AllocateEventSequence(), participant.Entity, carry.DropLife.Value, carry.DropGeneration.Value,
                sourceParticipant: participant.Entity, sourceLife: carry.DropLife.Value, x: carry.DropOriginX.Value, z: carry.DropOriginZ.Value,
                data: new Dictionary<string, string> {
                    ["count"] = carry.PendingGoldenHearts.Value.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    ["sourceLifeGeneration"] = carry.DropGeneration.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) },
                occurredTick: carry.DropOccurrenceTick.Value);
        carry.SelectedDropCount.Value = Pending(carry);
        if (carry.SelectedDropCount.Value > config.ObjectBudgets.DeathOutputLimit)
            throw new InvalidOperationException("Death outputs exceed the effective per-life bound.");
        carry.PlacedDropCount.Value = 0;
        participant.DeathDropPending.Value = PendingAll(carry) != 0;
    }

    private static int Roll(int value, AttributesRow rule, int rate, ref DeterministicRngStream rng)
    {
        if (value < rule.Initial || value > rule.Maximum) throw new InvalidOperationException("Death holdings exceed configured bounds.");
        int selected = 0;
        for (long level = rule.Initial; level < value; level++)
            if (rng.NextUInt32() % 1000 < rate) selected++;
        return selected;
    }

    private static int Pending(BomberRespawnCarry carry) => checked(carry.PendingPower.Value + carry.PendingCapacity.Value +
        carry.PendingSpeed.Value + carry.PendingGoldenHearts.Value + (carry.PendingBombSkill.Value == 0 ? 0 : 1));

    // Shared producer admission must include gold that has transferred but cannot land yet.
    private static int PendingAll(BomberRespawnCarry carry)
    {
        int pending = Pending(carry);
        for (int i = 0; i < carry.DeferredDeathDebts.Count; i++)
            pending = checked(pending + BomberDeathDebt.Decode(carry.DeferredDeathDebts[i]).Pending);
        return pending;
    }
    internal static int PendingOutputs(World world) => world.Each<BomberRespawnCarry>().Sum(PendingAll);

    // Pickups become spendable holdings before death converts them back to pending
    // objects. They keep their original producer credit through both transfers.
    internal static int HeldOutputs(World world)
    {
        IBomberConfig config = BomberConfigBinding.For(world);
        long total = 0;
        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>())
        {
            BomberRespawnCarry carry = world.Get<BomberRespawnCarry>(participant.Entity);
            if (carry.CarryPresent.Value)
            {
                // Capture/partition transfers ownership before old-Life destruction;
                // a dormant successor is a seed of this same inheritance, not new wealth.
                total = checked(total + Upgrades(carry.PowerBase.Value, carry.CapacityBase.Value,
                    carry.SpeedTierBase.Value) + (carry.BombSkillId.Value == 0 ? 0 : 1));
                continue;
            }
            NetEntityId life = participant.CurrentLife.Value;
            if (life.IsDefault || !world.IsLive(life)) continue;
            var attributes = world.Get<AttributeComponent>(life);
            total = checked(total + Upgrades(attributes.GetBaseValue(BomberAttributeNames.BombPower),
                attributes.GetBaseValue(BomberAttributeNames.BombCapacity), attributes.GetBaseValue(BomberAttributeNames.SpeedTier)) +
                world.Get<BomberPlayerState>(life).GoldenHeartCount.Value +
                (world.Get<BomberSkillState>(life).BombSkillId.Value == 0 ? 0 : 1));
        }
        return checked((int)total);

        long Upgrades(long power, long capacity, long speed) => checked(
            power - config.Attribute(BomberAttributeNames.BombPower).Initial +
            capacity - config.Attribute(BomberAttributeNames.BombCapacity).Initial +
            speed - config.Attribute(BomberAttributeNames.SpeedTier).Initial);
    }

    internal static void PlacePending(World world)
    {
        // Cleanup must not materialize accepted wealth only to retire it on the same Tick.
        if (!BomberRoundTransition.CanMaterializePendingWealth(world)) return;
        IBomberConfig config = BomberConfigBinding.For(world);
        int occupied = BomberTerrainTransactions.Occupied(world);
        var cells = BomberTerrainTransactions.PickupCells(world);
        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>().OrderBy(p => p.Entity))
        {
            if (!participant.DeathDropPending.Value) continue;
            BomberRespawnCarry carry = world.Get<BomberRespawnCarry>(participant.Entity);
            for (int i = 0; i < carry.DeferredDeathDebts.Count;)
            {
                BomberDeathDebt debt = Place(world, participant.Entity, BomberDeathDebt.Decode(carry.DeferredDeathDebts[i]), config, cells, ref occupied);
                if (debt.Pending == 0) carry.DeferredDeathDebts.RemoveAt(i);
                else { carry.DeferredDeathDebts[i] = debt.Encode(); i++; }
            }
            Place(world, participant.Entity, BomberDeathDebt.Read(carry), config, cells, ref occupied).StoreCounts(carry);
            participant.DeathDropPending.Value = PendingAll(carry) != 0;
        }
    }

    private static BomberDeathDebt Place(World world, NetEntityId participant, BomberDeathDebt debt, IBomberConfig config,
        HashSet<(int X, int Z)> cells, ref int occupied)
    {
        foreach (var cell in WalkableCells(world, debt.X, debt.Z))
        {
            if (debt.Pending == 0 || checked(occupied + BomberTerrainTransactions.Reserved(world)) >= config.ObjectBudgets.PickupCapacity) break;
            if (cells.Contains(cell) || BomberMatchRules.FindBombAt(world, cell.X, cell.Z) is not null) continue;
            BomberTerrainTransactions.ReservePickup(world, cell);
            EntityOrder order = world.Commands.Create<BomberPickupItemEntity>();
            BomberPickupItem item = order.Get<BomberPickupItem>();
            if (debt.Power > 0) { item.Kind.Value = (int)BomberPickupKind.Power; debt = debt with { Power = debt.Power - 1 }; }
            else if (debt.Capacity > 0) { item.Kind.Value = (int)BomberPickupKind.Capacity; debt = debt with { Capacity = debt.Capacity - 1 }; }
            else if (debt.Speed > 0) { item.Kind.Value = (int)BomberPickupKind.Speed; debt = debt with { Speed = debt.Speed - 1 }; }
            else if (debt.Hearts > 0) { item.Kind.Value = (int)BomberPickupKind.GoldenHeart; debt = debt with { Hearts = debt.Hearts - 1 }; }
            else
            {
                item.Kind.Value = (int)BomberPickupKind.Skill;
                item.SkillId.Value = debt.Skill;
                item.SkillLevel.Value = debt.Level;
                debt = debt with { Skill = 0, Level = 0 };
            }
            if (!NetEntityId.TryParse(debt.Life, out var life)) throw new InvalidOperationException("Death debt lost its original life.");
            item.DroppedBy.Value = life;
            item.DropMatchId.Value = debt.Match;
            item.DropParticipant.Value = participant;
            item.DropLifeGeneration.Value = debt.Generation;
            item.DropOccurrenceTick.Value = debt.Occurred;
            item.SpawnTick.Value = world.Tick;
            item.ProtectedUntilTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Drops.DeathProtectionMs, config.Game.TickRateHz));
            EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
                FormattableString.Invariant($"{cell.X + 0.5f:R},1.5,{cell.Z + 0.5f:R}"), silent: true);
            occupied++;
            cells.Add(cell);
            debt = debt with { Placed = debt.Placed + 1 };
        }
        if (debt.Selected != debt.Pending + debt.Placed)
            throw new InvalidOperationException("Death wealth transfer is not conserved.");
        return debt;
    }

    private static IEnumerable<(int X, int Z)> WalkableCells(World world, int x, int z)
    {
        // Radius-three path search: no terrain photo means no placement, not loss of ownership.
        var seen = new HashSet<(int X, int Z)> { (x, z) };
        var queue = new Queue<(int X, int Z, int Distance)>();
        queue.Enqueue((x, z, 0));
        while (queue.Count != 0)
        {
            var cell = queue.Dequeue();
            if (cell.Distance < 3)
                foreach (var next in new[] { (cell.X - 1, cell.Z), (cell.X, cell.Z - 1), (cell.X, cell.Z + 1), (cell.X + 1, cell.Z) })
                    if (seen.Add(next)) queue.Enqueue((next.Item1, next.Item2, cell.Distance + 1));
            if (PlaceBombAbility.IsPlacableTerrain(world, cell.X, cell.Z)) yield return (cell.X, cell.Z);
        }
    }
}
