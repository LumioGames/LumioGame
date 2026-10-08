using System;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberParticipantState
{
    protected override void OnHydrate() => BomberFrenzy.ValidateParticipant(World, this);

    public void Validate(int configuredPlayerCount)
    {
        if (TerminalBaseSample.Count != TerminalCurrentSample.Count || TerminalBaseSample.Count > 1)
            throw new InvalidOperationException("Terminal sample columns disagree.");
        if (TerminalBaseSample.Count == 1 && (TerminalLife.Value.IsDefault || TerminalGeneration.Value == 0 ||
            TerminalMatchId.Value == 0 || TerminalCaptureTick.Value <= TerminalOccurrenceTick.Value ||
            TerminalDestructionTick.Value != TerminalCaptureTick.Value || DeathConsumedCount.Value == 0))
            throw new InvalidOperationException("Terminal observation must identify a consumed historical life.");
        if (configuredPlayerCount <= 0 || Slot.Value < 0 || Slot.Value >= configuredPlayerCount)
            throw new InvalidOperationException("Participant slot is outside configured player count.");
        if (LifeGeneration.Value == 0)
        {
            if (!CurrentLife.Value.IsDefault || !LastLife.Value.IsDefault || DeathStructurePending.Value)
                throw new InvalidOperationException("An unseeded participant cannot own a life or pending death.");
        }
        else if (LastLife.Value.IsDefault)
            throw new InvalidOperationException("A participant life generation requires its full last life identity.");
        if ((!LastLife.Value.IsDefault && LastLife.Value.InstanceId != Entity.InstanceId) ||
            (!CurrentLife.Value.IsDefault && (CurrentLife.Value.InstanceId != Entity.InstanceId ||
                CurrentLife.Value != LastLife.Value)))
            throw new InvalidOperationException("Participant life identity must remain in its world and generation.");
        if (DeathStructurePending.Value &&
            (DeathStructureLife.Value.IsDefault || DeathStructureLife.Value != LastLife.Value ||
             DeathStructureGeneration.Value != LifeGeneration.Value || DeathStructureTick.Value == 0))
            throw new InvalidOperationException("Pending death does not identify the current life generation.");
    }

    public ulong NextLifeGeneration() => checked(LifeGeneration.Value + 1);
}
