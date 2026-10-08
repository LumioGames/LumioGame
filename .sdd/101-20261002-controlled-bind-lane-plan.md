# Controlled CLR Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry an actually Reserve/Validate-approved admission plan through the ordinary CLR binding operation once, using the original prepaid buffers across retries.

**Architecture:** Root's `AdmissionAttempt` retains the private grant, acquire response and actual publication reservation. A non-Clone, non-Deserialize `ValidatedAdmissionBind` borrows its sealed `ValidatedPlan` only while serializing into an owner-matched `AdmissionCallWindow`; it retains no copied JSON or grant. `RuntimeSurface::commit_admission_binding` mutably borrows that window, preserves uncertain/deferred requests, and records terminal admission before another dispatch.

**Tech Stack:** Rust, serde borrowed RawValue, existing CLR `invoke_json_into`, PublicationBudget.

## Global Constraints

- Canonical fields and behavior come from Engine `successor-binding-v1.json`; no public authority DTO constructor.
- Root owns admission_attempt, Owner and all grant lifetime/settlement. capacity_resume owns HostEntry provider.
- Edit only new admission_binding.rs, clr/admission_bind.rs, CLR implementation, the narrow RuntimeSurface method, internal window accessor and module declarations.
- Preserve all existing dirty changes. Do not build Game or alter its frozen entry06 source.
- No request/reply resizing, Value tree, grant clone, new world or state truth. Unknown delivery is not rejection or release.
- All four worker slots are occupied; execute this cohesive task inline and hand a frozen patch/hash to Root for independent review.

## Task 1: bounded once-only binding lane

**Files:** `LumioServer-101-composition/Engine/src/{admission_binding.rs,admission_window.rs,runtime.rs,lib.rs,clr.rs,clr/admission_bind.rs}`.

**Interfaces:** Consume `ValidatedPlan::raw_plan() -> &RawValue` and `window_matches_owner(&AdmissionCallWindow) -> bool`. Produce `ValidatedAdmissionBind::prepare(&ValidatedPlan, AdmissionCallWindow) -> Option<Self>` and `RuntimeSurface::commit_admission_binding(&mut self, &mut ValidatedAdmissionBind) -> RuntimeAdmit`.

- [ ] Save a failing production-path regression: `admit_selected_profile` with a successor profile must not enqueue a public-parameter-only bind. Run `cargo test -p lumio-server-engine controlled_binding --lib -- --nocapture`; retain actual failure output.
- [ ] Read the sealed plan context and capacity as borrowed RawValues; choose Admit for `admit`, Rebind plus exact mode for `reconnect`/`takeover`. Encode original plan/capacity into owner-matched precharged window without creating a JSON tree.
- [ ] Parse bounded CLR admission response with borrowed fields. `ok:true,admission:Accepted` consumes the lane; valid connection refusal terminates; transient Deferred and transport/parse uncertainty retain exact request bytes and all credit.
- [ ] Add regressions for exact retry bytes/pointer/capacity, Deferred, malformed/oversized response, terminal duplicate dispatch, wrong incarnation/instance, closed/uninitialized runtime, and unchanged legacy admission. Use actual ClrGameplay with only ManagedEntry fault injection; do not call this Native/provider proof.
- [ ] Run focused tests, relevant Engine full library tests, format only changed files and clippy. Record test count/fail/ignored/exit, freeze exact source hashes and request Root independent review.

## Recoverable browser handoff

Entry06 four source paths remain frozen in `games/101-bomber/.run/20261002-client-session-integration/game-entry-review-06/manifest.json`, SHA256 `972325522255ea1be763335ebdb16fdedb3b255ccbc4aaa44b7c8677a568ea83`. Plain Release retry still has a real late-first-input failure; the private decorated host did pass 7 checks and isolated remaining managed commit/prediction work. Neither result is a complete Platform/DS match proof. Continue from `.sdd/101-20261002-entry-retry-progress.md` after the formal Server binding blocker closes.
