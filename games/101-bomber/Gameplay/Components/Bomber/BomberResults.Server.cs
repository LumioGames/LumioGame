using System;
using System.Collections.Generic;
using System.Linq;
using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Detached result values. No component or Sync container may be held here.</summary>
public sealed record BomberResultRow
{
    public ulong MatchId { get; init; }
    public NetEntityId Participant { get; init; }
    public NetEntityId Life { get; init; }
    public ulong LifeGeneration { get; init; }
    public int Slot { get; init; }
    public int Rank { get; init; }
    public bool Survived { get; init; }
    public int FinalHats { get; init; }
    public ulong EliminatedTick { get; init; }
    public int Character { get; init; }
    public int Kills { get; init; }
    public int Bombs { get; init; }
    public int DestroyedBlocks { get; init; }
    public int Pickups { get; init; }
    public int BestChain { get; init; }
    public int PeakHats { get; init; }
    public int SkillCasts { get; init; }
    public int Evolutions { get; init; }
    public ulong HatKingTicks { get; init; }
    public int Deaths { get; init; }
    public int PeakHealthPoints { get; init; }
    public int BossKills { get; init; }
    public int ClutchEscapes { get; init; }
    public int GoldenHeartPickups { get; init; }
    public string SpecialBombHistory { get; init; } = string.Empty;
}

public sealed record BomberCompletedMatch
{
    public ulong MatchId { get; init; }
    public ulong EndTick { get; init; }
    public int EndReason { get; init; }
    public NetEntityId WinnerParticipant { get; init; }
    public int SurvivorCount { get; init; }
    public IReadOnlyList<BomberResultRow> Rows { get; init; } = Array.Empty<BomberResultRow>();
}

public sealed partial class BomberResults
{
    public IReadOnlyList<BomberCompletedMatch> ReadRetained(int configuredPlayerCount)
    {
        RequirePlayerCount(configuredPlayerCount);
        int count = RetainedMatchIds.Count;
        if (count > 2 || EndTicks.Count != count || EndReasons.Count != count ||
            WinnerParticipants.Count != count || SurvivorCounts.Count != count)
            throw new InvalidOperationException("Result header columns are inconsistent or exceed two matches.");
        int rowCount = checked(count * configuredPlayerCount);
        if (Deaths.Count != rowCount || PeakHealthPoints.Count != rowCount || BossKills.Count != rowCount ||
            ClutchEscapes.Count != rowCount || GoldenHeartPickups.Count != rowCount || SpecialBombHistories.Count != rowCount)
            throw new InvalidOperationException("Result highlight columns are inconsistent with complete matches.");
        if (MatchIds.Count != rowCount || Participants.Count != rowCount || Lives.Count != rowCount || LifeGenerations.Count != rowCount || Slots.Count != rowCount || Ranks.Count != rowCount || Survived.Count != rowCount || FinalHats.Count != rowCount || EliminatedTicks.Count != rowCount || Characters.Count != rowCount || Kills.Count != rowCount || Bombs.Count != rowCount || DestroyedBlocks.Count != rowCount || Pickups.Count != rowCount || BestChains.Count != rowCount || PeakHats.Count != rowCount || SkillCasts.Count != rowCount || Evolutions.Count != rowCount || HatKingTicks.Count != rowCount)
            throw new InvalidOperationException("Result row columns are inconsistent with complete matches.");
        var matches = new List<BomberCompletedMatch>(count);
        for (int matchIndex = 0; matchIndex < count; matchIndex++)
        {
            var rows = new BomberResultRow[configuredPlayerCount];
            for (int slot = 0; slot < configuredPlayerCount; slot++)
            {
                int index = checked(matchIndex * configuredPlayerCount + slot);
                rows[slot] = new BomberResultRow
                {
                    MatchId = MatchIds[index],
                    Participant = Participants[index],
                    Life = Lives[index],
                    LifeGeneration = LifeGenerations[index],
                    Slot = Slots[index],
                    Rank = Ranks[index],
                    Survived = Survived[index],
                    FinalHats = FinalHats[index],
                    EliminatedTick = EliminatedTicks[index],
                    Character = Characters[index],
                    Kills = Kills[index],
                    Bombs = Bombs[index],
                    DestroyedBlocks = DestroyedBlocks[index],
                    Pickups = Pickups[index],
                    BestChain = BestChains[index],
                    PeakHats = PeakHats[index],
                    SkillCasts = SkillCasts[index],
                    Evolutions = Evolutions[index],
                    HatKingTicks = HatKingTicks[index],
                    Deaths = Deaths[index],
                    PeakHealthPoints = PeakHealthPoints[index],
                    BossKills = BossKills[index],
                    ClutchEscapes = ClutchEscapes[index],
                    GoldenHeartPickups = GoldenHeartPickups[index],
                    SpecialBombHistory = SpecialBombHistories[index],
                };
            }
            matches.Add(new BomberCompletedMatch
            {
                MatchId = RetainedMatchIds[matchIndex],
                EndTick = EndTicks[matchIndex],
                EndReason = EndReasons[matchIndex],
                WinnerParticipant = WinnerParticipants[matchIndex],
                SurvivorCount = SurvivorCounts[matchIndex],
                Rows = rows,
            });
            ValidateMatch(matches[^1], configuredPlayerCount);
            if (matchIndex > 0 && matches[matchIndex - 1].MatchId >= matches[matchIndex].MatchId)
                throw new InvalidOperationException("Retained match ids must increase.");
        }
        if ((count == 0) != (PublishedGeneration.Value == 0))
            throw new InvalidOperationException("Results generation and retained headers disagree.");
        return matches;
    }

    public void Publish(BomberCompletedMatch completed, int configuredPlayerCount)
    {
        IReadOnlyList<BomberCompletedMatch> old = ReadRetained(configuredPlayerCount);
        BomberCompletedMatch prepared = completed with { Rows = completed.Rows?.ToArray() ?? Array.Empty<BomberResultRow>() };
        ValidateMatch(prepared, configuredPlayerCount);
        if (old.Count > 0 && prepared.MatchId <= old[^1].MatchId)
            throw new InvalidOperationException("Completed match id must increase.");
        ulong nextGeneration = checked(PublishedGeneration.Value + 1);
        BomberCompletedMatch[] keep = old.Count == 0 ? new[] { prepared } :
            old.Count == 1 ? new[] { old[0], prepared } : new[] { old[1], prepared };
        BomberResultRow[] rows = keep.SelectMany(m => m.Rows.OrderBy(r => r.Rank).ThenBy(r => r.Participant)).ToArray();
        if (keep.Length > 2 || rows.Length != checked(keep.Length * configuredPlayerCount))
            throw new InvalidOperationException("Result retention budget exceeded.");
        // All domain validation and allocations precede the first persisted write.
        Replace(RetainedMatchIds, keep.Select(m => m.MatchId));
        Replace(EndTicks, keep.Select(m => m.EndTick));
        Replace(EndReasons, keep.Select(m => m.EndReason));
        Replace(WinnerParticipants, keep.Select(m => m.WinnerParticipant));
        Replace(SurvivorCounts, keep.Select(m => m.SurvivorCount));
        Replace(MatchIds, rows.Select(r => r.MatchId));
        Replace(Participants, rows.Select(r => r.Participant));
        Replace(Lives, rows.Select(r => r.Life));
        Replace(LifeGenerations, rows.Select(r => r.LifeGeneration));
        Replace(Slots, rows.Select(r => r.Slot));
        Replace(Ranks, rows.Select(r => r.Rank));
        Replace(Survived, rows.Select(r => r.Survived));
        Replace(FinalHats, rows.Select(r => r.FinalHats));
        Replace(EliminatedTicks, rows.Select(r => r.EliminatedTick));
        Replace(Characters, rows.Select(r => r.Character));
        Replace(Kills, rows.Select(r => r.Kills));
        Replace(Bombs, rows.Select(r => r.Bombs));
        Replace(DestroyedBlocks, rows.Select(r => r.DestroyedBlocks));
        Replace(Pickups, rows.Select(r => r.Pickups));
        Replace(BestChains, rows.Select(r => r.BestChain));
        Replace(PeakHats, rows.Select(r => r.PeakHats));
        Replace(SkillCasts, rows.Select(r => r.SkillCasts));
        Replace(Evolutions, rows.Select(r => r.Evolutions));
        Replace(HatKingTicks, rows.Select(r => r.HatKingTicks));
        Replace(Deaths, rows.Select(r => r.Deaths));
        Replace(PeakHealthPoints, rows.Select(r => r.PeakHealthPoints));
        Replace(BossKills, rows.Select(r => r.BossKills));
        Replace(ClutchEscapes, rows.Select(r => r.ClutchEscapes));
        Replace(GoldenHeartPickups, rows.Select(r => r.GoldenHeartPickups));
        Replace(SpecialBombHistories, rows.Select(r => r.SpecialBombHistory));
        PublishedGeneration.Value = nextGeneration;
    }

    private void ValidateMatch(BomberCompletedMatch match, int configuredPlayerCount)
    {
        if (match.MatchId == 0 || match.EndTick == 0 ||
            match.EndReason < (int)BomberEndReason.LastSurvivor ||
            match.EndReason > (int)BomberEndReason.TimeLimit ||
            match.Rows is null || match.Rows.Count != configuredPlayerCount ||
            match.SurvivorCount < 0 || match.SurvivorCount > configuredPlayerCount)
            throw new InvalidOperationException("Incomplete completed match.");
        var slots = new HashSet<int>();
        var participants = new HashSet<NetEntityId>();
        var lives = new HashSet<NetEntityId>();
        int survivors = 0;
        int lastRank = 0;
        BomberResultRow? previous = null;
        BomberResultRow? winner = null;
        BomberResultRow[] sorted = match.Rows.OrderBy(r => r.Rank).ThenBy(r => r.Participant).ToArray();
        for (int i = 0; i < sorted.Length; i++)
        {
            BomberResultRow row = sorted[i];
            if (row.Deaths < 0 || row.PeakHealthPoints is < 0 or > BomberGrowth.HealthLimit || row.BossKills < 0 ||
                row.BossKills > row.Kills || row.ClutchEscapes < 0 || row.GoldenHeartPickups < 0 || row.GoldenHeartPickups > row.Pickups)
                throw new InvalidOperationException("Invalid result highlight totals.");
            _ = BomberSpecialBombHistory.Decode(row.SpecialBombHistory);
            if (row.MatchId != match.MatchId || row.Participant.IsDefault || row.Life.IsDefault ||
                row.Participant.InstanceId != Entity.InstanceId || row.Life.InstanceId != Entity.InstanceId ||
                row.LifeGeneration == 0 || row.Slot < 0 || row.Slot >= configuredPlayerCount ||
                !slots.Add(row.Slot) || !participants.Add(row.Participant) || !lives.Add(row.Life) ||
                row.Rank < 1 || row.Rank > configuredPlayerCount ||
                (row.Rank != lastRank && row.Rank != i + 1) ||
                row.FinalHats < 0 || row.Character < 0 ||
                row.Kills < 0 ||
                row.Bombs < 0 ||
                row.DestroyedBlocks < 0 ||
                row.Pickups < 0 ||
                row.BestChain < 0 ||
                row.PeakHats < 0 ||
                row.SkillCasts < 0 ||
                row.Evolutions < 0)
                throw new InvalidOperationException("Invalid or duplicate result row.");
            if (row.Survived ? row.EliminatedTick != 0 :
                row.EliminatedTick == 0 || row.EliminatedTick > match.EndTick)
                throw new InvalidOperationException("Result elimination tick contradicts survival.");
            if (previous is not null)
            {
                if (!previous.Survived && row.Survived)
                    throw new InvalidOperationException("A survivor must precede every eliminated participant.");
                bool tied = previous.Survived && row.Survived
                    ? previous.FinalHats == row.FinalHats
                    : !previous.Survived && !row.Survived &&
                      previous.EliminatedTick == row.EliminatedTick;
                if ((row.Rank == previous.Rank) != tied ||
                    (previous.Survived && row.Survived && previous.FinalHats < row.FinalHats) ||
                    (!previous.Survived && !row.Survived && previous.EliminatedTick < row.EliminatedTick))
                    throw new InvalidOperationException("Result ranks contradict hats or elimination order.");
            }
            lastRank = row.Rank;
            if (row.Survived) survivors++;
            if (row.Participant == match.WinnerParticipant) winner = row;
            previous = row;
        }
        bool validReason = (BomberEndReason)match.EndReason switch
        {
            BomberEndReason.LastSurvivor => survivors == 1 && winner is { Survived: true, Rank: 1 } &&
                (sorted.Length == 1 || sorted[1].EliminatedTick <= match.EndTick),
            BomberEndReason.SimultaneousElimination => survivors == 0 && match.WinnerParticipant.IsDefault &&
                sorted.Count(row => row.EliminatedTick == match.EndTick) >= 2,
            BomberEndReason.TimeLimit => survivors >= 2 && winner is { Survived: true, Rank: 1 },
            _ => false,
        };
        if (survivors != match.SurvivorCount || !validReason)
            throw new InvalidOperationException("Result winner or survivor count disagrees with rows.");
    }

    private static void RequirePlayerCount(int configuredPlayerCount)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(configuredPlayerCount);
    }

    private static void Replace<T>(SyncList<T> target, IEnumerable<T> values)
    {
        target.Clear();
        foreach (T value in values) target.Add(value);
    }
}
