using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Lumio.Bomber.Bots;
using Lumio.Bomber.Gameplay;
using Lumio.Client.Bot;
using Lumio.Client.Gameplay.ECS;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Client.Application.Tests;

public sealed class BomberMatchScenarioTests
{
    [Fact]
    public void HealthObservationUsesTheGeneratedCurrentAttributeIdentity()
    {
        Assert.Contains(GeneratedRegistry.Instance.AttributeDeclarations,
            field => field.AttributeId == BomberMatchScenario.HealthAttributeId && field.ValueType == "i64");
    }

    [Fact]
    public void FirstBombIsDueEvenAtTickZero()
    {
        Assert.True(BomberMatchScenario.IsBombDue(0, null));
        Assert.False(BomberMatchScenario.IsBombDue(19, 0));
        Assert.True(BomberMatchScenario.IsBombDue(20, 0));
        Assert.True(BomberMatchScenario.IsBombDue(int.MaxValue, int.MinValue));
    }

    [Fact]
    public void RespawnRequiresTwoDistinctFullLifeIdentities()
    {
        string first = new NetEntityId(1, 1).ToHex();
        string second = new NetEntityId(1, 2).ToHex();
        Assert.False(BomberMatchScenario.IsDistinctSuccessor(null, second));
        Assert.False(BomberMatchScenario.IsDistinctSuccessor(first, first));
        Assert.False(BomberMatchScenario.IsDistinctSuccessor("0000000000000001", second));
        Assert.False(BomberMatchScenario.IsDistinctSuccessor(first, new NetEntityId(2, 1).ToHex()));
        Assert.True(BomberMatchScenario.IsDistinctSuccessor(first, second));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void RankingAcceptsCompleteResultsForEachEndReason(int survivors)
    {
        var values = Ranking(survivors);
        Assert.True(BomberMatchScenario.ValidRankingRows(values, 1, 4, 7));
        Assert.False(BomberMatchScenario.ValidRankingRows(values, 2, 4, 7));
    }

    [Theory]
    [InlineData("unknown-reason")]
    [InlineData("survivor-count")]
    [InlineData("eliminated-winner")]
    [InlineData("missing-winner")]
    [InlineData("foreign-participant")]
    [InlineData("foreign-life")]
    [InlineData("duplicate-participant")]
    [InlineData("survivor-death-tick")]
    [InlineData("missing-death-tick")]
    [InlineData("future-death-tick")]
    [InlineData("reversed-deaths")]
    [InlineData("wrong-tie")]
    [InlineData("unrelated-match")]
    public void RankingRejectsContradictoryResultEvidence(string mutation)
    {
        var values = Ranking(1);
        switch (mutation)
        {
            case "unknown-reason": Replace(values, "endReasons", 0, 999); break;
            case "survivor-count": Replace(values, "survivorCounts", 0, 2); break;
            case "eliminated-winner": Replace(values, "winnerParticipants", 0, new NetEntityId(7, 11)); break;
            case "missing-winner": Replace(values, "winnerParticipants", 0, new NetEntityId(7, 999)); break;
            case "foreign-participant": Replace(values, "participants", 2, new NetEntityId(8, 12)); break;
            case "foreign-life": Replace(values, "lives", 2, new NetEntityId(8, 22)); break;
            case "duplicate-participant": Replace(values, "participants", 2, new NetEntityId(7, 11)); break;
            case "survivor-death-tick": Replace(values, "eliminatedTicks", 0, 1UL); break;
            case "missing-death-tick": Replace(values, "eliminatedTicks", 1, 0UL); break;
            case "future-death-tick": Replace(values, "eliminatedTicks", 1, 101UL); break;
            case "reversed-deaths": Replace(values, "eliminatedTicks", 2, 96UL); break;
            case "wrong-tie": Replace(values, "ranks", 2, 2); break;
            case "unrelated-match": Replace(values, "matchIds", 2, 2UL); break;
            default: throw new ArgumentOutOfRangeException(nameof(mutation));
        }
        Assert.False(BomberMatchScenario.ValidRankingRows(values, 1, 4, 7));
    }

    [Fact]
    public void RankingMustMatchObservedHeaderAndAdmittedRoster()
    {
        var values = Ranking(1);
        var roster = Enumerable.Range(10, 4).Select(n => new NetEntityId(7, (ulong)n).ToHex()).ToHashSet();
        string winner = new NetEntityId(7, 10).ToHex();
        Assert.True(BomberMatchScenario.ValidRankingRows(values, 1, 4, 7, 100,
            (int)BomberEndReason.LastSurvivor, winner, 1, roster));
        Assert.False(BomberMatchScenario.ValidRankingRows(values, 1, 4, 7, 101,
            (int)BomberEndReason.LastSurvivor, winner, 1, roster));
        Assert.False(BomberMatchScenario.ValidRankingRows(values, 1, 4, 7, 100,
            (int)BomberEndReason.TimeLimit, winner, 1, roster));
        Assert.False(BomberMatchScenario.ValidRankingRows(values, 1, 4, 7, 100,
            (int)BomberEndReason.LastSurvivor, new NetEntityId(7, 11).ToHex(), 1, roster));
        Assert.False(BomberMatchScenario.ValidRankingRows(values, 1, 4, 7, 100,
            (int)BomberEndReason.LastSurvivor, winner, 2, roster));
        roster.Remove(new NetEntityId(7, 13).ToHex());
        roster.Add(new NetEntityId(7, 99).ToHex());
        Assert.False(BomberMatchScenario.ValidRankingRows(values, 1, 4, 7, 100,
            (int)BomberEndReason.LastSurvivor, winner, 1, roster));
    }

    [Fact]
    public void EmptyReplicaCannotProvideMatchOrRoomEvidence()
    {
        var scenario = new BomberMatchScenario(8);
        var context = new BotDriverContext(0, BotWorldView.Empty,
            BotInputVocabulary.FromRegistry(null), new RejectCommands(), 0);

        Assert.Equal(BotStepStatus.Continue, scenario.Step(in context).Status);
        var sink = new BotAssertionSink();
        scenario.Assert(in context, sink);

        Assert.False(sink.Passed);
        Assert.Contains("basemap_observed", sink.Failed);
        Assert.Contains("match_joined", sink.Failed);
        Assert.Contains("first_bomb_place", sink.Failed);
        Assert.Contains("chain_resolved", sink.Failed);
        Assert.Contains("ranking_valid", sink.Failed);
        Assert.Contains("next_match_started", sink.Failed);
        Assert.Contains("same_room", sink.Failed);
    }

    private sealed class RejectCommands : IBotCommandSink
    {
        public BotIssueResult Issue(in BotIssuedCommand command) =>
            throw new InvalidOperationException("An empty replica cannot issue gameplay commands.");
    }

    private static Dictionary<string, IReadOnlyList<ReplicaFieldValue>> Ranking(int survivors)
    {
        var values = new Dictionary<string, IReadOnlyList<ReplicaFieldValue>>
        {
            ["retainedMatchIds"] = Fields(1UL),
            ["endTicks"] = Fields(100UL),
            ["endReasons"] = Fields((int)(survivors == 0 ? BomberEndReason.SimultaneousElimination
                : survivors == 1 ? BomberEndReason.LastSurvivor : BomberEndReason.TimeLimit)),
            ["winnerParticipants"] = Fields(survivors == 0 ? default(NetEntityId) : new NetEntityId(7, 10)),
            ["survivorCounts"] = Fields(survivors),
        };
        string[] unsigned = { "matchIds", "lifeGenerations", "eliminatedTicks", "hatKingTicks" };
        string[] signed = { "slots", "ranks", "finalHats", "characters", "kills", "bombs", "destroyedBlocks",
            "pickups", "bestChains", "peakHats", "skillCasts", "evolutions" };
        foreach (string name in unsigned) values[name] = Fields(0UL, 0UL, 0UL, 0UL);
        foreach (string name in signed) values[name] = Fields(0, 0, 0, 0);
        values["participants"] = Fields(default(NetEntityId), default(NetEntityId), default(NetEntityId), default(NetEntityId));
        values["lives"] = Fields(default(NetEntityId), default(NetEntityId), default(NetEntityId), default(NetEntityId));
        values["survived"] = Fields(false, false, false, false);
        for (int i = 0; i < 4; i++)
        {
            Replace(values, "matchIds", i, 1UL);
            Replace(values, "lifeGenerations", i, 1UL);
            Replace(values, "participants", i, new NetEntityId(7, (ulong)(10 + i)));
            Replace(values, "lives", i, new NetEntityId(7, (ulong)(20 + i)));
            Replace(values, "slots", i, i);
            Replace(values, "ranks", i, i < survivors || (survivors == 0 && i < 2) ? 1 : i + 1);
            Replace(values, "survived", i, i < survivors);
            Replace(values, "finalHats", i, i < survivors ? 5 : i);
            Replace(values, "eliminatedTicks", i, i < survivors ? 0UL
                : survivors == 0 && i < 2 || survivors == 1 && i == 1 ? 100UL : (ulong)(90 + i));
        }
        // Later deaths rank above earlier ones, regardless of their remaining hats.
        Replace(values, "eliminatedTicks", 2, 98UL);
        Replace(values, "eliminatedTicks", 3, 97UL);
        return values;
    }

    private static void Replace(Dictionary<string, IReadOnlyList<ReplicaFieldValue>> values, string column, int row, object value)
    {
        ReplicaFieldValue[] items = values[column].ToArray();
        items[row] = Field(value);
        values[column] = items;
    }

    private static ReplicaFieldValue[] Fields(params object[] values) => values.Select(Field).ToArray();

    // These are detached validator inputs, not evidence of a live replica or a completed tour.
    private static ReplicaFieldValue Field(object value) => (ReplicaFieldValue)typeof(ReplicaFieldValue)
        .GetMethod("Copy", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, new[] { value })!;
}
