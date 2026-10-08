# schema16 Tools private author evidence

Qualification: **READY_FOR_NONAUTHOR_REVIEW_PRIVATE_TOOL_CANDIDATE_ONLY**.
The production V16_REVIEW is still `pending-nonauthor`; no shared Tools, current
schema15 pins, ledger, immutable pages, Gameplay or package files were changed.
No schema16 release or browser acceptance is claimed.

Private root: `C:/Work/LumioGames/LumioGame/.run/schema16-tools-candidate-01`.
Final source seal: `C:/Work/LumioGames/LumioGame/.run/schema16-tools-candidate-01/seal-01/manifest.json`.

## Exact write set

The earlier count of six production files was incorrect. The final candidate is
**five production files and two new tests**:

| Private Tools file | SHA256 |
| --- | --- |
| schema-identity-read.mjs | 98ba79ffe729d67bf4e3272be7c010e25ee78760acf6af66723bee0caeb7ad40 |
| schema-identity-model.mjs | 51794fddaddf6c7e654c45a6bc38ff61b1f0129d08c0b2d83095aa4ae2c5436b |
| verify-schema-identities.mjs | f4390362bdbeb0a48e683679c87751b3ec5d5f91b0c62d8452d2c143e41aa9c3 |
| schema-identity-v16-evidence.mjs (new) | 12dee2edb0bd53c1726827bc21e260dfbf5496f832024b86354ac1458a1d3a0d |
| schema-identity-owner-prediction-migration.mjs (new) | 50c7ee9a5ae07491b7539d19d5ed702b8b90884c9618b77d26400016e2eb7841 |
| schema-identity-v16.test.mjs (new test) | dc04fbb8b979c19aa9d6c495c93dbf98ed7b9d33107d399b096455e8a380d273 |
| schema-identity-owner-prediction-migration.test.mjs (new test) | e8f00b32862ded4024acaa925f857ec8d0ffc9d46859b3f4db1291ce2439e9ae |

The three existing candidate files have exact before copies and patches in the
seal. All other copied Tools retain their original source-before hashes, including
schema-identity-v15-evidence.mjs, schema-identity-storage.mjs and every old migrator.

## Behavior and closed gate

The reader keeps schema15 as its default, with its original package07 pins and
source qualification unchanged. Explicit schema16 requires a separate exact
66-authored/52-generated closure, manifest and SDK archive hashes, official main
package version and all seven full source revisions. The default v16 envelope is
pending and refuses before observing current consumer bytes. Only the explicitly
pinned MoveAbility.Movement.cs partial is admitted for schema16; arbitrary extra
ability partial suffixes remain refused. The CLI selects this new reader only for
an authenticated schema16 candidate and retains old history behavior otherwise.

The new migrator requires the exact schema15 predecessor SHA
8616a73978d008d14b26ffc4441b56565690d07dbb2b555278891fdc816094f9,
787 active rows, 9188 retired rows and 39 authenticated page descriptors.
Only seven movement-memory scopes None→Owner, participant LifeGeneration
None→Room and bomb SourceLife/SourceLifeGeneration None→Aoi and corresponding
CaptureSync flags may change. Types, ordinals, authority and persistence must match
the original complete shapes. External component package provenance advances to
the exact selected reviewed package. Comparison sorting uses JavaScript exact
ordinal string comparison, not localeCompare or Unicode normalization.

It preserves all 39 original descriptors and every old retired row, appends all
787 complete original identities with the exact prior snapshot, and records an
explicit breaking audit transition. The four added pages are separate immutable
artifacts. No live-world conversion or identity allocation is performed. The
releaseDecision remains null and distinct GameReleaseId/old-release qualification
remain outstanding. Private CLI --apply is refused; only Root may later publish
accepted Tools, fill independently reviewed source pins, and execute migration.

## Actual RED and GREEN

All raw logs and adjacent result JSON are preserved under the private root.

| Evidence | Actual result and meaning |
| --- | --- |
| reader-model-red-04 | raw1; original default15 PASS, genuine new16 model and actual16 reader FAIL (invalid_schema/invalid_shape and old v15_review_bytes) |
| reader-model-green-02 | raw0; all three corrected model/reader cases PASS |
| migration-red-01 | raw1; baseline adapter delegates the actual original v15 migrator, which rejects the new exact15 predecessor. This demonstrates absent16 migration, not an existing16 implementation defect |
| migration-green-01 | raw1; genuine unchanged8MiB retirement_index_capacity refusal at 9975 retained rows after new migrator exists |
| migration-green-02 | raw0; same complete migration PASS after internal full-bit digest encoding change |
| final-schema16-guards-02 | raw0; 12 PASS, 0 FAIL, 0 skip; final exact source including ordinal sorting and both8MiB assertions |
| original-bounded-history-02 | raw0; 15 original model/migration/storage cases PASS; explicit positive filter excludes two Git-fixture tests that lack independent immutable test repositories |
| internal-digest-proof | raw0; all256 byte values, all256 single-bit positions, JSON roundtrip and nine distinct canonical values checked |
| full-capacity-proof | raw0; real fixed787/9188→9975 complete-history migration, original reserve calls instrumented privately without changing arguments or charge semantics |

The final 12 cases include default pending refusal; actual historical15 reading;
finite10112 unchanged shape; all10 projected scalar scopes; changed exact15
predecessor and authenticated page refusals; scope/ordinal/authority/new-ID
refusals; immutable old history; 120 individually mutated closed input refusals;
missing/extra review path and package source identity refusals; and arbitrary
MoveAbility.Shadow.cs refusal. No new IDs are invented to manufacture RED.

Invalid/administrative attempts are retained separately: initial missing private
Bots/input index; red02 malformed test omitting required prior shape history;
red03 importing a nonexistent helper; green01 quoting prevented the model edit;
and original-bounded-history-01 incorrectly selected two Git tests without their
required external test repositories (24 PASS/2 administrative FAIL). These are
not causal RED or acceptance evidence. The final positive-filter original run
does not claim the two excluded Git tests were executed.

## Capacity and internal encoding proof

Original MAX_INPUT_BYTES and MAX_INDEX_BYTES remain 8,388,608; reserve retains
fixed512 bytes plus 80+2*length for each previously unseen string. Storage source,
canonical JSON and external canonicalHash functions remain byte-identical.
Only the internal model indexHash representation changes from a 44-character
base64 encoding of the complete SHA256 digest to 32 Latin1 code units containing
the same complete32 bytes. A unique digest is still charged conservatively as
512+80+2*32=656 bytes. No hash truncation or budget increase is used.

The full fixed9975-row proof has four index peaks: 7,689,004; **8,346,738**;
7,980,000; and629,600 bytes. The maximum is41,870 below the unchanged8MiB cap.
It emits a1,037,039-byte manifest and four pages of488,587/451,843/474,141/40,150
bytes. Exact output hashes are in full-capacity-proof.json. These outputs are
private test proposals, not committed product ledgers.

Latin1 is injective over every digest byte: one byte maps to its exact U+0000–00FF
code unit, inverse Buffer.from(text,'latin1') returns the original32 bytes.
All256 distinct repeated-byte cases and every single-bit position are checked.
NUL, quote and backslash JSON escaping roundtrip exactly; composed é and decomposed
e+combining-accent are not normalized and remain distinct canonical values.
Number8 and string"8" also remain distinct. SHA collision properties are unchanged.
Internal hashes are used only as comparison-map keys/summary values; nested
internal hashing consistently uses the unchanged canonical JSON function.
No internal binary string is exported in persisted identity, retirement, page,
manifest or source-snapshot fields. Original39 page bytes are not rewritten.
The reviewer must independently verify this internal-only boundary and equality/
ordinal behavior; these are author proofs, not a nonauthor acceptance.

## Input and release limits

Frozen test inputs are in frozen/v15-index.json (289 files) and
frozen/v16-index.json (293 files), with original origins listed separately.
65 private historical snapshot/page copies are byte-compared to their protected
originals. The v16 test envelope is explicitly marked
TEST_ONLY_FIXED_CAPTURE_NOT_A_NONAUTHOR_REVIEW_OR_RELEASE_PIN. Its
accepted-nonauthor-shaped object is solely a test seam exercising the parser;
it is not installed into production V16_REVIEW and cannot qualify a release.
This test capture predates Root's final shared movement migration and complete12
consumer generation. Actual final14 source/GEN/package pins still need a NEW
capture after Root confirms its build has finished, and a separate exact review.

Root reports complete12 manifest704b455b06a359c177ffff35ff2c076febc61b6340b777f7e4f9088d1ef6c766,
Native122671a87d37cc34d8d28f11e5194a5eb38e11cc68b58086b88a99cb05d02ff5
and Client38ead5ff3656b3b3fed8a0edbdbf07c34801cd2a. This author report records
that handoff identity only; it does not substitute the earlier fixture package
with new DLLs or claim complete12 qualification, schema16 gate PASS, release
identity closure, continuous-input acceptance or browser experience acceptance.
