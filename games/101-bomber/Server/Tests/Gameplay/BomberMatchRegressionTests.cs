using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberMatchRegressionTests
{
    [Fact]
    public void PartialAdmissionDoesNotStartTheMatchOrConsumeEventIds()
    {
        using WorldManager manager = BomberTestWorld.Start();
        BomberTestWorld.QueuePlayer(manager.World, "waiting-player");
        for (int i = 0; i < 5; i++) manager.Tick();
        Assert.Equal(0UL, manager.World.Single<BomberMatchState>().MatchId.Value);
        Assert.Equal(0UL, manager.World.Single<BomberWorldRuntime>().NextEventSequence.Value);
        Assert.Empty(manager.World.Each<BomberParticipantState>());
    }

    [Fact]
    public void FullAdmissionCreatesOneSeatPerPlayerAtDistinctSeparatedSpawns()
    {
        using WorldManager manager = BomberTestWorld.Start();
        IBomberConfig config = BomberConfigBinding.For(manager.World);
        for (int i = 0; i < config.Game.PlayerCount; i++)
            BomberTestWorld.QueuePlayer(manager.World, "match-player-" + i);
        for (int i = 0; i < 5; i++) manager.Tick();
        BomberPlayerState[] players = manager.World.Each<BomberPlayerState>().ToArray();
        var positions = players.Select(player => manager.World.Get<LogicTransform>(player.Entity).LocalPosition).ToArray();
        Assert.Equal(config.Game.PlayerCount, manager.World.Each<BomberParticipantState>().Count());
        Assert.Equal(config.Game.PlayerCount, positions.Distinct().Count());
        Assert.Equal(1UL, manager.World.Single<BomberMatchState>().MatchId.Value);
        Assert.All(players, player =>
        {
            Assert.Equal(1UL, player.LifeGeneration.Value);
            Assert.True(player.ProtectedUntilTick.Value > manager.World.Tick);
            Assert.Equal(player.Entity, manager.World.Get<BomberParticipantState>(player.Participant.Value).CurrentLife.Value);
        });
        for (int i = 0; i < positions.Length; i++)
            for (int j = i + 1; j < positions.Length; j++)
                Assert.True(Math.Abs(positions[i].X - positions[j].X) + Math.Abs(positions[i].Z - positions[j].Z)
                    >= config.Map.SpawnMinDistance);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(3)]
    public void ResultPublicationKeepsHistoricalEliminationTimesAndCompetitionRanks(int survivors)
    {
        using WorldManager manager = BomberTestWorld.Start();
        World world = manager.World;
        int count = BomberConfigBinding.For(world).Game.PlayerCount;
        EntityOrder[] seats = Enumerable.Range(0, count).Select(_ => world.Commands.Create<BomberParticipantEntity>()).ToArray();
        EntityOrder[] lives = Enumerable.Range(0, count).Select(i => BomberTestWorld.QueuePlayer(world, "result-" + i)).ToArray();
        manager.Tick();
        BomberMatchState match = world.Single<BomberMatchState>();
        match.MatchId.Value = 1;
        match.EndTick.Value = 100;
        for (int i = 0; i < count; i++)
        {
            BomberParticipantState participant = world.Get<BomberParticipantState>(seats[i].AssignedId);
            participant.Slot.Value = i;
            participant.MatchId.Value = match.MatchId.Value;
            participant.CurrentLife.Value = lives[i].AssignedId;
            participant.LastLife.Value = lives[i].AssignedId;
            participant.LifeGeneration.Value = 1;
            BomberPlayerState player = world.Get<BomberPlayerState>(lives[i].AssignedId);
            player.Participant.Value = participant.Entity;
            player.LifeGeneration.Value = 1;
            player.LifePhase.Value = (int)(i < survivors ? BomberLifePhase.Vulnerable : BomberLifePhase.Eliminated);
            // Earlier eliminations have more hats; they must still rank behind later deaths.
            player.HatCount.Value = i < survivors ? 5 : i;
            player.EliminatedTick.Value = i < survivors ? 0 : (ulong)(i < survivors + 2 ? 100 : 100 - i);
            participant.EliminatedTick.Value = player.EliminatedTick.Value;
        }

        // This unit fixture supplies the outcome now owned by the generated F reducer.
        match.SurvivorCount.Value = survivors;
        match.EndReason.Value = (int)(survivors == 0 ? BomberEndReason.SimultaneousElimination : survivors == 1 ? BomberEndReason.LastSurvivor : BomberEndReason.TimeLimit);
        match.Winner.Value = survivors == 0 ? default : seats[0].AssignedId;
        Assert.True(BombSystem.PublishResults(world, match, survivors));
        BomberCompletedMatch result = Assert.Single(world.Single<BomberResults>().ReadRetained(count));
        Assert.Equal(survivors, result.SurvivorCount);
        Assert.Equal(result.EndReason, match.EndReason.Value);
        Assert.Equal(result.WinnerParticipant, match.Winner.Value);
        foreach (BomberResultRow row in result.Rows)
        {
            int i = row.Slot;
            Assert.Equal(i < survivors ? 0UL : (ulong)(i < survivors + 2 ? 100 : 100 - i), row.EliminatedTick);
            Assert.Equal(i < survivors ? 1 : i < survivors + 2 ? survivors + 1 : i + 1, row.Rank);
        }
    }
}
