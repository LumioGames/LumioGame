using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberChestState
{
    public void InitializeTier(uint tierId, ulong generation)
    {
        var tier = BomberConfigBinding.For(World).Tables.Chest.Rows.Single(row => row.Id == tierId);
        if (tier.Name is not ("Wood" or "Iron" or "Gold") || generation == 0 || HitBombs.Count != 0 ||
            HasPendingTransaction.Value || ResourceTier.Value != 0 || RequiredHits.Value != 0)
            throw new InvalidOperationException("Resource chest must initialize once from a configured tier.");
        ResourceTier.Value = tierId; ResourceGeneration.Value = generation;
        RequiredHits.Value = RemainingHits.Value = tier.IndependentBombHits;
    }
    public void InitializeHitBudget()
    {
        int required = BomberConfigBinding.For(World).ObjectBudgets.ChestHitLimit;
        if (HitBombs.Count != 0 || HasPendingTransaction.Value || PendingTransactionId.Value != "" ||
            PendingMatchId.Value != 0 || PendingSubmittedTick.Value != 0)
            throw new InvalidOperationException($"Chest {Entity} cannot reset nonempty hit or pending memory.");
        if ((RequiredHits.Value != 0 || RemainingHits.Value != 0) &&
            (RequiredHits.Value != required || RemainingHits.Value != required))
            throw new InvalidOperationException($"Chest {Entity} has an inconsistent initial hit budget.");
        RequiredHits.Value = required;
        RemainingHits.Value = required;
    }

    public BomberStorageAdmission TryCountBomb(NetEntityId bomb)
    {
        var admission = InspectBomb(bomb);
        if (admission != BomberStorageAdmission.Added) return admission;
        HitBombs.Add(bomb);
        RemainingHits.Value = RequiredHits.Value - HitBombs.Count;
        return BomberStorageAdmission.Added;
    }

    public BomberStorageAdmission InspectBomb(NetEntityId bomb)
    {
        RequireLocal(bomb);
        ValidateStorage();
        for (int i = 0; i < HitBombs.Count; i++)
            if (HitBombs[i] == bomb) return BomberStorageAdmission.Duplicate;
        if (HasPendingTransaction.Value || HitBombs.Count >= RequiredHits.Value)
            return BomberStorageAdmission.CapacityExceeded;
        return BomberStorageAdmission.Added;
    }

    public bool TrySetPending(BomberChestPendingReference pending)
    {
        RequirePending(pending);
        ValidateStorage();
        if (RemainingHits.Value is not (0 or 1))
            throw new InvalidOperationException($"Chest {Entity} must have a terminal hit before recording a transaction.");
        if (HasPendingTransaction.Value) return PendingMatches(pending);
        PendingTransactionId.Value = pending.TransactionId;
        PendingMatchId.Value = pending.MatchId;
        PendingSubmittedTick.Value = pending.SubmittedTick;
        HasPendingTransaction.Value = true;
        return true;
    }

    public bool PendingMatches(BomberChestPendingReference expected)
    {
        ValidateStorage();
        return HasPendingTransaction.Value &&
            StringComparer.Ordinal.Equals(PendingTransactionId.Value, expected.TransactionId) &&
            PendingMatchId.Value == expected.MatchId && PendingSubmittedTick.Value == expected.SubmittedTick;
    }

    public bool TryClearPending(BomberChestPendingReference expected)
    {
        if (!PendingMatches(expected)) return false;
        PendingTransactionId.Value = "";
        PendingMatchId.Value = 0;
        PendingSubmittedTick.Value = 0;
        HasPendingTransaction.Value = false;
        return true;
    }

    protected override void OnHydrate() => ValidateStorage();

    public void ValidateStorage()
    {
        BomberInitialResources.ValidateChest(World, this);
        int required = ResourceTier.Value == 0 ? BomberConfigBinding.For(World).ObjectBudgets.ChestHitLimit
            : BomberConfigBinding.For(World).Tables.Chest.Rows.Single(row => row.Id == ResourceTier.Value &&
                row.Name is "Wood" or "Iron" or "Gold").IndependentBombHits;
        if ((ResourceTier.Value == 0) != (ResourceGeneration.Value == 0) || RequiredHits.Value != required || HitBombs.Count > required ||
            RemainingHits.Value != required - HitBombs.Count)
            throw new InvalidOperationException($"Chest {Entity} hit budget disagrees with configuration or counted bombs.");
        for (int i = 0; i < HitBombs.Count; i++)
        {
            RequireLocal(HitBombs[i]);
            for (int j = 0; j < i; j++)
                if (HitBombs[j] == HitBombs[i])
                    throw new InvalidOperationException($"Chest {Entity} has duplicate counted bomb at row {i}.");
        }
        if (HasPendingTransaction.Value)
        {
            RequirePending(new(PendingTransactionId.Value, PendingMatchId.Value, PendingSubmittedTick.Value));
            if (RemainingHits.Value is not (0 or 1))
                throw new InvalidOperationException($"Chest {Entity} has pending transaction before its terminal hit.");
        }
        else if (PendingTransactionId.Value != "" || PendingMatchId.Value != 0 || PendingSubmittedTick.Value != 0)
            throw new InvalidOperationException($"Chest {Entity} has a partial inactive pending reference.");
    }

    private void RequirePending(BomberChestPendingReference pending)
    {
        if (string.IsNullOrEmpty(pending.TransactionId) || pending.MatchId == 0 || pending.SubmittedTick > World.Tick ||
            System.Text.Encoding.UTF8.GetByteCount(pending.TransactionId) > World.Manager.IngressBudget.MaxBytes)
            throw new InvalidOperationException($"Chest {Entity} requires a nonempty opaque transaction and nonzero match.");
    }

    private void RequireLocal(NetEntityId id)
    {
        if (id.Counter == 0 || id.InstanceId != Entity.InstanceId)
            throw new InvalidOperationException($"Chest {Entity} requires a nonzero full bomb identity in its world: {id}.");
    }
}
