# Bomber Browser Player Implementation Plan

> **For agentic workers:** Use subagent-driven-development for scoped implementation and independent review. Do not commit or push.

**Goal:** A local browser uses a Platform ticket to join the real DS, move Self, place a bomb, and display the authoritative result.

**Architecture:** Keep the release DS on Windows and run the release Platform compose in WSL. Extend the existing launcher with a seven-bot plus one-browser player mode. Reuse the browser replica, release WebSocket connector, generated gameplay abilities, runtime outbox and wire codec.

**Tech Stack:** Node.js, C#/.NET 10 browser WASM, Engine release, Docker Compose in WSL, Playwright.

## Global Constraints

- Preserve the user's dirty worktree; no reset, clean, rollback, commit or push.
- Consume only `games/101-bomber/Engine` release artifacts; no Runtime source references or Engine public semantic changes.
- Retain all rejection of `m2-map-*` and `m2-room-*`. Use the legacy 19x19, eight-player room.
- DS owns simulation and positions. The browser only queues typed GAS inputs and displays replicas.
- Player has an independent account. Every new connection obtains a fresh Platform admission ticket; secrets never enter URLs or logs.
- No M2 freeze, stability campaign, replay campaign, seed campaign, uint work or Effect packet work.
- Completion requires a real browser action and matching DS evidence; mocked tests are only focused regressions.

## Task 1: WSL Platform

- [x] Verify existing WSL Docker daemon and exact release image.
- [x] Start an isolated compose project on an unused port using the release compose and game inputs.
- [x] Verify account/launch reachability from Windows and record the origin and project.

## Task 2: Typed Browser Input Bridge

**Files:** `Client/UI/Spectator/SpectatorReplicaHost.cs`, `host/Program.cs`, `SpectatorDump.cs`, and focused C# tests, relative to `games/101-bomber`.

**Interface:** JS exports `SendMove(int primary, int secondary, bool turnPressed)` and `PlaceBomb()` return a JSON array of UTF-8 wire messages. `PlayerState()` returns replicated match/self state. Existing spectator exports remain usable.

- [x] Validate that the release supports typed `AbilityComponent.Activate<TAbility,TInput>` and `IReplicaWorld.DrainOutbound()`.
- [x] Reject inputs before replica readiness and after disposal; validate direction values.
- [x] Queue typed MoveAbility / PlaceBombAbility on Self and encode each outbound command with `WireCodec.EncodeInput`. Never Tick or mutate transforms locally.
- [x] Export only the replica state needed to display readiness, self life and bomb ownership.
- [x] Run focused C# tests proving real outbox messages target Self and do not mutate replica positions or create local bombs.

## Task 3: Player Launch and Controls

**Files:** `Tools/launcher.mjs`, new `Tools/player-host.mjs`, `Client/UI/Spectator/main.js`, new `player-controls.mjs`, `index.html`, `spectator.css`, publish project and focused Node tests.

**Interface:** `--player` launches seven resident Bot.Host clients and serves `/play/`. `POST /api/player/launch` calls existing `loginAndLaunch` for the separate player account and checks all launch binding fields against the DS room. The page gets only its launch response, never the account password.

- [x] Preserve legacy map preflight before starting topology or minting tickets.
- [x] Serve published assets with no-store player HTML and fresh tickets on initial load, refresh and reconnect. Check loopback Host/Origin for the local ticket endpoint.
- [x] Keep spectator input-free. Enable keyboard and pointer controls only in the explicit player page.
- [x] Send typed C#-encoded movement while a direction is held, stop on release/blur, and send one bomb per deliberate press. Gate sends on active socket and replica.
- [x] Show replicated Self, bomb and connection state. Use existing game textures and stable responsive canvas/control dimensions.
- [x] Run targeted launcher, host and controls regressions; publish the actual WASM bundle.

## Task 4: Browser and DS Verification

- [x] Launch legacy room with seven bots and one browser, using WSL Platform and Windows release DS.
- [x] Open real page with Playwright, confirm Self and connection, move via keyboard, then place a bomb.
- [x] Record before/after replicated positions, owned bomb, authoritative DS input/result logs, browser screenshot, page URL, DS URL and room configuration in a new `.run` evidence directory.
- [x] Check desktop/mobile layout and perform independent scoped review. Fix defects and rerun covering checks.
- [ ] Leave a live usable page URL and document the run command in `Tools/README.md` and player behavior in the spectator README. Record exact remaining limitations, if any.

## User Follow-Up: Two Browser Windows

- [ ] Add two independent browser slots A/B, with six Bots and unchanged eight-player legacy configuration.
- [ ] Verify both windows enter together and see each other's authoritative movement and bombs.
- [ ] Leave two visible windows running for the user, with fresh per-account Platform tickets.

Single-player proof is in `games/101-bomber/.run/browser-player-live-v3-20260929`.
Keyboard and pointer flows both passed. `authoritative-proof.json` and `.log`
correlate input results and bomb IDs with DS logs. Browser `sourceLifeId` remains
null because that server field is Scope.None; ownership uses replicated participant ID.
