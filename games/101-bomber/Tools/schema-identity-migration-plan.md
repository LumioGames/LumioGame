# Candidate schema audit migration implementation plan

Goal: audit explicit capacity while preserving historical evidence.
Architecture: immutable dirty-v3 snapshot plus independent exact Git history and acyclic recorded migration chains.
Tech stack: Node ES modules, node:test.

- [x] Write failing chain/transition/cycle/owner/immutable-history tests.
- [x] Extend model for the named candidate schema and validated replacement chains.
- [x] Read generator and implement capacity metadata and uint codec checks.
- [x] Separate history root without weakening revision validation.
- [x] Regenerate through candidate SDK, migrate active ledger, audit both histories.

2026-09-30 finalization attempt: actual package verified (130 files), exact tuple
admitted, container ordinals and callback dispatch audited. Real uint CaptureSync
is absent; do not migrate the active ledger or weaken the codec assertion.
See Gameplay/Compatibility/schema-identities.container-finalize-evidence.json.

No commits, public release, or manual generated-output edits. Root owns build and gameplay.

## Package02 finalization (supersedes the blocked attempt)

User scope overrides skill defaults: execute inline, no source builds, delegation or repository commits. Keep this plan in the authorized schema tooling area.

- [x] Pin actual package02 manifest and SDK bytes in schema-identity-read.mjs; update generated tests for successful uint observation and omission/codec/checked-cast failures.
- [x] Derive v4 active ledger from readObservation only; retire all 463 original v3 shapes with explicit breaking transition, retaining 343 original tombstones and pending gates.
- [x] Migrate schema-identities.test.mjs expectations and independent history root; run full suite including CLI sandbox tests. Repair any validator failure with regression coverage.
- [x] Refresh schema-identity-finalize-evidence.mjs to verify package02/source snapshot/cache generator bytes and both histories; record settled commands, logs and exact hashes.
- [x] Complete report and task-scoped changed-file manifest including prior parser/model/history changes; verify protected inputs unchanged.

Package02 completion: full schema suite 69/69; explicit CLI/bootstrap and immutable dirty-v3 comparison pass. The package01 failure above remains historical only. Root performs independent review.

## Durable results candidate (2026-10-03)

The completed v10 audit is `bomber-v10-durable-results-candidate`, consuming the official
cdab SDK candidate through the explicit `BOMBER_SCHEMA_ENGINE_ROOT` selection.
The exact manifest and SDK bytes are pinned by `schema-identity-read.mjs`.
This is an audit candidate, not a complete DS release or compatibility approval.

- Capture the exact v9 manifest as `schema-identities.before-durable-results.json`;
  retain every pre-existing history file and all 21 v9 pages byte for byte.
- Append the 638 exact v9 active identities as three v10 retirement pages. Existing
  5,124 retirements remain unchanged; the total becomes 5,762. Do not flatten the
  ledger or increase either 8 MiB input/index limit.
- Observe 653 active identities: the previous 638, thirteen durable statistics
  fields, `ResourceCrateOpened`, and its unique canonical `crate_opened` event.
- Verify generated server/client ordinals, serializers and Effect bindings; the
  official replay proof covers all 98 generated files. Existing field shapes stay
  intact and only reviewed external package provenance changes.
- Run the complete schema and Tools tests, actual bootstrap and Git baseline CLI
  audits, immutable history mutation negatives, and exact idempotent migration.
  Evidence and the read-only Git fixtures live in `.run/durable-schema/`.

The explicit migration entry is `node Tools/schema-identity-durable-migration.mjs
--apply`. It authenticates its exact predecessor, reuses all old page descriptors,
validates the complete history union before writing, and refuses existing artifact
bytes that disagree. Historical flat migration scripts are not valid update tools
for this paginated candidate. Pending release/contract gates remain unchanged and
`freezeEligible` stays false.

## Authoritative input memory candidate (2026-10-03)

The current audit is `bomber-v11-input-memory-candidate`, consuming the official
complete package `0.0.4-main.734622f`. The manifest SHA256 is
`2916b4eb4eb3823fef67828128ca2cd186855e68a461b09b215bb9919da31d61`;
the SDK SHA256 is `443b8876db65c93bbf83eca0acfd492b57764838bef1ba306575b84aac2015ab`.
Its actual source tuple is Engine `734622fd2767e42f4f3f91373f90ec792c0dcc06`
and Runtime `668993f4f26be13581768558f98f3bb317c25081`.

The eight private persisted BomberPlayerState fields append at ordinals 15..22
under design §6.1, kernel contract §2.1 and ADR0032. All 653 preceding structural
identities remain intact. The exact v10 manifest is preserved as
`schema-identities.before-input-memory.json` with SHA256
`42b3a730285ad0eb23703887b578545147a6839f89927ae17981c6d48d723109`.
The migration appends its 653 complete active identities as three new pages;
all 24 old page descriptors and 5,762 retirements remain byte-identical. The result
has 661 active identities and 6,415 retirements across 27 pages.

The first attempted migration exceeded the existing 8 MiB comparison index.
Internal full SHA256 keys now retain all 256 bits in base64 (44 characters)
instead of hexadecimal (64 characters). External hashes and file formats stay
unchanged. The existing string and fixed-row accounting remains in force:
the actual v10→v11 comparison uses 7,779,870 of 8,388,608 bytes. No input, index,
page or history limit increased. Immutable-history and capacity refusal tests
remain required.

`node Tools/schema-identity-input-memory-migration.mjs --apply` authenticates the
exact predecessor and complete history union before atomically publishing the
manifest. Evidence lives in `.run/movement-input/schema/`. The official generated
plans differ only by eight added field descriptors, the registry digest, and
25 references remapped to identical field descriptors. Normalizing those exact
changes yields the identical complete prior plan. The current candidate manifest
SHA256 is `fedb3e9bdfde5c2af9e59c633768147d06e129e6f5a3b2b03ee5d597fdf2b121`.
Pending compatibility and final product acceptance gates stay explicit;
`freezeEligible` remains false.
