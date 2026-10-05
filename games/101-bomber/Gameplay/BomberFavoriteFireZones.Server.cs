using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Numerics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

// PRIVATE, UNRUN. Formal declaration generation and capacity diagnostics belong to Root.
internal static class BomberFavoriteFireZones
{
    internal const int MaxBytes = 16384;
    private const int Prepared = 1, Submitted = 2, Bound = 3, Applied = 4, Rejected = 5;
    private const int RegionApplied = 3, RegionExpired = 4;
    private const int Running = 0, AuraTerminal = 1, SourceDead = 2, RoundEnded = 3, InitialRejected = 4;
    private sealed record Lease(string Participant, string Life, ulong Generation, ulong Match, ulong Chain,
        int Level, ulong Start, ulong Duration, ulong RegionDuration, ulong AuraWorld, ulong AuraInstance,
        uint AuraGeneration, int AuraStatus, int NextOrdinal, int End,
        int PendingOrdinal, int X, int Z, int Mask, string PendingZone, bool RetirementSubmitted);
    private static readonly JsonSerializerOptions Codec = new() { UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow };
    private static readonly string[] Members = typeof(Lease).GetProperties().Select(p => p.Name).ToArray();

    internal static bool HasPending(World world) => Read(world).Count != 0;
    internal static bool HasSource(World world, NetEntityId life) => Read(world).Any(l => l.Life == life.ToHex());

    internal static bool CanReserve(World world, NetEntityId life, ulong duration, out string? reason)
    {
        Validate(world);
        var rows = Read(world); var config = BomberConfigBinding.For(world); var budget = config.ObjectBudgets;
        reason = "fire_region_capacity";
        if (duration == 0 || duration > int.MaxValue || rows.Any(l => l.Life == life.ToHex()) || rows.Count >= budget.ParticipantLimit) return false;
        // Retained-expired, actual-live, unpublished and every future ordinal spend one ledger.
        long promised = rows.Sum(l => checked((long)l.Duration));
        int historical = world.Each<BomberFireZoneState>().Count(z => !z.RegionCoverage.Value);
        if (checked(promised + historical + (long)duration) > budget.FireZoneCapacity) return false;
        long reserved = world.LiveEntityCount;
        reserved += Math.Max(0, budget.BombCapacity - world.Each<BomberBombState>().Count());
        reserved += Math.Max(0, budget.PickupCapacity - world.Each<BomberPickupItem>().Count());
        reserved += Math.Max(0, budget.FireZoneCapacity - world.Each<BomberFireZoneState>().Count());
        reserved += Math.Max(0, budget.ParticipantLimit * 3 - world.Each<BomberParticipantState>().Count() - world.Each<BomberPlayerState>().Count());
        reserved += Math.Max(0, budget.ChestLimit - world.Each<BomberChestState>().Count());
        reserved += Math.Max(0, 8 - world.Each<BomberBarrelState>().Count());
        reserved += Math.Max(0, BomberIceBridges.MaxRows - world.Each<BomberIceBridgeState>().Count());
        if (reserved > world.EffectiveMaxLiveEntitiesBudget) return false;
        // Existing public limit validation is necessary, not a private census of pending slips.
        var limits = GasWorldContext.Require(world).EffectLimits;
        limits.Validate();
        ulong radius = Ticks.FromMilliseconds(1000, config.Game.TickRateHz);
        int reach = ReachableAuraTicks(config);
        int live = checked(3 * budget.ParticipantLimit + budget.ParticipantLimit * Math.Min(reach, checked((int)radius + 1)));
        int pending = checked(256 + budget.ParticipantLimit), controls = checked(7 * budget.ParticipantLimit);
        if (limits.LiveRows < live || limits.PendingRequests < pending || limits.PendingControls < controls ||
            limits.Identities < checked(live + pending) || limits.DueRecords < live ||
            limits.ResultRecords < checked(pending + controls + 2 * live) || limits.PerTargetRows < 3) return false;
        var player = world.Get<BomberPlayerState>(life);
        if (player.Participant.Value.IsDefault || player.LifeGeneration.Value == 0 || player.RestorePending.Value ||
            player.LifePhase.Value >= (int)BomberLifePhase.AwaitingRespawn ||
            !world.IsLive(player.Participant.Value) || !world.TypeOf(player.Participant.Value).Is<BomberParticipantEntity>() ||
            world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints) <= 0) return false;
        var participant = world.Get<BomberParticipantState>(player.Participant.Value);
        if (participant.CurrentLife.Value != life || participant.LifeGeneration.Value != player.LifeGeneration.Value ||
            participant.MatchId.Value != world.Single<BomberMatchState>().MatchId.Value) return false;
        using var nativePreflight = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FireZone);
        var position = world.Get<LogicTransform>(life).LocalPosition;
        // Read-only complete Native photo before the first owner or cast mutation.
        if (Photo(world) is null) { reason = "skill_terrain_unavailable"; return false; }
        var candidate = new Lease(player.Participant.Value.ToHex(), life.ToHex(), player.LifeGeneration.Value,
            world.Single<BomberMatchState>().MatchId.Value, checked(world.Single<BomberWorldRuntime>().NextChainId.Value + 1),
            world.Get<BomberSkillState>(life).ActiveSkillLevel.Value, world.Tick, duration, radius,
            0, 0, 0, Prepared, 0, Running, -1, BomberMatchRules.CellX(position), BomberMatchRules.CellZ(position), 0, "", false);
        _ = Encode(rows.Append(candidate).ToList());
        reason = null; return true;
    }

    internal static int ReachableAuraTicks(IBomberConfig config)
    {
        ulong max = 0;
        foreach (var character in config.Tables.Characters.Rows)
            if (character.BoundSlot == "Active" && character.BoundSkillId == 4 && character.BoundLevel > 0)
                max = Math.Max(max, Ticks.FromMilliseconds(config.SkillLevel(4, character.BoundLevel).DurationMs, config.Game.TickRateHz));
        return checked((int)max);
    }

    internal static void Prepare(World world, NetEntityId life, ulong duration, ulong chain, int x, int z)
    {
        if (!CanReserve(world, life, duration, out string? reason)) throw Invalid(reason ?? "Whole cast reservation failed.");
        var p = world.Get<BomberPlayerState>(life); var skill = world.Get<BomberSkillState>(life);
        var rows = Read(world);
        rows.Add(new(p.Participant.Value.ToHex(), life.ToHex(), p.LifeGeneration.Value,
            world.Single<BomberMatchState>().MatchId.Value, chain, skill.ActiveSkillLevel.Value,
            world.Tick, duration, Ticks.FromMilliseconds(1000, BomberConfigBinding.For(world).Game.TickRateHz),
            0, 0, 0, Prepared, 0, Running, -1, x, z, CaptureMask(world, x, z), "", false));
        Save(world, rows);
    }
    internal static void MarkAuraSubmitted(World world, NetEntityId life)
    {
        var lease = Find(world, life);
        if (lease.AuraStatus != Prepared) throw Invalid("Aura submission is not Prepared.");
        Replace(world, lease, lease with { AuraStatus = Submitted });
    }
    internal static void BindAura(World world, NetEntityId life, EffectHandleResult admitted)
    {
        var lease = Find(world, life);
        if (lease.AuraStatus != Submitted || lease.AuraWorld != 0) throw Invalid("Aura submission already has an outcome.");
        if (!admitted.Succeeded)
        {
            // No region order exists: a known rejected admission owns no future slip.
            if (lease.NextOrdinal != 0 || lease.PendingOrdinal != -1) throw Invalid("Rejected admission has published debt.");
            Save(world, Read(world).Where(l => l != lease).ToList()); return;
        }
        if (admitted.Handle.IsDefault) throw Invalid("Successful Aura admission lost its real handle.");
        var bound = lease with { AuraStatus = Bound, AuraWorld = admitted.Handle.WorldId.Value,
            AuraInstance = admitted.Handle.InstanceId.Value, AuraGeneration = admitted.Handle.Generation };
        Replace(world, lease, bound);
        Emit(world, bound, bound.X, bound.Z, bound.Mask); // Ordinal zero: same public cast Tick.
    }

    private static void Emit(World world, Lease lease, int x, int z, int mask)
    {
        if (lease.End != Running || lease.RetirementSubmitted || lease.PendingOrdinal != -1 ||
            lease.NextOrdinal >= checked((int)lease.Duration) || world.Tick != checked(lease.Start + (ulong)lease.NextOrdinal))
            throw Invalid("Region birth is neither unique nor the exact owed Tick.");
        var next = lease with { NextOrdinal = checked(lease.NextOrdinal + 1), PendingOrdinal = lease.NextOrdinal,
            X = x, Z = z, Mask = mask, PendingZone = "" };
        Replace(world, lease, next); // durable Submitted witness precedes structural Create; Unknown is never replayed.
        var order = world.Commands.Create<BomberFireZoneEntity>();
        var state = order.Get<BomberFireZoneState>();
        EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
            FormattableString.Invariant($"{x + .5f:R},1.5,{z + .5f:R}"), silent: true);
        state.Owner.Value = Id(world, lease.Participant); state.SourceLife.Value = Id(world, lease.Life);
        state.SourceLifeGeneration.Value = lease.Generation; state.SourceMatchId.Value = lease.Match;
        state.SourceChainId.Value = lease.Chain; state.SourceSkill.Value = 4;
        state.FromTick.Value = world.Tick; state.UntilTick.Value = 0; state.Direction.Value = 0; state.Length.Value = 3;
        state.CoverageMask.Value = mask; state.RegionCoverage.Value = true; state.RegionOrdinal.Value = lease.NextOrdinal;
        state.DurationTicks.Value = lease.RegionDuration; state.AuraEffectWorld.Value = lease.AuraWorld;
        state.AuraEffectInstance.Value = lease.AuraInstance; state.AuraEffectGeneration.Value = lease.AuraGeneration;
        state.PromiseToken.Value = Token(world, lease, lease.NextOrdinal, x, z, mask); state.LifetimeOutcome.Value = Prepared;
    }

    internal static void Published(World world, BomberFireZoneState state)
    {
        ValidateZoneStorage(world, state);
        var lease = FindByZone(world, state);
        if (lease.PendingOrdinal != state.RegionOrdinal.Value || lease.PendingZone != "" ||
            state.BirthSubmitted.Value || state.LifetimeOutcome.Value != Prepared || state.FromTick.Value != world.Tick)
            throw Invalid("Region publication was duplicated, late or substituted.");
        if (world.Each<BomberFireZoneState>().Count(z => z.PromiseToken.Value == state.PromiseToken.Value) != 1)
            throw Invalid("Region publication token is not unique.");
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FireZone);
        var machine = world.Get<BomberHfsmState>(state.Entity);
        if (machine.SnapshotPresent.Value) throw Invalid("Fresh region already has Native state.");
        ulong key = world.Single<BomberWorldRuntime>().AllocateHfsmMachineKey();
        var start = definition.Start(key, 1);
        if (start.Outcome != HfsmOutcome.Started || start.Actions.Count != 0 || start.Next is null ||
            start.Next.ActivePath.Count != 1 || start.Next.ActivePath[0].State != BomberHfsmDefinitions.State.FireActive)
            throw Invalid("Native rejected region Start.");
        machine.StorePlan(start, definition, BomberHfsmKind.FireZone, key);
        state.Phase.Value = 1;
        Replace(world, lease, lease with { PendingZone = state.Entity.ToHex() });
        state.BirthSubmitted.Value = true; state.LifetimeOutcome.Value = Submitted;
        var p = Payload(state, lease);
        var admitted = Effects.Apply<BomberFireZoneLifetimeEffect, BomberFireZoneLifetimeEffect.Parameters>(world,
            state.Entity, in p, state.SourceLife.Value);
        if (!admitted.Succeeded) { state.LifetimeOutcome.Value = Rejected; throw Invalid("Owed region finite admission rejected; debt retained."); }
        state.LifetimeEffectWorld.Value = admitted.Handle.WorldId.Value;
        state.LifetimeEffectInstance.Value = admitted.Handle.InstanceId.Value;
        state.LifetimeEffectGeneration.Value = admitted.Handle.Generation;
        // The publication witness remains until the normal business consumer sees its actual Initial.
    }

    internal static bool CanSettle(World world, EffectApplyContext context, in BomberFireZoneLifetimeEffect.Parameters p)
    {
        if (context.Target != p.Zone || context.Source != p.Life || !world.IsLive(p.Zone) ||
            !world.TypeOf(p.Zone).Is<BomberFireZoneEntity>()) return false;
        var zone = world.Get<BomberFireZoneState>(p.Zone);
        var lease = FindByZone(world, zone);
        ValidateNative(world, zone);
        if (!EqualsPayload(p, Payload(zone, lease)) || zone.LifetimeOutcome.Value != Submitted ||
            zone.LifetimeEffectWorld.Value != context.Handle.WorldId.Value ||
            zone.LifetimeEffectInstance.Value != context.Handle.InstanceId.Value ||
            zone.LifetimeEffectGeneration.Value != context.Handle.Generation || zone.FromTick.Value != world.Tick ||
            lease.PendingZone != p.Zone.ToHex() || !world.IsLive(p.Life) || !world.TypeOf(p.Life).Is<PlayerEntity>()) return false;
        var player = world.Get<BomberPlayerState>(p.Life);
        if (player.Participant.Value != p.Participant || player.LifeGeneration.Value != p.Generation ||
            player.LifePhase.Value >= (int)BomberLifePhase.AwaitingRespawn || player.RestorePending.Value ||
            world.Get<AttributeComponent>(p.Life).GetBaseValue(BomberAttributeNames.HealthPoints) <= 0) return false;
        var parent = Parent(world, lease);
        return parent is not null && !parent.Suppressed && parent.EndTick > world.Tick;
    }

    internal static void Advance(World world)
    {
        world.Single<BomberWorldRuntime>().RequireSupportedResume();
        Validate(world);
        foreach (var original in Read(world).ToArray())
        {
            var lease = original;
            if (lease.AuraStatus == Submitted)
                throw Invalid("Unknown Aura Apply commitment retains its lease and cannot be reissued.");
            if (lease.RetirementSubmitted)
            {
                if (Zones(world, lease).Length == 0) Save(world, Read(world).Where(l => l != lease).ToList());
                continue;
            }
            NetEntityId life = Id(world, lease.Life);
            if (world.IsLive(life))
            {
                var skill = world.Get<BomberSkillState>(life);
                bool handle = skill.AuraEffectInstance.Value == lease.AuraInstance && skill.AuraEffectGeneration.Value == lease.AuraGeneration &&
                    (skill.AuraEffectWorld.Value == lease.AuraWorld ||
                     (world.Manager.CompletedRestore == WorldRestoreCompletion.PairedCheckpoint &&
                        skill.AuraEffectWorld.Value == GasWorldContext.Require(world).WorldId.Value));
                if (handle && skill.AuraOutcome.Value == 2 && lease.AuraStatus == Bound)
                    lease = lease with { AuraStatus = Applied };
                if (handle && skill.AuraOutcome.Value == 3 && lease.AuraStatus == Bound)
                    lease = lease with { AuraStatus = Rejected, End = InitialRejected };
                if (handle && skill.AuraOutcome.Value is >= 4 and <= 6)
                    lease = lease with { End = AuraTerminal };
                var player = world.Get<BomberPlayerState>(life);
                if (player.LifePhase.Value >= (int)BomberLifePhase.AwaitingRespawn ||
                    world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints) <= 0)
                    lease = lease with { End = lease.End == Running ? SourceDead : lease.End };
            }
            else if (lease.End == Running)
                throw Invalid("Source disappeared without a positive terminal/death witness.");
            if (world.Single<BomberMatchState>().Phase.Value == (int)BomberMatchPhase.Results && lease.End == Running)
                lease = lease with { End = RoundEnded };
            if (lease != original) { Replace(world, original, lease); }
            foreach (var zone in Zones(world, lease))
            {
                if (zone.LifetimeOutcome.Value == RegionApplied)
                {
                    RequireActual(world, zone);
                    if (!zone.BirthSubmitted.Value) throw Invalid("Applied region lost its submission witness.");
                }
                else if (zone.LifetimeOutcome.Value == 4) // Genuine Expired result copied by reducer.
                    ExpireNative(world, zone);
                else if (zone.LifetimeOutcome.Value == Rejected && lease.AuraStatus != Rejected)
                    throw Invalid("An admitted cast lost an owed region; known failure retains its lease.");
            }
            if (lease.PendingOrdinal != -1 && lease.PendingZone != "")
            {
                var zone = world.Get<BomberFireZoneState>(Id(world, lease.PendingZone));
                if (zone.LifetimeOutcome.Value is RegionApplied or RegionExpired ||
                    (zone.LifetimeOutcome.Value == Rejected && lease.AuraStatus == Rejected))
                {
                    if (zone.LifetimeOutcome.Value == RegionApplied) PublishBorn(world, zone);
                    var cleared = lease with { PendingOrdinal = -1, PendingZone = "" };
                    Replace(world, lease, cleared); lease = cleared;
                }
            }
            if (lease.End != Running) { TryRetire(world, lease); continue; }
            if (lease.AuraStatus != Applied) continue;
            if (lease.NextOrdinal >= (int)lease.Duration) continue; // Wait for actual Aura terminal, not elapsed time.
            if (lease.PendingOrdinal != -1) throw Invalid("Prior birth is unresolved at the next owed Tick.");
            if (world.Tick != checked(lease.Start + (ulong)lease.NextOrdinal)) throw Invalid("Missed region Tick; catchup is forbidden.");
            var parent = Parent(world, lease);
            if (parent is null || parent.Suppressed || parent.EndTick <= world.Tick)
                throw Invalid("Eligible cast has no matching actual Aura row.");
            var pos = world.Get<LogicTransform>(life).LocalPosition;
            int x = BomberMatchRules.CellX(pos), z = BomberMatchRules.CellZ(pos);
            Emit(world, lease, x, z, CaptureMask(world, x, z));
        }
    }

    internal static void SourceTerminal(World world, NetEntityId life)
    {
        // Called by the existing terminal-life owner before it issues destruction.
        foreach (var lease in Read(world).Where(l => l.Life == life.ToHex() && l.End == Running).ToArray())
            Replace(world, lease, lease with { End = SourceDead });
    }

    private static void TryRetire(World world, Lease lease)
    {
        if (lease.AuraStatus is Prepared or Submitted) return; // Unknown Apply commitment is never discarded.
        var zones = Zones(world, lease);
        if (lease.PendingOrdinal != -1 || zones.Length != lease.NextOrdinal ||
            zones.Any(z => (z.LifetimeOutcome.Value != 4 || z.Phase.Value != 2) &&
                !(lease.AuraStatus == Rejected && z.LifetimeOutcome.Value == Rejected))) return;
        if (zones.Any(z => BomberFireExposure.HoldsSource(world, z.Entity) ||
            world.Each<BomberSkillState>().Any(s => s.FireExposureEntity.Value == z.Entity) ||
            BomberTerrainTransactions.HoldsSource(world, z.Entity) || BomberIceBridges.HoldsSource(world, z.Entity))) return;
        var retired = lease with { RetirementSubmitted = true };
        Replace(world, lease, retired);
        foreach (var zone in zones) world.Commands.Destroy(zone.Entity);
    }

    internal static bool Covers(World world, BomberFireZoneState zone, int x, int z)
    {
        if (!zone.RegionCoverage.Value || zone.LifetimeOutcome.Value != RegionApplied || zone.Phase.Value != 1 ||
            zone.FromTick.Value > world.Tick || zone.UntilTick.Value <= world.Tick) return false;
        RequireActual(world, zone);
        var p = world.Get<LogicTransform>(zone.Entity).LocalPosition;
        return BomberFireRegionCoverage.Contains(BomberMatchRules.CellX(p), BomberMatchRules.CellZ(p), zone.CoverageMask.Value, x, z);
    }

    internal static void RequireActual(World world, BomberFireZoneState zone)
    {
        var lease = FindByZone(world, zone); ValidateZoneStorage(world, zone);
        bool paired = world.Manager.CompletedRestore == WorldRestoreCompletion.PairedCheckpoint;
        var rows = world.Get<EffectComponent>(zone.Entity).ActiveEffects.Where(r => r.TypeId == 10112).ToArray();
        if (rows.Length != 1) throw Invalid("Applied region has no unique actual finite row.");
        var r = rows[0]; var p = BomberFireZoneLifetimeEffect.ReadActualRow(r);
        if (r.Source != zone.SourceLife.Value || r.Target != zone.Entity || r.Suppressed ||
            r.Handle.InstanceId.Value != zone.LifetimeEffectInstance.Value || r.Handle.Generation != zone.LifetimeEffectGeneration.Value ||
            (r.Handle.WorldId.Value != zone.LifetimeEffectWorld.Value &&
                (!paired || r.Handle.WorldId != GasWorldContext.Require(world).WorldId)) ||
            r.AppliedTick != zone.FromTick.Value || r.Duration != zone.DurationTicks.Value ||
            r.EndTick != zone.UntilTick.Value || !EqualsPayload(p, Payload(zone, lease)))
            throw Invalid("Region actual finite row changed its exact source, full handle, payload or interval.");
        if (paired) zone.LifetimeEffectWorld.Value = r.Handle.WorldId.Value;
        ValidateNative(world, zone);
    }

    private static FiniteEffectView? Parent(World world, Lease lease)
    {
        var life = Id(world, lease.Life);
        if (!world.IsLive(life)) return null;
        var rows = world.Get<EffectComponent>(life).ActiveEffects.Where(r => r.TypeId == 10111 &&
            r.Handle.InstanceId.Value == lease.AuraInstance && r.Handle.Generation == lease.AuraGeneration).ToArray();
        if (rows.Length > 1) throw Invalid("Aura handle is duplicated.");
        if (rows.Length == 0) return null;
        var r = rows[0]; var p = BomberFireAuraEffect.ReadActualRow(r);
        if ((r.Handle.WorldId.Value != lease.AuraWorld &&
            (world.Manager.CompletedRestore != WorldRestoreCompletion.PairedCheckpoint || r.Handle.WorldId != GasWorldContext.Require(world).WorldId)) ||
            r.Target != life || r.Source != life || r.AppliedTick != lease.Start || r.Duration != lease.Duration ||
            r.EndTick != checked(lease.Start + lease.Duration) || p.Life != life || p.Participant != Id(world, lease.Participant) ||
            p.Generation != lease.Generation || p.MatchId != lease.Match || p.ChainId != lease.Chain || p.Duration != lease.Duration || !p.Favorite)
            throw Invalid("Region parent is not the actual Favorite Aura captured by its lease.");
        return r;
    }

    private static void ExpireNative(World world, BomberFireZoneState zone)
    {
        ValidateNative(world, zone);
        if (zone.Phase.Value == 2) return;
        if (zone.UntilTick.Value > world.Tick || zone.UntilTick.Value != checked(zone.FromTick.Value + zone.DurationTicks.Value))
            throw Invalid("Expired result has no valid finite interval.");
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FireZone);
        var machine = world.Get<BomberHfsmState>(zone.Entity);
        var before = machine.ReadSnapshot(definition, BomberHfsmKind.FireZone, machine.MachineKey.Value);
        var plan = definition.Send(before, BomberHfsmDefinitions.EventId.FireElapsed, new Dictionary<uint, bool>());
        if (plan.Outcome != HfsmOutcome.Transitioned || plan.Actions.Count != 1 ||
            plan.Actions[0].Action != BomberHfsmDefinitions.Action.ExpireFire || plan.Next is null ||
            plan.Next.ActivePath.Count != 1 || plan.Next.ActivePath[0].State != BomberHfsmDefinitions.State.FireExpired)
            throw Invalid("Native FireElapsed did not return the exact ExpireFire action.");
        machine.StorePlan(plan, definition, BomberHfsmKind.FireZone, machine.MachineKey.Value);
        zone.Phase.Value = 2;
        EmitEvent(world, zone, "fire_region_expired", zone.UntilTick.Value);
    }

    internal static void PublishBorn(World world, BomberFireZoneState zone) => EmitEvent(world, zone, "fire_region_born", zone.FromTick.Value);
    private static void EmitEvent(World world, BomberFireZoneState zone, string kind, ulong tick)
    {
        var lease = FindByZone(world, zone); var p = world.Get<LogicTransform>(zone.Entity).LocalPosition;
        world.Single<BomberPresentationJournal>().Append(world, kind, lease.Match,
            world.Single<BomberWorldRuntime>().AllocateEventSequence(), Id(world, lease.Participant), Id(world, lease.Life), lease.Generation,
            Id(world, lease.Participant), Id(world, lease.Life), zone.Entity, BomberMatchRules.CellX(p), BomberMatchRules.CellZ(p),
            "favorite_fire", new Dictionary<string, string> { ["skillId"] = "4", ["skillLevel"] = lease.Level.ToString(CultureInfo.InvariantCulture),
                ["chainId"] = lease.Chain.ToString(CultureInfo.InvariantCulture), ["mask"] = zone.CoverageMask.Value.ToString(CultureInfo.InvariantCulture),
                ["ordinal"] = zone.RegionOrdinal.Value.ToString(CultureInfo.InvariantCulture), ["fromTick"] = zone.FromTick.Value.ToString(CultureInfo.InvariantCulture),
                ["untilTick"] = zone.UntilTick.Value.ToString(CultureInfo.InvariantCulture) }, tick);
    }

    private static void ValidateNative(World world, BomberFireZoneState zone)
    {
        using var definition = BomberHfsmDefinitions.Compile(world, BomberHfsmKind.FireZone);
        var machine = world.Get<BomberHfsmState>(zone.Entity);
        var snapshot = machine.ReadSnapshot(definition, BomberHfsmKind.FireZone, machine.MachineKey.Value);
        uint leaf = zone.Phase.Value == 1 ? BomberHfsmDefinitions.State.FireActive : BomberHfsmDefinitions.State.FireExpired;
        if (zone.Phase.Value is not (1 or 2) || snapshot.ActivePath.Count != 1 || snapshot.ActivePath[0].State != leaf ||
            machine.MachineKey.Value > world.Single<BomberWorldRuntime>().NextHfsmMachineKey.Value)
            throw Invalid("Region projection differs from its Native lifecycle.");
    }

    internal static void Validate(World world)
    {
        var rows = Read(world); var config = BomberConfigBinding.For(world);
        if (rows.Count > config.ObjectBudgets.ParticipantLimit || rows.Sum(r => checked((long)r.Duration)) > config.ObjectBudgets.FireZoneCapacity)
            throw Invalid("Whole cast owner credits exceed the actual profile.");
        var lives = new HashSet<string>(StringComparer.Ordinal); var chains = new HashSet<ulong>(); var tokens = new HashSet<string>(StringComparer.Ordinal);
        foreach (var lease in rows)
        {
            _ = Id(world, lease.Life); _ = Id(world, lease.Participant);
            var participantId = Id(world, lease.Participant);
            if (!world.IsLive(participantId) || !world.TypeOf(participantId).Is<BomberParticipantEntity>() ||
                world.Get<BomberParticipantState>(participantId).MatchId.Value != lease.Match)
                throw Invalid("Cast lease lost its stable original Participant and match.");
            if (!lives.Add(lease.Life) || !chains.Add(lease.Chain) || lease.Generation == 0 || lease.Match == 0 || lease.Chain == 0 ||
                lease.Match != world.Single<BomberMatchState>().MatchId.Value || lease.Start > world.Tick || lease.Duration == 0 || lease.Duration > int.MaxValue ||
                lease.RegionDuration != Ticks.FromMilliseconds(1000, config.Game.TickRateHz) || lease.Level <= 0 ||
                !config.Tables.Characters.Rows.Any(c => c.BoundSlot == "Active" && c.BoundSkillId == 4u && c.BoundLevel == lease.Level) ||
                lease.Duration != Ticks.FromMilliseconds(config.SkillLevel(4, lease.Level).DurationMs, config.Game.TickRateHz) ||
                lease.AuraStatus is < Prepared or > Rejected || lease.End is < Running or > InitialRejected ||
                lease.NextOrdinal < 0 || (ulong)lease.NextOrdinal > lease.Duration || lease.PendingOrdinal < -1 ||
                lease.PendingOrdinal >= lease.NextOrdinal || (lease.PendingOrdinal != -1 && lease.PendingOrdinal != lease.NextOrdinal - 1) ||
                (lease.PendingOrdinal == -1 && lease.PendingZone != "") || (lease.Mask & ~511) != 0 || lease.Mask < 0 ||
                ((lease.AuraStatus >= Bound) != (lease.AuraWorld != 0 && lease.AuraInstance != 0 && lease.AuraGeneration != 0)) ||
                (lease.RetirementSubmitted && lease.End == Running)) throw Invalid("Invalid complete cast owner.");
            _ = checked(lease.Start + lease.Duration); _ = checked(lease.Start + lease.Duration - 1 + lease.RegionDuration);
            var zones = Zones(world, lease);
            if (!lease.RetirementSubmitted && zones.Length != lease.NextOrdinal - (lease.PendingOrdinal != -1 && lease.PendingZone == "" ? 1 : 0))
                throw Invalid("Cast region census omitted an issued ordinal.");
            var ordinals = new HashSet<int>();
            foreach (var zone in zones)
            {
                ValidateZoneStorage(world, zone);
                if (!ordinals.Add(zone.RegionOrdinal.Value) || !tokens.Add(zone.PromiseToken.Value)) throw Invalid("Duplicate region ordinal/token.");
                _ = FindByZone(world, zone);
            }
            if (!lease.RetirementSubmitted && Enumerable.Range(0, zones.Length).Any(i => !ordinals.Contains(i)))
                throw Invalid("Cast published ordinals are not contiguous.");
            if (lease.PendingZone != "") _ = Id(world, lease.PendingZone);
        }
        foreach (var zone in world.Each<BomberFireZoneState>().Where(z => z.RegionCoverage.Value)) _ = FindByZone(world, zone);
    }

    internal static void ValidateZoneStorage(World world, BomberFireZoneState zone)
    {
        if (!zone.RegionCoverage.Value) return; // Historical line content has its unchanged schema interpretation.
        _ = Id(world, zone.Entity.ToHex()); _ = Id(world, zone.Owner.Value.ToHex()); _ = Id(world, zone.SourceLife.Value.ToHex());
        if (zone.SourceSkill.Value != 4 || zone.SourceLifeGeneration.Value == 0 || zone.SourceMatchId.Value == 0 || zone.SourceChainId.Value == 0 ||
            zone.Direction.Value != 0 || zone.Length.Value != 3 || zone.RegionOrdinal.Value < 0 || zone.DurationTicks.Value == 0 ||
            zone.AuraEffectWorld.Value == 0 || zone.AuraEffectInstance.Value == 0 || zone.AuraEffectGeneration.Value == 0 ||
            zone.CoverageMask.Value is < 0 or > 511 || zone.LifetimeOutcome.Value is < Prepared or > Rejected ||
            (zone.LifetimeOutcome.Value == Prepared && (zone.BirthSubmitted.Value || zone.LifetimeEffectWorld.Value != 0 ||
                zone.LifetimeEffectInstance.Value != 0 || zone.LifetimeEffectGeneration.Value != 0)) ||
            (zone.LifetimeOutcome.Value != Prepared && !zone.BirthSubmitted.Value) ||
            ((zone.LifetimeOutcome.Value is RegionApplied or RegionExpired) &&
                (zone.LifetimeEffectWorld.Value == 0 || zone.LifetimeEffectInstance.Value == 0 || zone.LifetimeEffectGeneration.Value == 0)) ||
            ((zone.LifetimeEffectWorld.Value != 0 || zone.LifetimeEffectInstance.Value != 0 || zone.LifetimeEffectGeneration.Value != 0) &&
                (zone.LifetimeEffectWorld.Value == 0 || zone.LifetimeEffectInstance.Value == 0 || zone.LifetimeEffectGeneration.Value == 0)) ||
            (zone.LifetimeOutcome.Value >= RegionApplied && zone.LifetimeOutcome.Value != Rejected &&
                zone.UntilTick.Value != checked(zone.FromTick.Value + zone.DurationTicks.Value)) ||
            ((zone.LifetimeOutcome.Value is Prepared or Submitted or Rejected) && zone.UntilTick.Value != 0))
            throw Invalid("Invalid complete region storage.");
    }

    private static BomberFireZoneLifetimeEffect.Parameters Payload(BomberFireZoneState zone, Lease lease)
    {
        var pos = zone.World.Get<LogicTransform>(zone.Entity).LocalPosition;
        return new() { Duration = zone.DurationTicks.Value, Fx = "bomber.fire-region", Participant = zone.Owner.Value,
            Life = zone.SourceLife.Value, Generation = zone.SourceLifeGeneration.Value, MatchId = zone.SourceMatchId.Value,
            ChainId = zone.SourceChainId.Value, AuraWorld = zone.AuraEffectWorld.Value, AuraInstance = zone.AuraEffectInstance.Value,
            AuraGeneration = zone.AuraEffectGeneration.Value, Zone = zone.Entity, Ordinal = zone.RegionOrdinal.Value,
            X = BomberMatchRules.CellX(pos), Z = BomberMatchRules.CellZ(pos), Mask = zone.CoverageMask.Value, BirthTick = zone.FromTick.Value };
    }
    private static bool EqualsPayload(BomberFireZoneLifetimeEffect.Parameters a, BomberFireZoneLifetimeEffect.Parameters b) =>
        a.Duration == b.Duration && a.Fx == b.Fx && a.Participant == b.Participant && a.Life == b.Life && a.Generation == b.Generation &&
        a.MatchId == b.MatchId && a.ChainId == b.ChainId && a.AuraWorld == b.AuraWorld && a.AuraInstance == b.AuraInstance &&
        a.AuraGeneration == b.AuraGeneration && a.Zone == b.Zone && a.Ordinal == b.Ordinal && a.X == b.X && a.Z == b.Z && a.Mask == b.Mask && a.BirthTick == b.BirthTick;
    private static BomberFireZoneState[] Zones(World world, Lease lease) => world.Each<BomberFireZoneState>().Where(z => z.RegionCoverage.Value &&
        z.SourceLife.Value.ToHex() == lease.Life && z.SourceChainId.Value == lease.Chain).OrderBy(z => z.RegionOrdinal.Value).ToArray();
    private static Lease Find(World world, NetEntityId life) => Read(world).SingleOrDefault(l => l.Life == life.ToHex()) ?? throw Invalid("Missing cast lease.");
    private static Lease FindByZone(World world, BomberFireZoneState zone)
    {
        var lease = Read(world).SingleOrDefault(l => l.Life == zone.SourceLife.Value.ToHex() && l.Chain == zone.SourceChainId.Value) ?? throw Invalid("Published region has no exact cast owner.");
        if (zone.Owner.Value.ToHex() != lease.Participant || zone.SourceLifeGeneration.Value != lease.Generation || zone.SourceMatchId.Value != lease.Match ||
            zone.RegionOrdinal.Value >= lease.NextOrdinal || zone.FromTick.Value != checked(lease.Start + (ulong)zone.RegionOrdinal.Value) ||
            zone.DurationTicks.Value != lease.RegionDuration || zone.AuraEffectWorld.Value != lease.AuraWorld ||
            zone.AuraEffectInstance.Value != lease.AuraInstance || zone.AuraEffectGeneration.Value != lease.AuraGeneration ||
            zone.PromiseToken.Value != Token(world, lease, zone.RegionOrdinal.Value, BomberMatchRules.CellX(world.Get<LogicTransform>(zone.Entity).LocalPosition), BomberMatchRules.CellZ(world.Get<LogicTransform>(zone.Entity).LocalPosition), zone.CoverageMask.Value)) throw Invalid("Region substituted its complete immutable owner tuple.");
        if (lease.PendingOrdinal == zone.RegionOrdinal.Value && (zone.CoverageMask.Value != lease.Mask ||
            BomberMatchRules.CellX(world.Get<LogicTransform>(zone.Entity).LocalPosition) != lease.X ||
            BomberMatchRules.CellZ(world.Get<LogicTransform>(zone.Entity).LocalPosition) != lease.Z ||
            (lease.PendingZone != "" && lease.PendingZone != zone.Entity.ToHex()))) throw Invalid("Pending publication substituted center/mask/issued ID.");
        return lease;
    }

    internal static void ValidateObservationOwners(World world) => Validate(world);
    private static Lumio.GameRuntime.Coordination.VoxelCellQuery[]? Photo(World world) => BomberTerrainRead.ForFavoriteOwnerObservation(world);
    private static int CaptureMask(World world, int x, int z)
    {
        var photo = Photo(world) ?? throw Invalid("Owed region has no complete actual Native photo.");
        var config = BomberConfigBinding.For(world); int mask = 0, area = checked(config.Map.Width * config.Map.Depth);
        for (int bit = 0; bit < 9; bit++)
        {
            int atX = x + bit % 3 - 1, atZ = z + bit / 3 - 1;
            if (atX < 0 || atZ < 0 || atX >= config.Map.Width || atZ >= config.Map.Depth) continue;
            uint obstacle = photo[area + atZ * config.Map.Width + atX].BlockId >> 8;
            if (config.Tables.Blocks.Rows.Any(b => b.Enabled && b.BlockType == obstacle && b.Walkable)) mask |= 1 << bit;
        }
        return mask;
    }
    private static string Token(World world, Lease lease, int ordinal, int x, int z, int mask) => FormattableString.Invariant($"favorite:{world.InstanceId:x16}:{lease.Match:x16}:{lease.Life}:{lease.Generation:x16}:{lease.Chain:x16}:{lease.AuraWorld:x16}:{lease.AuraInstance:x16}:{lease.AuraGeneration:x8}:{ordinal:x8}:{x:x8}:{z:x8}:{mask:x8}:{checked(lease.Start + (ulong)ordinal):x16}");
    private static NetEntityId Id(World world, string value)
    {
        if (!NetEntityId.TryParse(value, out var id) || id.IsDefault || id.Counter == 0 || id.InstanceId != world.InstanceId || id.ToHex() != value)
            throw Invalid("Owner identity is not a canonical full local ID.");
        return id;
    }
    private static string Encode(List<Lease> rows)
    {
        if (rows.Count == 0) return "";
        string value = JsonSerializer.Serialize(rows, Codec);
        if (Encoding.UTF8.GetByteCount(value) > MaxBytes) throw Invalid("Cast owner UTF8 byte limit exceeded.");
        return value;
    }
    private static List<Lease> Read(World world)
    {
        string value = world.Single<BomberWorldRuntime>().FireTrailPromises.Value;
        if (value == "") return new();
        if (Encoding.UTF8.GetByteCount(value) > MaxBytes) throw Invalid("Cast owner UTF8 byte limit exceeded.");
        try
        {
            using var doc = JsonDocument.Parse(value);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || (doc.RootElement.GetArrayLength() < 1 || doc.RootElement.GetArrayLength() > BomberConfigBinding.For(world).ObjectBudgets.ParticipantLimit)) throw Invalid("Cast owner array is malformed.");
            foreach (var element in doc.RootElement.EnumerateArray())
            {
                var names = element.EnumerateObject().Select(p => p.Name).ToArray();
                if (names.Length != Members.Length || names.Distinct(StringComparer.Ordinal).Count() != Members.Length || Members.Any(m => !names.Contains(m, StringComparer.Ordinal)))
                    throw Invalid("Cast owner omitted, duplicated or extended a closed member.");
            }
            var rows = JsonSerializer.Deserialize<List<Lease>>(value, Codec) ?? throw Invalid("Cast owner is null.");
            if (rows.Any(l => l is null || l.Participant is null || l.Life is null || l.PendingZone is null) || Encode(rows) != value)
                throw Invalid("Cast owner is not canonical closed ASCII JSON.");
            return rows;
        }
        catch (JsonException e) { throw new InvalidOperationException("Malformed cast owner JSON.", e); }
    }
    private static void Save(World world, List<Lease> rows) => world.Single<BomberWorldRuntime>().FireTrailPromises.Value = Encode(rows);
    private static void Replace(World world, Lease before, Lease after)
    {
        var rows = Read(world); int index = rows.IndexOf(before);
        if (index < 0) throw Invalid("Cast owner changed during a serialized operation.");
        rows[index] = after; Save(world, rows);
    }
    private static InvalidOperationException Invalid(string message) => new(message);
}
