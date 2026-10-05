# Final three-source LastSurvivor candidate, optional test evidence

This is the final author input for non-author review. It supersedes only the mandatory-evidence test version in [the original author report](C:/Work/LumioGames/LumioGame/.sdd/101-20261004-game-last-survivor-prearranged-result-author-review.md). All production semantics, the one-byte inverse, product contract analysis, first actual RED, 32 passing cases, original controls and unchanged `47a632…` historical RED in that report remain applicable. The first report's current SHA is `e5407e5ce8f2fc6698abbe782ca444dd3dcc0d73366b42f4589f0deab52a91cd`; it is preserved.

The private Results correction remains **exactly one changed byte**, from `==` to `<=` on the LastSurvivor second-row elimination Tick. Before SHA is `12540d9b203c44cff049a69fe63b3770187dc85e860bd73dc76021a0e29e6d2a`; after SHA is `33bae49d123302710427ea56f2de59f1d88457bc94c41439d49c09554b9779b9`. Complete-byte inverse and original lengths match. The all-row positive/nonfuture elimination check, unique actual survivor/winner, complete identities and ranks remain; TimeLimit still requires at least two survivors and Simultaneous still requires at least two eliminations at EndTick.

## Final migration sources

Use only these three frozen files in their normal Game locations. No shared Gameplay, tests or pins are written by the author; nothing is staged or committed.

| Normal target | Frozen absolute input | SHA256 |
|---|---|---|
| `Gameplay/Components/Bomber/BomberResults.Server.cs` | `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/final-seal-02/source/Gameplay/Components/Bomber/BomberResults.Server.cs` | `33bae49d123302710427ea56f2de59f1d88457bc94c41439d49c09554b9779b9` |
| `Server/Tests/Gameplay/PrearrangedFinalSurvivorContractTests.cs` | `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/final-seal-02/source/Server/Tests/Gameplay/PrearrangedFinalSurvivorContractTests.cs` | `0d4456afbb6740639da554f257dcfc26e0678bcb2860cf803aa08003202d58d8` |
| `Server/Tests/Gameplay/ResultReasonNegativeBoundaryTests.cs` | `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/final-seal-02/source/Server/Tests/Gameplay/ResultReasonNegativeBoundaryTests.cs` | `95cf5451624728fa28ee0933f50b38d6c8d763e9ff455b568ba3e7b62bac5d48` |

The v2 Native test changes evidence I/O only. If `BOMBER_CONTRACT_EVIDENCE` is absent, `Observe` returns without writing or collecting evidence. Setup, real bombs, Native/Runtime driver calls, all loops and all assertions are byte-identical after reversing the two output-only fragments. The final seal mechanically verifies that inverse against frozen original `576f0a489843a3b38974c7857ee78853c3ef25404a5b83a7b7db078782597e15`; that original test, RED, GREEN and seal01 are not overwritten. Migration uses the full existing normal fixture classes, not the private prefix extracts.

## Exact v2 actual verification

The same v2 `0d4456…` is compiled and run under both original Results `12540…` and candidate Results `33bae…`. Original-source RED is built from a new physical private Game copy; no final compiler item replacement remains.

| New actual run | Compiled Results | TRX | Raw exit |
|---|---|---|---:|
| `actual-05-optional-original-red` | Original `12540…` | 1 PASS / 1 FAIL / 0 skipped | 2 |
| `actual-03-test-optional/with-evidence` | Candidate `33bae…` | 2 PASS / 0 skipped | 0 |
| `actual-03-test-optional/without-evidence` | Candidate `33bae…` | 2 PASS / 0 skipped | 0 |

The actual failure remains the legitimate prearranged-final case: B dies Tick69, A actual transfer commits Tick71, actual new healthy controlled Life lands Tick72, LastSurvivor EndTick72 is published at actual World.Tick73 and the original equality refuses B's retained Elim69. Candidate accepts that full legal result. The normal same-Tick death case passes under both. No synthetic result replaces these real gameplay ticks.

Build03 and Build05 exit 0 with zero warnings/errors. A prior attempt `build-04` tried an absolute Compile-item removal, did not match the existing relative item and failed with seven duplicate C# declaration errors. Its source, target and raw log are retained and classified **INVALID private build mechanics, not gameplay RED or GREEN**. The final original-source build uses a separate physical `game-input-red-optional` tree and the original Results bytes; PortablePDB confirms that actual input.

Thirty already-qualified controls remain applicable unchanged: nine new negative boundaries, all four original Retention tests, all twelve original DurableHighlights tests and all five original MatchRegression tests. Neither the Results candidate nor those test bodies changed for v2; only optional output in the Native two-case test changed. No additional broad test run is claimed. The unchanged original `47a632…` same-cut8999 test remains exact and actually fails at World.Tick9016 under the same one-byte production candidate, as sealed in prior seal01.

## Frozen identity / evidence

Final input manifest is `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/final-seal-02/manifest.json`, SHA **`d18e916ed53b71b5e0681af8154cb52dad7e0b7e9672ad9b7015fc559ee3d3c1`**. It freezes all three final sources, 33 new raw files, 48 compiled records across original/candidate builds, actual TRX counters and optional-fragment inverse. It independently rereads every frozen 56 raw and 24 compiled hash from prior seal01 (`92a1e88479037da52892402b24b128b7524fbe61afad30aa9de46c892fc30ca0`) without modifying it. These are author mechanical identity checks, not a non-author verdict.

Candidate and original PE CodeView IDs match the deployed Game/test PortablePDB IDs. Actual document checksums prove original/candidate Results, unchanged lifecycle `97f275969a8a8826a13007c1b315b5e7a258821853e6329013fc7b66dbc2f0de`, final optional Native test `0d4456…` and unchanged negative test `95cf…`. The private candidate source check finds only Results differing among 2,063 baseline inputs; the new original copy has zero differences. All 143 generated entries stay byte-identical. Official11 Native is unchanged **`ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff`**, from full consumer-freeze manifest **`f058833a218241c49b5f35078fd839dbc130ef5d3bcf5b57dbbaf3419e241867`**. Shared diagnostic lifecycle `1542…` and any subsequent Runtime isolation candidates are not part of this test input.

This source-level repair covers legitimate prearranged-life LastSurvivor result publication. It does not migrate the already inconsistent late8999 history, change its seven elimination times or EndTick9015 assertion, add a reason or turn a corpse into a survivor. That historical state still requires an explicit lawful Owner migration/replay decision. Runtime Prepare refusal, reconnect/dual-player synchronization/movement and ten actual close/new-page cycles remain separate real-browser acceptance work.
