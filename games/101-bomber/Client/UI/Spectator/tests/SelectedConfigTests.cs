using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Config;

namespace Lumio.Bomber.Client.Spectator.Tests;

public sealed class SelectedConfigTests
{
    [Theory]
    [InlineData("skills-off", false)]
    [InlineData("skills-on", true)]
    public void SelectedOfficialExportDrivesSelectionAndTwoRealNativeReplicaWorlds(string profile, bool skills)
    {
        var source = ReadProfile(profile);
        var config = BomberClientConfig.Load(source);
        Assert.Equal(skills, config.Display.Game.SkillsEnabled);
        using var selection = JsonDocument.Parse(PresentationDump.SelectionConfig(config.Display));
        source.Files.Clear(); // The selected snapshot, not a mutable directory, owns this session cut.
        using var owner = new BrowserSessionOwner(configuration: config);
        owner.Authorize();
        Assert.Equal(skills, BomberConfigBinding.For(owner.Host.World!).Game.SkillsEnabled);
        using var actual = JsonDocument.Parse(PresentationDump.Dump(owner.Host.World, "0"));
        Assert.Equal(selection.RootElement.GetRawText(), actual.RootElement.GetProperty("config").GetRawText());
        using var nextWorld = owner.CreateClientWorld();
        Assert.Equal(skills, BomberConfigBinding.For(nextWorld.World).Game.SkillsEnabled);
        Assert.NotSame(owner.Host.World, nextWorld.World);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void MissingOrTamperedSelectedExportIsRejectedWithoutEmbeddedFallback(bool tampered)
    {
        var source = ReadProfile("skills-off");
        if (tampered) source.Files["client/game.json"] = System.Text.Encoding.UTF8.GetBytes("{}");
        else source.Files.Remove("client/game.json");
        Assert.Throws<InvalidOperationException>(() => BomberClientConfig.Load(source));
    }

    [Fact]
    public void BrowserBundlePreservesExactBytesAndRejectsServerOrDuplicateFiles()
    {
        var source = ReadProfile("skills-off");
        var files = source.Files.ToDictionary(pair => pair.Key, pair => Convert.ToBase64String(pair.Value));
        var config = BomberClientConfig.FromBundle(JsonSerializer.Serialize(new { files }));
        Assert.False(config.Display.Game.SkillsEnabled);
        files["server/game.json"] = Convert.ToBase64String(new byte[] { 1 });
        Assert.Throws<FormatException>(() => BomberClientConfig.FromBundle(JsonSerializer.Serialize(new { files })));
        Assert.Throws<FormatException>(() => BomberClientConfig.FromBundle("{\"files\":{\"manifest.json\":\"e30=\",\"manifest.json\":\"e30=\"}}"));
    }

    private static Artifact ReadProfile(string profile)
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !Directory.Exists(Path.Combine(root.FullName, "Client/Config/Tables"))) root = root.Parent;
        string game = root?.FullName ?? Path.Combine(Environment.GetEnvironmentVariable("LUMIO_GAME_REPO_ROOT")
            ?? throw new InvalidOperationException("LUMIO_GAME_REPO_ROOT must identify the Game repository."), "games/101-bomber");
        string directory = Path.Combine(game, "Client/Config/Tables/profiles", profile);
        var files = Directory.GetFiles(Path.Combine(directory, "client"), "*.json")
            .ToDictionary(file => "client/" + Path.GetFileName(file), File.ReadAllBytes);
        files.Add("manifest.json", File.ReadAllBytes(Path.Combine(directory, "manifest.json")));
        return new Artifact(files);
    }
    private sealed class Artifact(Dictionary<string, byte[]> files) : IConfigArtifactBytes
    {
        public Dictionary<string, byte[]> Files { get; } = files;
        public ReadOnlyMemory<byte> ReadFile(string path) => Files.TryGetValue(path, out var bytes) ? bytes : ReadOnlyMemory<byte>.Empty;
    }
}
