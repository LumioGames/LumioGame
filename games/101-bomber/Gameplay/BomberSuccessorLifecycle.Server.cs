using System;
using System.Collections.Generic;
using System.Globalization;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;
using Lumio.Wire;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.EntityTypes;

namespace Lumio.Bomber.Gameplay;

/// <summary>Consumes Runtime-owned successor continuity; never manufactures a binding or transfer result.</summary>
internal static class BomberSuccessorLifecycle
{
    internal static bool PrepareDeath(World world, BomberParticipantState participant, NetEntityId oldLife, out bool controlled)
    {
        // Headless rule fixtures have no admitted owner and therefore no connection to transfer.
        // Once admitted, a disconnected Life retains its nonzero Runtime connection generation.
        controlled = world.Get<ObserverComponent>(oldLife).ConnectionGeneration != 0;
        if (!controlled) return true;
        BomberSuccessorState state = world.Get<BomberSuccessorState>(participant.Entity);
        if (state.ReservationSlot.Value != 0) return true;
        if (state.NextLifeGeneration.Value <= participant.LifeGeneration.Value)
        {
            state.IntentGeneration.Value = checked(state.IntentGeneration.Value + 1);
            state.NextLifeGeneration.Value = checked(participant.LifeGeneration.Value + 1);
        }
        state.ObservationParticipant.Value = participant.Entity;
        state.Eligible.Value = participant.LifePhase.Value == (int)BomberLifePhase.AwaitingRespawn;
        string? error = world.Manager.PrepareSuccessor(participant.Entity, oldLife, participant.LifeGeneration.Value, out SuccessorReservationToken token);
        if (error is not null) return false;
        state.ReservationWorld.Value = token.WorldIncarnation;
        state.ReservationSlot.Value = token.Slot;
        state.ReservationGeneration.Value = token.AllocationGeneration;
        return true;
    }

    internal static void BeginNextMatch(World world, BomberParticipantState participant)
    {
        BomberSuccessorState state = world.Get<BomberSuccessorState>(participant.Entity);
        if (state.ReservationSlot.Value == 0) return;
        // These are desired Game policy columns. Runtime keeps the captured owner policy
        // until Host authorizes supersede_eligibility; Game does not forge that control.
        state.IntentGeneration.Value = checked(state.IntentGeneration.Value + 1);
        state.NextLifeGeneration.Value = checked(state.NextLifeGeneration.Value + 1);
        state.Eligible.Value = true;
    }

    internal static void Advance(World world, BomberMatchState match, IBomberConfig config)
    {
        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>())
        {
            BomberSuccessorState state = world.Get<BomberSuccessorState>(participant.Entity);
            if (state.ReservationSlot.Value == 0)
            {
                if (!state.DormantLife.Value.IsDefault) TryLand(world, match, config, participant, state);
                continue;
            }
            var token = new SuccessorReservationToken(state.ReservationWorld.Value, state.ReservationSlot.Value, state.ReservationGeneration.Value);
            if (world.Manager.TryConsumeSuccessorTransferResult(token, out SuccessorResult? result))
            {
                state.TransferRequest.Value = 0;
                if (result!.CommitFact == SuccessorCommitFact.Applied)
                {
                    if (result.ParticipantId != participant.Entity || result.NewBinding is not { } binding ||
                        binding.NetEntityId != state.DormantLife.Value || !world.IsLive(binding.NetEntityId))
                        throw new InvalidOperationException("Applied successor does not identify the restored Game life.");
                    // Association follows the actual Runtime commit immediately.
                    // Birth remains pending until the current terrain is safe.
                    participant.CurrentLife.Value = binding.NetEntityId;
                    participant.LifeGeneration.Value = state.NextLifeGeneration.Value;
                    state.ReservationSlot.Value = 0;
                    state.RestoreHandleGeneration.Value = 0;
                    TryLand(world, match, config, participant, state);
                    continue;
                }
            }
            if (!participant.SuccessorPending.Value || !state.Eligible.Value || world.Tick < participant.RespawnAtTick.Value ||
                match.Phase.Value is (int)BomberMatchPhase.Results or (int)BomberMatchPhase.Podium) continue;
            if (!world.Manager.TryReadSuccessorHistory(token, out SuccessorReservationHistory history)) continue;
            if (history.CreatedEntityId is not { } target)
            {
                if (world.Manager.CreateSuccessor(token, typeof(PlayerEntity), out EntityOrder? order) is not null || order is null) continue;
                if (!world.Manager.TryReadSuccessorEligibility(token, out EligibilityRecord eligibility))
                    throw new InvalidOperationException("Created successor lost its Runtime eligibility.");
                ConfigureDormant(world, participant, state, order, config, ulong.Parse(eligibility.Revision, CultureInfo.InvariantCulture));
                continue;
            }
            state.DormantLife.Value = target;
            if (!world.IsLive(target)) continue;
            if (state.RestoreOutcome.Value == 2 && state.EffectWorldId.Value == state.RestoreHandleWorld.Value &&
                state.EffectInstanceId.Value == state.RestoreHandleInstance.Value && state.EffectGeneration.Value == state.RestoreHandleGeneration.Value)
                state.RestoreHandleGeneration.Value = 0;
            if (state.RestoreHandleGeneration.Value == 0)
            {
                SubmitRestore(world, participant, state, target, config);
                continue;
            }
            if (state.TransferRequest.Value == 0 && state.RestoreOutcome.Value == 1 && world.Manager.TryReadSuccessorRestoration(101, participant.Entity, out Lumio.GameRuntime.Ecs.RestorationWitness witness))
            {
                if (state.Target.Value != target || state.EffectWorldId.Value != state.RestoreHandleWorld.Value ||
                    state.EffectInstanceId.Value != state.RestoreHandleInstance.Value || state.EffectGeneration.Value != state.RestoreHandleGeneration.Value) continue;
                if (world.Manager.RequestSuccessorTransfer(token, target, witness, out ulong request) is null)
                    state.TransferRequest.Value = request;
            }
        }
    }

    private static void TryLand(World world, BomberMatchState match, IBomberConfig config,
        BomberParticipantState participant, BomberSuccessorState state)
    {
        NetEntityId life = state.DormantLife.Value;
        if (life != participant.CurrentLife.Value || !world.IsLive(life) ||
            world.Get<BomberPlayerState>(life).LifeGeneration.Value != participant.LifeGeneration.Value)
            throw new InvalidOperationException("Pending successor landing no longer identifies the applied current Life.");
        var player = world.Get<BomberPlayerState>(life);
        if (participant.LifePhase.Value == (int)BomberLifePhase.Eliminated)
        {
            // Project the already settled deadline outcome onto the extant dormant
            // body; UpdatePlayers must never undo the reducer's terminal decision.
            player.LifePhase.Value = participant.LifePhase.Value;
            player.EliminatedTick.Value = participant.EliminatedTick.Value;
            participant.SuccessorPending.Value = false;
            state.DormantLife.Value = default;
            return;
        }
        if (!participant.SuccessorPending.Value || !state.Eligible.Value ||
            match.Phase.Value is (int)BomberMatchPhase.Podium or (int)BomberMatchPhase.Results ||
            world.Tick >= match.PhaseEndTick.Value && match.Phase.Value == (int)BomberMatchPhase.FinalCircle ||
            !BomberSpawnSelection.TrySelect(world, participant, out var position)) return;
        NetEntityId oldLife = participant.LastLife.Value;
        MoveAbility.WritePosition(world, life, position, nameof(MoveAbility));
        participant.LastLife.Value = life;
        participant.SuccessorPending.Value = false;
        participant.RespawnAtTick.Value = 0;
        participant.LifePhase.Value = (int)BomberLifePhase.Protected;
        player.LifePhase.Value = participant.LifePhase.Value;
        player.RespawnAtTick.Value = 0;
        player.ProtectedUntilTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Life.ProtectionMs, config.Game.TickRateHz));
        world.Get<BomberRespawnCarry>(participant.Entity).CarryPresent.Value = false;
        world.Single<BomberPresentationJournal>().Append(world, "respawn", participant.MatchId.Value,
            world.Single<BomberWorldRuntime>().AllocateEventSequence(), participant.Entity, life, participant.LifeGeneration.Value,
            data: new Dictionary<string, string> { ["oldLife"] = oldLife.ToHex() });
        state.DormantLife.Value = default;
    }

    private static void ConfigureDormant(World world, BomberParticipantState participant, BomberSuccessorState state,
        EntityOrder order, IBomberConfig config, ulong revision)
    {
        state.DormantLife.Value = default;
        state.RestoreHandleWorld.Value = state.RestoreHandleInstance.Value = 0;
        state.RestoreHandleGeneration.Value = 0;
        state.RestoreOutcome.Value = 0;
        state.TransferRequest.Value = 0;
        BomberPlayerState player = order.Get<BomberPlayerState>();
        player.Participant.Value = participant.Entity;
        player.ParticipantIndex.Value = participant.Slot.Value;
        player.LifeGeneration.Value = state.NextLifeGeneration.Value;
        player.LifePhase.Value = (int)BomberLifePhase.AwaitingRespawn;
        player.Facing.Value = (int)BomberDirection.Down;
        order.Get<BomberSuccessorLife>().PreparedRevision.Value = revision;
        BomberRespawnCarry carry = world.Get<BomberRespawnCarry>(participant.Entity);
        long power = carry.CarryPresent.Value ? carry.PowerBase.Value : config.Attribute(BomberAttributeNames.BombPower).Initial;
        long capacity = carry.CarryPresent.Value ? carry.CapacityBase.Value : config.Attribute(BomberAttributeNames.BombCapacity).Initial;
        long speed = carry.CarryPresent.Value ? carry.SpeedTierBase.Value : config.Attribute(BomberAttributeNames.SpeedTier).Initial;
        player.HatCount.Value = checked((int)config.HatCount(power, capacity, speed));
        player.MaximumHealth.Value = BomberGrowth.MaximumHealth(player.HatCount.Value, 0);
        System.Numerics.Vector3 position = BombSystem.SpawnPosition(config.Map, participant.Slot.Value);
        EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
            FormattableString.Invariant($"{position.X:R},{position.Y:R},{position.Z:R}"), silent: true);
        BomberSkillState skill = order.Get<BomberSkillState>();
        if (carry.CarryPresent.Value)
        {
            skill.CharacterId.Value = checked((uint)carry.CharacterId.Value);
            skill.BombSkillId.Value = checked((uint)carry.BombSkillId.Value);
            skill.BombSkillLevel.Value = carry.BombLevel.Value;
            skill.BombSkillBound.Value = carry.BombBound.Value;
            skill.ActiveSkillId.Value = checked((uint)carry.ActiveSkillId.Value);
            skill.ActiveSkillLevel.Value = carry.ActiveLevel.Value;
            skill.ActiveSkillBound.Value = carry.ActiveBound.Value;
            skill.PassiveSkillId.Value = checked((uint)carry.PassiveSkillId.Value);
            skill.PassiveSkillLevel.Value = carry.PassiveLevel.Value;
            skill.PassiveSkillBound.Value = carry.PassiveBound.Value;
            skill.ComboSourceA.Value = checked((uint)carry.BombCombinationOriginA.Value);
            skill.ComboSourceB.Value = checked((uint)carry.BombCombinationOriginB.Value);
            skill.ComboLevelA.Value = carry.BombOriginALevel.Value;
            skill.ComboLevelB.Value = carry.BombOriginBLevel.Value;
        }
        else if (participant.SelectedForMatchCharacterId.Value > 0 &&
            SelectCharacterAbility.TryConfiguredCharacter(config, checked((uint)participant.SelectedForMatchCharacterId.Value), out CharactersRow row))
            SelectCharacterAbility.BindCharacter(skill, row);
    }

    private static void SubmitRestore(World world, BomberParticipantState participant, BomberSuccessorState state, NetEntityId target, IBomberConfig config)
    {
        BomberRespawnCarry carry = world.Get<BomberRespawnCarry>(participant.Entity);
        var p = new BomberSuccessorRestoreEffect.Parameters
        {
            Fx = "bomber.respawn", Participant = participant.Entity, OldLife = participant.CurrentLife.Value,
            MatchId = participant.MatchId.Value, Generation = state.NextLifeGeneration.Value, Intent = state.IntentGeneration.Value,
            Revision = world.Get<BomberSuccessorLife>(target).PreparedRevision.Value,
            Health = world.Get<BomberPlayerState>(target).MaximumHealth.Value,
            Power = carry.CarryPresent.Value ? carry.PowerBase.Value : config.Attribute(BomberAttributeNames.BombPower).Initial,
            Capacity = carry.CarryPresent.Value ? carry.CapacityBase.Value : config.Attribute(BomberAttributeNames.BombCapacity).Initial,
            Speed = carry.CarryPresent.Value ? carry.SpeedTierBase.Value : config.Attribute(BomberAttributeNames.SpeedTier).Initial,
            MovementSpeed = config.SpeedTier(carry.CarryPresent.Value ? carry.SpeedTierBase.Value : config.Attribute(BomberAttributeNames.SpeedTier).Initial).SpeedMilli,
            Available = BomberInventory.Available(world, participant.Entity,
                carry.CarryPresent.Value ? carry.CapacityBase.Value : config.Attribute(BomberAttributeNames.BombCapacity).Initial),
        };
        EffectHandleResult admitted = Effects.Apply<BomberSuccessorRestoreEffect, BomberSuccessorRestoreEffect.Parameters>(world, target, in p, p.OldLife);
        if (!admitted.Succeeded) return;
        state.RestoreOutcome.Value = 0;
        state.RestoreHandleWorld.Value = admitted.Handle.WorldId.Value;
        state.RestoreHandleInstance.Value = admitted.Handle.InstanceId.Value;
        state.RestoreHandleGeneration.Value = admitted.Handle.Generation;
    }
}
