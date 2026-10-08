using System.Text.Json;
using Lumio.Engine.NativeLoader;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.GameRuntime.Gas.SuccessorFixture;
using Lumio.GameRuntime.Replication;
using Lumio.GameRuntime.Replication.Binding;
using Lumio.GameRuntime.Simulation;

using var manager = WorldManager.Create(GeneratedRegistry.Instance, 0xf123456789abcdef);
var world = manager.World;
manager.ConfigureSuccessorLimits(4096, 4096, 16777216);
var gas = GasWorldContext.Require(world);
gas.Types.RegisterEffectAttribute(1, "Health");
gas.ConfigureEffects(EffectLimits.Default with
{
    ReducerWrites = 3168, ReducerFields = 22, MaxReducerValueBytes = 16,
    ReducerWriteBytes = 139392, ReducerWorkUnits = 2000000, ReducerScratchBytes = 65536
});
world.Single<WorldSaveComponent>().TickRate.Value = 20;
world.SeedProvider = new Seeds();
var scenario = new SuccessorScenario();
world.AttachService(scenario);
manager.Start(Thread.CurrentThread);
if (!manager.TryBindNativeSpatialIndex(new KernelConfig
{
    MaxContexts = 128, MaxHandles = 256, MaxNativeBytes = 16 * 1024 * 1024,
    MaxJobsQueued = 16, MaxJobsRunning = 2, MaxCompletionItems = 32, LogMailboxCapacity = 256
})) throw new InvalidOperationException("Real Native Context unavailable");
WorldTickBinding.Bind(manager);
using var binding = EntityBindingQuery.Create(manager);
for (int i = 0; i < 100; i++) world.Commands.Create<ParticipantEntity>();
var target = world.Commands.Create<PlayerEntity>();
manager.Tick();
manager.DrainOutbox();
int beforeEntities = world.IssuedIds.Count;
ulong beforeRevision = world.Revision;
var parameters = new FiniteDormantEffect.Parameters { Duration = 100, Fx = "capacity" };
var finite = Effects.Apply<FiniteDormantEffect, FiniteDormantEffect.Parameters>(world, target.AssignedId, in parameters, target.AssignedId);
if (!finite.Succeeded) throw new InvalidOperationException("Finite setup admission refused: " + finite.GeneratedErrorId);
scenario.InitialParticipant = world.Commands.Create<ParticipantEntity>();
manager.Enqueue(new AdmitConnectionMessage("capacity-client", "capacity-account", "room", "player")
{ Profile = WireProfile.SuccessorBindingReceiptsPartsV1, RequestId = 9007199254740993UL });
Exception? failure = null;
try { manager.Tick(); }
catch (Exception error) { failure = error; }
bool routed = binding.TryResolveConnectionState("capacity-client", out var life, out var epoch);
int finiteRows = world.Get<EffectComponent>(target.AssignedId).ActiveEffects.Count;
// The required refusal must not seal the World or leave a newly authenticated route/body.
bool passed = failure is null && !routed && world.IssuedIds.Count <= beforeEntities + 1;
Console.WriteLine(JsonSerializer.Serialize(new
{
    test = "OversizedInitialBaselineRefusesBeforeAuthoritativeAdmission",
    total = 1, passed = passed ? 1 : 0, failed = passed ? 0 : 1, skipped = 0,
    ordinaryNativeTick = true, beforeEntities, afterEntities = world.IssuedIds.Count,
    beforeRevision, afterRevision = world.Revision, finiteAdmitted = finite.Succeeded, finiteRows,
    routed, life = life.ToHex(), epoch,
    resultCredits = manager.PendingSuccessorResultCredits,
    publicationBytes = manager.PendingSuccessorPublicationBytes,
    failure = failure?.ToString()
}, new JsonSerializerOptions { WriteIndented = true }));
return passed ? 0 : 1;

sealed class Seeds : IAttributeSeedProvider
{
    public bool TryGetSeedValue(Type entityType, string attributeName, out long seedValue)
    { seedValue = 1; return true; }
}
