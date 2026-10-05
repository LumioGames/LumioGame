import { connectDs } from "./connect-ds.mjs";
import { DS_CLOSE_CODES } from "./ds-close-codes.mjs";
import { NOT_SERVING_RETRY } from "./not-serving-retry.mjs";
import {
  openVoxelGrid,
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
const player = { inputsSent: 0, movesSent: 0, bombsSent: 0, skillsSent: 0, selectionsSent: 0, lastInput: null, replica: null };
let playerInput;
const GAME_VIEW = (PLAYER_MODE || new URLSearchParams(location.search).get('view') === 'game')
  && new URLSearchParams(location.search).get('view') !== 'classic';
let gameView;
let gameViewLoading;
let gameViewGeneration = 0;
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
}

const statusEl = document.getElementById("status");
const legendEl = document.getElementById("legend");
const canvas = document.getElementById("field");
const ctx = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;

// The VoxelEngine wasm32 module, published next to this page. Its world is the
// only place Section data exists in this tab (ADR-078 决策 1 / 决策 3).
const VOXEL_WASM_URL = "./lumio_voxel_wasm.wasm";
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
    statusEl.hidden = GAME_VIEW && status === 'active';
  }
}

function frameTypeOf(text) {
  if (typeof text !== "string") return typeof text;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed.messageType === "string" ? parsed.messageType : "json";
  } catch {
    return "unparsed";
  }
}

function noteApplyFault(error, frame) {
  spectator.lastFrameType = frameTypeOf(frame);
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
  if (!ctx || !canvas) return;
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

// Move every SectionFrame the C# host lifted off the wire into the Rust voxel
// world. JS only carries the bytes across the two linear memories: it never
// looks inside the payload, never caches a Section and never derives a cell
// from one. Returns how many frames moved, so the caller knows to repaint.
function drainSectionFrames() {
  let drained = 0;
  // The host caps its own queue, so this is a defence against a stuck peek, not
  // a throttle.
  for (let guard = 0; guard < 256; guard += 1) {
    let header;
    try {
      header = csharp.peekSectionHeader();
    } catch (error) {
      spectator.voxel.error = `section_peek_failed:${error && error.message ? error.message : error}`;
      return drained;
    }
    if (!header) return drained;
    const bytes = csharp.takeSectionBytes();
    drained += 1;
    spectator.voxel.frames += 1;
    try {
      const envelope = JSON.parse(header);
      const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const digest = view.subarray(0, envelope.digestBytes);
      const payload = view.subarray(envelope.digestBytes);
      const outcome = voxelGrid.deliver(envelope, digest, payload);
      if (outcome.ok) {
        spectator.voxel.lastDelivery = {
          sectionKey: envelope.sectionKey,
          sectionRevision: outcome.result.sectionRevision,
          worldRevision: outcome.result.worldRevision,
        };
        spectator.voxel.sections = voxelGrid.sections().length;
        spectator.voxel.error = null;
      } else {
        // The Rust world refused it. Say so; the cells it would have filled keep
        // painting loading.
        spectator.voxel.error = outcome.error;
        console.error("[lumio-spectator] section refused", envelope.sectionKey, outcome.error);
      }
    } catch (error) {
      spectator.voxel.error = `section_deliver_failed:${error && error.message ? error.message : error}`;
      console.error("[lumio-spectator] section deliver failed", error);
    }
  }

  return drained;
}

async function loadCatalog() {
  if (catalogText !== null) return catalogText;
  const response = await fetch(CATALOG_URL);
  if (!response || response.ok === false) {
    throw new Error(`catalog_fetch_failed:${response ? response.status : "no_response"}`);
  }
  catalogText = await response.text();
  if (PLAYER_MODE) blockAssets = new Map(JSON.parse(catalogText).rows.map(row => [row.blockType, row.assetRef]));
  return catalogText;
}

async function openBlocksView() {
  if (!BLOCKS_VIEW || !MAP || voxelGrid.status !== "ready" || blocksView) return;
  const canvasEl = document.getElementById("blocks");
  if (!canvasEl) return;
  document.body.classList.add("blocks-view");
  try {
    const { createBlocksView } = await import("./blocks-view.mjs");
    blocksView = await createBlocksView({
      grid: voxelGrid,
      catalogJson: catalogText,
      canvas: canvasEl,
      hud: document.getElementById("blocks-hud"),
      cameraBar: document.getElementById("blocks-cams"),
      assetRoot: new URL("./game-assets/", location.href).href,
      mapBounds: MAP,
    });
  } catch (error) {
    spectator.voxel.error = `blocks_view_failed:${error && error.message ? error.message : error}`;
    console.error("[lumio-spectator] block view failed", error);
  }
}

async function openVoxelWorld() {
  closeVoxelWorld();
  let catalogJson = null;
  try {
    catalogJson = await loadCatalog();
  } catch (error) {
    // No catalog, no world: the grid below opens unavailable and every cell paints loading.
    console.error("[lumio-spectator] block catalog unavailable", error && error.message ? error.message : error);
  }
  voxelGrid = catalogJson === null
    ? unavailableVoxelGrid("catalog_unavailable")
    : await openVoxelGrid({ wasmUrl: VOXEL_WASM_URL, catalogJson });
  spectator.voxel.status = voxelGrid.status;
  spectator.voxel.error = voxelGrid.error;
  spectator.voxel.abiVersion = voxelGrid.abiVersion;
  spectator.voxel.sections = 0;
  spectator.voxel.frames = 0;
  spectator.voxel.lastDelivery = null;
  if (voxelGrid.status !== "ready") {
    console.error("[lumio-spectator] voxel world unavailable", voxelGrid.error);
  }
  // Show the grid (all loading at this point) without waiting for the first
  // frame, so the page states what it knows as soon as it knows it.
  paint(spectator.positions);
  await openBlocksView();
}

function closeVoxelWorld() {
  gameViewGeneration += 1;
  gameView?.dispose();
  gameView = null;
  gameViewLoading = null;
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
    // World identity from the server Welcome: a stable frame key for probes,
    // unaffected by entities joining or bots reconnecting mid-observation.
    if (csharp.worldInstanceId) {
      const worldId = csharp.worldInstanceId();
      if (worldId) spectator.worldId = worldId;
    }
    paint(parseDump(raw));
    if (GAME_VIEW && csharp.presentationState) updateGamePresentation();
    if (PLAYER_MODE && csharp.playerState) {
      player.replica = JSON.parse(csharp.playerState());
      const stateEl = document.getElementById('player-state');
      if (stateEl) stateEl.textContent = `${player.replica.phase ?? 'Joining'} | ${spectator.positions.filter(p => p.type === 'player').length}/8 players`;
      const self = spectator.positions.find(p => p.self);
      const selfEl = document.getElementById('player-self');
      if (selfEl) selfEl.textContent = self ? `${self.name ?? 'You'} | ${Number(self.x).toFixed(2)}, ${Number(self.z).toFixed(2)}` : 'Joining room';
      document.querySelectorAll('#player-controls button').forEach(button => {
        button.disabled = !active || !player.replica.inputOpen;
      });
    }
  } catch (error) {
    setStatus("error", "dump failed");
    console.error("[lumio-spectator] dump failed", error);
  }
}

function updateGamePresentation() {
  if (!gameView) {
    if (gameViewLoading) return;
    const generation = gameViewGeneration;
    gameViewLoading = import('./game-view.mjs').then(({ createGameView }) => {
      if (generation !== gameViewGeneration) return;
      gameView = createGameView(PLAYER_MODE ? {
        onPlaceBomb: () => sendPlayerCommand('bomb', () => csharp.placeBomb()),
        onUseSkill: () => sendPlayerCommand('skill', () => csharp.useActiveSkill()),
        onChangeCharacter: id => sendPlayerCommand('character', () => csharp.selectCharacter(id)),
      } : {});
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

const csharp = {
  boot() {},
  close() {},
  connectionState() { return "synchronizing"; },
  lastApplyError() { return ""; },
  onBytes() {
    return "[]";
  },
  onFrame() {
    return "[]";
  },
  dumpPositions() {
    return "[]";
  },
  mapDimensions() { throw new Error("spectator_map_dimensions_missing"); },
  peekSectionHeader() {
    return "";
  },
  takeSectionBytes() {
    return new Uint8Array(0);
  },
};
let developmentSession;

function utf8ByteLength(text) {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

function bindExports(api) {
  csharp.boot = (admittedRoomId) => api.Boot(admittedRoomId);
  csharp.close = typeof api.Close === "function" ? () => api.Close() : () => {};
  csharp.connectionState = typeof api.ConnectionState === "function" ? () => api.ConnectionState() : () => "synchronizing";
  csharp.lastApplyError = typeof api.LastApplyError === "function" ? () => api.LastApplyError() : () => "";
  csharp.onBytes = (bytes) => developmentSession ? developmentSession.run(() => api.OnBytes(bytes), bytes.byteLength) : api.OnBytes(bytes);
  csharp.onFrame = (text) => developmentSession ? developmentSession.run(() => api.OnFrame(text), utf8ByteLength(text)) : api.OnFrame(text);
  csharp.dumpPositions = () => api.DumpPositions();
  if (typeof api.PresentationState === 'function') csharp.presentationState = () => api.PresentationState();
  if (typeof api.MapDimensions !== "function") throw new Error("SpectatorExports.MapDimensions missing");
  csharp.mapDimensions = () => api.MapDimensions();
  if (typeof api.PeekSectionHeader === "function") csharp.peekSectionHeader = () => api.PeekSectionHeader();
  if (typeof api.TakeSectionBytes === "function") csharp.takeSectionBytes = () => api.TakeSectionBytes();
  if (typeof api.WorldInstanceId === "function") csharp.worldInstanceId = () => api.WorldInstanceId();
  if (PLAYER_MODE) {
    if (typeof api.SendMove !== 'function' || typeof api.PlaceBomb !== 'function'
      || typeof api.UseActiveSkill !== 'function' || typeof api.SelectCharacter !== 'function'
      || typeof api.PlayerState !== 'function')
      throw new Error('Player input exports missing');
    csharp.sendMove = (primary, secondary, turn) => api.SendMove(primary, secondary, turn);
    csharp.placeBomb = () => api.PlaceBomb();
    csharp.useActiveSkill = () => api.UseActiveSkill();
    csharp.selectCharacter = id => api.SelectCharacter(id);
    csharp.playerState = () => api.PlayerState();
  }
}

async function loadWasmExports() {
  const injected = window.__lumioExports;
  if (injected && typeof injected === "object") {
    bindExports(injected);
    setStatus("wasm-ready", "export stub");
    return true;
  }

  try {
    const { dotnet } = await import("./_framework/dotnet.js");
    const { getAssemblyExports, getConfig, runMain } = await dotnet.create();
    const config = getConfig();
    const exports = await getAssemblyExports(config.mainAssemblyName);
    await runMain();
    const api = exports?.Lumio?.Bomber?.Client?.Spectator?.SpectatorExports;
    if (!api || typeof api.DumpPositions !== "function" || typeof api.OnFrame !== "function") {
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

function pageAllowsLoopback() {
  return typeof location !== "undefined" && LOOPBACK_HOSTS.includes(location.hostname);
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
    subprotocol: typeof body.subprotocol === "string" ? body.subprotocol : "lumio.mvp.v0",
    admissionCredential: body.admissionCredential,
    roomId: body.roomId,
  };
}

function noteSelfFromWelcome(text) {
  if (typeof text !== "string" || text.indexOf('"messageType":"Welcome"') < 0) return;
  try {
    const msg = JSON.parse(text);
    if (msg && msg.messageType === "Welcome" && typeof msg.selfNetEntityId === "string") {
      spectator.selfId = msg.selfNetEntityId;
    }
  } catch {
    // identity only; dump still comes from wasm SpectatorDump
  }
}

let connectionAttempt = 0;
let currentSocket = null;
let launchCancellation = null;
let runtimeClosed = false;
let terminal = false;
let recovering = false;
let active = false;
// The launch the current socket dialled; a not_serving retry dials it again (ADR-120: same address).
let currentLaunch = null;
// not_serving retries taken in the current connect phase; back to 0 once the session is active.
let notServingRetries = 0;

// ADR-120: not_serving (1013) means the DS at this address has not opened yet. While connecting,
// the page dials the same launch again after a bounded backoff; past the bound it reports a connect
// failure. Retry n waits initialDelayMs doubled n-1 times, capped at maxDelayMs. NOT_SERVING_RETRY is
// generated from the same declaration as the C# session's SessionNotServingRetryOptions.Default
// (Client/Gameplay/Session/not-serving-retry.json), so the page and the session share one bound.
function notServingDelayMs(retry) {
  return Math.min(NOT_SERVING_RETRY.initialDelayMs * 2 ** (retry - 1), NOT_SERVING_RETRY.maxDelayMs);
}

// The one close code this page names that is not in the DS table. A browser reports 1006 itself when
// the connection drops without a close frame (RFC 6455 7.1.5); an endpoint must never send it in one
// (7.4.1). So no server can close with it and the contract's table cannot carry it.
const ABNORMAL_CLOSURE = 1006;

// One classification for every close this page sees; every server close code comes from the generated table.
function closeClass(event) {
  if (event.code === DS_CLOSE_CODES.internal_error) return "fault";
  if (event.code === DS_CLOSE_CODES.not_serving) return "try_later";
  if (event.code === ABNORMAL_CLOSURE
    || (["connection_timeout", "queue_full", "send_buffer_overflow"].includes(event.reason)
      && event.code === DS_CLOSE_CODES[event.reason])) return "recoverable";
  return "closed";
}

function releaseReplica() {
  playerInput?.clear();
  player.replica = null;
  if (!runtimeClosed) {
    runtimeClosed = true;
    csharp.close();
  }
  // The voxel baseline belongs to this connectionGeneration; a new session
  // rebuilds it from the Sections the server sends after the next Welcome.
  closeVoxelWorld();
  active = false;
  spectator.selfId = spectator.worldId = null;
  paint([]);
}

function finish(status, reason = "normal_logout") {
  terminal = true;
  connectionAttempt++;
  launchCancellation?.abort();
  launchCancellation = null;
  const socket = currentSocket;
  currentSocket = null;
  releaseReplica();
  setStatus(status);
  if (socket && socket.readyState < 2) {
    // Browser scripts may send only 1000 or application codes (3000–4999).
    // Local data failure is terminal above; close transport using the registered session_closed pair.
    const wireReason = DS_CLOSE_CODES[reason] === DS_CLOSE_CODES.session_closed ? reason : "session_closed";
    socket.close(DS_CLOSE_CODES[wireReason], wireReason);
  }
}

async function reconnect() {
  const attempt = ++connectionAttempt;
  recovering = true;
  currentSocket = null;
  releaseReplica();
  setStatus("reconnecting");
  launchCancellation = new AbortController();
  try {
    // The injected launch describes the original attempt only. Recovery gets a new ticket.
    const launch = await launchFromPlatform(launchCancellation.signal);
    if (terminal || attempt !== connectionAttempt) return;
    currentLaunch = launch;
    csharp.boot(admittedRoomId(launch));
    configureMap(csharp.mapDimensions());
    await openVoxelWorld();
    if (terminal || attempt !== connectionAttempt) { closeVoxelWorld(); return; }
    runtimeClosed = false;
    attachSocket(connectDs(launch, { allowLoopback: pageAllowsLoopback(), Socket: window.WebSocket }), attempt);
  } catch (error) {
    if (attempt === connectionAttempt && !terminal) failLaunch(error);
  }
}

// ADR-120: the DS refused this connect with not_serving. Dial the same launch again after the
// backoff — no new ticket, the refused one was never admitted — or, past the bound, fail the connect.
async function retryNotServing(attempt) {
  if (notServingRetries >= NOT_SERVING_RETRY.maxRetries) {
    spectator.lastError = "not_serving_exhausted";
    finish("failed");
    return;
  }
  notServingRetries++;
  const launch = currentLaunch;
  currentSocket = null;
  releaseReplica();
  setStatus("reconnecting", "not_serving");
  try {
    await new Promise((resolve) => setTimeout(resolve, notServingDelayMs(notServingRetries)));
    if (terminal || attempt !== connectionAttempt) return;
    csharp.boot(admittedRoomId(launch));
    configureMap(csharp.mapDimensions());
    await openVoxelWorld();
    if (terminal || attempt !== connectionAttempt) { closeVoxelWorld(); return; }
    runtimeClosed = false;
    attachSocket(connectDs(launch, { allowLoopback: pageAllowsLoopback(), Socket: window.WebSocket }), attempt);
  } catch {
    if (attempt === connectionAttempt && !terminal) finish("failed");
  }
}

// A launch that cannot even be asked for names why. Every other failure keeps the
// page's existing outcome (a plain `failed`).
function failLaunch(error) {
  finish("failed");
  if (error && error.code === "game_slug_unresolved") {
    setStatus("failed", error.code);
    console.error("[lumio-spectator]", error.message);
  }
}

function attachSocket(socket, attempt = connectionAttempt) {
  currentSocket = socket;
  socket.binaryType = "arraybuffer";
  const current = () => !terminal && attempt === connectionAttempt && socket === currentSocket;
  socket.addEventListener("open", () => { if (current()) setStatus("connected"); });
  socket.addEventListener("error", () => { if (current()) setStatus("connecting"); });
  socket.addEventListener("close", (event) => {
    if (!current()) return;
    const kind = closeClass(event);
    if (kind === "try_later") spectator.notServingCloses++;
    if (kind === "fault") {
      spectator.lastError = "internal_error";
      finish("failed", "internal_error");
    }
    // ADR-120 adds nothing after entering the game, and a DS that follows it sends not_serving only
    // to a connection it has not admitted. Once active it is a peer contract violation: the page fails
    // as on any fault, and does not reconnect.
    else if (kind === "try_later" && active) {
      spectator.lastError = "not_serving";
      finish("failed", "not_serving");
    }
    // not_serving while connecting: same address, bounded backoff.
    else if (kind === "try_later") void retryNotServing(attempt);
    else if (kind === "recoverable" && active && !recovering) void reconnect();
    else finish("closed");
  });
  socket.addEventListener("message", (event) => {
    if (!current()) return;
    const data = event.data;
    try {
      if (typeof data !== "string") {
        finish("failed", "protocol_violation");
        return;
      }
      spectator.lastFrameType = frameTypeOf(data);
      const applied = csharp.onFrame(data);
      const state = csharp.connectionState();
      if (state === "superseded") { finish("superseded", "superseded"); return; }
      if (state === "faulted") {
        noteApplyFault(new Error(csharp.lastApplyError() || "faulted"), data);
        finish("failed", spectator.lastError || "bad_envelope");
        return;
      }
      // SectionFrames are not entity frames, so `applied` is false for them; the
      // grid still has to be repainted when one landed in the voxel world.
      const sections = drainSectionFrames();
      if (applied === false) {
        if (sections > 0) applyDump(csharp.dumpPositions());
        return;
      }
      noteSelfFromWelcome(data);
      active = state === "active";
      if (active) { recovering = false; notServingRetries = 0; }
      if (PLAYER_MODE) setStatus(active ? 'active' : state);
      applyDump(csharp.dumpPositions());
    } catch (error) {
      noteApplyFault(error, data);
      finish("failed", spectator.lastError || "bad_envelope");
    }
  });
}

async function obtainLaunch(query) {
  if (PLAYER_MODE) return launchFromPlatform();
  const injected = launchFromInjected();
  if (injected) {
    if (query.ws) {
      return {
        wsUrl: query.ws,
        subprotocol: injected.subprotocol || "lumio.mvp.v0",
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
  return launchFromPlatform();
}

async function start() {
  if (currentSocket || launchCancellation) finish("closed");
  terminal = false;
  recovering = false;
  active = false;
  notServingRetries = 0;
  const attempt = ++connectionAttempt;
  if (typeof location !== "undefined" && location.protocol === "file:") {
    setStatus("static", "ES modules need a static server");
  } else {
    setStatus("starting");
  }
  paint([]);
  if (!await loadWasmExports()) return;
  // Second wasm instance, own linear memory, no shared codec (ADR-078 决策 3).
  await openVoxelWorld();
  if (terminal || attempt !== connectionAttempt) { closeVoxelWorld(); return; }
  runtimeClosed = false;

  const query = readQuery();
  let launch;
  try {
    launch = await obtainLaunch(query);
    if (terminal || attempt !== connectionAttempt) return;
    currentLaunch = launch;
    csharp.boot(admittedRoomId(launch));
    configureMap(csharp.mapDimensions());
    await openBlocksView();
    applyDump(csharp.dumpPositions());
  } catch (error) {
    if (error && error.code === "game_slug_unresolved") failLaunch(error);
    else if (PLAYER_MODE) {
      finish("failed");
      setStatus("failed", error?.message ?? "player_start_failed");
      console.error("[lumio-player] start failed", error?.message ?? "player_start_failed");
    }
    else finish("waiting");
    return;
  }

  try {
    const socket = connectDs(launch, {
      allowLoopback: pageAllowsLoopback(),
      Socket: window.WebSocket,
    });
    attachSocket(socket, attempt);
  } catch (error) {
    finish("failed");
  }
}

function sendPlayerCommand(kind, createFrames) {
  if (!PLAYER_MODE || !active || currentSocket?.readyState !== 1) return;
  if (kind === 'character') {
    if (!['WaitingForWorldReady', 'Warmup', 'Results'].includes(player.replica?.phase)
      || !player.replica?.inputEnabled || !player.replica?.selfId) return;
  } else if (!player.replica?.inputOpen) return;
  try {
    const frames = JSON.parse(createFrames());
    for (const frame of frames) {
      currentSocket.send(frame);
      player.inputsSent++;
      if (kind === 'move') player.movesSent++;
      else if (kind === 'bomb') player.bombsSent++;
      else if (kind === 'skill') player.skillsSent++;
      else if (kind === 'character') player.selectionsSent++;
    }
    player.lastInput = { kind, count: frames.length, at: Date.now() };
  } catch (error) {
    playerInput?.clear();
    spectator.lastError = String(error.message ?? error);
    setStatus('error', spectator.lastError);
  }
}

async function initializePage() {
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
    const { createPlayerInput } = await import('./player-controls.mjs');
    playerInput = createPlayerInput({
      panel: document.getElementById('player-controls'),
      ready: () => active && currentSocket?.readyState === 1 && player.replica?.inputOpen === true,
      sendMove: (primary, secondary, turn) => sendPlayerCommand('move', () => csharp.sendMove(primary, secondary, turn)),
      placeBomb: () => sendPlayerCommand('bomb', () => csharp.placeBomb()),
      useSkill: () => sendPlayerCommand('skill', () => csharp.useActiveSkill()),
    });
  }
  document.getElementById('enter')?.addEventListener('click', () => { void start(); });
  await start();
}
void initializePage();
