# Server arena wiring — independent read-only review

Reviewer: client_composition. Scope: working Server composition arena primitive, CLR preboot/restore/shutdown integration, and the DS shared ledger. Source-only review; no independent Rust execution, actual CLR provider acceptance or profile readiness is claimed.

Result: **changes required**.

## Findings

1. **P1 — uncertain boot/restore replaces the owner request on retry.** `Engine/src/clr.rs:557` allocates an arena and sends boot through `invoke_json`; a missing receipt or uncertain bridge completion returns before `booted=true`. A subsequent `ensure_booted()` allocates another arena/grant and issues a different boot. `restore_record` repeats the same pattern at line1881. The retained `AdmissionCallWindow` protects only describe/query, not these two world-mutating requests. Keep the original request and owner until its exact response/cleanup is consumed; prove a failed response followed by retry cannot switch grant or create another world.
2. **P1 — grant-bearing world calls bypass the accounted window.** `Engine/src/clr/admission_arena.rs:80` allocates a Value copy of the grant, then boot/restore serialize the containing Value and use the legacy bridge. `runtime_bridge.rs:281` allocates a 64KiB response buffer (possibly grows), and the caller parses another Value before the narrow receipt string charge. `METADATA_BYTES=157` covers only the three key copies and arena record; it does not account for these new bridge/copy allocations. Reserve complete live request/response storage before grant-bearing dispatch, preserving the old no-budget/no-grant path where applicable. The existing 2048-byte describe/query window is correctly precharged but does not cover boot/restore.
3. **P2 — replacement can retain old arena debt indefinitely.** `AdmissionArenaOwner::recover` is only called by primitive tests. A new `ClrGameplay` starts with an empty `admission_arenas` vector, while `reconcile_admission_arenas` only visits that vector. After dropping an owner with Pending or unknown cleanup, the shared ledger correctly keeps the debit but no production path recovers its arena capability to query the original receipt. Add a typed, bounded recovery path for unclaimed arena entries, with a replacement regression that retrieves the original cleanup result without reissuing its grant or refunding another world's debt.

## Confirmed positive properties

- Canonical decimal extents are checked for nonzero values, max-snapshots width, and retained+scratch overflow. Arena grant IDs use the process ledger monotonic sequence and a distinct namespace.
- A bound old-world receipt must retain the exact incarnation; wrong-world and missing-world release cannot refund. Released requires zero retained bytes. Pending/Retained keep the full Native reservation. Exclusive access prevents duplicate live recovery.
- The DS installs the same `OnceLock` budget before Native world creation and verifies replacement limits. Shutdown attempts the private query lane after managed world shutdown and does not infer a refund from shutdown alone.
- `AdmissionCallWindow` rejects request replacement while a transport/oversize/UTF8 response is uncertain; describe/query additionally compare the exact request before retry. A successfully consumed response drops buffers before refund.

## Reviewed input identities

Tree `C:/Work/LumioGames/LumioServer-101-composition`, mutable author-owned source; exact SHA256 at review:

| Path | SHA256 |
| --- | --- |
| Engine/src/admission_arena.rs | df9e34a87fc4840ff319cd9cd9959a79fdd6ad99868ec4549927ad081f584079 |
| Engine/src/clr/admission_arena.rs | 78ac99f0a8ad31dfe6acb58784dbf3b42b499eff7a8de94eb0fcf36b53b05009 |
| Engine/src/admission_window.rs | cd65a5117c8480eafc7b34070d6e34624c9588c50929a549b703d71e8f5b116b |
| Engine/src/clr.rs | 4d90f38f13073bfe9e2db5930e74fe4c88add3910a863dea6846f12ea196e66f |
| Application/ds/src/main.rs | 5bdd414eb9036116d6f9a8b57f7da999d91fe89214672171e20da4b747372f60 |

No Server source was edited. Findings1–2 were sent to Root while reviewing; finding3 follows from a repository-wide call-site search. Preserve author tests as author evidence, not an independent rerun.

## Repair rereview (2026-10-02, exact inputs frozen in evidence)

Result: **changes still required**. Source-only independent rereview; author 7 fault-injection tests are not independent execution or Native/Host proof.

The original two P1 paths now use a single retained `PendingMutation`, exact encoded request comparison, borrowed grant serialization, prepaid request + fixed 2048-byte reply, and borrowed receipt parsing. Uncertain dispatch retries keep their original grant. The original P2 has a production typed recovery path which walks fixed 32-byte keys without allocating a debt snapshot and exclusively recovers parked arena records.

Two further lifecycle cases remain:

1. **P1 — a failed later arena query blocks all later reconciliation.** `reconcile_admission_arenas` starts at the first retained arena on every call, but its one `admission_arena_call` retains the query for whichever arena failed. With old A + restored B, A Read→Pending succeeds and B Read fails. Retry starts with A, which fails exact-request comparison against B's retained window, so B is never retried. Preserve the pending query's original owner/action and finish that request before traversing other owners. Add a two-arena regression where only the second query fails once.
2. **P2 — verified Released creation/cleanup leaves an orphan mutation window.** A valid `ok:false` creation reply carrying original Released receipt clears `arena.grant_id` and refunds its remote extent, then `reply.validate()` returns before taking `admission_arena_mutation`. The next retry cannot find the original owner; shutdown also leaves this local request/reply allocation resident. Likewise, a missing creation receipt followed by shutdown/drain Released removes the arena but never retires the matching pending mutation. Dispose this local window only on the exact original owner's verified Released result (not on unknown/Pending). Prove credit reaches zero after confirmed cleanup while the CLR object remains live and no duplicate world is created.

Input hashes: `games/101-bomber/.run/20261002-client-session-integration/server-arena-rereview-inputs.json`. No Server files modified. Both findings were sent directly to the author before the next edits; no production-provider readiness is granted by this review.

## Final arena repair rereview

**PASS for the reviewed arena primitive/CLR composition slice.** This supersedes the findings above for the exact source hashes in `server-arena-final-review-inputs.json`; it is not full controlled-admission/provider/profile acceptance.

- The retained query now carries fixed original grant and action, and is consumed before an earlier owner can start another request. Changed caller cleanup intent cannot replace its bytes.
- A creation refusal with its exact Released receipt retires both remote arena and its local pending mutation. A later original drain Released also retires only the matching mutation window. Missing/Pending receipts keep ownership.
- Budgeted shutdown first closes the World through the prepaid managed call while the bridge remains live, drains all original arena receipts, and only then calls `release_host`. Actual `ClrBridge::destroy` is separated from legacy world shutdown. Pending cleanup returns an error and keeps the bridge available; completed close is idempotent.
- An uncertain preboot Describe is completed as the same read-only request before shutdown; it cannot create a World, and Closing remembers an uncertain shutdown request.
- Replacement recovery remains exclusive, typed and bounded. No all-debt payload copy or speculative refund was introduced.

Independent execution used the existing frozen Rust test executable (no build or Server edits): **12 passed,0 failed,0 ignored,295 filtered,exit0**. Evidence `games/101-bomber/.run/20261002-client-session-integration/server-arena-final-review-01.log/.exit`. The six reviewed sources and executable SHA256 are recorded in `server-arena-final-review-inputs.json`.

Limit: these tests inject the managed-entry behavior. The provider still has to demonstrate actual CLR/Native receipts, keep the outer bridge owner alive when close fails, and avoid destroying the host while non-arena managed admission debt remains. Arena Released alone does not establish that broader condition. Root explicitly retains this integration obligation.
