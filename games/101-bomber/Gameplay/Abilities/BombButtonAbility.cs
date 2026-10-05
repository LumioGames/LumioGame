using System.Collections.Generic;
using System.Globalization;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

/// <summary>Begins or continues a bomb-button gesture using authority ticks.</summary>
[AbilityType(6u, Prediction = PredictionKind.AuthorityOnly)]
public sealed class BombButtonAbility : AbilityType<BombButtonAbility.Input>
{
    public const uint TypeId = 6u;
    public struct Input : IAbilityInput
    {
        public int Phase;
        public void Write(IList<object?> args) => args.Add(Phase.ToString(CultureInfo.InvariantCulture));
        public bool TryRead(IReadOnlyList<object?> args, int start) =>
            args is not null && start >= 0 && args.Count - start == 1 &&
            int.TryParse(args[start]?.ToString(), NumberStyles.None, CultureInfo.InvariantCulture, out Phase) &&
            Phase is 1 or 2;
    }

    public override bool CanActivate(in Input input, AbilityComponent owner, out string? failureCode)
    {
        if (input.Phase is not (1 or 2)) { failureCode = "bomb_button_phase_invalid"; return false; }
        return BomberBombButton.CanPress(owner, out failureCode);
    }

    public override void Execute(in Input input, AbilityComponent owner)
    {
        if (CanActivate(input, owner, out _)) BomberBombButton.Process(owner, input.Phase);
    }
}
