# Client formal-world read and presentation slice

Frozen source: `C:/Work/LumioGames/LumioClient-101-composition`, commit `70201c909d096eccf23c9009567d75ef49940232`, base `ecd88285c1a3e83a977d3630f263fe70357aa307`. Eight changed paths; no Game presentation changes. Source byte manifest: `.run/composition-20261002/client-read-box-source-manifest.json` in the Client tree.

The managed adapter now exports a detached full 32-byte world identity and reads the existing Native `block_read_box` on the ClientSession-owned world. Read capacity is checked against the canonical 262144-cell bound before allocation; reversed bounds, incomplete results and invalid segment bounds fail. Section revisions retain all 64 bits. The display adapter accepts this observation and the same Engine WASM presentation facade; it has no create-world, deliver-section, release-section or authoritative mutation path. Closing it only retires its display observations. Existing top-down surface projection was extracted without changing its visual meaning; unresolved cells remain loading.

Actual evidence under Client `.run/composition-20261002/`:

| Check | Result | Evidence |
|---|---|---|
| Missing managed APIs, before implementation | build exit 1, four compile errors | `browser-read-box-api-red.log` |
| Missing read-only display module, before implementation | 0 pass / 1 fail, exit 1 | `replica-grid-red.log` |
| Spectator managed | 67/67, 0 fail/skip, exit 0 | `read-box-build-01.log` |
| Actual Chromium + full Engine WASM | PASS; browser console/network errors empty | `browser-read-box-green-02.json`, `.png`, `.log` |
| Render/RHI/Assets/Spectator JS | 101/101, 0 fail/skip, exit 0 | `replica-grid-render-js.log` |
| Client solution, twelve TRX | 1235/1235, 0 fail/skip, exit 0 | `read-box-solution.log`, `read-box-solution-results/` |
| C# format, final source; staged diff check | exit 0 | `read-box-format-final.log`; commit preparation |

The actual browser covers detached full identity, y/z/x ordering, adjacent unavailable section, full Native section revisions, canonical read limit, release invalidation, existing prediction and repeated world reuse. It is evidence for the adapter, not Game/DS full-match acceptance. An intermediate old Voxel-grid test ran without its explicit same-source WASM path and failed; `replica-grid-green-01.log` is retained. Supplying the official Voxel 2ba binary made all 15 relevant tests pass, then the complete 101 JS checks passed. No assertion was removed.

Stable managed regression inputs were Runtime `7d6e5f5d83f3bfdd1039a0b9da559afc0abeae41` and Engine `0a265f40e0727f6c9105e049c37308d5c3a9fbd2`, with its official test Native. Browser used reviewed Engine `f53d6ad806e252f8d5bb210e1ddda9e34181c4a1`. The official candidate build now pairs this Client with Engine f53, Voxel 2ba and Runtime finite-query f3b; this combination still requires its own build and Game integration evidence. No release was published.
