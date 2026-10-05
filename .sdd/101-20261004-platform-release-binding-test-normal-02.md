# Release binding test compatibility supplement

This supplement supersedes only the test migration input from v1. The original report47d2d177..., seal6531fbfd..., all RED/GREEN logs, local profile files and source copies remain unchanged.

Exact migration files:

- `C:/Work/LumioGames/LumioGame/.run/platform-release-binding-01/test-normal-v2/new-game/Tools/launcher.mjs`, SHA256 `2e4d04a8d1954d0fa889d90f5b2d6792f692e8003c00ff8433c6b8a63f3139e6` (unchanged candidate).
- `C:/Work/LumioGames/LumioGame/.run/platform-release-binding-01/test-normal-v2/new-game/Tools/release-binding.test.mjs`, SHA256 `881832572c97dae922f25bd51660f5ac56bd8628b57adbec254236c3c449e23e`.

The new test only adds mkdtempSync/tmpdir imports and replaces the required evidence environment assertion with `process.env.BINDING_TEST_EVIDENCE_DIR ?? mkdtempSync(join(tmpdir(), 'bomber-release-binding-'))`. All session fixtures, assertions, test names and behavior checks remain byte-identical. Explicit evidence paths retain existing qualification behavior; a normal Node test invocation without that variable writes only its own uniquely named temporary reports.

Same new test source was copied into two isolated input roots. Original launcher SHA74d67d46...: old-red-01 actual Node exit1,25 tests/3 pass/22 expected failures/0 skipped. Unchanged candidate launcher2e4d04a8...: new-green-01 explicit-output invocation exit0,25/25 pass/0 skipped; default-green-01 without the environment variable exit0,25/25 pass/0 skipped. The ten original regression results from v1 were not rerun because no production logic changed.

No shared Game file, source pin, service, Platform registration or browser was changed. This is pure launcher policy qualification; Native/browser experience and formal publication claims remain unchanged from the original report. The final-seal-02 inventory excludes its own administrative outputs and references the original immutable seal instead of replacing it.
