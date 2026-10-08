# Server Section publication memory ownership correction

2026-10-03. Author: capacity_resume. Source: `C:/Work/LumioGames/LumioServer-101-composition`.

This implements the three findings in `101-20261003-server-initial-publication-budget-review.md`. It changes Server-owned allocation and release accounting only. It does not change a public contract, Native ABI, byte/count limit, Section subscription membership, transport ordering, or test threshold. Root owns independent review and integration of the mixed Server worktree.

## Frozen review input and ownership

Exact copies and SHA-256: Server `.run/101-server-composition/section-budget-freeze-01/manifest.json` (7 files). `owner.rs`, `owner/admission.rs`, `owner/admission/lifecycle.rs`, `owner/admission/flow_tests.rs`, and `admission_publication.rs` contain other agents' work; the frozen copies are review context, not permission to replace those files wholesale.

This author's production scope:

- `section_dispatch.rs`: initial Ready storage reservation, borrowed initial frame validation, prepaid transactional plans, streamed exact-sized Section/manifest encoding, prepaid resync growth, and output ownership.
- `section_dispatch/memory.rs`: storage/work sizing and original-connection budget ownership. HashMap load/alignment bounds, Rust 1.98 BTree node bounds, explicit Vec capacities and geometric-growth overlap are documented beside the calculation.
- `owner/admission.rs`: `reserve_admission_queue` pays the retained initial index rather than fixed Arc metadata only.
- `owner.rs`: `route_connection_tick_group`, `drain_connection_voxel_requeue`, the one `request_resync` caller, and the charge field on `SuccessorPublicationDebt`.
- `owner/admission/lifecycle.rs`: ownership comments only; its existing original-frame charge remains live through routing, and the new route reservation separately pays parsing/decoded/output work.

Tests: allocation observer helper exposed inside the existing test-only `admission_publication::tests`; new Section allocation/refusal/lifetime cases; two appended `flow_tests` cases. No existing Owner flow assertions were removed. `TickWritePlan::writes` is test-only; production sends borrowed individual frames instead of cloning the full output collection.

## Closed findings

1. Ready index allocation is paid before the Arc, buckets or keys are created. Logical initial-section completion does not refund the retained index. Later subscriptions and transactional state copies reserve separately; resync growth refuses before mutation when no credit remains. Production no longer exposes a free deep Clone of the state or output plan.
2. Initial frame validation borrows the closed header and streams hexadecimal payload SHA-256 through a stack buffer. An 8 KiB payload now allocates only the prepaid 7-byte retained key. Section output and the authority manifest are counted and written directly into their final buffers, preserving prior field order and canonical vectors.
3. Raw deferred frames retain their original charge while routing separately prepays decoded rows, temporary JSON work, candidate state, output frames and collection growth. The actual sender still reserves its own queue/bytes before copying. A failed reserve closes the affected connection without publishing a partial frame. Correlation IDs transferred into successor debt keep a reduced metadata reservation until that actual debt is dropped.

The parser preserves escaped JSON discriminators. A real additional check observed serde's 8-byte unicode-validation scratch, so lexical escaped-string scratch is included before parsing; the test asserts the exact allocation and prepaid bound. The initial frozen Section encoder emits canonical unescaped headers.

## Evidence

All paths below are under Server `.run/101-server-composition/`.

| Evidence | Result |
|---|---|
| `initial-section-budget-red-02.log` | 2 real failures: unpaid 64-row index admitted; 8 KiB initial frame allocated 25,717 bytes |
| `initial-section-budget-green-01.log` | 2 passed, 0 failed/ignored, exit 0 |
| `section-plan-budget-red-01.log` | 1 real failure: follow-up plan cloned/encoded after shared credit exhausted |
| `section-plan-budget-green-01.log` | 3 passed, 0 failed/ignored, exit 0 |
| `section-budget-suite-01` through `-04` | Preserved intermediate failures. Initial conservative sizing rejected the old 4 KiB positive fixture; after removing duplicate DOM/output allocations it admitted correctly. The last old assertion expected refund while returned output was still alive; it now explicitly asserts retained credit until actual output drop, then zero. The 4 KiB cap is unchanged. |
| `section-budget-suite-07.log` | 56 passed / 1 failed; new escaped discriminator check exposed the 8-byte serde scratch described above |
| `section-budget-suite-08.log` | 57 passed, 0 failed/ignored, exit 0 |
| `section-allocation-matrix-01.log` | 1 parameterized test passed: 14 combinations of 1/3/4/7/8/31/64 rows and sent/deferred quota, measured total allocations within prepaid extent |
| `section-owner-flow-01.log` | 10 passed, 0 failed/ignored, exit 0; includes new actual Owner backlog and budget-refusal paths with the existing managed-port fixture |
| `section-budget-engine-full-03.log` and `.exit` | 381 passed, 0 failed, 1 existing ignored real-CLR case, exit 0; real Native kernel test executed |
| `section-budget-clippy-03.log` and `.exit` | All Engine targets, warnings denied, exit 0 |
| `cargo fmt -p lumio-server-engine --check` | Exit 0 |

Full test inputs: `LUMIO_ENGINE_ROOT=C:/Work/LumioGames/LumioGameEngine-101-binding-context-budget`; Native is the official SDK b213 package at `C:/Work/LumioGames/.101-clr/host-sdk-5cLH2H/packages/lumio.engine.sdk/0.1.0-dev.b213f7dedd804d9384a3ba3b3d97bb472a23abcbf8efabc9b2a521811c3acb51/runtimes/win-x64/native/lumio_engine_native.dll`. Private Cargo output: `.run/101-section-budget-target`.

The first full run omitted the Native environment and failed that one required fixture; `section-budget-engine-full-01.log` retains the environment failure. The final run fixes the input rather than skipping the test. Client agent independently reported official real-CLR one/eight-socket passes; those remain that agent's evidence, not a substitute for this review. Independent review of this frozen Section correction is still pending.
