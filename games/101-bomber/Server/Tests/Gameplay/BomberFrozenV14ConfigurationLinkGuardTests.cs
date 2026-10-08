using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

public sealed class BomberFrozenV14ConfigurationLinkGuardTests
{
    private const string Blob = "ed0ce3da518616ba5a06acc7262dabb1ff1451c9";

    [Theory]
    [InlineData(".agents/skills")]
    [InlineData(".claude/skills")]
    public void ExactPinnedDirectoryLinkTargetsTheOrdinaryConfigSkillsDirectory(string relative)
    {
        using var fixture = new LinkFixture();
        fixture.Link(relative, "../.spec/skills");
        BomberFrozenV14Qualification.VerifyConfigLink(fixture.Root, relative, "120000", Blob);
    }

    [Theory]
    [InlineData("100644", Blob)]
    [InlineData("120000", "0000000000000000000000000000000000000000")]
    public void WrongGitModeOrBlobCannotQualifyAnOtherwiseCorrectLink(string mode, string blob)
    {
        using var fixture = new LinkFixture();
        fixture.Link(".agents/skills", "../.spec/skills");
        Assert.Throws<InvalidOperationException>(() =>
            BomberFrozenV14Qualification.VerifyConfigLink(fixture.Root, ".agents/skills", mode, blob));
    }

    [Theory]
    [InlineData(".extra/skills")]
    [InlineData("../skills")]
    [InlineData("C:/skills")]
    public void OnlyTheTwoPinnedGitDirectoryLinkPathsCanQualify(string relative)
    {
        using var fixture = new LinkFixture();
        Assert.Throws<InvalidOperationException>(() =>
            BomberFrozenV14Qualification.VerifyConfigLink(fixture.Root, relative, "120000", Blob));
    }

    [Theory]
    [InlineData("../.spec/other")]
    [InlineData("../../outside")]
    [InlineData("absolute")]
    public void RetargetingTheRegisteredLinkInsideOrOutsideConfigIsRejected(string target)
    {
        using var fixture = new LinkFixture();
        string actualTarget = target == "absolute" ? Path.Combine(fixture.Root, ".spec", "skills") : target;
        Directory.CreateDirectory(Path.Combine(fixture.Root, ".spec", "other"));
        Directory.CreateDirectory(Path.Combine(fixture.Root, "outside"));
        fixture.Link(".agents/skills", actualTarget);
        Assert.Throws<InvalidOperationException>(() =>
            BomberFrozenV14Qualification.VerifyConfigLink(fixture.Root, ".agents/skills", "120000", Blob));
    }

    [Fact]
    public void ALinkedSkillsTargetCannotEscapeThroughTheRegisteredDirectoryLink()
    {
        using var fixture = new LinkFixture();
        Directory.Delete(Path.Combine(fixture.Root, ".spec", "skills"));
        Directory.CreateDirectory(Path.Combine(fixture.Root, "outside"));
        fixture.Link(".spec/skills", "../outside");
        fixture.Link(".agents/skills", "../.spec/skills");
        Assert.Throws<InvalidOperationException>(() =>
            BomberFrozenV14Qualification.VerifyConfigLink(fixture.Root, ".agents/skills", "120000", Blob));
    }

    [Fact]
    public void ALinkedConfigAncestorCannotQualifyTheRegisteredDirectoryLink()
    {
        using var fixture = new LinkFixture();
        fixture.Link(".agents/skills", "../.spec/skills");
        string alias = fixture.Link("alias", ".");
        Assert.Throws<InvalidOperationException>(() =>
            BomberFrozenV14Qualification.VerifyConfigLink(alias, ".agents/skills", "120000", Blob));
    }

    [Fact]
    public void FrozenArchiveLinksStillFailTheUnchangedGlobalLinkFence()
    {
        using var fixture = new LinkFixture();
        Directory.CreateDirectory(Path.Combine(fixture.Root, "outside"));
        string linked = fixture.Link("archive/workspace", "../outside");
        Assert.Throws<InvalidOperationException>(() => BomberFrozenV14Qualification.NoLinks(linked));
    }

    [Fact]
    public void AnAcceptedConfigLinkIsRejectedWhenItsTargetChangesBeforeTheSecondFence()
    {
        using var fixture = new LinkFixture();
        string linked = fixture.Link(".agents/skills", "../.spec/skills");
        BomberFrozenV14Qualification.VerifyConfigLink(fixture.Root, ".agents/skills", "120000", Blob);
        Directory.Delete(linked);
        Directory.CreateDirectory(Path.Combine(fixture.Root, ".spec", "other"));
        fixture.Link(".agents/skills", "../.spec/other");
        Assert.Throws<InvalidOperationException>(() =>
            BomberFrozenV14Qualification.VerifyConfigLink(fixture.Root, ".agents/skills", "120000", Blob));
    }

    [Fact]
    public void APlainDirectoryCannotReplaceTheTrackedGitSymbolicLink()
    {
        using var fixture = new LinkFixture();
        Directory.CreateDirectory(Path.Combine(fixture.Root, ".agents", "skills"));
        Assert.Throws<InvalidOperationException>(() =>
            BomberFrozenV14Qualification.VerifyConfigLink(fixture.Root, ".agents/skills", "120000", Blob));
    }

    private sealed class LinkFixture : IDisposable
    {
        private readonly List<string> links = new();
        internal string Root { get; } = Path.Combine(Path.GetTempPath(), "lumio-v14-config-link-" + Guid.NewGuid().ToString("N"));

        internal LinkFixture() => Directory.CreateDirectory(Path.Combine(Root, ".spec", "skills"));

        internal string Link(string relative, string target)
        {
            string path = Path.Combine(Root, Path.Combine(relative.Split('/')));
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            Directory.CreateSymbolicLink(path, target);
            links.Add(path);
            return path;
        }

        public void Dispose()
        {
            foreach (string path in links.Distinct(StringComparer.OrdinalIgnoreCase).Reverse())
                if (new DirectoryInfo(path).LinkTarget is not null) Directory.Delete(path);
            Directory.Delete(Root, recursive: true);
        }
    }
}
