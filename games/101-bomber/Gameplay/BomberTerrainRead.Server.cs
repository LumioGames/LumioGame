using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;

namespace Lumio.Bomber.Gameplay;

// Derived terrain is shared by abilities and processors only within the owning tick.
internal sealed class BomberTerrainRead
{
    private ulong tick;
    private HostVoxelWorldAdapter? adapter;
    private VoxelCellQuery[]? cells;

    internal static BomberMovementTerrain? ForMovement(World world)
    {
        VoxelCellQuery[]? cells = For(world);
        return cells is null ? null : new BomberMovementTerrain(cells);
    }

    internal static VoxelCellQuery[]? For(World world)
    {
        HostVoxelWorldAdapter? adapter = VoxelGameplayBinding.Resolve(world.Manager);
        MapRow map = BomberConfigBinding.For(world).Map;
        if (adapter is null || world.Single<BomberWorldRuntime>().PendingVoxelTransactionIds.Count != 0 ||
            map.GroundLayer < 0 || map.ObstacleLayer < 0 || map.GroundLayer > 255 ||
            map.ObstacleLayer > 255 || map.Width <= 0 || map.Depth <= 0) return null;
        return ForTick(world, adapter, map);
    }

    // Called only by the terrain consumer after the complete tuple and receipt
    // section checks. Ordinary readers still wait until the debt is cleared.
    internal static VoxelCellQuery[]? ForCommittedRegeneration(World world, string transaction, VoxelMutationOutcome outcome)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        HostVoxelWorldAdapter? adapter = VoxelGameplayBinding.Resolve(world.Manager);
        MapRow map = BomberConfigBinding.For(world).Map;
        if (adapter is null || runtime.PendingVoxelTransactionIds.Count != 1 ||
            runtime.PendingVoxelTransactionIds[0] != transaction || runtime.PendingSections.Count == 0 ||
            runtime.PendingKinds.Count != runtime.PendingSections.Count ||
            Enumerable.Range(0, runtime.PendingKinds.Count).Any(index => runtime.PendingKinds[index] != (int)BomberVoxelIntentKind.Regenerate) ||
            runtime.PendingVoxelSubmittedTicks[0] >= world.Tick ||
            runtime.PendingVoxelMatchIds[0] != world.Single<BomberMatchState>().MatchId.Value ||
            outcome.Status != 0 || outcome.State != VoxelTxnState.Applied ||
            outcome.Disposition != VoxelCommitDisposition.Original || !outcome.TokenConsumed ||
            outcome.Receipt.Sections is null || outcome.Receipt.Sections.Count == 0 ||
            outcome.Receipt.OriginalReceiptBytes.IsEmpty ||
            outcome.ReceiptByteCount != outcome.Receipt.OriginalReceiptBytes.Length ||
            map.GroundLayer < 0 || map.ObstacleLayer < 0 || map.GroundLayer > 255 ||
            map.ObstacleLayer > 255 || map.Width <= 0 || map.Depth <= 0) return null;
        return ForTick(world, adapter, map);
    }

    // Persistent owners authorize observation of committed facts only. Pending
    // debt still blocks For and remains exclusively owned by the result consumer.
    internal static VoxelCellQuery[]? ForBridgeOwnerObservation(World world)
    {
        BomberIceBridges.ValidateObservationOwners(world);
        HostVoxelWorldAdapter? adapter = VoxelGameplayBinding.Resolve(world.Manager);
        MapRow map = BomberConfigBinding.For(world).Map;
        if (adapter is null || map.GroundLayer < 0 || map.ObstacleLayer < 0 || map.GroundLayer > 255 ||
            map.ObstacleLayer > 255 || map.Width <= 0 || map.Depth <= 0) return null;
        return ForTick(world, adapter, map);
    }

    // Read-only observation: cast admission validates all existing owners before any write.
    // Pending transaction debt remains owned by its Original-result consumer; this returns
    // committed Native facts without releasing, replacing or projecting that debt.
    internal static VoxelCellQuery[]? ForFavoriteOwnerObservation(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        runtime.ValidatePending(BomberConfigBinding.For(world), world.Single<BomberMatchState>().MatchId.Value);
        BomberTerrainTransactions.Validate(world);
        BomberFavoriteFireZones.ValidateObservationOwners(world);
        HostVoxelWorldAdapter? adapter = VoxelGameplayBinding.Resolve(world.Manager);
        MapRow map = BomberConfigBinding.For(world).Map;
        if (adapter is null || map.GroundLayer < 0 || map.ObstacleLayer < 0 || map.GroundLayer > 255 ||
            map.ObstacleLayer > 255 || map.Width <= 0 || map.Depth <= 0) return null;
        return ForTick(world, adapter, map);
    }

    internal static VoxelCellQuery[]? ForCommittedBridge(World world, string transaction, VoxelMutationOutcome outcome)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        runtime.ValidatePending(BomberConfigBinding.For(world), world.Single<BomberMatchState>().MatchId.Value);
        if (runtime.PendingVoxelTransactionIds.Count != 1 || runtime.PendingVoxelTransactionIds[0] != transaction ||
            runtime.PendingSections.Count == 0 || runtime.PendingVoxelSubmittedTicks[0] >= world.Tick ||
            (runtime.PendingKinds[0] != (int)BomberVoxelIntentKind.FreezeBridge && runtime.PendingKinds[0] != (int)BomberVoxelIntentKind.MeltBridge) ||
            Enumerable.Range(0, runtime.PendingKinds.Count).Any(index => runtime.PendingKinds[index] != runtime.PendingKinds[0]) ||
            outcome.Status != 0 || outcome.State != VoxelTxnState.Applied ||
            outcome.Disposition != VoxelCommitDisposition.Original || !outcome.TokenConsumed ||
            outcome.Receipt.Sections is null || outcome.Receipt.OriginalReceiptBytes.IsEmpty ||
            outcome.ReceiptByteCount != outcome.Receipt.OriginalReceiptBytes.Length) return null;
        var expected = Enumerable.Range(0, runtime.PendingSections.Count).GroupBy(index => runtime.PendingSections[index]).ToArray();
        if (outcome.Receipt.Sections.Count != expected.Length || outcome.SectionCount != expected.Length) return null;
        foreach (var section in expected)
        {
            var receipts = outcome.Receipt.Sections.Where(receipt => receipt.SectionKey == section.Key).ToArray();
            if (receipts.Length != 1 || section.Any(index => receipts[0].UpToSectionRevision <= runtime.PendingExpectedRevisions[index]))
                return null;
        }
        return ForBridgeOwnerObservation(world);
    }

    private static VoxelCellQuery[]? ForTick(World world, HostVoxelWorldAdapter adapter, MapRow map)
    {
        if (!world.TryGetService<BomberTerrainRead>(out BomberTerrainRead? frame) || frame is null)
        {
            frame = new BomberTerrainRead();
            world.AttachService(frame);
        }
        return frame.Read(world.Tick, adapter, map);
    }

    private VoxelCellQuery[]? Read(ulong currentTick, HostVoxelWorldAdapter currentAdapter, MapRow map)
    {
        if (adapter == currentAdapter && tick == currentTick) return cells;
        adapter = currentAdapter;
        tick = currentTick;
        cells = null;
        int area = checked(map.Width * map.Depth);
        var addresses = new (ulong SectionKey, int CellOffset)[checked(area * 2)];
        for (int layer = 0; layer < 2; layer++)
        for (int z = 0; z < map.Depth; z++)
        for (int x = 0; x < map.Width; x++)
        {
            int y = layer == 0 ? map.GroundLayer : map.ObstacleLayer;
            addresses[layer * area + z * map.Width + x] =
                (VoxelPackedSection.Encode(x >> 4, (byte)(y >> 4), z >> 4),
                    ((y & 15) << 8) | ((z & 15) << 4) | (x & 15));
        }
        VoxelCellQuery[] read = currentAdapter.Read(addresses);
        if (read.Length != addresses.Length) return null;
        foreach (VoxelCellQuery cell in read)
            if (!cell.HasBlockId || cell.Presence is not (VoxelPresence.Ready or VoxelPresence.Unchanged)) return null;
        cells = read;
        return cells;
    }
}
