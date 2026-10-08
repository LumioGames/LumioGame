using System.Text.Json;

namespace Lumio.Bomber.Server.HostTests;

/// <summary>
/// The kernel envelope the host boot request carries. Same values the moved
/// cases used in LumioServer; kept as a JSON literal because this project
/// reaches HostEntry only through reflection.
/// </summary>
internal static class KernelConfigurationFixture
{
    internal static readonly object Value = new
    {
        maxContexts = 64, maxHandles = 64, maxNativeBytes = 1048576,
        maxJobsQueued = 8, maxJobsRunning = 2, maxCompletionItems = 8, logMailboxCapacity = 64,
    };

    internal static string Json => JsonSerializer.Serialize(Value);
}
