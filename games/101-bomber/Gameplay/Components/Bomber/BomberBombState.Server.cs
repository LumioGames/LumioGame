using System;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberBombState
{
    protected override void Awake()
    {
        BomberBombAdmissions.ObservePublished(World, Entity);
        BomberSplitBombs.ObservePublished(World, this);
        BomberBarrelBombPromises.ObservePublished(World, this);
        BomberFrenzy.ObservePublished(World, this);
    }

    public void SetSource(BomberSourceIdentity source)
    {
        RequireIdentity(source.Participant, source.Life, source.LifeGeneration);
        ValidateStorage();
        if (!Owner.Value.IsDefault)
        {
            if (ReadSource() != source)
                throw new InvalidOperationException($"Bomb {Entity} source cannot be reassigned.");
            return;
        }
        Owner.Value = source.Participant;
        SourceLife.Value = source.Life;
        SourceLifeGeneration.Value = source.LifeGeneration;
    }

    public BomberSourceIdentity ReadSource()
    {
        ValidateStorage();
        return new(Owner.Value, SourceLife.Value, SourceLifeGeneration.Value);
    }

    public BomberStorageAdmission TryReserveHit(BomberTargetIdentity target)
    {
        RequireIdentity(target.Participant, target.Life, target.LifeGeneration);
        ValidateStorage();
        if (FindHit(target.Participant) >= 0) return BomberStorageAdmission.Duplicate;
        if (HitParticipants.Count >= BomberConfigBinding.For(World).ObjectBudgets.ParticipantLimit)
            return BomberStorageAdmission.CapacityExceeded;
        HitParticipants.Add(target.Participant);
        HitLives.Add(target.Life);
        HitLifeGenerations.Add(target.LifeGeneration);
        HitStates.Add((int)BomberHitStorageState.Pending);
        HitHandleWorlds.Add(0);
        HitHandleInstances.Add(0);
        HitHandleGenerations.Add(0);
        HitDependentsAdmitted.Add(false);
        World.Get<BomberDamageFacts>(Entity).Reserve();
        return BomberStorageAdmission.Added;
    }

    public bool TryReadHit(NetEntityId participant, out BomberTargetIdentity target,
        out BomberHitStorageState state)
    {
        RequireLocal(participant);
        ValidateStorage();
        int index = FindHit(participant);
        target = index >= 0 ? TargetAt(index) : default;
        state = index >= 0 ? (BomberHitStorageState)HitStates[index] : default;
        return index >= 0;
    }

    public bool CommitContact(BomberTargetIdentity expected)
    {
        int index = FindPending(expected);
        if (index < 0) return false;
        HitStates[index] = (int)BomberHitStorageState.ContactApplied;
        return true;
    }

    public bool ReleaseRejectedHit(BomberTargetIdentity expected)
    {
        int index = FindPending(expected);
        if (index < 0) return false;
        HitParticipants.RemoveAt(index);
        HitLives.RemoveAt(index);
        HitLifeGenerations.RemoveAt(index);
        HitStates.RemoveAt(index);
        HitHandleWorlds.RemoveAt(index);
        HitHandleInstances.RemoveAt(index);
        HitHandleGenerations.RemoveAt(index);
        HitDependentsAdmitted.RemoveAt(index);
        World.Get<BomberDamageFacts>(Entity).Remove(index);
        return true;
    }

    public BomberStorageAdmission TryObserveChest(NetEntityId chest)
    {
        if (TraversalPower.Value != -1 || ExplodedAtTick.Value != 0)
            throw TraversalFailure("geometry-free chest admission is only valid before explosion");
        var admission = InspectChest(chest);
        if (admission != BomberStorageAdmission.Added) return admission;
        ContactedChests.Add(chest);
        return BomberStorageAdmission.Added;
    }

    public BomberStorageAdmission InspectChest(NetEntityId chest)
    {
        RequireLocal(chest);
        ValidateStorage();
        for (int i = 0; i < ContactedChests.Count; i++)
            if (ContactedChests[i] == chest) return BomberStorageAdmission.Duplicate;
        if (ContactedChests.Count >= ChestContactLimit())
            return BomberStorageAdmission.CapacityExceeded;
        return BomberStorageAdmission.Added;
    }

    private int ChestContactLimit()
    {
        int actual = ContactedChests.MaxCapacity;
        int authored = BomberConfigBinding.For(World).ObjectBudgets.PerBombContactLimit;
        if (authored != actual || actual < 0)
            throw new InvalidOperationException("Bomb contact budget differs from its actual declaration capacity.");
        return actual;
    }

    protected override void OnHydrate() => ValidateStorage();

    public void ValidateStorage()
    {
        BomberFrenzy.ValidateBomb(World, this);
        ValidateFrozenTraversal();
        var budgets = BomberConfigBinding.For(World).ObjectBudgets;
        if (Owner.Value != default || SourceLife.Value != default || SourceLifeGeneration.Value != 0)
            RequireIdentity(Owner.Value, SourceLife.Value, SourceLifeGeneration.Value);
        if (!HitFamily.Value.IsDefault) RequireLocal(HitFamily.Value);
        if (FutureChildren.Value is < 0 or > 4 || ChildDirection.Value is < 0 or > 4 ||
            (SplitSubmittedMask.Value & ~15) != 0 || (SplitResolvedMask.Value & ~15) != 0 ||
            System.Text.Encoding.UTF8.GetByteCount(PromiseToken.Value ?? "") > 128)
            throw new InvalidOperationException("Bomb future obligations exceed their fixed storage.");
        if (BombKind.Value == (int)BomberBombKind.ReservedSplit && ChildDirection.Value == 0)
        {
            int resolved = System.Numerics.BitOperations.PopCount(checked((uint)SplitResolvedMask.Value));
            if (FutureChildren.Value != 4 - resolved)
                throw new InvalidOperationException("Split future credits differ from its resolved arms.");
        }
        else if (FutureChildren.Value != 0 || SplitSubmittedMask.Value != 0 || SplitResolvedMask.Value != 0)
            throw new InvalidOperationException("Only a Split mother can own future child credits.");
        if (ChildDirection.Value != 0 && (HitFamily.Value.IsDefault || BombKind.Value != (int)BomberBombKind.Standard ||
            Power.Value != 1 || !CapacityReturned.Value))
            throw new InvalidOperationException("Split child changed its source family or inventory rules.");
        var directions = new System.Collections.Generic.HashSet<int>();
        if (TerrainContinuations.Count > 4) throw new InvalidOperationException("Bomb has more than four terrain arms.");
        for (int i = 0; i < TerrainContinuations.Count; i++)
        {
            var ray = BomberTerrainTransactions.Decode<BomberTerrainContinuation>(TerrainContinuations[i]);
            if (ray.Direction is < 0 or > 3 || !directions.Add(ray.Direction) || ray.Remaining < 0 ||
                ray.Remaining > Power.Value || ray.Occurred != ExplodedAtTick.Value ||
                ray.Family != BomberTerrainTransactions.Family(this).ToHex() ||
                ray.X < 0 || ray.X >= BomberConfigBinding.For(World).Map.Width ||
                ray.Z < 0 || ray.Z >= BomberConfigBinding.For(World).Map.Depth)
                throw new InvalidOperationException("Bomb terrain continuation has invalid original provenance.");
            RequireIdentity(Owner.Value, SourceLife.Value, SourceLifeGeneration.Value);
            RequireTraversalContinuation(ray);
            if (ray.Unstarted)
            {
                var origin = World.Get<LogicTransform>(Entity).LocalPosition;
                if (ray.X != BomberMatchRules.CellX(origin) || ray.Z != BomberMatchRules.CellZ(origin) ||
                    ray.Remaining != Power.Value)
                    throw new InvalidOperationException("Unstarted arm differs from its original bomb.");
            }
            else
                ValidateTerrainFrontier(ray.X, ray.Z, ray.Direction, ray.Remaining);
        }
        int count = HitParticipants.Count;
        if (count > budgets.ParticipantLimit || HitLives.Count != count ||
            HitLifeGenerations.Count != count || HitStates.Count != count)
            throw new InvalidOperationException($"Bomb {Entity} hit columns disagree or exceed participant capacity.");
        if (HitHandleWorlds.Count != count || HitHandleInstances.Count != count || HitHandleGenerations.Count != count || HitDependentsAdmitted.Count != count)
            throw new InvalidOperationException("Bomb handle columns disagree.");
        World.Get<BomberDamageFacts>(Entity).Validate(count);
        for (int i = 0; i < count; i++)
        {
            RequireIdentity(HitParticipants[i], HitLives[i], HitLifeGenerations[i]);
            if (HitStates[i] != (int)BomberHitStorageState.Pending &&
                HitStates[i] != (int)BomberHitStorageState.ContactApplied)
                throw new InvalidOperationException($"Bomb {Entity} hit row {i} has invalid state.");
            for (int j = 0; j < i; j++)
                if (HitParticipants[j] == HitParticipants[i])
                    throw new InvalidOperationException($"Bomb {Entity} has duplicate hit participant at row {i}.");
        }
        if (ContactedChests.Count > ChestContactLimit())
            throw new InvalidOperationException($"Bomb {Entity} exceeds chest contact capacity.");
        for (int i = 0; i < ContactedChests.Count; i++)
        {
            RequireLocal(ContactedChests[i]);
            for (int j = 0; j < i; j++)
                if (ContactedChests[j] == ContactedChests[i])
                    throw new InvalidOperationException($"Bomb {Entity} has duplicate chest contact at row {i}.");
        }
    }

    internal void ValidateTerrainFrontier(int x, int z, int direction, int remaining)
    {
        var origin = World.Get<LogicTransform>(Entity).LocalPosition;
        int originX = BomberMatchRules.CellX(origin), originZ = BomberMatchRules.CellZ(origin);
        long distance = direction switch
        {
            0 when x == originX => (long)originZ - z,
            1 when z == originZ => (long)x - originX,
            2 when x == originX => (long)z - originZ,
            3 when z == originZ => (long)originX - x,
            _ => -1,
        };
        if (distance <= 0 || distance > Power.Value ||
            (PierceLayers.Value > 0 ? distance + remaining != Power.Value : remaining != 0))
            throw new InvalidOperationException("Bomb terrain continuation differs from its original ray.");
    }

    private int FindPending(BomberTargetIdentity expected)
    {
        RequireIdentity(expected.Participant, expected.Life, expected.LifeGeneration);
        ValidateStorage();
        int index = FindHit(expected.Participant);
        return index >= 0 && TargetAt(index) == expected &&
            HitStates[index] == (int)BomberHitStorageState.Pending ? index : -1;
    }

    private int FindHit(NetEntityId participant)
    {
        for (int i = 0; i < HitParticipants.Count; i++)
            if (HitParticipants[i] == participant) return i;
        return -1;
    }

    private BomberTargetIdentity TargetAt(int index) =>
        new(HitParticipants[index], HitLives[index], HitLifeGenerations[index]);

    private void RequireIdentity(NetEntityId participant, NetEntityId life, ulong generation)
    {
        RequireLocal(participant);
        RequireLocal(life);
        if (generation == 0)
            throw new InvalidOperationException($"Bomb {Entity} requires a positive life generation.");
    }

    private void RequireLocal(NetEntityId id)
    {
        // Historical lives may already be destroyed; only identity locality is required.
        if (id.Counter == 0 || id.InstanceId != Entity.InstanceId)
            throw new InvalidOperationException($"Bomb {Entity} requires a nonzero full identity in its world: {id}.");
    }
}
