# Config registry schema bounds — independent spec / quality review

Date: 2026-10-03. Reviewer: registry_bounds_review. This is Root-requested temporary review evidence, not a Config repository delivery ledger. No production files modified, no commit, no compiler rebuild, and no dotnet build/test executed.

## Verdict

The intended range correction is supported by the existing Schema numeric bounds and domain-local permanent-ID rules. The frozen candidate fixes the reproduced Bomber failure without changing any source IDs or registry history. **One actionable P2 regression remains; request a small fix and a fresh freeze/review before treating the candidate as accepted. Full required checks remain incomplete.**

### [P2] Guard non-array `columns` before looking up the ID column

Location: `C:/Work/LumioGames/LumioConfig-101-registry/src/lumio_config/ids.py:236-237` in the reviewed freeze.

The newly added generator iterates `schema.get("columns", [])` directly. A schema containing `"columns": null` or `"columns": 42` reaches this code because `load_sources` loads JSON objects without validating column structure. Both inputs now raise `TypeError` before the verifier can return structured errors. The existing validator handles these shapes through `_schema_columns` and returns `SCHEMA_COLUMNS_MISSING`. The baseline verifier did not throw for either shape.

Independent reproduction: create a valid temporary `skills` source with live/registered ID 40001, then replace only its schema `columns` with null or 42. For each shape:

- `validate_repository`: `["SCHEMA_COLUMNS_MISSING"]`.
- Baseline `verify_registry` loaded from exact base via `git show`: `[]` (baseline omission, but no exception).
- Frozen candidate API: `TypeError: 'NoneType' object is not iterable` / `TypeError: 'int' object is not iterable`.
- Candidate `registry verify --root <temporary source>`: exit 1; stdout is empty; stderr ends with that traceback.

This is an introduced failure in the structured diagnostic path promised by the CLI reference. Normalize/check the columns value as an array before the lookup, report the malformed schema with the existing schema error vocabulary, and add regression coverage for both null and scalar columns. A missing `columns` key already falls back to an empty list; the explicit null case does not.

## Exact candidate and freeze verification

Owning worktree: `C:/Work/LumioGames/LumioConfig-101-registry`; branch `codex/101-config-registry`; HEAD/base `6112af36825e2bd162353fe59bcfefdff2ee5794`.

Observed status is exactly two tracked modifications and one untracked new test file. These are the only candidate files:

| File | SHA-256 |
| --- | --- |
| `src/lumio_config/ids.py` | `e1f7ba8de6165c5699156af586c7ff5d46cfc60ee105b418c869e3d64439ec40` |
| `tests/test_registry_schema_bounds.py` | `2c87c3b52f40a822e3e348623505409ee25c0fd0877c4b59307c04a5c9171edc` |
| `docs/reference/cli.md` | `1cd4f5007ed550b2d059142341b92a36ba5335f7085b9648c129582324da3e7a` |

Evidence directory: `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/central-supply-20261003/registry-fix-01`.

I independently recalculated all three changed-file hashes, every `sourceFreezeSha256` entry against both source-freeze and live owning source, and every `evidenceSha256` entry. All mismatch lists were empty. The current `git diff --binary` normalized exactly as freeze.py does matches `tracked.patch` text. The new untracked test is included through its own frozen file/hash, not through tracked.patch.

Independently recalculated compilerHash: `17c4c67fae00fbcb09c5cbc469fdc81b903d0ad63809aad518f3ab607cf8e761`.

Input hashes remain:

- Baseline source: `f381231f9901939c883b4fcf98e9419502df8093f979188f15d16487690f2640`.
- Current Game source: `857f42e5ec5bfa62829740d4d21d9de542ca6dfe5c28e77de36bdf65729af420`.

Frozen `baseline-red.log` equals the official `registry-baseline-01.log` JSON exactly: 70 errors, all `ID_OUT_OF_RANGE`. Independent candidate calls against baseline and current sources each return zero errors. This verifies the frozen Python source behavior; it does not verify a rebuilt packaged compiler or a new release.

## Spec and implementation assessment

Read Game's two core entry documents and architecture/testing standards; Config's entry documents plus architecture/testing/dispatch standards; Config's existing `docs/decisions/0-2-id-namespace-and-issuance.md`, C# Reader reference, CLI reference, validator, verifier, allocator, patch application, and registry tests.

Public primary source inspected locally: Engine `.spec/knowledge/features/config-table.md`, ADR-007 and ADR-033 at Engine HEAD `ecece8a4ed42be90f06a4bcd252088ab8e248505`. ADR-033 already defines optional minimum/maximum numeric bounds. ADR-007 assigns namespaces by domain and release; Config's ID decision treats the Sample ranges as initial domain seeds and preserves max-known+1, tombstones and rename identity. Candidate introduces no Schema field or namespace authorization. CLI documentation explicitly retains the architecture authorization boundary.

- Explicit bounds are taken only from the declared `idColumn`, intersected with the existing integer vocabulary and permanent-ID positive `1..2147483647` interval. Decimal ceil/floor implements the integer intersection for fractional bounds.
- Minimum-only and maximum-only sources use the remaining integer/global limits. Manual probes verified endpoints, zero and global overflow rejection. Minimum 5 accepts 5 and 2147483647 while rejecting 4 and 2147483648; maximum 5 accepts 1 and 5 while rejecting 0 and 6.
- Missing ID-column bounds retain the exact Sample table-name fallback; a bound on another column does not override it. The unbounded Sample ID 99 remains rejected.
- Live rows and live registry entries share the computed range. Duplicate IDs, registry mismatch, aliases colliding with live names, ordinal persistence and tombstone reuse remain rejected by retained logic/tests.
- Historical tombstones are not narrowed to the current live range or rewritten. The new seeded domain lifecycle test includes lower legacy tombstones plus an in-domain tombstone, issues 101003, preserves that ID through rename and retires it on deletion.
- Allocator and apply code are unchanged: max known IDs including aliases/tombstones, lock/atomic writes, rename preservation and rollback on existing validation failures remain in place. This review does not assert a newly added allocator namespace gate; no such code was added. Any pre-existing gaps between apply validation and registry verification are outside this correction's scope.

## Independent validation and evidence limits

Python: fixed private 3.11.9 runtime `C:/Work/LumioGames/LumioConfig-101-authoring/build/101-toolchain/python/python.exe`; review commands used `PYTHONDONTWRITEBYTECODE=1`.

1. `python -m unittest tests.test_registry tests.test_registry_schema_bounds tests.test_patch_and_ids -v` under `PYTHONUTF8=1`: **33 run, 0 failures, 0 errors, 0 skipped; exit 0**. This includes 21 registry tests and 12 existing patch/identity tests.
2. Loaded the unchanged base `ids.py` via `git show`, rebound only the new test module's verifier reference and ran its full suite: **12 run, 14 assertion failures, 0 errors, 0 skipped**, independently confirming the frozen red evidence. No candidate files changed.
3. Additional temporary-source API/CLI probes established the P2 finding and endpoint behavior above. No persistent source fixture was edited.
4. Initial 33-test run without PYTHONUTF8 had one Windows subprocess output decoding error in the unchanged good-patch CLI test. The stack identified UTF-8 decoding of locale-encoded output. Following systematic-debugging, setting only PYTHONUTF8 and rerunning the same unmodified command produced the green result above. The first run is not counted as passing evidence.

Worker's frozen file-level pure-Python evidence says 210 tests, 0 failures/errors/skips; I verified that evidence's hash but did not rerun that full subset. The exploratory suite with temporary skips is explicitly not acceptance evidence. Frozen spec lint remains exit 1 with 37 issues, reported equal to the unchanged checkout; I did not rerun lint.

**Unmodified full discovery (including integration), C# Reader dotnet smoke, Rust/C# Unicode harness checks, rebuilt official compiler, and new full release package were not executed by this review. `allRequiredChecksComplete` remains false.** Any fix for the finding changes the hashes above and requires fresh regression/freeze evidence.

## Follow-up review — P2 closed (2026-10-03)

Root supplied a narrowly scoped follow-up and requested source/log inspection without rerunning the already-green scoped suite. I independently inspected the actual current source, test assertions, log contents/exit files, and hashes. **The sole P2 finding above is closed for the following exact candidate. No new actionable finding arose from this incremental review.** The original verdict and hashes above remain the historical first review and are not overwritten.

HEAD/base remains `6112af36825e2bd162353fe59bcfefdff2ee5794`; branch remains `codex/101-config-registry`; scope remains exactly the same three files. Against the initial source freeze, only `src/lumio_config/ids.py` and `tests/test_registry_schema_bounds.py` differ. All initial frozen evidence hashes still match; the old freeze was preserved.

The entire incremental production change is a three-line guard before iteration: when `columns` is not a list, append the existing `SCHEMA_COLUMNS_MISSING` structured error and continue to the next table. The message/suggestion match the existing validator vocabulary. For valid array schemas, the originally reviewed range and identity paths are unchanged.

Two new test methods cover explicit null and scalar 42. Their shared helper creates the same valid temporary 40001 source used in the first review, changes only the columns shape, confirms validator code, then invokes the real registry CLI and asserts exit 1, empty stderr and structured stdout code. It also directly verifies the API code. These assertions directly cover the reported failure.

| Current candidate file | SHA-256 |
| --- | --- |
| `src/lumio_config/ids.py` | `32b185014e68bea48a45492373f57532130e43cb2a6177b5d2e3288252502685` |
| `tests/test_registry_schema_bounds.py` | `1ef147ee4fa1981ae215f9e08a000678d8a74748509a5d2bca5f2ac323f59df5` |
| `docs/reference/cli.md` (unchanged from initial freeze) | `1cd4f5007ed550b2d059142341b92a36ba5335f7085b9648c129582324da3e7a` |

Independently recalculated current source compilerHash: `96fb8aaf2a33a79cad4496962081162b245ecd2442db419fc31ffff83f728301`. This is a source fingerprint, not evidence of a rebuilt binary. The initial compilerHash belongs only to the first frozen candidate.

Follow-up evidence directory: `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/central-supply-20261003/registry-review-fix-01`.

| Evidence | Inspected result | SHA-256 |
| --- | --- | --- |
| `red.log` | First attempt: 2 tests, 2 fixture errors (`error.code` on validator dictionaries); not valid behavior-red evidence | `9ad658f84d819d76aaf2b5a5763d8c05d3ee59e0553f8d36efc1353a1189811f` |
| `red-02.log` | Corrected tests before production fix: 2 tests, 2 assertion failures at nonempty CLI stderr, 0 errors/skips | `bf8abc7c1de3e2f5ccc6019d22bbca3d42287735d4dd6a7b52c9b1605c2442e3` |
| `green.log` | After fix: 35 registry/bounds/patch tests, all marked ok; 0 failures/errors/skips | `26fcc054c266206e675ea29af170f36a87a7f386517ae58c7d385784b6a30e2d` |

Inspected `red.exit=1`, `red-02.exit=1`, `green.exit=0`; SHA-256 of each red exit file is `f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04`, green exit file is `13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354`. The inspected current test SHA matches Root's stated corrected-red/final test SHA. No acceptance credit is given to the first fixture-error run.

This follow-up is inspection of Root's fresh 35-test evidence plus the exact incremental implementation, not an independently rerun 35-test suite. No production edits, compiler build or dotnet execution were performed by the reviewer. A fresh full freeze and the previously listed unmodified full discovery / integration, C# Reader smoke, Rust/C# Unicode checks, official compiler rebuild and full release-package evidence remain pending. **`allRequiredChecksComplete` remains false; closing this P2 is not full release acceptance.**

## Final evidence review — freeze02 and full discovery (2026-10-03)

Root subsequently completed `games/101-bomber/.run/central-supply-20261003/registry-fix-02/manifest.json`, SHA256 `a7d34fb80acc15aa8c6ed9bd246c1c8cc8b521fbf7a524a144e09448601b54e9`. I independently checked all **152 sources, 12 new evidence files, and 4 actual Unicode program/runtime files**, both their frozen copies and current original paths, against the manifest hashes; all match. The tracked patch SHA256 is `529feac078c4e69a77f264e6f0735fec83b3439cdd462c6125c64346f06a8091`. Current three-file hashes and source compilerHash remain those in the P2 follow-up above. Compared with freeze01, the sole production increment remains the three-line non-array columns guard; only ids.py and its test file differ. The initial freeze report SHA256 is `3f0616d33414b5ba0e1b834c44b020e2e814d00ff7289aefa4fa4fa87745417c`; its 145 source hashes and 39 evidence hashes remain intact. Earlier verdicts are preserved as dated history.

The unmodified `full-discovery-01.log` has **234 tests, OK, zero failures/errors/skips, child exit 0**, SHA256 `5b9370be8d55c4b8f828c059d542bd54795ce61ccc130af2eaeef50a4b20371e`. Both new malformed-columns tests are present and green. The existing C# reader smoke test is green; inspected test source actually builds its generated project and executes all six immutable-reader scenarios, with return-code assertions and no skip branch. The Unicode cross-language test is also green; its unchanged source actually executes Rust and C# subprocesses, asserts return codes zero and matches all emitted digests against Python. Thus the full discovery closes the previously pending local integration/reader/Unicode execution checks, rather than merely recording builds.

Unicode Rust build log SHA256 `a2c26b7329950831bce9a7c3ddf2cfe172a25f89125d75bcd02a6491f63d50a5`; C# build log `b3c422687a2df1a3117dc9c8e79e25fed2440d0a4738758444b33d6b84956d02` (0 warnings/errors). Both exit 0. The frozen actual programs are Rust `unicode-golden.exe` SHA256 `a5f7eba228f2ca6f829743c32373c9591510257b68423f934af97cf5dcfb24c0` and C# `UnicodeGolden.dll` `fb74532505fdf5e1506a2714f71ec1bfffebda132e740b231ef92e5a9493e56b`, with runtimeconfig `d3376d7637d95d6fb1c18287963eed4f1c0c831c6c49f4213f26c604c286171b` and deps `ae8892eeb7ee00ebdf8ad15397a49d54615893248fa916456e51902629e55597`. These identities describe the test harnesses, not a rebuilt official Config compiler. This final review inspected evidence and source; it did not rerun heavy processes.

**Spec lint remains unresolved: 37 diagnostics, not green.** I independently compared every diagnostic with the unchanged baseline: nine historical plan files account for 36 missing new frontmatter fields; `.sdd/` accounts for one forbidden-document-root diagnostic. The current local plan README still specifies legacy status-only metadata. M7-J/R-00402 Owner option A explicitly retained `.sdd/` as a temporary area, required its README to be tracked, and placed durable returns under `docs/reviews/`; the M7 hardening return and independent historical QA both confirm that outcome. Deleting that legitimate history, disabling the check, or calling baseline equality success would misstate the evidence.

A proper governance closure needs a documented metadata migration preserving historical bodies/status facts, plus an explicit new Owner decision superseding the old temporary-directory location if it is to be renamed. Preserve the old README/ignore and decision as historical evidence, update current dispatch/plan-format guidance and decision navigation, then run normal strict lint with fingerprint enabled. Current recorded lint disabled fingerprint, while `.github/workflows/repository-policy.yml` still obtains `lumio--v1.1.0` / `b0fa9ca`; the installed reviewed linter is Workflow 1.3.6. CI/local identities have not been unified. Neither the old historical QA pass nor current baseline equality proves current strict governance acceptance.

No new production finding arose. **`allRequiredChecksComplete` remains false** because governance closure, an official compiler rebuilt from exact clean committed source, and the official complete release/product reconnection remain pending. No commit, publication or new official package is established by this review.
