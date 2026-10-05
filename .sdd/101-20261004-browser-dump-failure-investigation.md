# 101 true-browser dump failure — investigation and narrow correction

## Actual failure and owner

The true browser console in `games/101-bomber/.run/browser-experience-repair-01/live04-B-console.json` contains 32 errors from 2026-10-03T16:21:39.769Z through 16:21:42.476Z:

`[lumio-spectator] dump failed ManagedError: Component BomberPlayerState is not on entity 00000000000000010000000000000011`.

The entity ending `11` is the durable B participant, also recorded in `baseline-final-B.json` as `player.replica.participantId`. A owns participant ending `0f`. `live04-first-A.json` records its first active status at 22002 ms and first error at 38701.5 ms, a 16699.5 ms interval. Its sampled Session remains active, Native voxel view ready, while the page reports `dump failed`, position Self is null, presentation is closed and the last successfully projected player life says AwaitingRespawn. This is a post-admission Game projection exception, distinct from root's Server reconnect/negotiating investigation.

The throw is in `Client/UI/Spectator/SpectatorDump.cs`, `DumpPlayerState`: after checking that the bound Self is live, it unconditionally reads `world.Get<BomberPlayerState>(self.Id)`, then skill and attributes. That code assumes every live Self is a player life. `Gameplay/EntityTypes/Bomber/BomberParticipantEntity.cs` declares participant/lifecycle/statistics/observer components and no PlayerState, SkillState, AttributeComponent or LogicTransform. The exception exactly matches this legal participant attachment.

## Official attachment semantics

Complete package 07 version `0.0.5-main.0e2fc74` records Runtime `d8ae3da3793d5d95785606be319668a4318af85a` and Client `a6071a2a28c3cfda78400254654d6da1fef25b92`. The matching owning sources are `C:/Work/LumioGames/LumioGameRuntime-101-successor-capacity` and `C:/Work/LumioGames/LumioClient-101-successor-correlation`.

`Client/Gameplay/ECS/src/Public/ReplicaWorld.Successor.cs` observes formal successor Welcome, resets the generation and configures its ObservationAttachment with ParticipantId, Welcome.Self, ControlledLife and mode. It then sets `_controlledLife = welcome.ControlledLife`. Runtime `WorldManager.ApplyClientBatch` binds World.Self to Welcome.Self. The official `WireCodec.SuccessorBridge.cs` validates observing attachments as ViewEntityId == ParticipantId with no ControlledLife. Consequently World.Self legally points at participant during observation, while input `SelfLookup()` is unavailable. Nothing here grants the participant player abilities or a substitute life.

`main.js` calls DumpPositions, then PlayerState inside `applyDump`, then PresentationState. PlayerState throwing prevents further presentation updates. A formal successor generation changes its Native world handle: `refreshVoxelWorld` disposes the prior GameView through `closeVoxelWorld`; `game-view.mjs.dispose` records presentation `closed`. A subsequent failing PlayerState projection prevents creating/updating the replacement view. `pumpSession` keeps scheduling because this read-side error is caught inside applyDump, so active/error alternation is expected when authority transitions between living player and observing participant. The current `player.replica` may remain an earlier successful life record after an exception; it is evidence of stale projection, not the current binding.

## Minimal authorized design

Root authorized exclusive changes in `Client/UI/Spectator/SpectatorDump.cs` and new `tests/ParticipantSelfProjectionTests.cs` only. Use `world.TypeOf(self.Id).ClrType == typeof(BomberParticipantEntity)` as the explicit legal participant branch. Project selfId and participantId from the same Self identity, lifePhase from Room/Server-synchronized BomberParticipantState.LifePhase, and leave characterName and availableBombs null. InputOpen must additionally require a player-life Self, even when the participant phase is Protected or Vulnerable and the caller passes inputEnabled true. Preserve the original strict Get calls for player and all unexpected entity types; no general exception swallowing, envelope relaxation, cache or shadow world.

Participant NextCharacterId and SelectedForMatchCharacterId, and BomberRespawnCarry.CharacterId are Scope.None; their generated defaults cannot establish a received authoritative character. Do not follow CurrentLife/LastLife to borrow other or retired player fields. Position and bomb projection remain independent replica observations; participant has no fabricated pose.

## Behavioral verification seam

The new cases use existing BrowserSessionOwner actual Native SDK ownership and its official ClientWorld creation. Formal WorldManager receives observing Welcome, real participant/other-player/bomb CreateRecords and synchronized match/lifecycle fields. Before the correction, DumpPlayerState must throw the same missing-component exception. Cases cover all four participant phases, preserved controlled-player stats/input, a higher-generation Welcome that binds a new player life, absence of a bound Self without borrowing another replica player, and uninterrupted positions/bombs/PresentationDump output after legal participant projection. Existing malformed-envelope/host, projection and typed-input tests remain strict and unchanged.

Build outputs, NuGet packages and locks are isolated under `games/101-bomber/.run/browser-participant-self-repair-01`. The official `eng/select-engine-release.mjs` generates the complete-release selection and feed mapping. The initial command incorrectly made LumioEcsGenerate=false global: that removed Gameplay's normal generation and its packaged ECS rules, causing missing GeneratedRegistry and CA1051 compile errors before tests. Those logs/result are preserved and are not behavioral RED. Root directed removal of that global property while the existing Tests project retains its own local false setting. A separate `attempt-02` uses normal official Gameplay generation and unchanged strict analyzers. No declaration, source lock or NoWarn edits are authorized or made.

## Sealed implementation outcome

After preserving the setup failures, `attempt-03` used the actual Microsoft.Testing.Platform runner's `--filter-class` option. Behavioral RED ran the original production SHA256 `d57333020eae1c3968d84b8183fefd0171e585dd0ceafed8970732bb639c3967`: 7 tests, 5 missing-component failures, 2 pass, zero skips, raw exit 2. All five failures identify old DumpPlayerState.cs:169 and the exact BomberPlayerState missing-component message. The new tests were not changed between RED and GREEN.

The minimal explicit participant declaration branch and player-life input gate then passed the whole Spectator C# project: 60/60, zero failures/skips, raw exit 0. Normal official Gameplay generation left all 110 frozen existing generated/lock files byte-identical. The tested after SpectatorDump.cs SHA256 is `599609920469e0ba2eec906ba7425c678d6b128556cb6a548f2fefaf18ae25c9`; new test SHA256 `17df0114be6332d6f2c7e6106896955887dc862ed30ba6893291eb39a5fe0d98`.

Exact originals/after files, process arguments and exits, raw logs, summary, diff, implementation report and independent reviewer brief are sealed in `games/101-bomber/.run/browser-participant-self-repair-01`. The reviewer inputs are `independent-review-brief.md`, `task-report.md`, `exact-two-source-files.diff` and `verification-summary.json`. Only SpectatorDump.cs and the new test are changed; no old test, scheduler, prediction, Model, pin, service or release image changes.

Independent review, normal browser publish and true eight-player lifecycle acceptance remain root-owned and pending. This correction does not close ten close/reopen cycles, movement prediction, Model rendering, release identity or broader delivery gates.
