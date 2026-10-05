using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

[EffectType(10106u, FxKeyFieldId = 2, InstantWrites = new uint[] { 4 })]
public sealed partial class BomberInventoryEffect : EffectType<BomberInventoryEffect.Parameters>
{
    public struct Parameters : IEffectParameters
    {
        [EffectField(1)] public long Available;
        [EffectField(2, MaxUtf8Bytes = 32)] public string Fx;
        [EffectField(3)] public NetEntityId Participant;
        [EffectField(4)] public NetEntityId Life;
        [EffectField(5)] public ulong Generation;
        [EffectField(6)] public ulong MatchId;
        [EffectField(7)] public long Capacity;
        public long Magnitude => Available;
        public string FxKey => Fx;
    }
}
