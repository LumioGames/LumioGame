# Binding context capacity closure — independent review handoff

Scope: upstream policy-only binding context atomicity and typed existing-capacity refusal. This is a non-full-release SDK candidate. Active controlled-admission provider changes are excluded. Root Game source has not been changed by this slice.

## Frozen source

- Runtime tree: `C:/Work/LumioGames/LumioGameRuntime-101-binding-context-budget`, base `4c9e654f36e935a6ac8ddec42284556b388b7696`, commits `ba292b6802d6ed6efa8cad3dfaf19efa840e2ea2`, formatting-only `67d5319ee9e1bc8b13ff547f0ac725fac0671e45`, allocation correction `9a76038d88d67092e28674fb6348ece4be3c47ad`.
- Engine tree: `C:/Work/LumioGames/LumioGameEngine-101-binding-context-budget`, base `ef9fe1ded0f75828e83c691ff6e2ddb82a30df24`, commit `ad8106809b549231813af56e345665215c0ba80b`.
- Immutable seven-file snapshot, patches, hashes: Runtime `.run/binding-context/frozen-02/manifest.json`; SHA256 `e337a966f23cdc5a0292c25aabba8f92e485480d7a5536bf4446850eef613254`.
- Runtime packaging composition: `C:/Work/LumioGames/LumioGameRuntime-101-strong-chest-sdk`, HEAD `855dab29fb3180557316ba0340c7b5a83434c6ea`, containing the above and exact approved startup delta `6de14fda`. Capacity agent confirms no active provider freeze is available; no dirty provider source is copied.

## Root cause and behavior

Old `SetBindingPolicy` changed managed policy before deriving/checking Native candidates. A capacity exception left the managed policy inconsistent with the unchanged Native context. Existing canonical `voxel-runtime-results-v1.json` promises no-side-effect capacity refusal and later caller retry; ADR-119 assigns all live candidate derivation to Runtime.

New `TrySetBindingPolicy` / `TryRefreshBindingContext` return `false` only for the existing C/B refusal. Void methods preserve the original `InvalidOperationException("voxel_staging_capacity_exceeded")`. Invalid declarations, owner/thread failures, pending-Set and Native faults remain throwing failures. A successful operation validates and bounds policy/candidates, replaces the Native context once, then publishes managed policy. No explicit candidate IDs, automatic retry, expanded capacity, or Game catch-by-message exists.

Root independently identified an additional pre-refusal allocation violation. Real Native test with C=65536/B=200 allocated 3,376,088 bytes before rejection. The follow-up performs allocation-free policy byte admission before allocating the policy copy or growing validation sets, including the fixed context, minimum per-row charge and exact UTF-8 charge. Three new cases cover high C/low B, text-only overflow after minimum admission, and empty-policy fixed-cost overflow; each rejected call allocates zero bytes after warmup and preserves Native/state.

## Actual validation

All Runtime evidence is under Runtime `.run/binding-context/`.

| Evidence | Actual result |
| --- | --- |
| `atomic-native-red-02` | 2/2 failed, 0 skipped, exit 1: original managed-policy corruption |
| `typed-native-red` | 2/2 failed, 0 skipped, exit 1: missing typed public surface |
| `typed-coordination-final` | 201/201 passed, 0 skipped, exit 0 |
| `policy-bytes-native-red` | 1/1 failed, 0 skipped, exit 1: 3,376,088 bytes against B=200 |
| `policy-bytes-native-green` | 15/15 passed at the first allocation-fix revision, 0 skipped, exit 0 |
| `policy-bytes-final-build` | Final complete solution/all TFMs, 0 warnings, 0 errors, exit 0 |
| `policy-bytes-format` | Final two changed files, exit 0; existing workspace-load warning retained |
| `policy-bytes-runtime-final` | Final 2705/2705 passed across ten modules, 0 failed/skipped, exit 0, 4m18.590s |

Final Runtime includes 17 binding-context cases. Earlier `typed-runtime-full` had six environment failures (missing dedicated prediction/HFSM Native and private PrimeProbe output location); logs remain. Actual dedicated Native and actual built PrimeProbe output resolved these; no assertions were removed. Final 2705 run covers both recoveries. `typed-native-green` ran a stale DLL after a failed test build and is retained as such, not mislabeled product evidence.

Production Native used by Runtime tests: official a5fa SDK Native, SHA256 `3ab8500d470c2fd66236229549e1d7e1fa58094b41b899aab2e191cf1810618f`, build ID `2020bcc47cee042330ff5a8d949ada92`. Dedicated test-support Native SHA256 `150eefc021f0cddc1329619676761ff42ede6fadc633b2df34d3165ef5ec8c7e` supplies only the required HFSM/prediction tests. Both have ABI `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`; exact paths/env are saved in each runner JSON.

Engine evidence under Engine `.run/binding-context/`: new contract fixtures 11/11; complete wire 654/654; strict spec-lint passes general 12 + extension 7 checks with zero skips/disabled/reports. All exit 0. Owned worktree checkout symlinks were repaired from exact Git mode-120000 targets before strict lint; no tracked content was changed by this environment repair.

## SDK and Game follow-through

Official initial pack succeeded at Engine `.run/101-strong-chest-sdk/`, version `0.1.0-dev.2e09df6755e97a4e14aeed6d330740a6b22de866704e6e31875e5dd008655584`; it predates Root's allocation correction and is retained only as evidence, not selected for Game.

Corrected official pack completed with exit 0 at Engine `.run/101-strong-chest-sdk-02/`, source HEADs checked before packaging. Its `source-inputs.json`, `pack-02.json/log`, and `sdk/identity.json` record version `0.1.0-dev.189b3f3b9970d9ab5717d79b234939eb62b16998ff060ad18b7472374afc6549`, nupkg SHA256 `479b076331ff1dfe5b973dfc58e2b7cdf89b7364fba0e5f73cfa6471bb325adb`. The official runner rebuilt production Native, both managed TFMs and the generator; no skipped Native or source-reference Game bypass is used. Native SHA256 `3df785ddbf7e4b9486c4f90c5a10f3a3eb88acb40f6ae93be478dec22313c3d9`, build ID `818412fc67ad37f15739daa67d35f574`, ABI unchanged c5f276c8….

Root independent review rebuilt into its own artifacts (0 warnings/errors) and executed final 17/17 actual Native binding-context cases with zero errors/failures/skips/not-run, exit 0. GTCG selected the corrected package through consumer08, verified original nupkg SHA512 and Native sidecar, and completed private locked restores. Strong chest actual Native cases are 11/11 passed, zero failed/skipped, exit 0; the original capacity RED is closed. Server, client and browser managed builds passed with zero warnings/errors. Complete Game and Tools regression is still in progress. Separate bounded retirement-storage work remains WIP in GTCG; it is not part of this upstream freeze.
