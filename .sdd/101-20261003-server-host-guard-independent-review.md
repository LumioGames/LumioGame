# Server Host guard update independent review

Scope: private Server candidate d29153d645886b9ca74af9331a213e8c2b31868b, parent5f7883ecf62e8e663adc5aa3cd726b7bbffb6cda. Only Tests/tests/host_architecture.rs changes. No Server production change is part of this review.

Result: PASS within this test-maintenance scope. The reviewer read the complete delta and its actual Host/Section writer call sites. The dispatch guard still compares the full preamble and closed operation switch; approved arena describe and original grant boot/restore wrappers are now recognized. It adds the closed five-message admission set and preserves enqueue/drain ordering. Added mutations reject deleted arena dispatch, bypassed grant wrapper, removed Runtime wiring guard, invented message type and removed drain gate.

The SectionFrame guard now reads the actual borrowed serde writer used by encode_json_exact. It checks the exact derive/rename attributes, rejects a custom serializer and unknown attributes, derives emitted names, verifies all names against canonical generated members and all required members are present. Added mutations prove unregistered members, deleted required fields, wrong renaming and use of another writer are rejected. This remains a bounded source guard, not a general Rust parser or a substitute for actual wire tests.

The two additional SessionClosed allowances correspond to already-ended peer/controlled cleanup paths and retain per-function site limits. They do not broaden the allowed string to arbitrary code paths.

Independent execution: cargo test -p lumio-server-tests --all-features --test host_architecture, using the existing isolated candidate target and Engine6f625 contract input. Actual51/51 passed,0 failed/ignored, exit0. Evidence: games/101-bomber/.run/20261003-controlled-game/server-verification-02/client-independent-host-guard.log and .exit. Root's separate full nextest reports811/811 with9 default ignored; that separate result is not represented as reviewer execution. Production complete release and real Platform/DS acceptance remain pending.
