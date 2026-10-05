using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.EntityTypes;
namespace Lumio.Bomber.Gameplay.Contracts.Components;
[EcsComponent]
[EffectRow("bomber.health", typeof(PlayerEntity), nameof(Status), nameof(Ready), MaxStatusWrites = 360)]
public sealed partial class BomberHealthFacts : Component
{
    [EffectRowColumn("captured", Selector = 1)]
    [Persist] public SyncList<ulong> HandleWorld = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 2)]
    [Persist] public SyncList<ulong> HandleInstance = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 3)]
    [Persist] public SyncList<uint> HandleGeneration = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 4)]
    [Persist] public SyncList<uint> TypeId = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 5)]
    [Persist] public SyncList<NetEntityId> Target = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 6)]
    [Persist] public SyncList<NetEntityId> Source = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 8)]
    [Persist] public SyncList<ulong> Tick = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 5)]
    [Persist] public SyncList<ulong> MatchId = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 6)]
    [Persist] public SyncList<NetEntityId> Participant = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 7)]
    [Persist] public SyncList<ulong> Generation = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 8)]
    [Persist] public SyncList<ulong> Intent = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("output")]
    [Persist] public SyncList<long> Before = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("output")]
    [Persist] public SyncList<long> After = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("output")]
    [Persist] public SyncList<long> Actual = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("ready")]
    [Persist] public SyncList<bool> Ready = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("status")]
    [Persist] public SyncList<int> Status = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 9)]
    [Persist] public SyncList<NetEntityId> Item = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 10)]
    [Persist] public SyncList<int> Kind = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 11)]
    [Persist] public SyncList<int> MaximumBefore = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 12)]
    [Persist] public SyncList<int> MaximumAfter = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 13)]
    [Persist] public SyncList<int> GoldBefore = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 14)]
    [Persist] public SyncList<int> GoldAfter = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 15)]
    [Persist] public SyncList<int> HatsAfter = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 16)]
    [Persist] public SyncList<long> UpgradeBefore = new(Scope.None, 1, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 17)]
    [Persist] public SyncList<long> UpgradeAfter = new(Scope.None, 1, Authority.Server);
}
