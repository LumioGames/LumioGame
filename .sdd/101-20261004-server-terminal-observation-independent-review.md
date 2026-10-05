# Server terminal-observation comparison: independent review

Reviewer: `/root/reentry_trace`. Final decision: **ACCEPT_EXACT_TEST_FIXTURE_AND_OFFICIAL10_REAL_HOST_GREEN**. Both frozen-source modes passed against the newly built official complete production10 package. No Server production change is proposed or made, and this review does not accept browser experience.

## Exact source and RED identity

The reviewed Server worktree is `C:/Work/LumioGames/.101-pack07/LumioServer10Diagnostic`, HEAD `15418fc104a97fc30f7de45fd0f0c7c93309777c`. The proposed write set is only these two test sources:

| File | SHA256 |
|---|---|
| `Tests/fixtures/successor_runtime/SuccessorScenario.cs` | `fc2ddcff5b5323cb57c0b91168d629bc4f66470bdfbad73245413cd746dbccbd` |
| `Tests/tests/terminal_observation_real_clr.rs` | `6c23deb2c55292b9be357f647968944bf7bf4fb88276212f38898b1b72d907bc` |

The fixture's four added lines introduce two dedicated environment-controlled modes, set the generated participant eligibility field false immediately before the existing PrepareSuccessor in the ineligible mode, and return at stage2 after the ordinary Prepare/Destroy commit. Default and previous fixture modes retain their original paths. Both dedicated modes stop before Create/Ready/transfer and differ only by declared eligibility. The new test includes the existing `successor_real_clr.rs` harness, which uses `sdk_loader::load`, actual `ClrGameplay`, Native timer, `DsHost`, `BoundAdmissionVerifier`, authenticated RoomListener and authenticated RoomClient. The test does not use a simulated Runtime or fabricate a missing owner result.

The explicit parts limits (64 deferred frames, 8MiB per connection), 20Hz Native cadence and fixed bounded kernel configuration are identical to the existing signed-successor harness. They are unchanged between baseline and RED. This is a narrow one-socket Host fixture, not the real eight-player Game acceptance environment.

The original authenticated initial publication helper requires actual SuccessorAuthorization → matching Welcome → WorldChange on the signed socket. The new assertions require observing authorization, matching participant and generation Welcome, subsequent observing WorldChange, at least eight further committed ticks, no transfer authorization, normal shutdown and zero publication debt. The test remains explicitly ignored by default but the preserved command executes exactly it with `--ignored --exact`; actual ignored count is zero.

The author report SHA256 is `7385393f2f57b3e0ffc31668949c6abde36d7b0886f101145dbe12a9ff1862c0`; original seal is `9da1ef6df0044eebd040b610caa5909a8aa0d536871ff5d71613f2e27e2038d2`. I independently verified and copied the seal's raw artifacts, current and frozen source hashes, original HEAD before hashes and all19 generated files. The17 changed generated files have only CRLF/LF differences; all original/current bytes remain untouched. Independent metadata: [red-audit-manifest.json](C:/Work/LumioGames/LumioGame/.run/server-terminal-observation-independent-review-01/red-audit-manifest.json), SHA256 `0571cd3087487fb6f4699cf96d8136cc047530ef2ed7fd5877418ee5e0893af8`.

| Original09 comparison | Raw Cargo exit | Executed result | Independent socket/tick check |
|---|---:|---|---|
| eligible-baseline-01 | 0 | 1 passed / 0 failed / 0 ignored | 10 samples, 25 frames, initial+observe authorization, applied4→18 |
| ineligible-red-01 | 101 | 0 passed / 1 failed / 0 ignored | 128 samples, 13 frames, initial authorization only; final124 samples applied10/frames0 |

The RED assertion is the missing actual observing authorization. It is not a compiler failure or fixture exception. The separate fixture strict SDK build exited0, zero warnings/errors. The outer shell's RED exit1 does not replace the preserved actual Cargo exit101.

## Unchanged consumer and limits of inference

The production owner, successor and CLR sources match original15418 bytes:

| Source | SHA256 |
|---|---|
| `Engine/src/owner.rs` | `86ba0843ea6a27873846c45c6448ca5778f5333982e14d14c8c261871e363021` |
| `Engine/src/successor.rs` | `48613ddc6cd0196ead2371a4530ba98c88a045334ee79fac3c40578f6298bb08` |
| `Engine/src/clr.rs` | `442be279d935b3d9b2357d41d6a100978d54261387a580083ac31c4ebddabc9d` |

I read the exact unchanged owner result planning and retained packet paths. Applied observe planning needs `record.owner_facts.as_ref()?` at owner.rs5317. `run_tick_against_runtime` reuses its retained bounded successor packet at5532; when accept_successor_initials fails it returns the previous committed tick and zero frames at5550. No Server guard is removed or bypassed. The upstream Runtime datum has its own independent Native destructive-drain RED and accepted exact OR-only repair, reviewed separately in [the Runtime review](C:/Work/LumioGames/LumioGame/.sdd/101-20261004-terminal-observe-runtime-independent-review.md).

This Host comparison does not inspect its retained internal drain packet. Missing owner facts are supported by the separate owning Runtime reproduction and unchanged consumer guard. The exact live09 tick7098 token/packet is still unobserved, and the live freeze began before A closed the browser. No direct attribution of that exact packet or all reentry failures follows from this fixture.

## Actual official10 verification

Fresh private output: `C:/Work/LumioGames/.101-pack07/LumioServer10Diagnostic/.run/terminal-observation-green10-01`. Private scripts import the owner's official SDK preparation functions and require the exact Root-provided complete package manifest SHA before preparing new strict locks, NuGet cache, fixture build and Cargo target. They keep the two frozen test sources and Server15418 production hashes fixed and consume HostEntry, Runtime, Native and catalog fixtures from the same complete10 release. No single-DLL substitution into09 was performed.

Release: `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-10`; manifest SHA256 `db86c9b3d2b5f9e33ef451454a125f2a39c2ca4eb75e2bbf38f2192afd02739a`. I independently verified all305 listed file SHA256 values before consumption, Runtime source `8afdffdd6d5de3a6bde9ba4ec57c22d5549aa1d9`, Server source15418 and NativeCore source `81b2501a621db2657bd087db2afa808ecfb9e846`. The actual Cargo NativeCore sibling is that same81b source; Engine wire/ABI root is `LumioGameEngine-101-release-freeze0e` at `0e2fc74783f9f186d59909b38d4ee70887a21137`.

Fresh SDK preparation exited0; new fixture strict locked restore/build exited0 with zero warnings/errors. No warning suppression or source change was added. The selected SDK archive SHA256 `8c94e088c0444e45fe558d3765208544c2d6c9d6c83e70ffe4a0b51f04bcc520` equals the freshly restored cache archive, and its SHA512 equals the selected identity. The original committed packages.lock.json was not changed. The fixture DLL is a new full-SDK build, not a copied or substituted09 DLL.

| Actual10 comparison | Raw Cargo exit | Executed result | Socket and continuous commit evidence |
|---|---:|---|---|
| eligible-green-01 | 0 | 1 passed / 0 failed / 0 ignored, 2.61s | 10 samples, 26 frames, initial+observe authorization; observing baseline tick9/gen2; applied4→18 |
| ineligible-green-01 | 0 | 1 passed / 0 failed / 0 ignored, 2.62s | 10 samples, 25 frames, initial+observe authorization; observing baseline tick10/gen2; applied5→19 |

Both show matching observing view/participant `00000000000000010000000000000003`, generation2, controlledLife=null and matching Welcome before observing WorldChange. The same test's eight-ticks-after-observation assertion passes; I separately checked final applied tick ≥ observing baseline tick+8. No transfer authorization appears. Actual Host/CLR/Native shutdown and zero publication debt assertions pass; no Host fault file was emitted. The first new Cargo target compilation took99s, which is build time, not player timing. After the successful comparison no repeated suite or broad Clippy run was performed.

| Actual10 consumed binary | SHA256 |
|---|---|
| official Native DLL | `ecd86e78bc66a94bdf49d4bc4bee9abef6f1329cba8a1dd4c0e96a9e5944cefd` |
| official HostEntry DLL | `dc498450d6f48058c0d136d6b9eef2c54b7ac576e27366b8a465394a6be830fb` |
| official Runtime Ecs DLL | `e0127706ecd5ba11a07357a9b3426d2cf987aea6e32801a5e2532101eecac0c9` |
| official Runtime Replication DLL | `d1747079aebb82cbade1407c125b89782d080045c2f316080c9e474876687f43` |
| newly built frozen fixture DLL | `98df6733351fc550ad44031602b987a4c8db33f8f9a60a4e58fd5e70aa8edad2` |
| newly compiled Rust test executable | `11b3c8c7a560a05f353352e640ca565eb4e817f269cd035353f7ae9859feee0f` |

The Native sidecar's actual buildId remains `d595e2c77e6943ecbbf43ea3994b8367` and ABI `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`; official10 binary bytes differ from09 and are checked by the real sdk_loader, not relabeled as09 bytes.

Final GREEN seal: [manifest.json](C:/Work/LumioGames/.101-pack07/LumioServer10Diagnostic/.run/terminal-observation-green10-01/seal-01/manifest.json), SHA256 `67d11febba64356ca33e17dc7ebc720c6f5aad172e7828fb722259f56f0d8fe2`, with31 copied raw/artifact/source records. Raw eligible log SHA256 `7063bcddebdea49205bb7124043bf26d9f334e744952e879dd27635e9bd5f082`; raw ineligible log SHA256 `e946ecdb1f72ca53ad1a33fb2c11ccf3988bfa71a3b45a0fdbafb74e366a770c`. `test.exit` files preserve actual0 separately from shell wrappers.

After both runs, all30 prebuild protected source/lock/generated files remain byte-identical, including both exact test sources and the17 existing CRLF changes. All22 original09 raw/DLL/script files from the author's seal still match their original hashes. The preflight review is retained at `.run/server-terminal-observation-independent-review-01/preflight-report.md`, SHA256 `8c32551511d6ddd7468d4bbf8ce08e0bed9d7b65cbed96a03e9526d4588edc1c`. No source staging, generated-file restoration, Server production edit, live09 restart or browser-acceptance claim occurred. Only the narrow signed one-socket comparison and owning upstream repair are accepted; Root must still complete actual two-player/eight-player browser lifecycle and performance acceptance.
