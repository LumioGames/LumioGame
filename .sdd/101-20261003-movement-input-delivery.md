# 101 authoritative movement and placement input — review handoff

Source: games/101-bomber. Approved design §6.1, kernel contract §2.1, ADR0032. The af385 prototype is a behavior reference only; all tests below consume the official cdab SDK and actual Native Hosting world.

## Implemented
- Time-budgeted four-way lane correction (500 milli); continuous correction retains its accepted threshold, subsequent assists in the six-tick window use 250 milli. Remaining movement time continues along the new lane, preserving existing water-speed integration and wall anti-tunneling.
- New direction, earlier perpendicular key, and bounded carried motion. A tap can finish a started correction after release, but unaccepted turns expire at the configured six authority ticks.
- Eight appended private persisted fields bind memory to the current Match/current-life association; frozen/dead/closed/mismatched owners clear pending input. Successful blink clears only movement memory and preserves placement intent.
- PlaceBomb now distinguishes receiving an eligible button intent from actual CanPlace admission. Inventory/cell/current-frame reservation refusals remain side-effect-free and retry within the SDK-truncated 125 ms window (two ticks at 20 Hz). Water, freeze/bubble, invalid identity and closed phase remain immediate refusals. Actual placement entry clears the intent before checked setup/reservation/Create so exceptions cannot replay it.
- No new Engine interface, parallel simulator, or authoritative position store. LogicTransform remains the position owner and GAS remains the input admission/cooldown path.

## Actual evidence so far
Evidence root: games/101-bomber/.run/movement-input.
- actual-red-01: original six movement cases, 5 failed / 1 passed / 0 skipped. actual-green-01: 6/6 passed.
- placement-actual-red-01: 7 cases, 6 failed / 1 passed. resume-placement-01: 9/9 passed, including actual old-fuse exit/refund, one buffered new bomb, expiry, hard cancellations and structural-owner exception after Game reservation.
- danger-actual-red-01: 15 cases, 2 failed / 13 passed. Source initially considered only active Danger, omitting imminent Fuse. Corrected current Native terrain forecast; the temporary pierced fixture mistakenly used hardPillar 1024, corrected to actual softBrick 1025 without changing production thresholds.
- lifecycle-red-01: 20 cases, 3 failed / 17 passed (successful blink left pending turn; stale life/match moved). lifecycle-green-01: 20/20 passed. Paired public Hosting restore repeats identical per-tick turn positions without new input; actual finite Freeze clears both memories.
- legacy movement 50/50, placement 21/21, inventory continuity 4/4 passed. Only obsolete CanActivate inventory assertions now target actual CanPlace with the same precise refusal code; accepted intents still assert zero cost/reservation/entity.
- gameplay-full-01: 749/749, 0 failed / skipped, exit 0; applies to freeze-01 before the independent chain-risk correction below.
- All listed successful builds: 0 warnings / errors. Tests each record execution command, exit code and actual DLL hashes. Source and before/after logs retained.

## Independent review follow-up
Root requested imminent transitive-chain risk. chain-red-01 adds a short-fuse bomb whose ray reaches a long-fuse bomb whose perpendicular ray intersects automatic assist. Actual position advanced 0.175: 1 failed / 20 passed. This is also an af385 prototype omission; Root explicitly approved correcting it under formal §6.1.

New BomberMovementDanger scratch builds a per-cell index of actual bomb rows and computes the complete read-only chain within the same input. Queue entries are bounded by the configured actual bomb capacity, each fuse enters once, and storage is world-associated scratch rebuilt on every use. It does not change Fuse/Reach or defer propagation. Five cases cover no obstacle (including real subsequent same-tick explosion of both bombs), hard barrier, non-pierced soft barrier, pierced soft barrier and a fuse outside the risk window. chain-green-01: 25/25, zero failed/skipped, exit 0. chain-build-green-01: zero warnings/errors, exit 0.

gameplay-full-02 independently exercises the complete current Gameplay assembly: 754/754, zero failed/skipped, exit 0, 3m29s. Actual test DLL SHA256 d1b00364b939f4b9144423f94c9ed86d7ea327ce16b5a3946ac0ecc185cca6e6. The 13 authored files are frozen at `.run/movement-input/freeze-02/manifest.json`, SHA256 6d7361c320d74817690ca14ccdd40e5240079de2078fbeca44654ad1ec43e091. Root independent source review remains pending; this is not final full-package/browser acceptance.

## Schema and next work
v10 exact current manifest is preserved as before-input-memory, SHA256 42b3a730285ad0eb23703887b578545147a6839f89927ae17981c6d48d723109. v11 appends only eight private fields (ordinals 15..22), preserves all 653 prior shapes, adds all 653 exact prior tombstones to 5762, and preserves all 24 existing authenticated pages. Candidate manifest apply awaits the final official full-package inputs.

The 6415-row migration first exceeded the existing 8 MiB comparison index. No limit changed: full SHA256 internal keys now use 44-character base64 instead of 64-character hexadecimal, reducing actual retained UTF16 strings while retaining all 256 bits. External provenance/page/snapshot hashes remain unchanged hexadecimal. Six old/new migration cases now pass; complete Tools audit awaits final apply.

v11 is now migrated and separately frozen: see `.sdd/101-20261003-input-memory-schema-delivery.md` for 425/425 complete Tools, 98 exact generated outputs, full-package byte pins and retained histories. Root independently rebuilt the full-package Game and reports 754/754 plus real Native→WS 1/1; those are separate Root evidence. Root source review remains open for the newly discovered Pierce placement/forecast mismatch, which is under true RED in the next slice. Final browser/whole-match checks remain owned by Root.
