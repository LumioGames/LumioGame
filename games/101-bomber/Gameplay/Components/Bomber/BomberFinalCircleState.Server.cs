using System;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberFinalCircleState
{
    internal bool ClearCompleted(int ordinal) => (ClearedStageMask.Value & Mask(ordinal)) != 0;
    internal void CompleteClear(int ordinal) => ClearedStageMask.Value |= Mask(ordinal);
    internal void ResetClear()
    {
        ClearedStageMask.Value = 0;
        ChestIssuedStageMask.Value = ChestUnavailableStageMask.Value = 0;
    }
    private static uint Mask(int ordinal) => ordinal is >= 0 and < 32 ? 1u << ordinal :
        throw new InvalidOperationException("Circle clear ordinal exceeds its declared bound.");
}
