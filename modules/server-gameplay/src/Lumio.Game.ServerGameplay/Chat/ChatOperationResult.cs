namespace Lumio.Game.ServerGameplay;

/// <summary>Outcome of admitting or applying a chat command.</summary>
public enum ChatOperationKind
{
    /// <summary>Input accepted into Runtime Ingress; no component write yet.</summary>
    Admitted = 0,

    /// <summary>SetMessage committed component state and produced an event.</summary>
    Committed = 1,

    /// <summary>Business or lifecycle reject; zero component bytes written for this command.</summary>
    Rejected = 2,

    /// <summary>Owner-thread fail-stop; the world is faulted and no further writes commit.</summary>
    Fatal = 3
}

/// <summary>Result of a chat admit, SetMessage, or tick apply.</summary>
/// <param name="Kind">Outcome kind.</param>
/// <param name="ErrorCode">Stable code when rejected or fatal; otherwise <see langword="null"/>.</param>
public readonly record struct ChatOperationResult(ChatOperationKind Kind, string? ErrorCode)
{
    /// <summary>True when this result committed component state.</summary>
    public bool IsCommitted => Kind == ChatOperationKind.Committed;

    /// <summary>True when the world fail-stopped.</summary>
    public bool IsFatal => Kind == ChatOperationKind.Fatal;

    /// <summary>Input queued for the next tick.</summary>
    public static ChatOperationResult Admitted() => new(ChatOperationKind.Admitted, null);

    /// <summary>SetMessage committed.</summary>
    public static ChatOperationResult Committed() => new(ChatOperationKind.Committed, null);

    /// <summary>Rejected without a component write.</summary>
    public static ChatOperationResult Rejected(string errorCode) => new(ChatOperationKind.Rejected, errorCode);

    /// <summary>Fatal owner-thread violation.</summary>
    public static ChatOperationResult Fatal(string errorCode) => new(ChatOperationKind.Fatal, errorCode);
}
