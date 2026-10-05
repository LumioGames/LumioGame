using System;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberResultRetentionTests
{
    [Fact]
    public void FourCompletedMatchesRetainTwoWholeImmutableResultsAcrossSnapshotRestore()
    {
        using WorldManager manager = BomberTestWorld.Start();
        int playerCount = BomberConfigBinding.For(manager.World).Game.PlayerCount;
        EntityOrder[] participants = Enumerable.Range(0, playerCount)
            .Select(_ => manager.World.Commands.Create<BomberParticipantEntity>()).ToArray();
        manager.Tick();
        NetEntityId[] ids = participants.Select(p => p.AssignedId).ToArray();
        NetEntityId[] lives = Enumerable.Range(0, playerCount)
            .Select(i => new NetEntityId(ids[i].InstanceId, checked(ids[i].Counter + 10_000UL))).ToArray();
        BomberResults results = manager.World.Single<BomberResults>();
        for (ulong match = 1; match <= 4; match++)
        {
            results.Publish(Completed(match, ids, lives), playerCount);
            var retained = results.ReadRetained(playerCount);
            Assert.Equal((int)Math.Min(match, 2), retained.Count);
            Assert.Equal(match, retained[^1].MatchId);
            if (match >= 2) Assert.Equal(match - 1, retained[0].MatchId);
            Assert.Equal(playerCount * retained.Count, results.Participants.Count);
            if (match == 2)
            {
                manager.World.Get<BomberStatistics>(ids[0]).Kills.Value = 999;
                Assert.Equal(10, results.ReadRetained(playerCount)[0].Rows[0].Kills);
            }
        }
        Assert.Equal(4UL, results.PublishedGeneration.Value);
        Assert.Equal(new ulong[] { 3, 4 }, results.RetainedMatchIds.Values.ToArray());
        byte[] before = manager.CaptureSnapshot();
        using WorldManager restored = BomberTestWorld.Restore(before, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();

        BomberResults after = restored.World.Single<BomberResults>();
        Assert.Equal(4UL, after.PublishedGeneration.Value);
        Assert.Equal(new ulong[] { 3, 4 }, after.RetainedMatchIds.Values.ToArray());
        Assert.Equal(40, after.ReadRetained(playerCount)[^1].Rows[0].Kills);
        Assert.Equal(SHA256.HashData(before), SHA256.HashData(restored.CaptureSnapshot()));
        Assert.Throws<InvalidOperationException>(() =>
            after.Publish(Completed(5, ids, lives) with { Rows = new[] { Completed(5, ids, lives).Rows[0] } }, playerCount));
        Assert.Equal(4UL, after.PublishedGeneration.Value);
        Assert.Equal(new ulong[] { 3, 4 }, after.RetainedMatchIds.Values.ToArray());
    }

    [Fact]
    public void InvalidFullIdentityAndColumnCorruptionFailBeforePublication()
    {
        using WorldManager manager = BomberTestWorld.Start();
        int playerCount = BomberConfigBinding.For(manager.World).Game.PlayerCount;
        EntityOrder[] participants = Enumerable.Range(0, playerCount)
            .Select(_ => manager.World.Commands.Create<BomberParticipantEntity>()).ToArray();
        manager.Tick();
        NetEntityId[] ids = participants.Select(p => p.AssignedId).ToArray();
        NetEntityId[] lives = Enumerable.Range(0, playerCount)
            .Select(i => new NetEntityId(ids[i].InstanceId, checked(ids[i].Counter + 10_000UL))).ToArray();
        BomberResults results = manager.World.Single<BomberResults>();
        BomberCompletedMatch valid = Completed(1, ids, lives);
        BomberResultRow[] badRows = valid.Rows.ToArray();
        badRows[0] = badRows[0] with
        {
            Participant = new NetEntityId(ids[0].InstanceId + 1, ids[0].Counter)
        };
        byte[] empty = manager.CaptureSnapshot();
        Assert.Throws<InvalidOperationException>(() => results.Publish(valid with { Rows = badRows }, playerCount));
        Assert.Equal(empty, manager.CaptureSnapshot());
        results.Publish(valid, playerCount);
        results.Ranks.Add(1);
        Assert.Throws<InvalidOperationException>(() => results.ReadRetained(playerCount));
        Assert.Throws<InvalidOperationException>(() => results.Publish(Completed(2, ids, lives), playerCount));
    }

    [Fact]
    public void TiedRanksSortByFullIdAndContradictoryWinnersNeverPublish()
    {
        using WorldManager manager = BomberTestWorld.Start();
        int playerCount = BomberConfigBinding.For(manager.World).Game.PlayerCount;
        EntityOrder[] participants = Enumerable.Range(0, playerCount)
            .Select(_ => manager.World.Commands.Create<BomberParticipantEntity>()).ToArray();
        manager.Tick();
        NetEntityId[] ids = participants.Select(p => p.AssignedId).ToArray();
        NetEntityId[] lives = ids.Select(id => new NetEntityId(id.InstanceId, checked(id.Counter + 10_000UL))).ToArray();
        BomberResults results = manager.World.Single<BomberResults>();

        BomberCompletedMatch timeLimit = Completed(1, ids, lives);
        BomberResultRow[] tiedSurvivors = timeLimit.Rows.ToArray();
        tiedSurvivors[1] = tiedSurvivors[1] with
        {
            Rank = 1, Survived = true, EliminatedTick = 0, FinalHats = tiedSurvivors[0].FinalHats
        };
        results.Publish(timeLimit with
        {
            EndReason = (int)BomberEndReason.TimeLimit,
            SurvivorCount = 2,
            Rows = tiedSurvivors.Reverse().ToArray(),
        }, playerCount);
        Assert.Equal(ids[0], results.ReadRetained(playerCount)[0].Rows[0].Participant);
        Assert.Equal(ids[1], results.ReadRetained(playerCount)[0].Rows[1].Participant);
        Assert.Equal(1, results.ReadRetained(playerCount)[0].Rows[1].Rank);

        BomberCompletedMatch allDown = Completed(2, ids, lives);
        BomberResultRow[] lastBatch = allDown.Rows.ToArray();
        lastBatch[0] = lastBatch[0] with { Survived = false, EliminatedTick = allDown.EndTick };
        lastBatch[1] = lastBatch[1] with { Rank = 1 };
        results.Publish(allDown with
        {
            EndReason = (int)BomberEndReason.SimultaneousElimination,
            WinnerParticipant = default,
            SurvivorCount = 0,
            Rows = lastBatch.Reverse().ToArray(),
        }, playerCount);
        Assert.Equal(ids[0], results.ReadRetained(playerCount)[1].Rows[0].Participant);
        Assert.Equal(ids[1], results.ReadRetained(playerCount)[1].Rows[1].Participant);

        byte[] accepted = manager.CaptureSnapshot();
        BomberCompletedMatch next = Completed(3, ids, lives);
        Assert.Throws<InvalidOperationException>(() => results.Publish(next with { WinnerParticipant = ids[^1] }, playerCount));
        Assert.Equal(accepted, manager.CaptureSnapshot());
        Assert.Throws<InvalidOperationException>(() => results.Publish(next with { SurvivorCount = 2 }, playerCount));
        Assert.Equal(accepted, manager.CaptureSnapshot());
        Assert.Throws<InvalidOperationException>(() => results.Publish(next with
        {
            EndReason = (int)BomberEndReason.SimultaneousElimination,
            WinnerParticipant = default,
        }, playerCount));
        Assert.Equal(accepted, manager.CaptureSnapshot());

        results.WinnerParticipants[0] = ids[^1];
        byte[] corrupted = manager.CaptureSnapshot();
        using WorldManager restored = BomberTestWorld.Restore(corrupted, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();
        Assert.Throws<InvalidOperationException>(() => restored.World.Single<BomberResults>().ReadRetained(playerCount));
    }

    [Fact]
    public void SingletonFinalEliminationIsRejectedBeforePublishAndAfterRestore()
    {
        using WorldManager manager = BomberTestWorld.Start();
        int playerCount = BomberConfigBinding.For(manager.World).Game.PlayerCount;
        EntityOrder[] participants = Enumerable.Range(0, playerCount)
            .Select(_ => manager.World.Commands.Create<BomberParticipantEntity>()).ToArray();
        manager.Tick();
        NetEntityId[] ids = participants.Select(p => p.AssignedId).ToArray();
        NetEntityId[] lives = ids.Select(id => new NetEntityId(id.InstanceId, checked(id.Counter + 10_000UL))).ToArray();
        BomberResults results = manager.World.Single<BomberResults>();
        BomberCompletedMatch complete = Completed(1, ids, lives);
        BomberResultRow[] validRows = complete.Rows.ToArray();
        validRows[0] = validRows[0] with { Survived = false, EliminatedTick = complete.EndTick };
        validRows[1] = validRows[1] with { Rank = 1 };
        results.Publish(complete with
        {
            EndReason = (int)BomberEndReason.SimultaneousElimination,
            WinnerParticipant = default,
            SurvivorCount = 0,
            Rows = validRows,
        }, playerCount);
        byte[] accepted = manager.CaptureSnapshot();

        BomberCompletedMatch impossible = Completed(2, ids, lives);
        BomberResultRow[] singletonRows = impossible.Rows.ToArray();
        singletonRows[0] = singletonRows[0] with { Survived = false, EliminatedTick = impossible.EndTick };
        singletonRows[1] = singletonRows[1] with { Rank = 2, EliminatedTick = impossible.EndTick - 1 };
        singletonRows[2] = singletonRows[2] with { Rank = 2 };
        Assert.Throws<InvalidOperationException>(() => results.Publish(impossible with
        {
            EndReason = (int)BomberEndReason.SimultaneousElimination,
            WinnerParticipant = default,
            SurvivorCount = 0,
            Rows = singletonRows,
        }, playerCount));
        Assert.Equal(accepted, manager.CaptureSnapshot());

        results.EliminatedTicks[1] = complete.EndTick - 1;
        results.Ranks[1] = 2;
        results.Ranks[2] = 2;
        byte[] corrupted = manager.CaptureSnapshot();
        using WorldManager restored = BomberTestWorld.Restore(corrupted, GeneratedRegistry.Instance,
            config: BomberConfigBinding.Load());
        restored.RequireBoundSpatialIndex();
        Assert.Throws<InvalidOperationException>(() => restored.World.Single<BomberResults>().ReadRetained(playerCount));
    }

    private static BomberCompletedMatch Completed(ulong match, NetEntityId[] participants, NetEntityId[] lives)
    {
        BomberResultRow[] rows = Enumerable.Range(0, participants.Length).Select(i => new BomberResultRow
        {
            MatchId = match,
            Participant = participants[i],
            Life = lives[i],
            LifeGeneration = match,
            Slot = i,
            Rank = i + 1,
            Survived = i == 0,
            FinalHats = i,
            EliminatedTick = i == 0 ? 0UL : match * 100 - (ulong)(i - 1),
            Character = i % 4 + 1,
            Kills = checked((int)match * 10 + i),
            Bombs = i + 1,
            DestroyedBlocks = i + 2,
            Pickups = i + 3,
            BestChain = i + 4,
            PeakHats = i + 5,
            SkillCasts = i + 6,
            Evolutions = i + 7,
            HatKingTicks = (ulong)i + 8,
        }).ToArray();
        return new BomberCompletedMatch
        {
            MatchId = match,
            EndTick = match * 100,
            EndReason = 1,
            WinnerParticipant = participants[0],
            SurvivorCount = 1,
            Rows = rows,
        };
    }
}
