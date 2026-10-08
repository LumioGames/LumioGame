using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

[EcsComponent]
[EffectRow("bomber.fire", typeof(BomberParticipantEntity), nameof(FireStatus), nameof(FireReady), MaxStatusWrites = 360)]
public sealed partial class BomberFireFacts : Component
{
    // One accepted pulse is independent of the selected coverage source.
    [EffectRowColumn("captured", Selector = 1)]
    [Persist] public SyncList<ulong> FireHandleWorld = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 2)]
    [Persist] public SyncList<ulong> FireHandleInstance = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 3)]
    [Persist] public SyncList<uint> FireHandleGeneration = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 4)]
    [Persist] public SyncList<uint> FireTypeId = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 5)]
    [Persist] public SyncList<NetEntityId> FireTarget = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 6)]
    [Persist] public SyncList<NetEntityId> FireSource = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 8)]
    [Persist] public SyncList<ulong> FireTick = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 5)]
    [Persist] public SyncList<ulong> FireMatchId = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 6)]
    [Persist] public SyncList<NetEntityId> FireParticipant = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 7)]
    [Persist] public SyncList<NetEntityId> FireLife = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 8)]
    [Persist] public SyncList<ulong> FireGeneration = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 9)]
    [Persist] public SyncList<NetEntityId> FireSourceParticipant = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 10)]
    [Persist] public SyncList<NetEntityId> FireSourceLife = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 11)]
    [Persist] public SyncList<ulong> FireSourceGeneration = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 12)]
    [Persist] public SyncList<int> FireFamily = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 13)]
    [Persist] public SyncList<ulong> FireChainId = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 14)]
    [Persist] public SyncList<int> FireX = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 15)]
    [Persist] public SyncList<int> FireZ = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 16)]
    [Persist] public SyncList<int> FireCause = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 17)]
    [Persist] public SyncList<int> FireSourceKind = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 18)]
    [Persist] public SyncList<ulong> FirePulse = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("output")]
    [Persist] public SyncList<long> FireBefore = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("output")]
    [Persist] public SyncList<long> FireAfter = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("output")]
    [Persist] public SyncList<long> FireActual = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("ready")]
    [Persist] public SyncList<bool> FireReady = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("status")]
    [Persist] public SyncList<int> FireStatus = new(Scope.None, 1, Authority.Server);
}
