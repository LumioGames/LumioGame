using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

/// <summary>Negative public retained-result boundaries, not simulated gameplay.</summary>
[Collection("BomberWorld")]
public sealed class ResultReasonNegativeBoundaryTests
{
    [Theory]
    [InlineData("future-elimination")]
    [InlineData("zero-elimination")]
    [InlineData("corpse-survived")]
    [InlineData("wrong-winner")]
    [InlineData("wrong-count")]
    [InlineData("time-limit-one")]
    [InlineData("singleton-all-down")]
    [InlineData("unknown-reason")]
    [InlineData("incomplete-roster")]
    public void InconsistentResultsStillRejectBeforeAnyPublication(string corruption)
    {
        using WorldManager manager = BomberTestWorld.Start();
        int playerCount = BomberConfigBinding.For(manager.World).Game.PlayerCount;
        EntityOrder[] orders = Enumerable.Range(0, playerCount)
            .Select(_ => manager.World.Commands.Create<BomberParticipantEntity>()).ToArray();
        manager.Tick();
        NetEntityId[] ids = orders.Select(o => o.AssignedId).ToArray();
        // Same retained-result identity fixture shape as the unchanged original
        // BomberResultRetentionTests, not a claim these are live player bodies.
        BomberResultRow[] rows = ids.Select((id, i) => new BomberResultRow
        {
            MatchId = 1, Participant = id, Life = new NetEntityId(id.InstanceId, id.Counter + 10_000),
            LifeGeneration = 1, Slot = i, Rank = i + 1, Survived = i == 0,
            EliminatedTick = i == 0 ? 0UL : checked(100UL - (ulong)i),
            Character = 118001,
        }).ToArray();
        var valid = new BomberCompletedMatch
        {
            MatchId = 1, EndTick = 100, EndReason = (int)BomberEndReason.LastSurvivor,
            WinnerParticipant = ids[0], SurvivorCount = 1, Rows = rows,
        };
        var invalid = valid;
        switch (corruption)
        {
            case "future-elimination": rows[1] = rows[1] with { EliminatedTick = 101 }; break;
            case "zero-elimination": rows[1] = rows[1] with { EliminatedTick = 0 }; break;
            case "corpse-survived": rows[0] = rows[0] with { EliminatedTick = 99 }; break;
            case "wrong-winner": invalid = valid with { WinnerParticipant = ids[^1] }; break;
            case "wrong-count": invalid = valid with { SurvivorCount = 2 }; break;
            case "time-limit-one": invalid = valid with { EndReason = (int)BomberEndReason.TimeLimit }; break;
            case "singleton-all-down":
                rows[0] = rows[0] with { Survived = false, EliminatedTick = 100 };
                invalid = valid with { EndReason = (int)BomberEndReason.SimultaneousElimination, WinnerParticipant = default, SurvivorCount = 0 };
                break;
            case "unknown-reason": invalid = valid with { EndReason = 0 }; break;
            case "incomplete-roster": invalid = valid with { Rows = rows.Take(playerCount - 1).ToArray() }; break;
            default: throw new InvalidOperationException("Unknown private test case");
        }
        byte[] before = manager.CaptureSnapshot();
        var results = manager.World.Single<BomberResults>();
        Assert.Throws<InvalidOperationException>(() => results.Publish(invalid, playerCount));
        Assert.Equal(before, manager.CaptureSnapshot());
        Assert.Equal(0UL, results.PublishedGeneration.Value);
        Assert.Empty(results.ReadRetained(playerCount));
    }
}
