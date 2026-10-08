using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

[EffectType(10108u, Instant = false, Policy = "finite-ta", DurationFieldId = 1, FxKeyFieldId = 2)]
public sealed partial class BomberFreezeEffect : EffectType<BomberFreezeEffect.Parameters>
{
    public struct Parameters : IEffectParameters
    {
        [EffectField(1)] public ulong Duration;
        [EffectField(2, MaxUtf8Bytes = 32)] public string Fx;
        [EffectField(3)] public NetEntityId Participant;
        [EffectField(4)] public NetEntityId Life;
        [EffectField(5)] public ulong Generation;
        [EffectField(6)] public ulong MatchId;
        [EffectField(7)] public NetEntityId DamageOwner;
        [EffectField(8)] public int DamageRow;
        [EffectField(9)] public ulong DamageWorld;
        [EffectField(10)] public ulong DamageInstance;
        [EffectField(11)] public uint DamageGeneration;
        public long Magnitude => 0;
        public string FxKey => Fx;
    }
}
