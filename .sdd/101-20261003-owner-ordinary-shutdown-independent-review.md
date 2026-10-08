# Independent review: Owner ordinary drain shutdown

2026-10-03. Reviewer: capacity_resume. Author of reviewed Owner shutdown logic and its three new hardening cases: Root. This reviewer authored the separate Section-budget slice in the same worktree; that slice is outside this review.

**Conclusion: narrow SOURCE/QUALITY PASS for the Root Owner handoff and retirement logic. Actual Host → CLR ordinary-drain production handoff is not certified by this review.** No blocking source defect was found in the reviewed Root increment. The caller must retain the concrete original window, and the active Client-owned bridge work must still prove that handoff on a real Host.

## Scope and inputs

Source tree: `C:/Work/LumioGames/LumioServer-101-composition`.

- `owner.rs`: `pending_shutdown_drain`, worker shutdown sequencing, existing bounded retry port and `DsHost::shutdown`.
- `owner/admission/lifecycle.rs`: `finish_controlled_shutdown`, `has_controlled_shutdown_output`, `advance_controlled_shutdown`.
- `owner_hardening_tests.rs`: three new ordinary-batch shutdown cases and the existing retained-cleanup deadline/executor tests.
- Read-only dependencies: `ShutdownRuntimeDrain`, publication/cleanup identity checks, current CLR shutdown state machine, EgressPort closure semantics and Network implementation.

Exact reviewed input SHA-256 values: Server `.run/101-controlled-bind/capacity-shutdown-review-inputs.json`. The `owner.rs` and lifecycle files contain mixed work; the conclusion covers the functions listed above only.

## Findings checked

The Owner takes the retained batch once using an `Option::take` handoff and keeps its original encoded response, decoded terminal storage and charges. It does not reconstruct frames, queries, operations, successor admissions, requests or results. Repeated calls do not re-take a batch already owned locally.

Terminals are considered only against the pending controlled owner for their original connection. The publication and cleanup owners additionally compare the exact original world incarnation/request identity, binding action, commit fact and publication counts. Unknown or unmatched terminals remain in their original holder. Acceptance is followed by the existing cleanup/publication state machine; there is no newly invented zero-debt result or retargeting to a later admission.

Nonterminal ordinary lanes stay opaque until Runtime reports completed shutdown, no pending controlled owner or unmatched terminal remains, and all retained egress ports have stopped accepting writes. They are then retired with the closed world rather than replayed through another Tick. Pending errors retain the original Inner and use the existing bounded cleanup retry port; no cleanup polling or replacement executor is introduced.

The stored window outlives borrowed views and decoded terminal consumption. Its charge is not refunded merely because the last terminal was removed. The whole original batch stays retained through Runtime teardown, including cases without a controlled admission.

## Precise limits of the evidence

`EgressPort::is_closed` means **stopped accepting writes**. `Network::WireSender` implements it with its cancellation flag; it is not a TCP-task join receipt. The outer `DsHost::shutdown` separately joins the listener, forward worker and Owner within the original deadline. Statements in tests/comments about a socket being closed should be read against that actual port contract. This review does not claim that `abort_with` alone proves OS socket destruction or sender-buffer release.

At inspection time, production `ClrGameplay` had not yet overridden `take_shutdown_runtime_drain`; the default trait method returns `None`. Root had explicitly assigned that production bridge to Client, so this is an open integration dependency rather than an asserted completed capability. Its acceptance still needs actual Host parked-batch measurement/take, exact uncertain-reply retry, complete-lane retention and original-window budget evidence. The hardening fixture's `RecordingRuntime` and synthetic opaque batch prove the Owner behavior only.

The ordinary fixture deliberately includes all six nonterminal lanes, but its values are opaque sentinels and are not validated Host payloads. No assertion here treats them as real gameplay or real Native drain evidence.

## Independent execution

Executed with a private Cargo target (`.run/101-section-budget-target`) and the official SDK b213 Native environment:

`cargo test -p lumio-server-engine --lib shutdown_ -- --test-threads=1`

Result: **13 passed, 0 failed, 0 ignored, exit 0**. Log and captured exit: Server `.run/101-controlled-bind/capacity-shutdown-review-01.log` and `.exit`.

The set includes all three new ordinary-batch tests, unmatched/Unknown terminal flow tests, exact uncertain shutdown sequencing, and original-executor deadline retention. Root's earlier real RED (`root-ordinary-shutdown-red-01`) and subsequent GREEN/full logs were inspected as author evidence; the pass above is this reviewer's own execution. No production file or assertion was changed during this review.
