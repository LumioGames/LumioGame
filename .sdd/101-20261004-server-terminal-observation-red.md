# 101 terminal observation: real CLR/Native and signed-socket RED

Status: **REAL_HOST_RED_CONFIRMED**, no Server production fix, no private Server trace, no live-browser acceptance claim. Author `/root/schema_pins_review`; owning isolated tree `C:/Work/LumioGames/.101-pack07/LumioServer10Diagnostic`, branch `codex/101-server-hold-diagnostic`, base `15418fc104a97fc30f7de45fd0f0c7c93309777c`. Sources remain unstaged and uncommitted for independent review.

## Exact proposal and frozen evidence

Only two test files are proposed:

- `Tests/fixtures/successor_runtime/SuccessorScenario.cs`: four added lines. SHA256 `fc2ddcff5b5323cb57c0b91168d629bc4f66470bdfbad73245413cd746dbccbd`; before `6c2671e40aeef1356d3d4aa7934ec72f63e965ab1dc8eafe419a284e2940822e`.
- New `Tests/tests/terminal_observation_real_clr.rs`: SHA256 `6c23deb2c55292b9be357f647968944bf7bf4fb88276212f38898b1b72d907bc`.

Frozen copies, before copies, all actual input hashes, raw logs, raw exit files, socket frames, sampled ticks and generated-output side effects are inventoried in [seal-01/manifest.json](C:/Work/LumioGames/.101-pack07/LumioServer10Diagnostic/.run/terminal-observation/seal-01/manifest.json), SHA256 `9da1ef6df0044eebd040b610caa5909a8aa0d536871ff5d71613f2e27e2038d2`. The private preparation and execution scripts are included in that inventory. No signed credential is printed or retained in the evidence.

## Actual controlled comparison

The same test executable, fixture DLL, official diagnostic09 Native/CLR/Runtime assemblies, transport profile, Native timer, signed-socket composition and original Server owner run in both processes. Only `LUMIO_SUCCESSOR_TERMINAL_OBSERVE_TEST` changes from `eligible` to `ineligible`.

Both dedicated fixture modes prepare and destroy the original controlled life and stop before `CreateSuccessor` or any future `Ready`/transfer request. The ineligible mode changes the declared participant `Eligible` Sync field to false immediately before the original `PrepareSuccessor` call. Participant/current-life/life-generation/next-life-generation/match/intent and the original account, room, attachment and connection generation stay on their existing generated and Runtime paths. The default fixture modes retain their original behavior.

The new test uses the original `signed_successor_runtime`, real `sdk_loader`, `DsHost`, authenticated `RoomListener` and `RoomClient`, and existing signed credential/verifier helpers. It requires initial authorization/Welcome/WorldChange, then observing authorization, the same participant/generation Welcome, an actual observing baseline, eight further committed ticks, no transfer authorization and zero publication debt after successful cleanup. It does not close/reopen a browser or claim to reproduce every browser lifecycle state.

| Evidence | Actual Cargo exit | Actual result | Observed behavior |
|---|---:|---|---|
| `eligible-baseline-01` | 0 | 1 passed, 0 failed, 0 ignored; 2.61 s | 10 manual samples, applied ticks 4→18; 25 socket frames; `initial,observe` authorizations; observing baseline and at least eight further ticks; no transfer. |
| `ineligible-red-01` | 101 | 0 passed, 1 failed, 0 ignored; 5.12 s | 128 manual samples; final 124 all applied10/frames0; 13 socket frames with initial authorization and initial baseline, no observe authorization. Assertion fails at new test line98: terminal observe authorization missing. |

Raw Cargo `test.exit` is authoritative. The outer PowerShell invocation/tool reported 1 for the RED, while its preserved Cargo exit is **101**. This is an expected behavioral assertion failure, not a compilation error, fixture exception or capacity refusal.

The RED diagnostic log first holds at host tick11, `2026-10-03T19:01:46.228506Z`, applied10/frames0; it still holds at host tick186, `19:01:48.776153Z`. Manual samples and automatic Native cadence share the real owner, explaining why the host tick count exceeds the 128 samples. There are no `clr_tick_drain`, `operation_batch_not_consumed` or host fault events in this run. All raw records are retained; source and test execution were not changed after the comparison.

## Source identity and consumer boundary

The official diagnostic09 manifest is SHA256 `6de6e91240457ed90ed7edcc0140bedb41724fabeaa5d9c93faa8ca3c78ba29b`. Its actual inputs include:

- Native `server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll`: `030046d7563efd8cfe01e127bd719470eaba06ef81c7f808b640d97efea78ba8`.
- HostEntry DLL: `dc498450d6f48058c0d136d6b9eef2c54b7ac576e27366b8a465394a6be830fb`.
- SDK Runtime Ecs DLL: the exact diagnostic09 net10 payload recorded in both input JSON files; no manual DLL replacement. Diagnostic timing scopes are net10 no-ops, as established by the independent diagnostic09 identity audit.
- Fixture DLL was newly built using the exact diagnostic09 SDK archive, separately generated strict lock copy, isolated NuGet cache and feed. Fixture build exit0, zero warnings/errors. The original fixture `packages.lock.json` was not replaced.
- Cargo builds the Server15418 test composition against clean NativeCore `81b2501a621db2657bd087db2afa808ecfb9e846`, not the older sibling used during historical reentry tests. The actual loaded Native is the official diagnostic09 DLL above.

Server production before and after hashes are equal:

| Source | SHA256 |
|---|---|
| `Engine/src/owner.rs` | `86ba0843ea6a27873846c45c6448ca5778f5333982e14d14c8c261871e363021` |
| `Engine/src/successor.rs` | `48613ddc6cd0196ead2371a4530ba98c88a045334ee79fac3c40578f6298bb08` |
| `Engine/src/clr.rs` | `442be279d935b3d9b2357d41d6a100978d54261387a580083ac31c4ebddabc9d` |

The unchanged first consumer is `owner.rs:5317`: after selecting an Applied observe result, `record.owner_facts.as_ref()?` returns None if the Runtime export lacks owner facts. This line is **5317**; earlier informal messages saying 5319 were a line-number error. `accept_successor_initials:4789` rejects that unplanned result. `run_tick_against_runtime:5545` retains the complete original bounded successor packet and Runtime tick, and `:5550` reports the previous committed tick with zero frames. Repeated calls use that retained packet at `:5532`; they do not execute the world again. The existing overlap guard at 4802 is later and is not needed for this failure mechanism.

The independent owning Runtime source investigation finds the upstream seam: `WorldManager.SuccessorProjection.cs:261` (`ReadResultOwnerFacts`) calls `ValidateCurrentSuccessorOwner:160`; its global `MatchesCurrentEligibility` requirement at164 reaches `WorldManager.SuccessorEligibility.cs:53`, which requires `policy.Eligible`. Legal terminal observation therefore can commit Applied observe plus Welcome and history, yet lose its owner facts at the export boundary. `/root/browser_perf_trace` independently executes the actual generated Native Harness and destructive drain to test that datum. This Server test itself does **not** introspect the retained owner packet; it combines its real end-to-end stall with that independently observed Runtime datum and the exact unchanged consumer guard. It never claims that a transparent delegate captured the Host's same packet: external full delegation is unavailable because several RuntimeSurface signatures expose types not re-exported by Engine, and omitting their methods would alter real admission behavior.

The original live09 host freeze began at 18:30:16.185422Z, before A's actual close at 18:32:33.156Z. Its exact7098 reservation token/drain has not been captured. This controlled reproduction demonstrates the same legal terminal-observation failure mechanism; it does not relabel live7098 as a directly read packet or attribute its beginning to closing the browser.

## Generated side effects and validation limits

The official fixture generator rewrote 17 of 19 tracked generated files with CRLF. Every generated file was compared with HEAD after normalizing only CRLF/LF; semantic drift is zero. Exact original/current hashes and copies of the 17 changed before/after files are frozen in the seal. They remain uncommitted and are excluded from the two-file proposal. No generated content was edited to force a passing result.

Private SDK preparation exit0, fixture build exit0, normal baseline exit0 and expected behavioral RED exit101 are retained separately. `rustfmt --edition 2021 --check` for the new test and `git diff --check` both exit0; their logs/exit files are saved alongside the seal. The first Rust compilation took93s and is not reported as any player-facing timing. No mass test suite, private Server trace, Server production repair, browser acceptance, live09 restart or resource/quota/protocol change was performed.

To verify GREEN after the owning Runtime repair, consume a newly built official complete package and use a fresh private SDK selection/cache and evidence label. Keep these frozen test and fixture sources identical; do not replace individual DLLs in the existing RED directory or overwrite its runner/input records.
