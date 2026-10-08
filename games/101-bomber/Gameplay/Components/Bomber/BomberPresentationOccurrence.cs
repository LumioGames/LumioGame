using System.Collections.Generic;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

/// <summary>Version 1 display-only occurrence. IDs and wide counters are lossless strings.</summary>
public sealed record BomberPresentationOccurrence(
    int Version, string Kind, string MatchId, string Tick, string Sequence,
    string? ParticipantId = null, string? LifeId = null, string? LifeGeneration = null,
    string? SourceParticipantId = null, string? SourceLifeId = null,
    string? EntityId = null, int? X = null, int? Z = null,
    string? Cause = null, IReadOnlyDictionary<string, string>? Data = null);
