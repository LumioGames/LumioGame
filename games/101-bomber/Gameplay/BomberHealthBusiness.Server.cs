using System;
using System.Collections.Generic;
using System.Globalization;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
namespace Lumio.Bomber.Gameplay;
internal static class BomberHealthBusiness
{
    internal static bool Submit(World world, BomberPlayerState player, bool restore, long points = 2) =>
        SubmitCore(world, player, restore, points, null);

    internal static bool SubmitPickup(World world, BomberPlayerState player, BomberPickupItem item) =>
        SubmitCore(world, player, false, 2, item);

    internal static bool SubmitNewMatch(World world, BomberPlayerState player) =>
        SubmitCore(world, player, true, 6, null, newMatch: true);

    private static bool SubmitCore(World world, BomberPlayerState player, bool restore, long points, BomberPickupItem? item, bool newMatch = false)
    {
        BomberHealthFacts facts = world.Get<BomberHealthFacts>(player.Entity);
        Initialize(facts);
        if (facts.TypeId[0] != 0 || player.Participant.Value.IsDefault || !world.IsLive(player.Participant.Value)) return false;
        BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
        if (participant.CurrentLife.Value != player.Entity || participant.LifeGeneration.Value != player.LifeGeneration.Value ||
            participant.MatchId.Value != world.Single<BomberMatchState>().MatchId.Value) return false;
        AttributeComponent attributes = world.Get<AttributeComponent>(player.Entity);
        BomberMatchRules.SyncDerivedPlayerState(world, player);
        int maximum = player.MaximumHealth.Value, gold = player.GoldenHeartCount.Value, hats = player.HatCount.Value;
        int afterMaximum = maximum, afterGold = gold, afterHats = hats;
        newMatch |= restore && player.RestorePending.Value && facts.Kind[0] == -2;
        if (newMatch) { afterMaximum = 6; afterGold = afterHats = 0; }
        long upgradeBefore = 0, upgradeAfter = 0;
        if (item is not null)
        {
            if (!item.ClaimedBy.Value.IsDefault || player.RestorePending.Value || player.LifePhase.Value >= 2 ||
                attributes.GetBaseValue(BomberAttributeNames.HealthPoints) <= 0) return false;
            string? attribute = BomberGrowth.UpgradeAttribute(item.Kind.Value);
            if (attribute is not null)
            {
                upgradeBefore = attributes.GetBaseValue(attribute);
                var rule = BomberConfigBinding.For(world).Attribute(attribute);
                if (upgradeBefore < rule.Initial || upgradeBefore >= rule.Maximum ||
                    attributes.GetCurrentValue(attribute) != upgradeBefore) return false;
                upgradeAfter = checked(upgradeBefore + 1);
                afterHats = checked(hats + 1);
            }
            else if (item.Kind.Value == (int)BomberPickupKind.GoldenHeart)
            {
                if (gold >= BomberGrowth.MaximumGoldenHearts) return false;
                afterGold = checked(gold + 1);
            }
            else if (item.Kind.Value == (int)BomberPickupKind.Health)
            {
                if (attributes.GetBaseValue(BomberAttributeNames.HealthPoints) == maximum) return false;
            }
            else if (item.Kind.Value == (int)BomberPickupKind.Frenzy)
            {
                if (!BomberConfigBinding.For(world).Game.FrenzyEnabled ||
                    BomberFrenzy.IsActive(world, participant, player.Entity)) return false;
                points = Math.Max(0, maximum - attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
            }
            else return false;
            afterMaximum = BomberGrowth.MaximumHealth(afterHats, afterGold);
            if (afterMaximum < maximum) throw new InvalidOperationException("Live growth cannot reduce maximum health.");
            if (item.Kind.Value != (int)BomberPickupKind.Health &&
                item.Kind.Value != (int)BomberPickupKind.Frenzy) points = afterMaximum - maximum;
        }
        if (restore && !player.RestorePending.Value)
        {
            player.RestoreIntent.Value = checked(player.RestoreIntent.Value + 1);
            player.RestorePending.Value = true;
        }
        facts.MatchId[0] = participant.MatchId.Value;
        facts.Participant[0] = participant.Entity;
        facts.Generation[0] = player.LifeGeneration.Value;
        facts.Intent[0] = player.RestoreIntent.Value;
        facts.Target[0] = facts.Source[0] = player.Entity;
        facts.TypeId[0] = newMatch ? 10104u : restore ? 10103u : 10102u;
        facts.Status[0] = 0;
        facts.Ready[0] = false;
        facts.HandleWorld[0] = facts.HandleInstance[0] = 0;
        facts.HandleGeneration[0] = 0;
        facts.Item[0] = item?.Entity ?? default;
        facts.Kind[0] = newMatch ? -2 : item?.Kind.Value ?? -1;
        facts.MaximumBefore[0] = maximum;
        facts.MaximumAfter[0] = afterMaximum;
        facts.GoldBefore[0] = gold;
        facts.GoldAfter[0] = afterGold;
        facts.HatsAfter[0] = afterHats;
        facts.UpgradeBefore[0] = upgradeBefore;
        facts.UpgradeAfter[0] = upgradeAfter;
        EffectHandleResult admitted;
        if (newMatch)
        {
            var config = BomberConfigBinding.For(world);
            var p = new BomberNewMatchEffect.Parameters { Points = 6, Fx = "bomber.new_match", Life = player.Entity,
                Row = 0, MatchId = participant.MatchId.Value, Participant = participant.Entity, Generation = player.LifeGeneration.Value,
                Intent = facts.Intent[0], Kind = -2, MaximumBefore = maximum, MaximumAfter = 6,
                GoldBefore = gold, GoldAfter = 0, HatsAfter = 0,
                PowerSeed = config.Attribute(BomberAttributeNames.BombPower).Initial,
                CapacitySeed = config.Attribute(BomberAttributeNames.BombCapacity).Initial,
                SpeedTierSeed = config.Attribute(BomberAttributeNames.SpeedTier).Initial,
                MovementSpeedSeed = config.SpeedTier(config.Attribute(BomberAttributeNames.SpeedTier).Initial).SpeedMilli };
            admitted = Effects.Apply<BomberNewMatchEffect, BomberNewMatchEffect.Parameters>(world, player.Entity, in p, player.Entity);
        }
        else if (restore)
        {
            var p = new BomberRestoreHealthEffect.Parameters { Points = maximum, Fx = "bomber.restore", Life = player.Entity,
                Row = 0, MatchId = participant.MatchId.Value, Participant = participant.Entity, Generation = player.LifeGeneration.Value,
                Intent = facts.Intent[0], Kind = -1, MaximumBefore = maximum, MaximumAfter = maximum,
                GoldBefore = gold, GoldAfter = gold, HatsAfter = hats };
            admitted = Effects.Apply<BomberRestoreHealthEffect, BomberRestoreHealthEffect.Parameters>(world, player.Entity, in p, player.Entity);
        }
        else
        {
            var p = new BomberHealEffect.Parameters { Points = points, Fx = "bomber.heal", Life = player.Entity,
                Row = 0, MatchId = participant.MatchId.Value, Participant = participant.Entity, Generation = player.LifeGeneration.Value,
                Intent = facts.Intent[0], Item = facts.Item[0], Kind = facts.Kind[0], MaximumBefore = maximum, MaximumAfter = afterMaximum,
                GoldBefore = gold, GoldAfter = afterGold, HatsAfter = afterHats, UpgradeBefore = upgradeBefore, UpgradeAfter = upgradeAfter,
                MovementSpeedAfter = item?.Kind.Value == (int)BomberPickupKind.Speed
                    ? BomberConfigBinding.For(world).SpeedTier(upgradeAfter).SpeedMilli : 0 };
            admitted = Effects.Apply<BomberHealEffect, BomberHealEffect.Parameters>(world, player.Entity, in p, player.Entity);
        }
        if (!admitted.Succeeded) { facts.TypeId[0] = 0; return false; }
        facts.HandleWorld[0] = admitted.Handle.WorldId.Value;
        facts.HandleInstance[0] = admitted.Handle.InstanceId.Value;
        facts.HandleGeneration[0] = admitted.Handle.Generation;
        // Admission reserves the original object. Ownership is transferred only by Applied settlement.
        if (item is not null) item.ClaimedBy.Value = player.Entity;
        return true;
    }

    private static void Initialize(BomberHealthFacts facts)
    {
        if (facts.TypeId.Count != 0) return;
        facts.HandleWorld.Add(default);
        facts.HandleInstance.Add(default);
        facts.HandleGeneration.Add(default);
        facts.TypeId.Add(default);
        facts.Target.Add(default);
        facts.Source.Add(default);
        facts.Tick.Add(default);
        facts.MatchId.Add(default);
        facts.Participant.Add(default);
        facts.Generation.Add(default);
        facts.Intent.Add(default);
        facts.Before.Add(default);
        facts.After.Add(default);
        facts.Actual.Add(default);
        facts.Ready.Add(default);
        facts.Status.Add(default);
        facts.Item.Add(default);
        facts.Kind.Add(default);
        facts.MaximumBefore.Add(default);
        facts.MaximumAfter.Add(default);
        facts.GoldBefore.Add(default);
        facts.GoldAfter.Add(default);
        facts.HatsAfter.Add(default);
        facts.UpgradeBefore.Add(default);
        facts.UpgradeAfter.Add(default);
    }

    internal static void Consume(World world)
    {
        foreach (BomberHealthFacts facts in world.Each<BomberHealthFacts>())
        {
            if (facts.TypeId.Count == 0 || facts.Status[0] == 0 || facts.TypeId[0] == 0) continue;
            BomberPickupItem? item = facts.Item[0].IsDefault ? null : world.Get<BomberPickupItem>(facts.Item[0]);
            if (facts.Target[0] != facts.Entity || facts.Source[0] != facts.Entity ||
                (item is not null && item.ClaimedBy.Value != facts.Target[0]))
                throw new InvalidOperationException("Health result lost its original reservation.");
            if (facts.Status[0] == 1)
            {
                if (!facts.Ready[0]) throw new InvalidOperationException("Applied health result has no settled fact.");
                if (facts.Kind[0] == (int)BomberPickupKind.Frenzy) BomberFrenzy.StartFromApplied(world, facts);
                BomberStatisticsBusiness.AppliedHealth(world, facts);
                int? itemX = null, itemZ = null;
                if (item is not null)
                {
                    var position = world.Get<LogicTransform>(item.Entity).LocalPosition;
                    itemX = BomberMatchRules.CellX(position);
                    itemZ = BomberMatchRules.CellZ(position);
                }
                var data = new Dictionary<string, string> {
                    ["appliedPoints"] = Text(facts.Actual[0]), ["healthPointsBefore"] = Text(facts.Before[0]),
                    ["healthPointsLeft"] = Text(facts.After[0]), ["maximumHealth"] = Text(facts.MaximumAfter[0]),
                    ["goldenHeartCount"] = Text(facts.GoldAfter[0]), ["hatCount"] = Text(facts.HatsAfter[0]),
                    ["sourceLifeGeneration"] = facts.Generation[0].ToString(CultureInfo.InvariantCulture) };
                if (item is null || item.Kind.Value == (int)BomberPickupKind.Health)
                    Append(world, facts, facts.TypeId[0] is 10103 or 10104 ? "health_restored" : "heal_applied", data, itemX, itemZ);
                if (item is not null)
                {
                    BomberStatisticsBusiness.AppliedPickup(world, facts.Participant[0], facts.MatchId[0], facts.HatsAfter[0], facts.Kind[0]);
                    data["pickupKind"] = Text(facts.Kind[0]);
                    Append(world, facts, "pickup_taken", data, itemX, itemZ);
                    if (facts.Kind[0] == (int)BomberPickupKind.GoldenHeart) Append(world, facts, "gold_heart_picked", data, itemX, itemZ);
                    world.Commands.Destroy(item.Entity);
                    BomberTerrainTransactions.RetireConsumedPickupCredit(world, item.Entity);
                }
                if (!BomberGrowth.IsBoss(facts.MaximumBefore[0]) && BomberGrowth.IsBoss(facts.MaximumAfter[0]))
                    Append(world, facts, "boss_formed", data, itemX, itemZ);
            }
            else if (item is not null) item.ClaimedBy.Value = default;
            facts.TypeId[0] = 0;
        }
    }

    private static string Text(long value) => value.ToString(CultureInfo.InvariantCulture);
    private static void Append(World world, BomberHealthFacts facts, string kind, IReadOnlyDictionary<string, string> data,
        int? x = null, int? z = null) =>
        world.Single<BomberPresentationJournal>().Append(world, kind, facts.MatchId[0],
            world.Single<BomberWorldRuntime>().AllocateEventSequence(), facts.Participant[0], facts.Target[0], facts.Generation[0],
            sourceParticipant: facts.Participant[0], sourceLife: facts.Source[0], entity: facts.Item[0],
            x: x, z: z, data: data, occurredTick: facts.Tick[0]);
}
