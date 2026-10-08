# Pending terrain geometry independent source/test review

2026-10-03. Non-author review of Root's six new tests and the two production deltas. Verdict: **spec and quality PASS for this slice; actual six-case RED→GREEN closed**. No source, declaration, table, generator, index or heavy-process changes made by this reviewer.

## Source and minimal fix

| File | Before SHA256 | Reviewed current SHA256 |
|---|---|---|
| Gameplay/Components/Bomber/BomberBombState.Server.cs | 392b919fc6db7002b793be019681d0b46544ca8b56b2ffef0e7858a06ef8e59b | c403ac2ea15fd6651c82bd5b17cfa7fd62edcf84b6c2c4503e68a3c9f1e41bf0 |
| Gameplay/BomberTerrainTransactions.Server.cs | fa49897dd9af6cabc27fca02ac991e6124347f1c915b667b6b540d675969c8c7 | 9621ba531ee42a6cc8358b6e212637d9e8dde9bd82981919cfc63ab1aeab29f2 |
| Server/Tests/Gameplay/BomberPendingTerrainGeometryTests.cs | — | d97a3e5e700e72179923ed23be95687797d2e7f78cdc1b8bba66520a07e7cf03 |

The BombState delta only extracts the pre-existing accepted-ray predicate into internal ValidateTerrainFrontier and replaces its old inline body with that call. Automated reconstruction confirmed the entire original predicate and surrounding file content. Both versions are LF. The Terrain delta is exactly one new call at line 684; deleting that physical 100-byte line recreates its before file exactly. Its existing 21 CRLF lines remain unchanged, alongside one additional LF line. No incidental EOL normalization occurred.

The new call runs only after exact current live BomberBombEntity, owner Participant, historical SourceLife/generation, chain, Family, Occurred and actual source Power validation. It verifies the signed distance on the declared axis is positive and at most that bomb's Power; piercing requires distance + remaining == Power, ordinary non-piercing requires remaining == 0. This matches actual Ray/TryDestroy production: ordinary rays intentionally pass zero remaining even before their maximum distance, while piercing preserves the original frontier budget. Long arithmetic prevents distance overflow. The earlier row bounds still reject invalid direction, negative remaining, out-of-map geometry and remaining >= Power. It is not a hard-coded Power6 bound or a cap derived from default authored power.

The caller leaves all specialist early branches intact: bridge, regeneration, barrel, strong chest, spawn/circle/round cleanup and initialization retain their dedicated validations. No non-bomb intent is subjected to the generic ray rule. Historical source Life need not remain live or current; the live source bomb and immutable tuple are required. Existing source-hold/round gates retain that bomb while its pending transaction exists.

Begin validates the entire owned state before draining any receipt, then retains exact matching transaction, prior submission tick, null operation/batch, real Original Applied/TokenConsumed, complete receipt bytes/sections and strictly advanced staged revisions. All-row settlement validation still precedes contacts, reward emission, destroyed statistics and pending clearing. OnHydrate calls the same validator. The extracted method performs no accounting or Native mutation and introduces no new truth store/public schema/contract.

## Test quality

Six cases are two single-field corruptions × Validate, official hydration and actual Original consumer. Each starts with a real Native soft-block destruction and authentic SDK Original, verifies full bomb/participant/life/generation/chain, Family/Occurred, exact section+offset and receipt bytes/revision, and proves the uncorrupted official hydration round trip before mutation. The only corrupted owned JSON field is Direction 1→3 or Remaining 3→2; both remain locally in range and previously passed the weaker source-power guard.

The explicit hydrate cut is official **RuntimeOnly** restore for owner validation, not paired Runtime+Native recovery. The actual Original cut uses the original scene/Native and ordinary Manager.Tick; it does not manufacture Native success, receipt bytes, or invoke a consumer helper instead of Tick. Its broad exception assertion is paired with strict exact pending/detail/reservation/statistics/reward/contact preservation, so an exception after partial accounting cannot pass. Runtime-only negative hydration additionally checks the original live scene snapshot unchanged. No prior test assertions were weakened.

## Actual execution identity and evidence

Read and hash-verified complete Root raw logs/JSON/exit files under `games/101-bomber/.run/v14-fullpack07-native-20261003`. Each run's source start/end identity is equal, sourceChanges is empty, actual `.exit` agrees with JSON exitCode. Verified all 54 actual artifact files (18 cuts × positive snapshot, corrupted snapshot, authentic raw receipt); corrupted/receipt hashes match the printed witness and positive bytes differ.

| Run | Total/pass/fail/skip | Raw child | Test source identity | Raw log SHA256 |
|---|---|---:|---|---|
| pending-terrain-geometry-red-01 | 6/0/6/0 | 2 | fc25c22e62548485d2a0c1319c35dafd3977267ec9c2ea8a779b914040c7bcfa | b879aa11aa50184924e47c81cb07eec30914eaace227f562f515855eb3fd8413 |
| pending-terrain-geometry-red-02 | 6/0/6/0 | 2 | d97a3e5e700e72179923ed23be95687797d2e7f78cdc1b8bba66520a07e7cf03 | f279d8995f09361a7db04a34b50469ee4b68b37615eef3a691753bc75c53750f |
| pending-terrain-geometry-green-01 | 6/6/0/0 | 0 | same d97a as RED02 | 7c38bc0b90d7c1da28dc4fa36860f7aa62bf871db24c2e2eae43c018a9cf8161 |

RED02 has genuine target failures: Validate and owner hydration throw no exception; both actual Original consumers throw no exception and change pending 1→0, DestroyedBlocks 0→1, reserved 1→0. GREEN's consumer faults specifically originate in ValidateTerrainFrontier before drain/accounting, with pending 1→1, destroyed 0→0, reserved 1→1, rewards and contacts unchanged. GREEN duration 5.793 seconds. RED01 is retained as historical evidence with a different test hash, not called same-test proof. RED02→GREEN uses exactly the final test bytes.

Root build28-pending-geometry-production is actual raw0, 0 warnings/errors, sourceChanges empty. Build log SHA256 5974d66b8e315a4bd696affa10dc5c2c9eee4275193e599adf74aa34dd46adc6. GREEN/build28 record Gameplay DLL 378e8e61e89436fbc3e54de20ca0c6f83da636dd7ae20cb17cd23e3368069556 and Tests DLL b54f9e90162a13e92fbcbc16b79e11197b26ec33d30361b36b4db4e7357967fa. RED02 recorded Gameplay d380dcf0ffc76ea1397ccb069c3ce5142366220a224ee6d56ceb3b469b19b376 and Tests f178033b792b5a5f9a963af2d421df38d75716dfa605bc3e20b1cedba9a41151. These distinct assemblies are intentional fresh-build identities, not swapped DLL evidence.

Common actual Native DLL c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12, build-info f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d; official complete07 manifest 652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04; Config commit a991a517f9dbae255321c25d65fea0bfdfdca42f. Exact argv and all six assembly hashes are preserved in the independent proof.

Independent lightweight verifier Node v24.18.0 child0; `.run/pending-terrain-geometry-independent-review-01/verification.json` SHA256 fee65a797c32200391b8805e32c9abed6c67ef350ac6f272e31b4c9f175fa4bc. It only reads source/raw artifacts and writes private evidence. Initial read guessed the BombState path without its Components/Bomber segment and got a read-only file-not-found; authoritative before.json supplied the corrected path, no build/source action followed that failed read.

No actionable finding remains in this two-domain fix. This closes only these six geometry checks. It does not establish complete Game acceptance, arbitrary malformed JSON coverage, paired recovery, full UGC capacity, all Native APIs, M2 or later unrelated source changes. The existing full regression remains Root's separate execution gate.
