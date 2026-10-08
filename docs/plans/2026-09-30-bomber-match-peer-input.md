# Bomber Match Peer Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make every peer in the existing full-match tour issue the Game's supported GAS input shape.

**Architecture:** Bot 1 retains its existing complete match assertions and bounded lifetime. Bots 2 through N run a resident wrapper over the same Game scenario, preserving input/observation behavior while leaving lifetime to the launcher. Reject packed full-match scenarios before side effects because v0.0.4's production scenario route requires one account per process.

**Tech Stack:** C# net10.0 BotScenario and Node launcher/tests; official Engine v0.0.4.

## Global Constraints

- Preserve the dirty worktree. No commit, push, reset, checkout or clean.
- Official Engine v0.0.4 stays immutable. No Engine/Runtime/API implementation edits.
- No assertion weakening, dummy inputs, private reads or forced simulation Ticks.
- Do not alter the damage, respawn, chain assertions or claim full-match acceptance from this input repair.
- No browser, M2 admission, stability campaign or external upload.
- Keep existing no-scenario and admission-only behavior outside this full-match repair.

## Task 1: Keep Match Peers On The Game Scenario

**Files:**
- Create: `games/101-bomber/Client/Bots/BomberMatchPeerScenario.cs`
- Modify: `games/101-bomber/Tools/launcher.mjs`
- Modify: `games/101-bomber/Tools/launcher.test.mjs`
- Create: `games/101-bomber/.run/match-peer-input-report.md`

**Interfaces:**
- Consume `BomberMatchScenario.Step(in BotDriverContext)` and `.Assert(in BotDriverContext, BotAssertionSink)` without changes to their assertions.
- Produce public parameterless `Lumio.Bomber.Bots.BomberMatchPeerScenario` selected by the launcher's `--scenario-name`.

- [x] Add focused regression tests near the existing tour tests and prove the peer routing test fails:

```javascript
test('full-match peers use the Game scenario and remain resident', async () => {
  const tools = tourTools();
  const run = await runTour(tools, { bots: 8 });
  try {
    const starts = tools.events.filter(event => event.kind === 'start' && event.args.includes('--account-from'));
    assert.equal(starts.length, 8);
    assert.equal(argValue(starts[0].args, '--scenario-name'), TOUR_SCENARIO);
    assert.ok(Number(argValue(starts[0].args, '--ticks')) > 0);
    for (const peer of starts.slice(1)) {
      assert.equal(argValue(peer.args, '--scenario-name'), 'Lumio.Bomber.Bots.BomberMatchPeerScenario');
      assert.equal(argValue(peer.args, '--scenario'), argValue(starts[0].args, '--scenario'));
      assert.equal(argValue(peer.args, '--ticks'), undefined);
      assert.equal(peer.settings.env?.LumioBotConfigDirectory, argValue(peer.args, '--config-dir'));
    }
  } finally { rmSync(run.isolated, { recursive: true, force: true }); }
});

test('full-match scenarios reject packed accounts before launch', async () => {
  assert.throws(() => parseLaunchArgs(['--scenario-dll', 'Bots.dll', '--fleet-per-process', '2'], {}), /fleet-per-process 1/);
  await assert.rejects(runLauncher({ scenarioDll: 'Bots.dll', fleetPerProcess: 2, env: {} }), /fleet-per-process 1/);
});
```

- [x] Add the resident wrapper using the existing public Scenario API:

```csharp
using Lumio.Client.Bot;

namespace Lumio.Bomber.Bots;

/// <summary>Runs Game inputs until the launcher finishes the primary match scenario.</summary>
public sealed class BomberMatchPeerScenario : BotScenario
{
    private readonly BomberMatchScenario match = new();

    public override void Setup(in BotDriverContext context) => match.Setup(in context);

    public override BotStepResult Step(in BotDriverContext context)
    {
        _ = match.Step(in context);
        return BotStepResult.Continue;
    }

    public override void Assert(in BotDriverContext context, BotAssertionSink sink) =>
        match.Assert(in context, sink);
}
```

- [x] In both `parseLaunchArgs` and the initial validation of `runLauncher`, reject explicit full-match `scenarioDll` with `(fleetPerProcess ?? 1) !== 1` using `UsageError('--scenario-dll requires --fleet-per-process 1.')`. Validation must precede external launch or evidence-directory creation.
- [x] In the single-bot loop keep `tour` true only for Bot 1; add a peer scenario selection for remaining bots when a full-match DLL exists:

```javascript
const peer = !options.admissionOnly && !tour && scenarioDll != null;
// Final branch of the existing scenario argument selection:
tour ? { scenarioDll, scenarioName: TOUR_SCENARIO, ticks: tourBudget.ticks }
  : peer ? { scenarioDll, scenarioName: 'Lumio.Bomber.Bots.BomberMatchPeerScenario' } : {}
// Environment selection:
...(options.admissionOnly || tour || peer ? { env: { ...env, LumioBotConfigDirectory: configDir } } : {})
```

Retain the primary scenario's original frame budget, result parsing, timeout, all assertions and existing fleet cleanup. Document the peer route in the launcher header comment. Do not supply a peer frame limit; root's primary timeout bounds the owned process lifetime.

- [x] Run `node --test Tools/launcher.test.mjs` and `dotnet build Client/Bots/Lumio.Bomber.Bots.csproj` from `games/101-bomber`. Record actual pass/fail counts, warnings and output. Run existing `BomberMatchScenarioTests` with the Client Application test project to ensure unchanged assertion behavior.
- [x] Generate a task-only diff from the captured pre-edit files and obtain independent spec/quality review.
- [x] Root runs one bounded protected eight-Bot diagnostic with `--tour-ticks 1500 --timeout-ms 120000 --duration-ms 1000`, a fresh account prefix and evidence directory. Verify all eight use Game scenarios, peers produce actual server-accepted inputs, zero `ability_invalid_payload`, and owned processes are cleaned up. Expected full-match result remains FAIL because this short probe and unresolved gameplay defects cannot satisfy the full tour.
- [x] Update the report and `.sdd/progress.md`; leave damage/respawn/chain and the uncompleted full-match gate explicit.
