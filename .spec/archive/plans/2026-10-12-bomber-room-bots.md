# Bomber existing DS room and bot fill implementation plan

> For agentic workers: use subagent-driven-development task implementation and independent review.

Goal: replace the empty pre-game screen with the existing DS room, default to waiting for humans, and fill missing slots with one authoritative bot every three seconds only after a player explicitly enables fill. Verify movement, bombs and a complete real remote match.

Architecture: the existing DS world remains the room. Persist and replicate room bot-fill state through gameplay components. An owner ability changes the fill preference; a server TickPhase system creates real PlayerEntity bots and drives their existing GAS abilities. The browser consumes replicated roster and countdown and sends normal owner abilities. No new matchmaking backend or fake client states.

Tech stack: current SDK008 complete release; C# Gameplay and normal GAS; .NET browser host; JS Spectator entry and TS Presentation.

## Global constraints

- Existing room room-bomber-8p-19, eight participants and 19×19 map; central supply off.
- Default wait for real players. Only clicking 机器人补齐 enables fill; 等待真人 stops subsequent additions.
- One bot per 3000 ms expressed in authoritative ticks. Names bot001, bot002, and so on.
- Full room stops fill. Repeated clicks cannot create multiple timers or duplicate bot names.
- Real DS entities, GAS movement and bombs, normal damage/respawn/results/next-round lifecycle; deterministic server decisions.
- No certificate or auth bypass, no client fake state, no prototype simulator, no mixed SDK DLL delivery.
- Preserve singleplayer 101-bomber and unrelated dirty work. Publish both client and server under a new exact release binding.
- Room page replaces the supplied blank wasm-ready entry. Show real roster, humans/bots, count /8, next join countdown, selection and status.
- Never print or persist passwords, tickets or private keys.

## Task 1: authoritative room fill and AI

Files: Gameplay authored world/player/participant state, new SetBotFillAbility and server room/bot system, successor lifecycle if bot metadata needs propagation; Server/Tests/Gameplay/BomberRoomBotTests.cs. Generated outputs only from the existing generator.

- [ ] Add failing actual-world tests: default single human creates no bots after >3s; enable produces none before 60 ticks at 20Hz, then exactly one; subsequent additions each 60 ticks; disable stops; full roster never overfills; repeated enable is idempotent; bot names unique; bots are actual authoritative entities with actual GAS input and survive respawn/next match.
- [ ] Add world fields BotFillEnabled (Room boolean) and BotNextJoinTick (Room ulong); server private BotSequence. Persist bot identity/number with life and participant lifecycle as needed.
- [ ] SetBotFillAbility.Input { bool Enabled }; validate caller is a real current admitted human and room is waiting; update authoritative state once. Use unused game AbilityType after inspecting existing IDs.
- [ ] Server scheduler uses world.Tick and config TickRateHz; at most one creation per boundary, never creates past config.Game.PlayerCount. No wall clock timers in gameplay.
- [ ] AI uses existing AbilityComponent.Activate<MoveAbility, MoveAbility.Input> and PlaceBombAbility; avoid imminent blasts and navigate the real voxel map. Position remains LogicTransform. No second simulation or direct damage.
- [ ] Protect incoming human/roster capacity and preserve real identities; do not let bot entities trigger the admission capacity invariant or impersonate accounts. Report exact tested replacement/late-entry behavior.
- [ ] Run focused failing then passing tests with selected complete SDK and real native; report exact outputs and changes.

## Task 2: existing DS room page and legitimate input bridge

Files: Client/UI/Spectator/{main.js,style.css,index.html,SpectatorReplicaHost.cs,SpectatorDump.cs,SpectatorJsonContracts.cs}, browser bridge as located, and relevant JS/C# tests. Presentation only if entry integration requires it.

Contract: expose normal C# SetBotFill(bool) owner input calling Task 1 ability. PlayerState JSON includes room {capacity, humans, bots, fillEnabled, nextBotJoinTick, authorityTick, tickRateHz, players:[{id,name,isBot,isSelf}]}; sourced solely from replicated gameplay World.

- [ ] Write failing state/DOM tests for connecting, waiting 1/8, seven bot additions, fill countdown, toggle, full warmup and transition to live map.
- [ ] Connect through existing fresh authenticated platform launch automatically when entering room; retain legitimate character selection input. Show room while phase WaitingForWorldReady, hide when actual warmup/running starts.
- [ ] Replace blank wasm-ready screen with eight seats, roster, room count, role selection and buttons 机器人补齐 / 等待真人. Both buttons send legitimate DS ability and await replicated confirmation.
- [ ] Distinguish connecting, waiting humans, filling, warmup and errors; never fabricate 8/8 or bot names. Preserve stage disclaimer in a compact details area.
- [ ] Verify DOM/bridge/serialization tests, record exact covering output.

## Task 3: reviewed complete release and remote browser acceptance

Files: private .run/20261012-bomber8-room-bots-04 evidence, delivery source ZIP, runbook/checkpoint additions. No unrelated platform edits.

- [ ] Independent review of Tasks 1/2 diffs and integration contracts; fix blocking findings and rerun covering tests.
- [ ] Run official selector against immutable SDK008, publish server, browser and bots from the same reviewed Game commit. Preserve generated sources and build provenance.
- [ ] New gameReleaseId for changed schema; verify exact platform/DS admission bindings and same client/server content configuration. Stage complete archives before switching, preserve rollback.
- [ ] Deploy DS, publish matching multiplayer frontend through authorized platform mechanism when available, update runtime/deploy evidence.
- [ ] Real browser normal login -> room default wait -> enable fill -> seven bots spaced 3s -> actual start -> actual moving and bomb -> authority evidence -> full settlement -> same room next game. Save screenshots and DS/client evidence without credentials.
- [ ] Record any unrun broader matrix honestly. Do not call build/entry alone full gameplay acceptance.
