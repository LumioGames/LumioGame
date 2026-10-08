# 101 Voxel browser release composition plan — 2026-10-02

Owner: Client composition sub-agent, root authorized. Worktree `C:/Work/LumioGames/LumioVoxelEngine-101-browser-composition` from clean main `6eee59fbfd2439ce2b48e31d495c24d4d9076545`; old candidate and main remain read-only.

1. Verify four owning Voxel paths against both the approved 2026-09-30 hash manifest and package04 immutable source snapshot; results `101-20261002-voxel-source-verification.json` (done, exact hashes).
2. Preserve current actual behavioral RED: Client `js-final-02.log` two true WASM release tests fail because the main build lacks the export. Apply only these four verified paths; no binary copying, no Native ABI change.
3. Run affected Rust tests, full required workspace tests/checks/clippy/format, byte-for-byte upstream wire consistency and spec. Investigate any current-baseline failure rather than erase it.
4. Call official Engine `defaultBuilders.web` with the new Voxel worktree and current clean Native sibling. Run actual WASM release tests and complete Client JS suite. Save input identity, fresh binary hash, exact counts and failed attempts.
5. Freeze narrow source commit/manifest for root independent review and complete-release selection. Continue Game Session work while review/release integration progresses; no standalone module installed into Game.
