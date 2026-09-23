using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

/// <summary>
/// ADR-117 guard: no project of this repository may reference anything under an engine repository's
/// <c>tests/</c>, <c>fixtures/</c> or <c>samples/</c>. Engine fixtures carry no API stability promise, so a
/// compile-time edge to one turns every engine test refactor into a breaking change here (it already
/// happened twice: the 2026-09-15 Boot signature change and the 2026-09-22 fixture move).
/// The check runs on MSBuild's own evaluation of every project in <c>LumioGame.sln</c>, once for the outer
/// build and once per target framework, so references hidden behind properties, imports or
/// TargetFramework conditions are seen with their resolved paths.
/// </summary>
public sealed class EngineTestAssetReferenceGuardTests
{
    private static readonly string[] ForbiddenSegments = { "tests", "fixtures", "samples" };
    private static readonly TimeSpan EvaluationTimeout = TimeSpan.FromMinutes(10);

    [Fact]
    public async Task NoProjectOrAssemblyReferencePointsIntoEngineTestsFixturesOrSamples()
    {
        string repoRoot = RepoRoot();
        IReadOnlyList<string> projects = SolutionProjects(repoRoot);
        Assert.True(projects.Count >= 4, "LumioGame.sln lists fewer projects than expected: " + string.Join(", ", projects));

        Evaluation[] outer = await Task.WhenAll(projects.Select(project => Evaluate(repoRoot, project, targetFramework: null)));
        var perFramework = new List<Task<Evaluation>>();
        foreach (Evaluation evaluation in outer)
        {
            string[] frameworks = evaluation.TargetFrameworks.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (string framework in frameworks)
            {
                perFramework.Add(Evaluate(repoRoot, evaluation.Project, framework));
            }
        }

        Evaluation[] all = outer.Concat(await Task.WhenAll(perFramework)).ToArray();

        var violations = new SortedSet<string>(StringComparer.Ordinal);
        int engineReferences = 0;
        foreach (Evaluation evaluation in all)
        {
            Assert.False(string.IsNullOrEmpty(evaluation.RuntimeRoot), "LumioRuntimeRoot did not resolve for " + evaluation.Label);
            foreach (string path in evaluation.ReferencePaths)
            {
                if (IsUnder(path, repoRoot))
                {
                    continue;
                }

                engineReferences++;
                string? segment = ForbiddenSegment(path, repoRoot, evaluation.RuntimeRoot);
                if (segment is not null)
                {
                    violations.Add($"{evaluation.Label} -> {path} (engine '{segment}/' segment, ADR-117)");
                }
            }
        }

        // The Runtime production references must be visible, or this guard is looking at nothing and passes vacuously.
        Assert.True(engineReferences > 0, "No engine reference was evaluated; the guard would pass without checking anything.");
        if (violations.Count > 0)
        {
            Assert.Fail("Engine test assets referenced at compile time:\n" + string.Join("\n", violations));
        }
    }

    /// <summary>
    /// The forbidden segment is judged on the part of the path inside the engine repository, so the directory
    /// the checkouts happen to live in (a CI workspace called <c>tests</c>, say) cannot trigger or mask it.
    /// </summary>
    private static string? ForbiddenSegment(string path, string repoRoot, string runtimeRoot)
    {
        string? workspace = Path.GetDirectoryName(repoRoot.TrimEnd(Path.DirectorySeparatorChar));
        string inside = IsUnder(path, runtimeRoot)
            ? Path.GetRelativePath(runtimeRoot, path)
            : workspace is not null && IsUnder(path, workspace)
                ? Path.GetRelativePath(workspace, path)
                : path;
        string[] segments = inside.Split(new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }, StringSplitOptions.RemoveEmptyEntries);
        return segments.Take(segments.Length - 1).FirstOrDefault(
            segment => ForbiddenSegments.Contains(segment, StringComparer.OrdinalIgnoreCase));
    }

    private static bool IsUnder(string path, string root)
    {
        string normalizedRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return Path.GetFullPath(path).StartsWith(normalizedRoot, StringComparison.Ordinal);
    }

    private static string RepoRoot()
    {
        for (DirectoryInfo? directory = new(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "LumioGame.sln")))
            {
                return directory.FullName;
            }
        }

        throw new InvalidOperationException("LumioGame.sln not found above " + AppContext.BaseDirectory);
    }

    private static IReadOnlyList<string> SolutionProjects(string repoRoot)
    {
        var projectLine = new Regex(@"^Project\(""\{[^}]+\}""\) = ""[^""]+"", ""([^""]+\.csproj)""", RegexOptions.CultureInvariant);
        return File.ReadAllLines(Path.Combine(repoRoot, "LumioGame.sln"))
            .Select(line => projectLine.Match(line))
            .Where(match => match.Success)
            .Select(match => Path.GetFullPath(Path.Combine(repoRoot, match.Groups[1].Value.Replace('\\', Path.DirectorySeparatorChar))))
            .ToArray();
    }

    private static async Task<Evaluation> Evaluate(string repoRoot, string project, string? targetFramework)
    {
        var start = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = repoRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        start.ArgumentList.Add("msbuild");
        start.ArgumentList.Add(project);
        start.ArgumentList.Add("-nologo");
        start.ArgumentList.Add("-getProperty:_LumioRuntimeRoot");
        start.ArgumentList.Add("-getProperty:TargetFrameworks");
        start.ArgumentList.Add("-getItem:ProjectReference");
        start.ArgumentList.Add("-getItem:Reference");
        if (targetFramework is not null)
        {
            start.ArgumentList.Add("-p:TargetFramework=" + targetFramework);
        }

        using Process process = Process.Start(start)!;
        Task<string> stdout = process.StandardOutput.ReadToEndAsync();
        Task<string> stderr = process.StandardError.ReadToEndAsync();
        Task exited = process.WaitForExitAsync();
        if (await Task.WhenAny(exited, Task.Delay(EvaluationTimeout)) != exited)
        {
            process.Kill(entireProcessTree: true);
            throw new TimeoutException("MSBuild evaluation timed out for " + project);
        }

        string output = await stdout;
        string label = Path.GetRelativePath(repoRoot, project) + (targetFramework is null ? string.Empty : " [" + targetFramework + "]");
        if (process.ExitCode != 0)
        {
            Assert.Fail($"MSBuild evaluation failed for {label} (exit {process.ExitCode}):\n{output}\n{await stderr}");
        }

        using JsonDocument document = JsonDocument.Parse(output);
        JsonElement properties = document.RootElement.GetProperty("Properties");
        JsonElement items = document.RootElement.GetProperty("Items");
        var paths = new List<string>();
        foreach (string itemType in new[] { "ProjectReference", "Reference" })
        {
            if (!items.TryGetProperty(itemType, out JsonElement list))
            {
                continue;
            }

            foreach (JsonElement item in list.EnumerateArray())
            {
                paths.Add(item.GetProperty("FullPath").GetString()!);
                if (item.TryGetProperty("HintPath", out JsonElement hint) && !string.IsNullOrWhiteSpace(hint.GetString()))
                {
                    paths.Add(Path.GetFullPath(hint.GetString()!, Path.GetDirectoryName(project)!));
                }
            }
        }

        return new Evaluation(
            project,
            label,
            properties.GetProperty("_LumioRuntimeRoot").GetString() ?? string.Empty,
            properties.GetProperty("TargetFrameworks").GetString() ?? string.Empty,
            paths);
    }

    private sealed record Evaluation(string Project, string Label, string RuntimeRoot, string TargetFrameworks, IReadOnlyList<string> ReferencePaths);
}
