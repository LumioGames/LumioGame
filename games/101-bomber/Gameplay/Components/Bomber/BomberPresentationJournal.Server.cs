using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberPresentationJournal
{
    public const int MaxEntries = 128;
    public const int MaxEntryChars = 2048;
    public const ulong RetentionTicks = 200;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    public void Reset() => Entries.Clear();

    protected override void OnHydrate()
    {
        if (Entries.Count > MaxEntries)
            throw new InvalidOperationException("Presentation journal exceeds its persisted entry limit.");
        for (int i = 0; i < Entries.Count; i++) _ = Parse(Entries[i]);
        Expire(World.Tick);
    }

    public void Expire(ulong tick)
    {
        for (int i = Entries.Count - 1; i >= 0; i--)
        {
            BomberPresentationOccurrence occurrence = Parse(Entries[i]);
            ulong occurred = ulong.Parse(occurrence.Tick, CultureInfo.InvariantCulture);
            if (occurred <= tick && tick - occurred > RetentionTicks) Entries.RemoveAt(i);
        }
    }

    public void Append(World world, string kind, ulong matchId, ulong sequence,
        NetEntityId participant = default, NetEntityId life = default, ulong lifeGeneration = 0,
        NetEntityId sourceParticipant = default, NetEntityId sourceLife = default,
        NetEntityId entity = default, int? x = null, int? z = null, string? cause = null,
        IReadOnlyDictionary<string, string>? data = null, ulong? occurredTick = null)
    {
        if (matchId == 0 || sequence == 0 || string.IsNullOrWhiteSpace(kind))
            throw new ArgumentException("Occurrence requires a match, sequence and kind.");
        var occurrence = new BomberPresentationOccurrence(1, kind,
            matchId.ToString(CultureInfo.InvariantCulture), (occurredTick ?? world.Tick).ToString(CultureInfo.InvariantCulture),
            sequence.ToString(CultureInfo.InvariantCulture), Id(participant), Id(life),
            lifeGeneration == 0 ? null : lifeGeneration.ToString(CultureInfo.InvariantCulture),
            Id(sourceParticipant), Id(sourceLife), Id(entity), x, z, cause, data);
        string json = JsonSerializer.Serialize(occurrence, JsonOptions);
        if (json.Length > MaxEntryChars) throw new InvalidOperationException("Presentation occurrence exceeds its entry limit.");
        Expire(world.Tick);
        while (Entries.Count >= MaxEntries) Entries.RemoveAt(0);
        Entries.Add(json);
    }

    private static string? Id(NetEntityId id) => id.IsDefault ? null : id.ToHex();

    private static BomberPresentationOccurrence Parse(string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json.Length > MaxEntryChars)
            throw new InvalidOperationException("Invalid presentation occurrence size.");
        BomberPresentationOccurrence? occurrence;
        try { occurrence = JsonSerializer.Deserialize<BomberPresentationOccurrence>(json, JsonOptions); }
        catch (JsonException error) { throw new InvalidOperationException("Invalid presentation occurrence JSON.", error); }
        if (occurrence is null || occurrence.Version != 1 || string.IsNullOrWhiteSpace(occurrence.Kind) ||
            !ValidPositive(occurrence.MatchId) || !ValidPositive(occurrence.Sequence) ||
            !ulong.TryParse(occurrence.Tick, NumberStyles.None, CultureInfo.InvariantCulture, out _) ||
            !ValidId(occurrence.ParticipantId) || !ValidId(occurrence.LifeId) ||
            !ValidId(occurrence.SourceParticipantId) || !ValidId(occurrence.SourceLifeId) ||
            !ValidId(occurrence.EntityId) ||
            (occurrence.LifeGeneration is not null && !ValidPositive(occurrence.LifeGeneration)))
            throw new InvalidOperationException("Invalid presentation occurrence fields.");
        return occurrence;
    }

    private static bool ValidPositive(string value) =>
        ulong.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out ulong parsed) && parsed != 0 &&
        string.Equals(value, parsed.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal);

    private static bool ValidId(string? value) => value is null ||
        (value.Length == 32 && NetEntityId.TryParse(value, out NetEntityId parsed) && !parsed.IsDefault &&
            string.Equals(value, parsed.ToHex(), StringComparison.Ordinal));
}
