# Runtime bounded JSON base64 delivery (2026-10-03)

Source is frozen at `C:/Work/LumioGames/LumioGameRuntime-101-drain-codec-window`, commit `a07f6e5200e82c41392d89de14b96989ddcffc66`, relative to reviewed `e00aa599482970faaae52ee0863bf351d5feefcd`.

The 11-file delta combines the generic JSON-base64 streaming writer (`15f93766`), exact terminal receipt slice `80eed3c` (cherry-pick `696b5b22`), exact Root current-owner pure-read slice `efd0fa7e` (cherry-pick `32e3ec91`), and terminal JSON-base64 wrappers (`a07f6e5`). It contains no Host field, private shutdown protocol, Native ABI change or pending periodic/slot16 change. Unknown WorldMessage rejection remains the existing shared codec behavior. Short destination is untouched. The output includes default STJ JSON escaping of base64 '+' as '\u002B'; simple 4/3 payload arithmetic was not enough.

## Executed evidence

All paths below are in the source tree `.run/drain-codec/`:

- `codec-base64-red01`: original missing public generic APIs, 7 actual failures (retained).
- `codec-base64-green03`: 8/8, 0 failed/skipped, exit 0. Includes '+', '/', '=' and both padding widths, multi-block input through 65536 characters, default STJ byte equality, short Span unchanged and warmed measure/write 0 B.
- `codec-terminal-base64-green01`: 11/11, 0 failed/skipped, exit 0; direct terminal receipt conversion needs no receipt DTO.
- `codec-combined-build01`: all target frameworks, 0 warnings/errors, exit 0.
- `codec-combined-full01`: 2915/2915, 0 failed/skipped, exit 0, 1m53.741s. Real production Native plus separately hashed same-source test-support Native; exact environment in JSON sidecar.
- `codec-combined-format02`: exit 0, zero changed files among 1580. Workspace warning identifies external NativeLoader.Hfsm project missing metadata reference; no formatter/source warning was suppressed.
- `codec-compat-tested05`: 170 official b213 versus exact tested ECS binary samples, byte/rejection equality, zero differences. Earlier `codec-compat04` used the same-source producer binary and is separately retained.

Exact full-test ECS is `artifacts/bin/Lumio.GameRuntime.Ecs.Tests/release/Lumio.GameRuntime.Ecs.dll`, SHA256 `572898dfa3b39299d0f13570256e14d10e4454a0b7a5f7edef2f4d3d7d83db62`. Producer net10 binary is SHA256 `0839357c9c3ce4d5c1ea9cdf55f8e0700102f02f5ee49f5bba5ae128d4ab0b8d`, rebuilt by a fixture during full tests. Their MVIDs differ; all method names/signatures/IL hash match `4ef517b1e4b04f74837d1ee38ac08a91d3ec8e8a83b2ffe46cea9ba7d7b5a89b`. We do not call the binaries byte-identical. The 170-sample comparison was repeated with exact full-test binary.

Immutable source/read index: `.run/drain-codec/freeze-a07f6e5.json`, SHA256 `4775b69658cbd3c685edce71837899b3d6b411272fd610f4e40327fcb26ae6ce`. 127 tracked generated files remain identical after line-ending normalization; source hashes and tested/prod binary distinction are in the index. Root independently reran 11 base64 + 17 receipt tests, all green.

## Remaining scope

This proves Runtime encoding, not the complete Host shutdown handoff. Host production and Native tests are still being integrated against a new official SDK; no source references or loose Runtime DLL consumer is allowed. Host maximum reply budget and cold/steady managed allocations, full query value shapes, all seven output lanes, unknown Take/ACK replay, and actual Rust CLR integration remain required. The first e00 cold allocation evidence only applies after common codec/JIT infrastructure preparation, not first process allocation.

Client owns official pack-sdk and prepare-host-sdk. Root separately owns the freshly discovered initial-admission container encoding defect, from a07, and will provide a later narrow delta; no change to that file is included here.
