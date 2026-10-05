using Lumio.Engine.NativeLoader;

namespace Lumio.Bomber.Gameplay.Tests;

internal static class KernelConfigurationFixture
{
    internal static KernelConfig Create() => new()
    {
        MaxContexts = 64,
        MaxHandles = 4096,
        MaxNativeBytes = 67_108_864,
        MaxJobsQueued = 256,
        MaxJobsRunning = 4,
        MaxCompletionItems = 1_024,
        LogMailboxCapacity = 8_192,
    };
}
