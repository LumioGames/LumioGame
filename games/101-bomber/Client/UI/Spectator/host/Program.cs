using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using System.Threading.Tasks;
using Lumio.Client.Engine.Wasm;
using Lumio.Client.Network.Connection;
using Lumio.GameRuntime.Hosting;

namespace Lumio.Bomber.Client.Spectator;

internal static class Program { private static int Main() => 0; }

public static partial class SpectatorExports
{
    [JSImport("invoke", "bomber-engine")]
    private static partial byte[] Invoke(string operation, byte[] packet);
    [JSImport("renewLaunch", "bomber-platform")]
    private static partial Task<string> RenewLaunch();
    private static SpectatorReplicaHost? s_client;
    private static LumioEngine? s_engine;
    private static BomberClientConfig? s_configuration;
    private static string s_inputMode = "interval";
    private static bool s_inputTrace;
    private static readonly Queue<string> s_closedTraces = new();
    private static bool s_closedTraceLoss;

    [JSExport]
    public static void ConfigureInputMode(string mode, bool trace)
    {
        if (s_client is not null || s_engine is not null) throw new InvalidOperationException("client_input_mode_live");
        if (mode is not ("interval" or "pump" or "step")) throw new ArgumentException("client_input_mode_invalid", nameof(mode));
        s_inputMode = mode;
        s_inputTrace = trace;
    }

    [JSExport]
    public static void ConfigureConfig(string bundle)
    {
        if (s_configuration is not null || s_client is not null || s_engine is not null)
            throw new InvalidOperationException("client_config_already_selected");
        s_configuration = BomberClientConfig.FromBundle(bundle);
    }

    [JSExport]
    public static async Task Boot(string launchJson, byte[] catalog, bool allowLoopback)
    {
        await Close();
        var configuration = s_configuration ?? throw new InvalidOperationException("selected_client_config_required");
        var launch = SpectatorReplicaHost.ReadLaunch(launchJson);
        var budget = new Lumio.Engine.NativeLoader.KernelConfig
        {
            MaxNativeBytes = 256UL << 20, MaxHandles = 65536, MaxJobsQueued = 1024,
            MaxJobsRunning = 64, MaxCompletionItems = 1024, LogMailboxCapacity = 4096, MaxContexts = 64,
        };
        var platform = new EngineWasmPlatform(new EngineWasmTransport(Invoke), budget, new EngineWasmLoggerFactory(Console.WriteLine));
        s_engine = LumioEngine.Start(platform);
        try
        {
            s_client = new SpectatorReplicaHost(s_engine,
                new BrowserWebSocketClientConnectionFactory(platform.Hfsm, SpectatorReplicaHost.TransportOptions(launch.Profile), allowLoopback),
                catalog, launchJson, async cancellation => { cancellation.ThrowIfCancellationRequested(); string value = await RenewLaunch(); cancellation.ThrowIfCancellationRequested(); return value; },
                Console.WriteLine, configuration: configuration,
                stepOptions: s_inputMode == "step" ? new BomberPlayerStepOptions(s_inputTrace) : null);
            s_client.Connect(launchJson);
        }
        catch (Exception primary)
        {
            try { await Close(); }
            catch (Exception cleanup) { primary.Data["Bomber.BrowserCleanup"] = cleanup; }
            throw;
        }
    }

    [JSExport]
    public static async Task Close()
    {
        if (s_client is not null)
        {
            s_client.Dispose();
            var start = Environment.TickCount64;
            while (!s_client.Closed)
            {
                s_client.Tick();
                if (Environment.TickCount64 - start > 10000) throw new TimeoutException("client_close_pending_resources_retained");
                await Task.Delay(1);
            }
            s_client.RetireInputTrace();
            if (s_inputTrace)
            {
                if (s_closedTraces.Count == 8) { s_closedTraces.Dequeue(); s_closedTraceLoss = true; }
                s_closedTraces.Enqueue(s_client.DrainInputTrace());
            }
            s_client = null;
        }
        s_engine?.Dispose();
        s_engine = null;
    }

    [JSExport] public static void Tick() => s_client?.Tick();
    [JSExport] public static string DrainInputTrace()
    {
        var batches = new List<string>();
        if (s_closedTraceLoss)
        {
            batches.Add("{\"version\":1,\"enabled\":true,\"complete\":false,\"events\":[],\"closeRetentionLoss\":true}");
            s_closedTraceLoss = false;
        }
        while (s_closedTraces.Count != 0) batches.Add(s_closedTraces.Dequeue());
        if (s_client is not null) batches.Add(s_client.DrainInputTrace());
        return "[" + string.Join(",", batches) + "]";
    }
    [JSExport] public static int TickRateHz() => checked((int)SpectatorReplicaHost.TickRateHz);
    [JSExport] public static string SessionState() => s_client?.SessionState() ?? "{\"state\":\"closed\",\"closed\":true}";
    [JSExport] public static string ConnectionState() => s_client?.ConnectionState ?? "closed";
    [JSExport] public static string LastApplyError() => s_client?.LastApplyError ?? string.Empty;
    [JSExport] public static byte[] WorldHandleBytes() => s_client?.WorldHandleBytes() ?? Array.Empty<byte>();
    [JSExport] public static string ReadBox(int minX, int minY, int minZ, int maxX, int maxY, int maxZ) =>
        (s_client ?? throw new InvalidOperationException("spectator_not_started")).ReadBox(minX, minY, minZ, maxX, maxY, maxZ);
    [JSExport] public static bool SendMove(int primary, int secondary, bool turnPressed) =>
        (s_client ?? throw new InvalidOperationException("spectator_not_started")).SendMove(primary, secondary, turnPressed);
    [JSExport] public static bool PlaceBomb() => (s_client ?? throw new InvalidOperationException("spectator_not_started")).PlaceBomb();
    [JSExport] public static bool BombButton(int phase) => (s_client ?? throw new InvalidOperationException("spectator_not_started")).BombButton(phase);
    [JSExport] public static bool UseActiveSkill() => (s_client ?? throw new InvalidOperationException("spectator_not_started")).UseActiveSkill();
    [JSExport] public static void SetMoveIntent(int primary, int secondary, bool turnPressed) =>
        (s_client ?? throw new InvalidOperationException("spectator_not_started")).SetMoveIntent(primary, secondary, turnPressed);
    [JSExport] public static string SetBombIntent(int phase) =>
        (s_client ?? throw new InvalidOperationException("spectator_not_started")).SetBombIntent(phase);
    [JSExport] public static void LatchSkillIntent() =>
        (s_client ?? throw new InvalidOperationException("spectator_not_started")).LatchSkillIntent();
    [JSExport] public static void SetInputIntentEnabled(bool enabled) =>
        (s_client ?? throw new InvalidOperationException("spectator_not_started")).SetInputIntentEnabled(enabled);
    [JSExport] public static void ClearPlayerIntent() =>
        (s_client ?? throw new InvalidOperationException("spectator_not_started")).ClearPlayerIntent();
    [JSExport] public static int GetBombIntentRefusalCount() => s_client?.GetBombIntentRefusalCount() ?? 0;
    [JSExport] public static string GetBombIntentStatusCode() => s_client?.GetBombIntentStatusCode() ?? "accepted";
    [JSExport] public static string GetInputIntentResetToken() => s_client?.GetInputIntentResetToken() ?? "unbooted";
    [JSExport] public static bool SelectCharacter(string id) => (s_client ?? throw new InvalidOperationException("spectator_not_started")).SelectCharacter(id);
    [JSExport] public static string PlayerState() => s_client?.PlayerState() ?? SpectatorDump.DumpPlayerState(null, "closed", false, "0", "0");
    [JSExport] public static string PresentationState() => s_client?.PresentationState() ?? PresentationDump.Dump(null, "0");
    [JSExport] public static string OwnerPresentation() => s_client?.OwnerPresentation() ?? "null";
    [JSExport] public static string SelectionConfig() => PresentationDump.SelectionConfig(
        (s_configuration ?? throw new InvalidOperationException("selected_client_config_required")).Display);
    [JSExport] public static string DumpPositions() => s_client?.World is { } world ? SpectatorDump.DumpPositions(world) : "[]";
    [JSExport] public static string MapDimensions() => SpectatorDump.MapDimensions(s_client?.World ?? throw new InvalidOperationException("spectator_not_started"));
    [JSExport] public static string WorldInstanceId() => s_client?.World is { InstanceId: not 0 } world
        ? world.InstanceId.ToString("x16", System.Globalization.CultureInfo.InvariantCulture) : string.Empty;
    [JSExport] public static string DevLoadedModules() => JsonSerializer.Serialize(AppDomain.CurrentDomain.GetAssemblies()
        .Where(assembly => !assembly.IsDynamic)
        .Select(assembly => new LoadedModuleDto { name = assembly.GetName().Name, mvid = assembly.ManifestModule.ModuleVersionId, path = "" }), SpectatorJsonContext.Default.LoadedModules);
}
