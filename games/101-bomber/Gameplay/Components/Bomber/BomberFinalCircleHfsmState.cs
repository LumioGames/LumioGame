using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>The World entity's second Native machine, separate from Match.</summary>
[EcsComponent]
public sealed partial class BomberFinalCircleHfsmState : Component
{
    [Persist] public Sync<bool> SnapshotPresent = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> SnapshotSchemaVersion = new(Scope.None, Authority.Server);
    [Persist] public Sync<NetEntityId> OwnerEntity = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> MachineKind = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> Fingerprint = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> MachineKey = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> Epoch = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> StepSeq = new(Scope.None, Authority.Server);
    [Persist] public Sync<ulong> NextActivationSeq = new(Scope.None, Authority.Server);
    [Persist] public Sync<int> Lifecycle = new(Scope.None, Authority.Server);
    [Persist] public SyncList<uint> ActiveStates = new(Scope.None, 5, Authority.Server);
    [Persist] public SyncList<ulong> ActiveActivations = new(Scope.None, 5, Authority.Server);
}
