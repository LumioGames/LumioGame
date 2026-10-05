using System;
using Lumio.Bomber.Gameplay.Config;
namespace Lumio.Bomber.Gameplay.Contracts.Components;
public sealed partial class BomberHealthFacts
{
    protected override void OnHydrate()
    {
        int count = TypeId.Count;
        if (count > 1 || HandleWorld.Count != count || HandleInstance.Count != count || HandleGeneration.Count != count || Target.Count != count || Source.Count != count || Tick.Count != count || MatchId.Count != count || Participant.Count != count || Generation.Count != count || Intent.Count != count || Before.Count != count || After.Count != count || Actual.Count != count || Ready.Count != count || Status.Count != count || Item.Count != count || Kind.Count != count || MaximumBefore.Count != count || MaximumAfter.Count != count || GoldBefore.Count != count || GoldAfter.Count != count || HatsAfter.Count != count || UpgradeBefore.Count != count || UpgradeAfter.Count != count)
            throw new InvalidOperationException("Health fact columns must agree within the single pending slot.");
        if (count == 1 && (Status[0] < 0 || Status[0] > 2 || (Status[0] == 1 && !Ready[0])))
            throw new InvalidOperationException("Health fact has invalid settlement status.");
        if (count == 1 && TypeId[0] != 0)
        {
            if (TypeId[0] is not (10102u or 10103u or 10104u) || HandleWorld[0] == 0 || HandleInstance[0] == 0 || HandleGeneration[0] == 0 ||
                Target[0] != Entity || Source[0] != Entity || Participant[0].IsDefault || Participant[0].InstanceId != Entity.InstanceId ||
                Generation[0] == 0 || MatchId[0] == 0 || GoldBefore[0] < 0 || GoldBefore[0] > 3 || GoldAfter[0] < 0 || GoldAfter[0] > 3 ||
                HatsAfter[0] < 0 || HatsAfter[0] > BomberConfigBinding.For(World).ObjectBudgets.DeathOutputLimit - 4 ||
                MaximumBefore[0] < 6 || MaximumBefore[0] > 16 || MaximumBefore[0] % 2 != 0 ||
                MaximumAfter[0] != BomberGrowth.MaximumHealth(HatsAfter[0], GoldAfter[0]) ||
                (!Item[0].IsDefault && (Item[0].InstanceId != Entity.InstanceId || Kind[0] is < 0 or > 7 or 4 or 6)) ||
                (Item[0].IsDefault && Kind[0] != (TypeId[0] == 10104u ? -2 : -1)))
                throw new InvalidOperationException("Health fact has malformed growth identity or holdings.");
            int hatsBefore = HatsAfter[0] - (Kind[0] is >= 0 and <= 2 ? 1 : 0);
            if (TypeId[0] == 10104u)
            {
                if (MaximumAfter[0] != 6 || GoldAfter[0] != 0 || HatsAfter[0] != 0 || !Item[0].IsDefault || Kind[0] != -2)
                    throw new InvalidOperationException("New match restoration did not reset its growth holdings.");
            }
            else if (hatsBefore < 0 || MaximumBefore[0] != BomberGrowth.MaximumHealth(hatsBefore, GoldBefore[0]) ||
                GoldAfter[0] != GoldBefore[0] + (Kind[0] == 5 ? 1 : 0) ||
                (Kind[0] is >= 0 and <= 2 && (UpgradeBefore[0] < 0 || UpgradeAfter[0] != checked(UpgradeBefore[0] + 1))) ||
                (TypeId[0] == 10103u && (!Item[0].IsDefault || Kind[0] != -1)))
                throw new InvalidOperationException("Health fact growth transition is not conserved.");
            if (Ready[0] && (After[0] < 0 || After[0] > MaximumAfter[0] || Actual[0] != After[0] - Before[0]))
                throw new InvalidOperationException("Health fact has invalid settled amounts.");
        }
    }
}
