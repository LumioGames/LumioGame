using System;
using Lumio.Bomber.Gameplay.Config;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

public sealed class M2BudgetEnvelopeTests
{
    [Theory]
    [InlineData(213, 138, 75, 20, 118)]
    [InlineData(317, 206, 111, 32, 174)]
    [InlineData(461, 299, 162, 40, 259)]
    public void InitialDestructiblesUseIntegerSixtyFivePercentAndReserveCratesAndBarrels(
        int potential, int cap, int minimumEmpty, int reserved, int softBlocks)
    {
        Assert.Equal(cap, M2BudgetEnvelope.DestructibleCap(potential));
        Assert.Equal(minimumEmpty, potential - cap);
        Assert.Equal(softBlocks, M2BudgetEnvelope.SoftBlockRemainder(potential, reserved));
    }

    [Fact]
    public void RegenerationBeforeOneHundredFiveSecondsIsThirteenWavesWhenTheFirstTriggerIsEightSeconds()
    {
        Assert.Equal(13, M2BudgetEnvelope.RegenWaves(105_000, 8_000, 8_000));
        Assert.Equal(14, M2BudgetEnvelope.RegenWaves(105_000, 8_000, 0));
    }

    [Fact]
    public void ReservedDestructiblesAboveTheCapAreRefused()
    {
        Assert.Throws<InvalidOperationException>(() => M2BudgetEnvelope.SoftBlockRemainder(213, 139));
    }
}
