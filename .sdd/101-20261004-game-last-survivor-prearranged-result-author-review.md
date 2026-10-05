# 101 Game LastSurvivor / prearranged life result candidate

Author candidate for independent product review. This report does not close the real-browser delivery gate.

The private Game candidate corrects one internal LastSurvivor constraint: a real prearranged successor may land after the last opponent's actual death, so that opponent's positive elimination Tick may precede the authoritative EndTick. The result still requires exactly one survivor, the complete correct winner, eight complete unique identities, valid ranks and historical elimination times at or before EndTick. No Engine protocol, quotas, Tick frequency, runtime admission, public reason, historical death or corpse survival changes.

## Exact migration set

These are the only three sources proposed for migration into the normal Game structure. Nothing is staged or committed; all work is under the author's new private input/output directory.

| Target | Immutable candidate input | SHA256 |
|---|---|---|
| `Gameplay/Components/Bomber/BomberResults.Server.cs` | `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/final-seal-01/source/Gameplay/Components/Bomber/BomberResults.Server.cs` | `33bae49d123302710427ea56f2de59f1d88457bc94c41439d49c09554b9779b9` |
| `Server/Tests/Gameplay/PrearrangedFinalSurvivorContractTests.cs` | `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/final-seal-01/source/Server/Tests/Gameplay/PrearrangedFinalSurvivorContractTests.cs` | `576f0a489843a3b38974c7857ee78853c3ef25404a5b83a7b7db078782597e15` |
| `Server/Tests/Gameplay/ResultReasonNegativeBoundaryTests.cs` | `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/final-seal-01/source/Server/Tests/Gameplay/ResultReasonNegativeBoundaryTests.cs` | `95cf5451624728fa28ee0933f50b38d6c8d763e9ff455b568ba3e7b62bac5d48` |

Production before SHA is `12540d9b203c44cff049a69fe63b3770187dc85e860bd73dc76021a0e29e6d2a`. At line 228 only the first `=` in the `==` changes to `<`. Equal file lengths and one changed byte are separately recorded by the seal script; replacing the one `<=` back with `==` recovers the complete original bytes. The exact diff is `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/candidate-01/exact-one-source.diff`.

## Existing product contract and measured failure

Read the active ADR0025, ADR0031, ADR0035; `docs/specs/bomber/design.md` §4.2 line 120 preserves the one pre-final respawn already counting down. `docs/specs/bomber/stage0-kernel-contract.md` line 196 preserves that life and requires landing inside the current safe circle. Existing `BomberCircleRespawnTests` and `BomberSuccessorConsumptionTests.PrearrangedRespawnPreventsLastSurvivorBeforeTheDeadline` already retain this qualification across final entry. None specifies the result-row requirement `sorted[1].EliminatedTick == match.EndTick`.

The first private build used the original Results `12540…`, original lifecycle `97f275969a8a8826a13007c1b315b5e7a258821853e6329013fc7b66dbc2f0de`, and the unchanged new real Native test `576f…`. Both cases use the existing controlled `BomberTerrainProductionTests.Scene` and actual official Engine11 Native. Their fixture/driver prefixes are extracted without changing method bodies; full originals and extraction lengths/checksums are frozen. Migration uses the existing full classes, not these extracted fixture copies.

Six earlier eliminations are explicit fixture inputs. A's ordinary death, Prepare/Create/restoration witness, authenticated fixture transfer, actual new entity, new generation, health restoration and landing are real Native/managed owner work. The last opponent dies from three actual distinct bomb families using the opponent's still-live identity as source. The fixture is an owner integration driver, not a real signed socket, Platform launch or browser.

| Case | Actual sequence with original source | Result |
|---|---|---|
| Healthy prearranged A crosses Final, lands, then B dies | A new Life `…0015`, generation 2, Protected, current health 6; B dies Tick72; header EndTick72 / LastSurvivor / A / 1; actual original publisher retains all 8 rows | PASS |
| Last opponent B dies while A's healthy prearranged successor waits | B dies Tick69; Final remains open with A's waiting right; transfer Applied Tick71; actual A lands Tick72 as new Life `…0015` / generation2 / Protected / 6HP; header EndTick72 / LastSurvivor / A / 1; next actual ProcessorPlan at World.Tick73 publishes | FAIL at original `ValidateMatch:235`, because B's real Elim69 precedes End72 |

Actual original run `test.exit=2`, 2 tests, 1 PASS, 1 FAIL, 0 skips. This is a production Tick failure after legitimate restoration and transfer, not a fabricated validator call or a refusal in the lifecycle seam. Build01 exits 0, zero warnings/errors. Frozen RED manifest: `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/red-seal-01/manifest.json`, SHA `512eff78c5927fe71bbb15eb08e6bf4fae6c9cdf85206262d103c31789308c95`.

The parent explicitly authorized the one-byte private product correction after receiving this actual contradiction. The all-row validation already rejects zero, future or survival-contradictory elimination times. The LastSurvivor branch keeps its explicit `<=` for readable correspondence with that existing rule. It no longer independently proves the cause of a delay between last death and ending; the Game owner, not this detached retained result, generates that cause. No special prearranged flag is invented or persisted in the result.

## Same-source candidate verification

Build02 exits 0 with zero warnings/errors. The legal Native test `576f…` is byte-identical to RED and its compiled PDB checksum is exact. All runs use the same candidate Gameplay DLL and unchanged official Engine11 Native.

| Actual group | Result | Raw exit |
|---|---:|---:|
| Legal prearranged Native cases | 2 PASS / 0 skipped | 0 |
| New negative public result boundaries | 9 PASS / 0 skipped | 0 |
| Original entire `BomberResultRetentionTests.cs` | 4 PASS / 0 skipped | 0 |
| Original entire `BomberDurableHighlightsTests.cs` | 12 PASS / 0 skipped | 0 |
| Original entire `BomberMatchRegressionTests.cs` | 5 PASS / 0 skipped | 0 |
| Unchanged old `47a632…` paired8999 continuation | 1 FAIL / 0 skipped, expected independent historical-state refusal | 2 |

The five applicable groups are 32 PASS total. Raw exit, raw stdout, TRX and actual timelines are under `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/actual-02`. Nine new boundary cases reject future elimination, zero elimination, a corpse falsely marked survived, wrong winner, wrong survivor count, TimeLimit with only one survivor, singleton Simultaneous, unknown reason and incomplete roster before publication; snapshot bytes and generation stay unchanged. These are public result-validator boundaries, not simulated gameplay.

The four original Retention tests are consumed wholly and byte-exactly, including the full singleton before-publish and after-restore refusal, immutable two-match retention, malformed full identities/column corruption, contradictory winner/count/reason and tie-rank rules. Both other original files are wholly byte-exact. No assertion is deleted or rewritten. The nine new cases supplement the explicit future-death and zero-death boundaries; no existing test is claimed to have covered a case it did not contain.

## Source / compiler / Native fences

Official11 consumer freeze remains `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-11-consumer-freeze-01`. Manifest SHA is `f058833a218241c49b5f35078fd839dbc130ef5d3bcf5b57dbbaf3419e241867`; Native SHA is `ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff`. Selection uses that complete SDK, a private strict lock and cache. It does not bypass the extra fault log in the original live package or replace a DLL.

2,063 previous frozen Game inputs are checked after both builds: the candidate Results file is the only original source differing. All 143 generated entries in that manifest retain their original physical hashes. The original lifecycle `97f275…` is the compiled input; the shared default-off Prepare diagnostic `1542…` is not consumed. Original `47a632…` is neither overwritten nor altered. Old paired/RED outputs and shared Gameplay/tests/pins remain untouched by this author.

Both candidate Game and test PE CodeView IDs match their deployed PortablePDB IDs. PortablePDB document SHA checks bind the actual candidate Results, unchanged lifecycle, same legal Native test, new negative test, unchanged old paired test and all three old regression files. Twenty-four compiled identity records include the deployed Native, Game/test DLLs/PDBs and Engine managed dependencies. These identity checks do not claim a browser run.

Final independent-review input manifest: `C:/Work/LumioGames/LumioGame/.run/browser-result-contract-fixture-01/final-seal-01/manifest.json`, SHA `92a1e88479037da52892402b24b128b7524fbe61afad30aa9de46c892fc30ca0`. It freezes the three migration sources, 56 raw evidence files, 24 compiled records, parsed actual TRX totals, source inverse, original-file preservation and official closure identities. The later human-readable exact diff is supplementary; candidate before/after sources themselves are already included and immutable.

## Late8999 historical boundary and remaining acceptance

The paired cut8999 remains historically inconsistent with a lawful result at EndTick9015: seven immutable ElimTicks precede that end, no actual survivors, and only A is newly eliminated at the deadline. Its original test `47a632fe3b2f8c99943733127d66629aab58c25462e2df0ea9b06b07db0f0cd9` still fails at actual World.Tick9016 under this candidate. The unchanged Simultaneous rule requires at least two eliminations at EndTick; this patch corrects LastSurvivor only. No historical row, deadline, old test assertion or public reason is changed, and no corpse becomes Survived.

The old paired restore also omits Host routes and the nonpersisted Observer connection generation, so it cannot establish live Prepare refusal or reconnect root cause. This patch has no automatic historical-state migration. Old cuts of this form need an explicit lawful Owner migration/replay decision and must not be called healed or used as GREEN acceptance evidence. Nor is leaving Final open, suppressing an exception, or forbidding publication a browser fix.

Non-author review, exact source migration, applicable formal schema/pin review, shared-structure build and whole-package browser consumption remain with the parent. Runtime owner-scope isolation and its lifecycle regressions remain independent. Two real players, bidirectional movement/bombs and ten true close/new-page cycles still require actual acceptance.
