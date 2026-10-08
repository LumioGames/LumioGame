using System;
using System.Collections.Generic;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Coordination;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public enum BomberVoxelIntentKind { Initialize = 1, DestroySoft = 2, Regenerate = 3, Clear = 4, CircleClear = 5, SpawnClear = 6, StrongChest = 7, DestroyBarrel = 8, FreezeBridge = 9, MeltBridge = 10 }

/// <summary>One cell of game intent. The engine still owns the actual mutation receipt.</summary>
public readonly record struct BomberPendingVoxelCell(VoxelWriteEntry Write, uint OldBlock,
    BomberVoxelIntentKind Kind, NetEntityId Participant, NetEntityId SourceLife, ulong SourceLifeGeneration,
    NetEntityId SourceBomb, NetEntityId Chest, ulong ChainId);

public sealed partial class BomberWorldRuntime
{
    private bool requiresActiveResumeSupport;

    internal void RequireSupportedResume()
    {
        if (requiresActiveResumeSupport && World.Manager.CompletedRestore != WorldRestoreCompletion.PairedCheckpoint)
            throw new InvalidOperationException("bomber_active_resume_unsupported: coupled active rule memory requires the complete host restore path.");
    }
    public ulong AllocateHfsmMachineKey() => Allocate(NextHfsmMachineKey);
    public ulong AllocateEventSequence() => Allocate(NextEventSequence);
    public ulong AllocateChainId() => Allocate(NextChainId);
    public ulong AllocateVoxelTransactionSequence() => Allocate(NextVoxelTransactionSequence);

    private static ulong Allocate(Sync<ulong> counter)
    {
        ulong next = checked(counter.Value + 1UL);
        counter.Value = next;
        return next;
    }

    public void SetParticipants(IReadOnlyList<NetEntityId> ids, IBomberConfig config)
    {
        ArgumentNullException.ThrowIfNull(ids);
        ArgumentNullException.ThrowIfNull(config);
        ValidateRosterShape(config);
        if (ids.Count == 0 || ids.Count > config.Game.PlayerCount)
            throw new InvalidOperationException("Participant roster must be nonempty and within capacity.");
        var seen = new HashSet<NetEntityId>();
        for (int slot = 0; slot < ids.Count; slot++)
        {
            NetEntityId id = ids[slot];
            RequireLocal(id, optional: false);
            if (!seen.Add(id)) throw new InvalidOperationException("Duplicate participant identity.");
            if (World.Get<BomberParticipantState>(id).Slot.Value != slot)
                throw new InvalidOperationException("Participant roster is not ordered by slot.");
        }
        if (ParticipantIds.Count != 0)
        {
            if (ParticipantIds.Count != ids.Count)
                throw new InvalidOperationException("An installed participant roster cannot be replaced.");
            for (int i = 0; i < ids.Count; i++)
                if (ParticipantIds[i] != ids[i])
                    throw new InvalidOperationException("An installed participant roster cannot be replaced.");
            return;
        }
        ParticipantIds.Clear();
        foreach (NetEntityId id in ids) ParticipantIds.Add(id);
    }

    /// <summary>Call after all snapshot rows have hydrated, before resumed gameplay reads the roster.</summary>
    public void ValidateRoster(IBomberConfig config)
    {
        ValidateRosterShape(config);
        for (int slot = 0; slot < ParticipantIds.Count; slot++)
            if (World.Get<BomberParticipantState>(ParticipantIds[slot]).Slot.Value != slot)
                throw new InvalidOperationException("Participant roster is not ordered by slot.");
    }

    protected override void OnHydrate()
    {
        IBomberConfig config = BomberConfigBinding.For(World);
        ValidateRosterShape(config);
        ValidateBombPlacement(config, World.Tick);
        ValidatePending(config, World.Get<BomberMatchState>(Entity).MatchId.Value);
        BomberTerrainTransactions.Validate(World);
        BomberCentralSupply.Validate(World);
        BomberRegeneration.Validate(World);
        BomberIceBridges.Validate(World);
        BomberFavoriteFireZones.Validate(World);
        requiresActiveResumeSupport = World.Get<BomberMatchState>(Entity).MatchId.Value != 0;
    }

    public void ValidateBombPlacement(IBomberConfig config, ulong currentTick)
    {
        ArgumentNullException.ThrowIfNull(config);
        int area = checked(config.Map.Width * config.Map.Depth);
        int limit = Math.Min(area, checked(config.Game.PlayerCount * config.ObjectBudgets.PlacementsPerParticipantTick));
        int count = BombPlacementCells.Count;
        if (count != BombPlacementParticipants.Count || count > limit ||
            BombPlacementTick.Value > currentTick ||
            (count == 0 && (BombPlacementTick.Value != 0 || BombPlacementMatchId.Value != 0)) ||
            (count != 0 && BombPlacementMatchId.Value == 0))
            throw new InvalidOperationException("Invalid bomb placement reservation header or count.");
        var cells = new HashSet<int>();
        var counts = new Dictionary<NetEntityId, int>();
        for (int i = 0; i < count; i++)
        {
            int cell = BombPlacementCells[i];
            NetEntityId participant = BombPlacementParticipants[i];
            RequireLocal(participant, optional: false);
            if (cell < 0 || cell >= area || !cells.Add(cell))
                throw new InvalidOperationException("Invalid or duplicate bomb placement cell.");
            counts.TryGetValue(participant, out int previous);
            if (previous >= config.ObjectBudgets.PlacementsPerParticipantTick)
                throw new InvalidOperationException("Bomb placement participant budget exceeded.");
            counts[participant] = previous + 1;
        }
    }

    public bool CanReserveBombPlacement(ulong tick, ulong matchId, int cell,
        NetEntityId participant, IBomberConfig config)
    {
        if (tick != World.Tick)
            throw new InvalidOperationException("Bomb placement reservation used another Tick.");
        ValidateBombPlacement(config, tick);
        if (matchId == 0 || matchId != World.Get<BomberMatchState>(Entity).MatchId.Value)
            throw new InvalidOperationException("Bomb placement reservation belongs to another match.");
        RequireLocal(participant, optional: false);
        int area = checked(config.Map.Width * config.Map.Depth);
        if (cell < 0 || cell >= area) return false;
        if (BombPlacementTick.Value != tick || BombPlacementMatchId.Value != matchId) return true;
        int limit = Math.Min(area, checked(config.Game.PlayerCount * config.ObjectBudgets.PlacementsPerParticipantTick));
        if (BombPlacementCells.Count >= limit) return false;
        int participantCount = 0;
        for (int i = 0; i < BombPlacementCells.Count; i++)
        {
            if (BombPlacementCells[i] == cell) return false;
            if (BombPlacementParticipants[i] == participant) participantCount++;
        }
        return participantCount < config.ObjectBudgets.PlacementsPerParticipantTick;
    }

    public void ReserveBombPlacement(ulong tick, ulong matchId, int cell,
        NetEntityId participant, IBomberConfig config)
    {
        if (!CanReserveBombPlacement(tick, matchId, cell, participant, config))
            throw new InvalidOperationException("Bomb placement cell or participant budget is reserved.");
        if (BombPlacementTick.Value != tick || BombPlacementMatchId.Value != matchId)
        {
            BombPlacementCells.Clear();
            BombPlacementParticipants.Clear();
            BombPlacementTick.Value = tick;
            BombPlacementMatchId.Value = matchId;
        }
        BombPlacementCells.Add(cell);
        BombPlacementParticipants.Add(participant);
    }

    private void ValidateRosterShape(IBomberConfig config)
    {
        ArgumentNullException.ThrowIfNull(config);
        if (config.Game.PlayerCount <= 0 || ParticipantIds.Count > config.Game.PlayerCount)
            throw new InvalidOperationException("Participant capacity exceeded.");
        var seen = new HashSet<NetEntityId>();
        for (int i = 0; i < ParticipantIds.Count; i++)
        {
            NetEntityId id = ParticipantIds[i];
            RequireLocal(id, optional: false);
            if (!seen.Add(id)) throw new InvalidOperationException("Duplicate participant identity.");
        }
    }

    public int PendingCellLimit(IBomberConfig config)
    {
        ArgumentNullException.ThrowIfNull(config);
        if (config.Map.Width <= 0 || config.Map.Depth <= 0 ||
            config.Map.GroundLayer == config.Map.ObstacleLayer)
            throw new InvalidOperationException("Invalid mapped voxel layers or dimensions.");
        return checked(config.Map.Width * config.Map.Depth * 2);
    }

    public void ValidatePending(IBomberConfig config, ulong currentMatchId)
    {
        if (currentMatchId != World.Get<BomberMatchState>(Entity).MatchId.Value)
            throw new InvalidOperationException("Pending voxel validation used the wrong match.");
        int limit = PendingCellLimit(config);
        int headers = PendingVoxelTransactionIds.Count;
        if (headers > 1 || PendingVoxelSubmittedTicks.Count != headers || PendingVoxelMatchIds.Count != headers)
            throw new InvalidOperationException("Pending voxel batch headers disagree.");
        int count = PendingSections.Count;
        if (count > limit || PendingCellOffsets.Count != count || PendingExpectedRevisions.Count != count ||
            PendingOldBlocks.Count != count || PendingNewBlocks.Count != count || PendingKinds.Count != count ||
            PendingParticipants.Count != count || PendingSourceLives.Count != count || PendingSourceLifeGenerations.Count != count ||
            PendingSourceBombs.Count != count || PendingChests.Count != count || PendingChainIds.Count != count ||
            (headers == 0) != (count == 0))
            throw new InvalidOperationException("Pending voxel columns disagree or exceed the map budget.");
        if (headers == 1 && (string.IsNullOrWhiteSpace(PendingVoxelTransactionIds[0]) ||
            PendingVoxelSubmittedTicks[0] > World.Tick ||
            System.Text.Encoding.UTF8.GetByteCount(PendingVoxelTransactionIds[0]) > World.Manager.IngressBudget.MaxBytes ||
            PendingVoxelMatchIds[0] == 0 || PendingVoxelMatchIds[0] != currentMatchId))
            throw new InvalidOperationException("Pending voxel transaction belongs to another match.");
        var keys = new HashSet<(ulong, int)>();
        for (int i = 0; i < count; i++)
        {
            if (!keys.Add((PendingSections[i], PendingCellOffsets[i])) || PendingCellOffsets[i] < 0 ||
                PendingCellOffsets[i] >= 4096 || PendingExpectedRevisions[i] == 0 ||
                !Enum.IsDefined((BomberVoxelIntentKind)PendingKinds[i]))
                throw new InvalidOperationException("Invalid or duplicate pending voxel cell.");
            RequireLocal(PendingParticipants[i], optional: true);
            RequireLocal(PendingSourceLives[i], optional: true);
            RequireSourceGeneration(PendingSourceLives[i], PendingSourceLifeGenerations[i]);
            RequireLocal(PendingSourceBombs[i], optional: true);
            RequireLocal(PendingChests[i], optional: true);
        }
    }

    /// <summary>Caller publishes the complete intent before SDK staging; confirmed rejection releases the exact header.</summary>
    public void RecordPending(string transactionId, ulong submittedTick, ulong matchId,
        IReadOnlyList<BomberPendingVoxelCell> cells, IBomberConfig config)
    {
        ValidatePendingRecord(transactionId, submittedTick, matchId, cells, config);
        // No game-level validation may fail after the first published write.
        PendingVoxelTransactionIds.Add(transactionId);
        PendingVoxelSubmittedTicks.Add(submittedTick);
        PendingVoxelMatchIds.Add(matchId);
        foreach (BomberPendingVoxelCell cell in cells)
        {
            PendingSections.Add(cell.Write.SectionKey);
            PendingCellOffsets.Add(cell.Write.CellOffset);
            PendingExpectedRevisions.Add(cell.Write.ExpectedSectionRevision);
            PendingOldBlocks.Add(cell.OldBlock);
            PendingNewBlocks.Add(cell.Write.BlockId);
            PendingKinds.Add((int)cell.Kind);
            PendingParticipants.Add(cell.Participant);
            PendingSourceLives.Add(cell.SourceLife);
            PendingSourceLifeGenerations.Add(cell.SourceLifeGeneration);
            PendingSourceBombs.Add(cell.SourceBomb);
            PendingChests.Add(cell.Chest);
            PendingChainIds.Add(cell.ChainId);
        }
    }

    internal void ValidatePendingRecord(string transactionId, ulong submittedTick, ulong matchId,
        IReadOnlyList<BomberPendingVoxelCell> cells, IBomberConfig config)
    {
        ArgumentNullException.ThrowIfNull(cells);
        if (string.IsNullOrWhiteSpace(transactionId) || submittedTick > World.Tick ||
            System.Text.Encoding.UTF8.GetByteCount(transactionId) > World.Manager.IngressBudget.MaxBytes || matchId == 0 || cells.Count == 0 ||
            cells.Count > PendingCellLimit(config))
            throw new InvalidOperationException("Invalid voxel transaction identity or cell budget.");
        ValidatePending(config, matchId);
        if (PendingVoxelTransactionIds.Count != 0)
            throw new InvalidOperationException("An unresolved voxel transaction already exists.");
        var seen = new HashSet<(ulong, int)>();
        foreach (BomberPendingVoxelCell cell in cells)
        {
            if (!seen.Add((cell.Write.SectionKey, cell.Write.CellOffset)) ||
                cell.Write.CellOffset < 0 || cell.Write.CellOffset >= 4096 ||
                cell.Write.ExpectedSectionRevision == 0 || !Enum.IsDefined(cell.Kind))
                throw new InvalidOperationException("Invalid or duplicate voxel cell.");
            RequireLocal(cell.Participant, optional: true);
            RequireLocal(cell.SourceLife, optional: true);
            RequireSourceGeneration(cell.SourceLife, cell.SourceLifeGeneration);
            RequireLocal(cell.SourceBomb, optional: true);
            RequireLocal(cell.Chest, optional: true);
        }
    }

    /// <summary>Only the single settlement owner calls this after a definitive SDK outcome.</summary>
    public void ClearPending(string transactionId, IBomberConfig config, ulong matchId)
    {
        ValidatePending(config, matchId);
        if (PendingVoxelTransactionIds.Count != 1 ||
            !StringComparer.Ordinal.Equals(PendingVoxelTransactionIds[0], transactionId))
            throw new InvalidOperationException("No matching pending voxel transaction.");
        PendingSections.Clear(); PendingCellOffsets.Clear(); PendingExpectedRevisions.Clear();
        PendingOldBlocks.Clear(); PendingNewBlocks.Clear(); PendingKinds.Clear();
        PendingParticipants.Clear(); PendingSourceLives.Clear(); PendingSourceLifeGenerations.Clear(); PendingSourceBombs.Clear();
        PendingChests.Clear(); PendingChainIds.Clear();
        PendingVoxelSubmittedTicks.Clear(); PendingVoxelMatchIds.Clear(); PendingVoxelTransactionIds.Clear();
    }

    private void RequireLocal(NetEntityId id, bool optional)
    {
        if ((id == default && !optional) || (id != default && (id.Counter == 0 || id.InstanceId != Entity.InstanceId)))
            throw new InvalidOperationException("Entity identity belongs to another world.");
    }

    private static void RequireSourceGeneration(NetEntityId life, ulong generation)
    {
        if ((life == default) != (generation == 0))
            throw new InvalidOperationException("Pending voxel source life and positive generation must be present together.");
    }
}
