# Bomber Presentation

Three.js scene, character models, hats, HUD, audio and presentation effects migrated
from the prototype at `af385a9cd0f261317e97240a7e55accdda8d01d5`.
This package renders immutable replica snapshots and committed occurrences. It
does not run the prototype simulator, bots, local host or gameplay input loop.

## Production Integration

`Client/UI/Spectator/PresentationDump.cs` exports the C# replica as JSON.
`game-view.mjs` combines that projection with the released Engine voxel reader,
then calls the package entry points:

- `projectReplicaConfig`: maps activated generated configuration into display data.
- `createReplicaAdapter`: preserves full entity identities and relative ticks;
  projects player, match, skill, result and occurrence data.
- `ReplicaTerrain`: reads both voxel layers; unknown terrain stays unavailable.
- `createPresentation`: owns rendering, interpolation, audio and HUD lifecycle.

`createPresentation({ stage, labels, hud, localPlayerId, config, rules, callbacks })`
returns `push({ snapshot, events }, now)`, `resize()`, `toggleOverview()` and
`dispose()`. Optional callbacks submit bomb, skill and character commands through
the production host's authority-only GAS publisher. Settings affect presentation.

Same-tick terrain frames update the scene without restarting interpolation.
Occurrences are deduplicated independently; the first baseline establishes an
event cursor without replaying retained effects. Owner-only cooldowns come from
the local replica, not room-wide occurrences. Public cast poses are keyed by the
exact participant, entity and life generation, including when respawn reuses an
entity. Kicked bombs interpolate replica transforms; the separate hop flag is
cosmetic. Committed kick and water occurrences drive their audio and particles.

## Verification

Run from this directory:

```text
npm ci
npm test
npm run guard
npm run build
```

The build emits `dist/presentation.js` and `dist/presentation.css`. The spectator
host includes these files in its WASM publish output. Browser visual fixtures are
rendering evidence only; they do not prove live gameplay or networking.

## Remaining Production Dependencies

All five character models and the prototype growth/supply visuals are present.
The activated formal configuration exposes all five characters, including the
bound flyKick. Dynamic maximum health and golden hearts use the replicated
player values. Supply and other missing formal states cannot be manufactured by
the adapter.

Chest positions come from the Engine's committed Section binding reader and
hit counts from the corresponding replicated chest entity. Missing or released
Sections leave counts hidden until their bindings are available; the projection
does not infer identities from voxel order or create a second position source.
Replicated resource tiers select the existing wood, iron and gold crate meshes;
these use the terrain renderer and leave the strong-chest visual pool separate.

Complete duration and periodic skill behavior still depends on released Engine
Effect support. Existing visual status fields and fixture effects are not proof
of those gameplay rules. M2 admission remains closed.
