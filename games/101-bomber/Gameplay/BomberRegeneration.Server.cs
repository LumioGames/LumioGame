using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation.Determinism;

namespace Lumio.Bomber.Gameplay;

/// <summary>One bounded ordinary wave; Native owns terrain and its Original activation.</summary>
internal static class BomberRegeneration
{
    internal const int ByteLimit = 16384;
    private const int OrbitLimit = 4;
    private sealed record Cell(int X, int Z, ulong Revision, ulong Generation);
    private sealed record Promise(ulong Match, ulong Wave, uint Block, Cell[] Cells,
        string Transaction = "", ulong Submitted = 0);
    private static readonly HashSet<string> RowFields = new(StringComparer.Ordinal)
        { "Match", "Wave", "Block", "Cells", "Transaction", "Submitted" };
    private static readonly HashSet<string> CellFields = new(StringComparer.Ordinal)
        { "X", "Z", "Revision", "Generation" };

    internal static bool HasPending(World world) => Read(world).Count != 0;

    internal static void ResetForNextMatch(World world)
    {
        if (HasPending(world)) throw Invalid("A new match cannot discard regeneration debt.");
        var runtime = world.Single<BomberWorldRuntime>();
        runtime.RegenerationMatchId.Value = runtime.RegenerationNextTick.Value = 0;
        // Resource generations never alias an earlier round's issued generation.
    }

    internal static void Advance(World world)
    {
        Validate(world);
        var runtime = world.Single<BomberWorldRuntime>();
        var match = world.Single<BomberMatchState>();
        var config = BomberConfigBinding.For(world);
        var rows = Read(world);
        if (rows.Count != 0)
        {
            // A submitted/unknown wave is not a timer. Only the terrain owner can
            // release its exact debt after a definitive rejection or Original.
            if (rows[0].Transaction != "") return;
            if (!Eligible(world) || !FitsTarget(world, checked(rows.Count * 4)) || !Safe(world, rows.SelectMany(row => row.Cells).ToArray()))
            { Save(world, new()); return; }
            Queue(world, rows);
            return;
        }
        if (match.Phase.Value != (int)BomberMatchPhase.Running) return;
        ulong first = checked(match.StartTick.Value + Ticks.FromMilliseconds(config.Regeneration.FirstTriggerMs, config.Game.TickRateHz));
        ulong interval = Ticks.FromMilliseconds(config.Regeneration.IntervalMs, config.Game.TickRateHz);
        if (runtime.RegenerationMatchId.Value == 0)
        {
            runtime.RegenerationMatchId.Value = match.MatchId.Value;
            runtime.RegenerationNextTick.Value = first;
            ulong observed = world.Each<BomberChestState>().Where(chest => world.IsLive(chest.Entity))
                .Select(chest => chest.ResourceGeneration.Value)
                .Concat(world.Each<BomberBarrelState>().Where(barrel => world.IsLive(barrel.Entity))
                    .Select(barrel => barrel.ResourceGeneration.Value)).DefaultIfEmpty(1UL).Max();
            runtime.NextResourceGeneration.Value = Math.Max(Math.Max(1UL, observed), runtime.NextResourceGeneration.Value);
        }
        ulong next = runtime.RegenerationNextTick.Value;
        if (next < world.Tick)
        {
            ulong missed = checked((world.Tick - next) / interval + ((world.Tick - next) % interval == 0 ? 0UL : 1UL));
            next = checked(next + missed * interval);
            runtime.RegenerationNextTick.Value = next;
        }
        if (next != world.Tick) return;
        // Consume the absolute opportunity before capacity or Native availability.
        runtime.RegenerationNextTick.Value = checked(next + interval);
        if (!Eligible(world)) return;
        var circle = world.Single<BomberFinalCircleState>();
        int target = checked((int)(checked((long)circle.InitialResourceCount.Value * config.Regeneration.TargetInitialPermille) / 1000));
        int slots = Math.Min(config.Regeneration.MaxMirrorOrbits, Math.Max(0, (target - circle.RemainingResourceCount.Value) / 4));
        slots = Math.Min(slots, NativeSlots(world));
        if (slots == 0) return;
        var read = BomberTerrainRead.For(world)!;
        int futureOutputs = FutureOutputCreditUsage(world, read);
        int center = config.Map.Width / 2, area = checked(config.Map.Width * config.Map.Depth);
        var candidates = new List<Cell[]>();
        for (int z = 0; z < center; z++)
        for (int x = 0; x < center; x++)
        {
            var cells = Orbit(config.Map, x, z).Select(at => new Cell(at.X, at.Z,
                read[area + at.Z * config.Map.Width + at.X].SectionRevision, 0)).ToArray();
            if (Safe(world, cells)) candidates.Add(cells);
        }
        var rng = new DeterminismContext(match.Seed.Value, next, RuntimeSchema.SchemaEpoch)
            .OpenRngStream(FormattableString.Invariant($"bomber.regeneration.{config.Map.Width}"));
        uint soft = config.Tables.Blocks.Rows.Single(row => row.Name == "softBrick").BlockType << 8;
        for (int selected = 0; selected < slots && candidates.Count != 0; selected++)
        {
            int index = checked((int)(rng.NextUInt32() % (uint)candidates.Count));
            var cells = candidates[index];
            candidates.RemoveAt(index);
            // Barrel issuance is outside the admitted Legacy producer envelope.
            // ADR0048 permits its failed full-quartet credit to fall back to the
            // ordinary chest/soft roll. It does not permit chest -> soft fallback.
            _ = rng.NextUInt32() % config.Regeneration.BarrelRollDenominator;
            if (rng.NextUInt32() % config.Regeneration.ChestRollDenominator == 0) continue;
            // The existing effective lifetime bound provisions one output/cell.
            // Larger ring outputs need the separate product budget/declaration gate.
            if (cells.Any(cell => BomberResourceRewardRules.Maximum(config,
                BomberResourceRewardRules.Soft(config, config.Map.Width, cell.X, cell.Z)) > 1)) continue;
            if (checked(futureOutputs + 4) > config.ObjectBudgets.PickupCapacity) continue;
            futureOutputs = checked(futureOutputs + 4);
            for (int i = 0; i < cells.Length; i++)
            {
                ulong generation = checked(runtime.NextResourceGeneration.Value + 1);
                runtime.NextResourceGeneration.Value = generation;
                cells[i] = cells[i] with { Generation = generation };
            }
            rows.Add(new(match.MatchId.Value, next, soft, cells));
        }
        if (rows.Count == 0) return;
        // All selected quartet credits and input revisions are durable before any
        // staging call. This scope creates no unbound ECS resource identities.
        Save(world, rows);
        Queue(world, rows);
    }

    private static bool Eligible(World world)
    {
        var config = BomberConfigBinding.For(world);
        var runtime = world.Single<BomberWorldRuntime>();
        var circle = world.Single<BomberFinalCircleState>();
        return world.Single<BomberMatchState>().Phase.Value == (int)BomberMatchPhase.Running &&
            circle.ResourceCountInitialized.Value && circle.InitialResourceCount.Value > 0 && world.Tick < circle.RegenStopTick.Value &&
            (runtime.InitialResourcePhase.Value == 3 || (runtime.InitialResourcePhase.Value == 0 &&
                runtime.InitialResourcePlan.Value == "" && config.Map.LayoutKind == "LegacyPillars")) &&
            BomberTerrainTransactions.FrameAvailable(world) && BomberTerrainRead.For(world) is not null;
    }

    private static bool FitsTarget(World world, int additions)
    {
        var config = BomberConfigBinding.For(world);
        var circle = world.Single<BomberFinalCircleState>();
        int target = checked((int)(checked((long)circle.InitialResourceCount.Value * config.Regeneration.TargetInitialPermille) / 1000));
        return checked(circle.RemainingResourceCount.Value + additions) <= target;
    }

    private static int NativeSlots(World world)
    {
        // The adapter still makes the authoritative shared-buffer admission. This
        // bounds the complete cohort's own entries/bytes before durable selection.
        var budget = world.Manager.IngressBudget;
        string? connection = world.Manager.CurrentOperation?.Connection;
        long metadata = checked(96L + 65L + (connection is null ? 0 : Encoding.UTF8.GetByteCount(connection)));
        long byteSlots = Math.Max(0, budget.MaxBytes - metadata) / 96;
        return checked((int)Math.Min((long)budget.Capacity / 4, byteSlots));
    }

    private static int FutureOutputCreditUsage(World world, VoxelCellQuery[] read)
    {
        var config = BomberConfigBinding.For(world);
        var adapter = VoxelGameplayBinding.Resolve(world.Manager)!;
        int area = checked(config.Map.Width * config.Map.Depth);
        int credits = BomberTerrainTransactions.PickupCreditUsage(world);
        for (int z = 0; z < config.Map.Depth; z++)
        for (int x = 0; x < config.Map.Width; x++)
        {
            var block = config.Tables.Blocks.Rows.SingleOrDefault(row => row.BlockType == read[area + z * config.Map.Width + x].BlockId >> 8);
            if (block.Name == "softBrick")
                credits = checked(credits + BomberResourceRewardRules.Maximum(config, BomberResourceRewardRules.Soft(config, config.Map.Width, x, z)));
            else if (block.Name == "chest")
            {
                var address = BomberTerrainTransactions.Address(config.Map, x, config.Map.ObstacleLayer, z);
                string? binding = adapter.BindingGet(address.Section, address.Offset);
                if (binding is null || !NetEntityId.TryParse(binding, out var entity) || !world.IsLive(entity) ||
                    !world.TypeOf(entity).Is<BomberChestEntity>())
                    throw Invalid("Regeneration credit census found an invalid resource binding.");
                var chest = world.Get<BomberChestState>(entity);
                chest.ValidateStorage();
                var tier = chest.ResourceTier.Value == 0 ? config.Chest : config.Tables.Chest.Rows.Single(row => row.Id == chest.ResourceTier.Value);
                credits = checked(credits + BomberResourceRewardRules.Maximum(config, tier));
            }
        }
        return credits;
    }

    private static (int X, int Z)[] Orbit(MapRow map, int x, int z) =>
        new[] { (x, z), (map.Width - 1 - x, z), (x, map.Depth - 1 - z), (map.Width - 1 - x, map.Depth - 1 - z) };

    private static bool Safe(World world, Cell[] cells)
    {
        var config = BomberConfigBinding.For(world);
        var read = BomberTerrainRead.For(world);
        var adapter = VoxelGameplayBinding.Resolve(world.Manager);
        if (read is null || adapter is null) return false;
        var threats = world.Each<BomberPlayerState>().Where(player => world.IsLive(player.Entity) &&
                player.LifePhase.Value is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable)
            .Select(player => world.Get<LogicTransform>(player.Entity).LocalPosition)
            .Concat(world.Each<BomberBombState>().Where(bomb => world.IsLive(bomb.Entity))
                .Select(bomb => world.Get<LogicTransform>(bomb.Entity).LocalPosition))
            .Select(at => (X: BomberMatchRules.CellX(at), Z: BomberMatchRules.CellZ(at))).ToArray();
        var occupied = BomberTerrainTransactions.PickupCells(world);
        var runtime = world.Single<BomberWorldRuntime>();
        if (runtime.BombPlacementTick.Value == world.Tick)
            for (int i = 0; i < runtime.BombPlacementCells.Count; i++)
                occupied.Add((runtime.BombPlacementCells[i] % config.Map.Width, runtime.BombPlacementCells[i] / config.Map.Width));
        int area = checked(config.Map.Width * config.Map.Depth);
        foreach (var cell in cells)
        {
            int index = cell.Z * config.Map.Width + cell.X;
            var ground = config.Tables.Blocks.Rows.SingleOrDefault(row => row.BlockType == read[index].BlockId >> 8);
            if (M2InitialLayout.IsSafetyCell(config.Map.Width, cell.X, cell.Z) || !ground.Enabled || !ground.Walkable ||
                ground.Name is "air" or "water" || read[area + index].BlockId != 0 || occupied.Contains((cell.X, cell.Z)) ||
                threats.Any(at => Math.Abs(at.X - cell.X) + Math.Abs(at.Z - cell.Z) < config.Regeneration.ThreatDistanceCells)) return false;
            var floor = BomberTerrainTransactions.Address(config.Map, cell.X, config.Map.GroundLayer, cell.Z);
            var obstacle = BomberTerrainTransactions.Address(config.Map, cell.X, config.Map.ObstacleLayer, cell.Z);
            if (adapter.BindingGet(floor.Section, floor.Offset) is not null || adapter.BindingGet(obstacle.Section, obstacle.Offset) is not null) return false;
        }
        return true;
    }

    private static void Queue(World world, List<Promise> rows)
    {
        if (!BomberTerrainTransactions.FrameAvailable(world)) return;
        var config = BomberConfigBinding.For(world);
        var read = BomberTerrainRead.For(world)!;
        int area = checked(config.Map.Width * config.Map.Depth);
        // An admitted but not submitted wave may survive a tick cut. Read current
        // revisions before its first submission; submitted revisions never change.
        rows = rows.Select(row => row with { Cells = row.Cells.Select(cell => cell with
            { Revision = read[area + cell.Z * config.Map.Width + cell.X].SectionRevision }).ToArray() }).ToList();
        Save(world, rows);
        var writes = new List<BomberPendingVoxelCell>();
        var details = new List<BomberTerrainDetail>();
        foreach (var row in rows)
        foreach (var cell in row.Cells)
        {
            var address = BomberTerrainTransactions.Address(config.Map, cell.X, config.Map.ObstacleLayer, cell.Z);
            writes.Add(new(new(address.Section, address.Offset, row.Block, cell.Revision), 0,
                BomberVoxelIntentKind.Regenerate, default, default, 0, default, default, 0));
            details.Add(new(cell.X, cell.Z, 0, 0, "", row.Wave, 0, Array.Empty<BomberTerrainReward>(), CellGeneration: cell.Generation));
        }
        BomberTerrainTransactions.Regenerate(world, writes, details);
    }

    internal static void Stage(World world, string transaction)
    {
        var rows = Read(world);
        if (rows.Count == 0 || rows.Any(row => row.Transaction != "")) throw Invalid("Regeneration wave was already submitted.");
        Save(world, rows.Select(row => row with { Transaction = transaction, Submitted = world.Tick }).ToList());
    }

    internal static void Reject(World world, string transaction)
    {
        var rows = Read(world);
        if (rows.Count == 0 || rows.Any(row => row.Transaction != transaction)) throw Invalid("Rejected regeneration lost its exact debt.");
        Save(world, new());
    }

    internal static void Accept(World world, string transaction, VoxelMutationOutcome outcome)
    {
        if (outcome.Status != 0 || outcome.State != VoxelTxnState.Applied ||
            outcome.Disposition != VoxelCommitDisposition.Original || !outcome.TokenConsumed)
            throw Invalid("Regeneration activation requires the real Original.");
        var rows = Read(world);
        if (rows.Count == 0 || rows.Any(row => row.Transaction != transaction)) throw Invalid("Regeneration Original lost its exact wave.");
        Save(world, new());
    }

    internal static void ValidatePending(World world, int index, BomberTerrainDetail detail, bool applied = false,
        VoxelCellQuery[]? photo = null)
    {
        var rows = Read(world);
        var flat = rows.SelectMany(row => row.Cells.Select(cell => (Row: row, Cell: cell))).ToArray();
        var runtime = world.Single<BomberWorldRuntime>();
        if (runtime.PendingVoxelTransactionIds.Count != 1 || index < 0 || index >= flat.Length || flat.Length != runtime.PendingSections.Count)
            throw Invalid("Regeneration pending cohort does not match its durable wave.");
        var (row, cell) = flat[index];
        var config = BomberConfigBinding.For(world);
        var address = BomberTerrainTransactions.Address(config.Map, cell.X, config.Map.ObstacleLayer, cell.Z);
        if (row.Transaction == "" || row.Transaction != runtime.PendingVoxelTransactionIds[0] || row.Submitted != runtime.PendingVoxelSubmittedTicks[0] ||
            row.Match != runtime.PendingVoxelMatchIds[0] || runtime.PendingKinds[index] != (int)BomberVoxelIntentKind.Regenerate ||
            runtime.PendingSections[index] != address.Section || runtime.PendingCellOffsets[index] != address.Offset ||
            runtime.PendingExpectedRevisions[index] != cell.Revision || runtime.PendingOldBlocks[index] != 0 || runtime.PendingNewBlocks[index] != row.Block ||
            !runtime.PendingParticipants[index].IsDefault || !runtime.PendingSourceLives[index].IsDefault || runtime.PendingSourceLifeGenerations[index] != 0 ||
            !runtime.PendingSourceBombs[index].IsDefault || !runtime.PendingChests[index].IsDefault || runtime.PendingChainIds[index] != 0 ||
            detail.X != cell.X || detail.Z != cell.Z || detail.Direction != 0 || detail.Remaining != 0 || detail.Family != "" ||
            detail.Occurred != row.Wave || detail.CellGeneration != cell.Generation || detail.Tier != 0 || detail.CircleStage != 0 ||
            detail.Reserved != 0 || detail.Rewards is null || detail.Rewards.Length != 0)
            throw Invalid("Regeneration pending intent changed its complete ownerless tuple.");
        if (!applied) return;
        var adapter = VoxelGameplayBinding.Resolve(world.Manager) ?? throw Invalid("Regeneration Native adapter disappeared.");
        int area = checked(config.Map.Width * config.Map.Depth);
        if (photo is null || photo.Length != checked(area * 2)) throw Invalid("Regeneration Original lost its complete Native photo.");
        var actual = photo[checked(area + cell.Z * config.Map.Width + cell.X)];
        if (!actual.HasBlockId || actual.Presence is not (VoxelPresence.Ready or VoxelPresence.Unchanged) ||
            actual.BlockId != row.Block || actual.SectionRevision <= cell.Revision || adapter.BindingGet(address.Section, address.Offset) is not null)
            throw Invalid("Regeneration Original does not activate the exact unbound Native cell.");
    }

    internal static void Validate(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        var match = world.Single<BomberMatchState>();
        var config = BomberConfigBinding.For(world);
        var rows = Read(world);
        ulong interval = Ticks.FromMilliseconds(config.Regeneration.IntervalMs, config.Game.TickRateHz);
        ulong first = checked(match.StartTick.Value + Ticks.FromMilliseconds(config.Regeneration.FirstTriggerMs, config.Game.TickRateHz));
        if (interval == 0 || config.Regeneration.BarrelRollDenominator == 0 ||
            config.Regeneration.ChestRollDenominator == 0 || config.Regeneration.TargetInitialPermille is < 0 or > 1000 ||
            config.Regeneration.ThreatDistanceCells < 3 || config.Regeneration.MaxMirrorOrbits is < 0 or > 2 ||
            config.Map.Width != 19 || config.Map.Depth != 19)
            throw Invalid("Regeneration configuration exceeds the admitted Legacy19 envelope.");
        if (runtime.RegenerationMatchId.Value == 0)
        {
            if (runtime.RegenerationNextTick.Value != 0 || rows.Count != 0) throw Invalid("Uninitialized regeneration has scheduler or debt.");
        }
        else if (runtime.RegenerationMatchId.Value != match.MatchId.Value || runtime.RegenerationNextTick.Value < first ||
            (runtime.RegenerationNextTick.Value - first) % interval != 0 || runtime.NextResourceGeneration.Value < 1)
            throw Invalid("Regeneration scheduler belongs to another match or logical opportunity.");
        if (rows.Count == 0)
        {
            if (runtime.PendingKinds.Count != 0 && runtime.PendingKinds[0] == (int)BomberVoxelIntentKind.Regenerate)
                throw Invalid("Native regeneration debt has no complete wave.");
            return;
        }
        if (rows.Count > config.Regeneration.MaxMirrorOrbits) throw Invalid("Regeneration wave exceeds its shared group cap.");
        if (rows[0].Transaction != "" && (runtime.PendingKinds.Count != checked(rows.Count * 4) ||
            Enumerable.Range(0, runtime.PendingKinds.Count).Any(index => runtime.PendingKinds[index] != (int)BomberVoxelIntentKind.Regenerate)))
            throw Invalid("Regeneration submission is not one complete ownerless batch.");
        uint soft = config.Tables.Blocks.Rows.Single(row => row.Name == "softBrick" && row.Enabled).BlockType << 8;
        var circle = world.Single<BomberFinalCircleState>();
        if (!circle.ResourceCountInitialized.Value || circle.InitialResourceCount.Value <= 0 || rows[0].Wave >= circle.RegenStopTick.Value)
            throw Invalid("Regeneration debt was not admitted before the real resource stop.");
        var keys = new HashSet<(int, int)>();
        ulong generation = 0;
        foreach (var row in rows)
        {
            if (row.Match != match.MatchId.Value || row.Wave < first || row.Wave > world.Tick || row.Wave >= runtime.RegenerationNextTick.Value ||
                (row.Wave - first) % interval != 0 || row.Wave != rows[0].Wave || row.Block != soft ||
                row.Transaction is null || row.Transaction != rows[0].Transaction || row.Submitted != rows[0].Submitted || row.Cells is null || row.Cells.Length != 4 ||
                row.Cells.Any(cell => cell is null)) throw Invalid("Regeneration wave identity, product or logical slot is invalid.");
            var canonical = Orbit(config.Map, row.Cells[0].X, row.Cells[0].Z);
            if (row.Cells[0].X < 0 || row.Cells[0].Z < 0 || row.Cells[0].X >= config.Map.Width / 2 || row.Cells[0].Z >= config.Map.Depth / 2)
                throw Invalid("Regeneration orbit has no canonical representative.");
            for (int i = 0; i < row.Cells.Length; i++)
            {
                var cell = row.Cells[i];
                if ((cell.X, cell.Z) != canonical[i] || !keys.Add((cell.X, cell.Z)) ||
                    M2InitialLayout.IsSafetyCell(config.Map.Width, cell.X, cell.Z) || cell.Revision == 0 || cell.Generation < 2 ||
                    cell.Generation <= generation || (generation != 0 && cell.Generation != checked(generation + 1)) || cell.Generation > runtime.NextResourceGeneration.Value)
                    throw Invalid("Regeneration cell/revision/generation is not a unique full quartet.");
                generation = cell.Generation;
            }
            if (row.Transaction == "")
            { if (row.Submitted != 0) throw Invalid("Unsubmitted regeneration has a submission tick."); }
            else
            {
                string prefix = FormattableString.Invariant($"bomber-terrain:{world.InstanceId:x16}:{row.Match:x16}:");
                if (row.Transaction.Length != prefix.Length + 16 || !row.Transaction.StartsWith(prefix, StringComparison.Ordinal) ||
                    !ulong.TryParse(row.Transaction.AsSpan(prefix.Length), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out ulong sequence) ||
                    sequence == 0 || sequence > runtime.NextVoxelTransactionSequence.Value ||
                    row.Transaction != prefix + sequence.ToString("x16", CultureInfo.InvariantCulture) || row.Submitted < row.Wave || row.Submitted > world.Tick ||
                    row.Submitted >= circle.RegenStopTick.Value ||
                    runtime.PendingVoxelTransactionIds.Count != 1 || runtime.PendingVoxelTransactionIds[0] != row.Transaction)
                    throw Invalid("Regeneration submission lost its exact Native transaction.");
            }
        }
        if (generation != runtime.NextResourceGeneration.Value) throw Invalid("Regeneration wave lost its allocation fence.");
        if (rows[0].Transaction == "" && runtime.PendingVoxelTransactionIds.Count != 0)
            throw Invalid("Unsubmitted regeneration conflicts with another Native obligation.");
    }

    private static List<Promise> Read(World world)
    {
        string value = world.Single<BomberWorldRuntime>().RegenerationPromises.Value;
        if (value == "") return new();
        if (Encoding.UTF8.GetByteCount(value) > ByteLimit) throw Invalid("Regeneration rule memory exceeds its byte budget.");
        try
        {
            using var document = JsonDocument.Parse(value);
            if (document.RootElement.ValueKind != JsonValueKind.Array || document.RootElement.GetArrayLength() is < 1 or > OrbitLimit)
                throw Invalid("Regeneration rule memory exceeds its row bound.");
            foreach (var row in document.RootElement.EnumerateArray())
            {
                RequireFields(row, RowFields);
                var cells = row.GetProperty("Cells");
                if (cells.ValueKind != JsonValueKind.Array || cells.GetArrayLength() != 4) throw Invalid("Regeneration rule memory lost a quartet.");
                foreach (var cell in cells.EnumerateArray()) RequireFields(cell, CellFields);
            }
            return JsonSerializer.Deserialize<List<Promise>>(value) ?? throw Invalid("Regeneration rule memory is empty.");
        }
        catch (JsonException error) { throw new InvalidOperationException("Invalid regeneration rule memory.", error); }
    }

    private static void RequireFields(JsonElement element, HashSet<string> expected)
    {
        if (element.ValueKind != JsonValueKind.Object) throw Invalid("Regeneration rule memory requires an object.");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
            if (!expected.Contains(property.Name) || !seen.Add(property.Name)) throw Invalid("Regeneration rule memory has unknown or duplicate fields.");
        if (seen.Count != expected.Count) throw Invalid("Regeneration rule memory has missing fields.");
    }

    private static void Save(World world, List<Promise> rows)
    {
        string value = rows.Count == 0 ? "" : JsonSerializer.Serialize(rows);
        if (rows.Count > OrbitLimit || Encoding.UTF8.GetByteCount(value) > ByteLimit) throw Invalid("Regeneration rule memory exceeds its byte budget.");
        world.Single<BomberWorldRuntime>().RegenerationPromises.Value = value;
    }

    private static InvalidOperationException Invalid(string message) => new(message);
}
