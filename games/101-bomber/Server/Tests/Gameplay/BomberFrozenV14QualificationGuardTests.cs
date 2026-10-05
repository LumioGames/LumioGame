using System;
using System.IO;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

public sealed class BomberFrozenV14QualificationGuardTests
{
    [Fact]
    public void ExactlyOnePassedUnskippedChildCaseHasCompleteCounts()
    {
        Assert.Equal(new BomberFrozenV14Qualification.Counts(1, 0, 1, 0),
            BomberFrozenV14Qualification.ReadCounts("  total: 1\n  failed: 0\n  succeeded: 1\n  skipped: 0\n"));
    }

    [Theory]
    [InlineData("  total: 1\n  failed: 0\n  succeeded: 1\n")]
    [InlineData("  total: 0\n  failed: 0\n  succeeded: 0\n  skipped: 0\n")]
    [InlineData("  total: 1\n  failed: 1\n  succeeded: 0\n  skipped: 0\n")]
    [InlineData("  total: 1\n  failed: 0\n  succeeded: 0\n  skipped: 1\n")]
    [InlineData("  total: 1\n  failed: 0\n  succeeded: 1\n  skipped: 0\n  total: 1\n")]
    [InlineData("  total: -1\n  failed: 0\n  succeeded: 1\n  skipped: 0\n")]
    public void IncompleteEmptyFailedSkippedOrRepeatedChildSummaryIsRejected(string output)
    {
        Assert.Throws<InvalidOperationException>(() => BomberFrozenV14Qualification.ReadCounts(output));
    }

    [Theory]
    [InlineData("../executor/test.dll")]
    [InlineData("executor/../../test.dll")]
    [InlineData("/executor/test.dll")]
    [InlineData("C:/executor/test.dll")]
    [InlineData("executor\\..\\test.dll")]
    public void ArchivedPathsCannotEscapeTheOwnedWorkspace(string relative)
    {
        Assert.Throws<InvalidOperationException>(() =>
            BomberFrozenV14Qualification.Within(Path.GetTempPath(), relative));
    }

    [Fact]
    public void ArchivedRelativePathResolvesInsideTheOwnedWorkspace()
    {
        string root = Path.Combine(Path.GetTempPath(), "v14-guard-root");
        Assert.Equal(Path.Combine(root, "executor", "test.dll"),
            BomberFrozenV14Qualification.Within(root, "executor/test.dll"));
    }
}
