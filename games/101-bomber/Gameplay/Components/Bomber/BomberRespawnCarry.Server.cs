using System;
using System.Linq;
using System.Collections.Generic;
using Lumio.Bomber.Gameplay.Config;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberRespawnCarry
{
    protected override void OnHydrate()
    {
        IBomberConfig config = BomberConfigBinding.For(World);
        BomberDeathDebt current = BomberDeathDebt.Read(this);
        current.Validate(World, deferred: false);
        var identities = new HashSet<(ulong, string, ulong, ulong)> { (current.Match, current.Life, current.Generation, current.Occurred) };
        int pending = current.Pending;
        for (int i = 0; i < DeferredDeathDebts.Count; i++)
        {
            BomberDeathDebt debt = BomberDeathDebt.Decode(DeferredDeathDebts[i]);
            debt.Validate(World, deferred: true);
            if (!identities.Add((debt.Match, debt.Life, debt.Generation, debt.Occurred)))
                throw new InvalidOperationException("Duplicate original death wealth identity.");
            pending = checked(pending + debt.Pending);
        }
        if (pending > config.ObjectBudgets.PickupCapacity)
            throw new InvalidOperationException("Pending death wealth exceeds the shared pickup capacity.");
    }
}
