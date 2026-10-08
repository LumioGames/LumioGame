using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
namespace Lumio.Bomber.Gameplay.Contracts.Components;

[EcsComponent]
[EffectRow("bomber.damage", typeof(BomberBombEntity), nameof(Status), nameof(Ready), MaxStatusWrites = 360)]
public sealed partial class BomberDamageFacts : Component
{
    [EffectRowColumn("captured", Selector = 1)]
    [Persist] public SyncList<ulong> HandleWorld = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 2)]
    [Persist] public SyncList<ulong> HandleInstance = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 3)]
    [Persist] public SyncList<uint> HandleGeneration = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 4)]
    [Persist] public SyncList<uint> TypeId = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 5)]
    [Persist] public SyncList<NetEntityId> Target = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 6)]
    [Persist] public SyncList<NetEntityId> Source = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 8)]
    [Persist] public SyncList<ulong> Tick = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 5)]
    [Persist] public SyncList<ulong> MatchId = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 6)]
    [Persist] public SyncList<NetEntityId> Participant = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 7)]
    [Persist] public SyncList<NetEntityId> Life = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 8)]
    [Persist] public SyncList<ulong> Generation = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 9)]
    [Persist] public SyncList<NetEntityId> SourceParticipant = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 10)]
    [Persist] public SyncList<NetEntityId> SourceLife = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 11)]
    [Persist] public SyncList<ulong> SourceGeneration = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 12)]
    [Persist] public SyncList<int> Family = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 13)]
    [Persist] public SyncList<ulong> ChainId = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 14)]
    [Persist] public SyncList<int> X = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 15)]
    [Persist] public SyncList<int> Z = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("captured", Selector = 9, PayloadFieldId = 16)]
    [Persist] public SyncList<int> Cause = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("output")]
    [Persist] public SyncList<long> Before = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("output")]
    [Persist] public SyncList<long> After = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("output")]
    [Persist] public SyncList<long> Actual = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("ready")]
    [Persist] public SyncList<bool> Ready = new(Scope.None, 16, Authority.Server);
    [EffectRowColumn("status")]
    [Persist] public SyncList<int> Status = new(Scope.None, 16, Authority.Server);
}
