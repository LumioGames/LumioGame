using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;
using Lumio.Bomber.Gameplay.Contracts.Components;
namespace Lumio.Bomber.Gameplay;
// At most six writes per result (status, restoration identity and three growth holdings).
// The 360-result envelope needs 2160 declared writes; world limits stay unchanged.
[EffectReducer("bomber.health", MaxWrites = 2160)]
[EffectReducerField(typeof(BomberHealthFacts), "Status", 10105, 1)]
[EffectReducerField(typeof(BomberPlayerState), "RestorePending", 10102, 4)]
[EffectReducerField(typeof(BomberPlayerState), "RestoredIntent", 10102, 5)]
[EffectReducerField(typeof(BomberPlayerState), "MaximumHealth", 10102, 6)]
[EffectReducerField(typeof(BomberPlayerState), "GoldenHeartCount", 10102, 7)]
[EffectReducerField(typeof(BomberPlayerState), "HatCount", 10102, 8)]
public sealed partial class BomberHealthReducer : EffectReducer
{
    public static void Reduce(EffectReducerContext c)
    {
        for (int i = 0; i < c.ResultCount; i++)
        {
            EffectResult r = c.Result(i);
            uint typeId = r.TypeId;
            // These pure result comparisons have no guarded component access.
            if (typeId == 10102u | typeId == 10103u | typeId == 10104u)
            {
                NetEntityId target = r.Target;
                if (c.Has<BomberHealthFacts>(target))
                {
                    EffectReducerRowClaim healthClaim = c.Claim(r, "bomber.health", target, 0);
                    c.SetAt<BomberHealthFacts, int>(healthClaim, "status", r.Outcome == EffectResultOutcome.Applied ? 1 : 2);
                    if (r.Outcome == EffectResultOutcome.Applied)
                    {
                        if (typeId == 10103u || typeId == 10104u)
                        {
                            c.Write<BomberPlayerState, bool>(target, "restorePending", false);
                            c.Write<BomberPlayerState, ulong>(target, "restoredIntent", c.At<BomberHealthFacts, ulong>(target, "intent", 0));
                            if (typeId == 10104u)
                            {
                                c.Write<BomberPlayerState, int>(target, "maximumHealth", c.At<BomberHealthFacts, int>(target, "maximumAfter", 0));
                                c.Write<BomberPlayerState, int>(target, "goldenHeartCount", c.At<BomberHealthFacts, int>(target, "goldAfter", 0));
                                c.Write<BomberPlayerState, int>(target, "hatCount", c.At<BomberHealthFacts, int>(target, "hatsAfter", 0));
                            }
                        }
                        else
                        {
                            int kind = c.At<BomberHealthFacts, int>(target, "kind", 0);
                            if (kind == 5)
                            {
                                c.Write<BomberPlayerState, int>(target, "maximumHealth", c.At<BomberHealthFacts, int>(target, "maximumAfter", 0));
                                c.Write<BomberPlayerState, int>(target, "goldenHeartCount", c.At<BomberHealthFacts, int>(target, "goldAfter", 0));
                            }
                            else if (kind >= 0 && kind <= 2)
                            {
                                c.Write<BomberPlayerState, int>(target, "maximumHealth", c.At<BomberHealthFacts, int>(target, "maximumAfter", 0));
                                c.Write<BomberPlayerState, int>(target, "hatCount", c.At<BomberHealthFacts, int>(target, "hatsAfter", 0));
                            }
                        }
                    }
                }
            }
        }
    }
}
