using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Replication.Binding;
using Lumio.GameRuntime.Simulation;
using Xunit;
using Lumio.Client.Gameplay.ECS;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class BomberJournalWireBudgetTests
{
    private const int WireLimit = 65_536;
    private const string Room = "journal-wire-room";

    [Fact]
    public void EightRealObserversReceiveCompleteBombOccurrencesWithinWireBudget()
    {
        using WorldManager manager = BomberTestWorld.Start(withMap: true);
        using EntityBindingQuery bindings = EntityBindingQuery.Create(manager);

        using var replicaFactory = new BomberJournalReplicaFactory();
        var replicas = new Dictionary<NetEntityId, IClientReplica>();
        var observed = new Dictionary<(string Match, string Sequence), string>();
        var observedByObserver = new Dictionary<NetEntityId, HashSet<(string Match, string Sequence)>>();
        var firstPublication = new Dictionary<(NetEntityId Observer, string Match, string Sequence), ulong>();
        var observerIds = new HashSet<NetEntityId>();
        var frames = new List<(ulong Tick, NetEntityId Observer, int Bytes, int JournalWrites)>();
        var latestJournal = new Dictionary<NetEntityId, HashSet<(string Match, string Sequence)>>();
        var committedStates = new List<(ulong Tick, NetEntityId Observer, HashSet<(string Match, string Sequence)> Present)>();
        void TickAndMeasure()
        {
            manager.Tick();
            foreach (WorldMessage message in manager.DrainOutbox().Frames)
            {
                if (message is WelcomeMessage welcome)
                {
                    IClientReplica replica = replicaFactory.Create();
                    replica.ResetForNewSession(new ReplicaResetRequest(1, Room));
                    Assert.True(replica.TryObserveWelcome(WireCodec.EncodePack(welcome)));
                    replicas.Add(welcome.Self, replica);
                    continue;
                }
                if (message is not WorldChangeMessage frame) continue;
                byte[] payload = WireCodec.EncodePack(frame);
                int writes = frame.Fields.Count(field => field.ComponentId == nameof(BomberPresentationJournal) && field.FieldId == "entries");
                Assert.InRange(writes, 0, 1);
                IClientReplica target = replicas[frame.ObserverId];
                ReplicaCommittedMetadata committed = target.GetSnapshot().Committed;
                ulong next = committed.Revision + 1;
                var request = new ReplicaStageRequest(committed.Generation,
                    committed.HasBaseline ? ReplicaUpdateKind.Delta : ReplicaUpdateKind.FullSnapshot,
                    committed.Baseline, committed.Revision, next, next, payload,
                    ReadOnlyMemory<ulong>.Empty, ReadOnlyMemory<ulong>.Empty);
                Assert.Equal(ReplicaStageStatus.Staged, target.StageAuthority(in request, out var handle, out _).Status);
                ReplicaOutcomeStatus outcome = target.ObserveRuntimeOutcome(handle,
                    ReplicaRuntimeOutcome.CommittedOutcome(), out _);
                Assert.True(outcome == ReplicaOutcomeStatus.Observed,
                    $"Authority tick {frame.Tick}, observer {frame.ObserverId}, outcome {outcome}: {target.GetLastApplyResult()?.Error}");
                WorldChangeApplyResult receipt = Assert.IsType<WorldChangeApplyResult>(target.GetLastApplyResult());
                Assert.True(receipt.AuthorityApplied && receipt.PredictionCompleted, receipt.Error?.ToString());
                var present = new HashSet<(string Match, string Sequence)>();
                ulong previous = 0;
                foreach (string json in replicaFactory.ReadJournal(target))
                {
                    Assert.True(json.Length <= BomberPresentationJournal.MaxEntryChars);
                    using JsonDocument parsed = JsonDocument.Parse(json);
                    JsonElement occurrence = parsed.RootElement;
                    string match = occurrence.GetProperty("matchId").GetString()!;
                    string sequence = occurrence.GetProperty("sequence").GetString()!;
                    ulong ordinal = ulong.Parse(sequence, CultureInfo.InvariantCulture);
                    Assert.True(ordinal > previous, "Journal occurrence order must be increasing.");
                    previous = ordinal;
                    var key = (match, sequence);
                    Assert.True(present.Add(key), "A committed journal repeated one occurrence identity.");
                    if (observed.TryGetValue(key, out string? earlier)) Assert.Equal(earlier, json);
                    else observed.Add(key, json);
                    if (!observedByObserver.TryGetValue(frame.ObserverId, out var received))
                        observedByObserver[frame.ObserverId] = received = new();
                    received.Add(key);
                    firstPublication.TryAdd((frame.ObserverId, match, sequence), frame.Tick);
                }
                Assert.True(present.Count <= BomberPresentationJournal.MaxEntries);
                latestJournal[frame.ObserverId] = present;
                frames.Add((frame.Tick, frame.ObserverId, payload.Length, writes));
            }
            foreach (NetEntityId observer in observerIds)
                committedStates.Add((manager.World.Tick - 1, observer,
                    latestJournal.TryGetValue(observer, out var present)
                        ? present : new HashSet<(string Match, string Sequence)>()));
        }

        for (int index = 0; index < 8; index++)
            Assert.Equal("accepted", bindings.Admit("journal-wire-" + index,
                "journal-wire-account-" + index, Room, "PlayerEntity").Outcome);
        TickAndMeasure();
        var players = new NetEntityId[8];
        for (int index = 0; index < players.Length; index++)
        {
            var binding = bindings.ResolveByConnection(Room, "journal-wire-" + index);
            Assert.Equal("ok", binding.Outcome);
            players[index] = NetEntityId.Parse(binding.Binding!.Value.NetEntityId);
            Assert.True(manager.World.IsLive(players[index]));
            Assert.True(observerIds.Add(players[index]), "Admissions must resolve distinct live observers.");
        }

        var input = new PlaceBombAbility.Input();
        int readinessTicks = 0;
        while (players.Any(player => !new PlaceBombAbility().CanActivate(input,
                   manager.World.Get<AbilityComponent>(player), out _)) && readinessTicks++ < 100)
            TickAndMeasure();
        Assert.True(readinessTicks <= 100, "Eight admitted players never became ready for real bomb input.");

        var owners = players.ToDictionary(player => player,
            player => manager.World.Get<BomberPlayerState>(player).Participant.Value);
        foreach (NetEntityId player in players)
        {
            AbilityActivateResult result = manager.World.Get<AbilityComponent>(player)
                .Activate<PlaceBombAbility, PlaceBombAbility.Input>(input);
            Assert.True(result.Succeeded, $"Bomb activation failed for {player}: {result.FailureCode}");
        }
        TickAndMeasure();
        var bombs = manager.World.Each<BomberBombState>()
            .Where(bomb => owners.ContainsKey(bomb.SourceLife.Value))
            .ToDictionary(bomb => bomb.Entity, bomb => (bomb.SourceLife.Value, bomb.Owner.Value,
                bomb.FuseEndTick.Value));
        Assert.Equal(8, bombs.Count);
        Assert.Equal(players.Length, bombs.Values.Select(bomb => bomb.Item1).Distinct().Count());
        foreach (var bomb in bombs.Values) Assert.Equal(owners[bomb.Item1], bomb.Item2);

        ulong lastFuse = bombs.Values.Max(bomb => bomb.Item3);
        while (manager.World.Tick <= lastFuse + 1) TickAndMeasure();

        foreach (NetEntityId player in players)
        {
            AbilityActivateResult result = manager.World.Get<AbilityComponent>(player)
                .Activate<PlaceBombAbility, PlaceBombAbility.Input>(input);
            Assert.True(result.Succeeded, $"Second bomb activation failed for {player}: {result.FailureCode}");
        }
        TickAndMeasure();
        foreach (BomberBombState bomb in manager.World.Each<BomberBombState>())
        {
            if (!owners.ContainsKey(bomb.SourceLife.Value) || bombs.ContainsKey(bomb.Entity)) continue;
            bombs.Add(bomb.Entity, (bomb.SourceLife.Value, bomb.Owner.Value, bomb.FuseEndTick.Value));
        }
        Assert.Equal(16, bombs.Count);
        lastFuse = bombs.Values.Max(bomb => bomb.Item3);
        while (manager.World.Tick <= lastFuse + 1) TickAndMeasure();

        var placements = Occurrences(observed, "bomb_placed", bombs, owners);
        var explosions = Occurrences(observed, "bomb_exploded", bombs, owners);
        Assert.Equal(bombs.Keys.Order(), placements.Keys.Order());
        Assert.Equal(bombs.Keys.Order(), explosions.Keys.Order());
        foreach (NetEntityId bomb in bombs.Keys)
            Assert.True(explosions[bomb].Tick >= placements[bomb].Tick,
                "An explosion must follow the matching placement.");

        ulong lastExpiryTick = Math.Max(placements.Values.Max(item => item.Tick),
            explosions.Values.Max(item => item.Tick)) + BomberPresentationJournal.RetentionTicks + 1;
        ulong finalTick = lastExpiryTick + 3;
        while (manager.World.Tick <= finalTick) TickAndMeasure();
        var expectedKeys = placements.Values.Concat(explosions.Values).Select(item => item.Key).ToHashSet();
        Assert.True(observed.Count < BomberPresentationJournal.MaxEntries,
            "The retention fixture must not trigger count-based journal eviction.");
        foreach (NetEntityId observer in observerIds)
        {
            Assert.True(observedByObserver.TryGetValue(observer, out var received),
                $"Observer {observer} received no journal publication.");
            Assert.True(expectedKeys.IsSubsetOf(received),
                $"Observer {observer} missed {expectedKeys.Except(received).Count()} bomb occurrences.");
            foreach (var occurrence in placements.Values.Concat(explosions.Values))
            {
                ulong first = firstPublication[(observer, occurrence.Key.Match, occurrence.Key.Sequence)];
                ulong retainedThrough = occurrence.Tick + BomberPresentationJournal.RetentionTicks;
                Assert.True(first <= retainedThrough,
                    $"Observer {observer} first received occurrence {occurrence.Key} after retention ended.");
                foreach (var state in committedStates.Where(item => item.Observer == observer && item.Tick >= first))
                {
                    if (state.Tick <= retainedThrough)
                        Assert.True(state.Present.Contains(occurrence.Key),
                            $"Observer {observer} lost occurrence {occurrence.Key} at tick {state.Tick} " +
                            $"after first publication at {first}; retained through {retainedThrough}. " +
                            $"Present: {string.Join(", ", state.Present)}");
                    else
                        Assert.DoesNotContain(occurrence.Key, state.Present);
                }
            }
            Assert.Contains(committedStates, state => state.Observer == observer &&
                state.Tick == finalTick && !state.Present.Overlaps(expectedKeys));
        }
        BomberPresentationJournal journal = manager.World.Single<BomberPresentationJournal>();
        for (int index = 0; index < journal.Entries.Count; index++)
            Assert.False(expectedKeys.Contains(Identity(journal.Entries[index])),
                "Expired bomb occurrences must leave the authority journal.");
        Assert.NotEmpty(frames);
        var maximum = frames.MaxBy(frame => frame.Bytes);
        int totalWrites = frames.Sum(frame => frame.JournalWrites);
        Console.WriteLine($"journal-wire peak={maximum.Bytes} tick={maximum.Tick} " +
            $"observer={maximum.Observer} peakJournalWrites={maximum.JournalWrites} " +
            $"totalJournalWrites={totalWrites} frames={frames.Count} placements={placements.Count} explosions={explosions.Count}");
        Assert.True(totalWrites > 0, "No observer received a journal field publication.");
        Assert.True(maximum.Bytes <= WireLimit,
            $"WorldChange wire budget exceeded: {maximum.Bytes} bytes at tick {maximum.Tick}, " +
            $"observer {maximum.Observer}; {totalWrites} journal writes across {frames.Count} frames.");
    }

    private static Dictionary<NetEntityId, (ulong Tick, (string Match, string Sequence) Key)> Occurrences(
        Dictionary<(string Match, string Sequence), string> observed, string kind,
        Dictionary<NetEntityId, (NetEntityId Life, NetEntityId Owner, ulong Fuse)> bombs,
        Dictionary<NetEntityId, NetEntityId> owners)
    {
        var result = new Dictionary<NetEntityId, (ulong, (string, string))>();
        foreach (var (key, json) in observed)
        {
            using JsonDocument parsed = JsonDocument.Parse(json);
            JsonElement occurrence = parsed.RootElement;
            if (occurrence.GetProperty("kind").GetString() != kind) continue;
            NetEntityId bomb = NetEntityId.Parse(occurrence.GetProperty("entityId").GetString()!);
            if (!bombs.TryGetValue(bomb, out var source)) continue;
            Assert.Equal(source.Life.ToHex(), occurrence.GetProperty("lifeId").GetString());
            Assert.Equal(owners[source.Life].ToHex(), occurrence.GetProperty("participantId").GetString());
            Assert.True(result.TryAdd(bomb, (ulong.Parse(occurrence.GetProperty("tick").GetString()!,
                CultureInfo.InvariantCulture), key)), $"Duplicate {kind} for {bomb}.");
        }
        return result;
    }

    private static (string Match, string Sequence) Identity(string json)
    {
        using JsonDocument parsed = JsonDocument.Parse(json);
        return (parsed.RootElement.GetProperty("matchId").GetString()!,
            parsed.RootElement.GetProperty("sequence").GetString()!);
    }
}
