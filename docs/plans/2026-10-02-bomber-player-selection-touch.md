# Bomber player selection and touch implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Restore the approved five-character entry and touch controls through production client callbacks.

**Architecture:** Keep selection and pointer state local UI only; server snapshots decide selection windows and gameplay readiness. Reuse the exact af385a9 joystick math and touch assets; integrate pointer directions into the existing production keyboard input cadence. No local gameplay, position or health writes.

**Tech Stack:** TypeScript, DOM, Vitest, Node tests, actual browser fixture interaction.

## Global constraints

- Own Presentation entry/HUD/touch/CSS and Spectator game-view/player-controls/main only; no Gameplay, replica adapter/types/events or PresentationDump changes.
- Preserve V/M repair and current dirty work; retain af385a9 geometry/materials/audio.
- Legal selection windows are replicated phases 0/1/5 with active self. Closing the window closes selection UI; the room is never paused.
- Saved character is a preselection only. Confirmation sends existing SelectCharacter GAS; displayed character remains replicated.
- Touch uses 120px floating joystick, 52px knob, 88px bomb and 68px skill controls; 18% dead zone, 15% axis hysteresis, secondary axis >= half major axis.
- Host SendMove mapping is Up1/Right2/Down3/Left4. Pointer directions use the presentation enum and must be mapped once.
- Current PlaceBomb public API has no remote/hold parameter. Do not fabricate a long-press protocol; record this dependency.
- Browser fixture evidence proves only display/input plumbing, never real DS gameplay acceptance.

### Task 1: Selection lifecycle

- [x] Preserve exact before files and record provenance.
- [x] Extend game-view regression for readiness, first legal selection, confirmation, phase expiry, same-room next-match and spectator; observe failure first.
- [x] Add `Presentation.setSelectionWindow(open, initial)` and `inputBlocked()`; HUD/Overlays reuse existing start/switch CharacterSelect, save last confirmation and select by available card ID. Add current-window validation to confirmation. Close UI on authoritative expiry and retain auto-first-selection only until one command was submitted.
- [x] Gate keyboard/pointer gameplay callbacks against open local dialog; do not stall server or fabricate selected state.

### Task 2: Touch controls

- [x] Copy `af385a9` joystick and touch CSS; migrate TouchControls action interface to callbacks and disposal, visibility, disabled/readiness gates.
- [x] Add `createPlayerInput.setTouchDirection(primary,secondary)` with a shared keyboard/touch timer; pointer takes precedence, release resumes still-held keyboard, blur/hidden/close clear all. Add failing tests before implementation.
- [x] Bind Presentation touch status from HUD skillButton and formal `inputReady` callback. Pass translated pointer directions through `playerInput` to existing `csharp.sendMove`; bomb/skill through existing callbacks.
- [x] Avoid duplicate direction-pad/buttons in presentation mode, retain diagnostic fallback controls. On 320px portrait tighten control margins, left-align the bottom skill bar and reposition the scoreboard clear of controls. The initial above-bomb proposal was superseded after browser screenshots demonstrated overlap with the scoreboard.
- [x] Run complete Presentation tests/typecheck/guard/build, Spectator focused/full Node regression. Run an actual desktop/mobile fixture browser with pointer/keyboard events, confirm portrait assets, five-selection persistence, multi-touch move+bomb/skill/CD and layout, save screenshots/JSON. Report exact counts and remaining upstream selection/remote semantics.
