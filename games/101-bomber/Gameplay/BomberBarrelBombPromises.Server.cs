using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

internal static class BomberBarrelBombPromises
{
    internal const int ByteLimit = 16384;
    internal const int CountLimit = 8;
    internal sealed record Promise(string Token, string Transaction, string Barrel, ulong Generation,
        string SourceBomb, string Family, string Participant, string Life, ulong LifeGeneration,
        ulong Match, ulong Chain, int Shape, int X, int Z, ulong Occurred, ulong Submitted,
        bool Applied = false, bool CreationSubmitted = false, ulong CreatedAt = 0, string Produced = "", bool Frenzy = false);

    internal static int ReservedCount(World world) => Read(world).Sum(row =>
        Published(world, row) is null ? Credits(row.Shape) : 0);

    internal static bool HasSubmittedPromise(World world, string token)
    {
        if (token is null || !token.StartsWith("barrel:", StringComparison.Ordinal)) return false;
        var row = Read(world).SingleOrDefault(row => row.Token == token);
        return row is not null && row.Applied && row.CreationSubmitted && Published(world, row) is null;
    }

    internal static string? SubmissionWitness(World world, string token, bool submitted)
    {
        if (token is null || !token.StartsWith("barrel:", StringComparison.Ordinal)) return null;
        var row = Read(world).SingleOrDefault(row => row.Token == token);
        if (row is null || !row.Applied || row.CreationSubmitted != submitted || Published(world, row) is not null ||
            (submitted && row.CreatedAt != world.Tick)) return null;
        return JsonSerializer.Serialize(new { Owner = world.Single<BomberWorldRuntime>().Entity.ToHex(), Tick = world.Tick,
            CurrentMatch = world.Single<BomberMatchState>().MatchId.Value,
            Row = row with { CreationSubmitted = false, CreatedAt = 0 } });
    }

    private static int Credits(int shape) => shape == (int)BomberBombKind.ReservedSplit ? 5 : 1;

    internal static bool CanReserve(World world, BomberBarrelState barrel, BomberBombState source)
    {
        var rows = Read(world);
        return rows.Count < CountLimit && !rows.Any(row => row.Barrel == barrel.Entity.ToHex() && row.Generation == barrel.ResourceGeneration.Value) &&
            BomberBombAdmissions.CanReserve(world, Credits(source.BombKind.Value));
    }

    internal static void Stage(World world, string transaction, BomberPendingVoxelCell cell, BomberTerrainDetail detail)
    {
        var row = PrepareStage(world, transaction, cell, detail);
        var rows = Read(world);
        rows.Add(row);
        Save(world, rows);
    }

    internal static void PreflightStage(World world, string transaction, BomberPendingVoxelCell cell, BomberTerrainDetail detail)
    {
        var row = PrepareStage(world, transaction, cell, detail);
        var rows = Read(world);
        rows.Add(row);
        _ = Encode(world, rows);
    }

    private static Promise PrepareStage(World world, string transaction, BomberPendingVoxelCell cell, BomberTerrainDetail detail)
    {
        var barrel = world.Get<BomberBarrelState>(cell.Chest);
        var bomb = world.Get<BomberBombState>(cell.SourceBomb);
        if (!CanReserve(world, barrel, bomb)) throw new InvalidOperationException("Barrel bomb obligation has no reserved capacity.");
        var row = new Promise(Token(transaction, barrel.Entity.ToHex(), barrel.ResourceGeneration.Value), transaction,
            barrel.Entity.ToHex(), barrel.ResourceGeneration.Value, bomb.Entity.ToHex(), BomberTerrainTransactions.Family(bomb).ToHex(),
            bomb.Owner.Value.ToHex(), bomb.SourceLife.Value.ToHex(), bomb.SourceLifeGeneration.Value,
            world.Single<BomberMatchState>().MatchId.Value, bomb.ChainId.Value, bomb.BombKind.Value,
            detail.X, detail.Z, bomb.ExplodedAtTick.Value, world.Tick, Frenzy: bomb.Frenzy.Value);
        return row;
    }

    internal static void Reject(World world, string transaction)
    {
        var rows = Read(world);
        int removed = rows.RemoveAll(row => row.Transaction == transaction && !row.Applied && !row.CreationSubmitted);
        if (removed != 1) throw new InvalidOperationException("Rejected barrel transaction lost its exact obligation.");
        Save(world, rows);
    }

    internal static void ValidatePending(World world, int index, BomberTerrainDetail detail, bool applied = false)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        var row = Read(world).SingleOrDefault(row => row.Transaction == runtime.PendingVoxelTransactionIds[0])
            ?? throw new InvalidOperationException("Pending barrel destruction lost its durable promise.");
        var config = BomberConfigBinding.For(world);
        if (row.Applied || row.CreationSubmitted || row.Barrel != runtime.PendingChests[index].ToHex() ||
            row.SourceBomb != runtime.PendingSourceBombs[index].ToHex() || row.Participant != runtime.PendingParticipants[index].ToHex() ||
            row.Life != runtime.PendingSourceLives[index].ToHex() || row.LifeGeneration != runtime.PendingSourceLifeGenerations[index] ||
            row.Chain != runtime.PendingChainIds[index] || row.Match != runtime.PendingVoxelMatchIds[0] ||
            row.Submitted != runtime.PendingVoxelSubmittedTicks[0] || row.Generation != detail.CellGeneration ||
            row.Family != detail.Family || row.Occurred != detail.Occurred || row.X != detail.X || row.Z != detail.Z ||
            detail.Reserved != 0 || detail.Rewards.Length != 0 || detail.Remaining != 0 || detail.Tier != 0 || detail.Direction is < 0 or > 3 ||
            runtime.PendingNewBlocks[index] != 0 || runtime.PendingOldBlocks[index] >> 8 != config.Tables.Blocks.Rows.Single(b => b.Name == "barrel").BlockType)
            throw new InvalidOperationException("Barrel promise differs from its exact Native intent or source.");
        var address = BomberTerrainTransactions.Address(config.Map, row.X, config.Map.ObstacleLayer, row.Z);
        if (runtime.PendingSections[index] != address.Section || runtime.PendingCellOffsets[index] != address.Offset ||
            !world.IsLive(runtime.PendingSourceBombs[index]))
            throw new InvalidOperationException("Barrel pending source or Native address is missing.");
        var bomb = world.Get<BomberBombState>(runtime.PendingSourceBombs[index]);
        if (bomb.Owner.Value.ToHex() != row.Participant || bomb.SourceLife.Value.ToHex() != row.Life ||
            bomb.SourceLifeGeneration.Value != row.LifeGeneration || bomb.ChainId.Value != row.Chain ||
            bomb.BombKind.Value != row.Shape || bomb.Frenzy.Value != row.Frenzy ||
            BomberTerrainTransactions.Family(bomb).ToHex() != row.Family || bomb.ExplodedAtTick.Value != row.Occurred)
            throw new InvalidOperationException("Barrel original source changed before Native settlement.");
        bomb.RequireTraversalPending(detail.X, detail.Z, detail.Direction);
        bool live = world.IsLive(runtime.PendingChests[index]);
        if (applied && live) throw new InvalidOperationException("Original Applied barrel still owns a live Native binding.");
        if (live && world.Get<BomberBarrelState>(runtime.PendingChests[index]).ResourceGeneration.Value != row.Generation)
            throw new InvalidOperationException("Pending barrel generation changed.");
    }

    internal static void Accept(World world, string transaction)
    {
        var rows = Read(world);
        int index = rows.FindIndex(row => row.Transaction == transaction);
        if (index < 0 || rows[index].Applied) throw new InvalidOperationException("Barrel Original was already settled.");
        // The composed HostVoxelWorldAdapter stages and synchronously commits the same
        // world's VoxelCommit phase. Only its confirmed Original can authorize this tick.
        rows[index] = rows[index] with { Applied = true };
        Save(world, rows);
    }

    internal static void Advance(World world)
    {
        foreach (var bomb in world.Each<BomberBombState>().Where(b => world.IsLive(b.Entity)).ToArray()) ObservePublished(world, bomb);
        foreach (var original in Read(world).Where(row => row.Applied && !row.CreationSubmitted).ToArray())
        {
            var rows = Read(world);
            int index = rows.FindIndex(row => row.Token == original.Token);
            var row = original with { CreationSubmitted = true, CreatedAt = world.Tick };
            // Unknown structural submission retains this durable flag and all credits.
            // It is never replayed merely because no published entity is yet visible.
            var order = BomberBombAdmissions.CreateFromPromise(world, row.Token, () =>
            {
                var accepted = Read(world);
                int acceptedIndex = accepted.FindIndex(candidate => candidate.Token == original.Token);
                if (acceptedIndex < 0 || accepted[acceptedIndex] != original)
                    throw new InvalidOperationException("Barrel submission lost its exact Original promise.");
                accepted[acceptedIndex] = row;
                Save(world, accepted);
            });
            var produced = order.Get<BomberBombState>();
            produced.Owner.Value = Identity(world, row.Participant);
            produced.SourceLife.Value = Identity(world, row.Life);
            produced.SourceLifeGeneration.Value = row.LifeGeneration;
            produced.Frenzy.Value = row.Frenzy;
            produced.ChainId.Value = row.Chain;
            produced.BombKind.Value = row.Shape;
            produced.Power.Value = 3;
            produced.PierceLayers.Value = row.Shape == (int)BomberBombKind.Pierce ? 1 : 0;
            produced.FutureChildren.Value = row.Shape == (int)BomberBombKind.ReservedSplit ? 4 : 0;
            produced.Phase.Value = (int)BomberBombPhase.Fuse;
            produced.CapacityReturned.Value = true;
            produced.PlacedAtTick.Value = row.CreatedAt;
            produced.FuseEndTick.Value = Due(world, row);
            EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
                FormattableString.Invariant($"{row.X + .5f:R},{BomberConfigBinding.For(world).Map.ObstacleLayer + .5f:R},{row.Z + .5f:R}"), silent: true);
            rows[index] = row with { Produced = order.AssignedId.IsDefault ? "" : order.AssignedId.ToHex() };
            Save(world, rows);
        }
    }

    internal static void ObservePublished(World world, BomberBombState bomb)
    {
        if (!world.IsLive(bomb.Entity) || !bomb.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal)) return;
        var rows = Read(world);
        int index = rows.FindIndex(row => row.Token == bomb.PromiseToken.Value);
        if (index < 0) return;
        RequirePublished(world, rows[index], bomb);
        rows.RemoveAt(index);
        Save(world, rows);
    }

    private static BomberBombState? Published(World world, Promise row)
    {
        var found = world.Each<BomberBombState>().Where(b => world.IsLive(b.Entity) && b.PromiseToken.Value == row.Token).ToArray();
        if (found.Length > 1) throw new InvalidOperationException("Barrel promise published more than once.");
        if (found.Length == 0) return null;
        RequirePublished(world, row, found[0]);
        return found[0];
    }

    private static void RequirePublished(World world, Promise row, BomberBombState bomb)
    {
        bomb.ValidateStorage();
        if (!row.Applied || !row.CreationSubmitted || (row.Produced != "" && bomb.Entity.ToHex() != row.Produced) ||
            bomb.Owner.Value.ToHex() != row.Participant || bomb.SourceLife.Value.ToHex() != row.Life ||
            bomb.SourceLifeGeneration.Value != row.LifeGeneration || bomb.Frenzy.Value != row.Frenzy ||
            bomb.BombKind.Value != row.Shape || bomb.Power.Value != 3 || !bomb.CapacityReturned.Value ||
            bomb.PlacedAtTick.Value != row.CreatedAt || bomb.ChildDirection.Value != 0 || !bomb.HitFamily.Value.IsDefault ||
            bomb.SkillLevel.Value != 0 || bomb.PierceLayers.Value != (row.Shape == (int)BomberBombKind.Pierce ? 1 : 0))
            throw new InvalidOperationException("Published barrel bomb does not match its exact submitted promise.");
        bool originalClock = bomb.ChainId.Value == row.Chain && bomb.FuseEndTick.Value == Due(world, row);
        bool exploded = bomb.Phase.Value == (int)BomberBombPhase.Danger || bomb.Phase.Value == (int)BomberBombPhase.Burn ||
            bomb.Phase.Value == (int)BomberBombPhase.Expired;
        if (!originalClock && (!bomb.PlacementRecorded.Value || !exploded || bomb.ChainId.Value == 0 ||
            bomb.ExplodedAtTick.Value < row.CreatedAt ||
            bomb.FuseEndTick.Value != bomb.ExplodedAtTick.Value || bomb.ExplodedAtTick.Value > world.Tick))
            throw new InvalidOperationException("Barrel publication changed its fuse or chain without an actual explosion.");
        if (!bomb.PlacementRecorded.Value)
        {
            var position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            if (!originalClock || bomb.Phase.Value != (int)BomberBombPhase.Fuse ||
                position.X != row.X + .5f || position.Y != BomberConfigBinding.For(world).Map.ObstacleLayer + .5f || position.Z != row.Z + .5f ||
                bomb.FutureChildren.Value != (row.Shape == (int)BomberBombKind.ReservedSplit ? 4 : 0) ||
                bomb.SplitSubmittedMask.Value != 0 || bomb.SplitResolvedMask.Value != 0 ||
                bomb.ExplodedAtTick.Value != 0 || bomb.DangerUntilTick.Value != 0 || bomb.BurnUntilTick.Value != 0 ||
                bomb.KickDirection.Value != 0 || bomb.KickRange.Value != 0)
                throw new InvalidOperationException("Barrel first publication differs from its exact construction.");
        }
    }

    internal static void Validate(World world)
    {
        var rows = Read(world);
        var runtime = world.Single<BomberWorldRuntime>();
        foreach (var row in rows)
        {
            _ = Published(world, row);
            if (!row.Applied && (runtime.PendingVoxelTransactionIds.Count != 1 || runtime.PendingVoxelTransactionIds[0] != row.Transaction ||
                runtime.PendingKinds.Count != 1 || runtime.PendingKinds[0] != (int)BomberVoxelIntentKind.DestroyBarrel))
                throw new InvalidOperationException("Unsettled barrel promise lost its original Native transaction.");
        }
        if (world.Each<BomberBombState>().Where(b => world.IsLive(b.Entity) && b.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal))
            .GroupBy(b => b.PromiseToken.Value).Any(group => group.Count() > 1))
            throw new InvalidOperationException("Duplicate live barrel publication token.");
    }

    internal static string Encode(World world, IReadOnlyList<Promise> rows)
    {
        if (rows.Count > CountLimit) throw new InvalidOperationException("Barrel promise count budget exceeded.");
        var tokens = new HashSet<string>();
        var sources = new HashSet<(string, ulong)>();
        foreach (var row in rows)
        {
            ValidateRow(world, row);
            if (!tokens.Add(row.Token) || !sources.Add((row.Barrel, row.Generation)))
                throw new InvalidOperationException("Duplicate barrel promise identity or generation.");
        }
        if (rows.Count == 0) return "";
        string encoded = JsonSerializer.Serialize(rows);
        if (Encoding.UTF8.GetByteCount(encoded) > ByteLimit) throw new InvalidOperationException("Barrel promise byte budget exceeded.");
        return encoded;
    }

    private static List<Promise> Read(World world)
    {
        string encoded = world.Single<BomberWorldRuntime>().BarrelBombPromises.Value;
        if (encoded is null || Encoding.UTF8.GetByteCount(encoded) > ByteLimit) throw new InvalidOperationException("Barrel promise byte budget exceeded.");
        if (encoded == "") return new();
        try
        {
            var rows = JsonSerializer.Deserialize<List<Promise>>(encoded) ?? throw new InvalidOperationException("Invalid barrel promise memory.");
            _ = Encode(world, rows);
            return rows;
        }
        catch (JsonException error) { throw new InvalidOperationException("Invalid barrel promise memory.", error); }
    }

    private static void Save(World world, IReadOnlyList<Promise> rows) => world.Single<BomberWorldRuntime>().BarrelBombPromises.Value = Encode(world, rows);

    private static void ValidateRow(World world, Promise row)
    {
        if (row is null) throw new InvalidOperationException("Missing barrel promise row.");
        _ = Identity(world, row.Barrel); _ = Identity(world, row.SourceBomb); _ = Identity(world, row.Family);
        _ = Identity(world, row.Participant); _ = Identity(world, row.Life);
        var config = BomberConfigBinding.For(world);
        if (row.Generation == 0 || row.LifeGeneration == 0 || row.Match == 0 || row.Match != world.Single<BomberMatchState>().MatchId.Value ||
            row.Chain == 0 || row.Shape is < 0 or > 7 || (row.Frenzy && row.Shape != (int)BomberBombKind.Standard) ||
            row.X < 0 || row.X >= config.Map.Width || row.Z < 0 || row.Z >= config.Map.Depth ||
            row.Transaction is null || !row.Transaction.StartsWith(FormattableString.Invariant($"bomber-terrain:{world.InstanceId:x16}:{row.Match:x16}:"), StringComparison.Ordinal) || row.Transaction.Length != 65 ||
            row.Token != Token(row.Transaction, row.Barrel, row.Generation) || Encoding.UTF8.GetByteCount(row.Token) > 128 ||
            row.Occurred > row.Submitted || row.Submitted > world.Tick || row.CreatedAt > world.Tick ||
            (row.CreationSubmitted && (!row.Applied || row.CreatedAt <= row.Submitted)) ||
            (!row.CreationSubmitted && (row.CreatedAt != 0 || row.Produced != "")))
            throw new InvalidOperationException("Invalid barrel promise source, lifecycle or Native provenance.");
        if (row.Produced != "") _ = Identity(world, row.Produced);
        _ = Due(world, row);
    }

    private static ulong Due(World world, Promise row) => checked(row.Submitted + Ticks.FromMilliseconds(100, BomberConfigBinding.For(world).Game.TickRateHz));

    private static string Token(string transaction, string barrel, ulong generation) =>
        FormattableString.Invariant($"barrel:{barrel}:{generation:x16}:{transaction.Substring(transaction.Length - 16)}");

    private static NetEntityId Identity(World world, string value)
    {
        if (!NetEntityId.TryParse(value, out var id) || id.Counter == 0 || id.InstanceId != world.InstanceId)
            throw new InvalidOperationException("Barrel promise requires complete local identities.");
        return id;
    }
}
