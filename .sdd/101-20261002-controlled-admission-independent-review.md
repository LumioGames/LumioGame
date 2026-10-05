# ACR3 independent review

Reviewed exact clean commit `7194a8221754a4c5fd68cd16fecc89c685ba7150`, against `0a265f4`, at `C:/Work/LumioGames/LumioGameEngine-101-controlled-admission-closure`. Scope is the 21-path owning contract/model/projection delta, including two mechanical Loader formatting changes. No Engine source was modified by this review.

**SPEC: NEEDS FIXES. QUALITY: one remaining P1 accounting finding.** The original R1–R3 defects are closed in the reviewed executable model. R4 now names the real Host allowance and supplies cross-incarnation accounting, but separately retained frame copies still bypass that ledger. No provider, product or profile readiness is established.

## P1 — retained read windows are absent from the shared byte ledger

`eng/verify-successor-publication.mjs:116` charges `plan.frameBytes` once while retaining the frozen snapshot and authorization/Welcome buffers. `read` at lines 138–147 subsequently creates an independent `Uint8Array.from(frame.bytes)` window and returns a structured copy. The admission bridge converts that returned copy to its own base64 frame. Neither `read` nor `acknowledge` charges/releases the shared ledger for these additional retained owners. The frozen snapshot and authorization buffers remain held throughout.

This contradicts the canonical `controlledAdmission.jointPublication.limits` at `engine/wire/successor-binding-v1.json:1408`: every separately owned payload copy/window shares the existing process allowance. Counting the eventual wire publication once does not cover simultaneous retained snapshot and output copies.

An independent executable probe uses the same public Acquire → Reserve → enqueue → apply → drain path, with a shared process ceiling equal to the exact plan size. Before drain: `plans=1, bytes=1040, maxBytes=1040`. Drain still succeeds and returns a new **663-byte authorization window**; after drain the ledger remains `bytes=1040`. The probe retained the returned result and did not acknowledge it. The owner also retains its internal window, so this is not only a transient encoder allocation. Repeating/retaining copies can add further unaccounted ownership.

Evidence: Client worktree `.run/composition-20261002/acr3-budget-probe.mjs` and `acr3-budget-probe.json`. The probe exits 0 because it records the observed behavior; it is a reproducer, not a passing budget acceptance test.

Required repair: explicitly pre-reserve the bounded internal cursor/bridge/output ownership window in the shared ledger before mutation, or charge each ownership transition when permitted and retain the required precommit capacity. Repeated reads and ACK must have an exact, bounded ownership policy; failed release must retain all corresponding charges. Add real failing tests at the exhausted process allowance, repeat-read/ACK, pending failed release, and cross-incarnation pressure. Do not raise limits or simply count these independent payloads as one copy.

## Closed findings and validation

- R1: every new registration compares against `state.highWater`, while exact retained duplicates and previously registered predecessors keep their separate handling. The new cancellation/terminal-ACK/retry interleaving happens before the predecessor applies.
- R2: successful public Acquire is immediately retained in the incarnation plan registry and consumes the composed admission/terminal slot. Failed Cancel/Stale/Seal release survives terminal ACK. Exact unused Release remains routed through the old incarnation after closure. Acquired-only work consumes no admission identity or fabricated terminal.
- R3: no-export retirement uses `exportId="0"`, `digest=null`; real drain can retire with either ACK order. Entries, leases and exports all gate final registry removal. Sibling and acquired-only holds prevent premature retirement. Open settled completion receipts are retired instead of growing indefinitely.
- R4 declaration: the undefined limit is replaced by `HostLimitsConfig.max_deferred_frame_bytes_per_connection` and a checked process product; the existing per-connection, Section and Room limits remain independently binding. Old/new snapshot owners demonstrably share one allowance when composed with the process ledger. The remaining issue is the copy/window ownership above.
- Independent rerun of all four model suites: **474 tests, 474 pass, 0 fail, 0 skipped/cancelled, exit 0**. Evidence: Client `.run/composition-20261002/acr3-independent-model.log`.
- Root's wire 597/597, Rust 3/3, generated C# two-target build, generation consistency and strict spec checks were inspected/credited as implementation evidence; this review did not rerun those builds.
- The nullable Rust projection remains `Option<String>` with actual code-field round-trip tests. The five-field binding, six Host operations, full-width identities, 4096/65536 limits, and all three false readiness flags remain intact. Documentation clearly leaves real Runtime/Server providers and authenticated product acceptance pending.

Reviewed hashes (SHA256): contract `94dbf70a7316ddcde266dc75407b6e6ed5daef508b954c674e9018c3373845a1`; publication model `23a0f535bb41a26c63ace13b048d5c213a6eafcd3ffd3f87b61de0e62d0312f1`; admission model `061c0414fc28b3f67d103153463f8a32b4229d78336e27b5daaf0ab1306ac662`; debt model `5af52c54fd51dad8ad576179783e747a1663c3c7259ed428d01ced320f0da021`.

## R4 repair re-review, 2026-10-02

**Updated verdict: SPEC PASS; QUALITY APPROVED for the owning contract/model repair only.** Reviewed the four-file working delta atop `7194a8221754a4c5fd68cd16fecc89c685ba7150`; no further actionable issue found in this scope. This supersedes the P1 verdict above, while retaining the original reproducer and failure evidence. Actual Runtime/Server implementations and authenticated product/profile acceptance remain required and are not certified here.

Acquire now reserves the encoded frozen snapshot plus authorization/Welcome storage, one maximum raw frame window, and the exact maximum serialized bridge result before a lease can register. The sizing covers UTF-8 and base64 expansion, frame envelope and full identity/cursor strings. Authorization and Welcome themselves must fit the configured window. The public drain path directly returns the owner's same recursively frozen result for repeated current cursor reads; it no longer creates independently retained copies per call. ACK advances the cursor without giving away the reserved window allowance. Failed release retains the whole lease charge; successful release returns it once to the common process ledger. Existing old/replacement pressure tests continue to use that same ledger and retain old charges.

Independent evidence in Client `.run/composition-20261002/`:

- The unchanged old `acr3-budget-probe.mjs` now fails at its expected-Acquired assertion with actual `Unavailable`, exit 1 (`acr3-budget-probe-after-fix.log`), before its publication drain can occur.
- A separate positive assertion probe `acr3-budget-fix-probe.mjs/.json` reproduces the original 1040-byte allowance: `Unavailable`, complete model state unchanged, zero retained plans/snapshots/bytes, exit 0.
- Correct complete four suites (binding, completion, controlled admission, owner services): **478/478, 0 fail/cancel/skip/todo, exit 0**, `acr3-window-independent-model-02.log`. An earlier subset invocation recorded 390/390 in `acr3-window-independent-model.log`; that is not the complete-suite evidence.
- Source review also checked cursor identity isolation, forged/repeated ACK handling, authorization window sizing, exact Chinese large-parts encoded accounting, failed release, shared old/replacement capacity, and preservation of R1–R3 paths. Tests retain all three readiness flags false. Model payload accounting is proof of the specified ownership model, not managed/native heap measurement or production-provider proof.
