# Server admission publication and Owner flow

Status: production Rust protocol/Owner port-flow verification passes. Actual composed CLR/Host/provider acceptance is still required; no Game delivery claim.

## Implemented ownership

- Acquired reply remains the sole plan backing. Real Reserve and Validate responses create the non-copyable capability; ordinary bind reuses the original prepaid control window. Uncertain bind/ACK retries preserve exact bytes.
- Publication owns the actual original observer queue reservation, one decoded frame, bounded read/control buffers, and private grant. Cursor, identity, digest, count, byte total, issuer authorization and Welcome are checked before enqueue. ACK does not mean written; the actual writer fence or original socket closure precedes publication settlement.
- Queue and Section reservations hold ordinary output behind initial publication. Owner records Ready only for a Section actually sent. A later delta received under backpressure stays charged and keeps its original group until the initial Section exists.
- Cleanup preserves plan, publication, snapshot and structural obligations independently. NotApplied uses the original terminal. Unknown requires actual Export, AcceptTransfer, terminal acknowledgement, publication settlement, cleanup and retirement; it never reads unauthorized initial frames.
- A private post-close terminal lane reads one original managed terminal with a prepaid 2048-byte response. It preserves an unknown request, leaves normal tick facts untouched, and transfers a non-copyable parsed terminal plus residency charge to Owner. Bad/multiple/foreign responses remain held. Closing state rejects boot and restore before and after handoff.

## Reproduced defects

1. An already-written publication followed by retained snapshot cleanup never reached Session: repeated queue release rejected its previously proven fence. `owner-flow-red-01`: 2 pass / 1 fail. Root fixed the owning queue's same-observer idempotence; foreign observers remain rejected.
2. A live original socket receiving NotApplied could never retire its queue because closure happened only after retirement. `owner-live-not-applied-red-01`: 0 pass / 1 fail. Root now closes that original socket when the actual non-Applied terminal is accepted.
3. CLR shutdown never forwarded a newly generated terminal and could destroy the bridge before Owner received it. `shutdown-terminal-red-01`: 0 pass / 1 fail. The new bounded private lane now transfers the terminal before arena refund/bridge destruction.
4. Applied terminal observation checked identity and publication counts but omitted the original binding action. `terminal-action-red-01`: 0 pass / 1 fail. The publisher now compares the action against the original retained plan before accepting the terminal.

## Actual evidence

Root: `C:/Work/LumioGames/LumioServer-101-composition/.run/101-controlled-bind/`.

- `owner-flow-green-02`: **8 passed, 0 failed, 0 ignored, exit 0**. Production Owner/Prebind/queue/publication/cleanup with a managed-port responder, including one Section, full sender plus new delta, unknown ACK, actual fence, retained snapshot, live and closed NotApplied, Unknown transfer retirement, and unmatched terminal retention.
- `owner-flow-full-03`: **367 passed, 0 failed, 1 pre-existing ignored, exit 0**. Native kernel paths use `.run/2020bcc47cee042330ff5a8d949ada92/win-x64/run-Idt9KO/lumio_engine_native.dll` from the Engine render tree. The ignored test is `real_clr_malformed_player_envelopes_do_not_seal_other_players`, explicitly reserved for the real managed chain. It remains outstanding for composed acceptance.
- `owner-flow-strict-clippy-05`: **exit 0**, `-D warnings`, with `RUSTFLAGS` removed. The earlier temporary diagnostic dead-code relaxation is no longer used.
- `freeze-03/manifest.json`: SHA256 `ce0af42eb8408bf483d5804d6ef6733a1723430a8c43ebc3efb3ebb5a85560fe`; eighteen source/context snapshots, exact log hashes and a copied test executable. This is a partial composition snapshot; shared Owner/CLR/runtime files are context, not wholly attributed to this agent. It supersedes freeze-02 after the additional Applied action check and final full rebuild; formal release composition remains separate.

## Remaining acceptance

- Capacity's actual Host post-close terminal query is independently tested; the later parked ordinary-drain preservation repair is still being integrated. Rust port fixtures do not replace that real bridge path.
- Root must independently review this source and run the same composed Runtime/Host/Server release, including the real CLR test, original-socket flows and published SDK identity checks.
- Browser entry and full Game acceptance remain separate outstanding work; no timeout, phase guard, product quota, or test assertion was relaxed here.
