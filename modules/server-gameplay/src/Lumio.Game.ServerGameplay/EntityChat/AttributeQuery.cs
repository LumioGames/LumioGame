namespace Lumio.Game.ServerGameplay;

/// <summary>C-2 caller scope for Attribute Query.</summary>
public enum AttributeQueryScope
{
    /// <summary>Authoritative server read.</summary>
    ServerAuthoritative = 0,

    /// <summary>Client ReplicaWorld read.</summary>
    ClientReplica = 1
}

/// <summary>C-2 query outcome, including the five explicit failures.</summary>
public enum AttributeQueryOutcome
{
    /// <summary>Typed value returned.</summary>
    Ok = 0,

    /// <summary>Request-shaped error; see <see cref="AttributeQueryResult.ErrorCode"/>.</summary>
    RequestError = 1,

    /// <summary>Target was never created or has been forgotten.</summary>
    NonExistent = 2,

    /// <summary>Supplied connection generation is behind the live epoch.</summary>
    StaleGeneration = 3,

    /// <summary>Attribute is not replicated/visible to the caller.</summary>
    Invisible = 4,

    /// <summary>Entity is visible but the caller lacks the attribute's claim.</summary>
    Unauthorized = 5,

    /// <summary>Entity is destroyed and still tombstoned; never aliases a replacement.</summary>
    Tombstoned = 6
}

/// <summary>One C-2 Attribute Query request.</summary>
/// <param name="CallerScope">Server or client replica scope.</param>
/// <param name="RoomId">Requested Room.</param>
/// <param name="NetEntityId">Target entity.</param>
/// <param name="AttributeId">Declared attribute id.</param>
/// <param name="ConnectionGeneration">Optional epoch check.</param>
public readonly record struct AttributeQueryRequest(
    AttributeQueryScope CallerScope,
    string RoomId,
    ulong NetEntityId,
    string AttributeId,
    ulong? ConnectionGeneration = null);

/// <summary>C-2 Attribute Query result. Failures never carry a value or a replacement entity.</summary>
/// <param name="Outcome">Result classification.</param>
/// <param name="Value">Typed value on success.</param>
/// <param name="ErrorCode">Request-error code when <see cref="Outcome"/> is <see cref="AttributeQueryOutcome.RequestError"/>.</param>
/// <param name="ObservedTick">Observed logical tick on success.</param>
/// <param name="ObservedRevision">Observed revision on success.</param>
public readonly record struct AttributeQueryResult(
    AttributeQueryOutcome Outcome,
    string? Value,
    string? ErrorCode,
    ulong ObservedTick,
    ulong ObservedRevision)
{
    /// <summary>Successful typed read.</summary>
    public static AttributeQueryResult Ok(string value, ulong tick, ulong revision)
        => new(AttributeQueryOutcome.Ok, value, null, tick, revision);

    /// <summary>Outcome-class failure with no value.</summary>
    public static AttributeQueryResult Fail(AttributeQueryOutcome outcome)
        => new(outcome, null, null, 0, 0);

    /// <summary>Request-shaped error.</summary>
    public static AttributeQueryResult RequestError(string code)
        => new(AttributeQueryOutcome.RequestError, null, code, 0, 0);
}
