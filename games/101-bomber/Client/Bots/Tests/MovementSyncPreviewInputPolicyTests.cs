using System;
using Xunit;

namespace Lumio.Bomber.Bots;

public sealed class MovementSyncPreviewInputPolicyTests
{
    [Theory]
    [InlineData(0UL, 1)]
    [InlineData(39UL, 1)]
    [InlineData(40UL, 2)]
    [InlineData(80UL, 3)]
    [InlineData(120UL, 4)]
    [InlineData(160UL, 1)]
    public void DirectionRotatesEveryFortyConfirmedTicks(ulong elapsed, int direction)
        => Assert.Equal(direction, MovementSyncPreviewInputPolicy.DirectionFor(elapsed, 0));

    [Fact]
    public void BotIndexOffsetsDirectionAndInvalidIndexFails()
    {
        Assert.Equal(2, MovementSyncPreviewInputPolicy.DirectionFor(0, 5));
        Assert.Throws<ArgumentOutOfRangeException>(() => MovementSyncPreviewInputPolicy.DirectionFor(0, -1));
        Assert.Throws<ArgumentOutOfRangeException>(() => MovementSyncPreviewInputPolicy.DirectionFor(0, 6));
    }

    [Fact]
    public void NewAuthorityProgressIssuesOnceAndGapNeverCatchesUp()
    {
        var policy = new MovementSyncPreviewInputPolicy(0);
        var identity = new MovementSyncPreviewIdentity("room", "world", 1, 2, "participant", "life", 3);
        Assert.Equal(1, policy.NextMove(identity, 10)?.Direction);
        policy.RecordMove(false, 1);
        Assert.Null(policy.NextMove(identity, 10));
        Assert.Null(policy.NextMove(identity, 9));
        Assert.Equal(1, policy.NextMove(identity, 1000)?.Direction);
        Assert.Null(policy.NextMove(identity, 1000));
    }

    [Fact]
    public void RefusedMoveDoesNotBecomeAcceptedDirectionOrRetrySameObservation()
    {
        var policy = new MovementSyncPreviewInputPolicy(0);
        var identity = new MovementSyncPreviewIdentity("room", "world", 1, 2, "participant", "life", 3);
        Assert.True(policy.NextMove(identity, 10)?.Turn);
        policy.RecordMove(false, 1);
        Assert.Null(policy.NextMove(identity, 10));
        Assert.True(policy.NextMove(identity, 11)?.Turn);
        policy.RecordMove(true, 1);
        Assert.False(policy.NextMove(identity, 12)?.Turn);
    }

    [Fact]
    public void ReplacingIdentityRetiresDirectionAndStartsNewProgressOrigin()
    {
        var policy = new MovementSyncPreviewInputPolicy(0);
        var first = new MovementSyncPreviewIdentity("room", "world", 1, 2, "participant", "life", 3);
        Assert.Equal(1, policy.NextMove(first, 100)?.Direction);
        policy.RecordMove(true, 1);
        var replacement = first with { Life = "new-life", LifeGeneration = 4 };
        Assert.Equal(1, policy.NextMove(replacement, 5)?.Direction);
        Assert.True(policy.NextMove(replacement, 6)?.Turn);
    }

    [Fact]
    public void AdmissionPhaseRetiresMoveOriginWithoutRepeatingSelectionAtOneAuthorityTick()
    {
        var policy = new MovementSyncPreviewInputPolicy(0);
        var identity = new MovementSyncPreviewIdentity("room", "world", 1, 2, "participant", "life", 3);
        Assert.Equal(1, policy.NextMove(identity, 10)?.Direction);
        policy.RecordMove(true, 1);
        policy.EnterSelectionPhase(identity);
        Assert.True(policy.ShouldSelect(identity, 11));
        policy.EnterSelectionPhase(identity);
        Assert.False(policy.ShouldSelect(identity, 11));
        Assert.True(policy.NextMove(identity, 100)?.Turn);
    }

    [Fact]
    public void OnlyThePendingMoveCanBecomeTheAcceptedDirection()
    {
        var policy = new MovementSyncPreviewInputPolicy(0);
        var identity = new MovementSyncPreviewIdentity("room", "world", 1, 2, "participant", "life", 3);
        Assert.Throws<InvalidOperationException>(() => policy.RecordMove(true, 1));
        Assert.Equal(1, policy.NextMove(identity, 10)?.Direction);
        Assert.Throws<InvalidOperationException>(() => policy.RecordMove(true, 2));
        policy.RecordMove(true, 1);
        Assert.False(policy.NextMove(identity, 11)?.Turn);
    }
}
