using System;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberSkillState
{
    protected override void OnHydrate()
    {
        if (AuraOutcome.Value is < 0 or > 6 || (AuraOutcome.Value != 0 &&
            (AuraEffectWorld.Value == 0 || AuraEffectInstance.Value == 0 || AuraEffectGeneration.Value == 0 ||
                AuraDurationTicks.Value == 0 || AuraCooldownTicks.Value == 0 || AuraChainId.Value == 0)))
            throw new InvalidOperationException("Aura request has malformed exact correlation.");
        BomberFireExposure.ValidateExposure(World, this);
    }
}
