# 101 Voxel browser composition handoff

Frozen source: `C:/Work/LumioGames/LumioVoxelEngine-101-browser-composition`, branch `codex/101-browser-composition`, commit **1d8a2db8fdabc4e77f22bc1cab5820afd815427c** over main **6eee59fbfd2439ce2b48e31d495c24d4d9076545**. Source clean except untracked `.run/`; main and the old candidate were not changed. Implementation commit `344dcdf` (6 paths), separate mechanical spec commit `1d8a2db` (2 paths). Full 302-file manifest `.run/101-browser-composition/source-manifest.json`, SHA256 **f5f42d938e81ff8acf5ef47c8bea6ac332b7bce7567ffa710ecc03386ba28764**.

## Change and provenance

- Four wasm paths `src/{lib,bridge,render,tests}.rs` are the approved release fix: exported `lumio_voxel_release_section` delegates to existing world residency release, then lighting/remesh invalidation; released cells are Unavailable, a later full entry requires request again, invalid handles fail. Verified raw hashes against both `container-browser-review-fix-20260930-01.hashes.json` and immutable `effect-candidate-evidence-04-verified/sources.json`; verification `.sdd/101-20261002-voxel-source-verification.json`. Package snapshot SHA977550afe719c2bd30ab6ec907787748e53892bb572fcedbb7021f1a5e66ad24; source patch SHA740c7dfee4a89de36b5b074bfb603bada2ff64b82adb6390f37b6856a82c860e. This is a verified narrow recovery, not trust in an old mutable source directory.
- Current Engine0a `voxel-world-v1.json` copied byte-for-byte into the Voxel mirror; recorded digest updated from e2a40d… to **7d6a236a387678917b32c14ff8f8e1dc8500125f645424ff1cb10e1bf3e956b7** per the owning repo's documented process. The actual first full workspace run failed this exact upstream consistency assertion. No upstream contract or ABI layout changed here.
- Spec test fixture gained required root AGENTS pointer. ADR0011's deleted historical table link now points at its exact verified Git object `d1667df486fe0a5ad3ad473cf3c41f49af123adc`; no policy text altered or retired evidence restored as current policy.

## Actual verification

Evidence relative to Voxel `.run/101-browser-composition/` unless noted:

| Check | Actual result | Evidence |
|---|---|---|
| Full Rust workspace/all features | 715 pass, 0 fail, 2 existing ignored timing tests, exit0 | cargo-test-02.log, cargo-test-counts.json |
| Both timing tests explicitly in release | 2/2 pass, 0 fail/ignored, exit0 | explicit-perf-tests.log |
| All-target/all-feature clippy `-D warnings` | exit0 | clippy-01.log |
| Workspace no-default-features | exit0 | check-no-default-01.log |
| Crate DAG / collision guard / rustfmt | all exit0 | dag-01.log, collision-01.log, format-02.log |
| Spec self-tests | 19/19 pass, zero skip, exit0 | spec-test-02.log |
| Strict spec | 12 common + 1 extension, zero findings, exit0 | spec-03.log |
| True WASM release RED | Client109/111, two release failures (missing export), zero skip | Client .run/composition-20261002/js-final-02.log |
| Official fresh WASM after recovery | exit0, **603807 bytes / SHA02d9e4ff94abf0e303cfab658db85e547174b70ac5a9effffa65e2e28fb1facb** | Client official-web-fixed-build.log, official-web-fixed-build/voxel-build-evidence.json |
| Complete Client JS including actual Rust release | **111/111 pass, zero fail/skip, exit0** | Client js-final-03.log |

Full default + explicit timing execution covers **717** Rust tests. Default ignored counts remain honestly present; they are not rewritten as zero. No assertion was deleted or threshold relaxed.

Official browser build invoked Engine0a `eng/pack-release.mjs` exported `defaultBuilders.web`, with this Voxel tree, clean NativeCore c93b5c62ebd6dab32a92f70efef3e5d07151f689 and Client95a4545. It also builds the full Engine WASM SDK; the voxel-only bytes exactly match the old approved module, but were freshly built here. The build's provenance reports pre-freeze Voxel HEAD6eee59f plus then-working source; this frozen commit contains those exact source bytes and no subsequent production mutation. No binary was installed into Game.

## Limits / next owner action

Root independent review and final full SDK/Native/WASM release composition are still required. Old Native artifacts are not relabelled as built from this new Voxel source. Existing Engine0a contract lists browser F2 binding count/read exports which are absent in Voxel main; that separate implementation gap was reported to root and is not claimed fixed by the Section release patch. Game browser Session and single-world rendering integration remain ongoing in the Client task.
