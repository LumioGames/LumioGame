import { createReplicaVoxelGrid } from "./replica-voxel-grid.mjs";
import {
  unavailableVoxelGrid,
  blockStateOf,
  blockTypeOf,
  SURFACE_BLOCK,
  SURFACE_AIR,
} from "./voxel-grid.mjs";

const spectator = {
  status: "starting",
  botCount: 0,
  positions: [],
  updatedAtMs: 0,
  selfId: null,
  worldId: null,
  lastError: null,
  lastFrameType: null,
  // ADR-120: not_serving closes this page has seen. A healthy run (dial after DS_READY) keeps it at 0.
  notServingCloses: 0,
  // Voxel half of the view. `status` is the Rust wasm world's own state, never a
  // guess: "ready" once the module booted, otherwise why it could not.
  voxel: {
    status: "starting",
    error: null,
    abiVersion: 0,
    sections: 0,
    frames: 0,
    lastDelivery: null,
    cells: { block: 0, air: 0, loading: 0 },
    blockIds: [],
  },
};
window.__lumioSpectator = spectator;
const PLAYER_MODE = Boolean(window.__lumioPlayerConfig);
const player = { inputsSent: 0, movesSent: 0, bombsSent: 0, skillsSent: 0, selectionsSent: 0,
  bombIntentRefusalCount: 0, bombIntentStatusCode: 'accepted', lastInput: null, replica: null };
let playerInput;
let stepInputToken = null;
let stepInputReady = false;
let stepInputObserving = false;
// Movement experiments: 'interval' is the shipped held-input timer, 'pump' publishes inside the Session pump.
let inputDriver = 'interval';
let movementTrace = null;
let movementPreviewControls = null;
let resourceWitness = null;
let previewFinitePose = 'UNAVAILABLE';
let lastTraceCompleteness = 'UNAVAILABLE';
let selectedCharacter = null;
let initialSelectionPending = false;
let initialSelectionSent = false;
let selectionAbort = null;
const GAME_VIEW = (PLAYER_MODE || new URLSearchParams(location.search).get('view') === 'game')
  && new URLSearchParams(location.search).get('view') !== 'classic';
let gameView;
let gameViewLoading;
let gameViewGeneration = 0;
let gameViewOwnerGeneration = 0;
let currentSessionGeneration = null;
if (PLAYER_MODE) window.__lumioPlayer = player;

// Dimensions come from the same activated Bomber config as the C# replica.
let MAP = null;
let VIEW = null;

function configureMap(raw) {
  const dimensions = typeof raw === "string" ? JSON.parse(raw) : raw;
  const { width, depth } = dimensions ?? {};
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(depth) || depth <= 0)
    throw new Error("spectator_map_dimensions_invalid");
  MAP = { minX: 0, maxX: width, minZ: 0, maxZ: depth };
  VIEW = { minX: 0, maxX: width - 1, minY: 0, maxY: 15, minZ: 0, maxZ: depth - 1 };
  void openBlocksView();
}

const statusEl = document.getElementById("status");
const legendEl = document.getElementById("legend");
const canvas = document.getElementById("field");
const ctx = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;

// The formal Engine WASM instance owns the Session's world and read-only renderer.
let engineInvoke = null;
let displayedWorldHandle = "";
let displayedWorldId = null;
// The game's official block catalog v2, published next to the page from
// Server/Assets/Maps/official-catalog.json — the same bytes the DS world was created
// with. Wasm ABI 2 creates no world without it (ADR-124): the world validates every
// delivered BlockState against it and the block view's lighting / meshing read it.
const CATALOG_URL = "./official-catalog.json";
let catalogText = null;
const blockTextures = new Map();
let blockAssets = new Map();

function playerTexture(type) {
  if (blockTextures.has(type)) return blockTextures.get(type);
  const ref = blockAssets.get(type);
  blockTextures.set(type, null);
  if (!ref || !/^asset:\/\/blocks\/[a-z0-9._-]+$/.test(ref)) return null;
  const name = ref.slice('asset://blocks/'.length);
  void fetch(`./game-assets/Blocks/${name}.json`).then(response => {
    if (!response.ok) throw new Error('block_asset_unavailable');
    return response.json();
  }).then(asset => {
    const texture = asset.faces?.top ?? asset.faces?.all;
    if (!/^textures\/[a-z0-9_-]+\.png$/.test(texture)) return;
    const bitmap = new Image();
    bitmap.onload = () => { blockTextures.set(type, bitmap); paint(spectator.positions); };
    bitmap.src = `./game-assets/Blocks/${texture}`;
  }).catch(error => console.error('[lumio-player] texture', name, error.message));
  return null;
}

// `?view=blocks` adds the WebGL2 block view (ADR-124 C9): the same world drawn by the
// engine's block renderer, loaded on demand from ./blocks-view.mjs. The 2D top-down grid
// stays the default view.
const BLOCKS_VIEW = typeof location !== "undefined" && typeof location.search === "string"
  && new URLSearchParams(location.search).get("view") === "blocks";
let blocksView = null;
let blocksViewLoading = false;
let blocksViewAbort = null;
// Never null: between sessions the page holds a grid that answers "loading" for
// every column, so there is no state in which a cell could be painted as air
// because nothing was asked.
let voxelGrid = unavailableVoxelGrid("voxel_world_not_opened");

function setStatus(status, detail) {
  spectator.status = status;
  spectator.updatedAtMs = Date.now();
  if ((status === "failed" || status === "error") && detail) spectator.lastError = String(detail);
  if (statusEl) {
    statusEl.textContent = detail ? `${status}: ${detail}` : status;
    statusEl.hidden = GAME_VIEW && (status === 'active' || status === 'selecting');
  }
  const enter = document.getElementById('enter');
  if (enter && GAME_VIEW) enter.hidden = !['failed', 'closed', 'superseded'].includes(status);
}

function noteApplyFault(error) {
  const wasmError = typeof csharp.lastApplyError === "function" ? csharp.lastApplyError() : "";
  const message = error && error.message ? error.message : String(error ?? "bad_envelope");
  spectator.lastError = wasmError || message;
  console.error("[lumio-spectator] apply failed", spectator.lastFrameType, spectator.lastError);
}

// Block id -> colour. The downlink carries block ids, not names: the block
// catalog is a game asset the page never receives, so there is nothing to look a
// name up in, and writing one game's ids into this page would tie the engine
// spectator to that game. The hue is therefore derived from the id itself, which
// is stable (same id, same colour, in every window) and game-agnostic; the
// legend under the canvas lists every id actually on screen next to its swatch,
// so the mapping is readable instead of implied.
//
// The split is the voxel contract's own: `BlockType << 8 | BlockState`. The hue
// comes from the type, so every state of one block reads as the same material,
// and the state only shifts lightness. Air (BLOCK_TYPE_AIR) is not painted at
// all — the empty canvas plane is what "resolved, nothing here" looks like.
function blockFill(id) {
  const type = blockTypeOf(id);
  let hash = 2166136261;
  for (let shift = 0; shift < 24; shift += 8) {
    hash ^= (type >>> shift) & 0xff;
    hash = Math.imul(hash, 16777619);
  }
  // Muted: terrain sits underneath the 85%/55% entity dots and must not compete.
  const lightness = 26 + (blockStateOf(id) % 4) * 4;
  return `hsl(${(hash >>> 0) % 360}, 40%, ${lightness}%)`;
}

// A cell the Rust world answered Pending / Unavailable for. ADR-078: never
// painted as air. The inset mark makes "still loading" legible at the configured size.
const LOADING_FILL = "hsl(45, 22%, 18%)";
const LOADING_MARK = "hsl(45, 55%, 42%)";

function paintVoxelCells(camera) {
  const surface = voxelGrid.readSurface(VIEW);
  const evidence = spectator.voxel;
  evidence.cells = surface.counts;
  if (surface.error) evidence.error = surface.error;
  const seen = new Set();
  const { ox, oy, scale } = camera;
  // Cell (x, z) covers [x, x+1) x [z, z+1) in world units. Ceil the size so
  // neighbouring cells meet with no seam at fractional scales.
  const size = Math.ceil(scale);
  for (let z = 0; z < surface.depth; z += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      const i = z * surface.width + x;
      const state = surface.states[i];
      if (state === SURFACE_AIR) continue;
      const px = ox + (VIEW.minX + x - MAP.minX) * scale;
      const py = oy + (VIEW.minZ + z - MAP.minZ) * scale;
      if (state === SURFACE_BLOCK) {
        const id = surface.blockIds[i];
        seen.add(id);
        ctx.fillStyle = blockFill(id);
        ctx.fillRect(px, py, size, size);
        const texture = PLAYER_MODE ? playerTexture(blockTypeOf(id)) : null;
        if (texture) { ctx.imageSmoothingEnabled = false; ctx.drawImage(texture, px, py, size, size); }
        continue;
      }
      ctx.fillStyle = LOADING_FILL;
      ctx.fillRect(px, py, size, size);
      const inset = Math.max(1, Math.floor(scale / 3));
      ctx.fillStyle = LOADING_MARK;
      ctx.fillRect(px + inset, py + inset, Math.max(1, size - inset * 2), Math.max(1, size - inset * 2));
    }
  }

  evidence.blockIds = [...seen].sort((a, b) => a - b);
  renderLegend(evidence.blockIds, surface.counts.loading);
}

function renderLegend(blockIds, loadingCells) {
  if (!legendEl) return;
  const rows = blockIds.map(
    (id) => `<li><i style="background:${blockFill(id)}"></i>type ${blockTypeOf(id)} state ${blockStateOf(id)}</li>`,
  );
  if (loadingCells > 0) rows.push(`<li><i style="background:${LOADING_MARK}"></i>loading (${loadingCells} cells)</li>`);
  legendEl.innerHTML = rows.length ? `<ul>${rows.join("")}</ul>` : "";
}

function paint(positions) {
  spectator.positions = positions;
  spectator.botCount = positions.length;
  spectator.updatedAtMs = Date.now();
  const selfRow = positions.find((pos) => pos && (pos.self === true || pos.id === spectator.selfId));
  if (selfRow && typeof selfRow.id === "string") spectator.selfId = selfRow.id;
  // The formal GameView reads terrain from this same replica for its visible
  // scene. Its CSS-hidden classic canvas must not duplicate the managed read.
  if (GAME_VIEW || !ctx || !canvas) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (!MAP || !VIEW) return;
  const { minX, maxX, minZ, maxZ } = MAP;
  const pad = 24;
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const scale = Math.min(innerW / spanX, innerH / spanZ);
  const ox = pad + (innerW - spanX * scale) / 2;
  const oy = pad + (innerH - spanZ * scale) / 2;
  // Blocks first, entities on top: the voxel grid is the ground the dots stand on.
  paintVoxelCells({ ox, oy, scale });
  ctx.strokeStyle = "#333";
  ctx.strokeRect(ox, oy, spanX * scale, spanZ * scale);
  if (!positions.length) return;
  const others = [];
  const selves = [];
  for (const pos of positions) {
    if (pos && (pos.self === true || (spectator.selfId && pos.id === spectator.selfId))) selves.push(pos);
    else others.push(pos);
  }
  function drawDot(pos, color, radius, ring) {
    const x = Math.min(width - 2, Math.max(2, ox + (Number(pos.x) - minX) * scale));
    const y = Math.min(height - 2, Math.max(2, oy + (Number(pos.z) - minZ) * scale));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (ring) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.stroke();
    }
  }
  function drawPlayer(pos, self) {
    const x = ox + (Number(pos.x) - minX) * scale;
    const y = oy + (Number(pos.z) - minZ) * scale;
    const unit = scale / 16;
    const rect = (left, top, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + left * unit, y + top * unit, w * unit, h * unit);
    };
    const suit = self ? '#08c5d7' : '#df5975';
    rect(-5, -9, 10, 8, '#293438');
    rect(-4, -8, 8, 6, '#f8fcfc');
    rect(-3, -6, 6, 3, '#ffd49e');
    rect(-2, -5, 1, 2, '#293438');
    rect(1, -5, 1, 2, '#293438');
    rect(-4, -1, 8, 7, '#293438');
    rect(-3, -1, 6, 5, suit);
    rect(-6, 0, 2, 4, '#f8fcfc');
    rect(4, 0, 2, 4, '#f8fcfc');
    rect(-4, 5, 3, 3, '#293438');
    rect(1, 5, 3, 3, '#293438');
    if (self) {
      ctx.fillStyle = '#202628';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(window.__lumioPlayerConfig.label ?? 'You', x, y - scale * 0.7);
    }
  }
  // No replicated color field exists in the current Bomber declaration. Keep
  // visible entities neutral until the presentation contract supplies one.
  function entityColor(pos) {
    if (PLAYER_MODE) {
      if (pos.type === 'bomberBomb') return '#ffd34f';
      if (pos.self || pos.id === spectator.selfId) return '#14d9e3';
      return '#f6f7f9';
    }
    return "hsla(0, 0%, 65%, 0.75)";
  }
  // Every entity dot is the same 1x radius; the self dot is 1.5x so viewers
  // can pick themselves out of the crowd.
  const dotRadius = PLAYER_MODE ? scale * 0.24 : 5;
  for (const pos of others) {
    if (PLAYER_MODE && pos.type === 'player') { drawPlayer(pos, false); continue; }
    const radius = PLAYER_MODE && pos.type === 'bomberBomb' ? dotRadius * 1.9 : dotRadius;
    drawDot(pos, entityColor(pos), radius);
  }
  for (const pos of selves) {
    if (PLAYER_MODE && pos.type === 'player') drawPlayer(pos, true);
    else drawDot(pos, entityColor(pos), dotRadius * 1.5, true);
  }
}

function parseDump(raw) {
  if (raw == null || raw === "") return [];
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(parsed) ? parsed : [];
}

async function loadCatalog(signal) {
  if (catalogText !== null) return catalogText;
  const response = await fetch(CATALOG_URL, { signal });
  if (!response || response.ok === false) {
    throw new Error(`catalog_fetch_failed:${response ? response.status : "no_response"}`);
  }
  if (resourceWitness) await resourceWitness.verifyDataResponse(response, CATALOG_URL);
  catalogText = await response.text();
  if (PLAYER_MODE) blockAssets = new Map(JSON.parse(catalogText).rows.map(row => [row.blockType, row.assetRef]));
  return catalogText;
}

async function openBlocksView() {
  if (!BLOCKS_VIEW || !MAP || voxelGrid.status !== "ready" || blocksView || blocksViewLoading) return;
  const canvasEl = document.getElementById("blocks");
  if (!canvasEl) return;
  document.body.classList.add("blocks-view");
  const generation = gameViewGeneration;
  const ownerHandle = displayedWorldHandle;
  const abort = new AbortController();
  blocksViewAbort = abort;
  blocksViewLoading = true;
  try {
    const { createBlocksView } = await import("./blocks-view.mjs");
    if (generation !== gameViewGeneration) return;
    const view = await createBlocksView({
      grid: voxelGrid,
      catalogJson: catalogText,
      canvas: canvasEl,
      hud: document.getElementById("blocks-hud"),
      cameraBar: document.getElementById("blocks-cams"),
      assetRoot: new URL("./game-assets/", location.href).href,
      mapBounds: MAP,
      signal: abort.signal,
      isWorldAlive: () => Array.from(csharp.worldHandleBytes()).join(',') === ownerHandle,
    });
    if (generation !== gameViewGeneration) { view.destroy(); return; }
    blocksView = view;
  } catch (error) {
    if (abort.signal.aborted && error === abort.signal.reason) return;
    spectator.voxel.error = `blocks_view_failed:${error && error.message ? error.message : error}`;
    console.error("[lumio-spectator] block view failed", error);
  } finally {
    if (generation === gameViewGeneration) blocksViewLoading = false;
  }
}

function refreshVoxelWorld() {
  const handle = new Uint8Array(csharp.worldHandleBytes());
  const identity = Array.from(handle).join(',');
  if (handle.length === 0) {
    if (displayedWorldHandle || gameView || gameViewLoading) closeVoxelWorld();
    return;
  }
  if (handle.length !== 32 || !engineInvoke?.createVoxelPresentation) {
    closeVoxelWorld();
    throw new Error('formal_voxel_world_unavailable');
  }
  let worldId;
  try {
    const current = csharp.worldInstanceId?.();
    worldId = typeof current === 'string' && /^[0-9a-f]{16}$/i.test(current) && current !== '0000000000000000'
      ? current : null;
  } catch (error) {
    closeVoxelWorld();
    throw error;
  }
  if (worldId && identity === displayedWorldHandle && worldId === displayedWorldId) return;
  const keepGameView = Boolean(gameView && worldId && worldId === displayedWorldId);
  closeVoxelWorld(keepGameView);
  displayedWorldHandle = identity;
  displayedWorldId = worldId;
  spectator.worldId = worldId;
  voxelGrid = createReplicaVoxelGrid({ presentation: engineInvoke.createVoxelPresentation(handle),
    readBox: box => csharp.readBox(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ) });
  spectator.voxel.status = voxelGrid.status;
  spectator.voxel.error = null;
  spectator.voxel.abiVersion = voxelGrid.abiVersion;
  void openBlocksView();
}

function closeVoxelWorld(keepGameView = false) {
  blocksViewAbort?.abort();
  blocksViewAbort = null;
  displayedWorldHandle = "";
  displayedWorldId = null;
  spectator.worldId = null;
  gameViewGeneration += 1;
  if (keepGameView) {
    gameViewOwnerGeneration = gameViewGeneration;
    gameView.suspend('world-rebinding');
  }
  else {
    gameView?.dispose();
    gameView = null;
  }
  gameViewLoading = null;
  blocksViewLoading = false;
  if (blocksView) {
    blocksView.destroy();
    blocksView = null;
  }
  voxelGrid.destroy();
  voxelGrid = unavailableVoxelGrid("voxel_world_closed");
  spectator.voxel.status = "closed";
  spectator.voxel.sections = 0;
}

function applyDump(raw) {
  try {
    paint(parseDump(raw));
    if (PLAYER_MODE && csharp.playerState) {
      player.replica = JSON.parse(csharp.playerState());
      commitInitialSelection();
      const stateEl = document.getElementById('player-state');
      if (stateEl) stateEl.textContent = `${player.replica.phase ?? 'Joining'} | ${spectator.positions.filter(p => p.type === 'player').length}/8 players`;
      const self = spectator.positions.find(p => p.self);
      const selfEl = document.getElementById('player-self');
      if (selfEl) selfEl.textContent = self ? `${self.name ?? 'You'} | ${Number(self.x).toFixed(2)}, ${Number(self.z).toFixed(2)}` : 'Joining room';
      document.querySelectorAll('#player-controls button:not([data-movement-record]):not([data-movement-export]):not(#export-resource-witness)').forEach(button => {
        button.disabled = !active || !player.replica.inputOpen;
      });
    }
    if (GAME_VIEW && csharp.presentationState) updateGamePresentation();
    return true;
  } catch (error) {
    if (error.message === 'initial_character_admission_window_closed') throw error;
    setStatus("error", "dump failed");
    console.error("[lumio-spectator] dump failed", error);
    return false;
  }
}

function updateGamePresentation() {
  if (!gameView) {
    if (gameViewLoading) return;
    const generation = gameViewGeneration;
    gameViewLoading = import('./game-view.mjs').then(({ createGameView }) => {
      resourceWitness?.noteImport('./game-view.mjs');
      if (generation !== gameViewGeneration) return;
      const attempt = csharp.ownerPresentation ? connectionAttempt : null;
      if (csharp.ownerPresentation) gameViewOwnerGeneration = generation;
      let ownerView;
      const ownerPoseLifetime = csharp.ownerPresentation ? () =>
        !terminal && active && attempt === connectionAttempt && gameView === ownerView &&
        gameViewOwnerGeneration === gameViewGeneration && currentSessionGeneration !== null
          ? `${attempt}:${currentSessionGeneration}` : null : undefined;
      ownerView = createGameView(PLAYER_MODE ? {
        ownerPoseLifetime,
        readOwnerPose: csharp.ownerPresentation ? () => {
          if (ownerPoseLifetime() === null) return null;
          const pose = JSON.parse(csharp.ownerPresentation());
          return pose && pose.sessionGeneration === currentSessionGeneration ? pose : null;
        } : undefined,
        initialSelectionSubmitted: selectedCharacter !== null,
        inputReady: () => active && !initialSelectionPending && player.replica?.inputOpen === true,
        onMove: (primary, secondary) => {
          // Presentation direction order is still the approved prototype contract.
          const directions = [0, 1, 3, 4, 2];
          playerInput?.setTouchDirection(directions[primary], directions[secondary]);
        },
        onPlaceBomb: () => inputDriver === 'step'
          ? (playerInput?.setBombPressed(true, false, 'place'), playerInput?.setBombPressed(false, false, 'place'))
          : sendPlayerCommand('bomb', () => csharp.placeBomb()),
        onBombButton: (pressed, cancelled, surface) => playerInput?.setBombPressed(pressed, cancelled, surface),
        onUseSkill: () => inputDriver === 'step'
          ? (refreshStepInput() && csharp.latchSkillIntent())
          : sendPlayerCommand('skill', () => csharp.useActiveSkill()),
        onChangeCharacter: id => sendPlayerCommand('character', () => csharp.selectCharacter(id)),
        onFrame: globalThis.__lumioMovementTrace ? frame => {
          globalThis.__lumioMovementTrace.frame(frame);
          const local = frame.local;
          previewFinitePose = local ? [local.x, local.z, local.yaw].every(Number.isFinite) : 'UNAVAILABLE';
          movementPreviewControls?.refresh();
        } : undefined,
      } : {});
      gameView = ownerView;
      resourceWitness?.noteStage('Presentation-created');
      gameViewLoading = null;
      updateGamePresentation();
    }).catch(error => {
      if (generation !== gameViewGeneration) return;
      setStatus('failed', `presentation: ${error.message}`);
      console.error('[lumio-presentation]', error);
    });
    return;
  }
  gameView.update(JSON.parse(csharp.presentationState()), voxelGrid);
}

const csharp = { boot() {}, close() {}, tick() {}, sessionState() { return '{"state":"closed"}'; },
  connectionState() { return 'closed'; }, lastApplyError() { return ''; }, worldHandleBytes() { return []; },
  dumpPositions() { return '[]'; }, mapDimensions() { throw new Error('spectator_map_dimensions_missing'); } };
let developmentSession;

function utf8ByteLength(text) {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

function bindExports(api) {
  for (const name of ['ConfigureConfig', 'ConfigureInputMode', 'Boot', 'Close', 'Tick', 'TickRateHz', 'SessionState', 'WorldHandleBytes', 'ReadBox', 'DumpPositions', 'MapDimensions'])
    if (typeof api[name] !== 'function') throw new Error('SpectatorExports.' + name + ' missing');
  csharp.boot = (launch, catalog, loopback) => api.Boot(JSON.stringify(launch), catalog, loopback);
  csharp.configureConfig = value => api.ConfigureConfig(value);
  csharp.configureInputMode = (mode, trace) => api.ConfigureInputMode(mode, trace);
  csharp.close = () => api.Close();
  csharp.tick = () => developmentSession ? developmentSession.run(() => api.Tick(), 0) : api.Tick();
  csharp.tickRateHz = () => api.TickRateHz();
  csharp.sessionState = () => api.SessionState();
  csharp.connectionState = () => api.ConnectionState();
  csharp.lastApplyError = () => api.LastApplyError();
  csharp.worldHandleBytes = () => api.WorldHandleBytes();
  csharp.readBox = (...args) => api.ReadBox(...args);
  csharp.dumpPositions = () => api.DumpPositions();
  csharp.mapDimensions = () => api.MapDimensions();
  csharp.worldInstanceId = () => api.WorldInstanceId();
  csharp.presentationState = () => api.PresentationState();
  csharp.ownerPresentation = typeof api.OwnerPresentation === 'function' ? () => api.OwnerPresentation() : undefined;
  if (PLAYER_MODE && inputDriver === 'step' && movementTrace && typeof api.DrainInputTrace !== 'function')
    throw new Error('Player trace export missing: DrainInputTrace');
  csharp.drainInputTrace = typeof api.DrainInputTrace === 'function' ? () => api.DrainInputTrace() : undefined;
  if (PLAYER_MODE) {
      for (const name of ['SendMove', 'PlaceBomb', 'BombButton', 'UseActiveSkill', 'SelectCharacter', 'PlayerState', 'SelectionConfig'])
      if (typeof api[name] !== 'function') throw new Error('Player input export missing: ' + name);
    csharp.sendMove = (primary, secondary, turn) => api.SendMove(primary, secondary, turn);
    csharp.placeBomb = () => api.PlaceBomb();
    csharp.bombButton = phase => api.BombButton(phase);
    csharp.useActiveSkill = () => api.UseActiveSkill();
    csharp.selectCharacter = id => api.SelectCharacter(id);
    csharp.selectionConfig = () => api.SelectionConfig();
    csharp.playerState = () => api.PlayerState();
    if (inputDriver === 'step') {
      for (const name of ['SetMoveIntent', 'SetBombIntent', 'LatchSkillIntent', 'SetInputIntentEnabled',
        'ClearPlayerIntent', 'GetBombIntentRefusalCount', 'GetBombIntentStatusCode', 'GetInputIntentResetToken'])
        if (typeof api[name] !== 'function') throw new Error('Player step export missing: ' + name);
      csharp.setMoveIntent = (primary, secondary, turn) => api.SetMoveIntent(primary, secondary, turn);
      csharp.setBombIntent = phase => api.SetBombIntent(phase);
      csharp.latchSkillIntent = () => api.LatchSkillIntent();
      csharp.setInputIntentEnabled = enabled => api.SetInputIntentEnabled(enabled);
      csharp.clearPlayerIntent = () => api.ClearPlayerIntent();
      csharp.bombIntentRefusalCount = () => api.GetBombIntentRefusalCount();
      csharp.bombIntentStatusCode = () => api.GetBombIntentStatusCode();
      csharp.inputIntentResetToken = () => api.GetInputIntentResetToken();
    }
  }
}

let managedLoaded = false;
async function loadWasmExports() {
  if (managedLoaded) return true;
  const injected = window.__lumioExports;
  if (injected && typeof injected === "object") {
    if (resourceWitness) throw new Error('resource_witness_rejects_export_stub');
    engineInvoke = window.__lumioEngine;
    bindExports(injected);
    managedLoaded = true;
    setStatus("wasm-ready", "export stub");
    return true;
  }

  try {
    const { dotnet } = await import("./_framework/dotnet.js");
    resourceWitness?.noteImport('./_framework/dotnet.js');
    if (resourceWitness) engineInvoke = await resourceWitness.initializeNative(new URL('.', location.href));
    else {
      const { loadEngineWasm } = await import('./engine-wasm.mjs');
      engineInvoke = await loadEngineWasm(new URL('.', location.href));
    }
    const builder = resourceWitness ? dotnet.withResourceLoader(resourceWitness.loadBootResource) : dotnet;
    const { getAssemblyExports, getConfig, runMain, setModuleImports } = await builder.create();
    if (resourceWitness) { await resourceWitness.assertBootCoverage(); resourceWitness.noteStage('dotnet-created'); }
    setModuleImports('bomber-engine', { invoke: engineInvoke });
    setModuleImports('bomber-platform', { renewLaunch: async () => JSON.stringify(await launchFromPlatform()) });
    const config = getConfig();
    const exports = await getAssemblyExports(config.mainAssemblyName);
    await runMain();
    resourceWitness?.noteStage('runMain-completed');
    const api = exports?.Lumio?.Bomber?.Client?.Spectator?.SpectatorExports;
    if (!api || typeof api.DumpPositions !== "function" || typeof api.Tick !== "function") {
      setStatus("failed", "exports missing");
      console.error("[lumio-spectator] SpectatorExports missing after wasm boot");
      return false;
    }
    if (globalThis.__lumioDevelopment) {
      const { connectDevelopmentBridge } = await import('./dev-hot-reload.mjs');
      const config = await (await fetch('/dev/config')).json();
      const agentExports = await getAssemblyExports('Microsoft.DotNet.HotReload.WebAssembly.Browser');
      developmentSession = await connectDevelopmentBridge({ api, config,
        sdk: agentExports.Microsoft.DotNet.HotReload.WebAssembly.Browser.WebAssemblyHotReload });
    }
    bindExports(api);
    resourceWitness?.noteStage('real-exports-bound');
    managedLoaded = true;
    setStatus("wasm-ready");
    return true;
  } catch (error) {
    const fileProtocol = typeof location !== "undefined" && location.protocol === "file:";
    if (fileProtocol) {
      setStatus("static", "ES modules need a static server (file: cannot load _framework)");
      console.info("[lumio-spectator] file: protocol; serve this directory over http");
      return false;
    }
    setStatus("failed", "wasm runtime missing");
    console.error("[lumio-spectator] _framework failed", error && error.message ? error.message : error);
    return false;
  }
}

function readQuery() {
  const params = new URLSearchParams(location.search);
  return { ws: params.get("ws") };
}

// The Platform hosts every game page at /games/<slug>/ on its own origin
// (platform-port-v1 roleSemantics.game-page), and launch is POST /api/games/<slug>/launch.
// So the game this page belongs to is read off its own path, never written here:
// the same bundle launches whichever game the Platform serves it as. A path that
// is not /games/<slug>/ (or /games/<slug>/index.html) names no game, and the page
// says so instead of falling back to some default game.
const GAME_PATH = /^\/games\/([^/]+)\/(?:index\.html)?$/;
const GAME_SLUG = /^[A-Za-z0-9_-][A-Za-z0-9._~-]*$/;

function gameSlugFromPath(pathname) {
  const match = GAME_PATH.exec(typeof pathname === "string" ? pathname : "");
  if (!match) return null;
  let slug;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return GAME_SLUG.test(slug) ? slug : null;
}

function codedError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function requireGameSlug() {
  const pathname = typeof location !== "undefined" ? location.pathname : "";
  const slug = gameSlugFromPath(pathname);
  if (!slug) throw codedError("game_slug_unresolved", `page path ${JSON.stringify(pathname)} is not /games/<slug>/`);
  return slug;
}

// Plaintext ws: is allowed only to a loopback DS, and only when this page itself
// was loaded from loopback, i.e. a developer machine (local Platform compose, a
// static server next to a local DS, the node tests). A page served from any other
// origin gets wss: only. The decision is the page's origin, not a URL flag the
// viewer can type (R-00710 removed the unused `allowLoopback` query parameter).
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]", "::1"];

// Movement experiments and traces stay on loopback pages and the development bridge.
function readMovementFlags() {
  if (!pageAllowsLoopback() && !globalThis.__lumioDevelopment) return { inputDriver: 'interval', trace: false };
  const params = new URLSearchParams(location.search);
  const requested = params.get('input');
  return { inputDriver: requested === 'step' || requested === 'pump' ? requested : 'interval', trace: params.get('trace') === 'movement' };
}

function pageAllowsLoopback() {
  return typeof location !== "undefined" && LOOPBACK_HOSTS.includes(location.hostname);
}

function movementPreviewEnabled() {
  return (pageAllowsLoopback() || globalThis.__lumioDevelopment) &&
    new URLSearchParams(location.search).get('scene') === 'movement-sync-preview';
}

async function initializeResourceWitness() {
  if (!movementPreviewEnabled()) return;
  const bootstrap = globalThis.__lumioResourceBootstrap;
  if (!bootstrap) throw new Error('resource_witness_sealed_bootstrap_missing');
  const { createLoadedResourceWitness } = await import('./loaded-resource-witness.mjs');
  resourceWitness = createLoadedResourceWitness({ ...bootstrap, base: new URL('.', location.href).href });
  await resourceWitness.ready;
  resourceWitness.noteImport('./main.js');
  resourceWitness.noteImport('./loaded-resource-witness.mjs');
  resourceWitness.noteStyles(document);
  const button = document.getElementById('export-resource-witness');
  if (button) { button.hidden = false; resourceWitness.bindExport(button); }
}

// Local test mode, the one explicit entry that bypasses the Platform: whoever loads
// the page (node tests, a Playwright probe, a local harness) injects the launch as
// `window.__lumioLaunch` before main.js runs. It needs no /games/<slug>/ path; `?ws=`
// may then override only its address. Credentials never travel in the URL.
function launchFromInjected() {
  const launch = window.__lumioLaunch;
  if (!launch || typeof launch !== "object") return null;
  return launch;
}

function admittedRoomId(launch) {
  return typeof launch?.roomId === "string" ? launch.roomId : "";
}

async function launchFromPlatform(signal) {
  if (PLAYER_MODE) {
    const response = await fetch(window.__lumioPlayerConfig.launchEndpoint, {
      method: 'POST', headers: { 'X-Lumio-Player': '1' }, credentials: 'same-origin', signal,
    });
    if (!response.ok) throw new Error('player_launch_failed');
    return response.json();
  }
  // Resolve the game before any Platform round trip: no path, no request.
  const slug = requireGameSlug();
  const account = await fetch("/api/account/me", { credentials: "same-origin", signal });
  if (!account.ok) throw new Error("login_required");
  const csrf = account.headers.get("X-CSRF-Token");
  if (!csrf) throw new Error("launch_failed");
  const response = await fetch(`/api/games/${encodeURIComponent(slug)}/launch`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-CSRF-Token": csrf },
    signal,
  });
  if (!response.ok) throw new Error("launch_failed");
  const body = await response.json();
  if (!body || typeof body !== "object") throw new Error("launch_failed");
  if (typeof body.wsUrl !== "string" || typeof body.admissionCredential !== "string") {
    throw new Error("launch_failed");
  }
  return {
    wsUrl: body.wsUrl,
    subprotocol: body.subprotocol,
    admissionCredential: body.admissionCredential,
    roomId: body.roomId,
  };
}

let connectionAttempt = 0;
let runtimeClosed = true;
let terminal = false;
let active = false;
let pumpTimer = null;
let nextPumpAt = 0;
let closing = Promise.resolve();
let closePending = false;
let booting = Promise.resolve();
let launchAbort = null;

function releaseReplica() {
  movementPreviewControls?.invalidate();
  playerInput?.clear();
  stepInputToken = null;
  stepInputReady = false;
  player.replica = null;
  closeVoxelWorld();
  active = false;
  spectator.selfId = spectator.worldId = null;
  paint([]);
  if (!runtimeClosed && !closePending) {
    closePending = true;
    // The managed exports own one static Session. Finish its Boot before Close,
    // and keep the owner retryable when cleanup still retains resources.
    closing = booting.then(() => csharp.close(), () => csharp.close())
      .then(() => { runtimeClosed = true; drainManagedTrace(null); })
      .finally(() => { closePending = false; });
  }
  return closing;
}

async function finish(status) {
  terminal = true;
  connectionAttempt++;
  selectionAbort?.abort();
  selectionAbort = null;
  launchAbort?.abort();
  launchAbort = null;
  if (pumpTimer !== null) { clearTimeout(pumpTimer); pumpTimer = null; }
  setStatus(status);
  await releaseReplica();
}

function failLaunch(error) {
  spectator.lastError = error?.code ?? error?.message ?? 'launch_failed';
  void finish('failed').catch(error => console.error('[lumio-session] close failed', error));
  setStatus('failed', spectator.lastError);
  console.error('[lumio-session]', spectator.lastError);
}

function drainManagedTrace(pumpBracket) {
  if (!movementTrace || !csharp.drainInputTrace) return;
  try {
    const batches = JSON.parse(csharp.drainInputTrace());
    if (!Array.isArray(batches)) throw new Error('managed_trace_batches_invalid');
    for (const batch of batches) {
      if (!batch || typeof batch !== 'object' || !Array.isArray(batch.events))
        throw new Error('managed_trace_batch_invalid');
      movementTrace.managed(batch, pumpBracket);
    }
  } catch (error) {
    try { movementTrace.diagnosticFailure?.('managed-drain'); }
    catch { /* Diagnostics must not fail the Session pump. */ }
    try { movementTrace.note(`managed trace drain failed: ${String(error?.message ?? error)}`); }
    catch { /* Diagnostics must not fail the Session pump. */ }
  }
}

function exportMovementTrace() {
  drainManagedTrace(null);
  const exportedTrace = movementTrace.export();
  lastTraceCompleteness = !exportedTrace.truncated && exportedTrace.diagnosticFailures === 0;
  const blob = new Blob([JSON.stringify(exportedTrace)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `lumio-movement-trace-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function refreshStepInput() {
  if (inputDriver !== 'step' || !PLAYER_MODE || !managedLoaded || runtimeClosed) return false;
  if (stepInputObserving) return stepInputReady;
  stepInputObserving = true;
  try {
    const token = csharp.inputIntentResetToken();
    const panel = document.getElementById('player-controls');
    const focusedElement = document.activeElement;
    const focusBlocked = focusedElement?.closest?.('button,a,input,textarea,select,[contenteditable],[role="dialog"],[role="button"]')
      && !panel?.contains?.(focusedElement);
    const ready = active && !terminal && !initialSelectionPending && player.replica?.inputOpen === true &&
      !gameView?.inputBlocked() && !document.hidden && document.hasFocus?.() !== false && !focusBlocked;
    const changed = stepInputToken !== null && token !== stepInputToken;
    const disabled = stepInputReady && !ready;
    stepInputToken = token;
    stepInputReady = Boolean(ready);
    if (changed || disabled) playerInput?.clear();
    csharp.setInputIntentEnabled(stepInputReady);
    return stepInputReady;
  } finally { stepInputObserving = false; }
}

function pumpSession(attempt) {
  if (terminal || attempt !== connectionAttempt) return;
  try {
    const pumpStartedAt = performance.now();
    if (inputDriver === 'pump') playerInput?.pump();
    if (inputDriver === 'step') refreshStepInput();
    const tickStartedAt = performance.now();
    csharp.tick();
    const tickEndedAt = performance.now();
    const tickMs = tickEndedAt - tickStartedAt;
    drainManagedTrace({ startedAt: tickStartedAt, endedAt: tickEndedAt });
    // Trace only: the owner publication this Tick left behind (executed step, not render sampling).
    const tracedPose = movementTrace && csharp.ownerPresentation ? JSON.parse(csharp.ownerPresentation()) : null;
    const state = JSON.parse(csharp.sessionState());
    currentSessionGeneration = state.generation ?? null;
    spectator.notServingCloses = state.notServingCloses ?? 0;
    player.inputsSent = state.sentInputs ?? 0;
    if (inputDriver === 'step') {
      player.bombIntentRefusalCount = csharp.bombIntentRefusalCount();
      player.bombIntentStatusCode = csharp.bombIntentStatusCode();
    }
    active = state.state === 'active';
    if (['faulted', 'closed', 'superseded'].includes(state.state)) {
      spectator.lastError = state.lastError || '';
      void finish(state.state === 'faulted' ? 'failed' : state.state).catch(error => console.error('[lumio-session] close failed', error));
      return;
    }
    refreshVoxelWorld();
    let displayed = true;
    if (displayedWorldHandle) {
      configureMap(csharp.mapDimensions());
      displayed = applyDump(csharp.dumpPositions());
    } else paint([]);
    spectator.selfId = spectator.positions.find(position => position.self)?.id ?? null;
    spectator.voxel.sections = voxelGrid.sections().length;
    if (inputDriver === 'step') refreshStepInput();
    if (displayed) setStatus(state.state);
    movementTrace?.pump({ startedAt: pumpStartedAt, tickAt: tickStartedAt, tickMs,
      totalMs: performance.now() - pumpStartedAt, state: state.state, pose: tracedPose });
    movementPreviewControls?.refresh();
    if (resourceWitness?.status().complete) resourceWitness.noteStage('required-import-completed');
    if (resourceWitness && state.state === 'active') resourceWitness.noteStage('real-session-admitted');
    const period = 1000 / csharp.tickRateHz();
    const now = performance.now();
    nextPumpAt += period;
    if (nextPumpAt <= now) nextPumpAt = now;
    pumpTimer = setTimeout(() => pumpSession(attempt), nextPumpAt - now);
  } catch (error) {
    noteApplyFault(error);
    failLaunch(error);
  }
}

async function obtainLaunch(query, signal) {
  if (PLAYER_MODE) return launchFromPlatform(signal);
  const injected = launchFromInjected();
  if (injected) {
    if (query.ws) {
      return {
        wsUrl: query.ws,
        subprotocol: injected.subprotocol,
        admissionCredential: injected.admissionCredential,
        roomId: injected.roomId,
      };
    }
    return injected;
  }
  if (query.ws) {
    throw new Error("launch required (inject window.__lumioLaunch; do not put credentials in the URL)");
  }
  // Platform mode: the game comes from this page's /games/<slug>/ path.
  return launchFromPlatform(signal);
}

let selectedConfigLoaded = false;
async function loadSelectedConfig(signal) {
  if (selectedConfigLoaded) return;
  const response = await fetch('/api/game/config', { signal, cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('selected_client_config_unavailable');
  if (resourceWitness) await resourceWitness.verifyDataResponse(response, '/api/game/config');
  const bundle = await response.text();
  signal.throwIfAborted();
  csharp.configureConfig(bundle);
  selectedConfigLoaded = true;
}

async function start() {
  const cleanup = finish('closed');
  const attempt = connectionAttempt;
  try {
    await cleanup;
    if (attempt !== connectionAttempt) return;
    terminal = false;
    active = false;
    setStatus('starting');
    paint([]);
    if (!await loadWasmExports() || terminal || attempt !== connectionAttempt) return;
    if (PLAYER_MODE) csharp.configureInputMode(inputDriver, Boolean(movementTrace));
    const abort = new AbortController();
    launchAbort = abort;
    await loadSelectedConfig(abort.signal);
    if (terminal || attempt !== connectionAttempt) return;
    if (PLAYER_MODE && selectedCharacter === null) {
      const choice = await chooseFirstCharacter();
      if (terminal || attempt !== connectionAttempt) return;
      selectedCharacter = choice;
    }
    if (terminal || attempt !== connectionAttempt) return;
    initialSelectionPending = PLAYER_MODE && selectedCharacter !== null;
    initialSelectionSent = false;
    const launch = await obtainLaunch(readQuery(), abort.signal);
    const catalog = new TextEncoder().encode(await loadCatalog(abort.signal));
    if (terminal || attempt !== connectionAttempt) return;
    launchAbort = null;
    runtimeClosed = false;
    booting = Promise.resolve().then(() => csharp.boot(launch, catalog, pageAllowsLoopback()));
    await booting;
    if (terminal || attempt !== connectionAttempt) return;
    nextPumpAt = performance.now();
    pumpSession(attempt);
  } catch (error) { if (attempt === connectionAttempt) failLaunch(error); }
}

async function chooseFirstCharacter() {
  const abort = new AbortController();
  selectionAbort = abort;
  const { chooseEntryCharacter } = await import('./presentation/presentation.js');
  resourceWitness?.noteImport('./presentation/presentation.js');
  abort.signal.throwIfAborted();
  const root = document.getElementById('presentation');
  root.hidden = false;
  document.body.classList.add('presentation-mode');
  setStatus('selecting');
  try {
    return await chooseEntryCharacter(document.getElementById('game-hud'), JSON.parse(csharp.selectionConfig()), abort.signal);
  } finally {
    if (selectionAbort === abort) selectionAbort = null;
  }
}

function commitInitialSelection() {
  if (!initialSelectionPending) return;
  if (player.replica?.characterName) {
    // An already-bound reconnect keeps the server's current character.
    selectedCharacter = player.replica.characterName;
    initialSelectionPending = false;
    return;
  }
  if (!player.replica?.inputEnabled || !player.replica?.selfId) return;
  if (!['WaitingForWorldReady', 'Warmup'].includes(player.replica.phase))
    throw new Error('initial_character_admission_window_closed');
  if (initialSelectionSent) return;
  initialSelectionSent = sendPlayerCommand('character', () => csharp.selectCharacter(selectedCharacter));
}

function sendPlayerCommand(kind, publishRequest) {
  if (!PLAYER_MODE || !active) return false;
  if (kind === 'character') {
    if (!['WaitingForWorldReady', 'Warmup', 'Results'].includes(player.replica?.phase)
      || !player.replica?.inputEnabled || !player.replica?.selfId) return false;
  } else if (initialSelectionPending || !player.replica?.inputOpen || gameView?.inputBlocked()) return false;
  try {
    const accepted = publishRequest() === true;
    if (accepted) {
      if (kind === 'move') player.movesSent++;
      else if (kind === 'bomb') player.bombsSent++;
      else if (kind === 'skill') player.skillsSent++;
      else if (kind === 'character') player.selectionsSent++;
    }
    player.lastInput = { kind, count: accepted ? 1 : 0, at: Date.now() };
    return accepted;
  } catch (error) {
    playerInput?.clear();
    spectator.lastError = String(error.message ?? error);
    setStatus('error', spectator.lastError);
    return false;
  }
}

async function initializePage() {
  await initializeResourceWitness();
  if (PLAYER_MODE) {
    document.body.classList.add('player-page');
    const label = window.__lumioPlayerConfig.label;
    const title = label ? `Lumio Bomber | ${label}` : 'Lumio Bomber';
    document.title = title;
    document.querySelector('h1').textContent = title;
    document.getElementById('player-controls').hidden = false;
    document.getElementById('player-info').hidden = false;
    document.getElementById('enter').textContent = 'Reconnect';
    canvas.width = canvas.height = 760;
    const flags = readMovementFlags();
    inputDriver = flags.inputDriver;
    if (flags.trace || movementPreviewEnabled()) {
      const { createMovementTrace, observeLongTasks } = await import('./movement-trace.mjs');
      resourceWitness?.noteImport('./movement-trace.mjs');
      movementTrace = createMovementTrace();
      movementTrace.note(`input=${inputDriver}`);
      window.__lumioMovementTrace = movementTrace;
      observeLongTasks(movementTrace);
      resourceWitness?.noteStage('trace-created');
      const exportButton = document.getElementById('export-movement-trace');
      if (exportButton) { exportButton.hidden = false; exportButton.addEventListener('click', exportMovementTrace); }
      for (const type of ['keydown', 'keyup'])
        window.addEventListener(type, event => movementTrace.key(type, event.code, event.repeat), { capture: true });
    }
    const { createPlayerInput } = inputDriver === 'step'
      ? await import('./player-intent-controls.mjs').then(({ createPlayerIntentControls }) => ({ createPlayerInput: createPlayerIntentControls }))
      : await import('./player-controls.mjs');
    resourceWitness?.noteImport(inputDriver === 'step' ? './player-intent-controls.mjs' : './player-controls.mjs');
    playerInput = createPlayerInput(inputDriver === 'step' ? {
      panel: document.getElementById('player-controls'),
      ready: () => refreshStepInput(),
      setMoveIntent: (primary, secondary, turn) => {
        csharp.setMoveIntent(primary, secondary, turn);
        try { movementTrace?.moveIntent(primary, secondary, turn); }
        catch { try { movementTrace?.diagnosticFailure('move-intent-record'); } catch { /* Diagnostic only. */ } }
      },
      setBombIntent: phase => {
        if (!managedLoaded || runtimeClosed) return 'accepted';
        const code = csharp.setBombIntent(({ begin: 1, end: 3, cancel: 4 })[phase]);
        if (code === 'player_bomb_intent_capacity') setStatus('error', '放弹操作太快，请松开后重试。');
        return code;
      },
      latchSkillIntent: () => csharp.latchSkillIntent(),
      clearIntent: () => { if (managedLoaded && !runtimeClosed) {
        movementPreviewControls?.invalidate();
        csharp.clearPlayerIntent();
        try { movementTrace?.intentReset(); }
        catch { try { movementTrace?.diagnosticFailure('intent-reset-record'); } catch { /* Diagnostic only. */ } }
      } },
    } : {
      driver: inputDriver,
      panel: document.getElementById('player-controls'),
      ready: () => active && !initialSelectionPending && player.replica?.inputOpen === true && !gameView?.inputBlocked(),
      sendMove: (primary, secondary, turn) => {
        const accepted = sendPlayerCommand('move', () => csharp.sendMove(primary, secondary, turn));
        movementTrace?.input('move', accepted, [primary, secondary, turn]);
        return accepted;
      },
      placeBomb: () => sendPlayerCommand('bomb', () => csharp.placeBomb()),
      bombButton: phase => sendPlayerCommand('bomb', () => csharp.bombButton(({ begin: 1, held: 2, end: 3, cancel: 4 })[phase])),
      useSkill: () => sendPlayerCommand('skill', () => csharp.useActiveSkill()),
    });
    resourceWitness?.noteStage('controls-created');
    if (movementPreviewEnabled()) {
      const { createMovementPreviewControls } = await import('./movement-preview-controls.mjs');
      resourceWitness?.noteImport('./movement-preview-controls.mjs');
      const panel = document.getElementById('movement-preview-controls');
      panel.hidden = false;
      movementPreviewControls = createMovementPreviewControls({ panel, input: playerInput,
        state: () => {
          const identity=resourceWitness?.status();
          const focused = document.activeElement;
          const focusBlocked = focused?.closest?.('button,a,input,textarea,select,[contenteditable],[role="dialog"],[role="button"]') &&
            !document.getElementById('player-controls')?.contains?.(focused);
          return { ready: inputDriver === 'step' ? refreshStepInput() :
          active && !terminal && !initialSelectionPending && player.replica?.inputOpen === true && !gameView?.inputBlocked() &&
          !document.hidden && document.hasFocus?.() !== false && !focusBlocked,
          resetToken: stepInputToken, inputMode: inputDriver, composition: '2 humans + 6 official Bot Hosts (admission UNVERIFIED)',
          version: `Game ${identity?.sourceHead ?? 'UNAVAILABLE'} / SDK ${identity?.sdkVersion ?? 'UNAVAILABLE'}`,
          identity: identity ? `${identity.arm}/${identity.pageRunId}` : 'UNAVAILABLE',
          complete: identity?.complete ?? false, finitePose: previewFinitePose,
          traceComplete:lastTraceCompleteness,inputsSent:player.inputsSent };
        },
        trace: () => movementTrace, exportTrace: exportMovementTrace });
      const originalClear = playerInput.clear;
      playerInput.clear = () => { movementPreviewControls.invalidate(); return originalClear(); };
      window.addEventListener('pagehide', () => movementPreviewControls.destroy(), {once:true});
    }
  }
  document.getElementById('enter')?.addEventListener('click', () => { void start(); });
  await start();
}
void initializePage().catch(failLaunch);
