# Browser pump overrun yield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate a redundant future-period wait when the complete page pump reaches or exceeds its selected period, without catch-up simulation.

**Architecture:** Keep one Tick per callback and the existing managed export, voxel and presentation order. Advance the deadline once by the actual period, clamp an overdue deadline to the work-completion time, then yield through the existing `setTimeout`. A later cheap callback resumes its normal period; stale/closed attempts retain the existing fences.

**Tech Stack:** Ordinary JavaScript page, Node test runner and existing `runPage` whole-page VM with a deterministic clock.

## Global Constraints

- Write only `games/101-bomber/Client/UI/Spectator/main.js`, `main.test.mjs`, this plan and NEW `.run/browser-pump-overrun-yield-01` proof.
- No authoritative World, Native, protocol, quotas, TickRateHz, predictions, UI dist, SDK, pins, ledger, services, browser operations, staging or commit.
- Root supplies independent source/test review before another normal publish and real browser regression; this author does not review its own implementation.
- Ordinary16 quiet evidence is `.run/live16-experience-analysis-01/quiet-analysis-01.json`, SHA256 `f80add46e2c508389fa64609d20ae4b20c4825c93a8644bffd23979fd603c15b`. Received WorldChange cadence is about 20Hz while page Tick is about 15.2Hz; remaining gaps also contain later exports and are not a pure timer measurement.

---

### Task 1: Clamp overdue work to an asynchronous immediate yield

**Files:** Modify the two page files above; retain their exact before bytes in the new proof directory. Main before SHA256 is `3844b096b3200ce8031d33ffdc837cd1d00f377e7b60e1f046213d054d650a99`; test before is `a085e6f3c341104dade81fdd404ed650bb6d5d51a7e208699cb341c6a45a8551`.

**Interfaces:** Existing `runPage({clock,exports})` executes actual `MAIN_SOURCE`; its recorded timers expose delay, and `p.tick(lateBy)` executes exactly one queued callback. `pumpSession(attempt)` continues to schedule one callback and call one managed Tick.

- [ ] **Write and submit meaningful tests before production.** Correct the two old tests that demanded a future lattice deadline after late/overrun work. Retain their one-Tick/one-timer assertions, require zero delay after overrun, and exercise a later cheap callback plus the following normal interval. Add the following two whole-pump cases, where post-Tick export work is included:

```js
for (const workMs of [50, 51]) test(`a whole pump taking ${workMs} ms yields without another idle period`, async () => {
  const clock = { value: 0 }, starts = [];
  const p = await runPage({ clock, exports: {
    TickRateHz() { return 20; },
    Tick() { starts.push(clock.value); clock.value += 35; },
    DumpPositions() { clock.value += workMs - 35; return '[]'; },
  } });
  assert.equal(clock.value, workMs);
  assert.equal(starts.length, 1);
  assert.equal(p.timers.size, 1);
  assert.equal([...p.timers.values()][0].delay, 0);
});
```

- [ ] **Run RED on unchanged main.** Set `LUMIO_ENGINE_CANDIDATE_ROOT` to `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-16`; run `node --test games/101-bomber/Client/UI/Spectator/main.test.mjs`. Preserve actual stdout/stderr/raw exit. The two corrected late/overrun tests and the 50/51ms whole-pump tests should fail on the extra positive wait; all unrelated tests must keep their original assertions. Freeze the exact test source used for RED.
- [ ] **Make the single production-line change.** Preserve every surrounding byte and body order:

```js
nextPumpAt += period;
if (nextPumpAt <= now) nextPumpAt = now;
pumpTimer = setTimeout(() => pumpSession(attempt), nextPumpAt - now);
```

- [ ] **Run GREEN against the same test source and package.** Run the same complete main suite once; verify original cheap/varying cadence, 155ms-late single Tick, 90ms work overrun, exact/slightly-over-period whole export work, recovery, attempt-reset and closure fences. Preserve actual raw exit and complete log; no build or Native test is needed for this page-only change.
- [ ] **Freeze the exact two-file diff, inverse and raw evidence for Root.** Replacing only the new clamp line with its original arithmetic must restore the complete original main bytes. Record final hashes and the two intentionally replaced scheduling requirements; keep every other original test byte. Do not stage/commit. Actual browser cadence and input acceptance remain for Root's published regression.
