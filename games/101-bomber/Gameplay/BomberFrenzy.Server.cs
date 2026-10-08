using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

internal static partial class BomberFrenzy
{
    internal const int PromiseByteLimit = 1024;
    internal const int PromiseCountLimit = 6;
    private const string Prefix = "frenzy:";

    internal sealed record Promise(string Token, string Life, ulong Generation, ulong Match,
        ulong Chain, int Power, int X, int Z, float Y, ulong Placed, ulong FuseEnd,
        bool CreationSubmitted, string Produced = "");

    internal static void StartFromApplied(World world, BomberHealthFacts facts)
    {
        if (facts.TypeId[0] != 10102u || facts.Status[0] != 1 || !facts.Ready[0] ||
            facts.Kind[0] != (int)BomberPickupKind.Frenzy || facts.Item[0].IsDefault ||
            facts.Target[0] != facts.Source[0] || facts.After[0] != facts.MaximumAfter[0] || facts.Tick[0] > world.Tick)
            throw new InvalidOperationException("Frenzy requires the original Applied health fact.");
        var participant = world.Get<BomberParticipantState>(facts.Participant[0]);
        if (participant.MatchId.Value != facts.MatchId[0] ||
            participant.CurrentLife.Value != facts.Target[0] || participant.LifeGeneration.Value != facts.Generation[0])
            throw new InvalidOperationException("Frenzy Applied changed its exact life correlation.");
        var config = BomberConfigBinding.For(world);
        ulong until = checked(facts.Tick[0] + Ticks.FromMilliseconds(config.Game.FrenzyDurationMs, config.Game.TickRateHz));
        participant.FrenzyLife.Value = facts.Target[0];
        participant.FrenzyGeneration.Value = facts.Generation[0];
        participant.FrenzyUntilTick.Value = until;
    }

    internal static bool CanProduce(World world, BomberParticipantState participant, out string? failureCode)
    {
        failureCode = null;
        ValidateParticipant(world, participant);
        if (!IsActive(world, participant, participant.CurrentLife.Value) ||
            participant.FrenzyGeneration.Value != participant.LifeGeneration.Value)
        { failureCode = "frenzy_life_inactive"; return false; }
        if (participant.FrenzyLastPlacementTick.Value != 0 &&
            world.Tick - participant.FrenzyLastPlacementTick.Value < BomberConfigBinding.For(world).Game.FrenzyMinPlacementTicks)
        { failureCode = "frenzy_placement_interval"; return false; }
        if (Concurrent(world, participant) >= BomberConfigBinding.For(world).Game.FrenzyConcurrentLimit)
        { failureCode = "frenzy_capacity_full"; return false; }
        return true;
    }

    internal static EntityOrder StageAndCreate(World world, BomberParticipantState participant,
        BomberPlayerState life, int power, ulong nextChain, int x, int z, float y, ulong fuseEnd)
    {
        if (!CanProduce(world, participant, out _) || !BomberBombAdmissions.CanReserve(world, 1) ||
            life.Entity != participant.CurrentLife.Value || life.Participant.Value != participant.Entity ||
            life.LifeGeneration.Value != participant.LifeGeneration.Value)
            throw new InvalidOperationException("Frenzy placement has no admitted source or capacity.");
        var runtime = world.Single<BomberWorldRuntime>();
        if (nextChain != checked(runtime.NextChainId.Value + 1))
            throw new InvalidOperationException("Frenzy placement changed its next chain identity.");
        var row = new Promise(Token(participant.Entity, nextChain), life.Entity.ToHex(), life.LifeGeneration.Value,
            participant.MatchId.Value, nextChain, power, x, z, y, world.Tick, fuseEnd, false);
        // Encode before any accepted intent changes. The chain is the next identity at this point.
        string encoded = Encode(world, participant, row, nextChain);
        if (participant.FrenzyBombPromises.Count >= PromiseCountLimit)
            throw new InvalidOperationException("Frenzy promise storage has no free row.");
        participant.FrenzyBombPromises.Add(encoded);
        participant.FrenzyLastPlacementTick.Value = world.Tick;
        runtime.NextChainId.Value = nextChain;
        // A submitted unknown order keeps the persisted obligation. It is never replayed.
        EntityOrder order = BomberBombAdmissions.CreateFromPromise(world, row.Token, () =>
        {
            var rows = Read(world, participant);
            int index = rows.FindIndex(candidate => candidate.Token == row.Token);
            if (index < 0 || rows[index] != row)
                throw new InvalidOperationException("Frenzy submission lost its exact accepted promise.");
            participant.FrenzyBombPromises[index] = Encode(world, participant, row with { CreationSubmitted = true });
        });
        row = row with { CreationSubmitted = true };
        BomberBombState bomb = order.Get<BomberBombState>();
        bomb.Owner.Value = participant.Entity;
        bomb.SourceLife.Value = life.Entity;
        bomb.SourceLifeGeneration.Value = life.LifeGeneration.Value;
        bomb.Frenzy.Value = true;
        bomb.BombKind.Value = (int)BomberBombKind.Standard;
        bomb.Power.Value = power;
        bomb.Phase.Value = (int)BomberBombPhase.Fuse;
        bomb.FuseEndTick.Value = fuseEnd;
        bomb.PlacedAtTick.Value = world.Tick;
        bomb.ChainId.Value = nextChain;
        EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
            FormattableString.Invariant($"{x + .5f:R},{y:R},{z + .5f:R}"), silent: true);
        if (!order.AssignedId.IsDefault)
            participant.FrenzyBombPromises[participant.FrenzyBombPromises.Count - 1] =
                Encode(world, participant, row with { Produced = order.AssignedId.ToHex() });
        return order;
    }

    internal static int ReservedCount(World world)
    {
        int count = 0;
        foreach (var participant in world.Each<BomberParticipantState>())
            foreach (var row in Read(world, participant))
                if (Published(world, participant, row) is null) count = checked(count + 1);
        return count;
    }

    internal static bool HasSubmittedPromise(World world, string exactToken)
        => SubmissionWitness(world, exactToken, submitted: true) is not null;

    internal static string? SubmissionWitness(World world, string exactToken, bool submitted)
    {
        if (exactToken is null || !exactToken.StartsWith(Prefix, StringComparison.Ordinal)) return null;
        foreach (var participant in world.Each<BomberParticipantState>())
            foreach (var row in Read(world, participant))
                if (row.Token == exactToken)
                    return row.CreationSubmitted == submitted && Published(world, participant, row) is null
                        ? JsonSerializer.Serialize(new { Tick = world.Tick, Participant = participant.Entity.ToHex(),
                            CurrentMatch = participant.MatchId.Value, CurrentLife = participant.CurrentLife.Value.ToHex(),
                            CurrentGeneration = participant.LifeGeneration.Value, ActiveLife = participant.FrenzyLife.Value.ToHex(),
                            ActiveGeneration = participant.FrenzyGeneration.Value, Until = participant.FrenzyUntilTick.Value,
                            LastPlacement = participant.FrenzyLastPlacementTick.Value,
                            Row = row with { CreationSubmitted = false } }) : null;
        return null;
    }

    internal static void ObservePublished(World world, BomberBombState bomb)
    {
        if (!world.IsLive(bomb.Entity) || !bomb.PromiseToken.Value.StartsWith(Prefix, StringComparison.Ordinal)) return;
        ValidateBomb(world, bomb);
        var participant = world.Get<BomberParticipantState>(bomb.Owner.Value);
        var rows = Read(world, participant);
        int index = rows.FindIndex(row => row.Token == bomb.PromiseToken.Value);
        if (index < 0) return;
        RequirePublished(world, participant, rows[index], bomb);
        participant.FrenzyBombPromises.RemoveAt(index);
    }

    internal static bool HasUnpublished(World world) => ReservedCount(world) != 0;

    internal static void ResetParticipant(World world, BomberParticipantState participant)
    {
        foreach (var bomb in world.Each<BomberBombState>().Where(b => b.Owner.Value == participant.Entity).ToArray())
            ObservePublished(world, bomb);
        if (participant.FrenzyBombPromises.Count != 0)
            throw new InvalidOperationException("Round cleanup cannot discard an unknown Frenzy publication.");
        participant.FrenzyLife.Value = default;
        participant.FrenzyGeneration.Value = participant.FrenzyUntilTick.Value = participant.FrenzyLastPlacementTick.Value = 0;
    }

    internal static void ValidateParticipant(World world, BomberParticipantState participant)
    {
        bool empty = participant.FrenzyLife.Value.IsDefault;
        if (empty != (participant.FrenzyGeneration.Value == 0) || empty != (participant.FrenzyUntilTick.Value == 0) ||
            participant.FrenzyLastPlacementTick.Value > world.Tick ||
            participant.FrenzyUntilTick.Value > checked(world.Tick + Ticks.FromMilliseconds(
                BomberConfigBinding.For(world).Game.FrenzyDurationMs, BomberConfigBinding.For(world).Game.TickRateHz)) ||
            (empty && (participant.FrenzyLastPlacementTick.Value != 0 || participant.FrenzyBombPromises.Count != 0)))
            throw new InvalidOperationException("Frenzy source and placement clock disagree.");
        if (!empty)
        {
            RequireIdentity(world, participant.FrenzyLife.Value.ToHex());
            if (participant.FrenzyGeneration.Value > participant.LifeGeneration.Value)
                throw new InvalidOperationException("Frenzy source belongs to a future life generation.");
        }
        _ = Read(world, participant);
        if (Concurrent(world, participant) > BomberConfigBinding.For(world).Game.FrenzyConcurrentLimit)
            throw new InvalidOperationException("Frenzy concurrency exceeds its participant budget.");
    }

    internal static void ValidateBomb(World world, BomberBombState bomb)
    {
        bool primary = bomb.PromiseToken.Value.StartsWith(Prefix, StringComparison.Ordinal);
        if (primary && !bomb.Frenzy.Value)
            throw new InvalidOperationException("Frenzy publication lost its source immunity marker.");
        if (!bomb.Frenzy.Value) return;
        RequireIdentity(world, bomb.Owner.Value.ToHex());
        RequireIdentity(world, bomb.SourceLife.Value.ToHex());
        if (bomb.SourceLifeGeneration.Value == 0 ||
            (!primary && !bomb.PromiseToken.Value.StartsWith("barrel:", StringComparison.Ordinal)) ||
            bomb.BombKind.Value != (int)BomberBombKind.Standard || bomb.FutureChildren.Value != 0 ||
            bomb.SkillLevel.Value != 0 || bomb.PierceLayers.Value != 0 || bomb.ChildDirection.Value != 0)
            throw new InvalidOperationException("Frenzy bomb changed its fixed shape or original source.");
        if (!primary) return;
        ulong originalChain = ReadPrimaryChain(bomb);
        ulong nominal = Due(world, bomb.PlacedAtTick.Value);
        if (bomb.ChainId.Value == 0 || bomb.PlacedAtTick.Value > world.Tick ||
            bomb.FuseEndTick.Value <= bomb.PlacedAtTick.Value || bomb.FuseEndTick.Value > nominal)
            throw new InvalidOperationException("Frenzy primary changed its placement or fuse identity.");
        bool changedByChain = bomb.ChainId.Value != originalChain || bomb.FuseEndTick.Value != nominal;
        bool exploded = bomb.Phase.Value == (int)BomberBombPhase.Danger ||
            bomb.Phase.Value == (int)BomberBombPhase.Burn || bomb.Phase.Value == (int)BomberBombPhase.Expired;
        // The promise and first publication pin the original fuse and chain. A
        // later actual chain reaction changes the deadline and current family.
        if (changedByChain && (!bomb.PlacementRecorded.Value || !exploded ||
            bomb.ExplodedAtTick.Value <= bomb.PlacedAtTick.Value ||
            bomb.ExplodedAtTick.Value < bomb.FuseEndTick.Value || bomb.ExplodedAtTick.Value > world.Tick))
            throw new InvalidOperationException("Frenzy chain change has no published explosion provenance.");
    }

    internal static void Validate(World world)
    {
        var tokens = new HashSet<string>(StringComparer.Ordinal);
        foreach (var bomb in world.Each<BomberBombState>().Where(b => world.IsLive(b.Entity)))
        {
            ValidateBomb(world, bomb);
            if (bomb.PromiseToken.Value.StartsWith(Prefix, StringComparison.Ordinal) && !tokens.Add(bomb.PromiseToken.Value))
                throw new InvalidOperationException("Frenzy promise published more than once.");
        }
        foreach (var participant in world.Each<BomberParticipantState>()) ValidateParticipant(world, participant);
    }

    private static int Concurrent(World world, BomberParticipantState participant)
    {
        int count = world.Each<BomberBombState>().Count(b => world.IsLive(b.Entity) && b.Owner.Value == participant.Entity &&
            b.Frenzy.Value && b.PromiseToken.Value.StartsWith(Prefix, StringComparison.Ordinal) &&
            b.Phase.Value == (int)BomberBombPhase.Fuse);
        foreach (var row in Read(world, participant))
            if (Published(world, participant, row) is null) count = checked(count + 1);
        return count;
    }

    private static BomberBombState? Published(World world, BomberParticipantState participant, Promise row)
    {
        BomberBombState? found = null;
        foreach (var bomb in world.Each<BomberBombState>())
        {
            if (!world.IsLive(bomb.Entity) || bomb.PromiseToken.Value != row.Token) continue;
            if (found is not null) throw new InvalidOperationException("Frenzy promise published more than once.");
            RequirePublished(world, participant, row, bomb);
            found = bomb;
        }
        return found;
    }

    private static void RequirePublished(World world, BomberParticipantState participant, Promise row, BomberBombState bomb)
    {
        ValidateBomb(world, bomb);
        if (!bomb.PlacementRecorded.Value)
        {
            var position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            if (position.X != row.X + .5f || position.Z != row.Z + .5f || position.Y != row.Y)
                throw new InvalidOperationException("Frenzy initial publication changed its accepted position.");
        }
        if (!row.CreationSubmitted || (row.Produced != "" && row.Produced != bomb.Entity.ToHex()) ||
            bomb.Owner.Value != participant.Entity || bomb.SourceLife.Value.ToHex() != row.Life ||
            bomb.SourceLifeGeneration.Value != row.Generation || bomb.ChainId.Value != row.Chain ||
            bomb.Power.Value != row.Power || bomb.PlacedAtTick.Value != row.Placed || bomb.FuseEndTick.Value != row.FuseEnd)
            throw new InvalidOperationException("Frenzy publication differs from its exact submitted promise.");
    }

    internal static string Encode(World world, BomberParticipantState participant, Promise row, ulong? allowedChain = null)
    {
        ValidateRow(world, participant, row, allowedChain ?? world.Single<BomberWorldRuntime>().NextChainId.Value);
        string encoded = JsonSerializer.Serialize(row);
        if (Encoding.UTF8.GetByteCount(encoded) > PromiseByteLimit)
            throw new InvalidOperationException("Frenzy promise exceeds its UTF8 byte budget.");
        return encoded;
    }

    private static List<Promise> Read(World world, BomberParticipantState participant)
    {
        if (participant.FrenzyBombPromises.Count > PromiseCountLimit)
            throw new InvalidOperationException("Frenzy promise count exceeds its fixed storage.");
        var rows = new List<Promise>(participant.FrenzyBombPromises.Count);
        var tokens = new HashSet<string>(StringComparer.Ordinal);
        for (int i = 0; i < participant.FrenzyBombPromises.Count; i++)
        {
            string encoded = participant.FrenzyBombPromises[i];
            if (encoded is null || Encoding.UTF8.GetByteCount(encoded) > PromiseByteLimit)
                throw new InvalidOperationException("Frenzy promise exceeds its UTF8 byte budget.");
            try
            {
                var row = JsonSerializer.Deserialize<Promise>(encoded) ?? throw new InvalidOperationException("Missing Frenzy promise row.");
                _ = Encode(world, participant, row);
                if (!tokens.Add(row.Token)) throw new InvalidOperationException("Duplicate Frenzy promise token.");
                rows.Add(row);
            }
            catch (JsonException error) { throw new InvalidOperationException("Invalid Frenzy promise memory.", error); }
        }
        return rows;
    }

    private static void ValidateRow(World world, BomberParticipantState participant, Promise row, ulong maximumChain)
    {
        if (row is null) throw new InvalidOperationException("Missing Frenzy promise row.");
        _ = RequireIdentity(world, row.Life);
        var config = BomberConfigBinding.For(world);
        if (row.Generation == 0 || row.Generation > participant.LifeGeneration.Value ||
            row.Match == 0 || row.Match != participant.MatchId.Value || row.Chain == 0 || row.Chain > maximumChain ||
            row.Token != Token(participant.Entity, row.Chain) || Encoding.UTF8.GetByteCount(row.Token) > 128 ||
            row.Power <= 0 || row.Power > config.Attribute(BomberAttributeNames.BombPower).Maximum ||
            row.X < 0 || row.X >= config.Map.Width || row.Z < 0 || row.Z >= config.Map.Depth ||
            float.IsNaN(row.Y) || float.IsInfinity(row.Y) || row.Placed > world.Tick ||
            row.FuseEnd != Due(world, row.Placed) || row.Produced is null || (!row.CreationSubmitted && row.Produced != ""))
            throw new InvalidOperationException("Invalid Frenzy promise source, placement or submission.");
        if (row.Produced != "") _ = RequireIdentity(world, row.Produced);
    }

    private static ulong Due(World world, ulong placed) => checked(placed + Ticks.FromMilliseconds(
        BomberConfigBinding.For(world).Game.FrenzyFuseMs, BomberConfigBinding.For(world).Game.TickRateHz));

    private static string Token(NetEntityId participant, ulong chain) =>
        FormattableString.Invariant($"frenzy:{participant.ToHex()}:{chain:x16}");

    private static ulong ReadPrimaryChain(BomberBombState bomb)
    {
        string prefix = $"frenzy:{bomb.Owner.Value.ToHex()}:";
        string token = bomb.PromiseToken.Value;
        if (!token.StartsWith(prefix, StringComparison.Ordinal) || token.Length != prefix.Length + 16 ||
            !ulong.TryParse(token.AsSpan(prefix.Length), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out ulong original) ||
            original == 0 || token != Token(bomb.Owner.Value, original))
            throw new InvalidOperationException("Frenzy primary changed its original promise identity.");
        return original;
    }

    private static NetEntityId RequireIdentity(World world, string value)
    {
        if (!NetEntityId.TryParse(value, out var id) || id.Counter == 0 || id.InstanceId != world.InstanceId)
            throw new InvalidOperationException("Frenzy requires a complete local source identity.");
        return id;
    }
}
