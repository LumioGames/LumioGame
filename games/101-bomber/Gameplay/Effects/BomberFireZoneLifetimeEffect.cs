using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

// Game-owned ID 10112 was allocated by Root after the complete historical
// identity scan. This is a declaration draft, not a generated or published type.
[EffectType(10112u, Instant = false, Policy = "finite-ta", DurationFieldId = 1, FxKeyFieldId = 2)]
public sealed partial class BomberFireZoneLifetimeEffect : EffectType<BomberFireZoneLifetimeEffect.Parameters>
{
    public struct Parameters : IEffectParameters
    {
        [EffectField(1)] public ulong Duration;
        [EffectField(2, MaxUtf8Bytes = 32)] public string Fx;
        [EffectField(3)] public NetEntityId Participant;
        [EffectField(4)] public NetEntityId Life;
        [EffectField(5)] public ulong Generation;
        [EffectField(6)] public ulong MatchId;
        [EffectField(7)] public ulong ChainId;
        [EffectField(8)] public ulong AuraWorld;
        [EffectField(9)] public ulong AuraInstance;
        [EffectField(10)] public uint AuraGeneration;
        [EffectField(11)] public NetEntityId Zone;
        [EffectField(12)] public int Ordinal;
        [EffectField(13)] public int X;
        [EffectField(14)] public int Z;
        [EffectField(15)] public int Mask;
        [EffectField(16)] public ulong BirthTick;
        public long Magnitude => 0;
        public string FxKey => Fx;
    }
}
