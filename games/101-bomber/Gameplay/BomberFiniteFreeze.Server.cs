using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

internal static partial class BomberFiniteSkills
{
    internal static bool SubmitFreezeContact(World world, BomberBombState bomb, BomberDamageFacts facts, int row, EffectHandle damage)
    {
        var config = BomberConfigBinding.For(world);
        if (!config.Game.SkillsEnabled) return true;
        if (!world.IsLive(facts.Life[row])) return false;
        var skill = world.Get<BomberSkillState>(facts.Life[row]);
        bool damages = bomb.BombKind.Value != (int)BomberBombKind.Freeze || config.SkillRules.FreezeBombDamages;
        if (world.Get<EffectComponent>(facts.Life[row]).HasActiveEffect(10108u, world.Tick) || skill.FreezeRequestTick.Value == world.Tick)
        {
            if (!damages) return true;
            ulong duration = Ticks.FromMilliseconds(config.SkillRules.ControlImmunityMs, config.Game.TickRateHz);
            skill.FreezeImmunityDurationTicks.Value = duration;
            var p = new BomberFreezeImmunityEffect.Parameters {
                Duration = duration, Fx = "bomber.freeze_immunity", Participant = facts.Participant[row], Life = facts.Life[row],
                Generation = facts.Generation[row], MatchId = facts.MatchId[row], DamageOwner = bomb.Entity, DamageRow = row,
                DamageWorld = damage.WorldId.Value, DamageInstance = damage.InstanceId.Value, DamageGeneration = damage.Generation };
            if (!Effects.Apply<BomberFreezeImmunityEffect, BomberFreezeImmunityEffect.Parameters>(world, p.Life, in p, bomb.Entity).Succeeded)
                return false;
            return true;
        }
        if (bomb.BombKind.Value != (int)BomberBombKind.Freeze) return true;
        ulong freezeDuration = Ticks.FromMilliseconds(config.SkillLevel(6, 1).FreezeMs, config.Game.TickRateHz);
        skill.FreezeDurationTicks.Value = freezeDuration;
        var frozen = new BomberFreezeEffect.Parameters {
            Duration = freezeDuration, Fx = "bomber.freeze", Participant = facts.Participant[row], Life = facts.Life[row],
            Generation = facts.Generation[row], MatchId = facts.MatchId[row], DamageOwner = bomb.Entity, DamageRow = row,
            DamageWorld = damage.WorldId.Value, DamageInstance = damage.InstanceId.Value, DamageGeneration = damage.Generation };
        if (Effects.Apply<BomberFreezeEffect, BomberFreezeEffect.Parameters>(world, frozen.Life, in frozen, bomb.Entity).Succeeded)
        {
            skill.FreezeRequestTick.Value = world.Tick;
            return true;
        }
        return false;
    }

    internal static bool MatchesAppliedSurvivingDamage(in EffectApplyContext c, NetEntityId participantId,
        NetEntityId life, ulong generation, ulong matchId, NetEntityId damageOwner, int row,
        ulong damageWorld, ulong damageInstance, uint damageGeneration, bool requireDamage)
    {
        if (c.Target != life || c.Source != damageOwner || !c.World.IsLive(damageOwner)) return false;
        var player = c.World.Get<BomberPlayerState>(life);
        var participant = c.World.Get<BomberParticipantState>(participantId);
        var facts = c.World.Get<BomberDamageFacts>(damageOwner);
        return row >= 0 && row < facts.Ready.Count && facts.Ready[row] && facts.TypeId[row] == 10101u &&
            facts.HandleWorld[row] == damageWorld && facts.HandleInstance[row] == damageInstance && facts.HandleGeneration[row] == damageGeneration &&
            facts.Target[row] == life && facts.Participant[row] == participantId && facts.Generation[row] == generation &&
            facts.MatchId[row] == matchId && facts.Tick[row] == c.World.Tick &&
            (facts.Actual[row] > 0 || (!requireDamage && facts.Actual[row] == 0 && facts.Family[row] == (int)BomberBombKind.Freeze)) && facts.After[row] > 0 &&
            player.Participant.Value == participantId && participant.CurrentLife.Value == life && participant.MatchId.Value == matchId &&
            participant.LifeGeneration.Value == generation && player.LifeGeneration.Value == generation &&
            c.World.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints) > 0;
    }

    internal static void ConsumeFreeze(World world, BomberPlayerState player, BomberSkillState skill)
    {
        var effects = world.Get<EffectComponent>(player.Entity);
        bool immune = effects.HasActiveEffect(10109u, world.Tick);
        ulong frozenUntil = 0, immuneUntil = 0;
        foreach (var row in effects.ActiveEffects)
        {
            if (row.TypeId == 10108u)
            {
                if (world.Manager.CompletedRestore == WorldRestoreCompletion.PairedCheckpoint &&
                    row.Handle.InstanceId.Value == skill.FreezeEffectInstance.Value && row.Handle.Generation == skill.FreezeEffectGeneration.Value)
                    skill.FreezeEffectWorld.Value = row.Handle.WorldId.Value;
                if (immune) _ = Effects.Remove(world, row.Handle);
                else if (!row.Suppressed && row.EndTick > world.Tick) frozenUntil = row.EndTick;
            }
            else if (row.TypeId == 10109u)
            {
                if (world.Manager.CompletedRestore == WorldRestoreCompletion.PairedCheckpoint &&
                    row.Handle.InstanceId.Value == skill.FreezeImmunityEffectInstance.Value && row.Handle.Generation == skill.FreezeImmunityEffectGeneration.Value)
                    skill.FreezeImmunityEffectWorld.Value = row.Handle.WorldId.Value;
                if (!row.Suppressed && row.EndTick > world.Tick) immuneUntil = row.EndTick;
            }
        }
        skill.FrozenUntilTick.Value = frozenUntil;
        skill.FreezeImmuneUntilTick.Value = immuneUntil;
    }
}
