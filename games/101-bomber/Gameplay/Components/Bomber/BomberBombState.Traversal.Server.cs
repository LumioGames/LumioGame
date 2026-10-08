using System;
using System.Collections.Generic;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberBombState
{
    internal const int TraversalReady = 0, TraversalPending = 1, TraversalFinished = 2;

    internal (int X, int Z, int Power) PreflightNativeExplosion()
    {
        ValidateStorage();
        RequireIdentity(Owner.Value, SourceLife.Value, SourceLifeGeneration.Value);
        if (Phase.Value != (int)BomberBombPhase.Fuse || ExplodedAtTick.Value != 0 ||
            TraversalPower.Value != -1 || TerrainContinuations.Count != 0 || ContactedChests.Count != 0 ||
            ChainId.Value == 0 || World.Tick == 0 || Power.Value < 0)
            throw TraversalFailure("Native explosion requires a new exact Fuse source");
        var map = BomberConfigBinding.For(World).Map;
        var position = World.Get<LogicTransform>(Entity).LocalPosition;
        if (!float.IsFinite(position.X) || !float.IsFinite(position.Z))
            throw TraversalFailure("explosion origin is not finite");
        int x = BomberMatchRules.CellX(position), z = BomberMatchRules.CellZ(position);
        if (x < map.BoundaryCells || x >= (long)map.Width - map.BoundaryCells ||
            z < map.BoundaryCells || z >= (long)map.Depth - map.BoundaryCells)
            throw TraversalFailure("explosion origin is outside the actual map interior");
        return (x, z, Power.Value);
    }

    internal void PublishNativeExplosionTraversal((int X, int Z, int Power) geometry)
    {
        // The actual transitioned Native action owns these fixed writes. Its full
        // source, geometry and lifecycle preflight precedes StorePlan and all actions.
        TraversalOriginX.Value = geometry.X;
        TraversalOriginZ.Value = geometry.Z;
        TraversalPower.Value = geometry.Power;
        for (int direction = 0; direction < 4; direction++) TraversalArms.Add(TraversalReady);
    }

    internal void ValidateFrozenTraversal()
    {
        if (TraversalPower.Value == -1)
        {
            if (TraversalOriginX.Value != -1 || TraversalOriginZ.Value != -1 || TraversalArms.Count != 0 ||
                TerrainContinuations.Count != 0 || ExplodedAtTick.Value != 0 ||
                Phase.Value is (int)BomberBombPhase.Danger or (int)BomberBombPhase.Burn)
                throw TraversalFailure("uninitialized source retains exploded traversal obligations");
            return;
        }
        var map = BomberConfigBinding.For(World).Map;
        var position = World.Get<LogicTransform>(Entity).LocalPosition;
        if (TraversalPower.Value < 0 || TraversalArms.Count != 4 || Power.Value != TraversalPower.Value ||
            ExplodedAtTick.Value == 0 || ExplodedAtTick.Value > World.Tick ||
            (Phase.Value != (int)BomberBombPhase.Danger && Phase.Value != (int)BomberBombPhase.Burn && Phase.Value != (int)BomberBombPhase.Expired) ||
            KickDirection.Value != 0 || KickRange.Value != 0 ||
            !float.IsFinite(position.X) || !float.IsFinite(position.Z) ||
            BomberMatchRules.CellX(position) != TraversalOriginX.Value ||
            BomberMatchRules.CellZ(position) != TraversalOriginZ.Value ||
            TraversalOriginX.Value < map.BoundaryCells || TraversalOriginX.Value >= (long)map.Width - map.BoundaryCells ||
            TraversalOriginZ.Value < map.BoundaryCells || TraversalOriginZ.Value >= (long)map.Depth - map.BoundaryCells)
            throw TraversalFailure("source power/origin or lifecycle differs from its frozen explosion");
        RequireIdentity(Owner.Value, SourceLife.Value, SourceLifeGeneration.Value);
        if (ChainId.Value == 0) throw TraversalFailure("exploded source has no exact chain");
        for (int direction = 0; direction < 4; direction++)
        {
            int packed = TraversalArms[direction];
            if (packed < 0 || packed % 4 > TraversalFinished || packed / 4 > TraversalMaximum(direction) ||
                (packed % 4 == TraversalPending && packed / 4 == 0))
                throw TraversalFailure("arm state exceeds its actual directional geometry");
        }
    }

    internal void RequireInitialTraversal()
    {
        ValidateFrozenTraversal();
        if (TraversalPower.Value < 0 || TerrainContinuations.Count != 0)
            throw TraversalFailure("initial Trace is not owned by the new Native explosion");
        for (int direction = 0; direction < 4; direction++)
            if (TraversalArms[direction] != TraversalReady)
                throw TraversalFailure("initial Trace would reset an already acquired arm");
    }

    internal void RequireTraversalContinuation(BomberTerrainContinuation ray)
    {
        ValidateFrozenTraversal();
        int distance = TraversalDistance(ray.X, ray.Z, ray.Direction);
        int packed = TraversalArms[ray.Direction];
        if (packed % 4 != TraversalReady || packed / 4 != distance ||
            ray.Unstarted != (distance == 0) ||
            ray.Remaining != (distance == 0 || PierceLayers.Value > 0 ? TraversalPower.Value - distance : 0))
            throw TraversalFailure("continuation rewinds its durable arm or invents an obligation");
    }

    internal int PreflightNewTraversal(int x, int z, int direction, int remaining)
    {
        ValidateFrozenTraversal();
        if (TraversalPower.Value < 0) throw TraversalFailure("terrain contact has no Native explosion");
        int distance = TraversalDistance(x, z, direction);
        int packed = TraversalArms[direction];
        if (packed % 4 != TraversalReady || distance <= packed / 4 ||
            remaining != (PierceLayers.Value > 0 ? TraversalPower.Value - distance : 0))
            throw TraversalFailure("mutation/contact does not advance this exact original arm");
        return PackTraversal(distance, TraversalPending);
    }

    internal void RequireTraversalPending(int x, int z, int direction)
    {
        ValidateFrozenTraversal();
        int distance = TraversalDistance(x, z, direction);
        if (distance == 0 || TraversalArms[direction] != PackTraversal(distance, TraversalPending))
            throw TraversalFailure("pending Native owner differs from the durable arm");
    }

    internal bool TraversalIsReady(int direction) => TraversalArms[direction] % 4 == TraversalReady;

    internal void FinishTraversalArm(int direction)
    {
        ValidateFrozenTraversal();
        if (direction is < 0 or > 3 || !TraversalIsReady(direction))
            throw TraversalFailure("pending or finished arm cannot be silently finished");
        TraversalArms[direction] = PackTraversal(TraversalArms[direction] / 4, TraversalFinished);
    }

    internal void PreflightChestContactCohort(BomberSourceIdentity expected,
        IReadOnlyList<NetEntityId> writes, IReadOnlyList<NetEntityId> observed)
    {
        RequireIdentity(expected.Participant, expected.Life, expected.LifeGeneration);
        ValidateStorage();
        if (Owner.Value != expected.Participant || SourceLife.Value != expected.Life ||
            SourceLifeGeneration.Value != expected.LifeGeneration)
            throw TraversalFailure("chest contact cohort differs from its exact source");
        var distinct = new HashSet<NetEntityId>();
        foreach (var chest in writes)
        {
            RequireLocal(chest);
            if (!distinct.Add(chest))
                throw TraversalFailure("chest contact cohort repeats a full identity");
            for (int i = 0; i < ContactedChests.Count; i++)
                if (ContactedChests[i] == chest)
                    throw TraversalFailure("new chest contact was already observed");
        }
        int additional = distinct.Count;
        foreach (var chest in observed)
        {
            RequireLocal(chest);
            if (!distinct.Add(chest))
                throw TraversalFailure("chest contact cohort repeats a full identity");
            bool found = false;
            for (int i = 0; i < ContactedChests.Count; i++)
                if (ContactedChests[i] == chest) { found = true; break; }
            if (!found)
                throw TraversalFailure("terminal transfer lost its already observed chest");
        }
        // Already-observed strong terminal rows transfer the same identity without
        // spending another slot. Every future unobserved identity owns one slot.
        if ((long)ContactedChests.Count + additional > ChestContactLimit())
            throw TraversalFailure("chest contact cohort exceeds the actual per-bomb contact capacity");
    }


    // Only whole-cohort preflighted callers publish these writes. They perform no
    // fresh rule admission after hit accounting or accepted Native mutation.
    internal void CommitTraversalProgress(int direction, int packed) => TraversalArms[direction] = packed;
    internal BomberStorageAdmission CommitPreparedChestContact(NetEntityId chest)
    {
        ContactedChests.Add(chest);
        return BomberStorageAdmission.Added;
    }

    internal int PackTraversal(int distance, int state) => checked(distance * 4 + state);

    internal int TraversalDistance(int x, int z, int direction)
    {
        if (TraversalPower.Value < 0) throw TraversalFailure("cursor has no frozen explosion geometry");
        long distance = direction switch
        {
            0 when x == TraversalOriginX.Value => (long)TraversalOriginZ.Value - z,
            1 when z == TraversalOriginZ.Value => (long)x - TraversalOriginX.Value,
            2 when x == TraversalOriginX.Value => (long)z - TraversalOriginZ.Value,
            3 when z == TraversalOriginZ.Value => (long)TraversalOriginX.Value - x,
            _ => -1,
        };
        if (distance < 0 || distance > TraversalMaximum(direction))
            throw TraversalFailure("continuation cursor is off its frozen directional ray");
        return checked((int)distance);
    }

    private int TraversalMaximum(int direction)
    {
        var map = BomberConfigBinding.For(World).Map;
        long available = direction switch
        {
            0 => (long)TraversalOriginZ.Value - map.BoundaryCells,
            1 => (long)map.Width - map.BoundaryCells - 1 - TraversalOriginX.Value,
            2 => (long)map.Depth - map.BoundaryCells - 1 - TraversalOriginZ.Value,
            3 => (long)TraversalOriginX.Value - map.BoundaryCells,
            _ => throw TraversalFailure("direction is outside the actual four arms"),
        };
        return checked((int)Math.Min((long)TraversalPower.Value, available));
    }

    private static InvalidOperationException TraversalFailure(string message) =>
        new("Bomb terrain traversal " + message + ".");
}
