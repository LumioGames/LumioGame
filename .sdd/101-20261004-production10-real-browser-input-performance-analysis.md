# Official10 real browser — input/performance facts

Readonly evidence analysis, 2026-10-04. Verdict: **experience not accepted**. Initial A/B binding, discrete same-life direction steps and first-round common player-owned bombs are observed. Continuous walking, fluidity and ten successful real close/reopen cycles remain open; the eighth actual reopen stalled before Welcome.

## Identity and exact evidence

Actual run `live-10`: A tab30, B tab31, six real Bots. Official complete10 manifest SHA256 `db86c9b3d2b5f9e33ef451454a125f2a39c2ca4eb75e2bbf38f2192afd02739a`; production identity was separately audited. `first-input-observation.json` records actual run/manifest/tab identities and real discrete keydown/up input. The four original probes are preserved byte-for-byte in `games/101-bomber/.run/browser-experience-repair-01/live-10/first-input-independent-analysis-02/` with a hashed input manifest.

- `analysis.json` SHA256 `51c26e622947dc721c8fb972fd387fe8282eadf8b5c268fc9d8460e97659a8b7`.
- `manifest.json` SHA256 `7c404a091bbd4be6752adfc5f834f9ed6f1d7feebe0ba0d0a0bea552f5f76164`.
- Supplemental real Host result / short-press pose correlation: `live-10/short-press-causality-03.json`, SHA256 `f31618f8d008c4fecd9ebd01108b62c30e8b39085fbe3b99b4b253a0651f8830`.
- Immutable DS prefix `live-10/server-hold-independent-01/ds-prefix-01.log`, 6043827 bytes, SHA256 `fd2dc9444fb26ee385bb25284e27eb0d28716d85561a0c8cb1decc650f465f5a`. The live source log is still mutable; this is not its final hash.
- The first private reader attempt failed only because a Windows backslash path did not match a forward-slash suffix lookup. `first-input-independent-analysis-01/analyzer-original.mjs`, raw copied inputs and `failure.json` retain that **INVALID_ANALYZER_WINDOWS_PATH_SUFFIX**, raw exit1. A new output directory was used for corrected analysis; no original probe or old result was overwritten. The failure is not a product error.

Second-round file-to-tab lineage is supplied by root's actual task/capture record and identical timeOrigin/initial identities; those raw probes do not contain embedded meta or a separate second-action metadata artifact. This limit is explicit in `analysis.json`.

## Initial entry

World is `0000000000000001`, room is `room-bomber-1` from actual boot allocation. A participant is `0000000000000001000000000000000f`; B participant is `00000000000000010000000000000011`. These full durable IDs are distinct and appear in actual authority projections. Neither avatar label nor visible roster count substitutes for identity.

| Actual observation | A30 | B31 |
|---|---:|---:|
| selecting→negotiating | 9648.5 ms | 9689.7 ms |
| negotiating→active | 710.2 ms | 605.4 ms |
| first World relative to real timeOrigin | 11388.5 ms | 11123.7 ms |
| first bound identity relative to timeOrigin | 11388.7 ms | 11123.9 ms |

Selection time includes the human action interval; it is not classified as network negotiating cost. First Self A is `0000000000000001000000000000000e`, B is `00000000000000010000000000000010`. Initial projections legally have match0/WaitingForWorldReady/Protected/inputOpen=false/authority0. Later retained states are match1/Running/Vulnerable/inputOpen=true, with A authority729→828 and B735→827 in their first retained windows. This is current activity evidence beyond merely SERVING or an old HUD.

The probe records socket counters and timing gaps, first World and first identity; it does not record incoming Welcome type or shard identities. Exact Welcome/initial-fragment/Native recovery stage timings are **UNPROVEN** rather than inferred from counters. Boot still signs `bomber-0.0.4-main.ecece8a`; publication identity closure remains open independently of the engine manifest.

## Actual commands, results and short steps

Correction to earlier root/subagent inference: `turnPressed=true` in `MoveAbility.Server.cs` sets pending turn buffering, and the same ExecuteMovement continues through TryAdvance and WritePosition. Thus true does **not** imply facing-only behavior. `player-controls.mjs` emits true at press and false on the held50ms timer. No held-timer move(false) appears in these captures, so sustained continuous walking is still untested.

Actual server `host.operation_result` rows distinguish business application from sequence acknowledgement. `Server/Engine/src/owner.rs` emits those rows only after current session room/generation/net_entity_id matches the result sender. The log text contains connection/generation/sequence/outcome, but omits the full sender ID; no full sender field is synthesized into it.

| Round / actual same life | Same-life authority pose before→after | Relevant actual Host operation result |
|---|---|---|
| first A `0000000000000001000000000000000e` | x9.5→9.675, z17.5; +0.175m east | gen1 seq2 tick822 Succeeded/Applied; seq3 tick822 BusinessReject/NotApplied `ability_rejected` |
| first B `00000000000000010000000000000010` | x17.5→17.150002, z17.5; −0.349998m west | gen1 seq2 tick824 and seq3 tick828 Succeeded/Applied |
| second A `0000000000000001000000000000002e` | z15.5→15.675, x1.5; +0.175m south | gen3 seq1 tick1197 Succeeded/Applied; seq2 tick1197 BusinessReject/NotApplied `ability_rejected` |
| second B `0000000000000001000000000000002f` | z17.5→17.325, x11.5; −0.175m north | gen3 seq1 tick1197 Succeeded/Applied; seq2 tick1197 BusinessReject/NotApplied `ability_rejected` |

Both A and B raw pose tails see the same full life IDs and approximately the same deltas (small decimal serialization differences remain in raw data). This corroborates bilateral discrete step synchronization. Each life is a separate sequence; old and respawned lives are never stitched. Presentation authority fields and Host execution-tick fields are retained independently without inventing a clock offset. The temporal group correlation and actual source behavior support discrete steps; multiple accepted exports in one send window are not assigned to wire commands by FIFO guesses.

First round formal send→first retained authority-ack observations are A gen1 seq2/3 376.0/375.6ms, seq4/5 336.1/336.0ms; B gen1 seq2 490.2ms, seq3/4/5 253.8ms. Only B's first move export is uniquely isolated before its wire send: accepted→first observed ack547.5ms. Other individual input-to-wire associations are **UNPROVEN** because multiple accepted requests precede sends; selector acknowledgements also aged out of the80-state history.

Second round A gen3 seq1–4 are first acknowledged after about180.1–180.3ms from send. B gen3 seq1/2 are observed acknowledged after290.7/290.5ms; seq3/4 are not acknowledged in that retained B capture. The immutable DS prefix later records both B seq3/4 Succeeded/Applied at tick1200. This is outside the B retained projection ending1198 and does not imply a command failure. All these latency measurements end at first retained UI authority observation; they are not network RTT or exact DS execution latency. Advancing appliedInputSequence is not itself proof every acknowledged command business-applied; the duplicate-move BusinessRejects above are retained.

## Common real bombs

First round both views contain the same complete bomb IDs and durable owner participants:

- Bomb `00000000000000010000000000000025`, owner A `0000000000000001000000000000000f`.
- Bomb `00000000000000010000000000000026`, owner B `00000000000000010000000000000011`.

Both first-round bomb press/release exports were actually accepted and the corresponding later Host operations were Succeeded/Applied. Per-export sequence attribution remains bounded by the batching limitation. Full bomb ID plus exact owner and same-gen observed Self are actual evidence; no ordinal ownership is inferred.

Second round both views contain A bomb `00000000000000010000000000000044` with owner A. A sees B bomb `00000000000000010000000000000045` with owner B; B's earlier ending capture does not yet contain it. Therefore second-round bilateral shared-bomb observation is **UNPROVEN in these four files** despite later real B operation success.

SourceLife is formally server-only Scope.None and is omitted/null in client observation. Strong source-life identity remains UNPROVEN; that absence is not declared a product synchronization failure and is not filled from player caches or resolved by expanding field scope.

## Real performance and bounds

Timestamped Tick windows below start five seconds after each actual first Active and end at that capture's sample. Each metric comes from actual per-Tick boundaries. DS commit gaps use the same epoch window in the immutable prefix. Numeric rAF and C# call tails have no timestamps and are reported separately, never subtracted or relabeled as this exact window.

| Capture | Tick samples | Tick mean / p95 / max ms | Pump mean / p95 / max ms | DS commit mean gap ms |
|---|---:|---|---|---:|
| first A30 | 156 | 27.59 / 58.0 / 149.4 | 65.13 / 107.0 / 201.5 | 49.99 |
| first B31 | 178 | 24.23 / 47.2 / 193.9 | 55.97 / 100.6 / 184.4 | 49.99 |
| second A30 | 401 | 32.33 / 74.7 / 510.3 | 71.62 / 109.0 / 699.9 | 50.01 |
| second B31 | 430 | 30.70 / 69.2 / 495.3 | 66.32 / 109.2 / 899.5 | 50.01 |

For the longer second captures, Tick durations above100ms occur10 times in A and13 in B. rAF tails600 have A mean23.98/p9538.1/max333.4ms and B mean22.81/p9537.8/max371.5ms. Both visibility histories contain actual visible only, with no observed hidden transition. Long-task histories reach the80-row cap; their length is not the total long-task count. All four captures have faultCount0, but absence of instrumented projection faults does not cover every renderer/console failure.

In the longer per-Tick window, actual Native operation count averages46.88 A /43.37 B, p9596/66, maxima531/451. Recorded operation duration averages0.386/0.373ms with maxima10.0/12.4ms. Per-operation clock/voxel/hfsm/spatial/lifecycle counts and times remain in the JSON. These exact boundary observations are not subtracted from outer Tick to claim a fully isolated managed cost: Native timing excludes wrapper bookkeeping, while outer Tick includes wrappers. The debugger's JSON.stringify partial tail averages1.964/2.045ms, p955.0/5.3ms, and excludes TextEncoder, DOM assignment and other observer work. Last diagnostic DOM sizes705940/734903 bytes remain below1MiB; compact instrumentation still has cost. An official uninstrumented-page comparison is missing.

Observed gaps between captured authoritative pose samples have first-round maxima196.5ms A /250.4ms B and second-round maxima135.0ms A /158.9ms B. There are too few actual human step changes to assess continuous-motion gap distributions or choose a jump threshold. These values quantify retained observation cadence, not a frame-by-frame motion verdict.

The DS initially commits near50ms while browser Tick and pump have remaining long frames. This supports further client-side cost investigation, but does not establish one exact owning method from these outer timings, and does not accept the user's “不卡” requirement.

## Reentry outcome remains failed

The actual ledger records eight distinct close/new-tab attempts, old tab absent after each close, seven first-HUD captures and an eighth timeout. Tab38 closed20:02:36.106Z; new tab39 opened20:02:36.566Z. New A39 remains negotiating, socketreceived0, no firstIdentity/firstWorld. DS last commit3998 is followed by host3999/applied3998/frames0. That is a pre-Welcome delivery/commit hold, distinct from the former dump missing-component crash.

Seven HUD snapshots do not prove seven full acceptance cycles. The required ten current Active/presentation/advancing-authority cycles have not completed, and no old Running image is used to fill them. Current Runtime three Native prepared-reattach cases are separately GREEN with no new Runtime RED; authenticated Host reproduction and hold-stage evidence remain required before a new guard fix.
