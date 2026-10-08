# Bomber Browser Pump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the browser Session pump's selected Tick cadence while preserving one authoritative world and one managed Session Tick per callback.

**Architecture:** Keep the managed Tick, replica reads and presentation projection sequential. Schedule the next callback from a monotonic deadline, so their execution time is included in the selected period. Skip elapsed callback deadlines after a long frame or background suspension without running catch-up simulation.

**Tech Stack:** JavaScript, Node composition tests, formal .NET WASM ClientSession, real Platform/DS, two browser players and six real Bots.

## Global Constraints

- Preserve every existing uncommitted change and original log; no reset, clean, blanket staging or old DLL substitution.
- Keep eight participants, voxel rendering and the selected simulation frequency.
- Use one WorldManager.Tick simulation path, formal GAS and the official complete Engine release.
- This task changes Game page scheduling only; engine reconnect defects are repaired in their owning repository.
- A passing composition test does not prove real browser entry, ten close/reopen cycles, bidirectional movement or shared bomb identity.
- Preserve the current working branch and staged contents; the implementer does not commit the mixed workspace.

---

### Task 1: Include work time in the selected Session pump period

**Files:**
- Modify: `games/101-bomber/Client/UI/Spectator/main.js`
- Test: `games/101-bomber/Client/UI/Spectator/main.test.mjs`

**Interfaces:**
- Consumes: existing `csharp.tick()`, `csharp.tickRateHz()`, `finish(status)`, `connectionAttempt`, `pumpTimer` and `pumpSession(attempt)`.
- Produces: the same Session lifecycle and authoritative projection, with a monotonic next pump deadline reset when a new attempt starts.

Evidence: `games/101-bomber/.run/browser-experience-repair-01/baseline-A.json` and `baseline-B.json` contain 8-player samples. Incoming message gaps average 50 ms; managed Tick averages 37 ms; current pump gaps average about 100 ms because it sleeps a full 50 ms after work.

- [ ] Step 1: Freeze the exact two current source files in a new `.run/browser-pump-repair-01/before/` directory. Extend `runPage`'s test clock, supplying `performance.now()` from a controllable clock, and add behavioral regression cases before production changes.

```js
test('pump work fits inside the selected period', async () => {
  const clock = { value: 0 };
  const p = await runPage({ clock, exports: { Tick() { clock.value += 20; } } });
  const scheduled = [...p.timers.values()][0];
  assert.ok(Math.abs(scheduled.delay - (1000 / 30 - 20)) < 0.001);
});
```

The clock must advance by the scheduled delay before invoking a pending timer. Add cases proving repeated callbacks remain on the selected cadence, a 155 ms late callback executes only one managed Tick and schedules a future deadline, and a closed/superseded attempt schedules no new callback.

- [ ] Step 2: Run the unmodified production source against these new tests and save actual nonzero failing assertion counts and exit code.

```powershell
$env:LUMIO_ENGINE_CANDIDATE_ROOT='C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/complete-release-07'
node --test games/101-bomber/Client/UI/Spectator/main.test.mjs
```

Expected: the work-in-period case fails because the old timer still waits the complete `1000 / 30` ms.

- [ ] Step 3: Introduce only the monotonic deadline and reset for each connection attempt. The scheduling core is:

```js
const period = 1000 / csharp.tickRateHz();
const now = performance.now();
nextPumpAt += period;
if (nextPumpAt <= now) nextPumpAt += (Math.floor((now - nextPumpAt) / period) + 1) * period;
pumpTimer = setTimeout(() => pumpSession(attempt), nextPumpAt - now);
```

Set `nextPumpAt = performance.now()` immediately before the first `pumpSession(attempt)` after Boot completes. Keep cleanup cancellation, terminal gates, managed Tick and replica read ordering intact.

- [ ] Step 4: Run the complete page composition tests and relevant input/view tests once against the exact changed bytes. Preserve before/after SHA256, RED/GREEN outputs, total/pass/fail/skip and raw exit codes.

```powershell
node --test games/101-bomber/Client/UI/Spectator/main.test.mjs games/101-bomber/Client/UI/Spectator/player-controls.test.mjs games/101-bomber/Client/UI/Spectator/game-view.test.mjs
```

- [ ] Step 5: Save an exact two-file diff and report for an independent spec/quality review. Root publishes the Game page through the normal browser publish and repeats the same real 8-player measurements. Record changed cadence, Tick costs, rendering gaps, long tasks and input acknowledgement timing. Keep reconnect and prediction requirements open until their own actual evidence passes.
