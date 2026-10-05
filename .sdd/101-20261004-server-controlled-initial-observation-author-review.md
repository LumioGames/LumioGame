# Server controlled initial → same-commit observation: author review

Date: 2026-10-04. Author: `reentry_trace`. Status: **AUTHOR_GREEN / pending non-author acceptance**. This report covers an isolated Server fix and real CLR/Native/socket regressions. It does not close browser experience acceptance or the Platform release identity gap.

## Frozen candidate

Owning worktree: `C:/Work/LumioGames/.101-pack07/LumioServerPreparedReentry`, branch `codex/101-prepared-browser-reentry`, base `15418fc104a97fc30f7de45fd0f0c7c93309777c`. No stage or commit by the author. Exactly five candidate paths:

| Path relative to Server | SHA256 |
| --- | --- |
| `Engine/src/owner.rs` | `a936a2b345d0b874514ed4ad21e31d818a30533fcdaae8edb33be3ecdc1de86d` |
| `Engine/src/successor.rs` | `a4b612fccafc4c31e026ac5c4b959b009bdcd655be733f161f3d9824e3cfc5f1` |
| `Engine/src/owner/admission/lifecycle.rs` | `7ad72c10786d670830c75d3129d2f52d9abf0ee2aab855f8bbdda22191ca1a68` |
| `Tests/tests/prepared_browser_reentry_real_clr.rs` | `89a0fa3be841ee5003a817431d2c22da7d86099c1461b78d281205fb8452cd13` |
| `Tests/fixtures/successor_runtime/SuccessorScenario.cs` | `736c824032788fc0291cce9c05af50a74b716b9ae34004719e7125eff150a954` |

Final seal: `C:/Work/LumioGames/.101-pack07/LumioServerPreparedReentry/.run/prepared-reentry-final-fixture-05/seal-06/manifest.json`, SHA256 **`de98485a4d0e1702ef9d2c3e51f1a46b1f852ccbbca71564751924d55ae273dd`**, 229470 bytes. It contains five frozen source copies, 215 evidence inventory entries, exact paired RED/GREEN, final guard results, lock/derived-file audit, and compact socket/host Tick evidence. It excludes itself from its inventory.

## Reproduced cause

Closing a live browser can remove the Runtime route while its old life remains live. An offline death intent then legitimately receives `binding_not_found` from `PrepareSuccessor`. On a new signed Controlled admission for the same account/room, the Runtime restores the old life route; normal gameplay can immediately prepare and destroy that life in the same Tick. The drain contains both the frozen initial Controlled admission facts and the final Observing successor result/current facts.

The original Server `plan_successor_results` selected non-reattach authority only from `sessions`. The fresh Controlled connection still belonged to `pending_admissions`, so planning stopped before the frozen initial and observation could be published. The earlier Server15418 request repair did not cover this result path.

This is supported by authentic private Host diagnostics, not inferred solely from the test name. Frozen Schema diagnostic tree `LumioServerHoldDiagnostic`, `.run/prepared-reentry-diagnostic-01/offline-diagnostic-01/diagnostics/2026-10-03_000.log`, lines 21–32, recorded one untruncated held batch: held Tick14/last13; `results.session_missing`; one admission and one result, no requests/terminals; same connection pending=true/session=false; frozen controlled old life/gen2; final observing participant/gen3; original history token/old binding gen2; policy revision1. These diagnostics used the earlier frozen fixture393/testfb4 inputs. Later test89 strengthens complete asynchronous delivery assertions; final fixture736c additionally narrows the downstream Ready refusal retry. These changes do not redefine that Stage1 admission/death ordering. Public socket output correctly retains `runtimeDrainGrouping=unknown`; the final05 socket alone does not prove same drain grouping or reproduce the exact live10 stalled batch.

A pending-session lookup alone was insufficient. Candidate01 preserved the initial publication and reached initial AUTH1/Welcome2/Sections/WorldChange, then observe AUTH2, but failed with internal-error close. A separate private failure-only trace recorded actual `voxel.connection_reject`, `SubscriptionContradictsHolding`, old generation2 during the observer3 group. Neither original Welcome refusal guard was logged. The diagnosis required completing the original initial publication, then changing the legal voxel generation and replaying the retained group in order.

Private trace evidence is retained at `C:/Work/LumioGames/.101-pack07/LumioServerInitialObserveTrace/.run/candidate-01-route-trace/offline-route-invalid-01`. Its trace-only owner source SHA `0b581e015fd555d7282a4eef6af4fb52c324d07fb58187dc5486a7decb58d0e4` is not a candidate source and is not to enter a formal package.

## Minimal owning change and proof boundary

`owner.rs:5338` selects a new path only when there is no active session and a true Applied `observe` result is correlated with an issued, non-closing Controlled admission, exactly one matching same-batch initial record, verified live socket/profile, independent current owner facts, original reservation history, and exactly one matching real Welcome. Existing reattach and active-session paths remain separate.

`successor.rs:836` adds `try_project_initial_observation_authorization`. It requires the original frozen predecessor to match the result's previous attachment and history old binding/account/room/generation. The result, initial commit, capture and destruction Tick must agree. `initial.current` must equal the independently read final owner attachment. An already-current authority cannot use this branch. It first calls the existing strict initial issuer; a local verified authorization value with the proven predecessor/sequence1 then calls the existing strict transition issuer. This is an authorization proof value; it is not an additional simulation World. Existing token, epoch, origin, participant, policy, signed account/room, actual socket/profile and generation checks continue through the unchanged issuers.

`owner.rs:4814` prevents superseding only the specifically proven paired admission. It retains the real original initial plan/projection. `pending.successor_transition` stores the Applied result, final owner and original history; ordinary reattach stores no initial-observation history. No session is promoted during batch planning or result acceptance.

`lifecycle.rs:50` accepts the differing `record.current` only after rechecking that same paired proof, including byte equality with its planned authorization. The original initial authorization and publication authority use `record.owner.current`, preserving the frozen Controlled baseline. Retained record accounting now includes both independently sized attachments and retained history, with checked arithmetic; no quota is raised.

`lifecycle.rs:664–878` waits for the original `AdmissionPublication` to return `Released`, which follows its real writer fence and original settlement. Only then may the final Observing session be completed with actual current generation3, sequence2 and original history. The old Controlled voxel ledger is replaced at that proven generation handoff. The egress generation remains unchanged until the real queued Welcome changes it. The deferred groups are moved with their original move-only `_charge`; only the originally charged first egress has its deferred counters deducted. Each group then passes the existing bounded routing/section/publication-debt path. The subsequent observation debt still requires its actual successor fence.

There is no early promotion, fabricated `raw.current`, ACK substitution, default pending fallback, altered Welcome rejection, relaxed issuer or hidden World. The original ordinary initial route retains its existing flush-before-completion behavior. No DS cadence, gameplay/Native budget, SDK protocol, player/Bot count or voxel feature is changed.

The seal independently compares these complete function ranges after normalizing line endings (range starts at `fn`, excluding visibility):

| Existing function | Normalized bytes | Before/current SHA256 (equal) |
| --- | ---: | --- |
| `try_project_successor_initial_authorization_into` | 2294 | `3ae2cb2c3caa618829dbbaedcf1cc7891ce516a2a6a8dbac1f5a857f16be483a` |
| `try_project_successor_transition_authorization` | 6264 | `5921402273fc87ff02e9683a5f938817f3b4c75dee23469e1c14eaaa177712f5` |
| `deliver_to_egresses` including both Welcome guards | 4808 | `3995ee626949f9ff2a9fb75444882684774b6ef28125e8f5b54578d8ab047a1a` |

## Test construction and exact RED/GREEN

The new Host tests use existing `successor_real_clr.rs` support, real `DsHost`, official SDK Native loader, real CLR HostEntry, fresh signed credentials and the original `BoundAdmissionVerifier`/system clock. They close the old socket with 1001 and open a genuinely new socket. Credentials/signatures are not printed. Tests are explicitly selected with `--ignored --exact`; every reported execution has one actual case, **zero ignored**, and its raw process exit retained.

The fixture has three explicit private modes. Offline waits for a real peer close, records old life still live plus `binding_not_found`, then retries that exact preparation refusal when the new route becomes available. Prepared and Ready modes first assert real Created/order/Native restoration witness before closing. A future eligible Tick leaves the actual close/reopen window; it does not change simulation cadence or budgets. Dedicated Ready retry is **only** `CommitFact.NotApplied && Code == "successor_binding_mismatch"`; every other refusal sets the original failure field and follows the original throw path. Ordinary fixture mode remains unchanged.

Final candidate fixture was built in a fresh `.run/prepared-reentry-final-fixture-05` output, strict SDK lock copy and new NuGet cache. The pure15418 counterpart uses a different fresh `.run/exact-red-final-fixture-05`; no original393/04 DLL or evidence was overwritten. The Rust targets are the same isolated owning-source targets from earlier runs, not substituted binaries. Inputs include current exact source and artifact hashes.

| Final run | Exact source/fixture | Actual result/raw exit |
| --- | --- | --- |
| Pure15418 `offline-exact-red-05` | test89a0 + fixture736c, original 3 production files | 0 pass / 1 fail / 0 ignored, **101** |
| `offline-final-05` | final3 + same89a0/736c | 1 pass / 0 fail / 0 ignored, **0** |
| `prepared-final-05` | same final5 | 1 pass / 0 fail / 0 ignored, **0** |
| `ready-final-05` | same final5 | 1 pass / 0 fail / 0 ignored, **0** |
| `expiry-final-05` | final3 + fixture736c, original expiry test | 1 pass / 0 fail / 0 ignored, **0** |
| `eligible-final-candidate-03` | final3 + independently frozen terminal test/fixture | 1 pass / 0 fail / 0 ignored, **0** |
| `ineligible-final-candidate-03` | same independent terminal inputs | 1 pass / 0 fail / 0 ignored, **0** |

Final paired RED: `LumioServerPreparedExactRed/.run/exact-red-final-fixture-05/offline-exact-red-05/test.log` SHA **`f2a7dbee7f17e843f872e4bcd0ced320c53dbe6e7b39d5e8f75b05b1075f57ee`**; socket SHA **`ea737859b985b0b8fb018f433fa76af4e4e8bb4e649a823305da603b00ad3ebc`**. It fails the ordered fresh AUTH/Welcome/baseline assertion; zero fresh frames, applied Tick12 frozen. The failed-flow cleanup host-fault message is retained separately from that first assertion. Original15418 owner/successor/lifecycle are byte-equal to their baseline copies; test and fixture are byte-equal to final5.

Final offline GREEN: `.run/prepared-reentry-final-fixture-05/offline-final-05/test.log` SHA **`8e5204c57e125f3cc0bea9c78ecd216864e3a9f453c9f8a56e1b88e9158cd7b4`**; socket SHA **`50414e1666bea1a1f07cd125caab0d4e61877ba6930adf2abe59eb769eacb8cc`**. The actual new socket receives:

1. initial AUTH(sequence1, gen2) → Welcome2 → original baseline WorldChange14;
2. observe AUTH(sequence2, previous2/next3) → Welcome3 → observer baseline WorldChange14;
3. later transfer AUTH(sequence3, previous3/next4) → Welcome4 → continued WorldChange;
4. actual Native transfer Applied at Tick76, WorldChanges through91, host applied Tick through93, successful real cleanup and shared debt exactly0.

Prepared GREEN receives reattach seq1/2→3 and transfer seq2/3→4, WorldChanges22–89, host through91. Ready GREEN records the stale original grant's exact `NotApplied/successor_binding_mismatch` at Tick16; legitimate fresh reattach follows, new Native Ready and Applied transfer occur, WorldChanges23–91, host through92. It does not force the stale grant to succeed.

Independent terminal verification tree `LumioServerTerminalCandidateVerify` uses frozen test `6c23deb2c55292b9be357f647968944bf7bf4fb88276212f38898b1b72d907bc` and fixture `fc2ddcff5b5323cb57c0b91168d629bc4f66470bdfbad73245413cd746dbccbd`, each with fresh official10 SDK/cache/locks/bin. Both false/true eligibility cases receive observe AUTH2/Welcome2 and WorldChanges2–17; actual host continues through19. Its sources are additional private regression inputs, **not** part of the five-file candidate. Logs/socket hashes are in the final seal.

Earlier original Basic/Transfer controls and candidate02 controls each passed the authentic socket/Native regressions. Those use fixture393 ordinary mode and are retained as historical controls; they do not substitute for final05 dedicated qualification. Their complete logs/source inputs are inventoried. No repeated mass suite is claimed.

## Guard and strict checks

`.run/prepared-reentry-official10-01/engine-guards-final-03` ran these eleven exact registered tests against final3. Each is actual one pass/zero ignored/raw0; the runner validates a unique registered full name rather than accepting zero-case filters:

- same-initial-observation positive proof plus 24 independent mutations and a truly closed actual socket;
- extra egress retains original first-egress charge ownership and releases moved group charge exactly once;
- initial authority refusal/retry preserves one charged copy;
- actual writer fence required before session and unknown ACK retry;
- Full sender preserves initial Section then routes delta after fence;
- controlled backlog charge retained until writer fence release;
- exhausted process credit refuses a second payload;
- successor fence stays behind Full owner FIFO and actual writer mark;
- new generation voids unclosed group;
- subscription from voided generation is dropped;
- parts receipt retains FIFO before later parts without another Runtime Tick.

The 24 proof mutations cover socket, signed account/room/connection, incarnation, original request/commit, missing independent current/history/owner, prior generation, commit/capture/destruction Tick, token allocation, owner profile/account/room/currentgeneration/request, selected transport profile, and coordinated history/result/owner changes to oldlife/generation/same-commit facts. The latter preserve internal equality while violating the independent predecessor, avoiding a mirrored-field-only negative test.

Engine `clippy --all-targets --features test-harness` final raw0, log SHA `3938042797ba2869fd46ce924c98428e3f7760ce026d3f2905ef1d50580f9d4b`. New Host-test target clippy raw0, log SHA `ef4da0f9af6b6849925914e5ab2e077950b1cd7e10034a00d78141512847281c`. No warning suppression, broad allow, lowered error policy or protocol change. Both fresh fixture05 builds raw0/0 warnings/0 errors.

## Exact environment and protected inputs

All Host cases use complete official production10, manifest `db86c9b3d2b5f9e33ef451454a125f2a39c2ca4eb75e2bbf38f2192afd02739a`, rooted at `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-10`. Its original SDK archive is used with a fresh strict lock/cache, not individual assembly replacement.

- SDK `0.0.5-main.0e2fc74`, archive SHA256 `8c94e088c0444e45fe558d3765208544c2d6c9d6c83e70ffe4a0b51f04bcc520`.
- Native official10 `SDK/Native/win-x64/lumio_engine_native.dll`: SHA `ecd86e78bc66a94bdf49d4bc4bee9abef6f1329cba8a1dd4c0e96a9e5944cefd`; exact source `81b2501a621db2657bd087db2afa808ecfb9e846`.
- Actual Cargo sibling `C:/Work/LumioGames/.101-pack07/LumioNativeCore`: same81b commit. `LUMIO_ENGINE_ROOT=C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e`: `0e2fc74783f9f186d59909b38d4ee70887a21137`.
- HostEntry SHA `dc498450d6f48058c0d136d6b9eef2c54b7ac576e27366b8a465394a6be830fb`; official Runtimeconfig SHA `2e1693f8326910b07be4292d78dceba9cb49952c500afab1860d09b4d5e54047`; hostfxr10.0.11.
- Runtime official10 composition `8afdffdd6d5de3a6bde9ba4ec57c22d5549aa1d9`, Ecs SHA `e0127706ecd5ba11a07357a9b3426d2cf987aea6e32801a5e2532101eecac0c9`, Replication SHA `d1747079aebb82cbade1407c125b89782d080045c2f316080c9e474876687f43`.
- Catalog voxel fixture and original Native/Budget/profile inputs are unchanged. Host harness uses the previously authorized receipts/parts profile 64-frame/8MiB test limits. No production default or quota is increased. A one-life harness isolates this lifecycle; it cannot stand in for the required real eight-player browser room.

Server `clr.rs` remains exact `442be279d935b3d9b2357d41d6a100978d54261387a580083ac31c4ebddabc9d`. Six tracked locks are semantically unchanged. Four HostEntry locks and the fixture lock equal HEAD bytes; the working-tree `Cargo.lock` was originally CRLF while HEAD blob is LF and remains equal to its captured pre-build physical SHA `5f7a032a554cab84653509ba4d02a831bcc120e6edbd6cfbe01f530e44b97b4d`. The seventeen generated fixture files have only the generator's original physical CRLF changes; normalized semantic differences0. They remain in the worktree unstaged and must not be restored/cleaned or included in the candidate commit.

## Preserved failed and non-qualifying attempts

- Original baseline RED01/fb4 and RED02/e872 are retained with original fixture393, source and actual exits. Exact latest RED05 is the qualifying paired result.
- Candidate01 was partial progress only, real raw101/1011; its frozen source, socket and independent failure trace are retained. It is not GREEN.
- The unrun intermediate every-egress counter variant and unrun initial unit-data disposition mistake are frozen private files, explicitly **NOT_RUN**, not behavior RED/GREEN. Reviewer feedback narrowed deduction to the original charged first egress.
- Engine clippy02 actual101 (Some-only `and_then`→`map` suggestion and four unit-test mutator semicolons) is retained. Mechanical style cleanup produced finala4b6/7ad7; the final offline chain and final eleven guards were then rerun. This analyzer failure is not semantic RED.
- Fixture04/sourcebe170 incorrectly used shortened `binding_mismatch`; its Ready case actually failed raw101 after the genuine `successor_binding_mismatch`. Original source/DLL/log remain intact. Fixture05 changes exactly that literal and retries only genuine NotApplied binding mismatch; other refusals still throw. Directory `ready-final-green-04` is misleading historical naming, explicitly **PRIVATE_FIXTURE_FAILURE**, never counted GREEN or root-cause RED.
- First administrative `seal-05` attempt had no manifest because its gate compared original CRLF Cargo.lock against Git's LF blob. Its script and frozen copies remain. Final `seal-06` explicitly verifies captured physical input bytes plus normalized HEAD semantics; no input was changed to pass the seal.

The final candidate requires independent exact-source review and an official complete package rebuild before Game consumption. Real browser double-player movement/bombs and ten actual close/reopen cycles remain Root's acceptance work. Protected live10, older packages, diagnostic trees, Game changes and unrelated services were not restarted or altered by this author verification.
