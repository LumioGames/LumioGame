# Bomber presentation shortcuts implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Restore the confirmed prototype's V overview and M mute keys in the production presentation entry.

**Architecture:** Bind local display commands to the existing presentation-owned camera and audio/HUD/settings callbacks. No GAS command, gameplay state or prototype simulator is involved. The current presentation worker is the assigned implementer; root will independently review the resulting diff.

**Tech Stack:** TypeScript, browser keyboard events, Vitest, existing Three.js presentation.

## Global constraints

- Preserve af385a9 scene/assets and all existing dirty work.
- Do not modify Gameplay, generated declarations or growth projection fields.
- V toggles overview once per physical key press; M toggles existing persisted mute state once.
- Ignore consumed events, repeated keydown, IME composition, Ctrl/Alt/Meta shortcuts, editable/interactive targets and active presentation dialogs.
- Dispose removes listeners; a replacement presentation must not retain the old callback.
- No claim of real browser/full-match acceptance from unit tests.

### Task 1: Restore local shortcuts

**Files:** Create `games/101-bomber/Client/Presentation/src/present/shortcuts.ts` and `shortcuts.test.ts`; modify `src/index.ts`; document results in `.sdd/101-20261002-presentation-fix-report.md`.

**Interfaces:** `attachPresentationShortcuts(target: Pick<Window, 'addEventListener' | 'removeEventListener'>, actions: { overview(): void; mute(): void; blocked(): boolean }): () => void`.

- [x] Add event-delivery tests using the native EventTarget: dispatch cancelable keydown with `code='KeyV'`, verify overview counter becomes 1 and default prevented; `KeyM` similarly; repeated/modified/consumed/UI events leave counters unchanged; detached old session never fires.
- [x] Run `npm test -- src/present/shortcuts.test.ts`, record the expected missing-module failure.
- [x] Implement a single keydown handler: early return on blocked/consumed/repeat/composition/modifiers/UI target; select `KeyV` or `KeyM`; prevent default and invoke one callback; return exact removeEventListener cleanup.
- [x] Extract the existing mute callback in `src/index.ts` into `toggleMute`, use it both for HUD and keyboard. Bind shortcuts after HUD creation; blocked checks `document.hidden` and active `.hud-modal.is-on`. Invoke cleanup inside idempotent dispose.
- [x] Run focused tests, full `npm test`, `npm run guard`, `npm run build`, record exact counts/exits. Root performs independent review and later real browser checks; no standalone commit of the shared dirty tree.
