using Lumio.Engine.NativeLoader;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberFinalCircleHfsmState
{
    public HfsmSnapshot ReadSnapshot(NativeHfsmDefinition definition, ulong expectedKey)
        => BomberHfsmSnapshot.Read(SnapshotPresent.Value, SnapshotSchemaVersion.Value, OwnerEntity.Value,
            Entity, MachineKind.Value, BomberHfsmKind.FinalCircle, Fingerprint.Value, MachineKey.Value, expectedKey,
            Epoch.Value, StepSeq.Value, NextActivationSeq.Value, Lifecycle.Value,
            ActiveStates, ActiveActivations, definition);

    public bool StorePlan(HfsmPlan plan, NativeHfsmDefinition definition, ulong expectedKey)
    {
        HfsmSnapshot? next = BomberHfsmSnapshot.AcceptedNext(plan);
        if (next is null) return false;
        StoreSnapshot(next, definition, expectedKey);
        return true;
    }

    public void StoreSnapshot(HfsmSnapshot snapshot, NativeHfsmDefinition definition, ulong expectedKey)
    {
        HfsmActiveStateEntry[] path = BomberHfsmSnapshot.Prepare(snapshot, Entity, BomberHfsmKind.FinalCircle, expectedKey, definition);
        if (SnapshotPresent.Value) _ = ReadSnapshot(definition, expectedKey);
        OwnerEntity.Value = Entity;
        MachineKind.Value = (int)BomberHfsmKind.FinalCircle;
        Fingerprint.Value = snapshot.Fingerprint;
        MachineKey.Value = snapshot.MachineKey;
        Epoch.Value = snapshot.Epoch;
        StepSeq.Value = snapshot.StepSeq;
        NextActivationSeq.Value = snapshot.NextActivationSeq;
        Lifecycle.Value = (int)snapshot.Lifecycle;
        ActiveStates.Clear();
        ActiveActivations.Clear();
        foreach (HfsmActiveStateEntry entry in path)
        {
            ActiveStates.Add(entry.State);
            ActiveActivations.Add(entry.ActivationSeq);
        }
        SnapshotSchemaVersion.Value = BomberHfsmSnapshot.SchemaVersion;
        SnapshotPresent.Value = true;
    }
}
