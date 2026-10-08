namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class BomberPlayerIntentTests
{
    [Fact]
    public void FiveGesturesRetainEdgesAndSixthIsRefusedOnce()
    {
        var intent = new BomberPlayerIntent();
        Assert.Equal(0, intent.BombIntentRefusalCount);
        Assert.Equal("accepted", intent.BombIntentStatusCode);
        for (int i = 0; i < 5; i++) {
            Assert.Equal("accepted", intent.SetBombIntent(1));
            Assert.Equal("accepted", intent.SetBombIntent(3));
        }
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(1));
        Assert.Equal(1, intent.BombIntentRefusalCount);
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(3));
        Assert.Equal(1, intent.BombIntentRefusalCount);
        Assert.Equal(1, intent.PeekSample(true).BombPressPhase);
        Assert.Equal(3, intent.PeekSample(true).BombReleasePhase);
        intent.CommitBomb(1);
        Assert.Equal(3, intent.PeekSample(true).BombReleasePhase);
        intent.CommitBomb(3);
        Assert.Equal(1, intent.PeekSample(true).BombPressPhase);
    }

    [Fact]
    public void MovementPrefersCurrentHeldAndConsumesLosingTapAndTurnOnlyOnCommit()
    {
        var intent = new BomberPlayerIntent();
        intent.SetMoveIntent(2, 0, true);
        intent.SetMoveIntent(3, 2, true);
        intent.SetMoveIntent(2, 0, false);
        Assert.Equal(new BomberIntentSample(2, 0, true, 0, 0, false), intent.PeekSample(true));
        intent.CommitMove();
        Assert.Equal(new BomberIntentSample(2, 0, false, 0, 0, false), intent.PeekSample(true));
        intent.SetMoveIntent(0, 0, false);
        Assert.Equal(default, intent.PeekSample(true));
    }

    [Fact]
    public void IsolatedTapIsEmittedOnceAndMostRecentHeldWins()
    {
        var intent = new BomberPlayerIntent();
        intent.SetMoveIntent(3, 2, true);
        intent.SetMoveIntent(0, 0, false);
        Assert.Equal(new BomberIntentSample(3, 2, true, 0, 0, false), intent.PeekSample(true));
        intent.CommitMove();
        Assert.Equal(default, intent.PeekSample(true));
        intent.SetMoveIntent(2, 0, false);
        intent.SetMoveIntent(1, 0, false);
        Assert.Equal(1, intent.PeekSample(true).Primary);
    }

    [Fact]
    public void HeadPublishesBeginThenTerminalWithoutAdvancingTwiceInOneSample()
    {
        var intent = new BomberPlayerIntent();
        intent.SetBombIntent(1);
        intent.SetBombIntent(3);
        intent.SetBombIntent(1);
        intent.SetBombIntent(3);
        Assert.Equal((1, 3), (intent.PeekSample(true).BombPressPhase, intent.PeekSample(true).BombReleasePhase));
        intent.CommitBomb(1);
        Assert.Equal((0, 3), (intent.PeekSample(true).BombPressPhase, intent.PeekSample(true).BombReleasePhase));
        intent.CommitBomb(3);
        Assert.Equal((1, 3), (intent.PeekSample(true).BombPressPhase, intent.PeekSample(true).BombReleasePhase));
    }

    [Fact]
    public void PublishedOpenGestureEmitsHeldAndPendingTerminalSuppressesHeld()
    {
        var intent = new BomberPlayerIntent();
        intent.SetBombIntent(1);
        intent.CommitBomb(1);
        Assert.Equal(2, intent.PeekSample(true).BombPressPhase);
        intent.SetBombIntent(3);
        Assert.Equal((0, 3), (intent.PeekSample(true).BombPressPhase, intent.PeekSample(true).BombReleasePhase));
    }

    [Fact]
    public void UnpublishedCancelDiscardsOnlyItsTailAndEndBeforeBeginPublicationKeepsBothEdges()
    {
        var intent = new BomberPlayerIntent();
        intent.SetBombIntent(1);
        intent.SetBombIntent(3);
        intent.SetBombIntent(1);
        intent.SetBombIntent(4);
        Assert.Equal((1, 3), (intent.PeekSample(true).BombPressPhase, intent.PeekSample(true).BombReleasePhase));
        intent.CommitBomb(1);
        intent.CommitBomb(3);
        Assert.Equal(default, intent.PeekSample(true));
        Assert.Equal("accepted", intent.SetBombIntent(3)); // A lone End cannot create a Begin.
        Assert.Equal(default, intent.PeekSample(true));
    }

    [Fact]
    public void ClearPreservesPublishedCancelDebtAndDisabledPeekExposesOnlyDebt()
    {
        var intent = new BomberPlayerIntent();
        intent.SetMoveIntent(2, 0, true);
        intent.LatchSkillIntent();
        intent.SetBombIntent(1);
        intent.CommitBomb(1);
        intent.SetBombIntent(3);
        intent.Clear();
        intent.Clear();
        Assert.Equal(new BomberIntentSample(0, 0, false, 0, 4, false), intent.PeekSample(false));
        Assert.Equal(new BomberIntentSample(0, 0, false, 0, 4, false), intent.PeekSample(true));
        intent.CommitBomb(4);
        Assert.Equal(default, intent.PeekSample(true));
    }

    [Fact]
    public void RefusedGestureLatchSurvivesClearUntilMatchingTerminalAndDiagnosticsStaySticky()
    {
        var intent = new BomberPlayerIntent();
        for (int i = 0; i < 5; i++) { intent.SetBombIntent(1); intent.SetBombIntent(3); }
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(1));
        intent.Clear();
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(3));
        Assert.Equal(1, intent.BombIntentRefusalCount);
        Assert.Equal("accepted", intent.SetBombIntent(1));
        Assert.Equal("accepted", intent.SetBombIntent(4));
        Assert.Equal(default, intent.PeekSample(true));
        Assert.Equal("player_bomb_intent_capacity", intent.BombIntentStatusCode);
        intent.Invalidate();
        Assert.Equal(1, intent.BombIntentRefusalCount);
        Assert.Equal("player_bomb_intent_capacity", intent.BombIntentStatusCode);
    }

    [Fact]
    public void RefusedBeginMatchingCancelThenClearPreservesAcceptedPairingAndDiagnostics()
    {
        var intent = new BomberPlayerIntent();
        for (int i = 0; i < 5; i++) {
            Assert.Equal("accepted", intent.SetBombIntent(1));
            Assert.Equal("accepted", intent.SetBombIntent(3));
        }
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(1));
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(4));
        Assert.Equal((1, 3), (intent.PeekSample(true).BombPressPhase, intent.PeekSample(true).BombReleasePhase));
        intent.CommitBomb(1);
        intent.CommitBomb(3);
        Assert.Equal((1, 3), (intent.PeekSample(true).BombPressPhase, intent.PeekSample(true).BombReleasePhase));
        intent.Clear();
        Assert.Equal(default, intent.PeekSample(true));
        Assert.Equal(1, intent.BombIntentRefusalCount);
        Assert.Equal("player_bomb_intent_capacity", intent.BombIntentStatusCode);
        Assert.Equal("accepted", intent.SetBombIntent(1));
        Assert.Equal("accepted", intent.SetBombIntent(3));
        Assert.Equal((1, 3), (intent.PeekSample(true).BombPressPhase, intent.PeekSample(true).BombReleasePhase));
    }

    [Fact]
    public void InvalidateClearsActiveRefusalLatchButRetainsDiagnostics()
    {
        var intent = new BomberPlayerIntent();
        for (int i = 0; i < 5; i++) { intent.SetBombIntent(1); intent.SetBombIntent(3); }
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(1));
        intent.Invalidate();
        Assert.Equal(default, intent.PeekSample(true));
        Assert.Equal(1, intent.BombIntentRefusalCount);
        Assert.Equal("player_bomb_intent_capacity", intent.BombIntentStatusCode);
        Assert.Equal("accepted", intent.SetBombIntent(1));
        Assert.Equal("accepted", intent.SetBombIntent(3));
        Assert.Equal((1, 3), (intent.PeekSample(true).BombPressPhase, intent.PeekSample(true).BombReleasePhase));
        intent.CommitBomb(1);
        Assert.Equal(3, intent.PeekSample(true).BombReleasePhase);
        intent.CommitBomb(3);
        Assert.Equal(default, intent.PeekSample(true));
    }

    [Fact]
    public void FreeingSlotBeforeRefusedTerminalDoesNotTurnDroppedGestureIntoAcceptedOne()
    {
        var intent = new BomberPlayerIntent();
        for (int i = 0; i < 5; i++) { intent.SetBombIntent(1); intent.SetBombIntent(3); }
        intent.SetBombIntent(1);
        intent.CommitBomb(1);
        intent.CommitBomb(3);
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(4));
        Assert.Equal(1, intent.BombIntentRefusalCount);
        Assert.Equal("accepted", intent.SetBombIntent(1));
    }

    [Fact]
    public void FailedPublicationLeavesEdgesAndSkillPendingAndInvalidationErasesOldDebt()
    {
        var intent = new BomberPlayerIntent();
        intent.SetBombIntent(1);
        intent.SetBombIntent(3);
        intent.LatchSkillIntent();
        Assert.Equal(new BomberIntentSample(0, 0, false, 1, 3, true), intent.PeekSample(true));
        Assert.Equal(new BomberIntentSample(0, 0, false, 1, 3, true), intent.PeekSample(true));
        intent.CommitBomb(1);
        intent.Clear();
        Assert.Equal(4, intent.PeekSample(false).BombReleasePhase);
        intent.Invalidate();
        Assert.Equal(default, intent.PeekSample(false));
        intent.SetBombIntent(1);
        Assert.Equal(1, intent.PeekSample(true).BombPressPhase);
    }

    [Fact]
    public void SkillRequiresCommitAndDisabledPeekHidesAllOrdinaryIntent()
    {
        var intent = new BomberPlayerIntent();
        intent.SetMoveIntent(2, 0, true);
        intent.SetBombIntent(1);
        intent.LatchSkillIntent();
        Assert.Equal(default, intent.PeekSample(false));
        Assert.True(intent.PeekSample(true).Skill);
        Assert.True(intent.PeekSample(true).Skill);
        intent.CommitSkill();
        Assert.False(intent.PeekSample(true).Skill);
    }

    [Fact]
    public void RefusalCounterSaturatesAndCancelResolvesDroppedGestureAcrossClear()
    {
        var intent = new BomberPlayerIntent();
        var counter = typeof(BomberPlayerIntent).GetField("_bombIntentRefusalCount",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        Assert.NotNull(counter);
        counter.SetValue(intent, int.MaxValue);
        for (int i = 0; i < 5; i++) { intent.SetBombIntent(1); intent.SetBombIntent(3); }
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(1));
        intent.Clear();
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(4));
        Assert.Equal(int.MaxValue, intent.BombIntentRefusalCount);
        Assert.Equal("accepted", intent.SetBombIntent(1));
    }

    [Fact]
    public void SixthBeginRefusesWhenFifthGestureIsStillOpen()
    {
        var intent = new BomberPlayerIntent();
        for (int i = 0; i < 4; i++) { intent.SetBombIntent(1); intent.SetBombIntent(3); }
        Assert.Equal("accepted", intent.SetBombIntent(1));
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(1));
        Assert.Equal("player_bomb_intent_capacity", intent.SetBombIntent(4));
        Assert.Equal(1, intent.BombIntentRefusalCount);
        Assert.Equal("accepted", intent.SetBombIntent(3));
    }
}
