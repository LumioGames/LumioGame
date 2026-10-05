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
  let suspended = true;
  let initialSelectionSubmitted = callbacks?.initialSelectionSubmitted === true;
  root.hidden = true;
  document.body.classList.add('presentation-mode');
  const evidence = window.__lumioPresentation = { status: 'loading', players: 0, frame: null };
  function suspend(reason) {
    suspended = true;
    selectionOpen = false;
    root.hidden = true;
    evidence.status = reason;
    evidence.players = 0;
    evidence.frame = null;
    evidence.events = 0;
    evidence.self = null;
    evidence.authorityTick = null;
  }
  return {
    update(frame, grid) {
      try {
        if (!frame.match || !frame.config || frame.tick === '0') { suspend('waiting-projection'); return; }
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
        const surface = terrain.read(grid, frame.chests);
        if (!surface) {
          root.classList.add('terrain-pending');
          suspend('loading-terrain');
          return;
        }
        root.classList.remove('terrain-pending');
        const snapshot = adapter.project(frame, surface);
        if (!snapshot) { suspend('waiting-projection'); return; }
        selectionOpen = (frame.match.phase === 0 || frame.match.phase === 1 || frame.match.phase === 5) &&
          Boolean(frame.selfId && frame.players?.some(player => player.id === frame.selfId)) &&
          settings.catalog.characters.size > 0;
        if (!view || localId !== adapter.localPlayerId) {
          view?.dispose();
          localId = adapter.localPlayerId;
          view = createPresentation({ stage, labels, hud, localPlayerId: localId,
            config: settings.config, rules: settings.rules,
            callbacks: { ...callbacks, inputReady: () => !suspended && (callbacks?.inputReady?.() ?? false), onChangeCharacter: settings.catalog.characters.size > 0 && callbacks.onChangeCharacter
              ? id => {
                if (!selectionOpen || callbacks.onChangeCharacter(id) === false) return false;
                initialSelectionSubmitted = true;
                return true;
              } : undefined } });
        }
        view.setSelectionWindow(selectionOpen, !initialSelectionSubmitted);
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
        suspended = false;
        root.hidden = false;
      } catch (error) {
        suspend('error');
        throw error;
      }
    },
    suspend,
    inputBlocked() { return suspended || (view?.inputBlocked() ?? false); },
    dispose() {
      suspend('closed');
      view?.dispose();
      document.body.classList.remove('presentation-mode');
    },
  };
}
