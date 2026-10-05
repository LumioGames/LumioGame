using System;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Xunit;

namespace Lumio.Bomber.Server.HostTests;

/// <summary>
/// Reflection-only access to <c>Lumio.Server.HostEntry</c>.
///
/// ADR-115: the game workspace does not own a server host, so it cannot take a
/// compile-time reference on LumioServer. The host assembly is the Engine/ release's
/// <c>server/&lt;rid&gt;/Application/Lumio.Server.HostEntry.dll</c> (ADR-123) — the same
/// assembly <c>Server/Config/Startup/server.json</c> names as <c>clr.entry_type</c> — and
/// every call below goes through reflection, exactly as the two cases in this directory
/// already did for <c>Manager</c> / <c>ActiveWorld</c>.
///
/// Every missing input is a named failure, never a skip: these cases carry engine
/// guarantees (R-00692 acceptance items 10 and 11) and "did not run" is not a
/// passing outcome.
/// </summary>
internal static class HostEntryBridge
{
    private static Assembly? _hostEntryAssembly;

    internal static string? Path(string variable)
    {
        string? value = Environment.GetEnvironmentVariable(variable);
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    internal static string Require(string variable, string why)
    {
        string? value = Path(variable);
        Assert.True(value is not null, $"{variable} is required: {why}");
        Assert.True(File.Exists(value) || Directory.Exists(value),
            $"{variable} points at a path that does not exist: {value}");
        return value!;
    }

    /// <summary>The host assembly, loaded once per process from its named path.</summary>
    internal static Assembly HostEntryAssembly => _hostEntryAssembly ??= Assembly.LoadFrom(
        System.IO.Path.GetFullPath(Lumio.Bomber.Tests.EngineRelease.Require(Lumio.Bomber.Tests.EngineRelease.HostEntry,
            "the two cases below drive the real Lumio.Server.HostEntry the DS boots")));

    internal static Type HostEntryType => HostEntryAssembly.GetType("Lumio.Server.HostEntry.HostEntry", throwOnError: true)!;

    /// <summary>
    /// The host's one request entry point. Its signature is
    /// <c>(int, byte[]) Execute(byte[])</c>; the tuple is unpacked by field so a
    /// managed reference is not required.
    /// </summary>
    internal static JsonElement Send(string request, out string raw)
    {
        MethodInfo execute = HostEntryType.GetMethod("Execute",
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
            ?? throw new MissingMethodException("Lumio.Server.HostEntry.HostEntry", "Execute");
        object result = execute.Invoke(null, new object[] { Encoding.UTF8.GetBytes(request) })!;
        byte[] response = (byte[])result.GetType().GetField("Item2")!.GetValue(result)!;
        raw = Encoding.UTF8.GetString(response);
        return JsonDocument.Parse(response).RootElement.Clone();
    }

    internal static object ReadManager()
    {
        return HostEntryType.GetProperty("Manager", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)
            ?? throw new InvalidOperationException("host not booted");
    }

    internal static byte[] ReadCatalogCopy()
    {
        object context = HostEntryType
            .GetField("ActiveWorld", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!;
        return (byte[])context.GetType().GetMethod("CopyVoxelCatalog")!.Invoke(context, null)!;
    }

    internal static ulong ReadWorldTick()
    {
        object manager = ReadManager();
        object world = manager.GetType().GetProperty("World")!.GetValue(manager)!;
        return (ulong)world.GetType().GetProperty("Tick")!.GetValue(world)!;
    }
}
