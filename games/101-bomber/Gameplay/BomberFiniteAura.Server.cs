using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

internal static partial class BomberFiniteSkills
{
    internal static void SubmitAura(World world, NetEntityId life, BomberSkillState skill,
        SkillLevelsRow level, int x, int z)
    {
        if (skill.AuraOutcome.Value != 0) return;
        var player = world.Get<BomberPlayerState>(life);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        var runtime = world.Single<BomberWorldRuntime>();
        uint hz = BomberConfigBinding.For(world).Game.TickRateHz;
        ulong duration = Ticks.FromMilliseconds(level.DurationMs, hz);
        ulong cooldown = Ticks.FromMilliseconds(level.CooldownMs, hz);
        bool favorite = BomberSpecialBombResolver.TryResolveSlot(BomberConfigBinding.For(world), skill, out int kind) &&
            kind == (int)BomberBombKind.ReservedFire;
        _ = checked(world.Tick + duration);
        _ = checked(world.Tick + cooldown);
        ulong chain = checked(runtime.NextChainId.Value + 1);
        var p = new BomberFireAuraEffect.Parameters { Duration = duration, Fx = "bomber.fire-aura",
            Participant = participant.Entity, Life = life, Generation = player.LifeGeneration.Value,
            MatchId = participant.MatchId.Value, Favorite = favorite, ChainId = chain };
        if (favorite)
        {
            BomberFavoriteFireZones.Prepare(world, life, duration, chain, x, z);
            BomberFavoriteFireZones.MarkAuraSubmitted(world, life);
        }
        EffectHandleResult admitted = Effects.Apply<BomberFireAuraEffect, BomberFireAuraEffect.Parameters>(world, life, in p, life);
        if (favorite) BomberFavoriteFireZones.BindAura(world, life, admitted);
        if (!admitted.Succeeded) return;
        runtime.NextChainId.Value = chain;
        skill.AuraEffectWorld.Value = admitted.Handle.WorldId.Value;
        skill.AuraEffectInstance.Value = admitted.Handle.InstanceId.Value;
        skill.AuraEffectGeneration.Value = admitted.Handle.Generation;
        skill.AuraDurationTicks.Value = duration;
        skill.AuraCooldownTicks.Value = cooldown;
        skill.AuraChainId.Value = chain;
        skill.AuraFavorite.Value = favorite;
        skill.AuraCastX.Value = x;
        skill.AuraCastZ.Value = z;
        skill.AuraOutcome.Value = 1;
    }

    internal static bool MatchesAuraRequest(World world, BomberPlayerState player, BomberSkillState skill,
        in BomberFireAuraEffect.Parameters p)
    {
        if (p.Life != player.Entity || p.Participant != player.Participant.Value || p.Generation == 0 || p.MatchId == 0 ||
            p.ChainId == 0 || p.Duration == 0 || !world.IsLive(p.Participant) ||
            !world.TypeOf(p.Participant).Is<BomberParticipantEntity>()) return false;
        var participant = world.Get<BomberParticipantState>(p.Participant);
        return participant.CurrentLife.Value == p.Life && participant.MatchId.Value == p.MatchId &&
            p.MatchId == world.Single<BomberMatchState>().MatchId.Value &&
            participant.LifeGeneration.Value == p.Generation && player.LifeGeneration.Value == p.Generation &&
            skill.AuraDurationTicks.Value == p.Duration && skill.AuraChainId.Value == p.ChainId &&
            skill.AuraFavorite.Value == p.Favorite;
    }

    internal static bool MatchesActualAura(World world, BomberPlayerState player, BomberSkillState skill,
        FiniteEffectView row, bool allowPairedWorld)
    {
        if (row.TypeId != 10111u || row.Target != player.Entity || row.Source != player.Entity ||
            row.Handle.InstanceId.Value != skill.AuraEffectInstance.Value ||
            row.Handle.Generation != skill.AuraEffectGeneration.Value ||
            (row.Handle.WorldId.Value != skill.AuraEffectWorld.Value && !allowPairedWorld)) return false;
        var p = BomberFireAuraEffect.ReadActualRow(row);
        return MatchesAuraRequest(world, player, skill, in p) && row.Duration == p.Duration &&
            row.AppliedTick <= world.Tick && row.EndTick >= row.AppliedTick &&
            row.AppliedTick == skill.CooldownFromTick.Value;
    }

    internal static void ConsumeAura(World world, BomberPlayerState player, BomberSkillState skill)
    {
        bool paired = world.Manager.CompletedRestore == WorldRestoreCompletion.PairedCheckpoint;
        ulong until = 0;
        foreach (var row in world.Get<EffectComponent>(player.Entity).ActiveEffects)
        {
            if (!MatchesActualAura(world, player, skill, row, paired)) continue;
            // The restored Runtime row supplies its fresh WorldId; never reapply an Effect.
            if (paired) skill.AuraEffectWorld.Value = row.Handle.WorldId.Value;
            if (player.LifePhase.Value >= (int)BomberLifePhase.AwaitingRespawn ||
                world.Get<AttributeComponent>(player.Entity).GetBaseValue(BomberAttributeNames.HealthPoints) <= 0)
            {
                _ = Effects.Remove(world, row.Handle);
                continue;
            }
            if (!row.Suppressed && row.EndTick > world.Tick) until = row.EndTick;
        }
        if (skill.AuraOutcome.Value == 2)
        {
            UseActiveSkillAbility.RecordSkillCast(world, player.Entity, skill, skill.ActiveSkillLevel.Value,
                skill.AuraDurationTicks.Value, skill.AuraCastX.Value, skill.AuraCastZ.Value, skill.CooldownFromTick.Value);
            if (!player.Participant.Value.IsDefault && world.IsLive(player.Participant.Value))
            {
                var statistics = world.Get<BomberStatistics>(player.Participant.Value);
                statistics.SkillCasts.Value = checked(statistics.SkillCasts.Value + 1);
            }
            skill.AuraOutcome.Value = 0;
        }
        else if (skill.AuraOutcome.Value is >= 3 and <= 6) skill.AuraOutcome.Value = 0;
        skill.AuraUntilTick.Value = until;
    }
}
