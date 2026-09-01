using Lumio.Game.ServerGameplay;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class BotLaunchNamesTests
{
    [Fact]
    public void LoopGeneratesBot01ThroughBot100()
    {
        Assert.Equal(100, BotLaunchNames.Count);
        Assert.Equal("Bot01", BotLaunchNames.Format(1));
        Assert.Equal("Bot09", BotLaunchNames.Format(9));
        Assert.Equal("Bot10", BotLaunchNames.Format(10));
        Assert.Equal("Bot100", BotLaunchNames.Format(100));

        string[] names = BotLaunchNames.All;
        Assert.Equal(100, names.Length);
        Assert.Equal("Bot01", names[0]);
        Assert.Equal("Bot100", names[99]);
        for (int i = 0; i < names.Length; i++)
        {
            Assert.Equal(BotLaunchNames.Format(i + 1), names[i]);
            Assert.True(BotLaunchNames.IsBotNamespace(names[i]));
        }
    }

    [Fact]
    public void BrowserNamesAreNotBotNamespace()
    {
        Assert.False(BotLaunchNames.IsBotNamespace("Browser01"));
        Assert.False(BotLaunchNames.IsBotNamespace("Player01"));
        Assert.False(BotLaunchNames.IsBotNamespace("bot01"));
        Assert.False(BotLaunchNames.IsBotNamespace("Bot"));
        Assert.False(BotLaunchNames.IsBotNamespace("Bot01a"));
    }
}
