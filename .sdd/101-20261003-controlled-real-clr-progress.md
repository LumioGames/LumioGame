# 101 controlled real CLR integration — 2026-10-03

## Current scope
Actual official SDK Native + CLR HostEntry + production Rust Owner + signed real loopback WebSocket. This is not Platform/DS full-game acceptance. Production successor-profile release gate remains unapproved pending this work and wider acceptance.

## Frozen inputs and build
- Engine ad8106809b549231813af56e345665215c0ba80b; Runtime 3c4aa21c470159e384c0ba7fd88d62c5604c270a.
- Official SDK 0.1.0-dev.b213f7dedd804d9384a3ba3b3d97bb472a23abcbf8efabc9b2a521811c3acb51.
- Official Server consumer C:/Work/LumioGames/.101-clr/host-sdk-5cLH2H; original archive and SHA512 retained and verified by prepare-host-sdk.
- Host24 source compiled in .run/101-controlled-real-clr/build; host-build-01 exit 0, 0 warnings/errors.
- Fixture official package consumer build-02/03/04 exit 0, 0 warnings/errors; exact DLL inputs recorded per initial-NN-inputs.json.
- Initial long consumer path produced MSBuild missing file error despite file existing. Official preparation into short path resolved it; no DLL substitution.

## Actual failures retained
- initial-01: 0 passed / 1 failed / 0 ignored, exit 1. Tick 2 actual admission refused, no socket publication.
- initial-02: compile error for newly introduced shutdown wrapper not yet consumed; not a test result. Added meaningful is_empty ownership predicate; no lint relaxation.
- initial-03: 0/1, exit 1. Diagnostic confirms Acquire Unavailable/successor_reservation_invalid.
- Existing test fixture lacks the new paired AdmissionCreation declaration. Added its test-owned explicit declaration, generated officially. Controlled-initial scenario does not create legacy initial Participant or run automatic successor transfer.
- Test fixture now restores actual catalog-world.capture and makes a real physical Native write through the public adapter, preserving actual revisions and pinning Section 0. No retired fixed baseline box and no fabricated revisions.
- initial-04/05: 0/1, exit 1. First-chance trace in the fixture: NativeAdmissionSnapshotSource.Number throws invalid_binding_shape.
- Root cause: prebind.rs advertised partWindowRecords/Bytes=0 for plain successor profile. Canonical successor-binding cursor requires a bounded frame window for authorization/Welcome/Section too. Root owns this correction and regression.

## Shutdown pending drain work split
- Host24 correctly returns drainPending:true and preserves the full original PendingDrain when shutdown cannot encode it.
- Existing Rust control lane retains every ok:false reply, so definite pending_response needs a distinct handoff state.
- Root owns Host no-copy bounded measure/exact take of the original typed batch, plus Owner full-batch consumption.
- Client-composition owns Rust prepaid measure/take bridge and move-only ShutdownRuntimeDrain. Type holds all original encoded bytes, a decoded terminal vector, exact remaining lane counts and their charges. Default RuntimeSurface take returns None until the real bridge exists. Gameplay-resume owns the bounded Host writer and its upstream shared Runtime codec.
- Do not prepay the global MAX_OUTPUT_BUFFER_BYTES (~89 MiB derived ceiling) for a tiny batch. Do not equate empty terminal query with no other debt. Do not tick/reboot while old response is retained.

## Actual cursor encoding repair and current results
- initial-06/07 failed to compile while concurrent Section budget work had test-only import errors; these are not executed-test results.
- initial-08/09: 0 passed / 1 failed / 0 ignored, exit 1. Acquire, Reserve, Validate and actual bind succeeded; cursor 0 repeatedly failed exact authorization comparison until the bounded ordinary delta queue overflowed. The stage diagnostic identifies `send`, cursor `0`.
- Frozen Runtime `WireCodec.TryWriteSuccessorAuthorization` writes a fixed field order. Rust's borrowed issuer still used the earlier alphabetical json-map order. Runtime also spells backspace/form-feed as `\\u0008`/`\\u000c`, whereas default serde JSON uses short escapes.
- Changed only Rust initial authorization serialization order and those two escapes. All verified-session/socket/owner/current attachment/request/tick/profile/incarnation/decimal/identity checks remain in place. Runtime frozen plan uses the same official writer. The exact-byte comparison remains required.
- `authorization-codec-red-01`: 0/1, exit 101; official byte-order/escape expectation differs. `authorization-codec-green-01`: 1/1, exit 0. The bounded destination/oversized failure assertions remain.
- `initial-10` and final `initial-11`: real official b213 SDK, Host24, Native, production Rust Owner and signed socket, 1/1, zero failed/ignored, exit 0.
- `initial-eight-01` and final `initial-eight-02`: eight distinct actual sockets and controlled lives, 1/1, zero failed/ignored, exit 0. Both cases require authorization → Welcome → actual SectionFrame → WorldChange, matching Self/generation, actual shutdown and shared publication budget zero. Raw parsed socket records and exact DLL/SDK identities are in each run's socket/inputs JSON.
- `owner-flow-green-04`: 8/8, zero failed/ignored, exit 0. This is the port-based protocol regression, distinct from the two real CLR cases.
- `strict-clippy-01/02/03` preserve actual failures during implementation. `strict-clippy-04`: Engine + Tests, all targets, test-harness, `-D warnings`, exit 0 with no warning exemption.
- Definite shutdown `drainPending:true` is now a separate retained state; its known reply window is released while the original arena remains. `parked-shutdown-red-01` 0/1 → `parked-shutdown-green-01` 1/1. The bounded full-batch implementation remains pending; this result is not a whole-batch CLR acceptance claim.

## Next
1. Freeze exact local source/evidence for Root independent review. Server composition remains dirty and is not a released product.
2. Build same-b213 official Client/browser/Bot closure and Root Resume10 Gameplay for actual Platform/DS Game diagnostics; do not mix the Root's separate SDK189 output.
3. Exercise the actual four-profile matrix, then close the still-explicit production successor gate under the authorized full-delivery scope with independent review.
4. Complete bounded original parked-drain bridge when the official shared codec SDK/Host writer are frozen; RED then real CLR regression.
5. Coordinate all clean source freezes and use official full pack-release, then original launcher for complete matches and remaining acceptance matrix.
