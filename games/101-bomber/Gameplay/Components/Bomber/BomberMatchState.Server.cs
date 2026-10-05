using Microsoft.Extensions.Logging;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberMatchState
{
    internal void EmitGameplayLog(string message) => Log.LogInformation("{Message}", message);
}
