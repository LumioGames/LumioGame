using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

internal static class BomberFireExposure
{
    private readonly record struct Source(NetEntityId Entity, NetEntityId Participant, NetEntityId Life,
        ulong Generation, ulong Match, ulong Chain, int Family, int Kind, ulong Started, uint Skill);

    internal static bool HoldsSource(World world, NetEntityId source) => world.Each<BomberFireFacts>().Any(facts =>
        facts.FireStatus.Count == 1 && facts.FireSource[0] == source);

    internal static void Advance(World world)
    {
        ulong interval = Ticks.FromMilliseconds(1000, BomberConfigBinding.For(world).Game.TickRateHz);
        foreach (BomberPlayerState player in world.Each<BomberPlayerState>().OrderBy(player => player.Entity))
        {
            BomberSkillState skill = world.Get<BomberSkillState>(player.Entity);
            if (player.LifePhase.Value >= (int)BomberLifePhase.AwaitingRespawn || player.Participant.Value.IsDefault ||
                player.ProtectedUntilTick.Value > world.Tick || BomberFiniteSkills.HasBubble(world, player.Entity) ||
                world.Get<AttributeComponent>(player.Entity).GetBaseValue(BomberAttributeNames.HealthPoints) <= 0)
            { ResetExposure(skill); continue; }
            Vector3 position = world.Get<LogicTransform>(player.Entity).LocalPosition;
            int x = BomberMatchRules.CellX(position), z = BomberMatchRules.CellZ(position);
            Source[] candidates = BurnSources(world, x, z).Concat(AuraSources(world, player.Entity, x, z)).Concat(ZoneSources(world, player.Entity, x, z))
                .OrderBy(source => source.Started)
                .ThenBy(source => source.Participant).ThenBy(source => source.Entity)
                .ThenBy(source => source.Kind).ThenBy(source => source.Skill).ToArray();
            if (candidates.Length == 0) { ResetExposure(skill); continue; }
            Source selected = candidates.FirstOrDefault(source => source.Entity == skill.FireExposureEntity.Value &&
                source.Kind == skill.FireExposureKind.Value && source.Skill == skill.FireExposureSkill.Value);
            if (selected.Entity.IsDefault) selected = candidates[0];
            bool continuous = !skill.FireExposureEntity.Value.IsDefault &&
                skill.FireExposureLastTick.Value == world.Tick - 1;
            if (!continuous) skill.FireExposureFromTick.Value = world.Tick;
            Select(skill, selected);
            skill.FireExposureLastTick.Value = world.Tick;
            BomberFireFacts facts = world.Get<BomberFireFacts>(player.Participant.Value);
            if (facts.FireStatus.Count != 0 || world.Tick - skill.FireExposureFromTick.Value < interval) continue;
            Submit(world, player, skill, facts, selected, x, z);
            skill.FireExposureFromTick.Value = world.Tick;
        }
    }

    private static IEnumerable<Source> BurnSources(World world, int x, int z)
    {
        ulong match = world.Single<BomberMatchState>().MatchId.Value;
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            if (!world.IsLive(bomb.Entity) || bomb.Phase.Value != (int)BomberBombPhase.Burn ||
                bomb.BurnUntilTick.Value <= world.Tick) continue;
            Vector3 origin = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            int bx = BomberMatchRules.CellX(origin), bz = BomberMatchRules.CellZ(origin);
            if ((x == bx && z == bz) || (x == bx && z < bz && bz - z <= bomb.ReachUp.Value) ||
                (x == bx && z > bz && z - bz <= bomb.ReachDown.Value) ||
                (z == bz && x < bx && bx - x <= bomb.ReachLeft.Value) ||
                (z == bz && x > bx && x - bx <= bomb.ReachRight.Value))
                yield return new(bomb.Entity, bomb.Owner.Value, bomb.SourceLife.Value, bomb.SourceLifeGeneration.Value,
                    match, bomb.ChainId.Value, bomb.BombKind.Value, 1, bomb.DangerUntilTick.Value, 0);
        }
    }

    private static IEnumerable<Source> AuraSources(World world, NetEntityId target, int x, int z)
    {
        foreach (var player in world.Each<BomberPlayerState>())
        {
            if (player.Entity == target || player.LifePhase.Value >= (int)BomberLifePhase.AwaitingRespawn ||
                world.Get<AttributeComponent>(player.Entity).GetBaseValue(BomberAttributeNames.HealthPoints) <= 0) continue;
            var skill = world.Get<BomberSkillState>(player.Entity);
            foreach (var row in world.Get<EffectComponent>(player.Entity).ActiveEffects)
            {
                if (row.Suppressed || row.EndTick <= world.Tick ||
                    !BomberFiniteSkills.MatchesActualAura(world, player, skill, row, false)) continue;
                Vector3 origin = world.Get<LogicTransform>(player.Entity).LocalPosition;
                if (Math.Abs(x - BomberMatchRules.CellX(origin)) > 1 ||
                    Math.Abs(z - BomberMatchRules.CellZ(origin)) > 1 || !AuraCellIsOpen(world, x, z)) continue;
                var p = BomberFireAuraEffect.ReadActualRow(row);
                yield return new(player.Entity, p.Participant, p.Life, p.Generation, p.MatchId, p.ChainId,
                    (int)BomberBombKind.ReservedFire, 2, row.AppliedTick, 4);
            }
        }
    }

    private static IEnumerable<Source> ZoneSources(World world, NetEntityId target, int x, int z)
    {
        foreach (var zone in world.Each<BomberFireZoneState>())
        {
            if (zone.SourceLife.Value == target || !BomberFavoriteFireZones.Covers(world, zone, x, z)) continue;
            yield return new(zone.Entity, zone.Owner.Value, zone.SourceLife.Value, zone.SourceLifeGeneration.Value,
                zone.SourceMatchId.Value, zone.SourceChainId.Value, (int)BomberBombKind.ReservedFire, 3, zone.FromTick.Value, 4);
        }
    }

    private static bool AuraCellIsOpen(World world, int x, int z)
    {
        var config = BomberConfigBinding.For(world);
        if (x < 0 || z < 0 || x >= config.Map.Width || z >= config.Map.Depth) return false;
        var read = BomberTerrainRead.For(world);
        if (read is null) return false;
        int area = checked(config.Map.Width * config.Map.Depth);
        var obstacle = config.Tables.Blocks.Rows.SingleOrDefault(row =>
            row.BlockType == read[area + z * config.Map.Width + x].BlockId >> 8);
        return obstacle.Id != 0 && obstacle.Enabled && obstacle.Walkable;
    }

    internal static void ValidateExposure(World world, BomberSkillState skill)
    {
        if (skill.FireExposureEntity.Value.IsDefault)
        {
            if (!skill.FireExposureParticipant.Value.IsDefault || !skill.FireExposureLife.Value.IsDefault ||
                skill.FireExposureGeneration.Value != 0 || skill.FireExposureMatchId.Value != 0 ||
                skill.FireExposureChainId.Value != 0 || skill.FireExposureFamily.Value != 0 ||
                skill.FireExposureKind.Value != 0 || skill.FireExposureStartedTick.Value != 0 ||
                skill.FireExposureSkill.Value != 0 || skill.FireExposureFromTick.Value != 0 ||
                skill.FireExposureLastTick.Value != 0)
                throw new InvalidOperationException("Empty fire exposure retains source or clock fields.");
            return;
        }
        if (skill.FireExposureEntity.Value.InstanceId != skill.Entity.InstanceId ||
            skill.FireExposureParticipant.Value.IsDefault || skill.FireExposureParticipant.Value.InstanceId != skill.Entity.InstanceId ||
            skill.FireExposureLife.Value.IsDefault || skill.FireExposureLife.Value.InstanceId != skill.Entity.InstanceId ||
            skill.FireExposureGeneration.Value == 0 || skill.FireExposureMatchId.Value == 0 ||
            skill.FireExposureChainId.Value == 0 || skill.FireExposureKind.Value is < 1 or > 3 ||
            skill.FireExposureLastTick.Value < skill.FireExposureFromTick.Value ||
            skill.FireExposureLastTick.Value >= world.Tick || skill.FireExposureStartedTick.Value > skill.FireExposureLastTick.Value ||
            skill.FireExposureMatchId.Value != world.Single<BomberMatchState>().MatchId.Value ||
            !world.IsLive(skill.FireExposureEntity.Value) || !world.IsLive(skill.FireExposureParticipant.Value) ||
            !world.TypeOf(skill.FireExposureParticipant.Value).Is<BomberParticipantEntity>() ||
            world.Get<BomberParticipantState>(skill.FireExposureParticipant.Value).MatchId.Value != skill.FireExposureMatchId.Value)
            throw new InvalidOperationException("Fire exposure lost its exact stable source or clock.");

        NetEntityId source = skill.FireExposureEntity.Value;
        bool matched = false;
        if (skill.FireExposureKind.Value == 1 && world.TypeOf(source).Is<BomberBombEntity>())
        {
            var bomb = world.Get<BomberBombState>(source);
            // Bombs retain their original source life after that body is destroyed or replaced.
            matched = skill.FireExposureParticipant.Value == bomb.Owner.Value &&
                skill.FireExposureLife.Value == bomb.SourceLife.Value &&
                skill.FireExposureGeneration.Value == bomb.SourceLifeGeneration.Value &&
                skill.FireExposureChainId.Value == bomb.ChainId.Value && skill.FireExposureFamily.Value == bomb.BombKind.Value &&
                skill.FireExposureStartedTick.Value == bomb.DangerUntilTick.Value && skill.FireExposureSkill.Value == 0;
        }
        else if (skill.FireExposureKind.Value == 2 && world.TypeOf(source).Is<PlayerEntity>())
        {
            var player = world.Get<BomberPlayerState>(source);
            var aura = world.Get<BomberSkillState>(source);
            matched = skill.FireExposureLife.Value == source && skill.FireExposureParticipant.Value == player.Participant.Value &&
                skill.FireExposureGeneration.Value == player.LifeGeneration.Value && skill.FireExposureChainId.Value == aura.AuraChainId.Value &&
                skill.FireExposureFamily.Value == (int)BomberBombKind.ReservedFire && skill.FireExposureSkill.Value == 4 &&
                skill.FireExposureStartedTick.Value == aura.CooldownFromTick.Value && aura.AuraEffectWorld.Value != 0 &&
                aura.AuraEffectInstance.Value != 0 && aura.AuraEffectGeneration.Value != 0;
            // Actual finite rows activate after OnHydrate; the first normal update validates and rebinds them.
        }
        else if (skill.FireExposureKind.Value == 3 && world.TypeOf(source).Is<BomberFireZoneEntity>())
        {
            var zone = world.Get<BomberFireZoneState>(source);
            matched = skill.FireExposureParticipant.Value == zone.Owner.Value && skill.FireExposureLife.Value == zone.SourceLife.Value &&
                skill.FireExposureGeneration.Value == zone.SourceLifeGeneration.Value &&
                skill.FireExposureMatchId.Value == zone.SourceMatchId.Value && skill.FireExposureChainId.Value == zone.SourceChainId.Value &&
                skill.FireExposureStartedTick.Value == zone.FromTick.Value && skill.FireExposureSkill.Value == zone.SourceSkill.Value &&
                skill.FireExposureFamily.Value == (int)BomberBombKind.ReservedFire;
        }
        if (!matched) throw new InvalidOperationException("Fire exposure does not match its persisted source tuple.");
    }

    private static void Select(BomberSkillState skill, Source source)
    {
        skill.FireExposureEntity.Value = source.Entity;
        skill.FireExposureParticipant.Value = source.Participant;
        skill.FireExposureLife.Value = source.Life;
        skill.FireExposureGeneration.Value = source.Generation;
        skill.FireExposureMatchId.Value = source.Match;
        skill.FireExposureChainId.Value = source.Chain;
        skill.FireExposureFamily.Value = source.Family;
        skill.FireExposureKind.Value = source.Kind;
        skill.FireExposureStartedTick.Value = source.Started;
        skill.FireExposureSkill.Value = source.Skill;
    }

    private static void ResetExposure(BomberSkillState skill)
    {
        skill.FireExposureFromTick.Value = skill.FireExposureLastTick.Value = 0;
        skill.FireExposureEntity.Value = skill.FireExposureParticipant.Value = skill.FireExposureLife.Value = default;
        skill.FireExposureGeneration.Value = skill.FireExposureMatchId.Value = skill.FireExposureChainId.Value = 0;
        skill.FireExposureFamily.Value = skill.FireExposureKind.Value = 0;
        skill.FireExposureStartedTick.Value = 0;
        skill.FireExposureSkill.Value = 0;
    }

    private static void Submit(World world, BomberPlayerState player, BomberSkillState skill, BomberFireFacts facts, Source source, int x, int z)
    {
        ulong pulse = checked(skill.FirePulseSequence.Value + 1);
        facts.FireHandleWorld.Add(0); facts.FireHandleInstance.Add(0); facts.FireHandleGeneration.Add(0);
        facts.FireTypeId.Add(10110); facts.FireTarget.Add(player.Entity); facts.FireSource.Add(source.Entity);
        facts.FireTick.Add(world.Tick); facts.FireMatchId.Add(source.Match); facts.FireParticipant.Add(player.Participant.Value);
        facts.FireLife.Add(player.Entity); facts.FireGeneration.Add(player.LifeGeneration.Value);
        facts.FireSourceParticipant.Add(source.Participant); facts.FireSourceLife.Add(source.Life);
        facts.FireSourceGeneration.Add(source.Generation); facts.FireFamily.Add(source.Family); facts.FireChainId.Add(source.Chain);
        facts.FireX.Add(x); facts.FireZ.Add(z); facts.FireCause.Add((int)BomberDamageCause.Fire);
        facts.FireSourceKind.Add(source.Kind); facts.FirePulse.Add(pulse);
        facts.FireBefore.Add(0); facts.FireAfter.Add(0); facts.FireActual.Add(0); facts.FireReady.Add(false); facts.FireStatus.Add(0);
        skill.FirePulseSequence.Value = pulse;
        var p = new BomberBurnDamageEffect.Parameters { Points = BomberMatchRules.HalfHeartsPerBomb,
            Fx = "bomber.damage", FactOwner = player.Participant.Value, Row = 0, MatchId = source.Match,
            Participant = player.Participant.Value, Life = player.Entity, Generation = player.LifeGeneration.Value,
            SourceParticipant = source.Participant, SourceLife = source.Life, SourceGeneration = source.Generation,
            Family = source.Family, ChainId = source.Chain, X = x, Z = z, Cause = (int)BomberDamageCause.Fire,
            SourceKind = source.Kind, Pulse = pulse };
        EffectHandleResult admitted = Effects.Apply<BomberBurnDamageEffect, BomberBurnDamageEffect.Parameters>(world,
            player.Entity, in p, source.Entity);
        if (!admitted.Succeeded) { facts.FireStatus[0] = 2; return; }
        facts.FireHandleWorld[0] = admitted.Handle.WorldId.Value;
        facts.FireHandleInstance[0] = admitted.Handle.InstanceId.Value;
        facts.FireHandleGeneration[0] = admitted.Handle.Generation;
    }

    internal static void Consume(World world)
    {
        foreach (BomberFireFacts facts in world.Each<BomberFireFacts>())
        {
            if (facts.FireStatus.Count == 0 || facts.FireStatus[0] == 0) continue;
            if (facts.FireStatus[0] == 2)
            {
                if (world.IsLive(facts.FireLife[0])) ResetExposure(world.Get<BomberSkillState>(facts.FireLife[0]));
                ClearFact(facts);
                continue;
            }
            if (facts.FireStatus[0] != 1 || !facts.FireReady[0] || facts.FireTypeId[0] != 10110 ||
                facts.FireTarget[0] != facts.FireLife[0] || facts.FireParticipant[0] != facts.Entity || facts.FireHandleWorld[0] == 0 ||
                facts.FireHandleInstance[0] == 0 || facts.FireHandleGeneration[0] == 0 || facts.FireCause[0] != (int)BomberDamageCause.Fire ||
                facts.FireActual[0] < 0 || facts.FireActual[0] != facts.FireBefore[0] - facts.FireAfter[0])
                throw new InvalidOperationException("Applied fire pulse lost its exact captured fact.");
            if (facts.FireActual[0] > 0)
            {
                world.Get<BomberSkillState>(facts.FireLife[0]).LastDamageTick.Value = facts.FireTick[0];
                var data = new Dictionary<string, string> {
                    ["appliedPoints"] = facts.FireActual[0].ToString(CultureInfo.InvariantCulture),
                    ["healthPointsBefore"] = facts.FireBefore[0].ToString(CultureInfo.InvariantCulture),
                    ["healthPointsLeft"] = facts.FireAfter[0].ToString(CultureInfo.InvariantCulture),
                    ["bombId"] = facts.FireSource[0].ToHex(), ["chainId"] = facts.FireChainId[0].ToString(CultureInfo.InvariantCulture),
                    ["sourceLifeGeneration"] = facts.FireSourceGeneration[0].ToString(CultureInfo.InvariantCulture) };
                BomberPresentationJournal journal = world.Single<BomberPresentationJournal>();
                ulong sequence = BomberMatchRules.Emit(world, "damage_applied", facts.FireMatchId[0],
                    $"source={facts.FireSource[0].ToHex()} target={facts.FireLife[0].ToHex()} cause=2", facts.FireTick[0]);
                journal.Append(world, "damage_applied", facts.FireMatchId[0], sequence,
                    facts.FireParticipant[0], facts.FireLife[0], facts.FireGeneration[0], facts.FireSourceParticipant[0],
                    facts.FireSourceLife[0], facts.FireSource[0], facts.FireX[0], facts.FireZ[0], "burn", data, facts.FireTick[0]);
                if (facts.FireBefore[0] > 0 && facts.FireAfter[0] == 0)
                {
                    bool boss = BomberGrowth.IsBoss(world.Get<BomberPlayerState>(facts.FireLife[0]).MaximumHealth.Value);
                    BomberStatisticsBusiness.AppliedDeath(world, facts.FireParticipant[0], facts.FireSourceParticipant[0], facts.FireMatchId[0], boss);
                    journal.Append(world, "death", facts.FireMatchId[0], world.Single<BomberWorldRuntime>().AllocateEventSequence(),
                        facts.FireParticipant[0], facts.FireLife[0], facts.FireGeneration[0], facts.FireSourceParticipant[0], facts.FireSourceLife[0],
                        facts.FireSource[0], facts.FireX[0], facts.FireZ[0], "burn", data, facts.FireTick[0]);
                }
            }
            ClearFact(facts);
        }
    }

    private static void ClearFact(BomberFireFacts facts)
    {
        facts.FireHandleWorld.Clear(); facts.FireHandleInstance.Clear(); facts.FireHandleGeneration.Clear();
        facts.FireTypeId.Clear(); facts.FireTarget.Clear(); facts.FireSource.Clear(); facts.FireTick.Clear();
        facts.FireMatchId.Clear(); facts.FireParticipant.Clear(); facts.FireLife.Clear(); facts.FireGeneration.Clear();
        facts.FireSourceParticipant.Clear(); facts.FireSourceLife.Clear(); facts.FireSourceGeneration.Clear();
        facts.FireFamily.Clear(); facts.FireChainId.Clear(); facts.FireX.Clear(); facts.FireZ.Clear(); facts.FireCause.Clear();
        facts.FireSourceKind.Clear(); facts.FirePulse.Clear(); facts.FireBefore.Clear(); facts.FireAfter.Clear();
        facts.FireActual.Clear(); facts.FireReady.Clear(); facts.FireStatus.Clear();
    }
}
