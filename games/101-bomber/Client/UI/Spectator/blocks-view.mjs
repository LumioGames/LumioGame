// Block view of the spectator page (`index.html?view=blocks`, ADR-124 C9 / R-00795).
//
// The same Rust voxel world `voxel-grid.mjs` opened with the game's catalog v2 and filled
// with the DS's SectionFrames is handed to the engine's block renderer
// (`Render/block-scene.mjs`, `RHI/`, `Assets/` from the Engine/ release web/): assets from
// this game's `Client/Assets/Blocks/` → texture array + face texture table → VoxelEngine's
// wasm mesher → three WebGL2 passes. This file builds no geometry and reads no Section
// (ADR-078): it only drives the camera, counts the quads the renderer uploads and exposes
// read-only evidence (`window.__lumioBlocks`) for the acceptance record.
//
// Camera: drag = orbit, Shift / right drag = pan, wheel = zoom. The opening view
// frames the activated Bomber map dimensions supplied by the spectator page.

import { createBlockScene } from "./Render/block-scene.mjs";
import { QUAD_BYTES } from "./Render/mesh-layout.mjs";

const decoder = new TextDecoder();

/// `grid`: the ready voxel grid (`openVoxelGrid`), whose `wasm` is `{ exports, world }`.
/// `catalogJson`: the catalog v2 text the grid's world was created with.
/// `canvas`, `hud`, `cameraBar`: page elements. `assetRoot`: URL of the folder holding `Blocks/`.
/// `mapBounds`: configured horizontal cell bounds from the spectator page.
export async function createBlocksView({ grid, catalogJson, canvas, hud, cameraBar, assetRoot, mapBounds, signal, isWorldAlive }) {
  const wasm = grid.wasm;
  if (!wasm) throw new Error(`blocks_view:voxel_world_${grid.status}:${grid.error ?? ""}`);
  const { exports, world } = wasm;
  const warnings = [];
  const fitCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  };
  fitCanvas();

  const centerX = (mapBounds.minX + mapBounds.maxX) / 2;
  const centerZ = (mapBounds.minZ + mapBounds.maxZ) / 2;
  const span = Math.max(mapBounds.maxX - mapBounds.minX, mapBounds.maxZ - mapBounds.minZ);
  const overview = {
    id: "overview",
    position: [centerX, 1 + span * 2, centerZ + span * 0.45],
    lookAt: [centerX, 1, centerZ],
  };
  const createdAt = performance.now();
  const scene = await createBlockScene({
    canvas,
    catalog: catalogJson,
    assetRoot,
    exports,
    world,
    signal,
    isWorldAlive,
    onWarning: (warning) => {
      warnings.push({ reason: warning.reason, name: warning.name ?? null, slots: warning.slots ?? null, sectionKey: warning.sectionKey ?? null, message: warning.message });
      console.warn("[lumio-blocks]", warning.message ?? warning, warning);
    },
    worldRevisionOf: (key) => grid.sectionRevision(key),
    camera: { position: overview.position, far: Math.max(512, span * 8) },
  });
  const listeners = new AbortController();
  const listen = (target, event, handler, options = {}) => target.addEventListener(event, handler, { ...options, signal: listeners.signal });
  listen(window, "resize", fitCanvas);

  // Quads per Section, read off each uploaded buffer header (display and evidence only).
  const quads = new Map();
  const submit = scene.renderer.submitMesh.bind(scene.renderer);
  const timing = { createdMs: performance.now() - createdAt, firstMeshAtMs: null, lastMeshAtMs: null, meshCalls: 0 };
  scene.renderer.submitMesh = (header, memory, ptr) => {
    const result = submit(header, memory, ptr);
    if (result.uploaded) {
      const seg = header.segments;
      quads.set(`${header.sectionX}:${header.sectionY}:${header.sectionZ}`, {
        opaque: seg.opaque.bytes / QUAD_BYTES,
        cutout: seg.cutout.bytes / QUAD_BYTES,
        translucent: seg.translucent.bytes / QUAD_BYTES,
        sectionRevision: String(header.sectionRevision),
      });
      const now = performance.now();
      timing.firstMeshAtMs ??= now;
      timing.lastMeshAtMs = now;
    }
    return result;
  };

  const cameras = [overview];

  const cam = scene.camera;
  const orbit = { target: overview.lookAt, dist: span * 2, yaw: 0, pitch: -1.35 };
  function setFromPreset(preset) {
    const [px, py, pz] = preset.position;
    const [tx, ty, tz] = preset.lookAt;
    const dx = tx - px; const dy = ty - py; const dz = tz - pz;
    orbit.target = [tx, ty, tz];
    orbit.dist = Math.hypot(dx, dy, dz);
    orbit.yaw = Math.atan2(dx, -dz);
    orbit.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  function applyOrbit() {
    orbit.pitch = Math.max(-1.55, Math.min(1.55, orbit.pitch));
    orbit.dist = Math.max(1.5, Math.min(200, orbit.dist));
    cam.yaw = orbit.yaw;
    cam.pitch = orbit.pitch;
    const f = cam.forward();
    for (let i = 0; i < 3; i += 1) cam.position[i] = orbit.target[i] - f[i] * orbit.dist;
  }
  let cameraIndex = 0;
  function selectCamera(index) {
    cameraIndex = (index + cameras.length) % cameras.length;
    setFromPreset(cameras[cameraIndex]);
    if (cameraBar) [...cameraBar.children].forEach((button, j) => button.classList.toggle("on", j === cameraIndex));
    return cameras[cameraIndex].id;
  }
  if (cameraBar) {
    cameraBar.textContent = "";
    cameras.forEach((preset, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${i + 1}. ${preset.id}`;
      button.onclick = () => selectCamera(i);
      cameraBar.appendChild(button);
    });
  }
  selectCamera(0);

  let dragging = null;
  listen(canvas, "pointerdown", (e) => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  listen(canvas, "pointerup", () => { dragging = null; });
  listen(canvas, "pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.x; const dy = e.clientY - dragging.y;
    dragging = { x: e.clientX, y: e.clientY };
    if (e.shiftKey || e.buttons === 2 || e.buttons === 4) {
      const r = cam.right(); const s = orbit.dist * 0.0025;
      orbit.target[0] -= r[0] * dx * s; orbit.target[2] -= r[2] * dx * s; orbit.target[1] += dy * s;
    } else {
      orbit.yaw += dx * 0.005; orbit.pitch -= dy * 0.005;
    }
  });
  listen(canvas, "contextmenu", (e) => e.preventDefault());
  listen(canvas, "wheel", (e) => { e.preventDefault(); orbit.dist *= Math.exp(e.deltaY * 0.001); }, { passive: false });
  listen(window, "keydown", (e) => {
    if (e.key === "c" || e.key === "C" || e.key === "ArrowRight") selectCamera(cameraIndex + 1);
    else if (e.key === "ArrowLeft") selectCamera(cameraIndex - 1);
    else if (/^[1-9]$/.test(e.key)) selectCamera(Number(e.key) - 1);
    else if (e.key === "0") selectCamera(9);
  });

  // ---- read-only evidence through the wasm world the page already owns ----------------
  function lastError() {
    const n = exports.lumio_voxel_last_error_len();
    if (!n) return "";
    const p = exports.lumio_voxel_alloc(n);
    const w = exports.lumio_voxel_last_error(p, n);
    const text = decoder.decode(new Uint8Array(exports.memory.buffer, p, Math.max(0, w)));
    exports.lumio_voxel_free(p, n);
    return text;
  }
  /// `lumio_voxel_light_read_cell` → `{ presence, hasLight, blockR, blockG, blockB, sky }`.
  function lightAt(x, y, z) {
    const p = exports.lumio_voxel_alloc(16);
    try {
      const status = exports.lumio_voxel_light_read_cell(world, x, y, z, p);
      if (status !== 0) return { error: lastError() || String(status) };
      const view = new DataView(exports.memory.buffer, p, 16);
      const light = view.getUint32(8, true);
      return {
        presence: view.getUint32(0, true), hasLight: view.getUint32(4, true) === 1,
        blockR: light & 15, blockG: (light >> 4) & 15, blockB: (light >> 8) & 15, sky: (light >> 12) & 15,
      };
    } finally {
      exports.lumio_voxel_free(p, 16);
    }
  }
  /// `lumio_voxel_light_section_digest` per delivered Section, hex (lighting.digest).
  function lightDigests() {
    const out = {};
    const p = exports.lumio_voxel_alloc(32);
    try {
      for (const { key } of grid.sections()) {
        const [, x, y, z] = key.split(":").map(Number);
        const status = exports.lumio_voxel_light_section_digest(world, x, y, z, p);
        out[key] = status === 0
          ? [...new Uint8Array(exports.memory.buffer, p, 32)].map((b) => b.toString(16).padStart(2, "0")).join("")
          : `error:${lastError() || status}`;
      }
    } finally {
      exports.lumio_voxel_free(p, 32);
    }
    return out;
  }
  const sum = () => {
    const t = { opaque: 0, cutout: 0, translucent: 0 };
    for (const q of quads.values()) { t.opaque += q.opaque; t.cutout += q.cutout; t.translucent += q.translucent; }
    return t;
  };
  /// Draws one frame at a fixed size and returns it as a PNG data URL (same task, so the
  /// drawing buffer is still there). `snapTo(url, name)` POSTs it to a local receiver.
  function snapDataUrl(width = 1280, height = 800) {
    const keep = [canvas.width, canvas.height];
    canvas.width = width; canvas.height = height;
    applyOrbit();
    scene.frame();
    const url = canvas.toDataURL("image/png");
    canvas.width = keep[0]; canvas.height = keep[1];
    return url;
  }
  async function snapTo(receiver, name, width, height) {
    const blob = await (await fetch(snapDataUrl(width, height))).blob();
    const response = await fetch(`${receiver}?name=${encodeURIComponent(name)}`, { method: "POST", body: blob });
    return response.text();
  }

  let frames = 0; let fps = 0; let last = performance.now(); let alive = true; let lastStats = null;
  function tick(now) {
    if (!alive) return;
    applyOrbit();
    lastStats = scene.frame();
    frames += 1;
    if (now - last >= 500) { fps = (frames * 1000) / (now - last); frames = 0; last = now; }
    if (hud) {
      const t = sum();
      const lag = lastStats?.lagging ? `  lagging ${lastStats.lagging}` : "";
      hud.textContent =
        `blocks · Sections delivered ${grid.sections().length} · meshed ${quads.size}${lag}\n` +
        `fps ${fps.toFixed(0)}   camera ${cameraIndex + 1}/${cameras.length} ${cameras[cameraIndex]?.id ?? ""}\n` +
        `faces  opaque ${t.opaque}  cutout ${t.cutout}  translucent ${t.translucent}\n` +
        [...quads].slice(0, 8).map(([k, q]) => `  s ${k} r${q.sectionRevision}: ${q.opaque} / ${q.cutout} / ${q.translucent}`).join("\n") +
        (warnings.length ? `\nwarnings ${warnings.length} (console)` : "") +
        "\ndrag orbit · shift/right drag pan · wheel zoom · 1 / C overview";
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const api = {
    grid, scene, quads, sum, warnings, timing, cameras, orbit,
    selectCamera, lightAt, lightDigests, snapDataUrl, snapTo,
    get cameraId() { return cameras[cameraIndex]?.id ?? null; },
    get fps() { return fps; },
    destroy() {
      if (!alive) return;
      alive = false;
      listeners.abort();
      if (cameraBar) cameraBar.replaceChildren();
      if (window.__lumioBlocks === api) delete window.__lumioBlocks;
      scene.destroy();
    },
  };
  window.__lumioBlocks = api;
  return api;
}
