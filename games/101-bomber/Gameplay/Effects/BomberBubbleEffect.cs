using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

[EffectType(10107u, Instant = false, Policy = "finite-ta", DurationFieldId = 1, FxKeyFieldId = 2)]
public sealed partial class BomberBubbleEffect : EffectType<BomberBubbleEffect.Parameters>
{
    public struct Parameters : IEffectParameters
    {
        [EffectField(1)] public ulong Duration;
        [EffectField(2, MaxUtf8Bytes = 32)] public string Fx;
        [EffectField(3)] public NetEntityId Participant;
        [EffectField(4)] public NetEntityId Life;
        [EffectField(5)] public ulong Generation;
        [EffectField(6)] public ulong MatchId;
        public long Magnitude => 0;
        public string FxKey => Fx;
    }
}
