# Schema15 reviewed pin publication and private Node validation

Date: 2026-10-04 (Asia/Shanghai). Executor: `schema_pins_review`, under Root's explicit authorization. **Two reviewed source pins and the evidence chain are published; strict97 PASS. Private Node corrective candidates remain unissued, with actual full-suite result 161/162 PASS, one FAIL, zero skipped, raw exit 1.**

## Published scope

Only `games/101-bomber/Tools/schema-identity-v15-evidence.mjs` was written in production. Its before SHA256 is `4c28cda29e8bbcd341df86516e7b8492b4b64c865a6b92ea59a583f4449adb0d`; after SHA256 is `aa880ac3839ced140386d2a17c974077a763a4e9c27a220f234725a72a9e8a6e`. The exact changes are the two independently accepted author hashes:

- `Client/Bots/BomberPlayObservation.cs`: `2200b9f90ccd9ea1bc5e2790fedb839f7456206f00099acc3f668f100a9ed046` → `ae03de8bf355ac08e81c79bed7dd143012493773451ece460dde06b2a39afe50`.
- `Client/Presentation/src/replica-adapter.test.ts`: `0cd667554a8fd33cb0ccad6dedd430efcea44f23d77a65d068957d3be0a2a17e` → `d6450b7af1351fb3269e7e92a5e85436a87255b9105dfa18ddc6765d7ad28df2`.

The existing `reviewEvidence` string retains the preceding report and appends the accepted supplement `.sdd/101-20261003-schema15-preview-compile-drift-independent-review.md@31798932ed18db387a013122bd15b06e1c5d8cd69a86c2414fe749c835ad450e`. The exact five-field review-object shape is retained. No property, fixed inventory member, validator branch, tolerance or quota was added. Independent report, sealed evidence, current97 hashes and the complete old pin-module hash were reauthenticated immediately before writing. The operation has an exact three-replacement inverse, preserving the validator's full bytes.

The other 95 pins are unchanged. The fixed set remains 53 author / 44 generated files. Actual `requireV15Review` with all current physical files passes; all 97 individually corrupted-byte inputs fail with the exact path, `v15_review_bytes` and exitCode2; an extra author member still fails `v15_review_inventory`. The real reader also produced schema15's actual 787-identity observation before the candidate run. No Gameplay, generated file, production test, history or Engine package was published by this task.

## Actual private candidate run

The original 20-file / 162-case Node suite ran serially in `.run/schema15-reviewed-pin-publication-02/private-validation-repository/`, with only the three previously sealed corrective test drafts copied over their original tests. The current 289 observation inputs and all 71 compatibility files were copied as physical bytes; no source junction was created. The real official complete07 package and the existing immutable v14 history, mixed-history and incomplete-history repositories were used, with `GIT_OPTIONAL_LOCKS=0`. No new history fixture or commit was created. The 512MiB Node process heap limit is test-process memory only; no product or protocol quota changed.

Run start: `2026-10-03T16:06:56.871Z`. End: `2026-10-03T16:13:09.707Z`. Actual result: **162 tests, 161 pass, 1 fail, 0 skipped/cancelled/todo, raw exit 1**, duration 372,440.6604ms. All 289 production observation inputs, 94 production Tools files, 71 compatibility files and the three original production test targets remained byte-identical during the run. Strict97 still passed after the run. This is a private-candidate result; the original production test files were not replaced, and the suite is not claimed GREEN.

The unique failure is `CLI rejects declaration/generated drift and coordinated source/generated/ledger deletion`, at private `Tools/schema-identities.test.mjs:763`. The preserved test expected a `missing_prior_shape_retirement` diagnostic for `["ability","101-bomber/gas/ability",5]`, which did not occur. Earlier branches of this test passed. Its later deletion of `BomberResults.g.cs` and corresponding `missing_current_source` assertion were never reached, and are not counted as covered.

## Read-only failure diagnosis

The actual failed private fixture was preserved and replayed through the unchanged CLI using the exact original v14 baseline `6a5b52365064e3951fda35c5c5a9f6cede5ca9f6`. Replay returned raw exit 1 with **22 diagnostics, all `missing_replacement` for ability5**, and no diagnostic truncation. The exact v14 ability5 tombstone already exists in schema15's retained history, so removal of current v15 ability5 does not lose that prior v14 retirement. It removes the recorded replacement destination instead. `validateLedger` correctly reports the missing replacement, and the special missing-replacement path still invokes the independent history comparison. This explains the stale deeper test expectation without changing the production validator or weakening deletion refusal.

No corrective candidate was expanded or modified after this result. All three drafts remain sealed and private. This remaining test-contract case needs its own later review/correction before any publication or complete regression closure.

## Sealed evidence

All paths below are relative to `.run/schema15-reviewed-pin-publication-02/`.

| Evidence | SHA256 |
| --- | --- |
| `publication.json` | `0bda509f7bcac80208663319a8ad7f6d69cdbed48b6215d2ef265f212ef2107d` |
| `strict97-verification.json` | `552a78365faeca2c1831f1bd582025597521a51151691f2ba66246f146a8bb2b` |
| `private-full162-node-regression-result.json` | `7239c36b14244c529b825ddde349b86b5a61195d12751457f6c71adc79a386ff` |
| `private-full162-node-regression.log` | `e75b7ca507620be46ba4c2b186f33a6bea9983f90042a5ca913a0cd4fa8f1975` |
| `coordinated-delete-cli.actual.json` | `54a35bda812dfc7ca7f8fa76cbc50862a0a041c5fa00019f424e50337c2f0a41` |
| `coordinated-delete-diagnosis.json` | `fb0f2a4cf62c10218f3146ebfa4a7df5b7875bad1ec340e6bcc87b2e64dfc3c2` |

The saved `publication.json` intentionally preserves its publication-time `nodeCandidateTests: PENDING`; the later actual result is the separately sealed regression result above. No C#, official GEN, Native, compiler build, staging or commit was performed. Browser experience and all wider formal-delivery gaps remain under Root's current acceptance work.
