using System.Text.Json;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class PeerAdmissionCloseTests
{
    [Theory]
    [InlineData("admission_refused")]
    [InlineData("protocol_violation")]
    public void PreAdmissionPeerCloseProjectsItsActualCodeAndReason(string reason)
    {
        using var owner = new BrowserSessionOwner();
        owner.PeerClose(1008, reason);
        owner.PumpUntil(() => owner.Host.ConnectionState == "faulted");
        using var state = JsonDocument.Parse(owner.Host.SessionState());
        string diagnostic = state.RootElement.GetProperty("lastError").GetString()!;
        Assert.Contains("reason=tick_exception phase=dispatch", diagnostic);
        Assert.Contains("txn=close=1008", diagnostic);
        Assert.Contains("exception=" + reason, diagnostic);
        Assert.False(owner.Host.InputEnabled);
    }
}
