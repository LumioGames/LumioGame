using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

[EffectType(10110u, FxKeyFieldId = 2, InstantWrites = new uint[] { 1 })]
[EffectFact("bomber.fire", 3, 4)]
public sealed partial class BomberBurnDamageEffect : EffectType<BomberBurnDamageEffect.Parameters>
{
    public struct Parameters : IEffectParameters
    {
        [EffectField(1)] public long Points;
        [EffectField(2, MaxUtf8Bytes = 32)] public string Fx;
        [EffectField(3)] public NetEntityId FactOwner;
        [EffectField(4)] public int Row;
        [EffectField(5)] public ulong MatchId;
        [EffectField(6)] public NetEntityId Participant;
        [EffectField(7)] public NetEntityId Life;
        [EffectField(8)] public ulong Generation;
        [EffectField(9)] public NetEntityId SourceParticipant;
        [EffectField(10)] public NetEntityId SourceLife;
        [EffectField(11)] public ulong SourceGeneration;
        [EffectField(12)] public int Family;
        [EffectField(13)] public ulong ChainId;
        [EffectField(14)] public int X;
        [EffectField(15)] public int Z;
        [EffectField(16)] public int Cause;
        [EffectField(17)] public int SourceKind;
        [EffectField(18)] public ulong Pulse;
        public long Magnitude => Points;
        public string FxKey => Fx;
    }
}
