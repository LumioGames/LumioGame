using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Lumio.Bomber.Gameplay.Contracts.Components;
namespace Lumio.Bomber.Gameplay;

[EffectReducer("bomber.settlement", MaxWrites = 3600)]
[EffectReducerField(typeof(BomberDamageFacts), "Status", 10101, 1)]
[EffectReducerField(typeof(BomberSkillState), "BubbleUntilTick", 10122, 1)]
[EffectReducerField(typeof(BomberSkillState), "CooldownFromTick", 10122, 2)]
[EffectReducerField(typeof(BomberSkillState), "CooldownUntilTick", 10122, 3)]
[EffectReducerField(typeof(BomberSkillState), "BubbleOutcome", 10122, 4)]
[EffectReducerField(typeof(BomberSkillState), "FrozenUntilTick", 10122, 5)]
[EffectReducerField(typeof(BomberSkillState), "FreezeImmuneUntilTick", 10122, 6)]
[EffectReducerField(typeof(BomberSkillState), "FreezeEffectWorld", 10122, 7)]
[EffectReducerField(typeof(BomberSkillState), "FreezeEffectInstance", 10122, 8)]
[EffectReducerField(typeof(BomberSkillState), "FreezeEffectGeneration", 10122, 9)]
[EffectReducerField(typeof(BomberSkillState), "FreezeImmunityEffectWorld", 10122, 10)]
[EffectReducerField(typeof(BomberSkillState), "FreezeImmunityEffectInstance", 10122, 11)]
[EffectReducerField(typeof(BomberSkillState), "FreezeImmunityEffectGeneration", 10122, 12)]
public sealed partial class BomberSettlementReducer : EffectReducer
{
    public static void Reduce(EffectReducerContext c)
    {
        NetEntityId world = c.WorldEntity;
        for (int i = 0; i < c.ResultCount; i++)
        {
            EffectResult r = c.Result(i);
            NetEntityId bomb = r.Source;
            if (r.TypeId == 10101u && c.Has<BomberDamageFacts>(bomb))
            {
                NetEntityId target = r.Target;
                int matched = -1;
                bool duplicate = false;
                for (int row = 0; row < c.Count<BomberDamageFacts, ulong>(bomb, "handleWorld"); row++)
                {
                    if (c.At<BomberDamageFacts, NetEntityId>(bomb, "target", row) == target)
                    {
                        if (matched >= 0) duplicate = true;
                        matched = row;
                    }
                }
                if (matched >= 0)
                {
                    if (duplicate)
                    {
                        // Preserve the original ambiguous-target refusal before status.
                        EffectReducerRowClaim duplicateClaim = c.Claim(r, "bomber.damage", default, matched);
                        c.SetAt<BomberDamageFacts, int>(duplicateClaim, "status", r.Outcome == EffectResultOutcome.Applied ? 1 : 2);
                    }
                    else
                    {
                        if (c.At<BomberDamageFacts, ulong>(bomb, "handleWorld", matched) == r.Handle.WorldId.Value)
                        {
                            if (c.At<BomberDamageFacts, ulong>(bomb, "handleInstance", matched) == r.Handle.InstanceId.Value)
                            {
                                if (c.At<BomberDamageFacts, uint>(bomb, "handleGeneration", matched) == r.Handle.Generation)
                                {
                                    if (c.At<BomberBombState, ulong>(bomb, "hitHandleWorlds", matched) == r.Handle.WorldId.Value)
                                    {
                                        if (c.At<BomberBombState, ulong>(bomb, "hitHandleInstances", matched) == r.Handle.InstanceId.Value)
                                        {
                                            if (c.At<BomberBombState, uint>(bomb, "hitHandleGenerations", matched) == r.Handle.Generation)
                                            {
                                                if (c.At<BomberBombState, NetEntityId>(bomb, "hitLives", matched) == target)
                                                {
                                                    if (c.At<BomberBombState, NetEntityId>(bomb, "hitParticipants", matched) == c.At<BomberDamageFacts, NetEntityId>(bomb, "participant", matched))
                                                    {
                                                        if (c.At<BomberBombState, ulong>(bomb, "hitLifeGenerations", matched) == c.At<BomberDamageFacts, ulong>(bomb, "generation", matched))
                                                        {
                                                            EffectReducerRowClaim claim = c.Claim(r, "bomber.damage", bomb, matched);
                                                            c.SetAt<BomberDamageFacts, int>(claim, "status", r.Outcome == EffectResultOutcome.Applied ? 1 : 2);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            else if ((r.TypeId == 10108u || r.TypeId == 10109u) && c.Has<BomberSkillState>(r.Target))
            {
                if (r.Kind == EffectResultKind.Initial && r.Outcome == EffectResultOutcome.Applied)
                {
                    if (r.TypeId == 10108u)
                    {
                        c.Write<BomberSkillState, ulong>(r.Target, "freezeEffectWorld", r.Handle.WorldId.Value);
                        c.Write<BomberSkillState, ulong>(r.Target, "freezeEffectInstance", r.Handle.InstanceId.Value);
                        c.Write<BomberSkillState, uint>(r.Target, "freezeEffectGeneration", r.Handle.Generation);
                        c.Write<BomberSkillState, ulong>(r.Target, "frozenUntilTick", r.AppliedTick + c.Read<BomberSkillState, ulong>(r.Target, "freezeDurationTicks"));
                    }
                    else
                    {
                        c.Write<BomberSkillState, ulong>(r.Target, "freezeImmunityEffectWorld", r.Handle.WorldId.Value);
                        c.Write<BomberSkillState, ulong>(r.Target, "freezeImmunityEffectInstance", r.Handle.InstanceId.Value);
                        c.Write<BomberSkillState, uint>(r.Target, "freezeImmunityEffectGeneration", r.Handle.Generation);
                        c.Write<BomberSkillState, ulong>(r.Target, "frozenUntilTick", 0UL);
                        c.Write<BomberSkillState, ulong>(r.Target, "freezeImmuneUntilTick", r.AppliedTick + c.Read<BomberSkillState, ulong>(r.Target, "freezeImmunityDurationTicks"));
                    }
                }
                else if (r.Outcome == EffectResultOutcome.Expired || r.Outcome == EffectResultOutcome.Removed || r.Outcome == EffectResultOutcome.Suppressed)
                {
                    if (r.TypeId == 10108u &&
                        c.Read<BomberSkillState, ulong>(r.Target, "freezeEffectWorld") == r.Handle.WorldId.Value &&
                        c.Read<BomberSkillState, ulong>(r.Target, "freezeEffectInstance") == r.Handle.InstanceId.Value &&
                        c.Read<BomberSkillState, uint>(r.Target, "freezeEffectGeneration") == r.Handle.Generation)
                        c.Write<BomberSkillState, ulong>(r.Target, "frozenUntilTick", 0UL);
                    else if (r.TypeId == 10109u &&
                        c.Read<BomberSkillState, ulong>(r.Target, "freezeImmunityEffectWorld") == r.Handle.WorldId.Value &&
                        c.Read<BomberSkillState, ulong>(r.Target, "freezeImmunityEffectInstance") == r.Handle.InstanceId.Value &&
                        c.Read<BomberSkillState, uint>(r.Target, "freezeImmunityEffectGeneration") == r.Handle.Generation)
                        c.Write<BomberSkillState, ulong>(r.Target, "freezeImmuneUntilTick", 0UL);
                }
            }
            
            else if (r.TypeId == 10107u && c.Has<BomberSkillState>(r.Target) &&
                c.Read<BomberSkillState, ulong>(r.Target, "bubbleEffectWorld") == r.Handle.WorldId.Value &&
                c.Read<BomberSkillState, ulong>(r.Target, "bubbleEffectInstance") == r.Handle.InstanceId.Value &&
                c.Read<BomberSkillState, uint>(r.Target, "bubbleEffectGeneration") == r.Handle.Generation)
            {
                // Four writes at most, mutually exclusive with damage-row and freeze publication.
                if (r.Kind == EffectResultKind.Initial)
                {
                    if (r.Outcome == EffectResultOutcome.Applied)
                    {
                        c.Write<BomberSkillState, ulong>(r.Target, "bubbleUntilTick", r.AppliedTick + c.Read<BomberSkillState, ulong>(r.Target, "bubbleDurationTicks"));
                        c.Write<BomberSkillState, ulong>(r.Target, "cooldownFromTick", r.AppliedTick);
                        c.Write<BomberSkillState, ulong>(r.Target, "cooldownUntilTick", r.AppliedTick + c.Read<BomberSkillState, ulong>(r.Target, "bubbleCooldownTicks"));
                        c.Write<BomberSkillState, int>(r.Target, "bubbleOutcome", 2);
                    }
                    else c.Write<BomberSkillState, int>(r.Target, "bubbleOutcome", 3);
                }
                else if (r.Outcome == EffectResultOutcome.Expired || r.Outcome == EffectResultOutcome.Removed ||
                    r.Outcome == EffectResultOutcome.Suppressed)
                    c.Write<BomberSkillState, ulong>(r.Target, "bubbleUntilTick", 0UL);
            }
        }
    }
}
