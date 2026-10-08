using System.Collections.Generic;
using System.Globalization;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

/// <summary>A separate GAS type preserves an end/cancel edge in the same tick as begin.</summary>
[AbilityType(7u, Prediction = PredictionKind.AuthorityOnly)]
public sealed class BombButtonReleaseAbility : AbilityType<BombButtonReleaseAbility.Input>
{
    public const uint TypeId = 7u;
    public struct Input : IAbilityInput
    {
        public int Phase;
        public void Write(IList<object?> args) => args.Add(Phase.ToString(CultureInfo.InvariantCulture));
        public bool TryRead(IReadOnlyList<object?> args, int start) =>
            args is not null && start >= 0 && args.Count - start == 1 &&
            int.TryParse(args[start]?.ToString(), NumberStyles.None, CultureInfo.InvariantCulture, out Phase) &&
            Phase is 3 or 4;
    }

    public override bool CanActivate(in Input input, AbilityComponent owner, out string? failureCode)
    {
        failureCode = null;
        if (input.Phase is not (3 or 4)) { failureCode = "bomb_button_phase_invalid"; return false; }
        if (owner is null || !owner.World.IsLive(owner.Entity))
        { failureCode = "ability_owner_missing"; return false; }
        // End still rechecks all gameplay eligibility in the authority handler.
        // Cancel must be able to clear a gesture after its original eligibility closed.
        return true;
    }

    public override void Execute(in Input input, AbilityComponent owner)
    {
        if (CanActivate(input, owner, out _)) BomberBombButton.Process(owner, input.Phase);
    }
}
