# 101 Resume10 — strong chest and bounded identity history

Review candidate only; not a complete game delivery or a full Host/browser release. Root owns integration. Source is frozen against the exact Resume9 read-index; this slice does not write Root Gameplay, UI or engine selection.

## Immutable inputs

`E = C:/Work/LumioGames/probe/bomber-terrain-growth-credit-corrective/games/101-bomber/.artifacts/resume-20261002`.

- `E/resume10-strong-chest-proof.json`: SHA256 `9d2ba5e6437bc5018892ab4579c18b147a32c0f62e00a6ecbf14ff0e1360e5ea`. Lists every before/after path/hash and the exact binary patch replay commands/results.
- `E/resume10-strong-chest.patch`: SHA256 `8f4523e91de3ef9600a98d99d573a00acc47999955bc1ed6baf6ca428329e134`; 2,107,037 bytes; exact replay passed.
- `E/resume10-frozen-read-index.json`: SHA256 `a25d14473e05d7b128049fc90dcabcb54a300f7364bbd7e001c41d15d4020cdf`. Full composed frozen source is read via each entry's `source`; changed files alone are in `E/resume10-strong-chest/replay/games/101-bomber/`.
- 470 changed paths: 392 official config exports plus 78 gameplay, generated schema, ledger and tests. No deletions of prior history. UI, release selection and `eng/BomberRelease.props` excluded.

## Behavior and evidence

Approved source: `docs/specs/bomber/stage0-kernel-contract.md` §4, especially strong chest paragraph at line190; ADR0046 finite contact/Original settlement; ADR0047 special-bomb pool. Existing M2/12/16 and periodic-fact gates remain. Five non-1×1 previews in the runnable 19/8 profile each issue one chest inside the next circle, outside forbidden center/cross cells. Native sparse binding is the only position authority. No legal cell ends that stage's issuance with an explicit unavailable journal event. Binding C/B refusal retains one unbound issuance entity and retries through the new official typed Runtime API.

Three distinct bomb families saturate the hit counter. Same-family persistent fire does not re-hit; separate bombs in one chain count; split mother/child share family. The terminal Native Original dig/unbind releases four fixed rewards, one equal-weight special bomb when C is enabled, and independently 200‰ golden heart. Refusal does not issue rewards or erase contact history; a new independent bomb may retry. Paired restore covers both pending and accepted publication. `BomberStrongChestProductionTests`: 11/11 real Native, 0 failed/skipped, exit0 (`resume10-sdk08-strong-native`).

The live full-suite run exposed real next-round cleanup failure: a strong chest can occupy an authored hard-pillar coordinate after circle clearing. Cleanup previously classified that valid bound chest as foreign because the authored base was nonzero. It now validates the current live chest + Native chest block/binding, performs Original dig/unbind, then restores authored base through the normal transaction. The existing full circle/deadline/next-round test additionally asserts old chest retirement, absence of old binding and restored base.

Fixture corrections retain the original business assertions. Tests that manually set FinalCircle without its trigger/HFSM are now entered through the real Running deadline transition. The terrain scene sets a valid Running deadline, including high starting ticks. Three death-drop tests replace the old Blink ABI stub with actual Native map/transactions. The full-capacity test keeps all 703 slots occupied until the newly implemented first chest publication has an Original receipt, explicitly checks pending0 and issued-mask, then preserves the original two-Tick slot-release assertion: 703 pickups, pending wealth4→3, placed1, exactly one death consumption. Diagnostic evidence records that old failing fixture had legal land but an outstanding terrain cut during placement.

Pickup provision is derived from the existing formula: `19² + regenerationEvents×4×maxMirrorOrbits + non1x1Stages×maxIssuances×maxChestRewards`. A possible golden heart adds one to each of five chest issuances. Default required639; maximum across all admitted legacy profiles703 (`match-480000`); configured703. The exporter covers default plus48 named profiles (49 configurations); six named M2 authoring profiles remain explicitly refused by the runtime calculator, while all42 named legacy profiles are checked. Private reward/deferred containers increase698→703 under a new schema epoch. No unproved 23/27 capacity claim.

## Ledger storage

The original v1 candidate reached8,715,609 bytes and the production gate rejected `candidate_too_large`; preserved in `resume10-ledger-size-real-red`. The original8MiB input ceiling is unchanged. v2 is an internal on-disk manifest plus bounded pages, normalized to the same logical v1 model. Pages are authenticated and processed one at a time. Compact indexes are precharged before insertion under a separate fixed8MiB ceiling; no expanded retirement shape/evidence collection is retained.

- 638 active, 5124 retired, 14 transitions; all4490 original retirement rows preserved by exact `JSON.stringify` equality, plus634 exact former-active shapes.
- Original v8 snapshot SHA256 `48c5ba892ffd83704dcfa67c39c133ef29292f9cd89f195bfb6134ef4d2c4d5a`.
- Manifest832,172 bytes, SHA256 `207837ed3450081b3cf639dc24f09791000e4c490e7a265f4ab8092b7017ca0b`.
- 21 pages total7,978,765 bytes; each below8MiB. Every page SHA and byte count is in `resume10-schema-proof.json`.
- Maximum charged index6,977,548 /8,388,608 bytes; exact read-set in `resume10-index-proof.json`.
- v1 still reads unchanged. Tests reject cross-page duplicate, altered immutable reason, changed bytes, missing page, changed order, duplicate path, external path/symlink, wrong count, unknown manifest fields and budget exhaustion before index growth.
- Actual Git fixtures prove every page comes from the same baseline commit: corrupt HEAD does not change a valid old baseline; a broken baseline page cannot borrow its repair from HEAD. Git object IDs and SHA256 are recorded by the production gate.
- `resume10-schema-gate-baseline01`: real CLI exit0, no diagnostics, `freezeEligible=false`. All independently required historical snapshots remain enforced even if candidate qualifiers disappear.

## Official SDK consumption

This candidate consumes `Lumio.Engine.SDK.0.1.0-dev.189b3f3b9970d9ab5717d79b234939eb62b16998ff060ad18b7472374afc6549` from official `pack-sdk` at `C:/Work/LumioGames/LumioGameEngine-101-binding-context-budget/.run/101-strong-chest-sdk-02/sdk/identity.json`.

- Runtime855dab29fb3180557316ba0340c7b5a83434c6ea (reviewed Try9a + startup6de); Enginead8106809b549231813af56e345665215c0ba80b.
- nupkg SHA256 `479b076331ff1dfe5b973dfc58e2b7cdf89b7364fba0e5f73cfa6471bb325adb`.
- Original package Native SHA256 `3df785ddbf7e4b9486c4f90c5a10f3a3eb88acb40f6ae93be478dec22313c3d9`, buildID818412fc67ad37f15739daa67d35f574; ABIc5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3.
- Private package/manifest/payload and four restore lock files retained in `E/sdk-consumer-08` and `E/locks/strong-chest-*.packages.lock.json`; restore and locked restore exited0. No loose Runtime DLL or source reference.
- Server/client/browser gameplay builds0warnings/0errors. Client reducer fixture explicitly uses the prior official a5fa Client786 reference; it is not presented as same-release production Host acceptance.

## Validation status

Final frozen-source run `resume10-sdk08-gameplay-final`: **689/689,0failed/0skipped,exit0,2m48.766**. `resume10-tools-full02`: **404/404,0failed/0skipped/cancelled,exit0,141.075s**. Correct source citation was re-exported through official default plus48 named profiles, each with two clean byte-identical exports (`resume10-strong-config-export02`). First tools run404total399pass5fail0skip is retained: only stale hardcoded a5fa SDK expectations; tests now read separate product/SDK declarations and preserve every mismatch diagnostic. Spec lint12 common(11pass/1nonGit skip),2extensions(1pass/1nonGame-repo skip),0reports/disabled,exit0; these two applicability skips are recorded, not game-test skips.

Reproduction uses `E/run.mjs` with its recorded private NuGet/temp environment. Full Gameplay command: `dotnet E/build-sdk08/bin/Lumio.Bomber.Gameplay.Tests/debug/Lumio.Bomber.Gameplay.Tests.dll`, with `LUMIO_BOMBER_CLIENT_GAMEPLAY=E/build-client-sdk08/bin/Lumio.Bomber.Gameplay/Debug_client/Lumio.Bomber.Gameplay.dll`. Tools command: `node --test Tools/*.test.mjs`. Required immutable history fixture roots: `BOMBER_SCHEMA_TEST_HISTORY_ROOT=E/schema-v9-history-01`, `BOMBER_SCHEMA_TEST_MIXED_HISTORY_ROOT=E/schema-v9-mixed-history-01`, and `BOMBER_SCHEMA_TEST_INCOMPLETE_HISTORY_ROOT=C:/Work/LumioGames/probe/bomber-terrain-production-candidate/games/101-bomber/.run/schema-migration-tests/missing-history-1m6AwK`. All exact commands and input SHA256 sets are in the corresponding run JSON. Immutable tested binaries are retained separately in `E/resume10-binaries/`, with every file hash in `E/resume10-binaries-proof.json`.

## Integration notes and remaining scope

Use exact three-way comparison against Resume9. Preserve Root's BombSystem logging wrapper. `Tools/schema-identity-read.mjs` needs a hand merge retaining Root's explicit physical SDK candidate resolver while incorporating v9 schema and actual approved SDK pins; do not point it silently at old Engine43. `Tools/release-version.test.mjs` should retain Root's equivalent dynamic Version/SDK selection and candidate fixture files. Neither Root UI nor release-selection paths are in this patch.

This closes the strong-chest/cleanup slice. Periodic poison/aura/regen, all six bomb forms, M2/12/16 envelope, real Host→Client full session, thirty-minute bots and full presentation acceptance remain tracked by Root; none is represented as passed here. Await Root independent review and integration before starting the assigned Host parked-drain follow-up.
