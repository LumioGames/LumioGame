namespace Lumio.Game.ServerGameplay;

/// <summary>Outcome of Game Room admission, reconnect, or takeover.</summary>
public sealed class RoomAdmitResult
{
    private RoomAdmitResult(
        bool accepted,
        string? errorCode,
        ConnectionBinding? binding,
        bool reconnected,
        bool takeover,
        bool clientWindowCleared)
    {
        Accepted = accepted;
        ErrorCode = errorCode;
        Binding = binding;
        Reconnected = reconnected;
        Takeover = takeover;
        ClientWindowCleared = clientWindowCleared;
    }

    /// <summary>True when a binding was established or rebound.</summary>
    public bool Accepted { get; }

    /// <summary>Stable reject code when <see cref="Accepted"/> is false.</summary>
    public string? ErrorCode { get; }

    /// <summary>Current binding five-tuple.</summary>
    public ConnectionBinding? Binding { get; }

    /// <summary>True when a disconnected retained entity was rebound inside the window.</summary>
    public bool Reconnected { get; }

    /// <summary>True when a live connection was kicked and the same entity rebound.</summary>
    public bool Takeover { get; }

    /// <summary>True when the admitting client's chat window starts empty (fresh replica).</summary>
    public bool ClientWindowCleared { get; }

    /// <summary>Successful first admission.</summary>
    public static RoomAdmitResult Ok(ConnectionBinding binding, bool reconnected, bool takeover)
        => new(true, null, binding, reconnected, takeover, clientWindowCleared: true);

    /// <summary>Rejected admission with a stable code.</summary>
    public static RoomAdmitResult Reject(string errorCode) => new(false, errorCode, null, false, false, false);
}
