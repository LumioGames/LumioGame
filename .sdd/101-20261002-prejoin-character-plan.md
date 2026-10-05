# First character selection before admission — Implementation Plan

> Continue in the current authorized Game source window. Use the existing selection implementation and actual package consumers; do not modify authoritative phase rules.

**Goal:** A player can spend any amount of time on the approved five-character screen before any Platform launch/connection, then submit that intent through the real ability path as soon as the actual Self is ready.

**Basis:** design §8.0, ADR0030 single-screen before entry, ADR0044 five characters. Browser11/12 show the current post-admission Warmup race. Root authorized this correction and explicitly retained the existing Waiting/Warmup/Results authority restrictions.

**Architecture:** The page saves only the user's unsubmitted selection intent. Configuration comes from the same published embedded config export readers, without constructing a World. Existing portrait renderer/CharacterSelect/UI audio are reused. WASM, config and portraits load before launch. Real SelectCharacter is sent only after actual authority InputEnabled+Self, and movement waits for replicated character confirmation. Later match switching remains next-Warmup behavior.

- [x] Add JS regression: a deferred first selection does not launch or boot, cancellation cannot connect, and later confirmation waits for real Self then submits once. Add actual no-World config-read test.
- [x] Export a narrow presentation pre-entry selection wrapper with abort cleanup; retain original UI/portraits/skills text, local remembered selection and audio. Do not create simulated world or fake player.
- [x] Wire config-only C# export and page start, delivery/confirmation state, same-match display initialization. Keep existing phase guard; record a late-Warmup failure instead of allowing Running bypass.
- [x] Run affected C#/JS + complete Presentation suite/typecheck/build; publish through existing a5fa verified selection.
- [ ] Actual Edge: wait >3seconds at selection and prove zero launch/WS requests, select each character, verify true authority binding and appropriate skill; repeat negative/cancellation. Preserve screenshot/log/native evidence and independent review freeze.

Files: Spectator main.js/main.test.mjs, game-view.mjs, SpectatorDump.cs/PresentationDump.cs/host Program.cs, narrow C# tests; Presentation src/index.ts, new src/entry-selection.ts and tests, existing pickCharacter abort option if needed. No rules, material, mesh or HUD redesign.
