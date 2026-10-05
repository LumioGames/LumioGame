using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

[EffectType(10105u, FxKeyFieldId = 2, InstantWrites = new uint[] { 1, 2, 3, 4, 5, 6 })]
public sealed partial class BomberSuccessorRestoreEffect : EffectType<BomberSuccessorRestoreEffect.Parameters>
{
    public struct Parameters : IEffectParameters
    {
        [EffectField(1)] public long Health;
        [EffectField(2, MaxUtf8Bytes = 32)] public string Fx;
        [EffectField(3)] public NetEntityId Participant;
        [EffectField(4)] public NetEntityId OldLife;
        [EffectField(5)] public ulong MatchId;
        [EffectField(6)] public ulong Generation;
        [EffectField(7)] public ulong Intent;
        [EffectField(8)] public ulong Revision;
        [EffectField(9)] public long Power;
        [EffectField(10)] public long Capacity;
        [EffectField(11)] public long Available;
        [EffectField(12)] public long Speed;
        [EffectField(13)] public long MovementSpeed;
        public long Magnitude => Health;
        public string FxKey => Fx;
    }
}
