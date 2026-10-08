using System;
using System.Collections.Generic;
using System.Linq;
using System.Globalization;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation.Determinism;

namespace Lumio.Bomber.Gameplay;

/// <summary>Owns the server-side bomb lifecycle; no second Tick path is introduced.</summary>
[System(TickPhase.ProcessorPlan)]
[After(typeof(BomberFoundationSystem))]
public sealed class BombSystem : EcsSystem
{
    public override void Execute(World world)
    {
        try
        {
            ExecuteCore(world);
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"BOMBER_EXECUTE_FAULT tick={world.Tick}: {error}");
            throw;
        }
    }

    private static void ExecuteCore(World world)
    {
        BomberMatchState match = world.Single<BomberMatchState>();
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        world.Single<BomberPresentationJournal>().Expire(world.Tick);
        IBomberConfig config = BomberConfigBinding.For(world);
        BomberTerrainTransactions.BeginFrame(world);
        BomberEffectBusiness.Consume(world, match);
        match.SettlementRespawnTicks.Value = Ticks.FromMilliseconds(config.Life.RespawnMs, config.Game.TickRateHz);
        match.SettlementPodiumTicks.Value = Ticks.FromMilliseconds(config.Game.PodiumMs, config.Game.TickRateHz);
        EnsureParticipants(world, match, config);
        EnsureMatch(match, config, world);
        if (match.MatchId.Value == 0) return;
        BomberIceBridges.Begin(world);
        BomberTerrainTransactions.Begin(world);
        BomberFavoriteFireZones.Advance(world);
        AdvanceMatch(world, match, config);
        BomberFinalCircle.Advance(world);
        BomberSuccessorLifecycle.Advance(world, match, config);
        UpdatePlayers(world, match, config);
        BomberStatisticsBusiness.Advance(world, match);
        ProcessBombs(world, match, config);
        BomberIceBridges.End(world);
        BomberInventory.ReconcileSuccessors(world);
        BomberRegeneration.Advance(world);
        BomberTerrainTransactions.End(world);
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
                if (!item.ClaimedBy.Value.IsDefault) continue;
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
        match.Seed.Value = config.Game.InitialSeed;
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
            if (player.RestorePending.Value) _ = BomberHealthBusiness.Submit(world, player, true);
            BomberSkillState skill = world.Get<BomberSkillState>(player.Entity);
            BomberFiniteSkills.ConsumeBubble(world, player, skill);
            BomberFiniteSkills.ConsumeAura(world, player, skill);
            BomberFiniteSkills.ConsumeFreeze(world, player, skill);
            if (player.LifePhase.Value == (int)BomberLifePhase.Protected
                && player.ProtectedUntilTick.Value <= world.Tick)
                player.LifePhase.Value = (int)BomberLifePhase.Vulnerable;
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

    private static void ProcessBombs(World world, BomberMatchState match, IBomberConfig config)
    {
        BomberFrenzy.Validate(world);
        using NativeHfsmDefinition definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.Bomb);
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            BomberSplitBombs.ObservePublished(world, bomb);
            BomberBarrelBombPromises.ObservePublished(world, bomb);
            BomberFrenzy.ObservePublished(world, bomb);
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
        BomberSplitBombs.ExtinguishWater(world, definition);
        BomberBombKick.Advance(world, definition);
        var due = new Queue<BomberBombState>(world.Each<BomberBombState>()
            .Where(bomb => bomb.Phase.Value == (int)BomberBombPhase.Fuse && bomb.FuseEndTick.Value <= world.Tick &&
                !BomberIceBridges.HoldsFuse(world, bomb)));
        var chained = new HashSet<NetEntityId>();
        var chainCounts = new Dictionary<ulong, int>();
        var contactSources = new List<BomberBombState>();
        var contactSourceIds = new HashSet<NetEntityId>();
        foreach (var source in world.Each<BomberBombState>().Where(b => b.TerrainContinuations.Count != 0))
        {
            ApplyBlastCells(world, match, source, BomberBlastTerrain.Resume(world, source), due, chained);
            contactSources.Add(source);
            contactSourceIds.Add(source.Entity);
        }
        while (due.Count != 0)
        {
            BomberBombState bomb = due.Dequeue();
            if (!world.IsLive(bomb.Entity) || bomb.Phase.Value != (int)BomberBombPhase.Fuse) continue;
            if (BomberIceBridges.HoldsFuse(world, bomb)) continue;
            BomberBombLifecycle.Send(world, bomb, definition, BomberHfsmDefinitions.EventId.FuseElapsed);
            Explode(world, match, config, bomb, due, chained, chainCounts);
            if (contactSourceIds.Add(bomb.Entity)) contactSources.Add(bomb);
        }
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
            if (bomb.Phase.Value == (int)BomberBombPhase.Danger && contactSourceIds.Add(bomb.Entity)) contactSources.Add(bomb);
        BomberSplitBombs.Advance(world);
        foreach (BomberBombState bomb in contactSources)
        {
            if (!world.IsLive(bomb.Entity)) continue;
            if (bomb.Phase.Value == (int)BomberBombPhase.Danger && bomb.DangerUntilTick.Value > world.Tick)
                ReserveBlastContacts(world, match, bomb);
        }
        // Several children may reserve new rows in the same persisted mother. Reserve the
        // whole contact set before admitting any Effect, which pins its row associations.
        foreach (BomberBombState source in contactSources.Where(b => world.IsLive(b.Entity))
            .Select(b => BomberSplitBombs.DamageOwner(world, b)).DistinctBy(b => b.Entity))
            BomberEffectBusiness.SubmitDamage(world, source);
        // Apply due Native phase actions before sampling this tick's fire coverage.
        foreach (BomberBombState bomb in world.Each<BomberBombState>().ToArray())
        {
            if (!world.IsLive(bomb.Entity)) continue;
            if (BomberTerrainTransactions.HoldsSource(world, bomb.Entity)) continue;
            if (BomberFireExposure.HoldsSource(world, bomb.Entity)) continue;
            if (BomberIceBridges.HoldsSource(world, bomb.Entity)) continue;
            if (Enumerable.Range(0, bomb.HitStates.Count).Any(i => bomb.HitStates[i] == (int)BomberHitStorageState.Pending)) continue;
            if (bomb.Phase.Value == (int)BomberBombPhase.Danger && bomb.DangerUntilTick.Value <= world.Tick)
            {
                BomberBombLifecycle.Send(world, bomb, definition, BomberHfsmDefinitions.EventId.DangerElapsed);
            }
            else if (bomb.Phase.Value == (int)BomberBombPhase.Burn && bomb.BurnUntilTick.Value <= world.Tick)
            {
                BomberBombLifecycle.Send(world, bomb, definition, BomberHfsmDefinitions.EventId.BurnElapsed);
            }
            else if (bomb.Phase.Value == (int)BomberBombPhase.Expired && !BomberSplitBombs.HoldsFamily(world, bomb))
                world.Commands.Destroy(bomb.Entity);
        }
        BomberFireExposure.Advance(world);
    }

    private static void Explode(World world, BomberMatchState match, IBomberConfig config, BomberBombState bomb,
        Queue<BomberBombState> due, HashSet<NetEntityId> chained, Dictionary<ulong, int> chainCounts)
    {
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
        var cells = BomberBlastTerrain.Trace(world, bomb);
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
        ApplyBlastCells(world, match, bomb, cells, due, chained);
        BomberMatchRules.Emit(world, "chain_resolved", match.MatchId.Value,
            $"chainId={bomb.ChainId.Value}");
    }

    private static void ApplyBlastCells(World world, BomberMatchState match, BomberBombState bomb,
        List<(int X, int Z)> cells, Queue<BomberBombState> due, HashSet<NetEntityId> chained)
    {
        // An accepted terrain continuation still owes its original contacts, even
        // when delivery arrives after Danger. It does not reopen the entry window.
        BomberIceBridges.RequestContact(world, bomb, cells);
        ReserveBlastContacts(world, match, bomb, cells);
        for (int i = 0; i < cells.Count; i++)
        {
            (int x, int z) = cells[i];
            BomberBombState? chainedBomb = BomberMatchRules.FindBombAt(world, x, z, bomb.Entity);
            if (chainedBomb is not null && chainedBomb.Phase.Value == (int)BomberBombPhase.Fuse &&
                !BomberIceBridges.HoldsFuse(world, chainedBomb) && chained.Add(chainedBomb.Entity))
            {
                chainedBomb.FuseEndTick.Value = world.Tick;
                chainedBomb.ChainId.Value = bomb.ChainId.Value;
                due.Enqueue(chainedBomb);
            }
        }
    }

    private static void ReserveBlastContacts(World world, BomberMatchState match, BomberBombState bomb, List<(int X, int Z)>? acceptedCells = null)
    {
        var origin = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
        int bx = BomberMatchRules.CellX(origin), bz = BomberMatchRules.CellZ(origin);
        foreach (BomberPlayerState player in world.Each<BomberPlayerState>())
        {
            if (player.LifePhase.Value >= (int)BomberLifePhase.AwaitingRespawn || BomberFiniteSkills.HasBubble(world, player.Entity)
                || player.ProtectedUntilTick.Value > world.Tick || player.Participant.Value.IsDefault || player.LifeGeneration.Value == 0) continue;
            if (BomberFrenzy.IsSelfImmune(bomb, player)) continue;
            var position = world.Get<LogicTransform>(player.Entity).LocalPosition;
            int x = BomberMatchRules.CellX(position), z = BomberMatchRules.CellZ(position);
            bool covered = acceptedCells is not null ? acceptedCells.Contains((x, z)) : (x == bx && z == bz) ||
                (x == bx && z < bz && bz - z <= bomb.ReachUp.Value) ||
                (x == bx && z > bz && z - bz <= bomb.ReachDown.Value) ||
                (z == bz && x < bx && bx - x <= bomb.ReachLeft.Value) ||
                (z == bz && x > bx && x - bx <= bomb.ReachRight.Value);
            if (covered) BomberEffectBusiness.ReserveDamage(world, match, bomb, player, x, z);
        }
    }

    private static void AdvanceMatch(World world, BomberMatchState match, IBomberConfig config)
    {
        BomberMatchPhase phase = (BomberMatchPhase)match.Phase.Value;
        if (phase == BomberMatchPhase.Warmup && world.Tick >= match.PhaseEndTick.Value)
        {
            var runtime = world.Single<BomberWorldRuntime>();
            if (runtime.InitialResourcePhase.Value is 1 or 2 || runtime.PendingVoxelTransactionIds.Count != 0 ||
                world.Each<BomberPlayerState>().Any(p => p.RestorePending.Value)) return;
            match.Phase.Value = (int)BomberMatchPhase.Running;
            match.StartTick.Value = world.Tick;
            match.PhaseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Game.MatchDurationMs, config.Game.TickRateHz));
        }
        else if (phase == BomberMatchPhase.Running)
        {
            bool resources = BomberFinalCircle.ResourceThresholdReached(world, match, config);
            ulong duration = Ticks.FromMilliseconds(config.FinalCircle.DurationMs, config.Game.TickRateHz);
            bool time = match.PhaseEndTick.Value >= duration && world.Tick >= match.PhaseEndTick.Value - duration;
            if (!resources && !time) return;
            match.Phase.Value = (int)BomberMatchPhase.FinalCircle;
            match.PhaseEndTick.Value = checked(world.Tick + duration);
            BomberFinalCircleState circle = world.Single<BomberFinalCircleState>();
            circle.TriggerTick.Value = world.Tick;
            circle.TriggerReason.Value = (int)(resources ? BomberCircleTriggerReason.ResourceThreshold : BomberCircleTriggerReason.TimeLimit);
            circle.Phase.Value = (int)BomberMatchPhase.FinalCircle;
            ulong sequence = BomberMatchRules.Emit(world, "final_circle_started", match.MatchId.Value);
            world.Single<BomberPresentationJournal>().Append(world, "final_circle_start", match.MatchId.Value, sequence,
                cause: resources ? "resources" : "time_limit", data: new Dictionary<string, string> {
                    ["endTick"] = match.PhaseEndTick.Value.ToString(CultureInfo.InvariantCulture) });
        }
        else if (phase == BomberMatchPhase.Podium && world.Tick >= match.PhaseEndTick.Value)
        {
            match.Phase.Value = (int)BomberMatchPhase.Results;
            match.PhaseEndTick.Value = checked(world.Tick + Ticks.FromMilliseconds(config.Game.ResultsMs, config.Game.TickRateHz));
        }
        else if (phase == BomberMatchPhase.Results && world.Tick >= match.PhaseEndTick.Value)
        {
            if (!BomberRoundTransition.Prepare(world)) return;
            ulong nextIndex = checked(match.MatchIndex.Value + 1);
            var nextSeed = new DeterminismContext(match.Seed.Value, world.Tick, RuntimeSchema.SchemaEpoch)
                .OpenRngStream(FormattableString.Invariant($"bomber.match.{nextIndex}"));
            ulong selectedSeed = nextSeed.NextUInt64();
            BomberRoundTransition.StartNextGeneration(world, selectedSeed);
            match.MatchIndex.Value = nextIndex;
            match.MatchId.Value++;
            match.Seed.Value = selectedSeed;
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
        match.HatKing.Value = default;
        match.OutcomePending.Value = false;
        BomberFinalCircleState circle = world.Single<BomberFinalCircleState>();
        circle.TriggerTick.Value = 0;
        circle.TriggerReason.Value = (int)BomberEndReason.None;
        circle.InitialResourceCount.Value = 0;
        circle.RemainingResourceCount.Value = 0;
        circle.RegenStopTick.Value = 0;
        circle.ResourceCountInitialized.Value = false;
        circle.CurrentStageId.Value = 0;
        circle.NextStageId.Value = 0;
        circle.CurrentSide.Value = 0;
        circle.NextSide.Value = 0;
        circle.NextAnnounceTick.Value = 0;
        circle.NextEffectiveTick.Value = 0;
        circle.PoisonPoints.Value = 0;
        circle.Phase.Value = 0;
        BomberFinalCircle.Reset(world);

        foreach (BomberBombState bomb in world.Each<BomberBombState>().ToArray())
            world.Commands.Destroy(bomb.Entity);

        foreach (BomberParticipantState participant in world.Each<BomberParticipantState>())
        {
            participant.MatchId.Value = match.MatchId.Value;
            bool hasLife = !participant.CurrentLife.Value.IsDefault && world.IsLive(participant.CurrentLife.Value);
            participant.LifePhase.Value = (int)(hasLife ? BomberLifePhase.Protected : BomberLifePhase.AwaitingRespawn);
            participant.SuccessorPending.Value = !hasLife;
            participant.DeathTick.Value = 0;
            participant.RespawnAtTick.Value = 0;
            participant.EliminatedTick.Value = 0;
            participant.PendingFinalRespawn.Value = false;
            participant.DeathStructurePending.Value = false;
            participant.DeathStructureLife.Value = default;
            participant.DeathStructureGeneration.Value = 0;
            participant.DeathStructureTick.Value = 0;
            BomberRoundTransition.ResetParticipant(world, participant);
            BomberSuccessorLifecycle.BeginNextMatch(world, participant);
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
            statistics.Deaths.Value = 0;
            statistics.PeakHealthPoints.Value = BomberGrowth.InitialHealth;
            statistics.BossKills.Value = 0;
            statistics.ClutchEscapes.Value = 0;
            statistics.GoldenHeartPickups.Value = 0;
            statistics.SpecialBombHistory.Clear();
            if (participant.CurrentLife.Value.IsDefault || !world.IsLive(participant.CurrentLife.Value)) continue;
            BomberPlayerState player = world.Get<BomberPlayerState>(participant.CurrentLife.Value);
            player.LifePhase.Value = (int)BomberLifePhase.Protected;
            player.RespawnAtTick.Value = 0;
            player.ProtectedUntilTick.Value = checked(world.Tick + protectionTicks);
            player.EliminatedTick.Value = 0;
            player.Facing.Value = (int)BomberDirection.Down;
            AttributeComponent attributes = world.Get<AttributeComponent>(player.Entity);
            _ = BomberHealthBusiness.SubmitNewMatch(world, player);
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
        world.Get<BomberStatistics>(participant.Entity).CharacterId.Value = selected;
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
            participant.LifePhase.Value == (int)BomberLifePhase.Eliminated ? participant.EliminatedTick.Value :
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
            BomberStatistics stats = world.Get<BomberStatistics>(participant.Entity);
            rows.Add(new BomberResultRow
            {
                MatchId = match.MatchId.Value,
                Participant = participant.Entity,
                Life = playerState is not null ? participant.CurrentLife.Value :
                    participant.LastLife.Value.IsDefault ? participant.CurrentLife.Value : participant.LastLife.Value,
                LifeGeneration = participant.LifeGeneration.Value,
                Slot = participant.Slot.Value,
                Rank = i + 1,
                Survived = survived,
                FinalHats = playerState?.HatCount.Value ?? 0,
                EliminatedTick = survived ? 0 : EliminatedAt(participant),
                Character = participant.SelectedForMatchCharacterId.Value,
                Kills = Math.Max(0, stats.Kills.Value),
                Bombs = Math.Max(0, stats.Bombs.Value),
                DestroyedBlocks = Math.Max(0, stats.DestroyedBlocks.Value),
                Pickups = Math.Max(0, stats.Pickups.Value),
                BestChain = Math.Max(0, stats.BestChain.Value),
                PeakHats = Math.Max(0, stats.PeakHats.Value),
                SkillCasts = Math.Max(0, stats.SkillCasts.Value),
                Evolutions = Math.Max(0, stats.Evolutions.Value),
                HatKingTicks = stats.HatKingTicks.Value,
                Deaths = stats.Deaths.Value,
                PeakHealthPoints = stats.PeakHealthPoints.Value,
                BossKills = stats.BossKills.Value,
                ClutchEscapes = checked(stats.ClutchEscapes.Value + (survived &&
                    world.Get<AttributeComponent>(playerState!.Entity).GetBaseValue(BomberAttributeNames.HealthPoints) is > 0 and <= 2 ? 1 : 0)),
                GoldenHeartPickups = stats.GoldenHeartPickups.Value,
                SpecialBombHistory = BomberSpecialBombHistory.Encode(stats.SpecialBombHistory.Values),
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
        if (match.EndReason.Value != (int)reason || match.Winner.Value != winner || match.SurvivorCount.Value != survivorCount)
            throw new InvalidOperationException("Published ranking must agree with the settled authoritative outcome.");
        return true;
    }

    internal static System.Numerics.Vector3 SpawnPosition(MapRow map, int slot)
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
        if (bomb.Frenzy.Value)
        {
            bomb.CapacityReturned.Value = true;
            return;
        }
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
