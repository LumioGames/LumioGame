using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Xml.Linq;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests
{
    public sealed class SdkPackConsumeTests
    {
        private static string RepoRoot => Lumio.Bomber.Tests.EngineRelease.RepoRoot;

        [Fact]
        public void NativeComesFromTheExactSdkCopiedWithThisTestAssembly()
        {
            string name = OperatingSystem.IsWindows() ? "lumio_engine_native.dll" :
                OperatingSystem.IsMacOS() ? "liblumio_engine_native.dylib" : "liblumio_engine_native.so";
            string expected = Path.Combine(AppContext.BaseDirectory, "runtimes", Lumio.Bomber.Tests.EngineRelease.Rid, "native", name);
            Assert.Equal(expected, Lumio.Bomber.Tests.EngineRelease.NativeLibrary);
            Assert.True(File.Exists(expected));
            Assert.True(File.Exists(Path.Combine(Path.GetDirectoryName(expected)!, "build-info.json")));
        }

        /// <summary>
        /// ADR-123: the build resolves the engine from Engine/ only. Each case copies the build
        /// inputs and bare SDK probe into an isolated root, so this checkout's Engine/ cannot
        /// hide a miss.
        /// </summary>
        private static string IsolatedWorkspace(string name)
        {
            // Dev SDK identities contain the complete content hash. Keep the leaf short
            // so MSBuild Exists still sees the exact package under long private TEMP roots.
            string root = Path.Combine(Path.GetTempPath(), "sdk-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path.Combine(root, "eng"));
            File.WriteAllText(Path.Combine(root, "scenario.txt"), name);
            foreach (string file in new[] { "Directory.Build.props", "Directory.Build.targets", "Directory.Packages.props", "NuGet.config" })
                File.Copy(Path.Combine(RepoRoot, file), Path.Combine(root, file));
            File.Copy(Path.Combine(RepoRoot, "eng", "BomberRelease.props"), Path.Combine(root, "eng", "BomberRelease.props"));
            File.Copy(Path.Combine(RepoRoot, "eng", "ResolveLumioSdk.proj"), Path.Combine(root, "eng", "ResolveLumioSdk.proj"));
            File.Copy(Path.Combine(RepoRoot, "eng", "EngineCandidate.targets"), Path.Combine(root, "eng", "EngineCandidate.targets"));
            File.Copy(Path.Combine(RepoRoot, "eng", "select-engine-candidate.mjs"), Path.Combine(root, "eng", "select-engine-candidate.mjs"));
            return root;
        }

        private static void WriteRelease(string root, string manifestVersion, string nupkgVersion)
        {
            Directory.CreateDirectory(Path.Combine(root, "Engine", "sdk"));
            File.WriteAllText(Path.Combine(root, "Engine", "manifest.json"),
                "{\n  \"formatVersion\": 1,\n  \"version\": \"" + manifestVersion + "\",\n  \"platforms\": [\"linux-x64\"]\n}\n");
            File.WriteAllBytes(Path.Combine(root, "Engine", "sdk", "Lumio.Engine.SDK." + nupkgVersion + ".nupkg"), Array.Empty<byte>());
        }

        private static (int ExitCode, string Output) Run(string workingDirectory, params string[] arguments)
        {
            var start = new ProcessStartInfo
            {
                FileName = "dotnet",
                WorkingDirectory = workingDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            foreach (string argument in arguments) start.ArgumentList.Add(argument);
            start.Environment.Remove("LumioSdkVersion");
            using Process process = Process.Start(start)!;
            string output = process.StandardOutput.ReadToEnd();
            string error = process.StandardError.ReadToEnd();
            process.WaitForExit();
            return (process.ExitCode, output + Environment.NewLine + error);
        }

        private static (int ExitCode, string Output) ResolveLumioSdk(string root) =>
            Run(root, "msbuild", Path.Combine("eng", "ResolveLumioSdk.proj"), "-nologo", "-restore:false", "-t:ResolveLumioSdk");

        [Fact]
        public void EmptyEngineFailsWithTheSubmoduleCommand()
        {
            string root = IsolatedWorkspace("lumio-sdk-empty-engine");
            try
            {
                Directory.CreateDirectory(Path.Combine(root, "Engine"));
                (int exitCode, string output) = ResolveLumioSdk(root);
                Assert.NotEqual(0, exitCode);
                Assert.Contains("LUMIO_SDK_UNRESOLVED", output);
                Assert.DoesNotContain("LUMIO_SDK_VERSION_MISMATCH", output);
                Assert.Contains("git submodule update --init --depth 1 Engine", output);
            }
            finally
            {
                Directory.Delete(root, recursive: true);
            }
        }

        [Fact]
        public void ManifestAndPackageMustBeTheSameRelease()
        {
            string root = IsolatedWorkspace("lumio-sdk-mismatch");
            try
            {
                WriteRelease(root, manifestVersion: "0.0.2", nupkgVersion: "0.0.1");
                (int exitCode, string output) = ResolveLumioSdk(root);
                Assert.NotEqual(0, exitCode);
                Assert.Contains("LUMIO_SDK_UNRESOLVED", output);
                Assert.DoesNotContain("LUMIO_SDK_VERSION_MISMATCH", output);
                Assert.Contains("manifest version='0.0.2'", output);
            }
            finally
            {
                Directory.Delete(root, recursive: true);
            }
        }

        private static string RequiredVersion(string root)
        {
            string? version = XDocument.Load(Path.Combine(root, "eng", "BomberRelease.props"))
                .Root?.Element("PropertyGroup")?.Element("LumioRequiredSdkVersion")?.Value;
            Assert.False(string.IsNullOrWhiteSpace(version));
            return version!;
        }

        [Fact]
        public void PackageWithoutManifestIsUnresolved()
        {
            string root = IsolatedWorkspace("lumio-sdk-missing-manifest");
            try
            {
                WriteRelease(root, manifestVersion: "0.0.4", nupkgVersion: "0.0.4");
                File.Delete(Path.Combine(root, "Engine", "manifest.json"));
                (int exitCode, string output) = ResolveLumioSdk(root);
                Assert.NotEqual(0, exitCode);
                Assert.Contains("LUMIO_SDK_UNRESOLVED", output);
                Assert.DoesNotContain("LUMIO_SDK_VERSION_MISMATCH", output);
            }
            finally
            {
                Directory.Delete(root, recursive: true);
            }
        }

        [Fact]
        public void RequiredReleaseWithoutItsPackageIsUnresolved()
        {
            string root = IsolatedWorkspace("lumio-sdk-missing-package");
            try
            {
                string requiredVersion = RequiredVersion(root);
                WriteRelease(root, manifestVersion: requiredVersion, nupkgVersion: "0.0.3");
                (int exitCode, string output) = ResolveLumioSdk(root);
                Assert.NotEqual(0, exitCode);
                Assert.Contains("LUMIO_SDK_UNRESOLVED", output);
                Assert.DoesNotContain("LUMIO_SDK_VERSION_MISMATCH", output);
                Assert.Contains("manifest version='" + requiredVersion + "'", output);
            }
            finally
            {
                Directory.Delete(root, recursive: true);
            }
        }

        [Fact]
        public void OfficialReleasePassesSdkResolution()
        {
            string root = IsolatedWorkspace("lumio-sdk-official-release");
            try
            {
                string requiredVersion = RequiredVersion(root);
                WriteRelease(root, manifestVersion: requiredVersion, nupkgVersion: requiredVersion);
                (int exitCode, string output) = Run(root, "msbuild", Path.Combine("eng", "ResolveLumioSdk.proj"),
                    "-nologo", "-restore:false", "-t:Build");
                Assert.True(exitCode == 0, output);
                Assert.Contains("LUMIO_SDK_RESOLVED: Lumio.Engine.SDK " + requiredVersion + " from", output);
            }
            finally
            {
                Directory.Delete(root, recursive: true);
            }
        }

        [Theory]
        [InlineData("0.0.4")]
        [InlineData("0.0.1")]
        [InlineData("0.0.1-main.7f9f8fa")]
        public void HistoricalReleaseFailsTheRequiredSdkVersionGate(string version)
        {
            string root = IsolatedWorkspace("lumio-sdk-historical-release");
            try
            {
                WriteRelease(root, version, version);
                (int exitCode, string output) = ResolveLumioSdk(root);
                Assert.NotEqual(0, exitCode);
                Assert.Contains("LUMIO_SDK_VERSION_MISMATCH", output);
                Assert.Contains(version, output);
                Assert.Contains(RequiredVersion(root), output);
                Assert.DoesNotContain("LUMIO_SDK_UNRESOLVED", output);
            }
            finally
            {
                Directory.Delete(root, recursive: true);
            }
        }

        [Theory]
        [InlineData("0.0.1")]
        [InlineData("0.0.1-main.7f9f8fa")]
        public void EngineManifestSelectsTheExactEngineSdkVersion(string version)
        {
            string root = IsolatedWorkspace("lumio-sdk-version");
            try
            {
                WriteRelease(root, version, version);
                Directory.CreateDirectory(Path.Combine(root, "probe"));
                File.WriteAllText(Path.Combine(root, "probe", "probe.csproj"),
                    "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>");
                (int exitCode, string output) = Run(root, "msbuild", Path.Combine("probe", "probe.csproj"), "-nologo", "-getItem:PackageVersion");
                Assert.True(exitCode == 0, output);
                using JsonDocument document = JsonDocument.Parse(output);
                bool found = false;
                foreach (JsonElement package in document.RootElement.GetProperty("Items").GetProperty("PackageVersion").EnumerateArray())
                {
                    if (package.GetProperty("Identity").GetString() != "Lumio.Engine.SDK") continue;
                    Assert.False(found);
                    Assert.Equal(version, package.GetProperty("Version").GetString());
                    found = true;
                }
                Assert.True(found);
            }
            finally
            {
                Directory.Delete(root, recursive: true);
            }
        }

        [Fact]
        public void TheEngineHasExactlyOneSourceEngineSlashSdk()
        {
            string targets = File.ReadAllText(Path.Combine(RepoRoot, "Directory.Build.targets"));
            string props = File.ReadAllText(Path.Combine(RepoRoot, "Directory.Build.props"));
            string nuget = File.ReadAllText(Path.Combine(RepoRoot, "NuGet.config"));
            Assert.Contains("PackageReference Include=\"Lumio.Engine.SDK\"", targets);
            Assert.Contains("git submodule update --init --depth 1 Engine", targets);
            Assert.Contains("$(MSBuildThisFileDirectory)Engine/", props);
            // No sibling ProjectReference, no global-packages probe, no ad-hoc feed. The retired
            // names are assembled here so that this guard is not itself a hit of the repository grep.
            foreach (string gone in new[] { "ProjectReference", "Lumio" + "RuntimeRoot", "NuGetPackageRoot", "LumioLocalFeed", "LumioSdkMode", "Lumio" + "ArchRoot" })
            {
                Assert.DoesNotContain(gone, targets);
                Assert.DoesNotContain(gone, props);
            }
            Assert.Contains("<add key=\"lumio-engine\" value=\"Engine/sdk\" />", nuget);
            Assert.Contains("<package pattern=\"Lumio.Engine.SDK\" />", nuget);
        }

        [Fact]
        public void TestProjectDisablesEcsGeneration()
        {
            string targets = File.ReadAllText(Path.Combine(RepoRoot, "Directory.Build.targets"));
            string csproj = File.ReadAllText(Path.Combine(RepoRoot, "Tools", "Lumio.Bomber.Gameplay.Tests", "Lumio.Bomber.Gameplay.Tests.csproj"));
            Assert.Contains("<LumioEcsGenerate>false</LumioEcsGenerate>", csproj);
            Assert.Contains("MSBuildProjectName)' == 'Lumio.Bomber.Gameplay.Tests'", targets);
            Assert.Contains("<LumioEcsGenerate>false</LumioEcsGenerate>", targets);
        }
    }
}
