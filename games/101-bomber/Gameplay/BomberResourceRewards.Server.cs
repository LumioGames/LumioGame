using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation.Determinism;

namespace Lumio.Bomber.Gameplay;

internal static class BomberResourceRewards
{
    internal static BomberTerrainReward[] Select(World world, BomberBombState source, ChestRow tier, int x, int z)
    {
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        int maximum = BomberResourceRewardRules.Maximum(config, tier);
        var rng = new DeterminismContext(match.Seed.Value, source.ExplodedAtTick.Value, RuntimeSchema.SchemaEpoch)
            .OpenRngStream(FormattableString.Invariant($"bomber.resource.{BomberTerrainTransactions.Family(source).ToHex()}.{x}.{z}.{tier.Id}"));
        var rewards = new List<BomberTerrainReward>(maximum);
        if (tier.Name != "default" && rng.NextUInt32() % 1000 >= tier.DropPermille) return rewards.ToArray();
        void Add(int kind, uint skill = 0) => rewards.Add(new(kind, skill, x, z, match.MatchId.Value,
            source.Owner.Value.ToHex(), source.SourceLife.Value.ToHex(), source.SourceLifeGeneration.Value,
            source.Entity.ToHex(), BomberTerrainTransactions.Family(source).ToHex(), source.ExplodedAtTick.Value, "", rewards.Count));
        if (tier.Name == "default")
        {
            Add((int)BomberPickupKind.Power); Add((int)BomberPickupKind.Capacity);
            Add((int)BomberPickupKind.Speed); Add((int)BomberPickupKind.Health);
        }
        for (int i = 0; i < tier.RandomSlots; i++)
        {
            if (config.Game.SkillsEnabled && rng.NextUInt32() % 1000 < tier.KickPermille)
            { Add(checked((int)config.Tables.PickupKinds.Rows.Single(r => r.Name == "Kick").KindCode)); continue; }
            var pool = config.Tables.PickupKinds.Rows.Where(r => r.SoftWeight > 0 && (tier.IncludeHealth || r.Name != "Health")).OrderBy(r => r.Id).ToArray();
            int total = pool.Sum(r => r.SoftWeight);
            if (total <= 0) throw new InvalidOperationException("Resource random slot has no configured content.");
            int choice = checked((int)(rng.NextUInt32() % (uint)total));
            foreach (var row in pool) { if (choice < row.SoftWeight) { Add(checked((int)row.KindCode)); break; } choice -= row.SoftWeight; }
        }
        if (config.Game.SkillsEnabled && (tier.Name == "default" || rng.NextUInt32() % 1000 < tier.SpecialPermille))
        {
            var names = new[] { "fireBomb", "freezeBomb", "remoteBomb", "splitBomb", "pierceBomb", "toxinBomb" };
            var pool = names.Select(name => config.Tables.Skills.Rows.Single(r => r.Name == name)).OrderBy(r => r.Id).ToArray();
            Add((int)BomberPickupKind.Skill, pool[rng.NextUInt32() % (uint)pool.Length].Id);
        }
        if (rng.NextUInt32() % 1000 < tier.GoldHeartPermille)
            Add(checked((int)config.Tables.PickupKinds.Rows.Single(r => r.Name == "GoldenHeart").KindCode));
        if (rewards.Count > maximum) throw new InvalidOperationException("Selected rewards exceed their admitted maximum.");
        return rewards.ToArray();
    }

    internal static bool CanMaterialize(IBomberConfig config, BomberTerrainReward reward)
    {
        var row = config.Tables.PickupKinds.Rows.Single(r => r.KindCode == reward.Kind);
        // The pending owner retains these exact rewards until their consumer is admitted.
        if (row.LedgerMode is "GoldenHeart" or "KickQualification") return false;
        if (reward.Kind != (int)BomberPickupKind.Skill) return true;
        var skill = config.Tables.Skills.Rows.Single(r => r.Id == reward.Skill);
        return config.Tables.BombKinds.Rows.Any(r => r.KindCode == skill.BombKindCode && r.Enabled);
    }
}
