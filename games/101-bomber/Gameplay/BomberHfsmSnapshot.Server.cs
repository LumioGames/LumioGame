using System;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

/// <summary>Validation shared by the two concrete persisted machine components.</summary>
internal static class BomberHfsmSnapshot
{
    internal const int SchemaVersion = 1;

    internal static HfsmSnapshot Read(
        bool present, int schema, NetEntityId storedOwner, NetEntityId actualOwner, int storedKind,
        BomberHfsmKind expectedKind, ulong fingerprint, ulong machineKey, ulong expectedKey,
        ulong epoch, ulong stepSeq, ulong nextActivationSeq, int lifecycle,
        SyncList<uint> states, SyncList<ulong> activations, NativeHfsmDefinition definition)
    {
        if (!present) throw new InvalidOperationException("The HFSM snapshot has not been initialized.");
        ValidateIdentity(schema, storedOwner, actualOwner, storedKind, expectedKind, fingerprint, machineKey, expectedKey, definition);
        if (states.Count != activations.Count) throw new InvalidOperationException("HFSM state and activation paths have different lengths.");
        if ((uint)states.Count > definition.MaxPath) throw new InvalidOperationException("HFSM active path exceeds definition.MaxPath.");
        var path = new HfsmActiveStateEntry[states.Count];
        for (int i = 0; i < path.Length; i++) path[i] = new(states[i], activations[i]);
        var snapshot = new HfsmSnapshot(fingerprint, machineKey, epoch, stepSeq, nextActivationSeq, (HfsmLifecycle)lifecycle, path);
        ValidateShape(snapshot, definition);
        return snapshot;
    }

    internal static HfsmActiveStateEntry[] Prepare(
        HfsmSnapshot snapshot, NetEntityId actualOwner, BomberHfsmKind kind, ulong expectedKey,
        NativeHfsmDefinition definition)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        ValidateIdentity(SchemaVersion, actualOwner, actualOwner, (int)kind, kind,
            snapshot.Fingerprint, snapshot.MachineKey, expectedKey, definition);
        ValidateShape(snapshot, definition);
        var path = new HfsmActiveStateEntry[snapshot.ActivePath.Count];
        for (int i = 0; i < path.Length; i++) path[i] = snapshot.ActivePath[i];
        return path;
    }

    internal static HfsmSnapshot? AcceptedNext(HfsmPlan plan)
    {
        ArgumentNullException.ThrowIfNull(plan);
        if (plan.Outcome == HfsmOutcome.Rejected)
        {
            if (plan.Next is not null || plan.Actions.Count != 0)
                throw new InvalidOperationException("A rejected Native plan must not contain a next snapshot or actions.");
            return null;
        }
        if (plan.Outcome is not (HfsmOutcome.Started or HfsmOutcome.Transitioned or HfsmOutcome.Unhandled or HfsmOutcome.Stopped))
            throw new InvalidOperationException("Unknown legal HFSM outcome.");
        return plan.Next ?? throw new InvalidOperationException("A legal Native plan must contain its next snapshot.");
    }

    private static void ValidateIdentity(int schema, NetEntityId owner, NetEntityId actualOwner, int kind,
        BomberHfsmKind expectedKind, ulong fingerprint, ulong key, ulong expectedKey, NativeHfsmDefinition definition)
    {
        ArgumentNullException.ThrowIfNull(definition);
        if (schema != SchemaVersion) throw new InvalidOperationException("Unsupported HFSM snapshot schema.");
        if (actualOwner.IsDefault || owner != actualOwner) throw new InvalidOperationException("HFSM snapshot owner mismatch.");
        if (kind != (int)expectedKind) throw new InvalidOperationException("HFSM machine kind mismatch.");
        if (fingerprint != definition.Fingerprint) throw new InvalidOperationException("HFSM definition fingerprint mismatch.");
        if (key == 0 || key != expectedKey) throw new InvalidOperationException("HFSM machine key mismatch.");
    }

    private static void ValidateShape(HfsmSnapshot snapshot, NativeHfsmDefinition definition)
    {
        if (!Enum.IsDefined(snapshot.Lifecycle)) throw new InvalidOperationException("Unknown HFSM lifecycle.");
        if ((uint)snapshot.ActivePath.Count > definition.MaxPath)
            throw new InvalidOperationException("HFSM active path exceeds definition.MaxPath.");
        if (snapshot.Lifecycle == HfsmLifecycle.NotStarted)
        {
            if (snapshot.Epoch != 0 || snapshot.StepSeq != 0 || snapshot.NextActivationSeq != 1 || snapshot.ActivePath.Count != 0)
                throw new InvalidOperationException("Malformed canonical NotStarted HFSM snapshot.");
            return;
        }
        if (snapshot.Epoch == 0 || snapshot.NextActivationSeq == 0)
            throw new InvalidOperationException("Running or stopped HFSM snapshots require nonzero epoch and next activation sequence.");
        if ((snapshot.Lifecycle == HfsmLifecycle.Running) != (snapshot.ActivePath.Count > 0))
            throw new InvalidOperationException("HFSM lifecycle and active path disagree.");
        foreach (HfsmActiveStateEntry state in snapshot.ActivePath)
            if (state.ActivationSeq == 0 || state.ActivationSeq >= snapshot.NextActivationSeq)
                throw new InvalidOperationException("HFSM activation sequence is out of range.");
    }
}
