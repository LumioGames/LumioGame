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

namespace Lumio.Bomber.Gameplay;

internal sealed record BomberTerrainReward(int Kind, uint Skill, int X, int Z, ulong Match,
    string Participant, string Life, ulong Generation, string Bomb, string Family, ulong Occurred, string Transaction, int Index);
internal sealed record BomberTerrainContinuation(int X, int Z, int Direction, int Remaining, string Family, ulong Occurred,
    bool Unstarted = false);
internal sealed record BomberTerrainDetail(int X, int Z, int Direction, int Remaining, string Family,
    ulong Occurred, int Reserved, BomberTerrainReward[] Rewards, uint Tier = 0, ulong CellGeneration = 0, uint CircleStage = 0);

/// <summary>The single consumer of voxel delivery facts. Native remains the only cell store.</summary>
internal sealed class BomberTerrainTransactions
{
    internal const int MaxDestructions = 64;
    internal const int DetailBytes = 4096;
    private readonly List<BomberPendingVoxelCell> cells = new();
    private readonly List<BomberTerrainDetail> details = new();
    private readonly List<VoxelBindingOp> bindings = new();
    private ulong tick;
    private readonly HashSet<(int X, int Z)> queuedPickupCells = new();
    private readonly HashSet<(int X, int Z)> prepaidPickupCells = new();
    private readonly HashSet<NetEntityId> retiredPickupCredits = new();

    private static BomberTerrainTransactions For(World world)
    {
        if (!world.TryGetService<BomberTerrainTransactions>(out var frame) || frame is null)
        { frame = new BomberTerrainTransactions(); world.AttachService(frame); }
        return frame;
    }

    // Open before any producer can relinquish durable ownership to a queued structural create.
    internal static void BeginFrame(World world)
    {
        var frame = For(world);
        if (frame.tick == world.Tick) return;
        frame.tick = world.Tick;
        frame.queuedPickupCells.Clear();
        frame.prepaidPickupCells.Clear();
        frame.retiredPickupCredits.Clear();
        frame.cells.Clear(); frame.details.Clear(); frame.bindings.Clear();
    }

    internal static void Begin(World world)
    {
        BeginFrame(world);
        var runtime = world.Single<BomberWorldRuntime>();
        Validate(world);
        ValidateTraversalOwners(world);
        var adapter = VoxelGameplayBinding.Resolve(world.Manager);
        if (adapter is null) return;
        var match = world.Single<BomberMatchState>();
        var config = BomberConfigBinding.For(world);
        foreach (var result in adapter.DrainResults().Results)
        {
            if (runtime.PendingVoxelTransactionIds.Count != 1 ||
                !StringComparer.Ordinal.Equals(runtime.PendingVoxelTransactionIds[0], result.TransactionId)) continue;
            if (result.Operation is not null || result.BatchTransactionId is not null ||
                runtime.PendingVoxelSubmittedTicks[0] >= world.Tick)
                throw new InvalidOperationException("Terrain receipt correlation mismatch.");
            runtime.ValidatePending(config, match.MatchId.Value);
            var outcome = result.Outcome;
            if (outcome.State == VoxelTxnState.Aborted && outcome.Disposition == VoxelCommitDisposition.None && outcome.CleanupStatus == 0)
            {
                PreflightTraversalBatch(world);
                RejectTraversalBatch(world);
                if (runtime.PendingKinds[0] == (int)BomberVoxelIntentKind.DestroyBarrel)
                    BomberBarrelBombPromises.Reject(world, result.TransactionId);
                if (runtime.PendingKinds[0] == (int)BomberVoxelIntentKind.Regenerate)
                    BomberRegeneration.Reject(world, result.TransactionId);
                if (runtime.PendingKinds[0] is (int)BomberVoxelIntentKind.FreezeBridge or (int)BomberVoxelIntentKind.MeltBridge)
                    BomberIceBridges.Reject(world, result.TransactionId);
                for (int i = 0; i < runtime.PendingChests.Count; i++)
                    if (!runtime.PendingChests[i].IsDefault && world.IsLive(runtime.PendingChests[i]) &&
                        world.TypeOf(runtime.PendingChests[i]).Is<BomberChestEntity>())
                        world.Get<BomberChestState>(runtime.PendingChests[i]).TryClearPending(new(result.TransactionId, match.MatchId.Value, runtime.PendingVoxelSubmittedTicks[0]));
                Clear(runtime, config, match.MatchId.Value, result.TransactionId); continue;
            }
            if (outcome.Status != 0 || outcome.State != VoxelTxnState.Applied ||
                outcome.Disposition != VoxelCommitDisposition.Original || !outcome.TokenConsumed) continue;
            var expected = Enumerable.Range(0, runtime.PendingSections.Count)
                .GroupBy(i => runtime.PendingSections[i]).ToArray();
            if (outcome.Receipt.Sections is null || outcome.Receipt.Sections.Count != expected.Length ||
                outcome.SectionCount != expected.Length || outcome.ReceiptByteCount != outcome.Receipt.OriginalReceiptBytes.Length ||
                outcome.Receipt.OriginalReceiptBytes.IsEmpty)
                throw new InvalidOperationException("Terrain receipt section/byte evidence is incomplete.");
            foreach (var section in expected)
            {
                var receipts = outcome.Receipt.Sections.Where(r => r.SectionKey == section.Key).ToArray();
                if (receipts.Length != 1 || section.Any(i => receipts[0].UpToSectionRevision <= runtime.PendingExpectedRevisions[i]))
                    throw new InvalidOperationException("Terrain receipt revision does not advance the exact staged section.");
            }
            VoxelCellQuery[]? regenerationPhoto = null;
            if (runtime.PendingKinds[0] == (int)BomberVoxelIntentKind.Regenerate)
                regenerationPhoto = BomberTerrainRead.ForCommittedRegeneration(world, result.TransactionId, outcome) ??
                    throw new InvalidOperationException("Regeneration Original has no complete ready Native photo.");
            if (runtime.PendingKinds[0] is (int)BomberVoxelIntentKind.FreezeBridge or (int)BomberVoxelIntentKind.MeltBridge)
                BomberIceBridges.ValidateAppliedBatch(world, result.TransactionId, outcome);
            PreflightChestContactReservations(world);
            PreflightTraversalBatch(world);
            // Validate the entire settlement before changing any accounting column.
            for (int i = 0; i < runtime.PendingSections.Count; i++)
            {
                if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.Initialize) continue;
                if (runtime.PendingKinds[i] is (int)BomberVoxelIntentKind.FreezeBridge or (int)BomberVoxelIntentKind.MeltBridge)
                {
                    BomberIceBridges.ValidatePending(world, i, Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]));
                    continue;
                }
                if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.Regenerate)
                {
                    BomberRegeneration.ValidatePending(world, i, Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]),
                        applied: true, photo: regenerationPhoto);
                    continue;
                }
                if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.DestroyBarrel)
                {
                    BomberBarrelBombPromises.ValidatePending(world, i, Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]), applied: true);
                    continue;
                }
                if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.StrongChest)
                {
                    BomberStrongChests.ValidateApplied(world, i, Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]));
                    continue;
                }
                if (runtime.PendingKinds[i] is (int)BomberVoxelIntentKind.Clear or (int)BomberVoxelIntentKind.CircleClear or (int)BomberVoxelIntentKind.SpawnClear)
                {
                    if (!runtime.PendingChests[i].IsDefault && world.IsLive(runtime.PendingChests[i]))
                        throw new InvalidOperationException("Applied cleanup did not retire its exact bound entity.");
                    continue;
                }
                var detail = Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]);
                var source = runtime.PendingSourceBombs[i];
                if (!runtime.PendingChests[i].IsDefault && world.IsLive(runtime.PendingChests[i]))
                    throw new InvalidOperationException("Applied chest dig did not retire its exact bound entity.");
                if (!world.IsLive(source) || !world.TypeOf(source).Is<BomberBombEntity>())
                    throw new InvalidOperationException("Unsettled terrain source was retired.");
                var bomb = world.Get<BomberBombState>(source);
                if (bomb.Owner.Value != runtime.PendingParticipants[i] || bomb.SourceLife.Value != runtime.PendingSourceLives[i] ||
                    bomb.SourceLifeGeneration.Value != runtime.PendingSourceLifeGenerations[i] ||
                    bomb.ChainId.Value != runtime.PendingChainIds[i] || Family(bomb).ToHex() != detail.Family ||
                    bomb.ExplodedAtTick.Value != detail.Occurred ||
                    Enumerable.Range(0, bomb.TerrainContinuations.Count).Any(j =>
                        Decode<BomberTerrainContinuation>(bomb.TerrainContinuations[j]).Direction == detail.Direction))
                    throw new InvalidOperationException("Terrain source provenance changed before settlement.");
                var strong = detail.Tier == config.Chest.Id;
                if (!runtime.PendingChests[i].IsDefault && bomb.InspectChest(runtime.PendingChests[i]) !=
                    (strong ? BomberStorageAdmission.Duplicate : BomberStorageAdmission.Added))
                    throw new InvalidOperationException("Terminal chest contact changed before Original settlement.");
            }
            for (int i = 0; i < runtime.PendingSections.Count; i++)
            {
                if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.Regenerate ||
                    runtime.PendingKinds[i] is (int)BomberVoxelIntentKind.FreezeBridge or (int)BomberVoxelIntentKind.MeltBridge) continue;
                if ((BomberVoxelIntentKind)runtime.PendingKinds[i] == BomberVoxelIntentKind.Initialize)
                { runtime.InitialResourceCursor.Value++; continue; }
                if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.DestroyBarrel)
                {
                    var barrelDetail = Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]);
                    var barrelSource = world.Get<BomberBombState>(runtime.PendingSourceBombs[i]);
                    barrelSource.CommitTraversalProgress(barrelDetail.Direction,
                        barrelSource.PackTraversal(barrelSource.TraversalDistance(barrelDetail.X, barrelDetail.Z, barrelDetail.Direction), BomberBombState.TraversalFinished));
                    BomberBarrelBombPromises.Accept(world, result.TransactionId);
                    var participant = runtime.PendingParticipants[i];
                    if (world.IsLive(participant) && world.TypeOf(participant).Is<BomberParticipantEntity>() &&
                        world.Get<BomberParticipantState>(participant).MatchId.Value == match.MatchId.Value)
                        world.Get<BomberStatistics>(participant).DestroyedBlocks.Value++;
                    continue;
                }
                if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.StrongChest)
                {
                    BomberStrongChests.Accept(world, runtime.PendingChests[i], Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]));
                    continue;
                }
                if (runtime.PendingKinds[i] is (int)BomberVoxelIntentKind.Clear or (int)BomberVoxelIntentKind.CircleClear or (int)BomberVoxelIntentKind.SpawnClear) continue;
                var detail = Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]);
                if (!runtime.PendingChests[i].IsDefault && world.IsLive(runtime.PendingChests[i]))
                    throw new InvalidOperationException("Applied chest dig did not retire its exact bound entity.");
                if (!runtime.PendingChests[i].IsDefault && detail.Tier != config.Chest.Id &&
                    world.Get<BomberBombState>(runtime.PendingSourceBombs[i]).CommitPreparedChestContact(runtime.PendingChests[i]) != BomberStorageAdmission.Added)
                    throw new InvalidOperationException("Accepted terminal chest contact was already committed.");
                foreach (var reward in detail.Rewards) runtime.TerrainRewards.Add(Encode(reward));
                var owner = runtime.PendingParticipants[i];
                if (world.IsLive(owner) && world.TypeOf(owner).Is<BomberParticipantEntity>() &&
                    world.Get<BomberParticipantState>(owner).MatchId.Value == match.MatchId.Value)
                    world.Get<BomberStatistics>(owner).DestroyedBlocks.Value++;
                var source = runtime.PendingSourceBombs[i];
                if (!world.IsLive(source)) throw new InvalidOperationException("Unsettled terrain source was retired.");
                var bomb = world.Get<BomberBombState>(source);
                if (bomb.Owner.Value != owner || bomb.SourceLife.Value != runtime.PendingSourceLives[i] ||
                    bomb.SourceLifeGeneration.Value != runtime.PendingSourceLifeGenerations[i] ||
                    bomb.ChainId.Value != runtime.PendingChainIds[i] || Family(bomb).ToHex() != detail.Family ||
                    bomb.ExplodedAtTick.Value != detail.Occurred)
                    throw new InvalidOperationException("Terrain source provenance changed before settlement.");
                bomb.CommitTraversalProgress(detail.Direction,
                    bomb.PackTraversal(bomb.TraversalDistance(detail.X, detail.Z, detail.Direction), BomberBombState.TraversalReady));
                bomb.TerrainContinuations.Add(Encode(new BomberTerrainContinuation(detail.X, detail.Z,
                    detail.Direction, detail.Remaining, detail.Family, detail.Occurred)));
                if (!runtime.PendingChests[i].IsDefault)
                    ChestOccurrence(world, detail.Tier == config.Chest.Id ? "final_chest_opened" : "crate_opened",
                        runtime.PendingChests[i], bomb, detail.X, detail.Z,
                        detail.Tier == config.Chest.Id ? 0 : detail.Tier, 0, result.TransactionId);
            }
            bool initialized = runtime.PendingKinds[0] == (int)BomberVoxelIntentKind.Initialize;
            if (runtime.PendingKinds[0] == (int)BomberVoxelIntentKind.Regenerate)
                BomberRegeneration.Accept(world, result.TransactionId, outcome);
            if (runtime.PendingKinds[0] is (int)BomberVoxelIntentKind.FreezeBridge or (int)BomberVoxelIntentKind.MeltBridge)
                BomberIceBridges.Accept(world, result.TransactionId, outcome);
            Clear(runtime, config, match.MatchId.Value, result.TransactionId);
            if (initialized) BomberInitialResources.Accept(world);
        }
        BomberBarrelBombPromises.Advance(world);
        PlaceRewards(world);
        BomberInitialResources.Produce(world);
    }

    private static void Clear(BomberWorldRuntime runtime, IBomberConfig config, ulong match, string transaction)
    {
        runtime.ClearPending(transaction, config, match);
        runtime.TerrainPendingDetails.Clear();
        runtime.TerrainReservedPickups.Value = 0;
    }

    internal static NetEntityId Family(BomberBombState bomb) => bomb.HitFamily.Value.IsDefault ? bomb.Entity : bomb.HitFamily.Value;
    internal static bool HoldsSource(World world, NetEntityId source)
    {
        if (world.Get<BomberBombState>(source).TerrainContinuations.Count != 0) return true;
        var runtime = world.Single<BomberWorldRuntime>();
        for (int i = 0; i < runtime.PendingSourceBombs.Count; i++)
            if (runtime.PendingSourceBombs[i] == source) return true;
        return For(world).cells.Any(c => c.SourceBomb == source);
    }

    internal static bool TryDestroy(World world, BomberBombState bomb, int x, int z, int direction, int remaining, out bool retryArm)
    {
        retryArm = false;
        bomb.ValidateStorage();
        int pendingProgress = bomb.PreflightNewTraversal(x, z, direction, remaining);
        var frame = For(world);
        var runtime = world.Single<BomberWorldRuntime>();
        if (frame.tick != world.Tick) return false;
        if (runtime.PendingVoxelTransactionIds.Count != 0 || frame.cells.Count >= MaxDestructions ||
            (frame.cells.Count != 0 && frame.cells[0].Kind != BomberVoxelIntentKind.DestroySoft))
        { retryArm = true; return false; }
        var config = BomberConfigBinding.For(world);
        var read = BomberTerrainRead.For(world);
        if (read is null) return false;
        int index = z * config.Map.Width + x;
        var cell = read[config.Map.Width * config.Map.Depth + index];
        var block = config.Tables.Blocks.Rows.SingleOrDefault(r => r.BlockType == cell.BlockId >> 8);
        if (block.Id == 0 || !block.Destructible) return false;
        var address = Address(config.Map, x, config.Map.ObstacleLayer, z);
        if (frame.cells.Any(c => c.Write.SectionKey == address.Section && c.Write.CellOffset == address.Offset)) return false;
        if (block.SparseBinding == nameof(BomberBarrelEntity))
        {
            string? binding = VoxelGameplayBinding.Resolve(world.Manager)!.BindingGet(address.Section, address.Offset);
            if (frame.cells.Count != 0) { retryArm = true; return false; }
            if (binding is null || !NetEntityId.TryParse(binding, out var id) || !world.IsLive(id) || !world.TypeOf(id).Is<BomberBarrelEntity>()) return false;
            var barrel = world.Get<BomberBarrelState>(id);
            barrel.ValidateStorage();
            if (!BomberBarrelBombPromises.CanReserve(world, barrel, bomb)) { retryArm = true; return false; }
            var barrelDetail = new BomberTerrainDetail(x, z, direction, 0, Family(bomb).ToHex(), bomb.ExplodedAtTick.Value,
                0, Array.Empty<BomberTerrainReward>(), CellGeneration: barrel.ResourceGeneration.Value);
            PreflightPreparedDestruction(world, frame.cells, barrelDetail,
                new(new VoxelWriteEntry(address.Section, address.Offset, 0, cell.SectionRevision), cell.BlockId,
                    BomberVoxelIntentKind.DestroyBarrel, bomb.Owner.Value, bomb.SourceLife.Value, bomb.SourceLifeGeneration.Value,
                    bomb.Entity, id, bomb.ChainId.Value));
            frame.cells.Add(new(new VoxelWriteEntry(address.Section, address.Offset, 0, cell.SectionRevision), cell.BlockId,
                BomberVoxelIntentKind.DestroyBarrel, bomb.Owner.Value, bomb.SourceLife.Value, bomb.SourceLifeGeneration.Value, bomb.Entity, id, bomb.ChainId.Value));
            frame.details.Add(barrelDetail);
            bomb.CommitTraversalProgress(direction, pendingProgress);
            return true;
        }
        BomberChestState? chest = null;
        ChestRow? tier = null;
        if (block.SparseBinding != "none")
        {
            string? binding = VoxelGameplayBinding.Resolve(world.Manager)!.BindingGet(address.Section, address.Offset);
            if (binding is null || !NetEntityId.TryParse(binding, out var chestId) || !world.IsLive(chestId) ||
                !world.TypeOf(chestId).Is<BomberChestEntity>()) return false;
            chest = world.Get<BomberChestState>(chestId);
            chest.ValidateStorage();
            tier = chest.ResourceTier.Value == 0 ? config.Chest : config.Tables.Chest.Rows.Single(r => r.Id == chest.ResourceTier.Value);
            if (frame.cells.Count != 0) { retryArm = true; return false; }
        }
        else if (frame.cells.Any(c => !c.Chest.IsDefault)) { retryArm = true; return false; }
        tier ??= BomberResourceRewardRules.ForBlock(config, block, x, z);
        int reserved = tier is { } rule ? BomberResourceRewardRules.Maximum(config, rule) : 0;
        bool strongContact = chest is not null && chest.ResourceTier.Value == 0;
        bool countStrong = false;
        if (chest is not null)
        {
            if (chest.HasPendingTransaction.Value) return false;
            PreflightChestContactReservations(world, bomb, chest.Entity);
            if (strongContact)
            {
                if (Enumerable.Range(0, chest.HitBombs.Count).Any(i => chest.HitBombs[i] == Family(bomb))) return false;
                countStrong = chest.RemainingHits.Value > 0;
                if (countStrong && chest.InspectBomb(Family(bomb)) != BomberStorageAdmission.Added) return false;
                if (chest.RemainingHits.Value > 1)
                {
                    // Both admissions and the finished progress value are proven before the first write.
                    int finished = bomb.PackTraversal(bomb.TraversalDistance(x, z, direction), BomberBombState.TraversalFinished);
                    chest.TryCountBomb(Family(bomb));
                    bomb.CommitPreparedChestContact(chest.Entity);
                    bomb.CommitTraversalProgress(direction, finished);
                    ChestOccurrence(world, "chest_hit", chest.Entity, bomb, x, z, 0, chest.RemainingHits.Value);
                    return false;
                }
            }
            else if (chest.InspectBomb(Family(bomb)) != BomberStorageAdmission.Added) return false;
            else if (chest.RemainingHits.Value > 1)
            {
                int finished = bomb.PackTraversal(bomb.TraversalDistance(x, z, direction), BomberBombState.TraversalFinished);
                chest.TryCountBomb(Family(bomb));
                bomb.CommitPreparedChestContact(chest.Entity);
                bomb.CommitTraversalProgress(direction, finished);
                return false;
            }
            else if (chest.RemainingHits.Value != 1) return false;
        }
        if (checked(PickupCreditUsage(world) + reserved) > config.ObjectBudgets.PickupCapacity)
            return false;
        var rewards = tier is { } rewardTier ? BomberResourceRewards.Select(world, bomb, rewardTier, x, z) : Array.Empty<BomberTerrainReward>();
        var detail = new BomberTerrainDetail(x, z, direction, remaining, Family(bomb).ToHex(), bomb.ExplodedAtTick.Value, reserved, rewards,
            chest is null ? 0 : tier!.Value.Id, chest is null || chest.ResourceTier.Value == 0 ? cell.SectionRevision : chest.ResourceGeneration.Value);
        PreflightPreparedDestruction(world, frame.cells, detail,
            new(new VoxelWriteEntry(address.Section, address.Offset, 0, cell.SectionRevision), cell.BlockId,
                BomberVoxelIntentKind.DestroySoft, bomb.Owner.Value, bomb.SourceLife.Value, bomb.SourceLifeGeneration.Value,
                bomb.Entity, chest?.Entity ?? default, bomb.ChainId.Value));
        if (strongContact)
        {
            if (countStrong) chest!.TryCountBomb(Family(bomb));
            bomb.CommitPreparedChestContact(chest!.Entity);
            if (countStrong) ChestOccurrence(world, "chest_hit", chest.Entity, bomb, x, z, 0, chest.RemainingHits.Value);
        }
        frame.cells.Add(new(new VoxelWriteEntry(address.Section, address.Offset, 0, cell.SectionRevision), cell.BlockId,
            BomberVoxelIntentKind.DestroySoft, bomb.Owner.Value, bomb.SourceLife.Value, bomb.SourceLifeGeneration.Value,
            bomb.Entity, chest?.Entity ?? default, bomb.ChainId.Value));
        frame.details.Add(detail);
        bomb.CommitTraversalProgress(direction, pendingProgress);
        return true;
    }

    private static void ChestOccurrence(World world, string kind, NetEntityId chest, BomberBombState bomb,
        int x, int z, uint resourceTier, int remainingHits, string? transaction = null)
    {
        ulong match = world.Single<BomberMatchState>().MatchId.Value;
        ulong sequence = BomberMatchRules.Emit(world, kind, match,
            FormattableString.Invariant($"chest={chest.ToHex()} resourceTier={resourceTier} bomb={bomb.Entity.ToHex()} remainingHits={remainingHits}"));
        var data = new Dictionary<string, string>
        {
            ["resourceTier"] = resourceTier.ToString(CultureInfo.InvariantCulture),
            ["remainingHits"] = remainingHits.ToString(CultureInfo.InvariantCulture),
            ["bombId"] = bomb.Entity.ToHex(),
            ["familyId"] = Family(bomb).ToHex(),
            ["chainId"] = bomb.ChainId.Value.ToString(CultureInfo.InvariantCulture),
            ["sourceLifeGeneration"] = bomb.SourceLifeGeneration.Value.ToString(CultureInfo.InvariantCulture),
        };
        if (transaction is not null) data["transactionId"] = transaction;
        world.Single<BomberPresentationJournal>().Append(world, kind, match, sequence,
            sourceParticipant: bomb.Owner.Value, sourceLife: bomb.SourceLife.Value,
            entity: chest, x: x, z: z, data: data);
    }

    internal static void End(World world)
    {
        var frame = For(world);
        if (frame.cells.Count == 0) return;
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        var adapter = VoxelGameplayBinding.Resolve(world.Manager) ?? throw new InvalidOperationException("Terrain adapter disappeared.");
        string transaction = PreviewTerrainTransaction(world);
        var encoded = frame.details.Select((d, cellIndex) => Encode(d with { Rewards = d.Rewards.Select((r, i) => r with { Transaction = transaction, Index = checked(cellIndex * 4 + i) }).ToArray() })).ToArray();
        runtime.ValidatePendingRecord(transaction, world.Tick, match.MatchId.Value, frame.cells, config);
        var first = frame.cells[0];
        bool barrel = first.Kind == BomberVoxelIntentKind.DestroyBarrel;
        bool regenerate = first.Kind == BomberVoxelIntentKind.Regenerate;
        bool bridge = first.Kind is BomberVoxelIntentKind.FreezeBridge or BomberVoxelIntentKind.MeltBridge;
        bool destruction = first.Kind == BomberVoxelIntentKind.DestroySoft;
        PreflightChestContactReservations(world);
        PreflightFrameTraversal(world, frame.cells, frame.details);
        if (barrel || regenerate || bridge || destruction)
        {
            // Durable credit ownership precedes the Native staging call, including an
            // exception whose mutation outcome cannot be proven to have been rejected.
            if (barrel) BomberBarrelBombPromises.Stage(world, transaction, first, frame.details[0]);
            else if (regenerate) BomberRegeneration.Stage(world, transaction);
            else if (bridge) BomberIceBridges.Stage(world, transaction, frame.cells);
            runtime.RecordPending(transaction, world.Tick, match.MatchId.Value, frame.cells, config);
            foreach (string value in encoded) runtime.TerrainPendingDetails.Add(value);
            runtime.TerrainReservedPickups.Value = frame.details.Sum(d => d.Reserved);
            if (destruction && !first.Chest.IsDefault)
                world.Get<BomberChestState>(first.Chest).TrySetPending(new(transaction, match.MatchId.Value, world.Tick));
        }
        runtime.AllocateVoxelTransactionSequence();
        var result = frame.bindings.Count != 0 ? adapter.TryStageMutation(frame.cells.Select(c => c.Write).ToArray(), frame.bindings, transaction)
            : first.Chest.IsDefault ? adapter.TryStageWrite(frame.cells.Select(c => c.Write).ToArray(), transaction)
            : adapter.TryStageDigThrough(first.Write.SectionKey, first.Write.CellOffset, first.Write.ExpectedSectionRevision, transaction);
        if (result.Status == VoxelStageStatus.Rejected)
        {
            if (barrel || destruction)
            {
                PreflightTraversalBatch(world);
                RejectTraversalBatch(world);
                if (destruction && !first.Chest.IsDefault)
                    world.Get<BomberChestState>(first.Chest).TryClearPending(new(transaction, match.MatchId.Value, world.Tick));
            }
            if (destruction) Clear(runtime, config, match.MatchId.Value, transaction);
            if (barrel) { BomberBarrelBombPromises.Reject(world, transaction); Clear(runtime, config, match.MatchId.Value, transaction); }
            if (regenerate) { BomberRegeneration.Reject(world, transaction); Clear(runtime, config, match.MatchId.Value, transaction); }
            if (bridge) { BomberIceBridges.Reject(world, transaction); Clear(runtime, config, match.MatchId.Value, transaction); }
            return;
        }
        if (barrel || regenerate || bridge || destruction) return;
        runtime.RecordPending(transaction, world.Tick, match.MatchId.Value, frame.cells, config);
        foreach (string value in encoded) runtime.TerrainPendingDetails.Add(value);
        runtime.TerrainReservedPickups.Value = frame.details.Sum(d => d.Reserved);
        if (!first.Chest.IsDefault && first.Kind == BomberVoxelIntentKind.DestroySoft)
            world.Get<BomberChestState>(first.Chest).TrySetPending(new(transaction, match.MatchId.Value, world.Tick));
    }

    internal static void Initialize(World world, IReadOnlyList<BomberPendingVoxelCell> writes, IReadOnlyList<VoxelBindingOp> bindings)
    {
        var frame = For(world);
        if (frame.tick != world.Tick || frame.cells.Count != 0 || writes.Count is < 1 or > 128 ||
            world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count != 0)
            throw new InvalidOperationException("Initial production must use the empty ordinary terrain frame.");
        foreach (var cell in writes)
        {
            frame.cells.Add(cell);
            frame.details.Add(new(0, 0, 0, 0, "", world.Tick, 0, Array.Empty<BomberTerrainReward>()));
        }
        frame.bindings.AddRange(bindings);
    }

    internal static bool FrameAvailable(World world) => For(world).tick == world.Tick && For(world).cells.Count == 0 &&
        world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count == 0;

    internal static void Regenerate(World world, IReadOnlyList<BomberPendingVoxelCell> writes, IReadOnlyList<BomberTerrainDetail> metadata)
    {
        if (!FrameAvailable(world) || writes.Count is < 4 or > 16 || writes.Count % 4 != 0 || writes.Count != metadata.Count ||
            writes.Any(cell => cell.Kind != BomberVoxelIntentKind.Regenerate || !cell.Chest.IsDefault))
            throw new InvalidOperationException("Regeneration requires whole groups in the empty ordinary terrain frame.");
        var frame = For(world);
        frame.cells.AddRange(writes);
        frame.details.AddRange(metadata);
    }

    internal static void Bridge(World world, IReadOnlyList<BomberPendingVoxelCell> writes,
        IReadOnlyList<BomberTerrainDetail> metadata, IReadOnlyList<VoxelBindingOp> mutations)
    {
        if (!FrameAvailable(world) || writes.Count is < 1 or > BomberIceBridges.MaxRows ||
            writes.Count != metadata.Count || writes.Count != mutations.Count ||
            writes.Any(cell => cell.Chest.IsDefault || cell.Kind != writes[0].Kind ||
                cell.Kind is not BomberVoxelIntentKind.FreezeBridge and not BomberVoxelIntentKind.MeltBridge))
            throw new InvalidOperationException("Bridge requires one complete, bounded, same-kind Native cohort.");
        var frame = For(world);
        frame.cells.AddRange(writes); frame.details.AddRange(metadata); frame.bindings.AddRange(mutations);
    }
    internal static void SpawnStrongChest(World world, BomberPendingVoxelCell cell, uint stage, int x, int z)
    {
        if (!FrameAvailable(world) || cell.Kind != BomberVoxelIntentKind.StrongChest || cell.Chest.IsDefault)
            throw new InvalidOperationException("Strong chest requires the empty ordinary terrain transaction.");
        var frame = For(world);
        frame.cells.Add(cell);
        frame.details.Add(new(x, z, 0, 0, "", world.Tick, 0, Array.Empty<BomberTerrainReward>(), CircleStage: stage));
        frame.bindings.Add(new(cell.Write.SectionKey, cell.Write.CellOffset, cell.Chest.ToHex())
        { ExpectedSectionRevision = cell.Write.ExpectedSectionRevision });
    }

    internal static bool ClearRound(World world, IReadOnlyList<BomberPendingVoxelCell> writes)
        => ClearTerrain(world, writes, BomberVoxelIntentKind.Clear, 0);

    internal static bool ClearCircle(World world, IReadOnlyList<BomberPendingVoxelCell> writes, uint stage)
        => ClearTerrain(world, writes, BomberVoxelIntentKind.CircleClear, stage);

    internal static bool ClearSpawn(World world, IReadOnlyList<BomberPendingVoxelCell> writes, int x, int z)
    {
        if (writes.Count is < 1 or > 2 || writes.Any(c => !c.Chest.IsDefault))
            throw new InvalidOperationException("Spawn clearance exceeds its two unbound soft arms.");
        if (!ClearTerrain(world, writes, BomberVoxelIntentKind.SpawnClear, 0)) return false;
        var frame = For(world);
        for (int i = 0; i < frame.details.Count; i++) frame.details[i] = frame.details[i] with { X = x, Z = z };
        return true;
    }

    private static bool ClearTerrain(World world, IReadOnlyList<BomberPendingVoxelCell> writes, BomberVoxelIntentKind kind, uint stage)
    {
        var frame = For(world);
        if (frame.tick != world.Tick || frame.cells.Count != 0 ||
            world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count != 0) return false;
        if (writes.Count is < 1 or > 128 || writes.Any(c => c.Kind != kind) ||
            (writes.Any(c => !c.Chest.IsDefault) && writes.Count != 1))
            throw new InvalidOperationException("Round cleanup exceeds its ordinary bounded transaction.");
        foreach (var cell in writes)
        {
            frame.cells.Add(cell);
            var chest = kind == BomberVoxelIntentKind.CircleClear && !cell.Chest.IsDefault
                ? world.Get<BomberChestState>(cell.Chest) : null;
            frame.details.Add(new(0, 0, 0, 0, "", world.Tick, 0, Array.Empty<BomberTerrainReward>(),
                Tier: chest?.ResourceTier.Value ?? 0, CellGeneration: chest?.ResourceGeneration.Value ?? 0, CircleStage: stage));
        }
        return true;
    }

    internal static int Occupied(World world) => checked(world.Each<BomberPickupItem>().Count(item => world.IsLive(item.Entity)) +
        (For(world).tick == world.Tick ? For(world).queuedPickupCells.Count : 0));

    // Call only after authoritative consumption has queued source destruction:
    // matching Applied health settlement or the committed special-bomb slot.
    // Physical occupancy remains unchanged until structural finalization, but this
    // original producer credit already belongs to the holding (or has been spent).
    internal static void RetireConsumedPickupCredit(World world, NetEntityId item)
    {
        BeginFrame(world);
        if (!For(world).retiredPickupCredits.Add(item))
            throw new InvalidOperationException("Settled pickup credit was retired twice in the same Tick.");
    }

    internal static HashSet<(int X, int Z)> PickupCells(World world)
    {
        var occupied = world.Each<BomberPickupItem>().Where(p => world.IsLive(p.Entity))
            .Select(p => world.Get<LogicTransform>(p.Entity).LocalPosition)
            .Select(p => (BomberMatchRules.CellX(p), BomberMatchRules.CellZ(p))).ToHashSet();
        if (For(world).tick == world.Tick) occupied.UnionWith(For(world).queuedPickupCells);
        return occupied;
    }

    // A structural create is invisible to Each until finalization. Both producers claim
    // its object credit and destination before relinquishing their persisted debt.
    internal static void ReservePickup(World world, (int X, int Z) cell, bool prepaid = false)
    {
        BeginFrame(world);
        var frame = For(world);
        if (!frame.queuedPickupCells.Add(cell))
            throw new InvalidOperationException("Pickup destination already reserved by this Tick's producer.");
        if (prepaid) frame.prepaidPickupCells.Add(cell);
    }

    internal static int PickupCreditUsage(World world)
    {
        BeginFrame(world);
        var frame = For(world);
        return checked(Occupied(world) - frame.retiredPickupCredits.Count - frame.prepaidPickupCells.Count +
            BomberDeathDrops.HeldOutputs(world) + BomberDeathDrops.PendingOutputs(world) +
            Reserved(world) + BomberCentralSupply.ReservedCount(world));
    }

    internal static int Reserved(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        // Once staged, the persisted reservation owns these same frame intents.
        int unstaged = runtime.PendingVoxelTransactionIds.Count == 0 && For(world).tick == world.Tick
            ? For(world).details.Sum(d => d.Reserved) : 0;
        return checked(runtime.TerrainReservedPickups.Value + runtime.TerrainRewards.Count + unstaged);
    }

    private static void PlaceRewards(World world)
    {
        if (!BomberRoundTransition.CanMaterializePendingWealth(world)) return;
        var runtime = world.Single<BomberWorldRuntime>();
        int occupied = Occupied(world);
        var config = BomberConfigBinding.For(world);
        var positions = PickupCells(world);
        for (int i = runtime.TerrainRewards.Count - 1; i >= 0; i--)
        {
            if (occupied >= config.ObjectBudgets.PickupCapacity) break;
            var reward = Decode<BomberTerrainReward>(runtime.TerrainRewards[i]);
            if (!BomberResourceRewards.CanMaterialize(config, reward)) continue;
            (int X, int Z)? destination = null;
            foreach (var cell in Enumerable.Range(0, checked(config.Map.Width * config.Map.Depth))
                .Select(c => (X: c % config.Map.Width, Z: c / config.Map.Width))
                .OrderBy(c => Math.Abs(c.X - reward.X) + Math.Abs(c.Z - reward.Z)).ThenBy(c => c.Z).ThenBy(c => c.X))
                if (!positions.Contains(cell) && PlaceBombAbility.IsPlacableTerrain(world, cell.X, cell.Z)) { destination = cell; break; }
            if (destination is not { } at) continue;
            ReservePickup(world, at);
            var order = world.Commands.Create<BomberPickupItemEntity>();
            var item = order.Get<BomberPickupItem>();
            item.Kind.Value = reward.Kind; item.SkillId.Value = reward.Skill; item.SkillLevel.Value = reward.Skill == 0 ? 0 : 1;
            item.DropMatchId.Value = reward.Match; item.DropParticipant.Value = Parse(reward.Participant, world);
            item.DroppedBy.Value = Parse(reward.Life, world); item.DropLifeGeneration.Value = reward.Generation;
            item.DropOccurrenceTick.Value = reward.Occurred; item.SpawnTick.Value = world.Tick;
            item.TerrainTransaction.Value = reward.Transaction;
            item.TerrainSourceBomb.Value = Parse(reward.Bomb, world); item.TerrainSourceFamily.Value = Parse(reward.Family, world);
            item.TerrainOrdinal.Value = reward.Index;
            EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
                FormattableString.Invariant($"{at.X + 0.5f:R},{config.Map.ObstacleLayer + 0.5f:R},{at.Z + 0.5f:R}"), silent: true);
            runtime.TerrainRewards.RemoveAt(i); occupied++; positions.Add(at);
        }
    }

    internal static (ulong Section, int Offset) Address(MapRow map, int x, int y, int z) =>
        (VoxelPackedSection.Encode(x >> 4, checked((byte)(y >> 4)), z >> 4), ((y & 15) << 8) | ((z & 15) << 4) | (x & 15));

    internal static string Encode<T>(T value)
    {
        string json = JsonSerializer.Serialize(value);
        if (Encoding.UTF8.GetByteCount(json) > DetailBytes) throw new InvalidOperationException("Terrain rule memory exceeds its byte budget.");
        return json;
    }

    internal static T Decode<T>(string value)
    {
        if (Encoding.UTF8.GetByteCount(value) > DetailBytes) throw new InvalidOperationException("Terrain rule memory exceeds its byte budget.");
        try { return JsonSerializer.Deserialize<T>(value) ?? throw new InvalidOperationException("Invalid terrain rule memory."); }
        catch (JsonException error) { throw new InvalidOperationException("Invalid terrain rule memory.", error); }
    }

    private static NetEntityId Parse(string value, World world)
    {
        if (!NetEntityId.TryParse(value, out var id) || id.IsDefault || id.Counter == 0 || id.InstanceId != world.InstanceId)
            throw new InvalidOperationException("Terrain provenance is not a complete local identity.");
        return id;
    }

    internal static void Validate(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        BomberInitialResources.ValidateMemory(world);
        BomberStrongChests.Validate(world);
        BomberBarrelBombPromises.Validate(world);
        BomberRegeneration.Validate(world);
        BomberIceBridges.Validate(world);
        bool owned = runtime.PendingVoxelTransactionIds.Count == 1 && runtime.PendingVoxelTransactionIds[0].StartsWith("bomber-terrain:", StringComparison.Ordinal);
        if ((owned || runtime.TerrainPendingDetails.Count != 0) && runtime.TerrainPendingDetails.Count != runtime.PendingSections.Count)
            throw new InvalidOperationException("Terrain pending provenance columns disagree.");
        int reserved = 0;
        var rewardKeys = new HashSet<(string, int)>();
        var rays = new HashSet<(NetEntityId, int)>();
        if (runtime.TerrainPendingDetails.Count != 0 && runtime.TerrainPendingDetails.Count >
            (runtime.PendingKinds[0] is (int)BomberVoxelIntentKind.Initialize or (int)BomberVoxelIntentKind.Clear or (int)BomberVoxelIntentKind.CircleClear ? 128 : MaxDestructions))
            throw new InvalidOperationException("Terrain batch exceeds its producer bound.");
        for (int i = 0; i < runtime.TerrainPendingDetails.Count; i++)
        {
            var row = Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]);
            if (row.Rewards is null) throw new InvalidOperationException("Terrain output reservation is missing.");
            if (runtime.PendingKinds[i] is (int)BomberVoxelIntentKind.FreezeBridge or (int)BomberVoxelIntentKind.MeltBridge)
            {
                BomberIceBridges.ValidatePending(world, i, row);
                continue;
            }
            if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.Regenerate)
            {
                BomberRegeneration.ValidatePending(world, i, row);
                continue;
            }
            if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.DestroyBarrel)
            {
                BomberBarrelBombPromises.ValidatePending(world, i, row);
                continue;
            }
            if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.StrongChest)
            {
                BomberStrongChests.ValidatePending(world, i, row);
                continue;
            }
            if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.SpawnClear)
            {
                BomberSpawnSelection.ValidateClear(world, i, row);
                continue;
            }
            if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.CircleClear)
            {
                BomberFinalCircle.ValidateClear(world, i, row);
                if (row.Reserved != 0 || row.Rewards.Length != 0 || row.Family != "")
                    throw new InvalidOperationException("Circle cleanup cannot mint rewards.");
                continue;
            }
            if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.Clear)
            {
                BomberRoundTransition.ValidateClear(world, i);
                if (row.Reserved != 0 || row.Rewards.Length != 0 || row.Family != "")
                    throw new InvalidOperationException("Round cleanup cannot mint rewards.");
                continue;
            }
            if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.Initialize)
            {
                if (row.Reserved != 0 || row.Rewards.Length != 0 || row.Family != "")
                    throw new InvalidOperationException("Initial resource construction cannot mint rewards.");
                continue;
            }
            int maximum = row.Tier == BomberConfigBinding.For(world).Chest.Id ? BomberResourceRewardRules.Maximum(BomberConfigBinding.For(world), BomberConfigBinding.For(world).Chest) : 4;
            if (row.Direction is < 0 or > 3 || row.Remaining < 0 || row.Reserved < row.Rewards.Length || row.Reserved > maximum ||
                row.X < 0 || row.X >= BomberConfigBinding.For(world).Map.Width || row.Z < 0 || row.Z >= BomberConfigBinding.For(world).Map.Depth)
                throw new InvalidOperationException("Invalid terrain continuation or reservation.");
            if (!rays.Add((runtime.PendingSourceBombs[i], row.Direction)) ||
                (row.Tier == 0) != runtime.PendingChests[i].IsDefault ||
                (row.Tier != 0 && !BomberConfigBinding.For(world).Tables.Chest.Rows.Any(r => r.Id == row.Tier && r.Name is "default" or "Wood" or "Iron" or "Gold")))
                throw new InvalidOperationException("Terrain tier or per-source ray identity is invalid.");
            if (!runtime.PendingChests[i].IsDefault && world.IsLive(runtime.PendingChests[i]))
            {
                var chest = world.Get<BomberChestState>(runtime.PendingChests[i]);
                var source = runtime.PendingSourceBombs[i];
                if (!world.IsLive(source) || !world.TypeOf(source).Is<BomberBombEntity>())
                    throw new InvalidOperationException("Pending terminal chest lost its source bomb.");
                var bomb = world.Get<BomberBombState>(source);
                bool strong = row.Tier == BomberConfigBinding.For(world).Chest.Id;
                if (!chest.PendingMatches(new(runtime.PendingVoxelTransactionIds[0],
                        world.Single<BomberMatchState>().MatchId.Value, runtime.PendingVoxelSubmittedTicks[0])) ||
                    chest.RemainingHits.Value != (strong ? 0 : 1) || chest.ResourceTier.Value != (strong ? 0 : row.Tier) ||
                    (!strong && chest.ResourceGeneration.Value != row.CellGeneration) ||
                    Family(bomb).ToHex() != row.Family || bomb.InspectChest(chest.Entity) != (strong ? BomberStorageAdmission.Duplicate : BomberStorageAdmission.Added) ||
                    (!strong && Enumerable.Range(0, chest.HitBombs.Count).Any(j => chest.HitBombs[j] == Family(bomb))))
                    throw new InvalidOperationException("Pending terminal chest is not bound to its provisional hit.");
            }
            _ = Parse(row.Family, world);
            var address = Address(BomberConfigBinding.For(world).Map, row.X, BomberConfigBinding.For(world).Map.ObstacleLayer, row.Z);
            if (address.Section != runtime.PendingSections[i] || address.Offset != runtime.PendingCellOffsets[i] || row.CellGeneration == 0 ||
                row.Occurred > runtime.PendingVoxelSubmittedTicks[0] || runtime.PendingNewBlocks[i] != 0 ||
                runtime.PendingParticipants[i].IsDefault || runtime.PendingSourceLives[i].IsDefault || runtime.PendingSourceBombs[i].IsDefault ||
                runtime.PendingSourceLifeGenerations[i] == 0 || runtime.PendingChainIds[i] == 0)
                throw new InvalidOperationException("Terrain intent does not match its exact cell or source.");
            var continuationSourceId = runtime.PendingSourceBombs[i];
            if (!world.IsLive(continuationSourceId) || !world.TypeOf(continuationSourceId).Is<BomberBombEntity>())
                throw new InvalidOperationException("Pending terrain continuation lost its source bomb.");
            var continuationSource = world.Get<BomberBombState>(continuationSourceId);
            if (row.Remaining >= continuationSource.Power.Value ||
                continuationSource.Owner.Value != runtime.PendingParticipants[i] ||
                continuationSource.SourceLife.Value != runtime.PendingSourceLives[i] ||
                continuationSource.SourceLifeGeneration.Value != runtime.PendingSourceLifeGenerations[i] ||
                continuationSource.ChainId.Value != runtime.PendingChainIds[i] ||
                Family(continuationSource).ToHex() != row.Family || continuationSource.ExplodedAtTick.Value != row.Occurred)
                throw new InvalidOperationException("Pending terrain continuation differs from its exact source power or provenance.");
            continuationSource.RequireTraversalPending(row.X, row.Z, row.Direction);
            continuationSource.ValidateTerrainFrontier(row.X, row.Z, row.Direction, row.Remaining);
            foreach (var reward in row.Rewards)
            {
                ValidateReward(world, reward);
                if (!rewardKeys.Add((reward.Transaction, reward.Index))) throw new InvalidOperationException("Duplicate terrain output identity.");
                if (reward.Transaction != runtime.PendingVoxelTransactionIds[0] || reward.Participant != runtime.PendingParticipants[i].ToHex() ||
                    reward.Life != runtime.PendingSourceLives[i].ToHex() || reward.Bomb != runtime.PendingSourceBombs[i].ToHex() ||
                    reward.Generation != runtime.PendingSourceLifeGenerations[i] || reward.Family != row.Family ||
                    reward.Occurred != row.Occurred || reward.X != row.X || reward.Z != row.Z)
                    throw new InvalidOperationException("Terrain output reservation lost its causal source.");
            }
            reserved = checked(reserved + row.Reserved);
        }
        if (reserved != runtime.TerrainReservedPickups.Value || runtime.TerrainRewards.Count + reserved > BomberConfigBinding.For(world).ObjectBudgets.PickupCapacity)
            throw new InvalidOperationException("Invalid terrain output reservation count.");
        for (int i = 0; i < runtime.TerrainRewards.Count; i++)
        {
            var row = Decode<BomberTerrainReward>(runtime.TerrainRewards[i]);
            ValidateReward(world, row, accepted: true);
            if (!rewardKeys.Add((row.Transaction, row.Index))) throw new InvalidOperationException("Duplicate terrain output identity.");
        }
    }

    private static void PreflightChestContactReservations(World world,
        BomberBombState? candidate = null, NetEntityId candidateChest = default)
    {
        var cohorts = new Dictionary<NetEntityId, (BomberSourceIdentity Source,
            List<NetEntityId> Writes, List<NetEntityId> Observed)>();
        void Add(NetEntityId sourceId, BomberSourceIdentity source, ulong chain,
            string family, ulong occurred, NetEntityId chest, bool observed)
        {
            if (!world.IsLive(sourceId) || !world.TypeOf(sourceId).Is<BomberBombEntity>())
                throw new InvalidOperationException("Chest contact reservation lost its exact source bomb.");
            var bomb = world.Get<BomberBombState>(sourceId);
            if (bomb.ReadSource() != source || bomb.ChainId.Value != chain ||
                Family(bomb).ToHex() != family || bomb.ExplodedAtTick.Value != occurred)
                throw new InvalidOperationException("Chest contact reservation differs from its exact original source.");
            if (!cohorts.TryGetValue(sourceId, out var cohort))
            {
                cohort = (source, new List<NetEntityId>(), new List<NetEntityId>());
                cohorts.Add(sourceId, cohort);
            }
            else if (cohort.Source != source)
                throw new InvalidOperationException("Chest contact cohort contains conflicting exact sources.");
            (observed ? cohort.Observed : cohort.Writes).Add(chest);
        }
        var runtime = world.Single<BomberWorldRuntime>();
        for (int i = 0; i < runtime.PendingKinds.Count; i++)
        {
            if (runtime.PendingKinds[i] != (int)BomberVoxelIntentKind.DestroySoft || runtime.PendingChests[i].IsDefault) continue;
            var detail = Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]);
            Add(runtime.PendingSourceBombs[i], new(runtime.PendingParticipants[i], runtime.PendingSourceLives[i],
                runtime.PendingSourceLifeGenerations[i]), runtime.PendingChainIds[i], detail.Family,
                detail.Occurred, runtime.PendingChests[i], detail.Tier == BomberConfigBinding.For(world).Chest.Id);
        }
        var frame = For(world);
        // Staged headers own the same frame rows. Counting both would invent a
        // second obligation for every actual Native submission.
        if (runtime.PendingVoxelTransactionIds.Count == 0 && frame.tick == world.Tick)
        {
            for (int i = 0; i < frame.cells.Count; i++)
            {
                var cell = frame.cells[i];
                if (cell.Kind != BomberVoxelIntentKind.DestroySoft || cell.Chest.IsDefault) continue;
                var detail = frame.details[i];
                Add(cell.SourceBomb, new(cell.Participant, cell.SourceLife, cell.SourceLifeGeneration),
                    cell.ChainId, detail.Family, detail.Occurred, cell.Chest,
                    detail.Tier == BomberConfigBinding.For(world).Chest.Id);
            }
        }
        if (candidate is not null)
            Add(candidate.Entity, candidate.ReadSource(), candidate.ChainId.Value,
                Family(candidate).ToHex(), candidate.ExplodedAtTick.Value, candidateChest, observed: false);
        foreach (var pair in cohorts)
            world.Get<BomberBombState>(pair.Key).PreflightChestContactCohort(
                pair.Value.Source, pair.Value.Writes, pair.Value.Observed);
    }


    private static bool IsTraversalKind(int kind) =>
        kind is (int)BomberVoxelIntentKind.DestroySoft or (int)BomberVoxelIntentKind.DestroyBarrel;

    private static string PreviewTerrainTransaction(World world) => FormattableString.Invariant(
        $"bomber-terrain:{world.InstanceId:x16}:{world.Single<BomberMatchState>().MatchId.Value:x16}:{checked(world.Single<BomberWorldRuntime>().NextVoxelTransactionSequence.Value + 1UL):x16}");

    private static void PreflightPreparedDestruction(World world, List<BomberPendingVoxelCell> preceding,
        BomberTerrainDetail detail, BomberPendingVoxelCell cell)
    {
        string transaction = PreviewTerrainTransaction(world);
        var cells = preceding.Concat(new[] { cell }).ToArray();
        var runtime = world.Single<BomberWorldRuntime>();
        runtime.ValidatePendingRecord(transaction, world.Tick, world.Single<BomberMatchState>().MatchId.Value,
            cells, BomberConfigBinding.For(world));
        _ = Encode(detail with { Rewards = detail.Rewards.Select((reward, i) => reward with {
            Transaction = transaction, Index = checked(preceding.Count * 4 + i) }).ToArray() });
        if (cell.Kind == BomberVoxelIntentKind.DestroyBarrel)
            BomberBarrelBombPromises.PreflightStage(world, transaction, cell, detail);
        if (!cell.Chest.IsDefault && cell.Kind == BomberVoxelIntentKind.DestroySoft)
        {
            var chest = world.Get<BomberChestState>(cell.Chest);
            chest.ValidateStorage();
            if (chest.HasPendingTransaction.Value || chest.RemainingHits.Value is not (0 or 1))
                throw new InvalidOperationException("Prepared terminal chest lost its exact pending admission.");
        }
    }

    private static void PreflightFrameTraversal(World world, List<BomberPendingVoxelCell> cells,
        List<BomberTerrainDetail> details)
    {
        if (cells.Count != details.Count) throw new InvalidOperationException("Terrain frame columns disagree.");
        var arms = new HashSet<(NetEntityId, int)>();
        for (int i = 0; i < cells.Count; i++)
        {
            if (!IsTraversalKind((int)cells[i].Kind)) continue;
            var cell = cells[i]; var detail = details[i];
            var bomb = world.Get<BomberBombState>(cell.SourceBomb);
            bomb.ValidateStorage();
            bomb.RequireTraversalPending(detail.X, detail.Z, detail.Direction);
            var address = Address(BomberConfigBinding.For(world).Map, detail.X,
                BomberConfigBinding.For(world).Map.ObstacleLayer, detail.Z);
            if (!arms.Add((cell.SourceBomb, detail.Direction)) ||
                cell.Participant != bomb.Owner.Value || cell.SourceLife != bomb.SourceLife.Value ||
                cell.SourceLifeGeneration != bomb.SourceLifeGeneration.Value || cell.ChainId != bomb.ChainId.Value ||
                detail.Family != Family(bomb).ToHex() || detail.Occurred != bomb.ExplodedAtTick.Value ||
                address.Section != cell.Write.SectionKey || address.Offset != cell.Write.CellOffset)
                throw new InvalidOperationException("Terrain frame lost its exact traversal/source owner.");
            if (cell.Kind == BomberVoxelIntentKind.DestroySoft)
                bomb.ValidateTerrainFrontier(detail.X, detail.Z, detail.Direction, detail.Remaining);
            else if (detail.Remaining != 0)
                throw new InvalidOperationException("Barrel traversal must terminate at its exact cell.");
        }
    }

    private static void PreflightTraversalBatch(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        bool hasTraversal = false;
        for (int i = 0; i < runtime.PendingKinds.Count; i++)
            if (IsTraversalKind(runtime.PendingKinds[i])) { hasTraversal = true; break; }
        if (hasTraversal &&
            (runtime.PendingVoxelTransactionIds.Count != 1 || runtime.PendingVoxelTransactionIds[0].Length != 65 ||
             !runtime.PendingVoxelTransactionIds[0].StartsWith(FormattableString.Invariant(
                $"bomber-terrain:{world.InstanceId:x16}:{world.Single<BomberMatchState>().MatchId.Value:x16}:"), StringComparison.Ordinal)))
            throw new InvalidOperationException("Pending traversal lost its exact ordinary terrain header.");
        var arms = new HashSet<(NetEntityId, int)>();
        for (int i = 0; i < runtime.PendingKinds.Count; i++)
        {
            if (!IsTraversalKind(runtime.PendingKinds[i])) continue;
            var detail = Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]);
            var source = runtime.PendingSourceBombs[i];
            if (!world.IsLive(source) || !world.TypeOf(source).Is<BomberBombEntity>())
                throw new InvalidOperationException("Pending terrain traversal lost its exact bomb.");
            var bomb = world.Get<BomberBombState>(source);
            bomb.ValidateStorage();
            bomb.RequireTraversalPending(detail.X, detail.Z, detail.Direction);
            var address = Address(BomberConfigBinding.For(world).Map, detail.X,
                BomberConfigBinding.For(world).Map.ObstacleLayer, detail.Z);
            if (!arms.Add((source, detail.Direction)) ||
                runtime.PendingParticipants[i] != bomb.Owner.Value || runtime.PendingSourceLives[i] != bomb.SourceLife.Value ||
                runtime.PendingSourceLifeGenerations[i] != bomb.SourceLifeGeneration.Value ||
                runtime.PendingChainIds[i] != bomb.ChainId.Value || detail.Family != Family(bomb).ToHex() ||
                detail.Occurred != bomb.ExplodedAtTick.Value || address.Section != runtime.PendingSections[i] ||
                address.Offset != runtime.PendingCellOffsets[i] ||
                Enumerable.Range(0, bomb.TerrainContinuations.Count).Any(j =>
                    Decode<BomberTerrainContinuation>(bomb.TerrainContinuations[j]).Direction == detail.Direction))
                throw new InvalidOperationException("Pending terrain traversal differs from its exact source/cell.");
            if (runtime.PendingKinds[i] == (int)BomberVoxelIntentKind.DestroySoft)
                bomb.ValidateTerrainFrontier(detail.X, detail.Z, detail.Direction, detail.Remaining);
            else if (detail.Remaining != 0)
                throw new InvalidOperationException("Barrel pending traversal must terminate at its exact cell.");
            _ = bomb.PackTraversal(bomb.TraversalDistance(detail.X, detail.Z, detail.Direction), BomberBombState.TraversalReady);
            _ = Encode(new BomberTerrainContinuation(detail.X, detail.Z, detail.Direction,
                detail.Remaining, detail.Family, detail.Occurred));
        }
    }

    private static void RejectTraversalBatch(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        for (int i = 0; i < runtime.PendingKinds.Count; i++)
        {
            if (!IsTraversalKind(runtime.PendingKinds[i])) continue;
            var detail = Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]);
            var bomb = world.Get<BomberBombState>(runtime.PendingSourceBombs[i]);
            bomb.CommitTraversalProgress(detail.Direction,
                bomb.PackTraversal(bomb.TraversalDistance(detail.X, detail.Z, detail.Direction), BomberBombState.TraversalFinished));
        }
    }

    internal static void ValidateTraversalOwners(World world)
    {
        // Call only at the restored/next-frame quiescent cut. During ProcessorPlan
        // a Ready arm may be about to receive its row; a Pending owner may be in
        // this frame's not-yet-staged cohort. OnHydrate is entity-by-entity.
        var runtime = world.Single<BomberWorldRuntime>();
        runtime.ValidatePending(BomberConfigBinding.For(world), world.Single<BomberMatchState>().MatchId.Value);
        var owners = new HashSet<(NetEntityId, int)>();
        for (int i = 0; i < runtime.PendingKinds.Count; i++)
        {
            if (!IsTraversalKind(runtime.PendingKinds[i])) continue;
            var detail = Decode<BomberTerrainDetail>(runtime.TerrainPendingDetails[i]);
            if (!owners.Add((runtime.PendingSourceBombs[i], detail.Direction)))
                throw new InvalidOperationException("Pending traversal has duplicate exact owners.");
        }
        PreflightTraversalBatch(world);
        foreach (var bomb in world.Each<BomberBombState>())
        {
            bomb.ValidateStorage();
            if (bomb.TraversalPower.Value < 0) continue;
            for (int direction = 0; direction < 4; direction++)
            {
                bool pending = owners.Contains((bomb.Entity, direction));
                int rows = Enumerable.Range(0, bomb.TerrainContinuations.Count).Count(i =>
                    Decode<BomberTerrainContinuation>(bomb.TerrainContinuations[i]).Direction == direction);
                int state = bomb.TraversalArms[direction] % 4;
                if (state == BomberBombState.TraversalPending ? (!pending || rows != 0) :
                    state == BomberBombState.TraversalReady ? (pending || rows != 1) : (pending || rows != 0))
                    throw new InvalidOperationException("Bomb terrain traversal arm lost its complete quiescent owner.");
            }
        }
    }

    private static void ValidateReward(World world, BomberTerrainReward row, bool accepted = false)
    {
        _ = Parse(row.Participant, world); _ = Parse(row.Life, world); _ = Parse(row.Bomb, world); _ = Parse(row.Family, world);
        var config = BomberConfigBinding.For(world);
        ulong currentMatch = world.Single<BomberMatchState>().MatchId.Value;
        // A staged receipt belongs to this match. An already accepted transfer debt
        // retains its original match until it actually materializes, including rollover.
        if (row.Match == 0 || row.Match > currentMatch || (!accepted && row.Match != currentMatch) || row.Generation == 0 ||
            row.Occurred > world.Tick || row.Transaction.Length == 0 || row.Index is < 0 or >= MaxDestructions * 4 ||
            row.X < 0 || row.X >= config.Map.Width || row.Z < 0 || row.Z >= config.Map.Depth ||
            !config.Tables.PickupKinds.Rows.Any(r => r.KindCode == row.Kind) ||
            ((row.Kind == (int)BomberPickupKind.Skill) != (row.Skill != 0)) ||
            (row.Skill != 0 && !config.Tables.Skills.Rows.Any(r => r.Id == row.Skill)))
            throw new InvalidOperationException("Incomplete terrain reward source or configured content identity.");
    }
}
