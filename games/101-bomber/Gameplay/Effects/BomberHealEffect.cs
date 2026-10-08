using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
namespace Lumio.Bomber.Gameplay;
[EffectType(10102u, FxKeyFieldId = 2, InstantWrites = new uint[] { 1, 2, 3, 4, 5, 6 })]
[EffectFact("bomber.health", 3, 4)]
public sealed partial class BomberHealEffect : EffectType<BomberHealEffect.Parameters>
{
    public struct Parameters : IEffectParameters
    {
        [EffectField(1)] public long Points;
        [EffectField(2, MaxUtf8Bytes = 32)] public string Fx;
        [EffectField(3)] public NetEntityId Life;
        [EffectField(4)] public int Row;
        [EffectField(5)] public ulong MatchId;
        [EffectField(6)] public NetEntityId Participant;
        [EffectField(7)] public ulong Generation;
        [EffectField(8)] public ulong Intent;
        [EffectField(9)] public NetEntityId Item;
        [EffectField(10)] public int Kind;
        [EffectField(11)] public int MaximumBefore;
        [EffectField(12)] public int MaximumAfter;
        [EffectField(13)] public int GoldBefore;
        [EffectField(14)] public int GoldAfter;
        [EffectField(15)] public int HatsAfter;
        [EffectField(16)] public long UpgradeBefore;
        [EffectField(17)] public long UpgradeAfter;
        [EffectField(18)] public long MovementSpeedAfter;
        public long Magnitude => Points;
        public string FxKey => Fx;
    }
}
