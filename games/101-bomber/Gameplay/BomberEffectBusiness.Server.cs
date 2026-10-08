using System;
using System.Collections.Generic;
using System.Globalization;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
namespace Lumio.Bomber.Gameplay;

internal static class BomberEffectBusiness
{
    internal static void ReserveDamage(World world, BomberMatchState match, BomberBombState bomb, BomberPlayerState player, int x, int z)
    {
        bomb = BomberSplitBombs.DamageOwner(world, bomb);
        var target = new BomberTargetIdentity(player.Participant.Value, player.Entity, player.LifeGeneration.Value);
        if (bomb.TryReserveHit(target) != BomberStorageAdmission.Added) return;
        int row = bomb.HitParticipants.Count - 1;
        BomberDamageFacts facts = world.Get<BomberDamageFacts>(bomb.Entity);
        facts.TypeId[row] = 10101;
        facts.Target[row] = player.Entity;
        facts.Source[row] = bomb.Entity;
        facts.MatchId[row] = match.MatchId.Value;
        facts.Participant[row] = player.Participant.Value;
        facts.Life[row] = player.Entity;
        facts.Generation[row] = player.LifeGeneration.Value;
        facts.SourceParticipant[row] = bomb.Owner.Value;
        facts.SourceLife[row] = bomb.SourceLife.Value;
        facts.SourceGeneration[row] = bomb.SourceLifeGeneration.Value;
        facts.Family[row] = bomb.BombKind.Value;
        facts.ChainId[row] = bomb.ChainId.Value;
        facts.X[row] = x;
        facts.Z[row] = z;
        facts.Cause[row] = (int)BomberDamageCause.Explosion;
    }

    internal static void SubmitDamage(World world, BomberBombState bomb)
    {
        // All rows are reserved before the first admission. Engine associations pin column counts until F ends.
        BomberDamageFacts facts = world.Get<BomberDamageFacts>(bomb.Entity);
        for (int row = 0; row < bomb.HitParticipants.Count; row++)
        {
            if (bomb.HitStates[row] != (int)BomberHitStorageState.Pending || facts.Status[row] != 0 || bomb.HitHandleGenerations[row] != 0) continue;
            long points = bomb.BombKind.Value == (int)BomberBombKind.Freeze && !BomberConfigBinding.For(world).SkillRules.FreezeBombDamages
                ? 0 : BomberMatchRules.HalfHeartsPerBomb;
            var p = new BomberDamageEffect.Parameters
            {
                Points = points, Fx = points > 0 ? "bomber.damage" : "", BombId = bomb.Entity, Row = row,
                MatchId = facts.MatchId[row],
                Participant = facts.Participant[row],
                Life = facts.Life[row],
                Generation = facts.Generation[row],
                SourceParticipant = facts.SourceParticipant[row],
                SourceLife = facts.SourceLife[row],
                SourceGeneration = facts.SourceGeneration[row],
                Family = facts.Family[row],
                ChainId = facts.ChainId[row],
                X = facts.X[row],
                Z = facts.Z[row],
                Cause = facts.Cause[row],
            };
            EffectHandleResult admitted = Effects.Apply<BomberDamageEffect, BomberDamageEffect.Parameters>(world, p.Life, in p, bomb.Entity);
            if (!admitted.Succeeded)
            {
                facts.Status[row] = 2;
                continue;
            }
            bomb.HitHandleWorlds[row] = facts.HandleWorld[row] = admitted.Handle.WorldId.Value;
            bomb.HitHandleInstances[row] = facts.HandleInstance[row] = admitted.Handle.InstanceId.Value;
            bomb.HitHandleGenerations[row] = facts.HandleGeneration[row] = admitted.Handle.Generation;
            bomb.HitDependentsAdmitted[row] = BomberFiniteSkills.SubmitFreezeContact(world, bomb, facts, row, admitted.Handle);
        }
    }

    internal static void Consume(World world, BomberMatchState match)
    {
        BomberHealthBusiness.Consume(world);
        BomberFireExposure.Consume(world);
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            BomberDamageFacts facts = world.Get<BomberDamageFacts>(bomb.Entity);
            for (int row = bomb.HitParticipants.Count - 1; row >= 0; row--)
            {
                if (bomb.HitStates[row] != (int)BomberHitStorageState.Pending) continue;
                var target = new BomberTargetIdentity(bomb.HitParticipants[row], bomb.HitLives[row], bomb.HitLifeGenerations[row]);
                if (facts.Status[row] == 2)
                {
                    if (!bomb.ReleaseRejectedHit(target)) throw new InvalidOperationException("Rejected damage lost its reservation.");
                    continue;
                }
                if (facts.Status[row] != 1) continue;
                if (!facts.Ready[row] || facts.HandleWorld[row] != bomb.HitHandleWorlds[row] ||
                    facts.HandleInstance[row] != bomb.HitHandleInstances[row] || facts.HandleGeneration[row] != bomb.HitHandleGenerations[row] ||
                    facts.Target[row] != target.Life || facts.Participant[row] != target.Participant || facts.Generation[row] != target.LifeGeneration)
                    throw new InvalidOperationException("Settled damage does not match its full reservation.");
                if (facts.Actual[row] == 0)
                {
                    if (!bomb.CommitContact(target)) throw new InvalidOperationException("Applied contact lost its reservation.");
                    continue;
                }
                BomberPresentationJournal journal = world.Single<BomberPresentationJournal>();
                ulong sequence = BomberMatchRules.Emit(world, "damage_applied", facts.MatchId[row],
                    $"source={bomb.Entity.ToHex()} target={target.Life.ToHex()} cause={facts.Cause[row]}", facts.Tick[row]);
                var data = new Dictionary<string, string> {
                    ["appliedPoints"] = facts.Actual[row].ToString(CultureInfo.InvariantCulture),
                    ["healthPointsBefore"] = facts.Before[row].ToString(CultureInfo.InvariantCulture),
                    ["healthPointsLeft"] = facts.After[row].ToString(CultureInfo.InvariantCulture),
                    ["bombId"] = bomb.Entity.ToHex(), ["chainId"] = facts.ChainId[row].ToString(CultureInfo.InvariantCulture),
                    ["sourceLifeGeneration"] = facts.SourceGeneration[row].ToString(CultureInfo.InvariantCulture) };
                journal.Append(world, "damage_applied", facts.MatchId[row], sequence, target.Participant, target.Life, target.LifeGeneration,
                    facts.SourceParticipant[row], facts.SourceLife[row], bomb.Entity, facts.X[row], facts.Z[row], "explosion", data, facts.Tick[row]);
                if (facts.Before[row] > 0 && facts.After[row] == 0)
                {
                    BomberStatisticsBusiness.AppliedDeath(world, target.Participant, facts.SourceParticipant[row], facts.MatchId[row],
                        BomberGrowth.IsBoss(world.Get<BomberPlayerState>(target.Life).MaximumHealth.Value));
                    journal.Append(world, "death", facts.MatchId[row], world.Single<BomberWorldRuntime>().AllocateEventSequence(),
                        target.Participant, target.Life, target.LifeGeneration, facts.SourceParticipant[row], facts.SourceLife[row],
                        bomb.Entity, facts.X[row], facts.Z[row], "explosion", data, facts.Tick[row]);
                    if (BomberGrowth.IsBoss(world.Get<BomberPlayerState>(target.Life).MaximumHealth.Value))
                        journal.Append(world, "boss_down", facts.MatchId[row], world.Single<BomberWorldRuntime>().AllocateEventSequence(),
                            target.Participant, target.Life, target.LifeGeneration, facts.SourceParticipant[row], facts.SourceLife[row],
                            bomb.Entity, facts.X[row], facts.Z[row], "explosion",
                            new Dictionary<string, string>(data) { ["maximumHealth"] = world.Get<BomberPlayerState>(target.Life).MaximumHealth.Value.ToString(CultureInfo.InvariantCulture) },
                            facts.Tick[row]);
                }
                if (!bomb.CommitContact(target)) throw new InvalidOperationException("Applied damage lost its reservation.");
            }
        }
        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>())
        {
            if (!participant.DeathStructurePending.Value || participant.DeathStructureTick.Value >= world.Tick) continue;
            NetEntityId life = participant.DeathStructureLife.Value;
            if (participant.CurrentLife.Value != life || participant.LifeGeneration.Value != participant.DeathStructureGeneration.Value || !world.IsLive(life))
                throw new InvalidOperationException("Death structure intent no longer identifies its live old body.");
            if (!BomberSuccessorLifecycle.PrepareDeath(world, participant, life, out bool controlled)) continue;
            AttributeComponent attributes = world.Get<AttributeComponent>(life);
            participant.TerminalLife.Value = life;
            participant.TerminalGeneration.Value = participant.DeathStructureGeneration.Value;
            participant.TerminalMatchId.Value = participant.MatchId.Value;
            participant.TerminalBaseSample.Clear();
            participant.TerminalCurrentSample.Clear();
            participant.TerminalBaseSample.Add(attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
            participant.TerminalCurrentSample.Add(attributes.GetCurrentValue(BomberAttributeNames.HealthPoints));
            participant.TerminalOccurrenceTick.Value = participant.DeathStructureTick.Value;
            participant.TerminalCaptureTick.Value = world.Tick;
            participant.TerminalDestructionTick.Value = world.Tick;
            var position = world.Get<LogicTransform>(life).LocalPosition;
            participant.DeathCellX.Value = BomberMatchRules.CellX(position);
            participant.DeathCellZ.Value = BomberMatchRules.CellZ(position);
            CaptureCarry(world, participant, life, attributes);
            BomberDeathDrops.Partition(world, match, participant);
            participant.SuccessorPending.Value = participant.LifePhase.Value == (int)BomberLifePhase.AwaitingRespawn;
            participant.DeathConsumedCount.Value = checked(participant.DeathConsumedCount.Value + 1);
            if (!controlled) participant.CurrentLife.Value = default;
            participant.DeathStructurePending.Value = false;
            BomberFavoriteFireZones.SourceTerminal(world, life);
            world.Commands.Destroy(life);
        }
        BomberDeathDrops.PlacePending(world);
        if (match.OutcomePending.Value)
        {
            BombSystem.PublishResults(world, match, match.SurvivorCount.Value);
            ulong sequence = BomberMatchRules.Emit(world, "match_ended", match.MatchId.Value, occurredTick: match.EndTick.Value);
            world.Single<BomberPresentationJournal>().Append(world, "match_end", match.MatchId.Value, sequence,
                participant: match.Winner.Value, cause: ((BomberEndReason)match.EndReason.Value).ToString(), occurredTick: match.EndTick.Value);
            match.OutcomePending.Value = false;
        }
    }

    private static void CaptureCarry(World world, BomberParticipantState participant, NetEntityId life, AttributeComponent attributes)
    {
        BomberRespawnCarry carry = world.Get<BomberRespawnCarry>(participant.Entity);
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        carry.PowerBase.Value = checked((int)attributes.GetBaseValue(BomberAttributeNames.BombPower));
        carry.CapacityBase.Value = checked((int)attributes.GetBaseValue(BomberAttributeNames.BombCapacity));
        carry.SpeedTierBase.Value = checked((int)attributes.GetBaseValue(BomberAttributeNames.SpeedTier));
        carry.AvailableBombs.Value = checked((int)attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        carry.CharacterId.Value = checked((int)skill.CharacterId.Value);
        carry.BombSkillId.Value = checked((int)skill.BombSkillId.Value);
        carry.BombLevel.Value = skill.BombSkillLevel.Value;
        carry.BombBound.Value = skill.BombSkillBound.Value;
        carry.ActiveSkillId.Value = checked((int)skill.ActiveSkillId.Value);
        carry.ActiveLevel.Value = skill.ActiveSkillLevel.Value;
        carry.ActiveBound.Value = skill.ActiveSkillBound.Value;
        carry.PassiveSkillId.Value = checked((int)skill.PassiveSkillId.Value);
        carry.PassiveLevel.Value = skill.PassiveSkillLevel.Value;
        carry.PassiveBound.Value = skill.PassiveSkillBound.Value;
        carry.BombCombinationOriginA.Value = checked((int)skill.ComboSourceA.Value);
        carry.BombCombinationOriginB.Value = checked((int)skill.ComboSourceB.Value);
        carry.BombOriginALevel.Value = skill.ComboLevelA.Value;
        carry.BombOriginBLevel.Value = skill.ComboLevelB.Value;
        carry.CarryPresent.Value = true;
    }
}
