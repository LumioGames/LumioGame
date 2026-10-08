using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay;

[EffectReducer("bomber.fire", MaxWrites = 1816)]
[EffectReducerField(typeof(BomberFireFacts), "FireStatus", 10123, 1)]
[EffectReducerField(typeof(BomberSkillState), "AuraUntilTick", 10122, 14)]
[EffectReducerField(typeof(BomberSkillState), "AuraOutcome", 10122, 15)]
[EffectReducerField(typeof(BomberSkillState), "CooldownFromTick", 10122, 2)]
[EffectReducerField(typeof(BomberSkillState), "CooldownUntilTick", 10122, 3)]
[EffectReducerField(typeof(BomberPlayerState), "ProtectedUntilTick", 10102, 10)]
public sealed partial class BomberFireReducer : EffectReducer
{
    public static void Reduce(EffectReducerContext c)
    {
        NetEntityId world = c.WorldEntity;
        for (int slot = 0; slot < c.Count<BomberWorldRuntime, NetEntityId>(world, "participantIds"); slot++)
        {
            NetEntityId participant = c.At<BomberWorldRuntime, NetEntityId>(world, "participantIds", slot);
            if (c.Has<BomberFireFacts>(participant) && c.Count<BomberFireFacts, ulong>(participant, "fireHandleWorld") == 1)
            {
                ulong handleWorld = c.At<BomberFireFacts, ulong>(participant, "fireHandleWorld", 0);
                ulong handleInstance = c.At<BomberFireFacts, ulong>(participant, "fireHandleInstance", 0);
                uint handleGeneration = c.At<BomberFireFacts, uint>(participant, "fireHandleGeneration", 0);
                NetEntityId target = c.At<BomberFireFacts, NetEntityId>(participant, "fireTarget", 0);
                NetEntityId source = c.At<BomberFireFacts, NetEntityId>(participant, "fireSource", 0);
                int matchedResult = -1;
                for (int i = 0; i < c.ResultCount; i++)
                {
                    EffectResult r = c.Result(i);
                    if (r.TypeId == 10110u && handleWorld == r.Handle.WorldId.Value &&
                        handleInstance == r.Handle.InstanceId.Value && handleGeneration == r.Handle.Generation &&
                        target == r.Target && source == r.Source)
                    {
                        matchedResult = i;
                    }
                }
                if (matchedResult >= 0)
                {
                    EffectResult r = c.Result(matchedResult);
                    EffectReducerRowClaim claim = c.Claim(r, "bomber.fire", participant, 0);
                    c.SetAt<BomberFireFacts, int>(claim, "fireStatus", r.Outcome == EffectResultOutcome.Applied ? 1 : 2);
                }
            }
        }
        for (int i = 0; i < c.ResultCount; i++)
        {
            EffectResult r = c.Result(i);
            if (r.TypeId == 10111u && c.Has<BomberSkillState>(r.Target) &&
                c.Read<BomberSkillState, ulong>(r.Target, "auraEffectWorld") == r.Handle.WorldId.Value &&
                c.Read<BomberSkillState, ulong>(r.Target, "auraEffectInstance") == r.Handle.InstanceId.Value &&
                c.Read<BomberSkillState, uint>(r.Target, "auraEffectGeneration") == r.Handle.Generation &&
                c.Has<BomberPlayerState>(r.Target) && r.Source == r.Target &&
                c.Read<BomberSkillState, ulong>(r.Target, "auraDurationTicks") != 0UL &&
                c.Read<BomberSkillState, ulong>(r.Target, "auraChainId") != 0UL)
            {
                if (r.Kind == EffectResultKind.Initial && r.Ordinal != 0u && c.Read<BomberSkillState, int>(r.Target, "auraOutcome") == 1)
                {
                    if (r.Outcome == EffectResultOutcome.Applied && r.AppliedTick == r.Tick)
                    {
                        c.Write<BomberSkillState, ulong>(r.Target, "auraUntilTick", r.AppliedTick + c.Read<BomberSkillState, ulong>(r.Target, "auraDurationTicks"));
                        c.Write<BomberSkillState, ulong>(r.Target, "cooldownFromTick", r.AppliedTick);
                        c.Write<BomberSkillState, ulong>(r.Target, "cooldownUntilTick", r.AppliedTick + c.Read<BomberSkillState, ulong>(r.Target, "auraCooldownTicks"));
                        c.Write<BomberSkillState, int>(r.Target, "auraOutcome", 2);
                        c.Write<BomberPlayerState, ulong>(r.Target, "protectedUntilTick", 0UL);
                    }
                    else c.Write<BomberSkillState, int>(r.Target, "auraOutcome", 3);
                }
                else if ((c.Read<BomberSkillState, int>(r.Target, "auraOutcome") == 0 ||
                        c.Read<BomberSkillState, int>(r.Target, "auraOutcome") == 2) &&
                    r.AppliedTick == c.Read<BomberSkillState, ulong>(r.Target, "cooldownFromTick") &&
                    ((r.Kind == EffectResultKind.Terminal && r.Ordinal == 0u && r.Outcome == EffectResultOutcome.Expired &&
                        r.Tick == c.Read<BomberSkillState, ulong>(r.Target, "cooldownFromTick") +
                            c.Read<BomberSkillState, ulong>(r.Target, "auraDurationTicks")) ||
                     (r.Kind == EffectResultKind.Control && r.Ordinal != 0u && r.Tick >= r.AppliedTick &&
                        (r.Outcome == EffectResultOutcome.Removed || r.Outcome == EffectResultOutcome.Suppressed))))
                {
                    c.Write<BomberSkillState, ulong>(r.Target, "auraUntilTick", 0UL);
                    c.Write<BomberSkillState, int>(r.Target, "auraOutcome",
                        r.Outcome == EffectResultOutcome.Expired ? 4 : r.Outcome == EffectResultOutcome.Removed ? 5 : 6);
                }
            }
        }
    }
}
