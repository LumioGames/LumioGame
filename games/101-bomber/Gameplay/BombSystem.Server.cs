using System;
using System.Collections.Generic;
using System.Linq;
using System.Globalization;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Components.Identity;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

/// <summary>Owns the server-side bomb lifecycle; no second Tick path is introduced.</summary>
[System(TickPhase.ProcessorPlan)]
[After(typeof(BomberFoundationSystem))]
public sealed class BombSystem : EcsSystem
{
    public override void Execute(World world)
    {
        BomberMatchState match = world.Single<BomberMatchState>();
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        world.Single<BomberPresentationJournal>().Expire(world.Tick);
        IBomberConfig config = BomberConfigBinding.For(world);
        EnsureParticipants(world, match, config);
        EnsureMatch(match, config, world);
        if (match.MatchId.Value == 0) return;
        UpdatePlayers(world, match, config);
        AdvanceMatch(world, match, config);
        ProcessBombs(world, match, config);
        AdvanceMatch(world, match, config);
        CollectOverlappingCandy(world, config);
        runtime.ValidateRoster(config);
    }

    private static void CollectOverlappingCandy(World world, IBomberConfig config)
    {
        var lives = new List<(int Slot, NetEntityId Life)>(config.ObjectBudgets.ParticipantLimit);
        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>())
        {
            if (lives.Count >= config.ObjectBudgets.ParticipantLimit)
                throw new InvalidOperationException("Automatic pickup participant count exceeds the configured budget.");
            lives.Add((participant.Slot.Value, participant.CurrentLife.Value));
        }
        lives.Sort((left, right) =>
        {
            int bySlot = left.Slot.CompareTo(right.Slot);
            return bySlot != 0 ? bySlot : left.Life.CompareTo(right.Life);
        });

        var items = new List<NetEntityId>(config.ObjectBudgets.PickupCapacity);
        int liveItems = 0;
        foreach (BomberPickupItem item in world.Each<BomberPickupItem>())
        {
            if (!world.IsLive(item.Entity)) continue;
            if (++liveItems > config.ObjectBudgets.PickupCapacity)
                throw new InvalidOperationException("Automatic pickup item count exceeds the configured budget.");
            if ((BomberPickupKind)item.Kind.Value == BomberPickupKind.Skill)
                items.Add(item.Entity);
        }
        items.Sort();

        float radius = config.Drops.PickupDistanceMilli / 1000f;
        float radiusSquared = radius * radius;
        foreach ((_, NetEntityId life) in lives)
        {
            if (life.IsDefault || !world.IsLive(life) || !world.TypeOf(life).Is<PlayerEntity>()) continue;
            foreach (NetEntityId itemId in items)
            {
                if (!world.IsLive(itemId)) continue;
                BomberPickupItem item = world.Get<BomberPickupItem>(itemId);
                if ((BomberPickupKind)item.Kind.Value != BomberPickupKind.Skill ||
                    !item.ClaimedBy.Value.IsDefault) continue;
                Vector3 from = world.Get<LogicTransform>(life).LocalPosition;
                Vector3 to = world.Get<LogicTransform>(itemId).LocalPosition;
                if (Vector3.DistanceSquared(from, to) > radiusSquared) continue;
                world.Get<AbilityComponent>(life).Activate<PickupAbility, PickupAbility.Input>(
                    new PickupAbility.Input { Target = itemId });
            }
        }
    }

    private static void EnsureMatch(BomberMatchState match, IBomberConfig config, World world)
    {
        if (match.MatchId.Value != 0) return;
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        if (runtime.ParticipantIds.Count != config.Game.PlayerCount) return;
        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>())
            if (participant.MatchId.Value != 0 || participant.CurrentLife.Value.IsDefault ||
                !world.IsLive(participant.CurrentLife.Value)) return;
        match.MatchId.Value = 1;
        match.MatchIndex.Value = 1;
        match.Seed.Value = 0xB0B3A101UL;
        match.ConfigHash.Value = config.Game.Name + ":" + config.Game.Id;
        match.StartTick.Value = world.Tick;
        match.PhaseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Game.WarmupMs, config.Game.TickRateHz));
        match.Phase.Value = (int)BomberMatchPhase.Warmup;
        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>())
        {
            participant.MatchId.Value = match.MatchId.Value;
            LatchCharacter(world, participant, config);
        }
        ulong sequence = BomberMatchRules.Emit(world, "match_started", match.MatchId.Value);
        world.Single<BomberPresentationJournal>().Append(world, "match_started", match.MatchId.Value, sequence);
    }

    private static void EnsureParticipants(World world, BomberMatchState match, IBomberConfig config)
    {
        var players = world.Each<BomberPlayerState>().OrderBy(player => player.Entity.Counter).ToArray();
        BomberParticipantState[] participants = world.Each<BomberParticipantState>()
            .OrderBy(participant => participant.Slot.Value).ThenBy(participant => participant.Entity).ToArray();
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        if (participants.Length != 0)
        {
            if (runtime.ParticipantIds.Count == 0 && participants.Length == config.Game.PlayerCount &&
                participants.Select((participant, index) => participant.Slot.Value == index).All(valid => valid))
                runtime.SetParticipants(participants.Select(participant => participant.Entity).ToArray(), config);
            foreach (BomberParticipantState participant in participants)
            {
                if (participant.DeathStructurePending.Value && participant.CurrentLife.Value.IsDefault)
                    BindPendingSuccessor(world, participant, match, config);
                if (participant.CurrentLife.Value.IsDefault || !world.IsLive(participant.CurrentLife.Value)) continue;
                BomberPlayerState body = world.Get<BomberPlayerState>(participant.CurrentLife.Value);
                if (!body.Participant.Value.IsDefault && body.Participant.Value != participant.Entity)
                    throw new InvalidOperationException("Player life is already assigned to another participant.");
                body.Participant.Value = participant.Entity;
                body.ParticipantIndex.Value = participant.Slot.Value;
                BindSelectedLife(world, participant, config);
            }
            return;
        }
        if (runtime.ParticipantIds.Count != 0 || match.MatchId.Value != 0 || players.Length != config.Game.PlayerCount)
            return;
        ulong protectionTicks = Ticks.FromMilliseconds(config.Life.ProtectionMs, config.Game.TickRateHz);
        int slot = 0;
        foreach (BomberPlayerState player in players)
        {
            if (slot >= config.Game.PlayerCount) break;
            if (world.Each<BomberParticipantState>().Any(existing => existing.CurrentLife.Value == player.Entity))
            {
                slot++;
                continue;
            }
            if (player.Participant.Value.IsDefault)
            {
                EntityOrder order = world.Commands.Create<BomberParticipantEntity>();
                BomberParticipantState participant = order.Get<BomberParticipantState>();
                participant.Slot.Value = slot;
                participant.MatchId.Value = match.MatchId.Value;
                participant.LifePhase.Value = (int)(config.Life.FirstSpawnProtected ? BomberLifePhase.Protected : BomberLifePhase.Vulnerable);
                participant.CurrentLife.Value = player.Entity;
                participant.LastLife.Value = player.Entity;
                participant.LifeGeneration.Value = 1;
                participant.NextCharacterId.Value = player.NextCharacterId.Value;
                player.ParticipantIndex.Value = slot;
                player.LifeGeneration.Value = participant.LifeGeneration.Value;
                BindSelectedLife(world, participant, config);
                player.LifePhase.Value = participant.LifePhase.Value;
                player.ProtectedUntilTick.Value = config.Life.FirstSpawnProtected ? checked(world.Tick + protectionTicks) : 0;
                player.RespawnAtTick.Value = 0;
                player.Facing.Value = (int)BomberDirection.Down;
                MoveAbility.WritePosition(world, player.Entity, SpawnPosition(config.Map, slot), nameof(MoveAbility));
            }
            slot++;
        }

    }

    private static void UpdatePlayers(World world, BomberMatchState match, IBomberConfig config)
    {
        ulong protectionTicks = Ticks.FromMilliseconds(config.Life.ProtectionMs, config.Game.TickRateHz);
        foreach (BomberPlayerState player in world.Each<BomberPlayerState>().ToArray())
        {
            BomberSkillState skill = world.Get<BomberSkillState>(player.Entity);
            if (skill.BubbleUntilTick.Value <= world.Tick) skill.BubbleUntilTick.Value = 0;
            if (skill.AuraUntilTick.Value <= world.Tick) skill.AuraUntilTick.Value = 0;
            if (skill.FrozenUntilTick.Value <= world.Tick) skill.FrozenUntilTick.Value = 0;
            if (player.LifePhase.Value == (int)BomberLifePhase.Protected
                && player.ProtectedUntilTick.Value != 0 && player.ProtectedUntilTick.Value <= world.Tick)
                player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
            if (player.LifePhase.Value == (int)BomberLifePhase.AwaitingRespawn &&
                player.RespawnAtTick.Value <= world.Tick && (BomberMatchPhase)match.Phase.Value != BomberMatchPhase.FinalCircle)
            {
                BomberParticipantState participant = player.Participant.Value.IsDefault
                    ? throw new InvalidOperationException("A respawning player must have a participant.")
                    : world.Get<BomberParticipantState>(player.Participant.Value);
                PreparePendingRespawn(world, participant, player);
                QueueSuccessor(world, participant, player, config, protectionTicks);
                continue;
            }
            if (!player.Participant.Value.IsDefault && world.IsLive(player.Participant.Value))
                SyncParticipantLifecycle(world.Get<BomberParticipantState>(player.Participant.Value), player);
            BomberMatchRules.SyncDerivedPlayerState(world, player);
        }
    }

    private static void SyncParticipantLifecycle(BomberParticipantState participant, BomberPlayerState player)
    {
        if (participant.CurrentLife.Value != player.Entity) return;
        participant.LifePhase.Value = player.LifePhase.Value;
        participant.RespawnAtTick.Value = player.RespawnAtTick.Value;
        participant.EliminatedTick.Value = player.EliminatedTick.Value;
    }

    private static void QueueSuccessor(World world, BomberParticipantState participant,
        BomberPlayerState oldLife, IBomberConfig config, ulong protectionTicks)
    {
        if (!participant.DeathStructurePending.Value || participant.CurrentLife.Value != default)
            throw new InvalidOperationException("A respawning participant must have one pending destroyed life.");
        if (participant.DeathStructureLife.Value != oldLife.Entity || participant.LastLife.Value != oldLife.Entity)
            throw new InvalidOperationException("A respawn successor must replace the pending life.");

        ulong previousGeneration = participant.LifeGeneration.Value;
        ulong successorGeneration = checked(previousGeneration + 1UL);
        if (participant.SelectedForMatchCharacterId.Value > 0 &&
            SelectCharacterAbility.TryConfiguredCharacter(config,
                checked((uint)participant.SelectedForMatchCharacterId.Value), out CharactersRow selected))
            SelectCharacterAbility.BindCharacter(world.Get<BomberSkillState>(oldLife.Entity), selected);
        CaptureRespawnCarry(world, participant, oldLife.Entity);

        EntityOrder order = world.Commands.Create<PlayerEntity>();
        IdentityComponent identity = order.Get<IdentityComponent>();
        IdentityComponent oldIdentity = world.Get<IdentityComponent>(oldLife.Entity);
        EcsRegistry.Generated(identity)!.WriteField("accountId", oldIdentity.AccountId.Value, silent: true);
        EcsRegistry.Generated(identity)!.WriteField("name", oldIdentity.Name.Value, silent: true);

        BomberPlayerState successor = order.Get<BomberPlayerState>();
        successor.Participant.Value = participant.Entity;
        successor.LifeGeneration.Value = successorGeneration;
        successor.LifePhase.Value = (int)BomberLifePhase.Protected;
        successor.ParticipantIndex.Value = participant.Slot.Value;
        successor.Facing.Value = (int)BomberDirection.Down;
        successor.RespawnAtTick.Value = 0;
        successor.ProtectedUntilTick.Value = checked(world.Tick + protectionTicks);
        successor.EliminatedTick.Value = 0;
        successor.NextCharacterId.Value = 0;

        var position = SpawnPosition(config.Map, participant.Slot.Value);
        EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
            FormattableString.Invariant($"{position.X:R},{position.Y:R},{position.Z:R}"), silent: true);

        participant.LifeGeneration.Value = successorGeneration;
        participant.DeathStructureGeneration.Value = successorGeneration;
        participant.LifePhase.Value = successor.LifePhase.Value;
        participant.RespawnAtTick.Value = 0;
        participant.DeathTick.Value = 0;
        participant.EliminatedTick.Value = 0;
        world.Commands.Destroy(oldLife.Entity);
    }

    private static void PreparePendingRespawn(World world, BomberParticipantState participant,
        BomberPlayerState oldLife)
    {
        if (participant.DeathStructurePending.Value && participant.CurrentLife.Value.IsDefault)
            return;
        if (participant.CurrentLife.Value != oldLife.Entity || participant.LastLife.Value != oldLife.Entity)
            throw new InvalidOperationException("A respawning participant must own its current life.");
        participant.CurrentLife.Value = default;
        participant.LastLife.Value = oldLife.Entity;
        participant.DeathStructurePending.Value = true;
        participant.DeathStructureLife.Value = oldLife.Entity;
        participant.DeathStructureGeneration.Value = participant.LifeGeneration.Value;
        participant.DeathStructureTick.Value = world.Tick;
    }

    private static void BindPendingSuccessor(World world, BomberParticipantState participant,
        BomberMatchState match, IBomberConfig config)
    {
        if (!participant.DeathStructurePending.Value || !participant.CurrentLife.Value.IsDefault)
            return;
        NetEntityId pendingLife = participant.DeathStructureLife.Value;
        BomberPlayerState? successor = null;
        foreach (BomberPlayerState candidate in world.Each<BomberPlayerState>())
        {
            if (!world.IsLive(candidate.Entity) || candidate.Entity == pendingLife ||
                candidate.Participant.Value != participant.Entity ||
                candidate.LifeGeneration.Value != participant.DeathStructureGeneration.Value) continue;
            if (successor is not null)
                throw new InvalidOperationException("A participant received multiple successor lives.");
            successor = candidate;
        }
        if (successor is null) return;

        RestoreRespawnCarry(world, participant, successor.Entity, config);
        participant.CurrentLife.Value = successor.Entity;
        participant.LastLife.Value = successor.Entity;
        participant.LifePhase.Value = successor.LifePhase.Value;
        participant.RespawnAtTick.Value = successor.RespawnAtTick.Value;
        participant.DeathTick.Value = 0;
        participant.EliminatedTick.Value = 0;
        participant.DeathStructurePending.Value = false;
        participant.DeathStructureLife.Value = default;
        participant.DeathStructureGeneration.Value = 0;
        participant.DeathStructureTick.Value = 0;
        BindSelectedLife(world, participant, config);
        BomberMatchRules.SyncDerivedPlayerState(world, successor);

        ulong sequence = BomberMatchRules.Emit(world, "player_respawned", match.MatchId.Value,
            $"player={successor.Entity.ToHex()}");
        var position = world.Get<LogicTransform>(successor.Entity).LocalPosition;
        world.Single<BomberPresentationJournal>().Append(world, "respawn", match.MatchId.Value, sequence,
            participant.Entity, successor.Entity, successor.LifeGeneration.Value,
            x: BomberMatchRules.CellX(position), z: BomberMatchRules.CellZ(position),
            data: new Dictionary<string, string> {
                ["previousLifeGeneration"] = (successor.LifeGeneration.Value - 1UL).ToString(CultureInfo.InvariantCulture),
                ["protectedUntilTick"] = successor.ProtectedUntilTick.Value.ToString(CultureInfo.InvariantCulture) });
    }

    private static void CaptureRespawnCarry(World world, BomberParticipantState participant, NetEntityId life)
    {
        AttributeComponent attributes = world.Get<AttributeComponent>(life);
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        BomberRespawnCarry carry = world.Get<BomberRespawnCarry>(participant.Entity);
        carry.CarryPresent.Value = true;
        carry.PowerBase.Value = checked((int)attributes.GetBaseValue(BomberAttributeNames.BombPower));
        carry.CapacityBase.Value = checked((int)attributes.GetBaseValue(BomberAttributeNames.BombCapacity));
        carry.SpeedTierBase.Value = checked((int)attributes.GetBaseValue(BomberAttributeNames.SpeedTier));
        carry.AvailableBombs.Value = checked((int)attributes.GetBaseValue(BomberAttributeNames.AvailableBombs));
        carry.CharacterId.Value = checked((int)skill.CharacterId.Value);
        carry.BombSkillId.Value = checked((int)skill.BombSkillId.Value);
        carry.BombLevel.Value = skill.BombSkillLevel.Value;
        carry.BombBound.Value = skill.BombSkillBound.Value;
        carry.BombCombinationOriginA.Value = checked((int)skill.ComboSourceA.Value);
        carry.BombOriginALevel.Value = skill.ComboLevelA.Value;
        carry.BombOriginABound.Value = skill.BombSkillBound.Value;
        carry.BombCombinationOriginB.Value = checked((int)skill.ComboSourceB.Value);
        carry.BombOriginBLevel.Value = skill.ComboLevelB.Value;
        carry.BombOriginBBound.Value = skill.BombSkillBound.Value;
        carry.ActiveSkillId.Value = checked((int)skill.ActiveSkillId.Value);
        carry.ActiveLevel.Value = skill.ActiveSkillLevel.Value;
        carry.ActiveBound.Value = skill.ActiveSkillBound.Value;
        carry.ActiveCombinationOriginA.Value = checked((int)skill.ComboSourceA.Value);
        carry.ActiveOriginALevel.Value = skill.ComboLevelA.Value;
        carry.ActiveOriginABound.Value = skill.ActiveSkillBound.Value;
        carry.ActiveCombinationOriginB.Value = checked((int)skill.ComboSourceB.Value);
        carry.ActiveOriginBLevel.Value = skill.ComboLevelB.Value;
        carry.ActiveOriginBBound.Value = skill.ActiveSkillBound.Value;
        carry.PassiveSkillId.Value = checked((int)skill.PassiveSkillId.Value);
        carry.PassiveLevel.Value = skill.PassiveSkillLevel.Value;
        carry.PassiveBound.Value = skill.PassiveSkillBound.Value;
        carry.PassiveCombinationOriginA.Value = checked((int)skill.ComboSourceA.Value);
        carry.PassiveOriginALevel.Value = skill.ComboLevelA.Value;
        carry.PassiveOriginABound.Value = skill.PassiveSkillBound.Value;
        carry.PassiveCombinationOriginB.Value = checked((int)skill.ComboSourceB.Value);
        carry.PassiveOriginBLevel.Value = skill.ComboLevelB.Value;
        carry.PassiveOriginBBound.Value = skill.PassiveSkillBound.Value;
    }

    private static void RestoreRespawnCarry(World world, BomberParticipantState participant,
        NetEntityId life, IBomberConfig config)
    {
        BomberRespawnCarry carry = world.Get<BomberRespawnCarry>(participant.Entity);
        if (!carry.CarryPresent.Value) return;
        AttributeComponent attributes = world.Get<AttributeComponent>(life);
        SetAttribute(attributes, BomberAttributeNames.BombPower, carry.PowerBase.Value);
        SetAttribute(attributes, BomberAttributeNames.BombCapacity, carry.CapacityBase.Value);
        SetAttribute(attributes, BomberAttributeNames.SpeedTier, carry.SpeedTierBase.Value);
        long speed = config.SpeedTier(carry.SpeedTierBase.Value).SpeedMilli;
        SetAttribute(attributes, BomberAttributeNames.MovementSpeedMilli, speed);
        long available = Math.Clamp(carry.AvailableBombs.Value, 0, carry.CapacityBase.Value);
        SetAttribute(attributes, BomberAttributeNames.AvailableBombs, available);
        long health = config.Life.PointsPerHeart * 3L;
        SetAttribute(attributes, BomberAttributeNames.HealthPoints, health);

        BomberSkillState skill = world.Get<BomberSkillState>(life);
        skill.CharacterId.Value = checked((uint)Math.Max(0, carry.CharacterId.Value));
        skill.BombSkillId.Value = checked((uint)Math.Max(0, carry.BombSkillId.Value));
        skill.BombSkillLevel.Value = carry.BombLevel.Value;
        skill.BombSkillBound.Value = carry.BombBound.Value;
        skill.ActiveSkillId.Value = checked((uint)Math.Max(0, carry.ActiveSkillId.Value));
        skill.ActiveSkillLevel.Value = carry.ActiveLevel.Value;
        skill.ActiveSkillBound.Value = carry.ActiveBound.Value;
        skill.PassiveSkillId.Value = checked((uint)Math.Max(0, carry.PassiveSkillId.Value));
        skill.PassiveSkillLevel.Value = carry.PassiveLevel.Value;
        skill.PassiveSkillBound.Value = carry.PassiveBound.Value;
        skill.ComboSourceA.Value = checked((uint)Math.Max(0, carry.BombCombinationOriginA.Value));
        skill.ComboLevelA.Value = carry.BombOriginALevel.Value;
        skill.ComboSourceB.Value = checked((uint)Math.Max(0, carry.BombCombinationOriginB.Value));
        skill.ComboLevelB.Value = carry.BombOriginBLevel.Value;
        skill.CooldownFromTick.Value = 0;
        skill.CooldownUntilTick.Value = 0;
        skill.BubbleUntilTick.Value = 0;
        skill.AuraUntilTick.Value = 0;
        skill.FrozenUntilTick.Value = 0;
        skill.FreezeImmuneUntilTick.Value = 0;
        skill.ToxinUntilTick.Value = 0;
        skill.ShockUntilTick.Value = 0;
        skill.ToxinSource.Value = default;
        skill.LastDamageTick.Value = 0;
        skill.RegenNextTick.Value = 0;
        skill.TeleportSequence.Value = 0;
        carry.CarryPresent.Value = false;
    }

    private static void SetAttribute(AttributeComponent attributes, string name, long value)
    {
        attributes.SetBaseValue(name, value);
        attributes.SetCurrentValue(name, value);
    }

    private static void ProcessBombs(World world, BomberMatchState match, IBomberConfig config)
    {
        using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.Bomb);
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            BomberBombLifecycle.Ensure(world, bomb, definition);
            if (bomb.PlacementRecorded.Value) continue;
            var position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            world.Single<BomberPresentationJournal>().Append(world, "bomb_placed", match.MatchId.Value,
                world.Single<BomberWorldRuntime>().AllocateEventSequence(),
                bomb.Owner.Value, bomb.SourceLife.Value, bomb.SourceLifeGeneration.Value,
                entity: bomb.Entity, x: BomberMatchRules.CellX(position), z: BomberMatchRules.CellZ(position),
                data: new Dictionary<string, string> { ["bombKind"] = bomb.BombKind.Value.ToString(CultureInfo.InvariantCulture),
                    ["power"] = bomb.Power.Value.ToString(CultureInfo.InvariantCulture),
                    ["fuseEndTick"] = bomb.FuseEndTick.Value.ToString(CultureInfo.InvariantCulture),
                    ["chainId"] = bomb.ChainId.Value.ToString(CultureInfo.InvariantCulture) },
                occurredTick: bomb.PlacedAtTick.Value);
            bomb.PlacementRecorded.Value = true;
        }
        BomberBombKick.Advance(world, definition);
        var due = new Queue<BomberBombState>(world.Each<BomberBombState>()
            .Where(bomb => bomb.Phase.Value == (int)BomberBombPhase.Fuse && bomb.FuseEndTick.Value <= world.Tick));
        var chained = new HashSet<NetEntityId>();
        var chainCounts = new Dictionary<ulong, int>();
        while (due.Count != 0)
        {
            BomberBombState bomb = due.Dequeue();
            if (!world.IsLive(bomb.Entity) || bomb.Phase.Value != (int)BomberBombPhase.Fuse) continue;
            BomberBombLifecycle.Send(world, bomb, definition, BomberHfsmDefinitions.EventId.FuseElapsed);
            Explode(world, match, config, bomb, due, chained, chainCounts);
        }
        foreach (BomberBombState bomb in world.Each<BomberBombState>().ToArray())
        {
            if (!world.IsLive(bomb.Entity)) continue;
            if (bomb.Phase.Value == (int)BomberBombPhase.Danger && bomb.DangerUntilTick.Value <= world.Tick)
            {
                BomberBombLifecycle.Send(world, bomb, definition, BomberHfsmDefinitions.EventId.DangerElapsed);
            }
            else if (bomb.Phase.Value == (int)BomberBombPhase.Burn && bomb.BurnUntilTick.Value <= world.Tick)
            {
                BomberBombLifecycle.Send(world, bomb, definition, BomberHfsmDefinitions.EventId.BurnElapsed);
            }
        }
    }

    private static void Explode(World world, BomberMatchState match, IBomberConfig config, BomberBombState bomb,
        Queue<BomberBombState> due, HashSet<NetEntityId> chained, Dictionary<ulong, int> chainCounts)
    {
        bomb.ReachUp.Value = bomb.Power.Value;
        bomb.ReachDown.Value = bomb.Power.Value;
        bomb.ReachLeft.Value = bomb.Power.Value;
        bomb.ReachRight.Value = bomb.Power.Value;
        int chainLength = chainCounts.TryGetValue(bomb.ChainId.Value, out int priorCount)
            ? checked(priorCount + 1) : 1;
        chainCounts[bomb.ChainId.Value] = chainLength;
        if (!bomb.Owner.Value.IsDefault && world.IsLive(bomb.Owner.Value)
            && world.TypeOf(bomb.Owner.Value).Is<BomberParticipantEntity>())
        {
            BomberStatistics statistics = world.Get<BomberStatistics>(bomb.Owner.Value);
            statistics.BestChain.Value = Math.Max(statistics.BestChain.Value, chainLength);
        }
        var origin = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
        int originX = BomberMatchRules.CellX(origin);
        int originZ = BomberMatchRules.CellZ(origin);
        var cells = new List<(int X, int Z)> { (originX, originZ) };
        foreach ((int dx, int dz) in new[] { (0, -1), (1, 0), (0, 1), (-1, 0) })
        {
            for (int step = 1; step <= Math.Max(0, bomb.Power.Value); step++)
            {
                int x = originX + dx * step;
                int z = originZ + dz * step;
                MapRow map = config.Map;
                if (x < map.BoundaryCells || z < map.BoundaryCells || x >= map.Width - map.BoundaryCells || z >= map.Depth - map.BoundaryCells) break;
                cells.Add((x, z));
            }
        }
        ulong sequence = BomberMatchRules.Emit(world, "bomb_detonated", match.MatchId.Value,
            $"bomb={bomb.Entity.ToHex()} chainId={bomb.ChainId.Value}");
        world.Single<BomberPresentationJournal>().Append(world, "bomb_exploded", match.MatchId.Value, sequence,
            bomb.Owner.Value, bomb.SourceLife.Value, bomb.SourceLifeGeneration.Value, entity: bomb.Entity,
            x: originX, z: originZ,
            data: new Dictionary<string, string> { ["bombKind"] = bomb.BombKind.Value.ToString(CultureInfo.InvariantCulture),
                ["power"] = bomb.Power.Value.ToString(CultureInfo.InvariantCulture),
                ["chainId"] = bomb.ChainId.Value.ToString(CultureInfo.InvariantCulture),
                ["cellCount"] = cells.Count.ToString(CultureInfo.InvariantCulture),
                ["indexInChain"] = chainLength.ToString(CultureInfo.InvariantCulture) });
        for (int i = 0; i < cells.Count; i++)
        {
            (int x, int z) = cells[i];
            ApplyBlastCell(world, match, bomb, x, z);
            if (i == 0) continue;
            BomberBombState? chainedBomb = BomberMatchRules.FindBombAt(world, x, z, bomb.Entity);
            if (chainedBomb is not null && chainedBomb.Phase.Value == (int)BomberBombPhase.Fuse && chained.Add(chainedBomb.Entity))
            {
                chainedBomb.FuseEndTick.Value = world.Tick;
                chainedBomb.ChainId.Value = bomb.ChainId.Value;
                due.Enqueue(chainedBomb);
            }
        }
        BomberMatchRules.Emit(world, "chain_resolved", match.MatchId.Value,
            $"chainId={bomb.ChainId.Value}");
    }

    private static void ApplyBlastCell(World world, BomberMatchState match, BomberBombState bomb, int x, int z)
    {
        NetEntityId playerId = BomberMatchRules.FindPlayerAt(world, x, z);
        if (playerId.IsDefault) return;
        BomberPlayerState player = world.Get<BomberPlayerState>(playerId);
        BomberSkillState skills = world.Get<BomberSkillState>(playerId);
        if (player.LifePhase.Value == (int)BomberLifePhase.Eliminated || skills.BubbleUntilTick.Value > world.Tick
            || player.ProtectedUntilTick.Value > world.Tick) return;
        if (player.Participant.Value.IsDefault || player.LifeGeneration.Value == 0) return;
        if (!bomb.Owner.Value.IsDefault && bomb.Owner.Value == player.Participant.Value &&
            !IsCurrentSourceForOwner(world, bomb))
            return;
        var target = new BomberTargetIdentity(player.Participant.Value, playerId, player.LifeGeneration.Value);
        if (bomb.TryReserveHit(target) != BomberStorageAdmission.Added) return;
        AttributeComponent attributes = world.Get<AttributeComponent>(playerId);
        long previousHealth = attributes.GetCurrentValue(BomberAttributeNames.HealthPoints);
        long health = Math.Max(0, previousHealth - BomberMatchRules.HalfHeartsPerBomb);
        // Health has no persistent modifier layer in the Bomber model: damage updates the
        // authoritative BASE ledger, and CURRENT mirrors it for the Aoi-facing value. Writing
        // only CURRENT is lost when the next attribute evaluation rebuilds CURRENT from BASE.
        attributes.SetBaseValue(BomberAttributeNames.HealthPoints, health);
        attributes.SetCurrentValue(BomberAttributeNames.HealthPoints, health);
        _ = bomb.CommitContact(target);
        ulong sequence = BomberMatchRules.Emit(world, "damage_applied", match.MatchId.Value,
            $"source={bomb.Entity.ToHex()} target={playerId.ToHex()} cause={(int)BomberDamageCause.Explosion}");
        var journal = world.Single<BomberPresentationJournal>();
        var damageData = new Dictionary<string, string> {
            ["appliedPoints"] = (previousHealth - health).ToString(CultureInfo.InvariantCulture),
            ["healthPointsLeft"] = health.ToString(CultureInfo.InvariantCulture),
            ["bombId"] = bomb.Entity.ToHex(),
            ["chainId"] = bomb.ChainId.Value.ToString(CultureInfo.InvariantCulture) };
        journal.Append(world, "damage_applied", match.MatchId.Value, sequence,
            player.Participant.Value, playerId, player.LifeGeneration.Value,
            bomb.Owner.Value, bomb.SourceLife.Value, bomb.Entity, x, z, "explosion", damageData);
        if (health > 0) return;
        player.LifePhase.Value = BomberMatchRules.IsInFinalCircle(world)
            ? (int)BomberLifePhase.Eliminated : (int)BomberLifePhase.AwaitingRespawn;
        player.EliminatedTick.Value = BomberMatchRules.IsInFinalCircle(world) ? world.Tick : 0;
        player.RespawnAtTick.Value = BomberMatchRules.IsInFinalCircle(world)
            ? 0 : checked(world.Tick + Ticks.FromMilliseconds(BomberConfigBinding.For(world).Life.RespawnMs,
                BomberConfigBinding.For(world).Game.TickRateHz));
        attributes.SetBaseValue(BomberAttributeNames.HealthPoints, 0);
        attributes.SetCurrentValue(BomberAttributeNames.HealthPoints, 0);
        if (!player.Participant.Value.IsDefault && world.IsLive(player.Participant.Value))
        {
            BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
            if (player.LifePhase.Value == (int)BomberLifePhase.AwaitingRespawn)
            {
                CaptureRespawnCarry(world, participant, player.Entity);
                participant.CurrentLife.Value = default;
                participant.DeathStructurePending.Value = true;
                participant.DeathStructureLife.Value = player.Entity;
                participant.DeathStructureGeneration.Value = player.LifeGeneration.Value;
                participant.DeathStructureTick.Value = world.Tick;
            }
            else
            {
                participant.CurrentLife.Value = player.Entity;
                participant.DeathStructurePending.Value = false;
                participant.DeathStructureLife.Value = default;
                participant.DeathStructureGeneration.Value = 0;
                participant.DeathStructureTick.Value = 0;
            }
            participant.LastLife.Value = player.Entity;
            participant.LifePhase.Value = player.LifePhase.Value;
            participant.DeathTick.Value = world.Tick;
            participant.RespawnAtTick.Value = player.RespawnAtTick.Value;
            participant.EliminatedTick.Value = player.EliminatedTick.Value;
        }
        journal.Append(world, "death", match.MatchId.Value, world.Single<BomberWorldRuntime>().AllocateEventSequence(),
            player.Participant.Value, playerId, player.LifeGeneration.Value,
            bomb.Owner.Value, bomb.SourceLife.Value, bomb.Entity, x, z, "explosion",
            new Dictionary<string, string> { ["eliminated"] = (player.LifePhase.Value == (int)BomberLifePhase.Eliminated).ToString().ToLowerInvariant(),
                ["chainId"] = bomb.ChainId.Value.ToString(CultureInfo.InvariantCulture) });
    }

    private static bool IsCurrentSourceForOwner(World world, BomberBombState bomb)
    {
        if (bomb.Owner.Value.IsDefault || !world.IsLive(bomb.Owner.Value) ||
            !world.TypeOf(bomb.Owner.Value).Is<BomberParticipantEntity>()) return false;
        BomberParticipantState owner = world.Get<BomberParticipantState>(bomb.Owner.Value);
        return owner.CurrentLife.Value == bomb.SourceLife.Value &&
            owner.LifeGeneration.Value == bomb.SourceLifeGeneration.Value &&
            world.IsLive(bomb.SourceLife.Value) && world.TypeOf(bomb.SourceLife.Value).Is<PlayerEntity>();
    }

    private static void AdvanceMatch(World world, BomberMatchState match, IBomberConfig config)
    {
        BomberMatchPhase phase = (BomberMatchPhase)match.Phase.Value;
        if (phase == BomberMatchPhase.Warmup && world.Tick >= match.PhaseEndTick.Value)
        {
            match.Phase.Value = (int)BomberMatchPhase.Running;
            match.StartTick.Value = world.Tick;
            match.PhaseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Game.MatchDurationMs, config.Game.TickRateHz));
        }
        else if (phase == BomberMatchPhase.Running && world.Tick >= match.PhaseEndTick.Value -
            Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz))
        {
            match.Phase.Value = (int)BomberMatchPhase.FinalCircle;
            match.PhaseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz));
            BomberFinalCircleState circle = world.Single<BomberFinalCircleState>();
            circle.TriggerTick.Value = world.Tick;
            circle.TriggerReason.Value = (int)BomberEndReason.TimeLimit;
            circle.Phase.Value = (int)BomberMatchPhase.FinalCircle;
            ulong sequence = BomberMatchRules.Emit(world, "final_circle_started", match.MatchId.Value);
            world.Single<BomberPresentationJournal>().Append(world, "final_circle_start", match.MatchId.Value, sequence,
                cause: "time_limit", data: new Dictionary<string, string> {
                    ["endTick"] = match.PhaseEndTick.Value.ToString(CultureInfo.InvariantCulture) });
        }
        else if (phase == BomberMatchPhase.FinalCircle)
        {
            int alive = BomberMatchRules.CountAlive(world);
            if (alive <= 1 || world.Tick >= match.PhaseEndTick.Value) EndMatch(world, match, alive);
        }
        else if (phase == BomberMatchPhase.Podium && world.Tick >= match.PhaseEndTick.Value)
        {
            match.Phase.Value = (int)BomberMatchPhase.Results;
            match.PhaseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Game.ResultsMs, config.Game.TickRateHz));
        }
        else if (phase == BomberMatchPhase.Results && world.Tick >= match.PhaseEndTick.Value)
        {
            match.MatchIndex.Value++;
            match.MatchId.Value++;
            ResetForNextMatch(world, match, config);
            world.Single<BomberPresentationJournal>().Reset();
            match.StartTick.Value = world.Tick;
            match.PhaseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Game.WarmupMs, config.Game.TickRateHz));
            match.Phase.Value = (int)BomberMatchPhase.Warmup;
            ulong sequence = BomberMatchRules.Emit(world, "next_match_started", match.MatchId.Value, "sameRoom=true");
            world.Single<BomberPresentationJournal>().Append(world, "match_started", match.MatchId.Value, sequence);
        }
    }

    private static void ResetForNextMatch(World world, BomberMatchState match, IBomberConfig config)
    {
        ulong protectionTicks = Ticks.FromMilliseconds(config.Life.ProtectionMs, config.Game.TickRateHz);
        match.EndTick.Value = 0;
        match.EndReason.Value = (int)BomberEndReason.None;
        match.Winner.Value = default;
        match.SurvivorCount.Value = 0;
        BomberFinalCircleState circle = world.Single<BomberFinalCircleState>();
        circle.TriggerTick.Value = 0;
        circle.TriggerReason.Value = (int)BomberEndReason.None;
        circle.InitialResourceCount.Value = 0;
        circle.RemainingResourceCount.Value = 0;
        circle.RegenStopTick.Value = 0;
        circle.CurrentStageId.Value = 0;
        circle.NextStageId.Value = 0;
        circle.CurrentSide.Value = 0;
        circle.NextSide.Value = 0;
        circle.NextAnnounceTick.Value = 0;
        circle.NextEffectiveTick.Value = 0;
        circle.PoisonPoints.Value = 0;
        circle.Phase.Value = 0;

        foreach (BomberBombState bomb in world.Each<BomberBombState>().ToArray())
            world.Commands.Destroy(bomb.Entity);

        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>())
        {
            participant.MatchId.Value = match.MatchId.Value;
            participant.LifePhase.Value = (int)BomberLifePhase.Protected;
            participant.DeathTick.Value = 0;
            participant.RespawnAtTick.Value = 0;
            participant.EliminatedTick.Value = 0;
            participant.PendingFinalRespawn.Value = false;
            participant.DeathStructurePending.Value = false;
            participant.DeathStructureLife.Value = default;
            participant.DeathStructureGeneration.Value = 0;
            participant.DeathStructureTick.Value = 0;
            participant.LifeGeneration.Value = 1;
            LatchCharacter(world, participant, config);
            BomberStatistics statistics = world.Get<BomberStatistics>(participant.Entity);
            statistics.Kills.Value = 0;
            statistics.Bombs.Value = 0;
            statistics.DestroyedBlocks.Value = 0;
            statistics.Pickups.Value = 0;
            statistics.BestChain.Value = 0;
            statistics.PeakHats.Value = 0;
            statistics.HatKingTicks.Value = 0;
            statistics.SkillCasts.Value = 0;
            statistics.Evolutions.Value = 0;
            if (participant.CurrentLife.Value.IsDefault || !world.IsLive(participant.CurrentLife.Value)) continue;
            BomberPlayerState player = world.Get<BomberPlayerState>(participant.CurrentLife.Value);
            player.LifeGeneration.Value = 1;
            player.LifePhase.Value = (int)BomberLifePhase.Protected;
            player.RespawnAtTick.Value = 0;
            player.ProtectedUntilTick.Value = checked(world.Tick + protectionTicks);
            player.EliminatedTick.Value = 0;
            player.Facing.Value = (int)BomberDirection.Down;
            AttributeComponent attributes = world.Get<AttributeComponent>(player.Entity);
            long resetHealth = config.Life.PointsPerHeart * 3;
            attributes.SetBaseValue(BomberAttributeNames.HealthPoints, resetHealth);
            attributes.SetCurrentValue(BomberAttributeNames.HealthPoints, resetHealth);
            attributes.SetCurrentValue(BomberAttributeNames.AvailableBombs,
                Math.Max(1, attributes.GetCurrentValue(BomberAttributeNames.BombCapacity)));
            MoveAbility.WritePosition(world, player.Entity, SpawnPosition(config.Map, participant.Slot.Value), nameof(MoveAbility));
            BomberMatchRules.SyncDerivedPlayerState(world, player);
        }
    }

    private static void LatchCharacter(World world, BomberParticipantState participant, IBomberConfig config)
    {
        int selected = participant.SelectedForMatchCharacterId.Value;
        int pending = participant.NextCharacterId.Value;
        if (pending > 0 && SelectCharacterAbility.TryConfiguredCharacter(config, (uint)pending, out _))
            selected = pending;
        else if (selected <= 0 || !SelectCharacterAbility.TryConfiguredCharacter(config, (uint)selected, out _))
        {
            selected = 0;
            if (!participant.CurrentLife.Value.IsDefault && world.IsLive(participant.CurrentLife.Value))
            {
                uint existing = world.Get<BomberSkillState>(participant.CurrentLife.Value).CharacterId.Value;
                if (SelectCharacterAbility.TryConfiguredCharacter(config, existing, out _))
                    selected = checked((int)existing);
            }
        }
        participant.SelectedForMatchCharacterId.Value = selected;
        participant.NextCharacterId.Value = 0;
        if (participant.CurrentLife.Value.IsDefault || !world.IsLive(participant.CurrentLife.Value)) return;
        world.Get<BomberPlayerState>(participant.CurrentLife.Value).NextCharacterId.Value = 0;
        BindSelectedLife(world, participant, config);
    }

    private static void BindSelectedLife(World world, BomberParticipantState participant, IBomberConfig config)
    {
        int selected = participant.SelectedForMatchCharacterId.Value;
        if (selected <= 0 || !SelectCharacterAbility.TryConfiguredCharacter(config, (uint)selected, out CharactersRow row)) return;
        NetEntityId life = participant.CurrentLife.Value;
        if (life.IsDefault || !world.IsLive(life)) return;
        BomberSkillState skill = world.Get<BomberSkillState>(life);
        if (skill.CharacterId.Value == row.Id &&
            skill.ActiveSkillId.Value == (row.BoundSlot == "Active" ? row.BoundSkillId : 0u) &&
            skill.ActiveSkillLevel.Value == (row.BoundSlot == "Active" ? row.BoundLevel : 0) &&
            skill.ActiveSkillBound.Value == (row.BoundSlot == "Active") &&
            skill.PassiveSkillId.Value == (row.BoundSlot == "Passive" ? row.BoundSkillId : 0u) &&
            skill.PassiveSkillLevel.Value == (row.BoundSlot == "Passive" ? row.BoundLevel : 0) &&
            skill.PassiveSkillBound.Value == (row.BoundSlot == "Passive")) return;
        SelectCharacterAbility.BindCharacter(skill, row);
    }

    private static void EndMatch(World world, BomberMatchState match, int alive)
    {
        if ((BomberMatchPhase)match.Phase.Value != BomberMatchPhase.FinalCircle) return;
        match.Phase.Value = (int)BomberMatchPhase.Podium;
        match.EndTick.Value = world.Tick;
        IBomberConfig config = BomberConfigBinding.For(world);
        match.PhaseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Game.PodiumMs, config.Game.TickRateHz));
        match.SurvivorCount.Value = Math.Max(0, alive);
        match.Winner.Value = default;
        bool published = PublishResults(world, match, alive);
        ulong sequence = BomberMatchRules.Emit(world, "match_ended", match.MatchId.Value);
        world.Single<BomberPresentationJournal>().Append(world, "match_end", match.MatchId.Value, sequence,
            participant: match.Winner.Value, cause: ((BomberEndReason)match.EndReason.Value).ToString(),
            data: new Dictionary<string, string> { ["survivorCount"] = match.SurvivorCount.Value.ToString(CultureInfo.InvariantCulture),
                ["resultsPublished"] = published.ToString().ToLowerInvariant() });
        if (published) BomberMatchRules.Emit(world, "ranking_valid", match.MatchId.Value);
    }

    internal static bool PublishResults(World world, BomberMatchState match, int alive)
    {
        BomberParticipantState[] participants = world.Each<BomberParticipantState>()
            .OrderBy(participant => participant.Slot.Value).ToArray();
        int configured = BomberConfigBinding.For(world).Game.PlayerCount;
        if (participants.Length != configured) return false;

        var rows = new List<BomberResultRow>(configured);
        var playerByParticipant = new Dictionary<NetEntityId, BomberPlayerState>();
        foreach (BomberParticipantState participant in participants)
        {
            if (!participant.CurrentLife.Value.IsDefault && world.IsLive(participant.CurrentLife.Value))
                playerByParticipant[participant.Entity] = world.Get<BomberPlayerState>(participant.CurrentLife.Value);
        }
        bool Survived(BomberParticipantState participant) =>
            playerByParticipant.TryGetValue(participant.Entity, out BomberPlayerState? player)
                && player.LifePhase.Value is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable;
        ulong EliminatedAt(BomberParticipantState participant) =>
            playerByParticipant.TryGetValue(participant.Entity, out BomberPlayerState? player)
                ? player.EliminatedTick.Value : participant.EliminatedTick.Value;
        var ordered = participants.OrderByDescending(Survived)
            .ThenByDescending(participant => Survived(participant) ? playerByParticipant[participant.Entity].HatCount.Value : 0)
            .ThenByDescending(participant => Survived(participant) ? 0 : EliminatedAt(participant))
            .ThenBy(participant => participant.Entity)
            .ToArray();
        for (int i = 0; i < ordered.Length; i++)
        {
            BomberParticipantState participant = ordered[i];
            playerByParticipant.TryGetValue(participant.Entity, out BomberPlayerState? playerState);
            bool survived = playerState is not null && playerState.LifePhase.Value is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable;
            BomberSkillState? skills = playerState is null ? null : world.Get<BomberSkillState>(playerState.Entity);
            BomberStatistics stats = world.Get<BomberStatistics>(participant.Entity);
            rows.Add(new BomberResultRow
            {
                MatchId = match.MatchId.Value,
                Participant = participant.Entity,
                Life = participant.LastLife.Value.IsDefault ? participant.CurrentLife.Value : participant.LastLife.Value,
                LifeGeneration = participant.LifeGeneration.Value,
                Slot = participant.Slot.Value,
                Rank = i + 1,
                Survived = survived,
                FinalHats = playerState?.HatCount.Value ?? 0,
                EliminatedTick = survived ? 0 : EliminatedAt(participant),
                Character = skills is null ? 0 : checked((int)skills.CharacterId.Value),
                Kills = Math.Max(0, stats.Kills.Value),
                Bombs = Math.Max(0, stats.Bombs.Value),
                DestroyedBlocks = Math.Max(0, stats.DestroyedBlocks.Value),
                Pickups = Math.Max(0, stats.Pickups.Value),
                BestChain = Math.Max(0, stats.BestChain.Value),
                PeakHats = Math.Max(0, stats.PeakHats.Value),
                SkillCasts = Math.Max(0, stats.SkillCasts.Value),
                Evolutions = Math.Max(0, stats.Evolutions.Value),
                HatKingTicks = stats.HatKingTicks.Value,
            });
        }
        for (int i = 1; i < rows.Count; i++)
        {
            BomberResultRow previous = rows[i - 1];
            BomberResultRow current = rows[i];
            bool tied = previous.Survived && current.Survived
                ? previous.FinalHats == current.FinalHats
                : !previous.Survived && !current.Survived && previous.EliminatedTick == current.EliminatedTick;
            rows[i] = current with { Rank = tied ? previous.Rank : i + 1 };
        }
        int survivorCount = rows.Count(row => row.Survived);
        if (survivorCount != alive)
            throw new InvalidOperationException("Match survivor count changed while publishing results.");
        BomberEndReason reason = survivorCount == 0 ? BomberEndReason.SimultaneousElimination
            : survivorCount == 1 ? BomberEndReason.LastSurvivor : BomberEndReason.TimeLimit;
        NetEntityId winner = survivorCount == 1 ? rows.First(row => row.Survived).Participant
            : survivorCount > 1 ? rows.First().Participant : default;
        world.Single<BomberResults>().Publish(new BomberCompletedMatch
        {
            MatchId = match.MatchId.Value,
            EndTick = match.EndTick.Value,
            EndReason = (int)reason,
            WinnerParticipant = winner,
            SurvivorCount = survivorCount,
            Rows = rows,
        }, configured);
        match.EndReason.Value = (int)reason;
        match.Winner.Value = winner;
        match.SurvivorCount.Value = survivorCount;
        return true;
    }

    private static System.Numerics.Vector3 SpawnPosition(MapRow map, int slot)
    {
        // The corners and edge midpoints are open cells on the authored odd-sized map.
        int left = map.BoundaryCells;
        int right = map.Width - map.BoundaryCells - 1;
        int top = map.BoundaryCells;
        int bottom = map.Depth - map.BoundaryCells - 1;
        int middleX = (left + right) / 2;
        int middleZ = (top + bottom) / 2;
        (int x, int z) = slot switch
        {
            0 => (left, top), 1 => (middleX, top), 2 => (right, top),
            3 => (left, middleZ), 4 => (right, middleZ),
            5 => (left, bottom), 6 => (middleX, bottom), 7 => (right, bottom),
            _ => throw new ArgumentOutOfRangeException(nameof(slot)),
        };
        return new System.Numerics.Vector3(x + 0.5f, map.ObstacleLayer + 0.5f, z + 0.5f);
    }

    internal static void ReturnBombCapacity(World world, BomberBombState bomb)
    {
        if (bomb.CapacityReturned.Value || !world.IsLive(bomb.Owner.Value)
            || !world.TypeOf(bomb.Owner.Value).Is<BomberParticipantEntity>()) return;
        BomberParticipantState participant = world.Get<BomberParticipantState>(bomb.Owner.Value);
        if (participant.CurrentLife.Value != bomb.SourceLife.Value ||
            participant.LifeGeneration.Value != bomb.SourceLifeGeneration.Value ||
            !world.IsLive(bomb.SourceLife.Value) ||
            !world.TypeOf(bomb.SourceLife.Value).Is<PlayerEntity>()) return;
        BomberPlayerState sourceLife = world.Get<BomberPlayerState>(bomb.SourceLife.Value);
        if (sourceLife.Participant.Value != bomb.Owner.Value ||
            sourceLife.LifeGeneration.Value != bomb.SourceLifeGeneration.Value) return;
        AttributeComponent attributes = world.Get<AttributeComponent>(bomb.SourceLife.Value);
        long capacity = attributes.GetCurrentValue(BomberAttributeNames.BombCapacity);
        long available = attributes.GetBaseValue(BomberAttributeNames.AvailableBombs);
        attributes.SetBaseValue(BomberAttributeNames.AvailableBombs, Math.Min(capacity, available + 1));
        bomb.CapacityReturned.Value = true;
    }

}
