using System;
using Lumio.Engine.NativeLoader;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberHfsmState
{
    /// <summary>Rebuild the exact Native snapshot; the caller supplies the expected kind and world-allocated key.</summary>
    public HfsmSnapshot ReadSnapshot(NativeHfsmDefinition definition, BomberHfsmKind expectedKind, ulong expectedKey)
        => BomberHfsmSnapshot.Read(SnapshotPresent.Value, SnapshotSchemaVersion.Value, OwnerEntity.Value,
            Entity, MachineKind.Value, expectedKind, Fingerprint.Value, MachineKey.Value, expectedKey,
            Epoch.Value, StepSeq.Value, NextActivationSeq.Value, Lifecycle.Value,
            ActiveStates, ActiveActivations, definition);

    /// <summary>A Native rejection leaves every persisted field unchanged.</summary>
    public bool StorePlan(HfsmPlan plan, NativeHfsmDefinition definition, BomberHfsmKind expectedKind, ulong expectedKey)
    {
        HfsmSnapshot? next = BomberHfsmSnapshot.AcceptedNext(plan);
        if (next is null) return false;
        StoreSnapshot(next, definition, expectedKind, expectedKey);
        return true;
    }

    public void StoreSnapshot(HfsmSnapshot snapshot, NativeHfsmDefinition definition, BomberHfsmKind expectedKind, ulong expectedKey)
    {
        if (expectedKind == BomberHfsmKind.FinalCircle ||
            (int)expectedKind < (int)BomberHfsmKind.Match || (int)expectedKind > (int)BomberHfsmKind.FireZone)
            throw new ArgumentOutOfRangeException(nameof(expectedKind));
        HfsmActiveStateEntry[] path = BomberHfsmSnapshot.Prepare(snapshot, Entity, expectedKind, expectedKey, definition);
        if (SnapshotPresent.Value) _ = ReadSnapshot(definition, expectedKind, expectedKey);
        // All domain checks run before the first write. A framework write failure faults the existing tick.
        OwnerEntity.Value = Entity;
        MachineKind.Value = (int)expectedKind;
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
