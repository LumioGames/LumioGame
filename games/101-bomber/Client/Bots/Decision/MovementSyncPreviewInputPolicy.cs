using System;

namespace Lumio.Bomber.Bots;

internal readonly record struct MovementSyncPreviewIdentity(string Room, string World, ulong ConnectionGeneration,
    ulong Match, string Participant, string Life, ulong LifeGeneration);

internal readonly record struct MovementSyncPreviewMove(int Direction, bool Turn);

internal sealed class MovementSyncPreviewInputPolicy
{
    private readonly int botIndex;
    private MovementSyncPreviewIdentity? identity;
    private ulong? firstMoveTick;
    private ulong? lastMoveTick;
    private ulong? lastSelectionAttemptTick;
    private int? acceptedDirection;
    private int? pendingDirection;

    internal MovementSyncPreviewInputPolicy(int botIndex)
    {
        if ((uint)botIndex >= 6) throw new ArgumentOutOfRangeException(nameof(botIndex));
        this.botIndex = botIndex;
    }

    internal static int DirectionFor(ulong elapsedAuthorityTicks, int botIndex)
    {
        if ((uint)botIndex >= 6) throw new ArgumentOutOfRangeException(nameof(botIndex));
        return 1 + (int)((elapsedAuthorityTicks / 40 + (ulong)botIndex) % 4);
    }

    internal void Retire()
    {
        identity = null;
        firstMoveTick = null;
        lastMoveTick = null;
        lastSelectionAttemptTick = null;
        acceptedDirection = null;
        pendingDirection = null;
    }

    internal bool ShouldSelect(MovementSyncPreviewIdentity current, ulong authorityTick)
    {
        Bind(current);
        if (lastSelectionAttemptTick is { } last && authorityTick <= last) return false;
        lastSelectionAttemptTick = authorityTick;
        return true;
    }

    internal void EnterSelectionPhase(MovementSyncPreviewIdentity current)
    {
        Bind(current);
        firstMoveTick = null;
        lastMoveTick = null;
        acceptedDirection = null;
        pendingDirection = null;
    }

    internal MovementSyncPreviewMove? NextMove(MovementSyncPreviewIdentity current, ulong authorityTick)
    {
        Bind(current);
        if (lastMoveTick is { } last && authorityTick <= last) return null;
        firstMoveTick ??= authorityTick;
        lastMoveTick = authorityTick;
        int direction = DirectionFor(authorityTick - firstMoveTick.Value, botIndex);
        pendingDirection = direction;
        return new(direction, acceptedDirection != direction);
    }

    internal void RecordMove(bool accepted, int direction)
    {
        if (pendingDirection != direction) throw new InvalidOperationException("Only the pending movement decision may be recorded.");
        pendingDirection = null;
        if (accepted) acceptedDirection = direction;
    }

    private void Bind(MovementSyncPreviewIdentity current)
    {
        if (identity == current) return;
        Retire();
        identity = current;
    }
}
