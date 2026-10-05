# Server fresh Controlled admission followed by observation: independent review

Date: 2026-10-04. Reviewer: `schema_pins_review`, non-author of this repair. Author: `reentry_trace`.

**Verdict: ACCEPT_EXACT_FIVE_SOURCE_SERVER_REPAIR_FOR_OFFICIAL_PACKAGE_AND_BROWSER_REGRESSION.** No outstanding P1/P2 finding in the frozen candidate. This permits an exact scoped commit and an official complete package rebuild. It does not accept the eight-player browser experience, ten close/reopen cycles, performance, or Platform release identity. The reviewer performed no build, test rerun, source edit, commit, package substitution, or live-service operation.

## Exact accepted input

Owning tree: `C:/Work/LumioGames/.101-pack07/LumioServerPreparedReentry`, base `15418fc104a97fc30f7de45fd0f0c7c93309777c`.

| Candidate path | SHA256 |
| --- | --- |
| `Engine/src/owner.rs` | `a936a2b345d0b874514ed4ad21e31d818a30533fcdaae8edb33be3ecdc1de86d` |
| `Engine/src/successor.rs` | `a4b612fccafc4c31e026ac5c4b959b009bdcd655be733f161f3d9824e3cfc5f1` |
| `Engine/src/owner/admission/lifecycle.rs` | `7ad72c10786d670830c75d3129d2f52d9abf0ee2aab855f8bbdda22191ca1a68` |
| `Tests/tests/prepared_browser_reentry_real_clr.rs` | `89a0fa3be841ee5003a817431d2c22da7d86099c1461b78d281205fb8452cd13` |
| `Tests/fixtures/successor_runtime/SuccessorScenario.cs` | `736c824032788fc0291cce9c05af50a74b716b9ae34004719e7125eff150a954` |

Author report: [controlled initial observation author review](101-20261004-server-controlled-initial-observation-author-review.md), SHA256 `56a6c08220c02fce0782002e7e6da4063beea8045e91df8dac1d7e1148313822`.

Author seal: `C:/Work/LumioGames/.101-pack07/LumioServerPreparedReentry/.run/prepared-reentry-final-fixture-05/seal-06/manifest.json`, 229470 bytes, SHA256 `de98485a4d0e1702ef9d2c3e51f1a46b1f852ccbbca71564751924d55ae273dd`. All **215** inventoried records match their actual length and SHA256. Current source, frozen author source, and independent source copies match for all five paths. Final run input source hashes and every input file identity match. The author seal excludes its own output.

Independent evidence: `C:/Work/LumioGames/LumioGame/.run/server-prepared-reentry-independent-review-01`. The byte audit is `final-seal-byte-audit-01.json`, SHA256 `823cd7041076d4d70de3dd21efbd5c1dd23b360ab6079dadca4b9b3548b88598`. Supplement `final-supplement-01.json`, SHA256 `ac49061f4d70e2812b0eee32db32742b337dda5091a8bd5e71938a499e6d05ca`, independently rechecks final guard results, eight unchanged function bodies, baseline production source and terminal socket format. The byte audit's compact prepared-browser frame summary uses `after`; the supplementary terminal summary uses the terminal harness's actual `frames` property. Raw terminal evidence was never changed.

## Root cause and why this change is necessary

The authentic private Host diagnostic captured a held batch at applied14/last13: `results.session_missing`, one admission, one Applied observe result and valid owner facts, no requests or terminals. The same fresh connection was pending, absent from `sessions`. Frozen initial facts were controlled old life/gen2; independently read final facts were observing participant/gen3; original reservation history referenced that old life/gen2. This disproves a missing-owner-facts explanation for this reproduction. Ordinary disconnect removed the old route while the old life stayed live; offline preparation returned `binding_not_found`; new signed Controlled admission restored a legal route and normal same-Tick preparation/destruction then produced this paired output.

This diagnostic used earlier fixture393/testfb4. It proves that particular batch mechanism. Final public socket evidence explicitly marks Runtime drain grouping unknown; it does not establish the exact internal grouping of the live10 stalled batch. The final stronger testcase and narrowed fixture preserve the relevant Stage1 ordering and independently reproduce the original Server failure.

The first candidate's actual failure after initial publication was `SubscriptionContradictsHolding`, generation2, during observing generation3 sections. Neither of the two Welcome-specific rejection tags fired. The original initial baseline must finish first; then the actual observing session/voxel generation must become current before retained observing groups route. Adding only a pending-session lookup does not satisfy that delivery contract.

## Authority, ordering, accounting and negative boundaries

The new result-planning branch requires an issued, non-closing Controlled pending admission, no active session, an Applied observe result, exactly one corresponding same-batch initial record, the original verified unclosed socket/profile, independent owner facts and history, and exactly one matching real Welcome. Existing active-session and reattach branches continue through their prior paths. Duplicate/missing/cross-identity evidence does not gain a permissive fallback.

`try_project_initial_observation_authorization` checks that the frozen predecessor equals the result's previous attachment and history old binding, controlled life, account, room and generation. Initial/result commit, capture and destruction Tick agree; `initial.current` equals independently read final current attachment; already-current authority is excluded. It invokes the unchanged strict initial issuer, constructs a local proof value of the established predecessor/sequence1, then invokes the unchanged transition issuer. Token/epoch/provenance/participant/policy/signed account/room/socket/profile/generation checks remain in force. This local proof is not a second simulation World.

The paired branch retains the proven result/owner/history without promoting a session during batch planning. `observe_initial` rechecks the complete proof and authorization bytes. The initial publication continues to use the frozen owner current, preserving its old Controlled authorization and snapshot. The new budget calculation separately sizes old and final attachments and retained history with checked arithmetic. It neither raises a limit nor removes an existing charge. Refused planning remains held, without authorizing publication.

The original `AdmissionPublication` must reach actual writer-fence completion and settlement `Released`. Only afterward does this new paired path perform the original `attach_member` call and complete a session using final observing current/sequence2/history. **This is an intentional ordering change for the new branch:** completion occurs before deferred replay. Ordinary Controlled admission retains its previous flush-before-completion path. Attach failure still closes/seals through the original handling. The voxel ledger resets only at the proved generation handoff; egress generation remains old until the authentic queued Welcome changes it. Both original Welcome refusal guards remain unchanged.

Deferred groups and their move-only charges are moved, not cloned or prematurely refunded. Deduction is from the same first egress that originally owned deferred counters, with the original non-saturating accounting. Groups then traverse the unchanged bounded routing/section/publication-fence implementation. The observation debt still requires an actual successor writer mark. Queue acceptance, unknown ACK, or initial settlement cannot substitute for that mark.

Eight complete original function bodies were independently compared with immutable Server15418, normalizing only line endings: both authorization issuers, `deliver_to_egresses` (both Welcome guards), `flush_observer_egress`, `route_connection_tick_group`, `enqueue_successor_publication_fence`, `reconcile_successor_publications`, and `apply_runtime_identity`. All are unchanged. Eligibility-update/transition overlap, terminal-transfer, expiry, original request capacity/history/current/socket selection and protocol checks remain. No Tick cadence, gameplay authority, Native budget, player count or voxel feature changes.

## Actual evidence, not inferred results

All listed Host tests use real CLR, official complete10 Native, signed original/fresh sockets and actual peer close1001. They were selected explicitly with `--ignored --exact`; their logs report one executed case and **zero ignored**, rather than a skipped test being counted as passed.

| Exact final run | Raw exit | Independently observed result |
| --- | ---: | --- |
| Original15418 + same89a0/736c `offline-exact-red-05` | 101 | 0 pass/1 fail/0 ignored; fresh socket0 frames, applied12 frozen |
| Final5 `offline-final-05` | 0 | 1 pass/0 ignored; AUTH1/gen2 → Welcome2 → baseline14, AUTH2/gen3 → Welcome3 → baseline14, later AUTH3/gen4 → Welcome4; WorldChanges through91, Host through93 |
| Final5 `prepared-final-05` | 0 | 1 pass/0 ignored; reattach2→3 then transfer3→4; WorldChanges22–89, Host91 |
| Final5 `ready-final-05` | 0 | 1 pass/0 ignored; stale Ready denied by actual NotApplied/successor_binding_mismatch; valid new reattach and transfer; WorldChanges23–91, Host92 |
| Original expiry test, final3 + fixture736c | 0 | 1 pass/0 ignored; durable Participant/dormant successor expiry regression preserved |
| Independent frozen terminal eligible fixture/test + final3 | 0 | 1 pass/0 ignored |
| Same independent terminal ineligible fixture/test + final3 | 0 | 1 pass/0 ignored |

The qualifying RED's three production source files equal immutable15418 bytes; its test and fixture equal final candidate bytes. Its first failure is the ordered fresh AUTH/Welcome/baseline assertion; failed-flow cleanup is retained and is not the root-cause assertion. Candidate successful cleanup asserts shared publication debt exactly0. The terminal harness is a separate private regression input (test6c23/fixturefc2d), not an extra candidate source; both modes retain real observe AUTH/Welcome and subsequent WorldChanges/Host progression.

The eleven final registered Engine guard cases each have actual raw0, one pass, zero ignored: paired proof plus 24 independent mutations and a closed actual EgressPort; first-egress debt ownership; exact initial authority/retry charge; real writer fence/unknown ACK; Full initial section/delta order; deferred backlog; exhausted process credit; successor fence/FIFO; new-generation void; voided subscription rejection; and parts-receipt FIFO without extra Runtime Tick. The 24 mutations include coordinated history/result/owner changes which remain internally equal but contradict the independent predecessor. These are eleven tests, not 24 separate executions. They do not prove every possible allocation fault, malicious batch combination or network interleaving.

Final Engine all-target test-harness clippy and new Host-target clippy actual raw0; fresh candidate/baseline fixture builds actual raw0/0 warnings/0 errors. No broad test suite rerun is claimed, and the reviewer ran none.

## Identity and preservation limits

Inputs independently hash-match official complete10 manifest `db86c9b3d2b5f9e33ef451454a125f2a39c2ca4eb75e2bbf38f2192afd02739a`, actual Native `ecd86e78bc66a94bdf49d4bc4bee9abef6f1329cba8a1dd4c0e96a9e5944cefd`, Ecs `e0127706ecd5ba11a07357a9b3426d2cf987aea6e32801a5e2532101eecac0c9`, Replication `d1747079aebb82cbade1407c125b89782d080045c2f316080c9e474876687f43`, HostEntry `dc498450d6f48058c0d136d6b9eef2c54b7ac576e27366b8a465394a6be830fb`, Runtimeconfig `2e1693f8326910b07be4292d78dceba9cb49952c500afab1860d09b4d5e54047`, and hostfxr10.0.11. The fresh fixture/strict SDK lock/cache and compiled source inputs are inventoried. Cargo Native sibling is81b2501, Engine source0e2fc74; Runtime10 composition8afd. This does not qualify the later official11 SDK CLR closure; that is separate package identity work.

The Host fixture uses its established parts/receipts 64-frame/8MiB harness limits. Those are not new production defaults. It deliberately isolates one lifecycle and is not the required real eight-player browser room. The newly explicit Ready retry permits only `NotApplied && Code == successor_binding_mismatch`; all other refusals follow the original fixture error/throw path. Offline preparation retries only the authentic `binding_not_found` in its dedicated mode. Ordinary fixture mode preserves its original behavior.

All six current tracked lock hashes match the author seal and are semantically unchanged against HEAD. Cargo.lock's original physical CRLF hash remains equal to its captured pre-build bytes, while its Git blob is LF. Nineteen generated fixture files were current-hash verified; seventeen differ physically by CRLF only, semantic diff exit0. These side effects remain unstaged and are excluded from the exact five-source commit. The reviewer did not alter Game pins/locks; broad Game97/110 closure was not rerun as part of this Server review.

Preserved non-qualifying attempts are not hidden: original393 dedicated Ready retried too broadly; it is superseded for final qualification. Fixture04 used a wrong shortened refusal literal and its actual101 is a private fixture failure, despite the directory's historical “green” label. Final05 corrects only the exact actual Code. Candidate01 remains a real partial-fix failure. The unexecuted every-egress deduction variant remains NOT_RUN; its correction is covered by the two-egress regression. Clippy02's style101 is an analyzer failure, not behavior RED. Administrative seal05 rejected original CRLF vs Git LF and produced no manifest; its private copies/script remain, while seal06 independently binds captured physical locks. Reviewer supplementary extractor attempt01 could not find two top-level Rust functions because it assumed indentation; the preserved private script was corrected to use the function's actual indentation before evidence was emitted. This is an evidence-extraction correction, not a Server result.

No unsupported full-browser, performance or final-release claim follows from this verdict. Root must consume the exact accepted source through the official complete package and run the requested real browser validation, while preserving live10 and earlier evidence.
