using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Lumio.Bomber.Gameplay;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Client.Bot;
using Lumio.Client.Gameplay.ECS;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Bots;

/// <summary>
/// Drives one real client through the fourteen-step Bomber tour. Evidence comes from the
/// replica, rather than from issued-command acknowledgements: commands only provide input and
/// every assertion is backed by an observed component transition.
/// </summary>
public sealed class BomberMatchScenario : BotScenario
{
    private const string WorldType = "world";
    private const string PlayerType = "player";
    private const string BombType = "bomberBomb";
    private const string ParticipantType = "bomberParticipant";
    internal static readonly string HealthAttributeId = BomberPlayObservation.CurrentAttribute(BomberAttributeNames.HealthPoints);

    private readonly Observation observed = new();
    private readonly int expectedPlayers;
    private readonly uint[] characters;
    private int? lastSelectionTick;
    private ulong? previousHealth;
    private string? previousHealthLife;
    private string? previousLife;
    private ulong previousLifeGeneration;
    private string? participantId;
    private ulong firstMatchId;
    private ulong currentMatchId;
    private string? roomId;
    private bool roomStayedSame = true;
    private int? lastBombCommandTick;
    private const int BombEvidenceLimit = 256;
    private readonly Dictionary<string, (ulong Chain, ulong Tick)> bombEvidence = new(StringComparer.Ordinal);
    private readonly HashSet<string> firstMatchRoster = new(StringComparer.Ordinal);
    private bool bombEvidenceOverflow;
    private bool bombEvidenceContradiction;
    private bool movedForSecondBomb;
    private bool nextMatchPhaseObserved;
    private ulong nextMatchCandidateId;
    private ulong? firstEndTick;
    private int? firstEndReason;
    private string? firstWinner;
    private int? firstSurvivorCount;
    private ulong instanceId;
    private string? worldIdentity;
    private int currentPhase = -1;
    private string? lastDiagnostic;
    private ulong sequence;
    private string? witnessedDeadLife;
    private ulong witnessedDeathTick;

    /// <summary>Loads the same selected player count as the bot host.</summary>
    public BomberMatchScenario() : this(BomberConfigBinding.Read(
        Environment.GetEnvironmentVariable(BomberAdmissionScenario.ConfigDirectoryVariable)
        ?? throw new InvalidOperationException("BOMBER_MATCH_CONFIG_REQUIRED"))) { }

    private BomberMatchScenario(IBomberConfig config) : this(config.Game.PlayerCount,
        System.Linq.Enumerable.Select(config.Tables.Characters.Rows, row => row.Id).ToArray()) { }

    internal BomberMatchScenario(int expectedPlayers, uint[]? characters = null)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(expectedPlayers);
        this.expectedPlayers = expectedPlayers;
        this.characters = characters ?? Array.Empty<uint>();
    }

    /// <inheritdoc />
    public override BotStepResult Step(in BotDriverContext context)
    {
        BotWorldView world = context.World;
        if (!world.Bound)
            return BotStepResult.Continue;

        BotSelfBinding self = world.Self;
        bool playerView = world.HasSelf && self.EntityType == PlayerType;
        if (world.HasSelf)
        {
            bool validSelf = NetEntityId.TryParse(self.NetEntityId, out NetEntityId selfId)
                && !selfId.IsDefault && (playerView
                    || self.EntityType == ParticipantType && self.NetEntityId == participantId);
            if (!validSelf || string.IsNullOrWhiteSpace(self.RoomId)) return BotStepResult.Continue;
            roomId ??= self.RoomId;
            if (instanceId == 0) instanceId = selfId.InstanceId;
            observed.SelfBound = true;
            roomStayedSame &= string.Equals(roomId, self.RoomId, StringComparison.Ordinal) && instanceId == selfId.InstanceId;
            observed.SameRoom = roomStayedSame;
        }
        if (!observed.SameRoom || roomId is null) return BotStepResult.Continue;

        BotVisibleEntity worldEntity = world.WorldEntity;
        if (worldEntity.Found && string.Equals(worldEntity.EntityType, WorldType, StringComparison.Ordinal)
            && NetEntityId.TryParse(worldEntity.NetEntityId, out NetEntityId worldId)
            && !worldId.IsDefault && worldId.InstanceId == instanceId
            && (worldIdentity is null || worldIdentity == worldEntity.NetEntityId))
        {
            worldIdentity = worldEntity.NetEntityId;
            ObserveWorld(world, worldEntity.NetEntityId);
        }

        ObserveDeath(world);
        if (playerView) ObservePlayer(world, self.NetEntityId);
        ObserveBombs(world);
        if (playerView) TryIssueInputs(context, world, observed.MatchActive, observed.OwnBombVisible);
        var participants = new List<object>();
        foreach (BotVisibleEntity entity in world.VisibleEntities.All)
            if (entity.EntityType == ParticipantType)
                participants.Add(new
                {
                    id = entity.NetEntityId,
                    slot = TryReadInt(world, entity.NetEntityId, "BomberParticipantState.slot", out int slot) ? (int?)slot : null,
                    matchId = TryReadUInt(world, entity.NetEntityId, "BomberParticipantState.matchId", out ulong id) ? (ulong?)id : null,
                    life = ReadEntityId(world, entity.NetEntityId, "BomberParticipantState.currentLife"),
                    lifePhase = TryReadInt(world, entity.NetEntityId, "BomberParticipantState.lifePhase", out int lifePhase) ? (int?)lifePhase : null,
                    deathTick = TryReadUInt(world, entity.NetEntityId, "BomberParticipantState.deathTick", out ulong deathTick) ? (ulong?)deathTick : null,
                });
        ulong? visibleHealth = playerView && TryReadUInt(world, self.NetEntityId, HealthAttributeId, out ulong hp) ? hp : null;
        string diagnostic = $"{currentMatchId}/{currentPhase}/{world.HasSelf}/{self.NetEntityId}/{participants.Count}/{visibleHealth}/{observed.Respawned}/{observed.RankingValid}";
        if (lastDiagnostic != diagnostic)
        {
            lastDiagnostic = diagnostic;
            Console.WriteLine("BOMBER_MATCH_READ " + JsonSerializer.Serialize(new
            {
                ownerTick = context.Tick, matchId = currentMatchId, phase = currentPhase, world.HasSelf, world.InputEnabled,
                self = self.NetEntityId, participantId, observed.MatchJoined, observed.Respawned,
                observed.MatchEnded, observed.RankingValid, observed.NextMatchStarted, participants,
                health = visibleHealth,
                lifeGeneration = playerView && TryReadUInt(world, self.NetEntityId, "BomberPlayerState.lifeGeneration", out ulong lifeGeneration)
                    ? (ulong?)lifeGeneration : null,
            }));
        }

        return observed.Complete ? BotStepResult.Complete : BotStepResult.Continue;
    }

    /// <inheritdoc />
    public override void Assert(in BotDriverContext context, BotAssertionSink sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        sink.That(observed.BaseMapObserved, "basemap_observed");
        sink.That(observed.MatchJoined, "match_joined");
        sink.That(observed.SelfBound, "self_bound");
        sink.That(observed.FirstBombPlaced, "first_bomb_place");
        sink.That(observed.BombDetonated, "bomb_detonated");
        sink.That(observed.ChainResolved, "chain_resolved");
        sink.That(observed.DamageApplied, "damage_applied");
        sink.That(observed.Respawned, "respawned");
        sink.That(observed.FinalCircleStarted, "final_circle_started");
        sink.That(observed.MatchEnded, "match_ended");
        sink.That(observed.RankingValid, "ranking_valid");
        sink.That(observed.NextMatchStarted, "next_match_started");
        sink.That(observed.SameRoom, "same_room");
    }

    private void ObserveWorld(BotWorldView world, string worldId)
    {
        // The authored floor at (0,0,0) is block 1022 in section 0, cell 0.
        ReplicaVoxelCell floor = world.Voxels[0, 0];
        observed.BaseMapObserved |= floor.HasBlockId && floor.SectionRevision > 0 && (floor.BlockId >> 8) == 1022;
        if (TryReadInt(world, worldId, "BomberMatchState.phase", out int observedPhase)) currentPhase = observedPhase;
        if (!TryReadUInt(world, worldId, "BomberMatchState.matchId", out ulong matchId) || matchId == 0)
            return;

        currentMatchId = matchId;
        if (firstMatchId == 0)
            firstMatchId = matchId;
        bool firstMatch = matchId == firstMatchId;

        if (TryReadInt(world, worldId, "BomberMatchState.phase", out int phase))
        {
            currentPhase = phase;
            if (firstMatch)
            {
                observed.FinalCircleStarted |= phase == (int)BomberMatchPhase.FinalCircle;
                observed.MatchEnded |= phase == (int)BomberMatchPhase.Podium;
            }
            else if (matchId > firstMatchId)
            {
                nextMatchCandidateId = matchId;
                nextMatchPhaseObserved = observed.MatchEnded && observed.RankingValid
                    && (phase == (int)BomberMatchPhase.Warmup || phase == (int)BomberMatchPhase.Running);
            }
            observed.MatchActive = phase is (int)BomberMatchPhase.Warmup
                or (int)BomberMatchPhase.Running or (int)BomberMatchPhase.FinalCircle;
        }
        if (firstMatch && TryReadUInt(world, worldId, "BomberMatchState.endTick", out ulong endTick) && endTick > 0)
        {
            observed.MatchEnded = true;
            firstEndTick = endTick;
            if (TryReadInt(world, worldId, "BomberMatchState.endReason", out int reason))
                firstEndReason = reason;
            ReplicaFieldObservation winner = world.Fields[worldId, "BomberMatchState.winner"];
            if (Matches(world, worldId, "BomberMatchState.winner", winner) && winner.Value.Kind == "netEntityId")
                firstWinner = winner.Value.Text;
            if (TryReadInt(world, worldId, "BomberMatchState.survivorCount", out int survivors))
                firstSurvivorCount = survivors;
        }
        if (firstMatch && TryReadUInt(world, worldId, "BomberFinalCircleState.triggerTick", out ulong triggerTick))
            observed.FinalCircleStarted |= triggerTick > 0;

        if (TryReadUInt(world, worldId, "BomberResults.publishedGeneration", out ulong generation)
            && generation > 0)
            observed.RankingValid |= firstEndTick is > 0 && firstEndReason.HasValue
                && firstWinner is not null && firstSurvivorCount.HasValue
                && firstMatchRoster.Count == expectedPlayers
                && ReadValidRanking(world, worldId, firstMatchId, expectedPlayers,
                    firstEndTick.Value, firstEndReason.Value, firstWinner, firstSurvivorCount.Value,
                    firstMatchRoster);
    }

    private void ObservePlayer(BotWorldView world, string selfId)
    {
        string? participant = ReadEntityId(world, selfId, "BomberPlayerState.participant");
        if (participant is null || firstMatchId == 0)
            return;
        if (!IsVisible(world, participant, ParticipantType)
            || !TryReadUInt(world, participant, "BomberParticipantState.matchId", out ulong participantMatch))
            return;
        string? currentLife = ReadEntityId(world, participant, "BomberParticipantState.currentLife");
        if (currentMatchId > firstMatchId)
        {
            observed.NextMatchStarted |= nextMatchPhaseObserved && nextMatchCandidateId == currentMatchId
                && participantMatch == currentMatchId
                && string.Equals(participant, participantId, StringComparison.Ordinal)
                && string.Equals(currentLife, selfId, StringComparison.Ordinal)
                && TryReadUInt(world, selfId, "BomberPlayerState.lifeGeneration", out ulong nextGeneration)
                && IsCurrentGeneration(previousLife, previousLifeGeneration, selfId, nextGeneration)
                && TryReadInt(world, selfId, "BomberPlayerState.lifePhase", out int nextPhase)
                && nextPhase is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable;
            return;
        }
        if (participantMatch != firstMatchId || currentMatchId != firstMatchId
            || participantId is not null && !string.Equals(participantId, participant, StringComparison.Ordinal))
            return;
        participantId ??= participant;
        if (TryReadInt(world, selfId, "BomberPlayerState.lifePhase", out int lifePhase)
            && lifePhase is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable)
            observed.MatchJoined = true;

        if (TryReadUInt(world, selfId, HealthAttributeId, out ulong health))
        {
            if (previousHealthLife == selfId && previousHealth is { } before && health < before)
                observed.DamageApplied = true;
            previousHealth = health;
            previousHealthLife = selfId;
        }

        if (currentLife is not null && string.Equals(currentLife, selfId, StringComparison.Ordinal))
        {
            if (TryReadUInt(world, selfId, "BomberPlayerState.lifeGeneration", out ulong generation)
                && generation > 0)
            {
                if (IsDistinctSuccessor(previousLife, currentLife) && generation > previousLifeGeneration
                    && witnessedDeadLife == previousLife && witnessedDeathTick > 0
                    && TryReadInt(world, selfId, "BomberPlayerState.lifePhase", out int successorPhase)
                    && successorPhase is (int)BomberLifePhase.Protected or (int)BomberLifePhase.Vulnerable
                    && TryReadUInt(world, selfId, HealthAttributeId, out ulong successorHealth) && successorHealth > 0)
                    observed.Respawned = true;
                if (previousLife is null || previousLife == currentLife || observed.Respawned)
                {
                    previousLife = currentLife;
                    previousLifeGeneration = generation;
                }
            }
        }
    }

    private void ObserveDeath(BotWorldView world)
    {
        if (participantId is null || currentMatchId != firstMatchId || previousLife is null) return;
        if (TryReadUInt(world, participantId, "BomberParticipantState.matchId", out ulong matchId) && matchId == firstMatchId
            && TryReadInt(world, participantId, "BomberParticipantState.lifePhase", out int phase)
            && phase is (int)BomberLifePhase.AwaitingRespawn or (int)BomberLifePhase.Eliminated
            && TryReadUInt(world, participantId, "BomberParticipantState.deathTick", out ulong tick) && tick > 0
            && ReadEntityId(world, participantId, "BomberParticipantState.lastLife") == previousLife)
        {
            witnessedDeadLife = previousLife;
            witnessedDeathTick = tick;
        }
    }

    private void ObserveBombs(BotWorldView world)
    {
        observed.OwnBombVisible = false;
        if (participantId is null || currentMatchId != firstMatchId)
            return;
        foreach (BotVisibleEntity entity in world.VisibleEntities.All)
            if (entity.EntityType == ParticipantType
                && TryReadUInt(world, entity.NetEntityId, "BomberParticipantState.matchId", out ulong matchId)
                && matchId == firstMatchId)
            {
                if (firstMatchRoster.Count <= expectedPlayers)
                    firstMatchRoster.Add(entity.NetEntityId);
            }
        foreach (BotVisibleEntity entity in world.VisibleEntities.All)
        {
            if (!string.Equals(entity.EntityType, BombType, StringComparison.Ordinal))
                continue;
            string? owner = ReadEntityId(world, entity.NetEntityId, "BomberBombState.owner");
            bool own = string.Equals(owner, participantId, StringComparison.Ordinal);
            if (own)
            {
                observed.FirstBombPlaced = true;
                if (TryReadInt(world, entity.NetEntityId, "BomberBombState.phase", out int bombPhase)
                    && bombPhase == (int)BomberBombPhase.Fuse)
                    observed.OwnBombVisible = true;
            }
            if (TryReadUInt(world, entity.NetEntityId, "BomberBombState.explodedAtTick", out ulong exploded)
                && exploded > 0)
            {
                if (own) observed.BombDetonated = true;
                if (bombEvidenceOverflow || bombEvidenceContradiction)
                    continue;
                if (!TryReadUInt(world, entity.NetEntityId, "BomberBombState.chainId", out ulong chainId)
                    || chainId == 0)
                    continue;
                if (bombEvidence.TryGetValue(entity.NetEntityId, out var prior))
                {
                    if (prior != (chainId, exploded))
                    {
                        bombEvidenceContradiction = true;
                        observed.ChainResolved = false;
                    }
                    continue;
                }
                if (observed.ChainResolved) continue;
                if (bombEvidence.Count == BombEvidenceLimit)
                {
                    bombEvidenceOverflow = true;
                    bombEvidence.Clear();
                    continue;
                }
                string? witness = null;
                foreach (var other in bombEvidence)
                    if (other.Value == (chainId, exploded))
                    {
                        witness = other.Key;
                        observed.ChainResolved = true;
                        break;
                    }
                if (witness is not null)
                {
                    var first = bombEvidence[witness];
                    bombEvidence.Clear();
                    bombEvidence.Add(witness, first);
                }
                bombEvidence.Add(entity.NetEntityId, (chainId, exploded));
            }
        }
    }

    private void TryIssueInputs(in BotDriverContext context, BotWorldView world, bool matchActive, bool ownBombVisible)
    {
        if (!world.InputEnabled) return;
        int tick = context.Tick;
        if (characters.Length > 0 && currentPhase is (int)BomberMatchPhase.WaitingForWorldReady or (int)BomberMatchPhase.Warmup or (int)BomberMatchPhase.Results
            && (lastSelectionTick is null || (long)tick - lastSelectionTick.Value >= 2)
            && TryReadInt(world, world.Self.NetEntityId, "BomberPlayerState.participantIndex", out int slot) && slot >= 0)
        {
            uint selected = characters[slot % characters.Length];
            if ((!TryReadUInt(world, world.Self.NetEntityId, "BomberSkillState.characterId", out ulong character) || character != selected)
                && (!TryReadUInt(world, world.Self.NetEntityId, "BomberPlayerState.nextCharacterId", out ulong pending) || pending != selected)
                && IssueActivate(in context, "SelectCharacterAbility", [selected.ToString(System.Globalization.CultureInfo.InvariantCulture)]))
                lastSelectionTick = tick;
        }
        if (!matchActive) return;
        if (IsBombDue(tick, lastBombCommandTick))
        {
            if (IssueActivate(in context, "PlaceBombAbility", Array.Empty<string>()))
                lastBombCommandTick = tick;
        }

        // Stay on the planted cell until the replica proves a life transition. This lets the
        // authoritative fuse damage the bot enough to exercise the respawn step; movement then
        // resumes so the later match can continue normally.
        if (observed.FirstBombPlaced && !movedForSecondBomb && ownBombVisible)
        {
            string right = ((int)BomberDirection.Right).ToString(System.Globalization.CultureInfo.InvariantCulture);
            movedForSecondBomb = IssueActivate(in context, "MoveAbility", new[] { right, "0", "true" });
        }
        else if (observed.Respawned && tick % 8 == 0)
        {
            string direction = ((tick / 8) % 2 == 0 ? (int)BomberDirection.Right : (int)BomberDirection.Left)
                .ToString(System.Globalization.CultureInfo.InvariantCulture);
            _ = IssueActivate(in context, "MoveAbility", new[] { direction, "0", "true" });
        }
    }

    private bool IssueActivate(in BotDriverContext context, string member, IReadOnlyList<string> args)
    {
        foreach (BotInputTerm term in context.Vocabulary.AvailableTerms)
        {
            if (term.Kind != BotInputKind.Activate || !string.Equals(term.Member, member, StringComparison.Ordinal))
                continue;
            BotIssuedCommand command = BotIssuedCommand.Activate(member, args, ++sequence);
            return context.Issue(in command).Accepted;
        }
        return false;
    }

    internal static bool IsBombDue(int tick, int? lastTick) =>
        lastTick is null || (long)tick - lastTick.Value >= 20;

    internal static bool IsDistinctSuccessor(string? previousLife, string? currentLife) =>
        NetEntityId.TryParse(previousLife ?? string.Empty, out NetEntityId previous)
        && NetEntityId.TryParse(currentLife ?? string.Empty, out NetEntityId current)
        && previous.Counter != 0 && current.Counter != 0
        && previous.InstanceId == current.InstanceId && previous != current;

    internal static bool IsCurrentGeneration(string? oldLife, ulong oldGeneration, string newLife,
        ulong newGeneration) => newGeneration > 0
        && (oldLife == newLife ? newGeneration == oldGeneration
            : IsDistinctSuccessor(oldLife, newLife) && newGeneration > oldGeneration);

    private bool ReadValidRanking(BotWorldView world, string worldId, ulong matchId, int expectedPlayers,
        ulong endTick, int endReason, string winner, int survivorCount, IReadOnlySet<string> roster)
    {
        string[] headers = { "retainedMatchIds", "endTicks", "endReasons", "winnerParticipants", "survivorCounts" };
        string[] columns = { "matchIds", "participants", "lives", "lifeGenerations", "slots", "ranks",
            "survived", "finalHats", "eliminatedTicks", "characters", "kills", "bombs",
            "destroyedBlocks", "pickups", "bestChains", "peakHats", "skillCasts", "evolutions", "hatKingTicks" };
        var values = new Dictionary<string, IReadOnlyList<ReplicaFieldValue>>(StringComparer.Ordinal);
        foreach (string name in headers)
            if (!ReadList(world, worldId, name, out IReadOnlyList<ReplicaFieldValue>? items))
                return false;
            else values[name] = items;
        int matches = values["retainedMatchIds"].Count;
        if (matches is < 1 or > 2)
            return false;
        foreach (string name in headers)
            if (values[name].Count != matches)
                return false;
        foreach (string name in columns)
            if (!ReadList(world, worldId, name, out IReadOnlyList<ReplicaFieldValue>? items)
                || items.Count != matches * expectedPlayers)
                return false;
            else values[name] = items;
        return NetEntityId.TryParse(worldId, out NetEntityId worldIdentity)
            && ValidRankingRows(values, matchId, expectedPlayers, worldIdentity.InstanceId,
                endTick, endReason, winner, survivorCount, roster);
    }

    internal static bool ValidRankingRows(IReadOnlyDictionary<string, IReadOnlyList<ReplicaFieldValue>> values,
        ulong matchId, int expectedPlayers, ulong instanceId, ulong? observedEndTick = null,
        int? observedEndReason = null, string? observedWinner = null, int? observedSurvivorCount = null,
        IReadOnlySet<string>? observedRoster = null)
    {
        var retained = values["retainedMatchIds"];
        var matchIds = values["matchIds"];
        var participants = values["participants"];
        var lives = values["lives"];
        var slots = values["slots"];
        var ranks = values["ranks"];
        bool found = false;
        for (int m = 0; m < retained.Count; m++)
        {
            if (retained[m].Magnitude is not { } id || id == 0 ||
                (m > 0 && retained[m - 1].Magnitude >= id) ||
                values["endTicks"][m].Magnitude is not { } endTick || endTick == 0 ||
                values["endReasons"][m].WholeNumber is not { } endReason ||
                endReason < (int)BomberEndReason.LastSurvivor || endReason > (int)BomberEndReason.TimeLimit ||
                !NetEntityId.TryParse(values["winnerParticipants"][m].Text ?? string.Empty, out NetEntityId winner) ||
                (!winner.IsDefault && (winner.Counter == 0 || winner.InstanceId != instanceId)) ||
                values["survivorCounts"][m].WholeNumber is not { } survivors ||
                survivors < 0 || survivors > expectedPlayers)
                return false;
            var seenSlots = new HashSet<long>();
            var seenParticipants = new HashSet<NetEntityId>();
            var seenLives = new HashSet<NetEntityId>();
            long previousRank = 0;
            bool previousSurvived = true;
            long previousHats = 0;
            ulong previousEliminated = 0;
            int actualSurvivors = 0;
            int lastEliminations = 0;
            bool validWinner = false;
            for (int n = 0; n < expectedPlayers; n++)
            {
                int row = m * expectedPlayers + n;
                if (matchIds[row].Magnitude != id ||
                    !NetEntityId.TryParse(participants[row].Text ?? string.Empty, out NetEntityId participant) ||
                    participant.Counter == 0 || participant.InstanceId != instanceId || !seenParticipants.Add(participant) ||
                    !NetEntityId.TryParse(lives[row].Text ?? string.Empty, out NetEntityId life) ||
                    life.Counter == 0 || life.InstanceId != instanceId || !seenLives.Add(life) ||
                    slots[row].WholeNumber is not { } slot || slot < 0 || slot >= expectedPlayers || !seenSlots.Add(slot) ||
                    ranks[row].WholeNumber is not { } rank || rank < previousRank || rank < 1 || rank > expectedPlayers ||
                    values["lifeGenerations"][row].Magnitude is not > 0 ||
                    values["survived"][row].Boolean is not { } survived)
                    return false;
                if ((rank != previousRank && rank != n + 1) ||
                    values["eliminatedTicks"][row].Magnitude is not { } eliminated ||
                    values["finalHats"][row].WholeNumber is not { } hats || hats < 0 || hats > int.MaxValue ||
                    !Nonnegative(values["characters"][row]) ||
                    !Nonnegative(values["kills"][row]) || !Nonnegative(values["bombs"][row]) ||
                    !Nonnegative(values["destroyedBlocks"][row]) || !Nonnegative(values["pickups"][row]) ||
                    !Nonnegative(values["bestChains"][row]) || !Nonnegative(values["peakHats"][row]) ||
                    !Nonnegative(values["skillCasts"][row]) || !Nonnegative(values["evolutions"][row]) ||
                    values["hatKingTicks"][row].Magnitude is null)
                    return false;
                if (survived ? eliminated != 0 : eliminated == 0 || eliminated > endTick)
                    return false;
                if (n > 0)
                {
                    bool tied = previousSurvived && survived ? previousHats == hats
                        : !previousSurvived && !survived && previousEliminated == eliminated;
                    if ((!previousSurvived && survived) || (rank == previousRank) != tied ||
                        (previousSurvived && survived && previousHats < hats) ||
                        (!previousSurvived && !survived && previousEliminated < eliminated))
                        return false;
                }
                if (survived) actualSurvivors++;
                else if (eliminated == endTick) lastEliminations++;
                if (participant == winner && survived && rank == 1) validWinner = true;
                previousRank = rank;
                previousSurvived = survived;
                previousHats = hats;
                previousEliminated = eliminated;
            }
            bool validReason = (BomberEndReason)endReason switch
            {
                BomberEndReason.LastSurvivor => actualSurvivors == 1 && validWinner &&
                    (expectedPlayers == 1 || lastEliminations > 0),
                BomberEndReason.SimultaneousElimination => actualSurvivors == 0 && winner.IsDefault && lastEliminations >= 2,
                BomberEndReason.TimeLimit => actualSurvivors >= 2 && validWinner,
                _ => false,
            };
            if (actualSurvivors != survivors || !validReason) return false;
            if (id == matchId && (observedEndTick.HasValue && endTick != observedEndTick.Value
                || observedEndReason.HasValue && endReason != observedEndReason.Value
                || observedWinner is not null && winner.ToHex() != observedWinner
                || observedSurvivorCount.HasValue && survivors != observedSurvivorCount.Value
                || observedRoster is not null && (observedRoster.Count != expectedPlayers
                    || !RosterMatches(seenParticipants, observedRoster))))
                return false;
            found |= id == matchId;
        }
        return found;
    }

    private static bool RosterMatches(HashSet<NetEntityId> rows, IReadOnlySet<string> roster)
    {
        foreach (string identity in roster)
            if (!NetEntityId.TryParse(identity, out NetEntityId participant) || !rows.Contains(participant))
                return false;
        return true;
    }

    private bool ReadList(BotWorldView world, string entityId, string name,
        out IReadOnlyList<ReplicaFieldValue> items)
    {
        ReplicaFieldObservation observation = world.Fields[entityId, "BomberResults." + name];
        items = observation.Value.Items;
        return Matches(world, entityId, "BomberResults." + name, observation)
            && observation.Value.Kind == "list";
    }

    private string? ReadEntityId(BotWorldView world, string entityId, string field)
    {
        ReplicaFieldObservation observation = world.Fields[entityId, field];
        return Matches(world, entityId, field, observation) && observation.Value.Kind == "netEntityId"
            && ValidEntityId(observation.Value.Text) ? observation.Value.Text : null;
    }

    private static bool ValidEntityId(string? text) =>
        NetEntityId.TryParse(text ?? string.Empty, out NetEntityId id) && !id.IsDefault;

    private static bool Nonnegative(ReplicaFieldValue value) =>
        value.WholeNumber is >= 0 and <= int.MaxValue;

    private bool Matches(BotWorldView world, string entityId, string field,
        ReplicaFieldObservation observation) => observation.Found
        && observation.RoomId == roomId
        && observation.NetEntityId == entityId && observation.AttributeId == field;

    private static bool IsVisible(BotWorldView world, string id, string type)
    {
        foreach (BotVisibleEntity entity in world.VisibleEntities.All)
            if (entity.NetEntityId == id && entity.EntityType == type)
                return true;
        return false;
    }

    private bool TryReadUInt(BotWorldView world, string entityId, string field, out ulong value)
    {
        ReplicaFieldObservation observation = world.Fields[entityId, field];
        if (Matches(world, entityId, field, observation) && observation.Value.Magnitude is { } magnitude)
        {
            value = magnitude;
            return true;
        }
        if (Matches(world, entityId, field, observation) && observation.Value.WholeNumber is { } whole && whole >= 0)
        {
            value = (ulong)whole;
            return true;
        }
        value = 0;
        return false;
    }

    private bool TryReadInt(BotWorldView world, string entityId, string field, out int value)
    {
        if (TryReadUInt(world, entityId, field, out ulong unsigned) && unsigned <= int.MaxValue)
        {
            value = (int)unsigned;
            return true;
        }
        ReplicaFieldObservation observation = world.Fields[entityId, field];
        if (Matches(world, entityId, field, observation) && observation.Value.WholeNumber is { } whole
            && whole >= int.MinValue && whole <= int.MaxValue)
        {
            value = (int)whole;
            return true;
        }
        value = 0;
        return false;
    }

    private sealed class Observation
    {
        public bool BaseMapObserved;
        public bool MatchJoined;
        public bool SelfBound;
        public bool FirstBombPlaced;
        public bool BombDetonated;
        public bool ChainResolved;
        public bool DamageApplied;
        public bool Respawned;
        public bool FinalCircleStarted;
        public bool MatchEnded;
        public bool RankingValid;
        public bool NextMatchStarted;
        public bool SameRoom;
        public bool MatchActive;
        public bool OwnBombVisible;

        public bool Complete => BaseMapObserved && MatchJoined && SelfBound && FirstBombPlaced
            && BombDetonated && ChainResolved && DamageApplied && Respawned && FinalCircleStarted
            && MatchEnded && RankingValid && NextMatchStarted && SameRoom;
    }
}
