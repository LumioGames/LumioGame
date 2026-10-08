# Fact list and callback handle reads — narrow independent review

Result: **PASS for the two-file verifier correction** at Runtime commit `100e6417bd4d0370618f4f220aa9e691571d9dfb`, parent `ed5fae193cd871d2399836c41b79dba181323d53`. This does not approve a new SDK/provider or full Game integration.

Reviewed the exact production and test delta in `C:/Work/LumioGames/LumioGameRuntime-101-fact-list-read`:

- `tools/gen-declarations/EffectFactVerification.cs`, SHA256 `d03af2bab2b2afbeb268549a2503b0e7127c4d29cde34647ab0da47d465c91c1`.
- `tools/gen-declarations/tests/Lumio.Tools.GenDeclarations.Tests/EffectFactListReadTests.cs`, SHA256 `fa59d1390213ee7b5802bc1b2435dc8ee9aa5f8e58a9363771f314b00431665d`.

The new list permission resolves the trusted ECS assembly type identity, requires sealed `SyncList<T>` with a supported scalar element, and only accepts Count/index reads through a fixed instance field on an ECS component. The recursive operation visitor still validates the index expression and receiver. Container aliases, arbitrary getters, authored type shadows, enumeration, assignments, Add/Clear/RemoveAt and side effects are not accepted by this addition.

Handle properties resolve only the generator's own immutable inspection facade; WorldId resolves trusted ECS metadata. Authored same-name types cannot receive these permissions. Handle/instance/world-id locals add read-only value flow, while assignment targets, helper recursion, async/ref/out calls and unrecognized property getters remain rejected. The change models existing callback APIs without changing Runtime execution or public contracts.

Actual independent execution: full `EffectFactGenerateTests` class **53/53 pass, zero failed/skipped, exit0**, including the new14 cases. Evidence in Game `games/101-bomber/.run/20261002-client-session-integration/fact-list-independent-02.log/.exit`, with before/after source/tool/test hashes in `fact-list-review-inputs.json` and `fact-list-review-after.json`.

The first independent attempt is preserved as `fact-list-independent-01`:53 environment failures because the helper internally builds its CLI and no explicit LumioArchRoot was provided, so it resolved the default main checkout with missing successor generated contract. The successful run sets `LumioArchRoot=C:/Work/LumioGames/LumioGameEngine-101-wasm-render-world`. No assertion or source was changed. The test helper's implicit CLI build overlapped Root's same-source independent run; both were disclosed, and no further builds were started. The newer tree HEAD `f56067a2` includes a separate author format commit; the two reviewed files retain the exact hashes above.
