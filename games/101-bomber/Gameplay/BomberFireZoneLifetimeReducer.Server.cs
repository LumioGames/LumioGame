using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Gas;
using Lumio.Wire;

namespace Lumio.Bomber.Gameplay;

// Root's independent historical identity audit allocates reducer mapping 10124.
// The official Results loop bound is the CURRENT frozen ResultRecords360,
// not the participant count: two structural writes per result => MaxWrites720.
// This supports only the current legacy result bound. Favorite still fails closed
// against LiveRows24. A future cohort needs a separate Game-owned reducer/body
// cost proof and official GEN; this declaration does not authorize GAS expansion.
[EffectReducer("bomber.fire-region", After = new string[] { "bomber.fire" }, MaxWrites = 720)]
[EffectReducerField(typeof(BomberFireZoneState), "UntilTick", 10124, 1)]
[EffectReducerField(typeof(BomberFireZoneState), "LifetimeOutcome", 10124, 2)]
public sealed partial class BomberFireZoneLifetimeReducer : EffectReducer
{
    public static void Reduce(EffectReducerContext c)
    {
        for (int i = 0; i < c.ResultCount; i++)
        {
            EffectResult r = c.Result(i);
            if (r.TypeId == 10112u && c.Has<BomberFireZoneState>(r.Target) &&
                c.Read<BomberFireZoneState, bool>(r.Target, "regionCoverage") &&
                c.Read<BomberFireZoneState, bool>(r.Target, "birthSubmitted") &&
                c.Read<BomberFireZoneState, ulong>(r.Target, "lifetimeEffectWorld") == r.Handle.WorldId.Value &&
                c.Read<BomberFireZoneState, ulong>(r.Target, "lifetimeEffectInstance") == r.Handle.InstanceId.Value &&
                c.Read<BomberFireZoneState, uint>(r.Target, "lifetimeEffectGeneration") == r.Handle.Generation &&
                c.Read<BomberFireZoneState, Lumio.GameRuntime.Ecs.NetEntityId>(r.Target, "sourceLife") == r.Source &&
                c.Read<BomberFireZoneState, uint>(r.Target, "sourceSkill") == 4u)
            {
                if (r.Kind == EffectResultKind.Initial && r.Ordinal != 0u &&
                    c.Read<BomberFireZoneState, int>(r.Target, "lifetimeOutcome") == 2)
                {
                    if (r.Outcome == EffectResultOutcome.Applied &&
                        r.AppliedTick == c.Read<BomberFireZoneState, ulong>(r.Target, "fromTick") && r.Tick == r.AppliedTick)
                    {
                        c.Write<BomberFireZoneState, ulong>(r.Target, "untilTick",
                            r.AppliedTick + c.Read<BomberFireZoneState, ulong>(r.Target, "durationTicks"));
                        c.Write<BomberFireZoneState, int>(r.Target, "lifetimeOutcome", 3);
                    }
                    else if (r.Outcome != EffectResultOutcome.Applied)
                        c.Write<BomberFireZoneState, int>(r.Target, "lifetimeOutcome", 5);
                }
                else if (r.Kind == EffectResultKind.Terminal && r.Ordinal == 0u && r.Outcome == EffectResultOutcome.Expired &&
                    c.Read<BomberFireZoneState, int>(r.Target, "lifetimeOutcome") == 3 &&
                    r.AppliedTick == c.Read<BomberFireZoneState, ulong>(r.Target, "fromTick") &&
                    r.Tick == c.Read<BomberFireZoneState, ulong>(r.Target, "untilTick"))
                    c.Write<BomberFireZoneState, int>(r.Target, "lifetimeOutcome", 4);
            }
        }
    }
}
