# Schema15 preview compile drift: independent review

Reviewer: independent nonauthor `schema_pins_review`. Date: 2026-10-03.

**Verdict: ACCEPTED — the two exact compilation repairs described below.** The current 53-author / 44-generated schema15 inventory has exactly two differences from the prior accepted body inventory. Both differences were independently reconstructed and reversed byte-for-byte; the other 95 complete files retain their previously accepted bytes. This report is the acceptance supplement for Root's publication of those two pins. This reviewer changed no production source or production pin.

The preceding accepted report is `.sdd/101-20261003-schema15-actual-body-closure-independent-review.md`, SHA256 `08744706e45f9b30eaa8e20fe5a0a88ce23f07501ec9356a65bfad4906706216`. Its original 97-file inventory, SHA256 `122cd9c0b9143cacb6cf8878c06970986e702b9dde9873d6ca134ff36c48799e`, equals the current gate's old pin maps exactly. The physical before bytes of every one of those 97 files authenticate against those old pins. This supplement preserves the original schema, SDK07, release and R360 body-review context and all limits of that acceptance.

## Exact accepted changes

| File, relative to `games/101-bomber/` | Accepted before SHA256 | Accepted after SHA256 |
| --- | --- | --- |
| `Client/Bots/BomberPlayObservation.cs` | `2200b9f90ccd9ea1bc5e2790fedb839f7456206f00099acc3f668f100a9ed046` | `ae03de8bf355ac08e81c79bed7dd143012493773451ece460dde06b2a39afe50` |
| `Client/Presentation/src/replica-adapter.test.ts` | `0cd667554a8fd33cb0ccad6dedd430efcea44f23d77a65d068957d3be0a2a17e` | `d6450b7af1351fb3269e7e92a5e85436a87255b9105dfa18ddc6765d7ad28df2` |

The complete Bot file was reviewed. Its before image is 10,936 bytes; the after image is 10,948 bytes. The only changes rename the local `phase` declaration inside the region-fire branch and its one corresponding condition use to `regionPhase`. The outer `out long phase` remains the player life-phase gate. The original C# scope collision is recorded as CS0136 at line 89 in the preserved client build log. The region-phase field lookup, required value `1`, from/until Tick bounds, exact source-life exclusion, mask expansion, bounds checks and hazard construction remain byte-identical after reversing those two identifier edits. No new state, simulated hazard, ABI call or altered world rule is introduced.

The complete replica-adapter test file was reviewed. Its before image is 24,250 bytes; the after image is 24,422 bytes. The only changes are in the region-mask projection case: obtain the optional `FireZones` row with `?.[0]`, then throw explicitly if that actual row is absent. The second projection is held once as `covered` before the unchanged cell equality assertion. Each original projection still executes once. Missing output still fails the test; no fabricated row or default cells replace it. Empty-mask identity, full generation/match/chain strings, exact covered cells and expiry assertions remain. The two existing TS2532 errors correspond to these optional accesses. There are still 100 `expect` calls and 20 `it` declarations, with no removed case, skipped case, cast to `any` or relaxed equality. All text outside the two exact replacements remains unchanged, and both files keep their LF bytes.

The TS author repair's separately saved before/after images also match the independently authenticated old body and the actual current file. That author manifest was treated as supporting provenance, not as the independent review result.

## Independent evidence and fence

Evidence root: `.run/schema15-preview-compile-drift-independent-review-01/`. The reviewer script reads actual files, imports the fixed gate inventory, authenticates all old reviewed bytes, records all 97 current complete-file hashes, applies its own four exact edit operations in memory, proves the forward/reverse byte equality, and saves before/after copies for the two repairs. It does not call a compiler, generator, Native host or author patch script.

| Evidence | SHA256 |
| --- | --- |
| `verify.mjs` | `9deb3ef9fce4ae8aa916f36992d181654f0e93b70b946fb76fecf19cd92f5739` |
| `verification.json` | `da730dc0f2179af8833220840a9bedfe6ae113c771f46c58b6cb9bfaa23dbf04` |
| `accepted-inventory-pins.json` | `41bacd9024524dee32399a26c7b4483fcf0e59fda0038d49c7a36fa0697b9d1d` |
| `prior-byte-authentication.json` | `0261bc69b2c72a508b65e122b517489d07396a5090ada277a5d813aa84629495` |
| `fence-start.json` | `15d2cd8f62a600bd637bf408c59acfd04466364ee913813aa3f0af4fe75adefd` |
| `fence-end.json` | `28bc3933323bc78c18465140ac175cbd9ad99c93075bf7a73436015cdc7475c7` |

The start/end fence covers the complete 97-file body inventory and the production `Tools/schema-identity-v15-evidence.mjs` file. It shows zero drift during this review. The accepted inventory JSON contains exactly the full current 53-author / 44-generated hash maps, with only the two accepted author pins advanced. It is private evidence, not the published gate. No source change outside this inventory is approved by this supplement.

## Existing execution evidence and remaining limits

The preserved `two-player-schema15-preview-01` records were read and hash-pinned in `verification.json`. The old Bot build shows the real CS0136 failure. `build-client-02.log/json` shows the later build exit 0, zero warnings and zero errors. The original Presentation build shows the two optional-row TS2532 errors along with the separate BurnSource and HUD fixture typing errors; `build-presentation-02.log` shows the later typecheck/Vite build. The related Presentation run records 3 files / 45 tests passed and raw exit 0. These historical logs support the exact compile repairs; this reviewer did not rerun them and does not claim a new full build or test result. The physical official complete07 manifest remains SHA256 `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`.

The strict published gate still contains the old two pins at this report's fence and therefore correctly rejects the current source bytes. Root may publish this report's independently accepted pin record after checking the same physical current hashes. Publication must preserve the fixed 97-file inventory and exact validation. No tolerance, quota change, semantic bypass or automatic arbitrary-source repinning is approved.

This acceptance does not close real browser entry/re-entry, negotiation, movement/synchronization, full Native cohorts, release identity mismatch, broader GAS capacity, old-schema compatibility, or any other formal delivery gap. Those remain owned by their original execution and acceptance evidence.
