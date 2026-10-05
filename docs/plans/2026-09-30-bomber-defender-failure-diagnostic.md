# Bomber Defender Failure Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Preserve bounded, target-specific Defender evidence when the Windows launcher cannot verify or run the official DS.

**Architecture:** A read-only PowerShell collector queries structured Defender status and Operational events. A small Node adapter bounds execution and distinguishes correlated events, no related records and unavailable evidence. The launcher adds this diagnostic to its existing failed-run report after process cleanup, without replacing the original failure.

**Tech Stack:** Node ESM, node:test, Windows PowerShell, Defender Operational XML.

## Global Constraints

- Preserve the dirty worktree and immutable Engine v0.0.4. No Engine/Runtime/API edits, commits, pushes, resets or checkout operations.
- No security setting changes, exclusions, automatic scanning, updates, restoration, external submission or restart.
- No browser, DS, Platform or Bot startup during validation. Only fixture launcher tests and a read-only collector smoke check.
- Query the exact DS path. Do not persist unrelated events, raw localized messages, credentials or unrestricted command output.
- An unavailable query is not a clean security verdict. An older matching action is historical evidence, not proof of current quarantine.
- An empty event query cannot guarantee safety or prevent a future classifier change. Preserve the original launcher status and error.

### Task 1: Add And Review Failed-Run Evidence

**Files:**
- Create: `games/101-bomber/Tools/defender-diagnostic.mjs`
- Create: `games/101-bomber/Tools/defender-diagnostic.ps1`
- Create: `games/101-bomber/Tools/defender-diagnostic.test.mjs`
- Modify: `games/101-bomber/Tools/launcher.mjs`
- Modify: `games/101-bomber/Tools/launcher.test.mjs`
- Create: `games/101-bomber/.run/defender-diagnostic-report.md`

**Interfaces:**
- Export `collectDefenderDiagnostic({ targetPath, startedAt, platform, ...testDependencies })`, returning a bounded structured result without throwing over the original failure.
- Result status distinguishes `correlated-events`, `no-related-events`, `unavailable`, and `not-applicable`; include query window, current protection/version evidence, and only exact-target events.
- Collector invokes a fixed PS1 via argument array, never interpolated shell code. PS1 uses `Get-MpComputerStatus`, `Get-WinEvent` and XML `EventData` names. It has no security mutation commands.

- [x] Add focused failing tests for exact case-insensitive Windows path matching, another similarly named executable, mixed resources, old matching actions, no matching events, partial query failure, malformed collector output and timeout. Assert that unavailable evidence is never classified as clean.
- [x] Implement the collector and adapter. Use an explicit bounded history window for pre-existing missing-file failures, mark each event as during-run or historical, and preserve per-query availability. Retain event ID, record ID, UTC time, detection identity/name and action/result fields. Cap subprocess timeout and output; close the subprocess on timeout. Do not expose raw stderr in evidence.
- [x] Integrate with failed launcher finalization, covering early release verification failure, missing EXE, failed spawn and natural DS exit. Cleanup must run before the optional query. Use existing release path helpers to locate the target even when preparation fails; if the target cannot be resolved, record unavailable evidence. Successful/non-Windows runs require no Defender query. Inject the collector in fixture tests to avoid host-dependent results.
- [x] Run focused tests from the game workspace: `node --test Tools/defender-diagnostic.test.mjs Tools/launcher.test.mjs`. Check original errors/statuses, persisted diagnostics and cleanup order for preflight and runtime failures. No real service startup.
- [x] Run the collector once against the actual installed official EXE with normal protection enabled. Save only the bounded structured result and its limitations; do not launch or scan the EXE.
- [x] Package the scoped diff and report for independent spec and quality review. Fix concrete findings and rerun affected checks; then update the ledger. This is diagnostic repair, not a malware clearance or full-match acceptance.

Pre-edit launcher snapshots are retained in `.run/defender-diagnostic-launcher.before.mjs` and `.run/defender-diagnostic-launcher.before.test.mjs` for a task-only diff. This plan and the implementation report retain execution evidence; no public contract or feature document changes are needed for this focused failure-diagnostic repair.

Current checkpoint: 114 passed / 0 failed / 0 skipped. The first review's P1
event-processing exception bug was reproduced in the real PS1, fixed, and
covered by successful/empty/throwing/malformed event records. Final independent
rereview APPROVE/APPROVE with no concrete remaining findings is retained in
`.run/defender-diagnostic-independent-rereview.md`. Process-level timeout,
stream-output-limit and split-UTF8 failure tests remain coverage limitations;
the ordinary real collector smoke passed. No overall gameplay acceptance.
