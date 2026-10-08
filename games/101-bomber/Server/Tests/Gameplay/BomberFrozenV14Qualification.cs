using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Tests;

// Historical qualification runs with its complete identified reader and original
// source. The current schema's restore and producer coverage remain separate cases.
internal static class BomberFrozenV14Qualification
{
    private const string ReaderGame = "61ffd66564c634a13b173a04af4eefcd212e1305da41d27d07675de1f13b5e55";
    private const string ReaderTests = "a64e31f353fbd962de55674348222038b8cddf1ccaf2b63b523ab90fa856f009";
    private const string ReaderEcs = "aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49";
    private const string FreezeManifest = "9311302f83d1d8ebaeec3f37a444d7680a43a7853cce17fe5e41bc2d918a2775";
    private const string CaptureGame = "78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e";
    private const string OriginalWorld = "6a0e5a671cdb89a003c4567ccefa9534481c0fcd48e147b10c583d8aabd755a8";
    private const string OriginalMetadata = "d9512037e1f85c11775ced7271a31ceb970e6947bcf67b9789b00060d25fb573";
    private const string ConfigCommit = "a991a517f9dbae255321c25d65fea0bfdfdca42f";
    private const string PythonSha256 = "5f7b89a612c9b8af1d6456cdfcd1dbe5ca630849e79aebced9bee9a6694952ec";
    private const string HistoricalWorkspaceMarker = "/.run/v14-cap5-executor-freeze-01/workspace/";
    private const string Cut = ".artifacts/resource-contact-world/old-world-cap5-0bb1c9bca38e454fb187e5874ec84c44";
    private static readonly JsonSerializerOptions EvidenceOptions = new() { WriteIndented = true };
    private static readonly string[] PassedEnvironment =
        ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "DOTNET_ROOT", "DOTNET_ROOT_X64"];

    internal sealed record Counts(int Total, int Failed, int Succeeded, int Skipped);
    private sealed record FrozenFile(string Relative, string Sha256, long Bytes);
    private sealed record ConfigLink(string Relative, string GitMode, string GitBlob, string Target, string ResolvedRelative);
    private const string ConfigLinkBlob = "ed0ce3da518616ba5a06acc7262dabb1ff1451c9";
    private sealed record ProcessResult(int ExitCode, string Output, bool TimedOut);

    // False means the exact qualified reader is executing the original body in
    // this process. True means that same complete body passed in its frozen reader.
    internal static bool RunForDifferentReader(string className, string methodName)
    {
        if (Hash(typeof(BomberBombState).Assembly.Location) == ReaderGame)
        {
            Require(Hash(typeof(World).Assembly.Location) == ReaderEcs, "v14 direct reader Runtime identity differs");
            return false;
        }
        Require((className, methodName) is
            (nameof(BomberContactImmutableV14CompatibilityQualificationTests), "IdentifiedV14ReaderRoundtripsTheUnmodifiedEarlierFiveContactWorld") or
            (nameof(BomberContactOldWorldSnapshotTests), "CurrentFiveContactWorldCapturesAndReadsItsActualCanonicalOriginal"),
            "v14 qualification case is not registered");
        Require(OperatingSystem.IsWindows() && Environment.Is64BitProcess,
            "V14_QUALIFICATION_DEPENDENCY_MISSING: this archived reader requires the win-x64 .NET 10 runtime");

        string archive = Path.GetFullPath(Environment.GetEnvironmentVariable("LUMIO_BOMBER_V14_QUALIFICATION_ARCHIVE")
            ?? Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot, "../../.run/v14-cap5-executor-freeze-01"));
        string source = Within(archive, "workspace");
        string manifest = Within(archive, "executor-freeze.json");
        Require(File.Exists(manifest), "V14_QUALIFICATION_DEPENDENCY_MISSING: install the complete pinned v14 reader archive");
        Require(Hash(manifest) == FreezeManifest, "V14_QUALIFICATION_DEPENDENCY_MISSING: exact frozen manifest is required");
        FrozenFile[] files = ReadFrozenFiles(manifest);
        VerifyFiles(source, files);
        VerifyOriginalCapture(source);
        VerifyExecutorInventory(source, files);

        string config = RequiredAbsoluteEnvironment("LUMIO_CONFIG_ROOT");
        string python = RequiredAbsoluteEnvironment("LUMIO_PYTHON");
        Require(Directory.Exists(config) && File.Exists(python),
            "V14_QUALIFICATION_DEPENDENCY_MISSING: pinned Config source and Python installation are required");
        string git = Executable("git");
        string dotnet = Executable("dotnet", "DOTNET_HOST_PATH");
        string gitSha256 = Hash(git), dotnetSha256 = Hash(dotnet);
        Require(Hash(python) == PythonSha256, "v14 qualification Python executable identity differs");
        ProcessResult pythonVersion = Run(python, ["--version"], config);
        Require(pythonVersion.ExitCode == 0 && !pythonVersion.TimedOut && pythonVersion.Output.Trim() == "Python 3.11.9",
            "V14_QUALIFICATION_DEPENDENCY_MISSING: exact Python 3.11.9 is required");
        VerifyConfigCommit(git, config);
        ProcessResult tracked = Run(git, ["-C", config, "ls-files", "-z"], config);
        Require(tracked.ExitCode == 0 && !tracked.TimedOut, "v14 Config tracked input inventory failed");
        string[] configTracked = tracked.Output.Split('\0', StringSplitOptions.RemoveEmptyEntries);
        ConfigLink[] configLinks = ReadConfigLinks(git, config);
        Require(configTracked.Distinct(StringComparer.Ordinal).Count() == configTracked.Length &&
            configLinks.All(link => configTracked.Contains(link.Relative, StringComparer.Ordinal)),
            "v14 Config tracked directory-link inventory differs");
        FrozenFile[] configFiles = configTracked
            .Where(relative => !configLinks.Any(link => link.Relative == relative))
            .Select(relative => new FrozenFile(relative, Hash(Within(config, relative)), new FileInfo(Within(config, relative)).Length)).ToArray();
        Require(configFiles.Length > 0, "v14 Config tracked input inventory is empty");

        string runRoot = Within(Lumio.Bomber.Tests.EngineRelease.RepoRoot,
            ".artifacts/v14-qualification/" + className + "-" + Guid.NewGuid().ToString("N"));
        Require(!Directory.Exists(runRoot), "v14 qualification requires a fresh output directory");
        Require(!Contains(archive, runRoot) && !Contains(runRoot, archive), "v14 qualification archive and output overlap");
        Directory.CreateDirectory(runRoot);
        File.WriteAllText(Within(runRoot, "config-inputs.json"), JsonSerializer.Serialize(new { RegularFiles = configFiles, DirectoryLinks = configLinks }, EvidenceOptions) + "\n");
        string workspace = Within(runRoot, "workspace");
        CopyFrozenFiles(source, workspace, files);
        VerifyFiles(workspace, files);
        string log = Within(runRoot, "child.log");
        string[] arguments = [Within(workspace, "executor/Lumio.Bomber.Gameplay.Tests.dll"),
            "--filter-class", "*Lumio.Bomber.Gameplay.Tests." + className,
            "--filter-method", "*" + methodName + "*", "--minimum-expected-tests", "1"];
        ProcessResult? child = null;
        Counts? counts = null;
        bool completed = false;
        string? failure = null;
        DateTime startedUtc = DateTime.UtcNow;
        try
        {
            child = Run(dotnet, arguments, workspace,
                new Dictionary<string, string> { ["LUMIO_CONFIG_ROOT"] = config, ["LUMIO_PYTHON"] = python,
                    ["LUMIO_RESOURCE_CONTACT_OLD_WORLD"] = Within(workspace, Cut) });
            File.WriteAllText(log, child.Output, new UTF8Encoding(false));
            File.WriteAllText(Within(runRoot, "child.exit"), child.ExitCode.ToString(CultureInfo.InvariantCulture) + "\n");
            Require(child.ExitCode == 0 && !child.TimedOut, "v14 original case failed; complete output retained at " + log);
            counts = ReadCounts(child.Output);
            completed = true;
        }
        catch (Exception exception)
        {
            failure = exception.GetType().Name;
            throw;
        }
        finally
        {
            var fenceFailures = new List<string>();
            CheckFence(() => Require(Hash(manifest) == FreezeManifest, "freeze manifest changed"), fenceFailures);
            CheckFence(() => VerifyFiles(source, files), fenceFailures);
            CheckFence(() => VerifyOriginalCapture(source), fenceFailures);
            CheckFence(() => VerifyExecutorInventory(source, files), fenceFailures);
            CheckFence(() => VerifyFiles(workspace, files), fenceFailures);
            CheckFence(() => VerifyOriginalCapture(workspace), fenceFailures);
            CheckFence(() => VerifyExecutorInventory(workspace, files), fenceFailures);
            CheckFence(() => VerifyConfigCommit(git, config), fenceFailures);
            CheckFence(() => VerifyFiles(config, configFiles), fenceFailures);
            CheckFence(() => Require(ReadConfigLinks(git, config).SequenceEqual(configLinks),
                "v14 Config tracked directory links changed"), fenceFailures);
            CheckFence(() => Require(Hash(python) == PythonSha256, "Python executable changed"), fenceFailures);
            CheckFence(() => Require(Hash(dotnet) == dotnetSha256 && Hash(git) == gitSha256,
                "qualification dependency executable changed"), fenceFailures);
            File.WriteAllText(Within(runRoot, "qualification.json"), JsonSerializer.Serialize(new
            {
                Kind = "complete unchanged v14 Fact executed by separately identified compatible reader",
                Class = className, Method = methodName, StartedUtc = startedUtc, EndedUtc = DateTime.UtcNow,
                FreezeManifestSha256 = FreezeManifest, FrozenFiles = files.Length,
                OriginalCaptureGameSha256 = CaptureGame, CompatibleReaderGameSha256 = ReaderGame,
                CompatibleReaderTestsSha256 = ReaderTests, OriginalCaptureExecutorRecovered = false,
                ConfigSourceCommit = ConfigCommit, ConfigTrackedFiles = configFiles.Length + configLinks.Length,
                ConfigDirectoryLinks = configLinks,
                ConfigRoot = config, PythonPath = python, DotnetHost = dotnet, Arguments = arguments,
                PythonExecutableSha256 = PythonSha256, PythonVersion = "3.11.9",
                DotnetHostSha256 = dotnetSha256, GitExecutableSha256 = gitSha256,
                RawExitCode = child?.ExitCode, TimedOut = child?.TimedOut,
                Counts = counts, LogSha256 = File.Exists(log) ? Hash(log) : null,
                Passed = completed && fenceFailures.Count == 0, Failure = failure, FenceFailures = fenceFailures,
            }, EvidenceOptions) + "\n");
            Console.WriteLine("V14_QUALIFICATION_EVIDENCE=" + runRoot);
            Require(fenceFailures.Count == 0, "v14 qualification immutable input fence failed; see " + runRoot);
        }
        return true;
    }

    private static FrozenFile[] ReadFrozenFiles(string manifest)
    {
        using JsonDocument document = JsonDocument.Parse(File.ReadAllBytes(manifest));
        JsonElement root = document.RootElement;
        Require(root.GetProperty("compatibleReaderGameSha256").GetString() == ReaderGame &&
            root.GetProperty("originalCaptureGameSha256").GetString() == CaptureGame &&
            root.GetProperty("buildSourceFiles").GetInt32() == 385, "v14 freeze release identity differs");
        FrozenFile[] files = root.GetProperty("files").EnumerateArray().Select(row =>
        {
            string path = row.GetProperty("path").GetString()!.Replace('\\', '/');
            int offset = path.IndexOf(HistoricalWorkspaceMarker, StringComparison.Ordinal);
            Require(offset >= 0 && offset == path.LastIndexOf(HistoricalWorkspaceMarker, StringComparison.Ordinal),
                "v14 manifest path is outside its historical workspace");
            return new FrozenFile(path[(offset + HistoricalWorkspaceMarker.Length)..],
                row.GetProperty("sha256").GetString()!, row.GetProperty("bytes").GetInt64());
        }).ToArray();
        Require(files.Length == 3688 && files.Sum(file => file.Bytes) == 42037481 &&
            files.Select(file => file.Relative).Distinct(StringComparer.OrdinalIgnoreCase).Count() == files.Length,
            "v14 frozen input inventory differs");
        Require(files.Single(file => file.Relative == "executor/Lumio.Bomber.Gameplay.dll").Sha256 == ReaderGame &&
            files.Single(file => file.Relative == "executor/Lumio.Bomber.Gameplay.Tests.dll").Sha256 == ReaderTests &&
            files.Single(file => file.Relative == "Server/Tests/Gameplay/BomberContactImmutableV14CompatibilityQualificationTests.cs").Sha256 ==
                "ff28567a450c761f0a69e26bc749e345c6960a9de6d06404fbcf0ef573deb5bc" &&
            files.Single(file => file.Relative == "Server/Tests/Gameplay/BomberContactOldWorldSnapshotTests.cs").Sha256 ==
                "f6ae21120da18be7424453e65a1b0772e70aafeb1f6f261d7f5f912d785dd3d5",
            "v14 original case source or executable identity differs");
        return files;
    }

    private static void VerifyOriginalCapture(string workspace)
    {
        string cut = Within(workspace, Cut);
        Require(Hash(Within(cut, "original.lwm")) == OriginalWorld &&
            new FileInfo(Within(cut, "original.lwm")).Length == 21487 &&
            Hash(Within(cut, "actual.json")) == OriginalMetadata, "v14 original capture changed");
        using JsonDocument metadata = JsonDocument.Parse(File.ReadAllBytes(Within(cut, "actual.json")));
        JsonElement root = metadata.RootElement;
        Require(root.GetProperty("GameSha256").GetString() == CaptureGame &&
            root.GetProperty("RuntimeSha256").GetString() == ReaderEcs, "v14 original capture provenance differs");
        JsonElement[] exports = root.GetProperty("ExportFiles").EnumerateArray().ToArray();
        string[] expected = exports.Select(row => row.GetProperty("Path").GetString()!).Order(StringComparer.Ordinal).ToArray();
        string exportRoot = Within(cut, "config");
        string[] actual = SafeFiles(exportRoot)
            .Select(path => Path.GetRelativePath(exportRoot, path).Replace('\\', '/')).Order(StringComparer.Ordinal).ToArray();
        Require(expected.Length == 31 && expected.Distinct(StringComparer.Ordinal).Count() == 31 && expected.SequenceEqual(actual),
            "v14 original capture's complete 31-export inventory differs");
        foreach (JsonElement export in exports)
            Require(Hash(Within(exportRoot, export.GetProperty("Path").GetString()!)) == export.GetProperty("Sha256").GetString(),
                "v14 original capture export changed");
    }

    private static void VerifyExecutorInventory(string workspace, FrozenFile[] files)
    {
        string executor = Within(workspace, "executor");
        string[] expected = files.Where(file => file.Relative.StartsWith("executor/", StringComparison.Ordinal))
            .Select(file => file.Relative["executor/".Length..]).Order(StringComparer.Ordinal).ToArray();
        string[] actual = SafeFiles(executor)
            .Select(path => Path.GetRelativePath(executor, path).Replace('\\', '/')).Order(StringComparer.Ordinal).ToArray();
        Require(expected.SequenceEqual(actual), "v14 executor contains missing or additional resolution inputs");
    }

    private static void VerifyFiles(string root, FrozenFile[] files)
    {
        foreach (FrozenFile file in files)
        {
            string path = Within(root, file.Relative);
            NoLinks(path);
            Require(new FileInfo(path).Length == file.Bytes && Hash(path) == file.Sha256,
                "v14 frozen input changed: " + file.Relative);
        }
    }

    private static void CopyFrozenFiles(string source, string destination, FrozenFile[] files)
    {
        Require(!Directory.Exists(destination), "v14 execution workspace must be new");
        Directory.CreateDirectory(destination);
        foreach (FrozenFile file in files)
        {
            string target = Within(destination, file.Relative);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            NoLinks(Path.GetDirectoryName(target)!);
            File.Copy(Within(source, file.Relative), target, overwrite: false);
        }
    }

    private static void VerifyConfigCommit(string git, string root)
    {
        ProcessResult commit = Run(git, ["-C", root, "rev-parse", "HEAD"], root);
        ProcessResult clean = Run(git, ["-C", root, "status", "--porcelain=v1", "--untracked-files=all"], root);
        Require(commit.ExitCode == 0 && !commit.TimedOut && commit.Output.Trim() == ConfigCommit &&
            clean.ExitCode == 0 && !clean.TimedOut && clean.Output.Length == 0,
            "V14_QUALIFICATION_DEPENDENCY_MISSING: exact clean Config source a991a517 is required");
    }

    private static ConfigLink[] ReadConfigLinks(string git, string root)
    {
        ProcessResult tracked = Run(git, ["-C", root, "ls-files", "--stage", "-z", "--", ".agents/skills", ".claude/skills"], root);
        Require(tracked.ExitCode == 0 && !tracked.TimedOut, "v14 Config directory-link Git inventory failed");
        ConfigLink[] links = tracked.Output.Split('\0', StringSplitOptions.RemoveEmptyEntries).Select(row =>
        {
            int tab = row.IndexOf('\t');
            Require(tab > 0, "v14 Config directory-link Git entry is malformed");
            string[] identity = row[..tab].Split(' ');
            Require(identity.Length == 3 && identity[2] == "0", "v14 Config directory-link Git stage differs");
            string relative = row[(tab + 1)..];
            VerifyConfigLink(root, relative, identity[0], identity[1]);
            return new ConfigLink(relative, identity[0], identity[1], "../.spec/skills", ".spec/skills");
        }).OrderBy(link => link.Relative, StringComparer.Ordinal).ToArray();
        Require(links.Length == 2 && links.Select(link => link.Relative).Distinct(StringComparer.Ordinal).Count() == 2,
            "v14 Config requires both exact pinned Git directory links");
        return links;
    }

    internal static void VerifyConfigLink(string root, string relative, string gitMode, string gitBlob)
    {
        Require(relative is ".agents/skills" or ".claude/skills" && gitMode == "120000" && gitBlob == ConfigLinkBlob,
            "v14 Config directory-link Git identity differs");
        string path = Within(root, relative);
        NoLinks(Path.GetDirectoryName(path)!);
        var link = new DirectoryInfo(path);
        Require((link.Attributes & FileAttributes.ReparsePoint) != 0 &&
            link.LinkTarget?.Replace('\\', '/') == "../.spec/skills",
            "v14 Config directory-link target differs");
        string resolved = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(path)!, link.LinkTarget!));
        Require(resolved.Equals(Within(root, ".spec/skills"),
            OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal),
            "v14 Config directory link escapes its pinned skills directory");
        NoLinks(resolved);
        Require(Directory.Exists(resolved), "v14 Config directory-link target is missing");
    }

    internal static Counts ReadCounts(string output)
    {
        MatchCollection rows = Regex.Matches(output, @"^\s*(total|failed|succeeded|skipped):\s*(\d+)\s*$", RegexOptions.Multiline);
        Require(rows.Count == 4 && rows.Cast<Match>().Select(row => row.Groups[1].Value).Distinct().Count() == 4,
            "v14 child test report is incomplete or repeated");
        var counts = rows.Cast<Match>().ToDictionary(row => row.Groups[1].Value,
            row => int.Parse(row.Groups[2].Value, CultureInfo.InvariantCulture));
        var result = new Counts(counts["total"], counts["failed"], counts["succeeded"], counts["skipped"]);
        Require(result == new Counts(1, 0, 1, 0), "v14 child test report must show exactly 1 passed and 0 failed/skipped");
        return result;
    }

    internal static string Within(string root, string relative)
    {
        string[] segments = relative.Replace('\\', '/').Split('/');
        Require(relative.Length > 0 && !Path.IsPathRooted(relative) && !relative.Contains(':') &&
            segments.All(segment => segment.Length > 0 && segment is not "." and not ".."), "v14 archive path is not relative");
        string path = Path.GetFullPath(Path.Combine(root, Path.Combine(segments)));
        Require(Contains(root, path), "v14 archive path escapes the owned workspace");
        return path;
    }

    private static bool Contains(string root, string path) => Path.GetFullPath(path)
        .StartsWith(Path.TrimEndingDirectorySeparator(Path.GetFullPath(root)) + Path.DirectorySeparatorChar,
            OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);

    internal static void NoLinks(string path)
    {
        for (string? current = Path.GetFullPath(path); current is not null; current = Path.GetDirectoryName(current))
            if (File.Exists(current) || Directory.Exists(current))
                Require((File.GetAttributes(current) & FileAttributes.ReparsePoint) == 0, "v14 frozen paths cannot contain links");
    }

    private static IEnumerable<string> SafeFiles(string root)
    {
        NoLinks(root);
        foreach (string path in Directory.EnumerateFileSystemEntries(root))
        {
            NoLinks(path);
            if (Directory.Exists(path))
            {
                foreach (string child in SafeFiles(path)) yield return child;
            }
            else yield return path;
        }
    }

    private static string RequiredAbsoluteEnvironment(string name)
    {
        string? value = Environment.GetEnvironmentVariable(name);
        Require(!string.IsNullOrWhiteSpace(value) && Path.IsPathFullyQualified(value),
            "V14_QUALIFICATION_DEPENDENCY_MISSING: set " + name + " to the separately installed pinned dependency");
        string path = Path.GetFullPath(value!);
        NoLinks(path);
        return path;
    }

    private static string Executable(string name, string? variable = null)
    {
        string? supplied = variable is null ? null : Environment.GetEnvironmentVariable(variable);
        if (!string.IsNullOrWhiteSpace(supplied))
        {
            Require(Path.IsPathFullyQualified(supplied), "v14 executable dependency must be an absolute path");
            Require(Path.GetFileNameWithoutExtension(supplied).Equals(name, StringComparison.OrdinalIgnoreCase),
                "v14 executable dependency has the wrong host name");
            NoLinks(supplied);
            Require(File.Exists(supplied), "V14_QUALIFICATION_DEPENDENCY_MISSING: " + name);
            return Path.GetFullPath(supplied);
        }
        string filename = OperatingSystem.IsWindows() ? name + ".exe" : name;
        foreach (string directory in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            if (!Path.IsPathFullyQualified(directory)) continue;
            string path = Path.Combine(directory, filename);
            if (!File.Exists(path)) continue;
            NoLinks(path);
            return Path.GetFullPath(path);
        }
        throw new InvalidOperationException("V14_QUALIFICATION_DEPENDENCY_MISSING: " + name);
    }

    private static ProcessResult Run(string executable, string[] arguments, string directory,
        IReadOnlyDictionary<string, string>? additional = null)
    {
        var start = new ProcessStartInfo(executable)
        {
            UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true,
            WorkingDirectory = directory, CreateNoWindow = true,
        };
        start.Environment.Clear();
        foreach (string name in PassedEnvironment)
            if (Environment.GetEnvironmentVariable(name) is { } value) start.Environment[name] = value;
        start.Environment["DOTNET_CLI_UI_LANGUAGE"] = "en";
        start.Environment["PYTHONUTF8"] = "1";
        if (additional is not null)
            foreach (var item in additional) start.Environment[item.Key] = item.Value;
        foreach (string argument in arguments) start.ArgumentList.Add(argument);
        using Process process = Process.Start(start) ?? throw new InvalidOperationException("v14 qualification process did not start");
        var output = process.StandardOutput.ReadToEndAsync();
        var errors = process.StandardError.ReadToEndAsync();
        bool timedOut = !process.WaitForExit(180000);
        if (timedOut) process.Kill(entireProcessTree: true);
        process.WaitForExit();
        return new ProcessResult(process.ExitCode, output.GetAwaiter().GetResult() + errors.GetAwaiter().GetResult(), timedOut);
    }

    private static string Hash(string path)
    {
        NoLinks(path);
        using FileStream stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    private static void CheckFence(Action check, List<string> failures)
    {
        try { check(); }
        catch (Exception exception) { failures.Add(exception.GetType().Name); }
    }

    private static void Require(bool condition, string detail)
    {
        if (!condition) throw new InvalidOperationException(detail);
    }
}
