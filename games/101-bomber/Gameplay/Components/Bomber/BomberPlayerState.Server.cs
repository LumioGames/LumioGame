using System;
using Lumio.Bomber.Gameplay.Config;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberPlayerState
{
    protected override void OnHydrate()
    {
        if (GoldenHeartCount.Value < 0 || GoldenHeartCount.Value > BomberGrowth.MaximumGoldenHearts || HatCount.Value < 0 ||
            HatCount.Value > BomberConfigBinding.For(World).ObjectBudgets.DeathOutputLimit - 4)
            throw new InvalidOperationException("Player growth holdings exceed configured bounds.");
        if (MaximumHealth.Value != 0 && MaximumHealth.Value != BomberGrowth.MaximumHealth(HatCount.Value, GoldenHeartCount.Value))
            throw new InvalidOperationException("Player maximum health disagrees with confirmed growth.");
        if (!Participant.Value.IsDefault && (Participant.Value.InstanceId != Entity.InstanceId || LifeGeneration.Value == 0 || MaximumHealth.Value == 0))
            throw new InvalidOperationException("Player growth requires its full local life identity.");
    }
}
