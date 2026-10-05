using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Config;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

[Collection("BomberWorld")]
public sealed class WorldConfigTests
{
    [Fact]
    public void BootAndRestoreRequireTheDeclaredImmutableBinding()
    {
        Assert.Equal(typeof(IBomberConfig), GeneratedRegistry.Instance.RequiredGameplayConfigContract);
        BomberTestWorld.AssertOwnerFailure<WorldConfigBindingException>(() => BomberTestWorld.Create(GeneratedRegistry.Instance, 1));
        using WorldManager manager = BomberTestWorld.Start();
        var config = Assert.IsAssignableFrom<IBomberConfig>(manager.World.GameplayConfig);
        Assert.Same(config, BomberConfigBinding.For(manager.World));
        BomberTestWorld.AssertOwnerFailure<WorldConfigBindingException>(() => BomberTestWorld.Restore(manager.CaptureSnapshot(), GeneratedRegistry.Instance));
    }

    [Fact]
    public void WorldsDoNotShareTheConfigInstance()
    {
        using WorldManager first = BomberTestWorld.Start(100);
        using WorldManager second = BomberTestWorld.Start(200);
        Assert.NotSame(first.World.GameplayConfig, second.World.GameplayConfig);
        first.Tick();
        second.Tick();
        Assert.Equal(first.World.Tick, second.World.Tick);
    }
}
