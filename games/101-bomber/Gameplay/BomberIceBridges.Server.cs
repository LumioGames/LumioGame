using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.EntityTypes;
using NativeHfsmDefinition = Lumio.Engine.NativeLoader.NativeHfsmDefinition;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

// PRIVATE CANDIDATE ONLY. Root owns publication, formal profile budgets and tests.
internal static class BomberIceBridges
{
    internal const int MaxRows = 60, MaxBytes = 65536;
    private const int Birth = 1, FrozenPending = 2, Active = 3, WaterPending = 4, Retiring = 5;
    private sealed record Promise(string FreezeToken, string Bridge, ulong Generation, ulong Match,
        string SourceBomb, string SourceLife, ulong SourceLifeGeneration, string SourceParticipant, ulong ChainId,
        int X, int Z, ulong ExpectedRevision, int Phase, bool CreationSubmitted, ulong CreationTick,
        string TransactionId, bool MutationSubmitted, ulong SubmittedTick, ulong AppliedTick,
        ulong ExpiresAtTick, bool RetirementSubmitted, bool MeltRequested, string MeltCause);
    private readonly record struct Contact(int X, int Z, NetEntityId Bomb, NetEntityId Life,
        ulong LifeGeneration, NetEntityId Participant, ulong Chain, ulong Match);
    private sealed class Frame
    {
        internal ulong Tick;
        internal readonly Dictionary<(int X, int Z), Contact> Freeze = new();
        internal readonly Dictionary<(int X, int Z), string> Melt = new();
        internal readonly HashSet<NetEntityId> HeldSources = new();
    }
    private static readonly JsonSerializerOptions Codec = new()
    { UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow };

    private static Frame For(World world)
    {
        if (!world.TryGetService<Frame>(out var frame) || frame is null)
        { frame = new(); world.AttachService(frame); }
        if (frame.Tick != world.Tick)
        { frame.Tick = world.Tick; frame.Freeze.Clear(); frame.Melt.Clear(); frame.HeldSources.Clear(); }
        return frame;
    }

    internal static bool HasPending(World world) => Read(world).Count != 0;
    internal static bool HoldsSource(World world, NetEntityId source) => For(world).HeldSources.Contains(source) ||
        Read(world).Any(row => row.MeltRequested && row.MeltCause.StartsWith("region:" + source.ToHex() + ":", StringComparison.Ordinal));

    internal static bool HoldsFuse(World world, BomberBombState bomb)
    {
        if (!world.IsLive(bomb.Entity) || bomb.Phase.Value != (int)BomberBombPhase.Fuse) return false;
        var position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
        int x = BomberMatchRules.CellX(position), z = BomberMatchRules.CellZ(position);
        var owner = Read(world).SingleOrDefault(row => row.Phase == WaterPending && row.X == x && row.Z == z);
        if (owner is null) return false;
        var config = BomberConfigBinding.For(world);
        var photo = BomberTerrainRead.ForBridgeOwnerObservation(world) ??
            throw Invalid("Pending water has no complete ready Native photo.");
        var adapter = VoxelGameplayBinding.Resolve(world.Manager)!;
        var address = BomberTerrainTransactions.Address(config.Map, x, config.Map.GroundLayer, z);
        var actual = photo[z * config.Map.Width + x];
        return actual.BlockId == Block(config, "water") && actual.SectionRevision > owner.ExpectedRevision &&
            adapter.BindingGet(address.Section, address.Offset) is null;
    }

    internal static void Begin(World world)
    {
        _ = For(world);
        Validate(world);
        ValidateNativeOwners(world);
        var rows = Read(world);
        foreach (var row in rows.Where(row => row.Phase is Birth or FrozenPending))
            For(world).HeldSources.Add(Id(world, row.SourceBomb));
        bool changed = false;
        for (int i = rows.Count - 1; i >= 0; i--)
        {
            Promise row = rows[i];
            if (row.Phase == Birth && row.Bridge == "")
            {
                var found = world.Each<BomberIceBridgeState>().Where(bridge => world.IsLive(bridge.Entity) &&
                    bridge.FreezeToken.Value == row.FreezeToken).ToArray();
                if (found.Length > 1) throw Invalid("Bridge publication duplicated its token.");
                if (found.Length == 1)
                {
                    RequireBridge(world, row, found[0], unpublished: true);
                    rows[i] = row with { Bridge = found[0].Entity.ToHex() };
                    changed = true;
                }
                // A submitted order with no observable row stays owned. It is never replayed.
            }
            if (row.Phase == Retiring && row.Bridge != "" && !world.IsLive(Id(world, row.Bridge)))
            {
                if (!row.RetirementSubmitted) throw Invalid("Bridge disappeared before its water lifecycle settlement.");
                rows.RemoveAt(i); changed = true;
            }
        }
        if (changed) Save(world, rows);
        using var retirementDefinition = rows.Any(row => row.Phase == Retiring && !row.RetirementSubmitted)
            ? BomberHfsmDefinitions.Compile(world, BomberHfsmKind.Bomb) : null;
        foreach (var row in rows.Where(row => row.Phase == Retiring && !row.RetirementSubmitted).ToArray())
            CompleteWaterRetirementAfterNativeValidation(world, row, retirementDefinition!);
        Validate(world);
    }

    internal static void RequestContact(World world, BomberBombState source, IReadOnlyList<(int X, int Z)> cells)
    {
        if (source.BombKind.Value != (int)BomberBombKind.Freeze && source.BombKind.Value != (int)BomberBombKind.ReservedFire) return;
        if (!world.IsLive(source.Entity)) throw Invalid("A terrain contact requires its actual bomb row.");
        var match = world.Single<BomberMatchState>();
        var c = new Contact(0, 0, source.Entity, source.SourceLife.Value, source.SourceLifeGeneration.Value,
            source.Owner.Value, source.ChainId.Value, match.MatchId.Value);
        _ = Id(world, c.Bomb.ToHex()); _ = Id(world, c.Life.ToHex()); _ = Id(world, c.Participant.ToHex());
        if (c.LifeGeneration == 0 || c.Chain == 0 || c.Match == 0) throw Invalid("Freeze contact lost its complete source.");
        var frame = For(world);
        if (source.BombKind.Value == (int)BomberBombKind.Freeze && cells.Count != 0) frame.HeldSources.Add(source.Entity);
        foreach (var at in cells)
        {
            if (source.BombKind.Value == (int)BomberBombKind.ReservedFire) AddMelt(frame, at, FireCause(world, source));
            else if (!frame.Freeze.TryGetValue(at, out var old) || source.Entity.CompareTo(old.Bomb) < 0)
                frame.Freeze[at] = c with { X = at.X, Z = at.Z };
        }
    }

    internal static void RequestRetainedFire(World world)
    {
        var frame = For(world);
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            bool covering = (bomb.Phase.Value == (int)BomberBombPhase.Burn && bomb.BurnUntilTick.Value > world.Tick) ||
                (bomb.Phase.Value == (int)BomberBombPhase.Danger && bomb.DangerUntilTick.Value > world.Tick);
            if (!world.IsLive(bomb.Entity) || bomb.BombKind.Value != (int)BomberBombKind.ReservedFire || !covering) continue;
            var p = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            int x = BomberMatchRules.CellX(p), z = BomberMatchRules.CellZ(p);
            string cause = FireCause(world, bomb);
            AddMelt(frame, (x, z), cause);
            for (int distance = 1; distance <= bomb.ReachUp.Value; distance++) AddMelt(frame, (x, z - distance), cause);
            for (int distance = 1; distance <= bomb.ReachRight.Value; distance++) AddMelt(frame, (x + distance, z), cause);
            for (int distance = 1; distance <= bomb.ReachDown.Value; distance++) AddMelt(frame, (x, z + distance), cause);
            for (int distance = 1; distance <= bomb.ReachLeft.Value; distance++) AddMelt(frame, (x - distance, z), cause);
        }
        foreach (var region in world.Each<BomberFireZoneState>())
        {
            if (!region.RegionCoverage.Value || region.LifetimeOutcome.Value != 3 || region.UntilTick.Value <= world.Tick) continue;
            BomberFavoriteFireZones.RequireActual(world, region);
            var position = world.Get<LogicTransform>(region.Entity).LocalPosition;
            string cause = FormattableString.Invariant($"region:{region.Entity.ToHex()}:{region.SourceLife.Value.ToHex()}:{region.SourceLifeGeneration.Value:x16}:{region.Owner.Value.ToHex()}:{region.SourceChainId.Value:x16}:{region.SourceMatchId.Value:x16}:{world.Tick:x16}");
            foreach (var cell in BomberFireRegionCoverage.Cells(BomberMatchRules.CellX(position), BomberMatchRules.CellZ(position), region.CoverageMask.Value))
                AddMelt(frame, cell, cause);
        }
    }

    internal static void End(World world)
    {
        var rows = Read(world);
        var frame = For(world);
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        var runtime = world.Single<BomberWorldRuntime>();
        RequestRetainedFire(world);
        bool ending = match.Phase.Value == (int)BomberMatchPhase.Results && world.Tick >= match.PhaseEndTick.Value;
        foreach (Promise row in rows)
            if (ending) AddMelt(frame, (row.X, row.Z), FormattableString.Invariant($"round:{world.Tick:x16}"));
            else if (row.Phase == Active && row.ExpiresAtTick <= world.Tick)
                AddMelt(frame, (row.X, row.Z), FormattableString.Invariant($"expiry:{row.ExpiresAtTick:x16}"));
        var latched = rows.Select(row => frame.Melt.TryGetValue((row.X, row.Z), out var cause) && !row.MeltRequested
            ? row with { MeltRequested = true, MeltCause = cause } : row).ToList();
        if (!latched.SequenceEqual(rows)) { Save(world, latched); rows = latched; }
        // Resolve all contacts before any new structural order. A losing Freeze owns no late mutation.
        for (int i = 0; i < rows.Count; i++)
        {
            Promise row = rows[i];
            if (row.Phase != Birth || row.Bridge == "" || !row.MeltRequested) continue;
            var cancelled = row with { Phase = Retiring, RetirementSubmitted = true };
            var next = rows.ToList(); next[i] = cancelled;
            Save(world, next); rows = next;
            world.Commands.Destroy(Id(world, row.Bridge));
        }
        if (!ending && (runtime.InitialResourcePhase.Value is 0 or 3))
        {
            var read = BomberTerrainRead.For(world);
            bool canBirth = frame.Freeze.Count != 0 && CanBirth(world, rows);
            ulong observedGeneration = canBirth ? world.Each<BomberChestState>().Select(item => item.ResourceGeneration.Value)
                .Concat(world.Each<BomberBarrelState>().Select(item => item.ResourceGeneration.Value))
                .Concat(world.Each<BomberIceBridgeState>().Select(item => item.ResourceGeneration.Value)).DefaultIfEmpty(1UL).Max() : 1UL;
            if (read is not null && canBirth)
            foreach (var request in frame.Freeze.OrderBy(pair => pair.Key.Z).ThenBy(pair => pair.Key.X))
            {
                var at = request.Key;
                if (frame.Melt.ContainsKey(at) || rows.Any(row => row.X == at.X && row.Z == at.Z) ||
                    rows.Count >= MaxRows) continue;
                if (!Inside(config.Map, at.X, at.Z)) continue;
                var cell = read[at.Z * config.Map.Width + at.X];
                var address = BomberTerrainTransactions.Address(config.Map, at.X, config.Map.GroundLayer, at.Z);
                var adapter = VoxelGameplayBinding.Resolve(world.Manager)!;
                if (cell.BlockId != Block(config, "water") || cell.SectionRevision == 0 ||
                    adapter.BindingGet(address.Section, address.Offset) is not null) continue;
                ulong generation = checked(Math.Max(Math.Max(1UL, observedGeneration), runtime.NextResourceGeneration.Value) + 1);
                string token = FormattableString.Invariant($"ice:{world.InstanceId:x16}:{match.MatchId.Value:x16}:{generation:x16}");
                Contact source = request.Value;
                var row = new Promise(token, "", generation, source.Match, source.Bomb.ToHex(), source.Life.ToHex(),
                    source.LifeGeneration, source.Participant.ToHex(), source.Chain, at.X, at.Z,
                    cell.SectionRevision, Birth, true, world.Tick, "", false, 0, 0, 0, false, false, "");
                var next = rows.Append(row).ToList();
                _ = Encode(next); // Every byte/object/identity preflight precedes the first owner or birth write.
                runtime.NextResourceGeneration.Value = generation;
                Save(world, next); rows = next;
                var order = world.Commands.Create<BomberIceBridgeEntity>();
                var bridge = order.Get<BomberIceBridgeState>();
                bridge.ResourceGeneration.Value = generation; bridge.MatchId.Value = row.Match;
                bridge.FreezeToken.Value = token;
            }
        }
        if (!BomberTerrainTransactions.FrameAvailable(world)) return;
        var eligible = rows.Where(row => (row.Phase == Active && row.MeltRequested) ||
            (row.Phase == Birth && row.Bridge != "" && !row.MeltRequested)).ToArray();
        if (eligible.Length == 0) return;
        // One same-kind complete cohort, with water always taking the shared writer first.
        bool melting = eligible.Any(row => row.Phase == Active);
        var cohort = eligible.Where(row => (row.Phase == Active) == melting).ToArray();
        var adapterOwner = VoxelGameplayBinding.Resolve(world.Manager)!;
        uint ice = Block(config, "ice") >> 8;
        string wire = world.Registry.WireName(typeof(BomberIceBridgeEntity));
        var policies = adapterOwner.BindingPolicy.Where(p => p.BlockType == ice)
            .ToArray();
        if (policies.Length > 1 || (policies.Length == 1 && policies[0].EntityType != wire))
            throw Invalid("Ice binding policy is owned by a different type.");
        if (policies.Length == 0)
        {
            if (!adapterOwner.TrySetBindingPolicy(adapterOwner.BindingPolicy.Concat(new[] { new VoxelBindingPolicyEntry(ice, wire) }).ToArray())) return;
        }
        else if (!adapterOwner.TryRefreshBindingContext()) return;
        var readNative = BomberTerrainRead.For(world);
        if (readNative is null) return;
        var writes = new List<BomberPendingVoxelCell>();
        var metadata = new List<BomberTerrainDetail>();
        var bind = new List<VoxelBindingOp>();
        foreach (Promise row in cohort)
        {
            var address = BomberTerrainTransactions.Address(config.Map, row.X, config.Map.GroundLayer, row.Z);
            var actual = readNative[row.Z * config.Map.Width + row.X];
            var id = Id(world, row.Bridge);
            RequireBridge(world, row, world.Get<BomberIceBridgeState>(id), unpublished: !melting);
            if (actual.BlockId != Block(config, melting ? "ice" : "water") || actual.SectionRevision == 0 ||
                adapterOwner.BindingGet(address.Section, address.Offset) != (melting ? row.Bridge : null))
                throw Invalid("Bridge request does not own its exact Native cell and binding.");
            var updated = row with { ExpectedRevision = actual.SectionRevision };
            rows[rows.FindIndex(r => r.FreezeToken == row.FreezeToken)] = updated;
            writes.Add(new(new(address.Section, address.Offset, Block(config, melting ? "water" : "ice"), actual.SectionRevision),
                actual.BlockId, melting ? BomberVoxelIntentKind.MeltBridge : BomberVoxelIntentKind.FreezeBridge,
                Id(world, row.SourceParticipant), Id(world, row.SourceLife), row.SourceLifeGeneration,
                Id(world, row.SourceBomb), id, row.ChainId));
            metadata.Add(new(row.X, row.Z, 0, 0, "", row.CreationTick, 0,
                Array.Empty<BomberTerrainReward>(), CellGeneration: row.Generation));
            bind.Add(new(address.Section, address.Offset, melting ? null : row.Bridge)
                { ExpectedSectionRevision = actual.SectionRevision });
        }
        Save(world, rows);
        BomberTerrainTransactions.Bridge(world, writes, metadata, bind);
    }

    // Conservative simultaneous shared credit proof. Whole producer maxima cover all
    // unpublished and Unknown orders of other supported producers; no SDK private census.
    private static bool CanBirth(World world, List<Promise> rows)
    {
        var budget = BomberConfigBinding.For(world).ObjectBudgets;
        long reserved = world.LiveEntityCount;
        reserved += Math.Max(0, budget.BombCapacity - world.Each<BomberBombState>().Count());
        reserved += Math.Max(0, budget.PickupCapacity - world.Each<BomberPickupItem>().Count());
        reserved += Math.Max(0, budget.FireZoneCapacity - world.Each<BomberFireZoneState>().Count());
        reserved += Math.Max(0, budget.ParticipantLimit * 3 - world.Each<BomberParticipantState>().Count() - world.Each<BomberPlayerState>().Count());
        reserved += Math.Max(0, budget.ChestLimit - world.Each<BomberChestState>().Count());
        reserved += Math.Max(0, 8 - world.Each<BomberBarrelState>().Count());
        // The full60 slot provision includes live, Birth/Unknown and retirement owners.
        reserved += Math.Max(0, MaxRows - world.Each<BomberIceBridgeState>().Count());
        return rows.Count < MaxRows && reserved <= world.EffectiveMaxLiveEntitiesBudget;
    }

    internal static void Stage(World world, string transaction, IReadOnlyList<BomberPendingVoxelCell> cells)
    {
        var rows = Read(world);
        foreach (var cell in cells)
        {
            int index = rows.FindIndex(row => row.Bridge == cell.Chest.ToHex());
            if (index < 0) throw Invalid("Bridge staging lost its full owner.");
            var row = rows[index];
            bool freezing = cell.Kind == BomberVoxelIntentKind.FreezeBridge;
            if (row.Phase != (freezing ? Birth : Active) || row.TransactionId != "" || row.MutationSubmitted)
                throw Invalid("Bridge mutation was already submitted.");
            if (row.MeltRequested == freezing) throw Invalid("Bridge staging lost the persistent melt priority.");
            _ = checked(world.Tick + Ticks.FromMilliseconds(8000, BomberConfigBinding.For(world).Game.TickRateHz));
            rows[index] = row with { Phase = freezing ? FrozenPending : WaterPending,
                TransactionId = transaction, MutationSubmitted = true, SubmittedTick = world.Tick };
        }
        Save(world, rows);
    }

    internal static void ValidatePending(World world, int index, BomberTerrainDetail detail)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        var rows = Read(world);
        var row = rows.SingleOrDefault(row => row.Bridge == runtime.PendingChests[index].ToHex())
            ?? throw Invalid("Bridge Native intent has no unique durable owner.");
        var map = BomberConfigBinding.For(world).Map;
        var address = BomberTerrainTransactions.Address(map, row.X, map.GroundLayer, row.Z);
        bool freezing = row.Phase == FrozenPending;
        if (row.Phase is not FrozenPending and not WaterPending || !row.MutationSubmitted ||
            row.TransactionId != runtime.PendingVoxelTransactionIds[0] || row.SubmittedTick != runtime.PendingVoxelSubmittedTicks[0] ||
            row.Match != runtime.PendingVoxelMatchIds[0] || runtime.PendingSections[index] != address.Section ||
            runtime.PendingCellOffsets[index] != address.Offset || runtime.PendingExpectedRevisions[index] != row.ExpectedRevision ||
            runtime.PendingKinds[index] != (int)(freezing ? BomberVoxelIntentKind.FreezeBridge : BomberVoxelIntentKind.MeltBridge) ||
            runtime.PendingOldBlocks[index] != Block(BomberConfigBinding.For(world), freezing ? "water" : "ice") ||
            runtime.PendingNewBlocks[index] != Block(BomberConfigBinding.For(world), freezing ? "ice" : "water") ||
            runtime.PendingParticipants[index].ToHex() != row.SourceParticipant || runtime.PendingSourceLives[index].ToHex() != row.SourceLife ||
            runtime.PendingSourceLifeGenerations[index] != row.SourceLifeGeneration || runtime.PendingSourceBombs[index].ToHex() != row.SourceBomb ||
            runtime.PendingChainIds[index] != row.ChainId || detail.X != row.X || detail.Z != row.Z || detail.CellGeneration != row.Generation ||
            detail.Occurred != row.CreationTick || detail.Direction != 0 || detail.Remaining != 0 || detail.Family != "" ||
            detail.Reserved != 0 || detail.Rewards is null || detail.Rewards.Length != 0 || detail.Tier != 0 || detail.CircleStage != 0)
            throw Invalid("Bridge pending changed its full cell, generation, source or submission tuple.");
    }

    internal static void ValidateAppliedBatch(World world, string transaction, VoxelMutationOutcome outcome)
    {
        var adapter = VoxelGameplayBinding.Resolve(world.Manager) ?? throw Invalid("Bridge Native owner disappeared.");
        var rows = Read(world).Where(row => row.TransactionId == transaction).ToArray();
        var map = BomberConfigBinding.For(world).Map;
        if (rows.Length == 0 || rows.Length != world.Single<BomberWorldRuntime>().PendingKinds.Count)
            throw Invalid("Bridge Original does not cover the complete cohort.");
        var addresses = rows.Select(row => BomberTerrainTransactions.Address(map, row.X, map.GroundLayer, row.Z)).ToArray();
        var photo = BomberTerrainRead.ForCommittedBridge(world, transaction, outcome) ??
            throw Invalid("Bridge Original has no complete ready Native photo.");
        using var definition = rows.Any(row => row.Phase == WaterPending)
            ? BomberHfsmDefinitions.Compile(world, BomberHfsmKind.Bomb) : null;
        for (int i = 0; i < rows.Length; i++)
        {
            var row = rows[i];
            var actual = photo[row.Z * map.Width + row.X];
            bool freezing = row.Phase == FrozenPending;
            RequireBridge(world, row, world.Get<BomberIceBridgeState>(Id(world, row.Bridge)), unpublished: freezing);
            if (!actual.HasBlockId || actual.Presence is not (VoxelPresence.Ready or VoxelPresence.Unchanged) ||
                actual.BlockId != Block(BomberConfigBinding.For(world), freezing ? "ice" : "water") ||
                actual.SectionRevision <= row.ExpectedRevision ||
                adapter.BindingGet(addresses[i].Section, addresses[i].Offset) != (freezing ? row.Bridge : null))
                throw Invalid("Bridge Original did not accept the exact Native material and binding.");
            if (!freezing)
                foreach (var bomb in Occupants(world, row)) BomberBombLifecycle.Ensure(world, bomb, definition!);
        }
    }

    internal static void Accept(World world, string transaction, VoxelMutationOutcome outcome)
    {
        if (outcome.Status != 0 || outcome.State != VoxelTxnState.Applied ||
            outcome.Disposition != VoxelCommitDisposition.Original || !outcome.TokenConsumed)
            throw Invalid("Bridge settlement requires the actual Original.");
        var rows = Read(world);
        var accepted = rows.Where(row => row.TransactionId == transaction).ToArray();
        if (accepted.Length == 0) throw Invalid("Bridge receipt has no matching owner.");
        ulong duration = Ticks.FromMilliseconds(8000, BomberConfigBinding.For(world).Game.TickRateHz);
        var next = rows.Select(row => row.TransactionId != transaction ? row : row.Phase == FrozenPending
            ? row with { Phase = Active, AppliedTick = row.SubmittedTick, ExpiresAtTick = checked(row.SubmittedTick + duration),
                TransactionId = "", MutationSubmitted = false, SubmittedTick = 0 }
            : row with { Phase = Retiring, RetirementSubmitted = false, TransactionId = "", MutationSubmitted = false, SubmittedTick = 0 }).ToList();
        _ = Encode(next);
        // Pure all-row/occupant validation is performed before this method by the single consumer.
        Save(world, next);
        using var definition = accepted.Any(row => row.Phase == WaterPending)
            ? BomberHfsmDefinitions.Compile(world, BomberHfsmKind.Bomb) : null;
        foreach (var row in accepted)
        {
            var id = Id(world, row.Bridge);
            if (row.Phase == FrozenPending)
            {
                var bridge = world.Get<BomberIceBridgeState>(id);
                bridge.AppliedTick.Value = row.SubmittedTick;
                bridge.ExpiresAtTick.Value = checked(row.SubmittedTick + duration);
            }
            else
            {
                CompleteWaterRetirementAfterNativeValidation(world, next.Single(candidate => candidate.FreezeToken == row.FreezeToken), definition!);
            }
        }
    }

    internal static void Reject(World world, string transaction)
    {
        var rows = Read(world);
        var rejected = rows.Where(row => row.TransactionId == transaction).ToArray();
        if (rejected.Length == 0) throw Invalid("Bridge rejection lost its exact transaction.");
        var adapter = VoxelGameplayBinding.Resolve(world.Manager) ?? throw Invalid("Rejected bridge lost its Native owner.");
        var map = BomberConfigBinding.For(world).Map;
        var addresses = rejected.Select(row => BomberTerrainTransactions.Address(map, row.X, map.GroundLayer, row.Z)).ToArray();
        var photo = BomberTerrainRead.ForBridgeOwnerObservation(world) ??
            throw Invalid("Rejected bridge has no complete ready Native photo.");
        for (int i = 0; i < rejected.Length; i++)
        {
            var actual = photo[rejected[i].Z * map.Width + rejected[i].X];
            bool freezing = rejected[i].Phase == FrozenPending;
            if (!actual.HasBlockId || actual.Presence is not (VoxelPresence.Ready or VoxelPresence.Unchanged) ||
                actual.BlockId != Block(BomberConfigBinding.For(world), freezing ? "water" : "ice") ||
                adapter.BindingGet(addresses[i].Section, addresses[i].Offset) != (freezing ? null : rejected[i].Bridge))
                throw Invalid("Bridge rejection cannot release a still accepted or differently bound generation.");
        }
        var next = rows.Select(row => row.TransactionId != transaction ? row : row.Phase == FrozenPending
            ? row with { Phase = Retiring, RetirementSubmitted = true, TransactionId = "", MutationSubmitted = false, SubmittedTick = 0 }
            : row with { Phase = Active, TransactionId = "", MutationSubmitted = false, SubmittedTick = 0 }).ToList();
        Save(world, next);
        foreach (var row in rejected.Where(row => row.Phase == FrozenPending)) world.Commands.Destroy(Id(world, row.Bridge));
    }

    internal static void Validate(World world)
    {
        var rows = Read(world);
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        ulong match = world.Single<BomberMatchState>().MatchId.Value;
        var tokens = new HashSet<string>(StringComparer.Ordinal);
        var generations = new HashSet<ulong>(); var cells = new HashSet<(int, int)>(); var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (Promise row in rows)
        {
            if (row is null || row.FreezeToken is null || row.Bridge is null || row.SourceBomb is null || row.SourceLife is null ||
                row.SourceParticipant is null || row.TransactionId is null || row.MeltCause is null) throw Invalid("Bridge row contains null fields.");
            _ = Id(world, row.SourceBomb); _ = Id(world, row.SourceLife); _ = Id(world, row.SourceParticipant);
            string expectedToken = FormattableString.Invariant($"ice:{world.InstanceId:x16}:{row.Match:x16}:{row.Generation:x16}");
            if (row.FreezeToken != expectedToken || Encoding.UTF8.GetByteCount(row.FreezeToken) > 128 || !tokens.Add(row.FreezeToken) ||
                row.Generation == 0 || row.Generation > runtime.NextResourceGeneration.Value || !generations.Add(row.Generation) ||
                row.Match == 0 || row.Match != match || !cells.Add((row.X, row.Z)) || !Inside(config.Map, row.X, row.Z) ||
                row.SourceLifeGeneration == 0 || row.ChainId == 0 ||
                row.ExpectedRevision == 0 || row.Phase is < Birth or > Retiring || !row.CreationSubmitted || row.CreationTick > world.Tick ||
                (row.Bridge == "" && row.Phase != Birth) || (row.Bridge != "" && !ids.Add(row.Bridge)) ||
                row.MutationSubmitted != (row.Phase is FrozenPending or WaterPending) ||
                (row.MutationSubmitted ? !CanonicalTransaction(world, row.TransactionId, row.Match) || row.SubmittedTick < row.CreationTick || row.SubmittedTick > world.Tick
                    : row.TransactionId != "" || row.SubmittedTick != 0) ||
                (row.RetirementSubmitted && row.Phase != Retiring) ||
                (row.Phase == Retiring && row.AppliedTick == 0 && !row.RetirementSubmitted) ||
                ((row.AppliedTick == 0) != (row.ExpiresAtTick == 0)) ||
                (row.AppliedTick != 0 && (row.AppliedTick < row.CreationTick || row.AppliedTick > world.Tick ||
                    row.ExpiresAtTick != checked(row.AppliedTick + Ticks.FromMilliseconds(8000, config.Game.TickRateHz)))) ||
                (row.Phase is Active or WaterPending && row.AppliedTick == 0) ||
                (row.Phase is Birth or FrozenPending && row.AppliedTick != 0))
                throw Invalid("Bridge owner has invalid full identity, phase or immutable clock.");
            if (row.Phase == WaterPending && !row.MeltRequested) throw Invalid("Water mutation lost its melt obligation.");
            if (row.MeltRequested != (row.MeltCause != "")) throw Invalid("Bridge melt flag lost its exact cause.");
            if (row.MeltRequested) ValidateMeltCause(world, row);
            if (row.Bridge != "")
            {
                var id = Id(world, row.Bridge);
                if (world.IsLive(id)) RequireBridge(world, row, world.Get<BomberIceBridgeState>(id), row.AppliedTick == 0);
                else if (row.Phase != Retiring) throw Invalid("Bridge owner lost its published row.");
            }
            var sourceId = Id(world, row.SourceBomb);
            if (world.IsLive(sourceId))
            {
                if (!world.TypeOf(sourceId).Is<BomberBombEntity>()) throw Invalid("Bridge source changed type.");
                var source = world.Get<BomberBombState>(sourceId);
                if (source.BombKind.Value != (int)BomberBombKind.Freeze || source.Owner.Value.ToHex() != row.SourceParticipant ||
                    source.SourceLife.Value.ToHex() != row.SourceLife || source.SourceLifeGeneration.Value != row.SourceLifeGeneration ||
                    source.ChainId.Value != row.ChainId) throw Invalid("Bridge source changed its exact original tuple.");
            }
            else if (row.Phase is Birth or FrozenPending) throw Invalid("An unsettled freeze lost its source bomb.");
            var lifeId = Id(world, row.SourceLife);
            if (world.IsLive(lifeId) && (!world.TypeOf(lifeId).Is<PlayerEntity>() ||
                world.Get<BomberPlayerState>(lifeId).LifeGeneration.Value != row.SourceLifeGeneration ||
                world.Get<BomberPlayerState>(lifeId).Participant.Value.ToHex() != row.SourceParticipant))
                throw Invalid("Bridge source life changed its full generation or participant.");
            var participantId = Id(world, row.SourceParticipant);
            if (!world.IsLive(participantId) || !world.TypeOf(participantId).Is<BomberParticipantEntity>() ||
                world.Get<BomberParticipantState>(participantId).MatchId.Value != row.Match)
                throw Invalid("Bridge source participant left its match.");
            if (row.MutationSubmitted && (runtime.PendingVoxelTransactionIds.Count != 1 ||
                runtime.PendingVoxelTransactionIds[0] != row.TransactionId || runtime.PendingVoxelSubmittedTicks[0] != row.SubmittedTick))
                throw Invalid("Bridge debt lost its single Native header.");
        }
        var publicationTokens = new HashSet<string>(StringComparer.Ordinal);
        foreach (var bridge in world.Each<BomberIceBridgeState>())
        {
            if (!world.IsLive(bridge.Entity)) continue;
            var owner = rows.SingleOrDefault(row => row.FreezeToken == bridge.FreezeToken.Value);
            if (owner is null || !publicationTokens.Add(bridge.FreezeToken.Value) ||
                (owner.Bridge != "" && owner.Bridge != bridge.Entity.ToHex()))
                throw Invalid("Published bridge has no unique exact durable owner.");
            RequireBridge(world, owner, bridge, owner.AppliedTick == 0);
        }
        if (runtime.PendingKinds.Count != 0 && runtime.PendingKinds[0] is (int)BomberVoxelIntentKind.FreezeBridge or (int)BomberVoxelIntentKind.MeltBridge)
            if (rows.Count(row => row.MutationSubmitted) != runtime.PendingKinds.Count ||
                Enumerable.Range(0, runtime.PendingKinds.Count).Any(i => runtime.PendingKinds[i] != runtime.PendingKinds[0]))
                throw Invalid("Bridge Native cohort mixed or omitted owner rows.");
    }

    private static BomberBombState[] Occupants(World world, Promise row) => world.Each<BomberBombState>().Where(bomb =>
        world.IsLive(bomb.Entity) && bomb.Phase.Value == (int)BomberBombPhase.Fuse &&
        BomberMatchRules.CellX(world.Get<LogicTransform>(bomb.Entity).LocalPosition) == row.X &&
        BomberMatchRules.CellZ(world.Get<LogicTransform>(bomb.Entity).LocalPosition) == row.Z).OrderBy(bomb => bomb.Entity).ToArray();

    // The only callers have just validated the complete actual Native cohort:
    // Begin -> ValidateNativeOwners, or Terrain Original -> ValidateAppliedBatch.
    private static void CompleteWaterRetirementAfterNativeValidation(World world, Promise row, NativeHfsmDefinition definition)
    {
        if (row.Phase != Retiring || row.AppliedTick == 0 || row.RetirementSubmitted)
            throw Invalid("Water retirement has no fresh accepted owner.");
        var occupants = Occupants(world, row);
        foreach (var bomb in occupants) BomberBombLifecycle.Ensure(world, bomb, definition);
        foreach (var bomb in occupants)
            BomberBombLifecycle.Send(world, bomb, definition, BomberHfsmDefinitions.EventId.Extinguish);
        var rows = Read(world);
        int index = rows.FindIndex(candidate => candidate.FreezeToken == row.FreezeToken);
        if (index < 0 || rows[index] != row) throw Invalid("Water retirement changed its exact owner.");
        rows[index] = row with { RetirementSubmitted = true };
        Save(world, rows); // Unknown destroy retains this witness and is never reissued.
        world.Commands.Destroy(Id(world, row.Bridge));
    }
    private static void RequireBridge(World world, Promise row, BomberIceBridgeState bridge, bool unpublished)
    {
        if (!world.TypeOf(bridge.Entity).Is<BomberIceBridgeEntity>() || bridge.ResourceGeneration.Value != row.Generation ||
            bridge.MatchId.Value != row.Match || bridge.FreezeToken.Value != row.FreezeToken ||
            bridge.AppliedTick.Value != (unpublished ? 0 : row.AppliedTick) || bridge.ExpiresAtTick.Value != (unpublished ? 0 : row.ExpiresAtTick))
            throw Invalid("Bridge publication changed its exact generation, token or clock.");
    }
    internal static void ValidateObservationOwners(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        runtime.ValidatePending(BomberConfigBinding.For(world), world.Single<BomberMatchState>().MatchId.Value);
        Validate(world);
        if (Read(world).Count == 0) throw Invalid("Bridge observation requires a complete persistent owner.");
        if (runtime.PendingKinds.Count == 0 ||
            (runtime.PendingKinds[0] != (int)BomberVoxelIntentKind.FreezeBridge && runtime.PendingKinds[0] != (int)BomberVoxelIntentKind.MeltBridge)) return;
        if (runtime.TerrainPendingDetails.Count != runtime.PendingSections.Count)
            throw Invalid("Bridge observation lost its complete pending details.");
        for (int i = 0; i < runtime.PendingSections.Count; i++)
            ValidatePending(world, i, BomberTerrainTransactions.Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]));
    }

    private static void ValidateNativeOwners(World world)
    {
        var rows = Read(world);
        if (rows.Count == 0) return;
        var adapter = VoxelGameplayBinding.Resolve(world.Manager) ?? throw Invalid("Active bridge recovery requires its actual Native owner.");
        var map = BomberConfigBinding.For(world).Map;
        var addresses = rows.Select(row => BomberTerrainTransactions.Address(map, row.X, map.GroundLayer, row.Z)).ToArray();
        var photo = BomberTerrainRead.ForBridgeOwnerObservation(world) ??
            throw Invalid("Bridge recovery has no complete ready Native photo.");
        for (int i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            var actual = photo[row.Z * map.Width + row.X];
            bool water = actual.BlockId == Block(BomberConfigBinding.For(world), "water") &&
                adapter.BindingGet(addresses[i].Section, addresses[i].Offset) is null;
            bool ice = row.Bridge != "" && actual.BlockId == Block(BomberConfigBinding.For(world), "ice") &&
                adapter.BindingGet(addresses[i].Section, addresses[i].Offset) == row.Bridge;
            bool matches = row.Phase switch
            {
                Birth or Retiring => water,
                Active => ice,
                FrozenPending or WaterPending => water || ice,
                _ => false,
            };
            bool mustAdvance = (row.Phase == Retiring && row.AppliedTick != 0) ||
                (row.Phase == FrozenPending && ice) || (row.Phase == WaterPending && water);
            if (!actual.HasBlockId || actual.Presence is not (VoxelPresence.Ready or VoxelPresence.Unchanged) ||
                !matches || (mustAdvance ? actual.SectionRevision <= row.ExpectedRevision : actual.SectionRevision < row.ExpectedRevision))
                throw Invalid("Bridge recovery changed its exact Native generation or phase cut.");
        }
    }
    private static bool Inside(MapRow map, int x, int z) => x >= map.BoundaryCells && z >= map.BoundaryCells &&
        x < map.Width - map.BoundaryCells && z < map.Depth - map.BoundaryCells;
    private static uint Block(IBomberConfig config, string name) => config.Tables.Blocks.Rows.Single(row => row.Name == name).BlockType << 8;
    private static NetEntityId Id(World world, string value)
    {
        if (!NetEntityId.TryParse(value, out var id) || id.IsDefault || id.Counter == 0 || id.InstanceId != world.InstanceId || id.ToHex() != value)
            throw Invalid("Bridge source is not a canonical complete local identity.");
        return id;
    }
    private static bool CanonicalTransaction(World world, string transaction, ulong match)
    {
        string prefix = FormattableString.Invariant($"bomber-terrain:{world.InstanceId:x16}:{match:x16}:");
        return transaction.Length == 65 && transaction.StartsWith(prefix, StringComparison.Ordinal) &&
            ulong.TryParse(transaction.AsSpan(prefix.Length), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out ulong sequence) &&
            sequence != 0 && sequence <= world.Single<BomberWorldRuntime>().NextVoxelTransactionSequence.Value &&
            transaction == FormattableString.Invariant($"{prefix}{sequence:x16}");
    }
    private static void AddMelt(Frame frame, (int X, int Z) at, string cause)
    {
        if (!frame.Melt.TryGetValue(at, out var previous) || StringComparer.Ordinal.Compare(cause, previous) < 0)
            frame.Melt[at] = cause;
    }
    private static string FireCause(World world, BomberBombState bomb)
    {
        _ = Id(world, bomb.Entity.ToHex()); _ = Id(world, bomb.SourceLife.Value.ToHex()); _ = Id(world, bomb.Owner.Value.ToHex());
        if (bomb.SourceLifeGeneration.Value == 0 || bomb.ChainId.Value == 0) throw Invalid("Fire melt source lost its full tuple.");
        return FormattableString.Invariant($"fire:{bomb.Entity.ToHex()}:{bomb.SourceLife.Value.ToHex()}:{bomb.SourceLifeGeneration.Value:x16}:{bomb.Owner.Value.ToHex()}:{bomb.ChainId.Value:x16}:{world.Single<BomberMatchState>().MatchId.Value:x16}:{world.Tick:x16}");
    }
    private static void ValidateMeltCause(World world, Promise row)
    {
        if (Encoding.UTF8.GetByteCount(row.MeltCause) > 173) throw Invalid("Bridge melt cause exceeds its canonical byte bound.");
        var parts = row.MeltCause.Split(':');
        if (parts.Length == 2 && parts[0] == "expiry")
        {
            if (row.ExpiresAtTick == 0 || row.ExpiresAtTick > world.Tick ||
                row.MeltCause != FormattableString.Invariant($"expiry:{row.ExpiresAtTick:x16}"))
                throw Invalid("Bridge expiry cause changed its immutable deadline.");
            return;
        }
        if (parts.Length == 2 && parts[0] == "round")
        {
            var match = world.Single<BomberMatchState>();
            ulong tick = Hex(parts[1]);
            if (match.Phase.Value != (int)BomberMatchPhase.Results || tick < match.PhaseEndTick.Value || tick > world.Tick)
                throw Invalid("Bridge round cleanup is outside actual completed results.");
            return;
        }
        if (parts.Length == 8 && parts[0] == "region")
        {
            var regionId = Id(world, parts[1]); var regionLifeId = Id(world, parts[2]); var regionParticipantId = Id(world, parts[4]);
            ulong regionGeneration = Hex(parts[3]), regionChain = Hex(parts[5]), match = Hex(parts[6]), regionOccurred = Hex(parts[7]);
            if (!world.IsLive(regionId) || !world.TypeOf(regionId).Is<BomberFireZoneEntity>())
                throw Invalid("Bridge region source was retired while its melt debt remained.");
            var region = world.Get<BomberFireZoneState>(regionId);
            var position = world.Get<LogicTransform>(regionId).LocalPosition;
            if (!region.RegionCoverage.Value || region.SourceLife.Value != regionLifeId || region.Owner.Value != regionParticipantId ||
                region.SourceLifeGeneration.Value != regionGeneration || region.SourceChainId.Value != regionChain || region.SourceMatchId.Value != match ||
                match != row.Match || regionOccurred < region.FromTick.Value || regionOccurred >= region.UntilTick.Value || regionOccurred > world.Tick ||
                !BomberFireRegionCoverage.Contains(BomberMatchRules.CellX(position), BomberMatchRules.CellZ(position), region.CoverageMask.Value, row.X, row.Z))
                throw Invalid("Bridge region cause changed its original source, regionGeneration, admitted mask or interval.");
            return;
        }
        if (parts.Length != 8 || parts[0] != "fire") throw Invalid("Bridge melt cause is neither expiry, round nor actual Fire.");
        var bombId = Id(world, parts[1]); var lifeId = Id(world, parts[2]); var participantId = Id(world, parts[4]);
        ulong generation = Hex(parts[3]), chain = Hex(parts[5]), matchId = Hex(parts[6]), occurred = Hex(parts[7]);
        if (generation == 0 || chain == 0 || matchId != row.Match ||
            occurred < row.CreationTick || occurred > world.Tick || !world.IsLive(participantId) ||
            !world.TypeOf(participantId).Is<BomberParticipantEntity>() || world.Get<BomberParticipantState>(participantId).MatchId.Value != row.Match)
            throw Invalid("Fire melt cause lost its stable participant, match or original clock.");
        if (world.IsLive(bombId))
        {
            if (!world.TypeOf(bombId).Is<BomberBombEntity>()) throw Invalid("Fire melt source changed type.");
            var bomb = world.Get<BomberBombState>(bombId);
            if (bomb.BombKind.Value != (int)BomberBombKind.ReservedFire || bomb.Owner.Value != participantId ||
                bomb.SourceLife.Value != lifeId || bomb.SourceLifeGeneration.Value != generation || bomb.ChainId.Value != chain)
                throw Invalid("Fire melt source changed its full provenance.");
        }
        if (world.IsLive(lifeId) && (!world.TypeOf(lifeId).Is<PlayerEntity>() ||
            world.Get<BomberPlayerState>(lifeId).Participant.Value != participantId || world.Get<BomberPlayerState>(lifeId).LifeGeneration.Value != generation))
            throw Invalid("Fire melt life changed its original generation.");
    }
    private static ulong Hex(string value)
    {
        if (value.Length != 16 || !ulong.TryParse(value, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out ulong result) ||
            value != FormattableString.Invariant($"{result:x16}")) throw Invalid("Bridge cause has a noncanonical number.");
        return result;
    }
    private static string Encode(List<Promise> rows)
    {
        if (rows.Count > MaxRows) throw Invalid("Bridge row budget exceeded.");
        if (rows.Count == 0) return "";
        string encoded = JsonSerializer.Serialize(rows, Codec);
        if (Encoding.UTF8.GetByteCount(encoded) > MaxBytes) throw Invalid("Bridge byte budget exceeded.");
        return encoded;
    }
    private static List<Promise> Read(World world)
    {
        string encoded = world.Single<BomberWorldRuntime>().IceBridgePromises.Value;
        if (encoded == "") return new();
        if (Encoding.UTF8.GetByteCount(encoded) > MaxBytes) throw Invalid("Bridge byte budget exceeded.");
        try
        {
            using var document = JsonDocument.Parse(encoded);
            if (document.RootElement.ValueKind != JsonValueKind.Array || document.RootElement.GetArrayLength() is < 1 or > MaxRows)
                throw Invalid("Bridge row budget exceeded.");
            foreach (var row in document.RootElement.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Object) throw Invalid("Bridge row shape is invalid.");
                var names = new HashSet<string>(StringComparer.Ordinal);
                foreach (var property in row.EnumerateObject()) if (!names.Add(property.Name)) throw Invalid("Bridge row duplicated a field.");
                if (names.Count != 23) throw Invalid("Bridge row is incomplete.");
            }
            return JsonSerializer.Deserialize<List<Promise>>(encoded, Codec) ?? throw Invalid("Bridge memory is null.");
        }
        catch (JsonException error) { throw new InvalidOperationException("Invalid bridge memory.", error); }
    }
    private static void Save(World world, List<Promise> rows) => world.Single<BomberWorldRuntime>().IceBridgePromises.Value = Encode(rows);
    private static InvalidOperationException Invalid(string message) => new(message);
}
