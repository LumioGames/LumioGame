using System;
using Lumio.Client.Gameplay.Session;

namespace Lumio.Bomber.Client.Spectator;

public sealed record BomberPlayerStepOptions(bool TraceEnabled = false,
    int MaxStepsPerPump = 5, int MaxDeltaMs = 250)
{
    internal static void ValidateCatchUp(int maxSteps, int maxDeltaMs)
    {
        if (maxSteps is < 1 or > 64) throw new ArgumentOutOfRangeException(nameof(maxSteps));
        if (maxDeltaMs is < 1 or > 3200) throw new ArgumentOutOfRangeException(nameof(maxDeltaMs));
    }

    internal ClientPredictionStepOptions CreatePredictionSteps(Action<ClientPredictionStepContext> beforeStep)
    {
        ValidateCatchUp(MaxStepsPerPump, MaxDeltaMs);
        return new ClientPredictionStepOptions(beforeStep, MaxStepsPerPump, TimeSpan.FromMilliseconds(MaxDeltaMs));
    }
}
