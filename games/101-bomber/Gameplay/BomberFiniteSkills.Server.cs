using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

internal static partial class BomberFiniteSkills
{
    internal static void SubmitBubble(World world, NetEntityId life, BomberSkillState skill, SkillLevelsRow level, int x, int z)
    {
        if (skill.BubbleOutcome.Value != 0) return;
        var player = world.Get<BomberPlayerState>(life);
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        uint hz = BomberConfigBinding.For(world).Game.TickRateHz;
        ulong duration = Ticks.FromMilliseconds(level.DurationMs, hz);
        ulong cooldown = Ticks.FromMilliseconds(level.CooldownMs, hz);
        _ = checked(world.Tick + cooldown);
        var p = new BomberBubbleEffect.Parameters { Duration = duration, Fx = "bomber.bubble", Participant = participant.Entity,
            Life = life, Generation = player.LifeGeneration.Value, MatchId = participant.MatchId.Value };
        EffectHandleResult admitted = Effects.Apply<BomberBubbleEffect, BomberBubbleEffect.Parameters>(world, life, in p, life);
        if (!admitted.Succeeded) return;
        skill.BubbleEffectWorld.Value = admitted.Handle.WorldId.Value;
        skill.BubbleEffectInstance.Value = admitted.Handle.InstanceId.Value;
        skill.BubbleEffectGeneration.Value = admitted.Handle.Generation;
        skill.BubbleDurationTicks.Value = duration;
        skill.BubbleCooldownTicks.Value = cooldown;
        skill.BubbleCastX.Value = x;
        skill.BubbleCastZ.Value = z;
        skill.BubbleOutcome.Value = 1;
    }

    internal static void ConsumeBubble(World world, BomberPlayerState player, BomberSkillState skill)
    {
        // Cold restore gives the actual row a fresh world identity. Rebind only
        // the private request correlation after the owner confirms a paired cut.
        if (world.Manager.CompletedRestore == WorldRestoreCompletion.PairedCheckpoint)
        {
            foreach (var row in world.Get<EffectComponent>(player.Entity).ActiveEffects)
                if (row.TypeId == 10107u && row.Target == player.Entity && row.Source == player.Entity &&
                    row.Handle.InstanceId.Value == skill.BubbleEffectInstance.Value &&
                    row.Handle.Generation == skill.BubbleEffectGeneration.Value)
                    skill.BubbleEffectWorld.Value = row.Handle.WorldId.Value;
        }
        if (skill.BubbleOutcome.Value == 2)
        {
            UseActiveSkillAbility.RecordSkillCast(world, player.Entity, skill, skill.ActiveSkillLevel.Value, skill.BubbleDurationTicks.Value,
                skill.BubbleCastX.Value, skill.BubbleCastZ.Value, skill.CooldownFromTick.Value);
            if (!player.Participant.Value.IsDefault && world.IsLive(player.Participant.Value))
            {
                var statistics = world.Get<BomberStatistics>(player.Participant.Value);
                statistics.SkillCasts.Value = checked(statistics.SkillCasts.Value + 1);
            }
            skill.BubbleOutcome.Value = 0;
        }
        else if (skill.BubbleOutcome.Value == 3) skill.BubbleOutcome.Value = 0;
        // Reconstruct the Aoi projection from the Runtime row; it is never an authority input on the server.
        ulong until = 0;
        foreach (var row in world.Get<EffectComponent>(player.Entity).ActiveEffects)
            if (row.TypeId == 10107u && !row.Suppressed && row.EndTick > world.Tick && row.EndTick > until) until = row.EndTick;
        skill.BubbleUntilTick.Value = until;
    }
}
