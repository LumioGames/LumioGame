# Controlled CLR binding lane — narrow implementation, integration pending

Server worktree: `C:/Work/LumioGames/LumioServer-101-composition`, shared HEAD `b89b8dbcb6495a52839bc9dd36b508159218d22d` plus protected Root/provider work. No commit or publication was made by this slice.

## Implementation

- New `Engine/src/admission_binding.rs` defines non-Clone/non-Deserialize `ValidatedAdmissionBind`. Its only crate factory accepts Root's sealed `ValidatedPlan` and an owner-matched prepaid `AdmissionCallWindow`. The exact plan, capacity, context fields and full-width request identity are serialized as borrowed RawValues; no grant, JSON tree or second authority is retained.
- Admit uses `AdmitConnectionMessage`; reconnect/takeover use `RebindConnectionMessage` with the original mode. Completed Accepted/refused lanes cannot dispatch again. Deferred, invalid replies and bridge uncertainty preserve original buffers/bytes and held credit.
- New `clr/admission_bind.rs` checks current actual incarnation/instance and open Runtime before the bounded `invoke_json_into` call. Unknown binding responses retain one request digest; other ordinary operations/services/bindings cannot replace it. Shutdown returns pending before changing boot/arena state; restore is refused before its arena mutation path.
- Public-parameter-only successor `admit_selected_profile` is refused. Legacy profiles retain the existing ordinary route. `RuntimeSurface::commit_admission_binding` is the new narrow port.

Exact six-path frozen source snapshot and mechanically isolated review patch:

`C:/Work/LumioGames/LumioServer-101-composition/.run/101-controlled-bind/freeze-01/manifest.json`

Manifest SHA256: `b98ea137a43cbe930b6e7915e4bb8dc9972683ff139a1cda606ffe21e690f958`.

`owned-slice.patch` SHA256: `d733129666fe263297dd3302a28a19ae417f88147679f94206ce0406383f5003`.

The `before` directory is explicitly a mechanical review projection removing only this slice from the shared current files, not a claimed historical repository state. It excludes Root's existing admission/arena/Owner changes. `after` hashes bind the actual six source files at freeze time; future Root edits can legitimately change shared files.

## Actual validation

All evidence is under Server `.run/101-controlled-bind`.

| Evidence | Actual outcome |
|---|---|
| red-01 | Build fails: missing explicit Engine contract root; not behavioral RED. |
| red-02 | Build fails: missing test imports; not behavioral RED. |
| red-03 | Shared unfinished private owner methods rejected by existing `-Dwarnings`; not behavioral RED. |
| red-04 | Real old public successor route accepts without validated plan: 0 pass/1 fail/0 ignored, exit101. |
| lane-red-01 | Window/state seam before implementation: 1 pass/5 fail/0 ignored, exit101. |
| owner-red-01 | Contradictory false/Accepted response incorrectly treated Deferred: 7 pass/1 fail, exit101. |
| restore-red-01 | Actual runtime+voxel restore crosses CLR while binding uncertain: 7 pass/1 fail, exit101. |
| lane-green-02 | Eight controlled-binding tests pass, 0 fail/ignored, exit0. Includes byte/pointer reuse, budget retention, full uint identity, Unicode/raw plan, refusal, overflow/UTF8, pending close/restore. |
| engine-full-diagnostic-01 | 330 pass/2 fail/1 existing ignored: Root's in-progress released-receipt RED and missing Native env. Kept unchanged. |
| engine-full-diagnostic-02 | 332 pass/0 fail/1 existing ignored, exit0; actual Native kernel test included. |
| clippy-diagnostic-01 | Failed. One own test-helper lint fixed afterward; remaining Root WIP result-size/match lints communicated, not suppressed in source. |

These diagnostic Cargo runs explicitly used `RUSTFLAGS=-A dead_code` solely because Root's unfinished sealed-plan owner pipeline is not yet called from production. They are **not strict build/lint acceptance**. Existing source lint policy remains unchanged. Clippy used `-D warnings -A dead_code`; final strict unmodified policy remains required after Owner integration. The two new files pass direct rustfmt check; shared files were not broadly reformatted.

Full diagnostic02 environment: `LUMIO_ENGINE_ROOT=C:/Work/LumioGames/LumioGameEngine-101-wasm-render-world`, Native `.run/2020bcc47cee042330ff5a8d949ada92/win-x64/run-Idt9KO/lumio_engine_native.dll` as specified by Root for this Rust composition.

## Remaining before production acceptance

Root must produce the capability only after actual Acquire/Reserve/Validate and actual publication/Section resources, then retain the same lane in its pending owner through retry/cleanup. The boundary tests use actual windows/budget and CLR fault seams; they do not prove the real HostEntry/Native/socket/provider chain. Actual positive sealed-plan→CLR→Tick→cursor/fence→release, independent review, strict lint/build and final same-source SDK remain outstanding. No successor profile readiness or complete match is claimed.

Browser continuation remains recoverable in `.sdd/101-20261002-entry-retry-progress.md`; the plain Release late-input failure is still open. Its entry06 frozen four-path source was not changed by this Server work.
