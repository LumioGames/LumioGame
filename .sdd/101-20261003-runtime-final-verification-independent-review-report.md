# Runtime final verification and host entrypoint — independent review

Date: 2026-10-03. Reviewer: registry_bounds_review, acting as a non-author. Root requested a low-memory, read-only evidence/spec/quality review. Only this report was written. No dotnet, Rust or Native build/test, commit, package, or release replacement was performed by the reviewer.

## Judgment

**PASS for the reviewed owning-Runtime verification evidence and the separate two-line host-entrypoint fix. No actionable finding.** The full Runtime build/test/format claims below are supported by frozen raw logs and actual file identities. This is evidence inspection, not a fresh execution of those suites. It does not establish a new official package, Game Remote success, Server real-CLR success, or eight-Bot/full-match completion.

The capacity production/test change was already independently reviewed before this task. I inspected its actual diff and verified the final physical source hashes still match that reviewed freeze; this review concentrates on final verification closure and the previously unreviewed entrypoint fix.

## Read sources and exact review identity

Read owning Runtime `AGENTS.md`, `.spec/AGENTS.md`, knowledge navigation, architecture/testing standards, build properties, entrypoint implementation and existing tests. Consulted frozen Engine's authoritative development-verification standard, ADR-089, repository-layout entry rules and Engine's host-entrypoint check. Public semantics continue to belong to Engine; the local entrypoint change does not add contract, gameplay, namespace or runtime rules.

Owning worktree: `C:/Work/LumioGames/LumioGameRuntime-101-successor-capacity`; branch `codex/101-successor-capacity`; HEAD/base `23356eafc365c753b6e8d9987fd069815ff067ce`.

Actual status: tracked changes only in the existing capacity source and `.spec/tools/lint-extensions.mjs`; the capacity regression test is new/untracked. `.run/` and `.sdd/` contain temporary evidence. No generated source is in the final diff.

| Review anchor | Independently recalculated SHA-256 |
| --- | --- |
| Author `.sdd/101-20261003-successor-capacity-investigation-report.md` | `91d4257260550602e470af171357a98e4d47546d8894e15b85c54d35e45b2640` |
| `.run/successor-capacity/full-verification-freeze-01/manifest.json` | `25b3710d60ec8a350e85f1017c4b54b387e5bf7cc353f413b072b49956c21d47` |
| Original growth freeze manifest | `8aa100ad4c635adb2d4d6818e99d9bb5553375ee5b82a20c2dfec13b2f82d0eb` |
| Original growth patch | `69d101cfbb0f40eb404eb6c3cbf4a0f577137be6cff3363fa5804b5c96339808` |
| `strict-final-01.json` | `d712235c74c7deab5f4aa5a57c9a0db6d60589c9c5a5c5754d88876038d8ab6c` |

Current capacity production bytes: `18013d7e0ff369d1de55b054da4768f275292e317cd52dc1539297dadd21dca0`. Current full regression test bytes: `334a53c1ec9bdfce29049617d33e06088f0bc6a97bd976c85a47c40f397bcd57`. Both equal the original freeze after hashes, not merely normalized source text.

Independently verified all 19 full-freeze log/JSON hashes against actual files, all 8 strict-run log hashes, all 133 full-suite DLL snapshots across 10 real test projects, and every strict RED/GREEN recorded DLL snapshot. All mismatch lists were empty. Source hashes recorded for final build/test/format agree with the final candidate. Current provider HEADs and tracked-clean state match the recorded Native inputs.

## Raw verification counts and scope

| Frozen run | Actual inspected outcome | Child exit |
| --- | --- | ---: |
| `strict-related-red-01` | 155 total, 154 succeeded, 1 failed, 0 skipped | 2 |
| `strict-related-green-02` | 155 total, 155 succeeded, 0 failed, 0 skipped | 0 |
| `full-standard-build-01` | Entire solution, 0 warnings, 0 errors | 0 |
| `full-standard-test-01` | 2964 total, 2964 succeeded, 0 failed, 0 skipped; all 10 test modules listed | 0 |
| `full-release-format-diagnostic-01` | Entire solution, 1585 files, 0 formatted files | 0 |
| `entrypoint-strict-red-01` | 33 tests, 32 pass, 1 fail, 0 skipped | 1 |
| `entrypoint-strict-green-01` | 33 tests, 33 pass, 0 fail, 0 skipped | 0 |

The strict pair uses the same complete test source hash. RED records the original production source `b2ff2bba27df2b7b756fd124d6c3798136c8d0cec5d1a1d232d8bad8a2834fd1`, GREEN records the final production source. The sole RED failure is the intended `DeferredTransferReservesCurrentBaselineGrowthBeforeChangingAuthority`, with `reserved=143085 current=143094`, real terminal Refused / NotApplied / Backpressure / successor_capacity. The final positive and overbudget negative tests are both in the full 155-test class filter.

The solution contains 35 owning projects, matching `SOLUTION_COVERAGE_OK 35 projects`. A static comparison of each owning project's explicit/framework-policy target frameworks with actual build output lines found all declared TFMs represented, with no omissions. Production dual targets net10.0/netstandard2.1 and net10.0 test projects are preserved. The full test command targets the solution with no class/trait exclusions; max-parallel-test-modules 1 and minimum-expected-tests 1 control execution without removing tests.

Full-suite log SHA: `b2ae42af05e59e39aba437ac1deb84b46b6ef9f90af97bea6c9ed58843a483e2`; build log SHA: `38ef67d586a61b6b57dfe5d41e524f513c5ced8f22d73811d3feccfed9e73a63`; final format log SHA: `9399bab4a24db4f123d59223aba1e00f675a75ec9da177a8b22ed8c32930ce8f`.

Earlier failed commands remain visible and are not counted as passing runs: initial full-test wrapper exit 5, first actual full suite 2955/2964 with 9 failures and exit 2, stale incremental strict GREEN attempt still 154/155, first Node entrypoint failure, and first lint invocation failure. The final strict rebuild and standard-layout whole suite are separate successful evidence. I did not independently reconstruct every earlier environmental root cause; the raw failed outcomes remain preserved and accurately distinguished.

## Native and DLL identities are separate evidence groups

| Artifact | Strict 155-test evidence | Full owning-suite evidence |
| --- | --- | --- |
| Native DLL SHA | `419b74c7b5eac0f85a02ab58eda8485240194060dfd319e816ab35f501bfbfed` (official06) | `52d06bd13a533ad8655960e700b434e417886ea91f6ce3b583691a2cd1db6823` (independent test-support build) |
| GREEN Replication.Tests DLL SHA | `52931e7e40fc818e520173336ca085dea4d972cac8c50ea502aa29ddbbefa35f` | `49b3069f76606cb891a9a13101d1a047bc829a1402af42063bbf1a63b8461643` |
| GREEN Ecs DLL SHA | `aee47810ce16724382cc0c7a5efd6a2f0c9c0e7bc11596dc69452a468e369bb0` | `f46c2312660e5fda5f291cafa8c413ec31c9e509d08145aa319b4ff10e95d93b` |

Strict RED DLL hashes are `738141e5159cd26568d684be1cd8b5f7d4e26606d57e52af578af615acdf2c67` (Replication.Tests) and `8081a7c6060dee418cfd5f3db484ebb8ffcf165ff78093d058a3ee65fb62ecc4` (Ecs). These were verified against preserved strict-red snapshots. Different DLL hashes between strict and full outputs are explicitly recorded, not represented as one binary run. Current mutable artifacts directories are not substituted for the preserved originals.

Full snapshots also record NativeLoader `9e9520cca6257d4a1fb0d034779e29677751c40751206044a8c9c972bf2c3794`, Hfsm `63af40eebeda8abeb0f6876d99417ffa6245cee46fa4805e0282d56fcc415126`, TestSupport `58ae756419ecccbd08e982e24e1cd31128c2c3afcf84280145c21964cb21fd8c`.

Full-suite Native physical DLL and its adjacent build-info.json match the manifest identity exactly: BuildId `e47735e34028213d3386e033c69331cb`; source fingerprint `f428fdf38fef4e0754b54b67e5fcd1eefb3bd1128af83893ecefc9113e112f1a`; ABI hash `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`; flags hfsm-test-support and voxel-prediction-test-support. Engine/NativeCore/Voxel HEADs are respectively `0e2fc74783f9f186d59909b38d4ee70887a21137`, `81b2501a621db2657bd087db2afa808ecfb9e846`, `2ba61e431d8080ff6450a07e6ee447e3f0994e0b`, matching official06 source context. This test Native does not become official06's published binary. Native build's recorded Rust warnings are not included in the zero-warning C# solution-build claim.

## Entry rule and generated-source discipline

Separate entrypoint freeze manifest SHA is `dc490ff9425005da54ebe194a2c7358ad04141b5de13649defc3fe0c77c59bbc`; patch SHA `40762492af43c689a4904aca02de83117dc95a9d6e9c256c8d2353628f7bfcfc`. Current and frozen after script SHA is `a81d8e380aa8b5e358e179000f7773aed5211b6d52d5801e3c1afc0b9daff2ae`; before script SHA `250e607520e49ceecc57956233c273f3566c403f869ce77a45d8ac89f35ba74b`. The existing test file SHA `45068c934e625018ac6f14004203c3069c8259bc2a84ac2ce0cfafb0cf35fff0` is physically identical to HEAD and both runs.

The actual diff adds only `join(root, 'AGENTS.md')` and an existence-report check. It precedes the optional skills-directory return, so hosts always retain the compatibility entry. Existing CLAUDE checks, delegated Engine layout authority, default report-only behavior, strict test behavior and discovery containment rules are unchanged. Engine's own entrypoint check and Runtime's unchanged missing-AGENTS test support this repair; it writes no rules into AGENTS.md. Node syntax checking of the current script completed successfully.

Generated final EOL record SHA is `a73db353d918c2c4d644d584bbbcfb0fb26efa8c96c41fb809b9152061aef963`. I verified all 108 current generated files' after hashes and baseGit hashes against actual bytes and `git show HEAD:<file>`: all equal, with no generated body change. The normalization script checks `before.replace(CRLF, LF) == HEAD` before writing. Raw pre-normalization images for every file are not independently preserved here: I verified the recorded normalization logic and final equality, rather than claiming to rehash all original preimages. Some generator outputs may contain mixed newline styles; converting an entire HEAD file to CRLF does not reproduce four recorded before hashes, so that stronger uniform-CRLF claim is not made.

## Remaining evidence limits

The format log reports an external Engine NativeLoader.Hfsm project reference without matching metadata; it also lists its analyzer execution and all owning Runtime projects, then completes with zero changes and exit 0. This warning is disclosed and does not contradict the owning solution C# build's zero warnings/errors.

`full-lint-02` default exit 0 still reports one `.sdd` parallel-document-root inconsistency (11/12 generic checks pass; both extension checks pass). Root explicitly required temporary report destinations, which are preserved. This is not a zero-report or strict-lint-green claim.

No suite was rerun by this reviewer. The final owning-Runtime evidence is valid for its exact sources and recorded binary/Native identities. Cross-repository integration, narrow final commit, rebuilt official release package, Game Remote13 and Server real CLR transfer, Client Host frame diagnostics, Owner decisions and eight-Bot full-match verification remain Root's subsequent work. **No official package or product-completion claim follows from this PASS.**
