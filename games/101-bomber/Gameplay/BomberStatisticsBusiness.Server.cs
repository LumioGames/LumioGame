using System;
using System.Collections.Generic;
using System.Globalization;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

internal static class BomberStatisticsBusiness
{
    internal static void AppliedPickup(World world, NetEntityId participant, ulong matchId, int hats, int kind, uint skillId = 0)
    {
        if (!TryCurrent(world, participant, matchId, out BomberStatistics statistics)) return;
        statistics.Pickups.Value = checked(statistics.Pickups.Value + 1);
        statistics.PeakHats.Value = Math.Max(statistics.PeakHats.Value, hats);
        if (kind == (int)BomberPickupKind.GoldenHeart)
            statistics.GoldenHeartPickups.Value = checked(statistics.GoldenHeartPickups.Value + 1);
        if (kind == (int)BomberPickupKind.Skill)
        {
            for (int i = 0; i < statistics.SpecialBombHistory.Count; i++)
                if (statistics.SpecialBombHistory[i] == skillId) return;
            if (!BomberSpecialBombResolver.TryResolve(BomberConfigBinding.For(world), skillId, out _))
                throw new InvalidOperationException("An applied special pickup must identify a configured M2 bomb.");
            statistics.SpecialBombHistory.Add(skillId);
        }
    }

    internal static void AppliedHealth(World world, BomberHealthFacts facts)
    {
        if (!TryCurrent(world, facts.Participant[0], facts.MatchId[0], out BomberStatistics statistics)) return;
        statistics.PeakHealthPoints.Value = Math.Max(statistics.PeakHealthPoints.Value, facts.MaximumAfter[0]);
        // Restoration changes lives/matches; only an actual living heal can escape one heart.
        if (facts.TypeId[0] == 10102u && facts.Before[0] is > 0 and <= 2 && facts.After[0] > 2)
            statistics.ClutchEscapes.Value = checked(statistics.ClutchEscapes.Value + 1);
    }

    internal static void AppliedDeath(World world, NetEntityId victim, NetEntityId killer, ulong matchId, bool boss)
    {
        if (TryCurrent(world, victim, matchId, out BomberStatistics victimStatistics))
            victimStatistics.Deaths.Value = checked(victimStatistics.Deaths.Value + 1);
        if (killer == victim || !TryCurrent(world, killer, matchId, out BomberStatistics statistics)) return;
        statistics.Kills.Value = checked(statistics.Kills.Value + 1);
        if (boss) statistics.BossKills.Value = checked(statistics.BossKills.Value + 1);
    }

    internal static void Advance(World world, BomberMatchState match)
    {
        if (match.Phase.Value is not ((int)BomberMatchPhase.Running) and not ((int)BomberMatchPhase.FinalCircle)) return;
        NetEntityId previous = match.HatKing.Value, selected = default, selectedLife = default;
        ulong selectedGeneration = 0;
        int maximum = 0;
        foreach (BomberPlayerState player in world.Each<BomberPlayerState>())
        {
            if (player.LifePhase.Value >= (int)BomberLifePhase.AwaitingRespawn ||
                !TryCurrent(world, player.Participant.Value, match.MatchId.Value, out BomberStatistics statistics)) continue;
            BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
            if (participant.CurrentLife.Value != player.Entity || participant.LifeGeneration.Value != player.LifeGeneration.Value ||
                world.Get<AttributeComponent>(player.Entity).GetBaseValue(BomberAttributeNames.HealthPoints) <= 0) continue;
            int hats = player.HatCount.Value;
            statistics.PeakHats.Value = Math.Max(statistics.PeakHats.Value, hats);
            statistics.PeakHealthPoints.Value = Math.Max(statistics.PeakHealthPoints.Value, player.MaximumHealth.Value);
            if (hats < 1 || hats < maximum || (hats == maximum &&
                (selected == previous || (participant.Entity != previous && participant.Entity.CompareTo(selected) >= 0)))) continue;
            maximum = hats;
            selected = participant.Entity;
            selectedLife = player.Entity;
            selectedGeneration = player.LifeGeneration.Value;
        }
        if (selected != previous)
        {
            match.HatKing.Value = selected;
            world.Single<BomberPresentationJournal>().Append(world, "hat_king_changed", match.MatchId.Value,
                world.Single<BomberWorldRuntime>().AllocateEventSequence(), selected, selectedLife, selectedGeneration,
                sourceParticipant: previous,
                data: new Dictionary<string, string> { ["hatCount"] = maximum.ToString(CultureInfo.InvariantCulture) });
        }
        if (!selected.IsDefault)
        {
            BomberStatistics statistics = world.Get<BomberStatistics>(selected);
            statistics.HatKingTicks.Value = checked(statistics.HatKingTicks.Value + 1);
        }
    }

    private static bool TryCurrent(World world, NetEntityId participant, ulong matchId, out BomberStatistics statistics)
    {
        statistics = null!;
        if (participant.IsDefault || !world.IsLive(participant) ||
            !world.TypeOf(participant).Is<Contracts.EntityTypes.BomberParticipantEntity>() ||
            world.Get<BomberParticipantState>(participant).MatchId.Value != matchId ||
            world.Single<BomberMatchState>().MatchId.Value != matchId) return false;
        statistics = world.Get<BomberStatistics>(participant);
        return true;
    }
}
