using System;
using Xunit;

namespace Lumio.Bomber.Bots;

public sealed class BomberBotBrainTests
{
    private static readonly BotPolicy Policy = new(0, 0, 1, 0, 0, 1000, 2, 0, 0, 1, 4, 10, 2, 3, 6, 80, 180, 5, 3, 1, 1);

    [Fact]
    public void VisibleBombEscapesPerpendicularBeforeTheFuse()
    {
        var board = Board(bombs: [new("bomb", "enemy", 13, 3, 0, 20, 28)]);
        BotDecision choice = new BomberBotBrain(Policy, 1).Decide(board);
        Assert.Contains(choice.Move, new[] { BotMove.Up, BotMove.Down });
        Assert.False(choice.Bomb);
    }

    [Fact]
    public void PickupRouteAvoidsUnavailableCells()
    {
        BotCell[] cells = Open();
        cells[13] = default;
        var board = Board(cells, pickups: [new(14, 0)]);
        BotDecision choice = new BomberBotBrain(Policy, 1).Decide(board);
        Assert.NotEqual(BotMove.Right, choice.Move);
        Assert.NotEqual(BotMove.None, choice.Move);
    }

    [Fact]
    public void BombAtDestructibleBlockRequiresAnEscape()
    {
        BotCell[] cells = Open();
        cells[13] = new(true, false, true, true, false);
        BotDecision choice = new BomberBotBrain(Policy, 1).Decide(Board(cells));
        Assert.True(choice.Bomb);
        Assert.NotEqual(BotMove.None, choice.Move);
    }

    [Fact]
    public void SealedDeadEndNeverPlantsSuicideBomb()
    {
        BotCell[] cells = new BotCell[25];
        cells[12] = new(true, true, false, false, false);
        cells[13] = new(true, false, true, true, false);
        Assert.False(new BomberBotBrain(Policy, 1).Decide(Board(cells)).Bomb);
    }

    [Fact]
    public void CircleWarningTakesPriorityOverOutwardPickup()
    {
        var board = Board(self: 6, pickups: [new(5, 0)], nextSide: 1, circleTick: 10);
        BotDecision choice = new BomberBotBrain(Policy, 1).Decide(board);
        Assert.Contains(choice.Move, new[] { BotMove.Right, BotMove.Down });
    }

    [Fact]
    public void WaterCannotBeUsedAsBombPlacement()
    {
        BotCell[] cells = Open();
        cells[12] = new(true, true, false, false, true);
        cells[13] = new(true, false, true, true, false);
        Assert.False(new BomberBotBrain(Policy, 1).Decide(Board(cells)).Bomb);
    }

    [Fact]
    public void ChainContactUsesEarlierFuseForEscapeSafety()
    {
        var board = Board(bombs: [new("early", "a", 6, 2, 0, 8, 16), new("late", "b", 8, 3, 0, 80, 88)]);
        var navigation = new BotNavigation(board, board.Bombs);
        Assert.False(navigation.Safe(13, 8, 10));
        Assert.True(navigation.Safe(13, 17, 20));
    }

    [Fact]
    public void CompletedBlastUsesReplicatedReachAfterTheBrickHasDisappeared()
    {
        var board = Board(bombs: [new("flame", "enemy", 12, 3, 0, 0, 8, 1, 1, 1, 1)]);
        var navigation = new BotNavigation(board, board.Bombs);
        Assert.False(navigation.Safe(13, 0, 5));
        Assert.True(navigation.Safe(14, 0, 5));
    }

    [Fact]
    public void PierceContinuesThroughExactlyTheVisibleLayerBudget()
    {
        BotCell[] cells = Open();
        cells[13] = new(true, false, true, true, false);
        var navigation = new BotNavigation(Board(cells), []);
        Assert.DoesNotContain(14, navigation.Blast(12, 3, 0));
        Assert.Contains(14, navigation.Blast(12, 3, 1));
        cells[13] = new(true, false, true, false, false);
        Assert.DoesNotContain(14, navigation.Blast(12, 3, 1));
    }

    [Fact]
    public void OrdinaryDecisionDoesNotReRollBeforeProfileThinkTick()
    {
        var brain = new BomberBotBrain(Policy with { ThinkEvery = 3, NoisePermille = 1000, BehaviorMinTicks = 0, BehaviorMaxTicks = 1 }, 99);
        BotDecision first = brain.Decide(Board());
        BotDecision second = brain.Decide(Board(tick: 1));
        Assert.Equal(first.Goal, second.Goal);
        Assert.Equal(first.Behavior, second.Behavior);
    }

    [Fact]
    public void RookieDoesNotUseSkillsEvenWhenDangerIsVisible()
    {
        var board = Board(bombs: [new("bomb", "self", 12, 2, 0, 8, 16)], active: 2);
        Assert.False(new BomberBotBrain(Policy with { SkillUsePermille = 0 }, 1).Decide(board).Skill);
    }

    [Fact]
    public void KickIsNotPressedWithoutAVisibleBombInFacingRay()
    {
        var board = Board(bombs: [new("behind", "enemy", 13, 2, 0, 4, 12)], active: 13);
        Assert.False(new BomberBotBrain(Policy, 1).Decide(board).Skill);
    }

    [Fact]
    public void BubbleWaitsForConfiguredThreatLeadInsteadOfEveryNearbyOpponent()
    {
        var board = Board(bombs: [new("future", "enemy", 12, 2, 0, 9, 17)], active: 2);
        Assert.False(new BomberBotBrain(Policy, 1).Decide(board).Skill);
    }

    [Theory]
    [InlineData(2, 12, BotMove.None, 0)]
    [InlineData(3, 13, BotMove.Up, 3)]
    [InlineData(13, 13, BotMove.Right, 3)]
    internal void ReadySkillUsesItsActualVisibleTarget(uint skill, int bombCell, BotMove facing, int range)
    {
        var board = Board(bombs: [new("urgent", "enemy", bombCell, 3, 0, 4, 12)], active: skill, facing: facing, range: range);
        Assert.True(new BomberBotBrain(Policy, 1).Decide(board).Skill);
    }

    [Fact]
    public void RookieRiskRollCanPursuePickupBeforeItsVisibleFutureFlame()
    {
        var board = Board(pickups: [new(13, 0)], hazards: [new(13, 20, 28)]);
        Assert.NotEqual(13, new BomberBotBrain(Policy, 1).Decide(board).Goal);
        Assert.Equal(13, new BomberBotBrain(Policy with { RiskyPickupPermille = 1000 }, 1).Decide(board).Goal);
    }

    [Fact]
    public void BlinkChecksTheActualFurthestLandingNotANearerSafeCell()
    {
        var board = Board(active: 3, facing: BotMove.Up, range: 2, hazards: [new(12, 0, 30), new(2, 0, 30)]);
        Assert.False(new BomberBotBrain(Policy, 1).Decide(board).Skill);
    }

    [Fact]
    public void AttackLimitUsesDurableParticipantOwnerAcrossLives()
    {
        BotCell[] cells = Open();
        cells[13] = new(true, false, true, true, false);
        var board = Board(cells, bombs: [new("old-life-bomb", "self-participant", 0, 1, 0, 50, 58)]);
        Assert.False(new BomberBotBrain(Policy, 1).Decide(board).Bomb);
    }

    [Fact]
    public void HardOwnCellReactionWaitsThenEscapesTheStillVisibleThreat()
    {
        var policy = Policy with { OwnCellReaction = true, ReactionMin = 2, ReactionMax = 2 };
        var brain = new BomberBotBrain(policy, 1);
        BotBomb[] bombs = [new("enemy", "other", 13, 3, 0, 8, 16)];
        Assert.Equal(BotMove.None, brain.Decide(Board(bombs: bombs)).Move);
        Assert.Equal(BotMove.None, brain.Decide(Board(bombs: bombs, tick: 1)).Move);
        Assert.NotEqual(BotMove.None, brain.Decide(Board(bombs: bombs, tick: 2)).Move);
    }

    [Fact]
    public void ProfileBlastScaleActuallyGatesAnOtherwiseSafePlant()
    {
        BotCell[] cells = Open();
        cells[13] = new(true, false, true, true, false);
        Assert.False(new BomberBotBrain(Policy with { BlastScalePermille = 0 }, 1).Decide(Board(cells)).Bomb);
    }

    [Fact]
    public void HardTrapRollCanOverrideOrdinaryAttackRollWhenEnemyHasNoExit()
    {
        BotCell[] cells = Open();
        foreach (int cell in new[] { 8, 14, 18 }) cells[cell] = new(true, false, true, false, false);
        var board = Board(cells, actors: [new("enemy", "enemy-participant", 13, 6, 0, false)]);
        Assert.True(new BomberBotBrain(Policy with { TrapPermille = 1000, BlastScalePermille = 0 }, 1).Decide(board).Bomb);
    }

    [Fact]
    public void HardFinalCircleFrenzyBypassesProbabilityButKeepsEscapeGate()
    {
        BotCell[] cells = Open(); cells[13] = new(true, false, true, true, false);
        var board = Board(cells, safeSide: 3);
        Assert.True(new BomberBotBrain(Policy with { FrenzyBypass = true, BlastScalePermille = 0, AttackSkipPermille = 1000 }, 1).Decide(board).Bomb);
    }

    [Theory]
    [InlineData(6, true)]
    [InlineData(2, false)]
    public void FinalCircleTradeRequiresActualHealthAdvantageAndReserve(int health, bool expected)
    {
        var cells = new BotCell[25]; cells[12] = cells[13] = new(true, true, false, false, false);
        var board = Board(cells, actors: [new("enemy", "enemy-participant", 13, 2, 0, false)], safeSide: 3, health: health);
        Assert.Equal(expected, new BomberBotBrain(Policy with { TradePermille = 1000 }, 1).Decide(board).Bomb);
    }

    [Fact]
    public void EscapeGateAccountsForWaterTravelTime()
    {
        BotCell[] cells = Open();
        foreach (int cell in new[] { 7, 11, 17 }) cells[cell] = new(true, true, true, false, true);
        cells[13] = new(true, false, true, true, false);
        var board = Board(cells, fuse: 14, waterTicks: 10);
        Assert.False(new BomberBotBrain(Policy, 1).Decide(board).Bomb);
    }

    [Fact]
    public void CircleWarningDoesNotWaitForTheEnemyBombReactionDelay()
    {
        var board = Board(self: 1, nextSide: 3, circleTick: 12);
        Assert.NotEqual(BotMove.None, new BomberBotBrain(Policy with
        { OwnCellReaction = true, ReactionMin = 4, ReactionMax = 4 }, 1).Decide(board).Move);
    }

    [Fact]
    public void TradeDoesNotCountAnOpponentProtectedThroughTheExplosionAsAKill()
    {
        var cells = new BotCell[25]; cells[12] = cells[13] = new(true, true, false, false, false);
        var board = Board(cells, actors: [new("enemy", "participant", 13, 2, 0, false, 100)], safeSide: 3);
        Assert.False(new BomberBotBrain(Policy with { TradePermille = 1000 }, 1).Decide(board).Bomb);
    }

    [Fact]
    public void ProfileEngageScaleControlsTransitionFromFarmingToNearbyOpponent()
    {
        var policy = Policy with { FarmWeight = 1, HuntWeight = 0, CollectWeight = 0, RoamWeight = 0 };
        var board = Board(actors: [new("enemy", "participant", 14, 6, 0, false)]);
        Assert.Equal(BotBehavior.Farm, new BomberBotBrain(policy with { EngageScalePermille = 0 }, 1).Decide(board).Behavior);
        Assert.Equal(BotBehavior.Hunt, new BomberBotBrain(policy, 1).Decide(board).Behavior);
    }

    private static BomberBotObservation Board(BotCell[]? cells = null, BotBomb[]? bombs = null,
        BotPickup[]? pickups = null, int self = 12, int nextSide = 0, long circleTick = long.MaxValue,
        long tick = 0, uint active = 0, BotMove facing = BotMove.None, int range = 0, BotHazard[]? hazards = null,
        BotActor[]? actors = null, int safeSide = 0, int health = 6, int fuse = 36, int waterTicks = 5) => new()
    {
        Width = 5, Cells = cells ?? Open(), Self = new("self", "self-participant", self, health, 0, false),
        Actors = actors ?? Array.Empty<BotActor>(), Bombs = bombs ?? [], Pickups = pickups ?? [],
        NextSafeSide = nextSide, NextCircleTick = circleTick,
        Tick = tick, ActiveSkill = active, SkillReady = active != 0,
        Facing = facing, ActiveRange = range,
        Hazards = hazards ?? [],
        SafeSide = safeSide,
        FuseTicks = fuse, WaterTicksPerCell = waterTicks,
    };

    private static BotCell[] Open()
    {
        var cells = new BotCell[25];
        Array.Fill(cells, new BotCell(true, true, false, false, false));
        return cells;
    }
}
