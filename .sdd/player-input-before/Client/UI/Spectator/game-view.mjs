import { createPresentation, createReplicaAdapter, projectReplicaConfig, ReplicaTerrain } from './presentation/presentation.js';

export function createGameView(callbacks) {
  const root = document.getElementById('presentation');
  const stage = document.getElementById('game-stage');
  const labels = document.getElementById('game-labels');
  const hud = document.getElementById('game-hud');
  let identity = '';
  let adapter;
  let terrain;
  let settings;
  let view;
  let localId;
  let selectionOpen = false;
  root.hidden = false;
  document.body.classList.add('presentation-mode');
  const evidence = window.__lumioPresentation = { status: 'loading', players: 0, frame: null };
  return {
    update(frame, grid) {
      if (!frame.match || !frame.config) return;
      const key = `${frame.match.id}:${frame.match.matchId}`;
      if (identity !== key) {
        selectionOpen = false;
        view?.dispose();
        view = null;
        settings = projectReplicaConfig(frame.config);
        settings.rules.characters = Object.fromEntries(Object.entries(settings.rules.characters)
          .filter(([id]) => [...settings.catalog.characters.values()].includes(id)));
        adapter = createReplicaAdapter(settings.catalog);
        terrain = new ReplicaTerrain(frame.config.mapSize, frame.config.groundLayer,
          frame.config.obstacleLayer, frame.config.blocks);
        identity = key;
      }
      const surface = terrain.read(grid);
      if (!surface) {
        root.classList.add('terrain-pending');
        evidence.status = 'loading-terrain';
        return;
      }
      root.classList.remove('terrain-pending');
      const snapshot = adapter.project(frame, surface);
      if (!snapshot) return;
      selectionOpen = (frame.match.phase === 0 || frame.match.phase === 1 || frame.match.phase === 5) &&
        Boolean(frame.selfId && frame.players?.some(player => player.id === frame.selfId)) &&
        settings.catalog.characters.size > 0;
      if (!view || localId !== adapter.localPlayerId) {
        view?.dispose();
        localId = adapter.localPlayerId;
        view = createPresentation({ stage, labels, hud, localPlayerId: localId,
          config: settings.config, rules: settings.rules,
          callbacks: { ...callbacks, onChangeCharacter: settings.catalog.characters.size > 0 && callbacks.onChangeCharacter
            ? id => { if (selectionOpen) callbacks.onChangeCharacter(id); } : undefined } });
      }
      const changeButton = hud.querySelector('.hud-buttons [title="换角色"]');
      if (changeButton) changeButton.style.display = selectionOpen ? '' : 'none';
      const events = adapter.events(frame);
      view.push({ snapshot, events }, performance.now());
      evidence.status = 'active';
      evidence.players = snapshot.Players.length;
      evidence.frame = snapshot;
      evidence.events = events.length;
      evidence.self = localId;
      evidence.authorityTick = frame.tick;
      evidence.unpositionedChests = frame.unpositionedChests ?? [];
    },
    dispose() {
      selectionOpen = false;
      view?.dispose();
      evidence.status = 'closed';
      root.hidden = true;
      document.body.classList.remove('presentation-mode');
    },
  };
}
