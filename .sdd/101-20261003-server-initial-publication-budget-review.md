# Server initial publication budget narrow review

Verdict: **NEEDS CHANGES**. Reviewer: capacity_resume; no implementation ownership in the reviewed Rust files. Scope is the new initial Section reservation, actual-frame acceptance, and controlled-admission deferred tick groups. This is an independent source review, not a claim that real CLR/socket integration or all process memory is verified.

Input tree: `C:/Work/LumioGames/LumioServer-101-composition`. Exact six source hashes are in Runtime `.run/101-controlled-admission-provider/root-server-budget-review-inputs.json`. The root coordinator remains the only Rust writer. No Rust build or test was run by this reviewer in this pass; suggested reproductions below are not reported as executed.

## P1: Ready baseline storage outlives its only fixed metadata reservation

`Engine/src/section_dispatch.rs:211` budgets only `InitialSectionHold` plus the Arc header. `owner/admission.rs:168` reserves that fixed amount irrespective of the Section count. `accept_initial_frame` calls `mark_sent` (`section_dispatch.rs:975`), which clones the Section key into a growing `HashMap<String,u64>`. Neither key storage nor bucket allocation is added to that reservation. The Ready map moves into the live Session and survives publication fence completion, while `AdmissionQueueReservation::release_on_fence` zeros the record reservation and the publisher can release its payload charge.

Reproduction to add: create a one-Section original reservation, record `budget.used_bytes()`, accept a real closed first-delivery Section frame, and observe nonzero Ready capacity and owned key with unchanged budget. Complete the write fence and drop the driver while keeping the Session state; the surviving Ready allocation must retain its exact owner charge until actual removal. Refusal with insufficient capacity must precede key/bucket allocation. Reserving only a larger fixed Arc metadata constant would not address count-dependent storage or lifetime.

## P1: Initial-frame validation allocates a second JSON graph and decoded payload without a matching workspace

`section_dispatch.rs:237` calls `encoded_from_frame`, which at `:1346` creates a `serde_json::Value` tree, clones string values, decodes the payload hex into a separate Vec (`:1373`, `:1528`), allocates a digest string, then returns more owned strings before `mark_sent` clones the key again. This occurs after the actual frame has been enqueued (`owner/admission/lifecycle.rs:586–592`). The frame/authorization allowance at `admission_attempt/publication.rs:751` is already backing its two allocated Vecs. `admission_window.rs:54–60` explicitly charges byte backing only, and Read's borrowed CLR response allowance is also backing an actual response. No caller passes or reserves a parse/decoded temporary workspace here. `PublicationHold`'s logical whole-publication allowance is not an auditable bound for all these simultaneous allocations, especially fixed JSON tree overhead on small frames.

Reproduction to add: exhaust the remaining shared byte ledger after the known frame and sender allocations, then present an otherwise valid initial Section. The parser must refuse before additional heap allocation, or use a genuinely borrowed, bounded validation path. Include large payload and small-payload/many-field cases; measure peak live allocations rather than total serialized bytes. A post-enqueue allocation refusal must not silently erase the already enqueued frame or publication obligation.

## P1: Retained deferred raw groups do not cover their parsed/planned copies

`owner/admission/lifecycle.rs:258–290` correctly reserves before cloning the original raw group, and keeps `_charge` alive throughout `flush_controlled_tick_groups`. Its arithmetic accounts for the raw RuntimeFrame copies, strings, reference vector, and deque storage. It does not include the allocations made by the called `route_connection_tick_group` at `:327`: `owner.rs:5915` parses Sections into new payload Vecs, `:5938` clones WorldChange bytes, `section_dispatch.rs:590` deep-clones the existing Ready/requeue/open-group state, and `TickWritePlan::writes` (`section_dispatch.rs:405`) clones the whole encoded output once more. The proposed state shares the initial hold Arc while deep-copying its maps, so that same charge cannot account for two simultaneous maps. Requeued encodings can also survive the original raw group's drop.

Reproduction to add: park a real controlled tick group, complete the initial Section set, then exhaust spare process capacity before flushing it. The flush must fail before unpaid parse/clone allocation, preserve or explicitly transfer the original group's responsibility, and keep accounting for any retained requeue/Ready state. Actual sender reservation is necessary but covers only the sender-owned bytes; it does not pay these concurrently live intermediate structures. Preserve positive exact-capacity cases rather than increasing transport limits.

## Checked positive properties

- The new queue reservation is tied to the original observer, generation, selected profile, and exact plan hash. A dropped protocol token does not reopen the FIFO.
- Queue release requires actual Written fence or the original socket being closed, rather than cursor ACK.
- Raw deferred-group charge is held during routing and actual sender handoff. Record/byte admission limits are checked before the original raw clone.
- Header borrowing in `accept_initial_frame` is allocation-free for ordinary unescaped values; the remaining full DOM decode is the identified gap.

The separate Host pending-drain correctness candidate passed 24 actual Native source-composition tests. That result does not close these Rust budget findings or the ordinary parked-drain response measurement issue.
