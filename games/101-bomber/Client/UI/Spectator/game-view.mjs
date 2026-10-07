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
  let disposed = false;
  let selfEntity = null;
  let localPose = null;
  let poseGeneration = null;
  let poseSessionGeneration = null;
  let poseLifetime = null;
  const retiredPoseGenerations = new Set();
  let presentationGeneration = 0;
  let initialSelectionSubmitted = callbacks?.initialSelectionSubmitted === true;
  root.hidden = true;
  document.body.classList.add('presentation-mode');
  const evidence = window.__lumioPresentation = { status: 'loading', players: 0, frame: null };
  function resetPose() {
    localPose = null;
    poseGeneration = null;
    poseSessionGeneration = null;
    retiredPoseGenerations.clear();
    evidence.ownerPose = null;
  }
  function readLocalPose(generation) {
    if (disposed || suspended || generation !== presentationGeneration) return null;
    if (callbacks.ownerPoseLifetime) {
      const lifetime = callbacks.ownerPoseLifetime();
      if (lifetime !== poseLifetime) resetPose();
      poseLifetime = lifetime;
      if (lifetime === null) return null;
    }
    const pose = callbacks.readOwnerPose();
    if (!pose) return localPose;
    if (!selfEntity || pose.entity !== selfEntity) { resetPose(); return null; }
    const connectionGeneration = BigInt(pose.connectionGeneration);
    const publicationSequence = BigInt(pose.publicationSequence);
    if (connectionGeneration <= 0n || publicationSequence <= 0n) { resetPose(); return null; }
    if (poseSessionGeneration !== pose.sessionGeneration) resetPose();
    if (retiredPoseGenerations.has(pose.connectionGeneration)) return localPose;
    if (poseGeneration !== pose.connectionGeneration) {
      if (poseGeneration !== null) retiredPoseGenerations.add(poseGeneration);
      localPose = null;
      poseGeneration = pose.connectionGeneration;
    }
    poseSessionGeneration = pose.sessionGeneration;
    if (localPose && publicationSequence < BigInt(localPose.publicationSequence)) return localPose;
    localPose = { ...pose, playerId: localId };
    evidence.ownerPose = pose;
    return localPose;
  }
  function suspend(reason) {
    suspended = true;
    resetPose();
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
      if (disposed) return;
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
          resetPose();
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
        if (selfEntity !== frame.selfId) resetPose();
        selfEntity = frame.selfId;
        selectionOpen = (frame.match.phase === 0 || frame.match.phase === 1 || frame.match.phase === 5) &&
          Boolean(frame.selfId && frame.players?.some(player => player.id === frame.selfId)) &&
          settings.catalog.characters.size > 0;
        if (!view || localId !== adapter.localPlayerId) {
          view?.dispose();
          localId = adapter.localPlayerId;
          resetPose();
          const generation = ++presentationGeneration;
          view = createPresentation({ stage, labels, hud, localPlayerId: localId,
            readLocalPose: callbacks?.readOwnerPose ? () => readLocalPose(generation) : undefined,
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
      disposed = true;
      presentationGeneration++;
      suspend('closed');
      view?.dispose();
      document.body.classList.remove('presentation-mode');
    },
  };
}
