// Round trip against the REAL VoxelEngine wasm32 module and this game's REAL map.
//
// This drives `voxel-grid.mjs` — the engine part LumioClient ships and the page
// imports (R-00710: read from the LumioClient checkout, never copied here) — against
// `lumio_voxel_wasm.wasm` built from LumioVoxelEngine, and feeds it the Section
// payloads out of this repository's `Server/Assets/Maps/bomber.voxel`. Nothing here encodes a
// Section: the payload bytes are the engine's own, and even the digest comes
// from `lumio_voxel_payload_digest` rather than a second SHA-256 (ADR-078 决策 1).
//
// The module and its .wasm are the Engine/ release's web/ parts (ADR-123); it fails
// (never skips) when they are missing:
//
//   node --test Client/UI/Spectator/voxel-grid.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateCandidate } from '../../../eng/select-engine-candidate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
// ADR-123: the voxel driver and its wasm are the Engine/ release's web/ parts.
const candidateRoot = process.env.LUMIO_ENGINE_CANDIDATE_ROOT;
if (candidateRoot) {
  assert.ok(path.isAbsolute(candidateRoot), 'LUMIO_ENGINE_CANDIDATE_ROOT must be absolute');
  validateCandidate(candidateRoot);
}
const ENGINE_WEB = path.join(candidateRoot || path.join(REPO_ROOT, 'Engine'), 'web');
const VOXEL_GRID = path.join(ENGINE_WEB, "voxel-grid.mjs");
assert.ok(fs.existsSync(VOXEL_GRID), `engine voxel-grid.mjs not found at ${VOXEL_GRID}; run: git submodule update --init --depth 1 Engine`);
const {
  openVoxelGrid,
  blockTypeOf,
  BLOCK_TYPE_AIR,
  SURFACE_AIR,
  SURFACE_BLOCK,
  SURFACE_LOADING,
} = await import(pathToFileURL(VOXEL_GRID).href);

function resolveWasm() {
  const candidates = [path.join(ENGINE_WEB, "lumio_voxel_wasm.wasm")];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(
    found,
    `lumio_voxel_wasm.wasm is not in the Engine/ release (run: git submodule update --init --depth 1 Engine). `
      + `Looked in:\n  ${candidates.join("\n  ")}`,
  );
  return found;
}

const WASM_PATH = resolveWasm();
const WASM_BYTES = fs.readFileSync(WASM_PATH);

// A file-backed stand-in for the browser fetch the page uses.
function localFetch() {
  return async () => ({ ok: true, arrayBuffer: async () => WASM_BYTES });
}

function openGrid() {
  // Wasm ABI 2 (ADR-124) has no world without the game's catalog v2 — the same bytes the DS uses.
  const catalogJson = fs.readFileSync(path.join(REPO_ROOT, "Server/Assets/Maps/official-catalog.json"), "utf8");
  return openVoxelGrid({ wasmUrl: WASM_PATH, fetchImpl: localFetch(), catalogJson });
}

/// The `.voxel` snapshot is a JSON header followed by its own trailer. Only the
/// header is read here, and only for the Section payloads the DS would have sent.
function readBomberSections() {
  const raw = fs.readFileSync(path.join(REPO_ROOT, "Server/Assets/Maps/bomber.voxel"));
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const c = String.fromCharCode(raw[i]);
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth += 1;
    else if (c === "}") { depth -= 1; if (depth === 0) { end = i + 1; break; } }
  }
  assert.ok(end > 0, "bomber.voxel header is not a complete JSON object");
  const header = JSON.parse(raw.subarray(0, end).toString("utf8"));
  const sections = [];
  for (const key of Object.keys(header)) {
    if (!key.startsWith("sectionPayload.")) continue;
    const sectionKey = key.slice("sectionPayload.".length);
    const [, x, y, z] = sectionKey.split(":");
    sections.push({
      sectionKey,
      sectionX: Number(x),
      sectionY: Number(y),
      sectionZ: Number(z),
      sectionRevision: String(header[`sectionRevision.${sectionKey}`]),
      // The snapshot stores exactly the bytes `encode_full` puts on the wire.
      // A palette-encoded Section is what `SectionStorage::compacted` produces
      // for this map; naming the wrong one would be refused outright with
      // `section_encoding_mismatch`, so this is asserted, not assumed.
      encoding: "Palette",
      payload: Buffer.from(header[key], "hex"),
      payloadLength: Buffer.from(header[key], "hex").length,
      hasBaseSectionRevision: false,
      baseSectionRevision: "0",
    });
  }
  assert.ok(sections.length > 0, "bomber.voxel carries no Section payloads");
  return { sections };
}

/// Digest from the engine's own SHA-256, through a throwaway instance, so this
/// file adds no second hash implementation anywhere.
const digestExports = (await WebAssembly.instantiate(WASM_BYTES, {})).instance.exports;

function payloadDigest(payload) {
  const ptr = digestExports.lumio_voxel_alloc(payload.length + 32);
  assert.notEqual(ptr, 0, "staging alloc failed");
  try {
    new Uint8Array(digestExports.memory.buffer).set(payload, ptr + 32);
    const status = digestExports.lumio_voxel_payload_digest(ptr + 32, payload.length, ptr);
    assert.equal(status, 0, "payload_digest failed");
    // Fresh view after the call (ADR-078 决策 4.3).
    return new Uint8Array(digestExports.memory.buffer.slice(ptr, ptr + 32));
  } finally {
    digestExports.lumio_voxel_free(ptr, payload.length + 32);
  }
}

const map = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "Client/Config/Tables/client/map.json"), "utf8")).rows[0];
const VIEW = { minX: 0, maxX: map.width - 1, minY: 0, maxY: 15, minZ: 0, maxZ: map.depth - 1 };

test("the module boots, reports ABI 2 and reads its presence table out of wasm", async () => {
  const grid = await openGrid();
  try {
    assert.equal(grid.status, "ready", grid.error ?? "");
    assert.equal(grid.abiVersion, 2);
    // Read back, never hardcoded by the page.
    assert.deepEqual(grid.presenceNames, ["Ready", "Unchanged", "Pending", "Unavailable"]);
  } finally {
    grid.destroy();
  }
});

test("before any Section arrives every cell is loading and none is air", async () => {
  const grid = await openGrid();
  try {
    const surface = grid.readSurface(VIEW);
    const cells = surface.width * surface.depth;
    assert.equal(cells, map.width * map.depth);
    assert.equal(surface.counts.loading, cells, "an unknown world must be 100% loading");
    assert.equal(surface.counts.air, 0, "not-yet-delivered must never paint as air");
    assert.equal(surface.counts.block, 0);
    assert.ok(surface.states.every((state) => state === SURFACE_LOADING));
  } finally {
    grid.destroy();
  }
});

test("the real Bomber Sections deliver and read back as the real Bomber terrain", async () => {
  const { sections } = readBomberSections();
  const grid = await openGrid();
  try {
    for (const section of sections) {
      const outcome = grid.deliver(section, payloadDigest(section.payload), section.payload);
      assert.ok(outcome.ok, `${section.sectionKey}: ${outcome.error ?? ""}`);
      assert.equal(outcome.result.sectionRevision, section.sectionRevision);
    }

    assert.equal(grid.sections().length, sections.length);

    const surface = grid.readSurface(VIEW);
    assert.equal(surface.error, null);
    assert.equal(surface.counts.loading, 0, "every delivered cell must resolve");
    assert.ok(surface.counts.block > 0, "the Bomber map is not empty");

    // Block ids, straight out of read_box, split with the contract's own
    // `BlockType << 8 | BlockState`. They must be exactly the types the Bomber
    // catalog names. This proves the bytes went through the engine rather than
    // being invented by the page.
    const types = new Set();
    for (let i = 0; i < surface.states.length; i += 1) {
      if (surface.states[i] === SURFACE_BLOCK) types.add(blockTypeOf(surface.blockIds[i]));
      else assert.equal(surface.states[i], SURFACE_AIR);
    }
    const catalog = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "Server/Assets/Maps/official-catalog.json"), "utf8"));
    const blockType = (name) => catalog.rows.find((row) => row.name === name)?.blockType;
    for (const name of ["lumio.bomber.floor", "lumio.bomber.iron", "lumio.bomber.hard_pillar"])
      assert.ok(types.has(blockType(name)), `${name} missing; saw ${[...types]}`);
    assert.ok(!types.has(BLOCK_TYPE_AIR), "air must never be reported as a solid surface block");

    // The authored Bomber map has an iron boundary around the configured plane.
    const at = (x, z) => surface.blockIds[z * surface.width + x];
    assert.equal(blockTypeOf(at(0, 0)), blockType("lumio.bomber.iron"));
    assert.equal(blockTypeOf(at(map.width - 1, map.depth - 1)), blockType("lumio.bomber.iron"));
  } finally {
    grid.destroy();
  }
});

test("a refused delivery leaves its cells loading and never turns them into air", async () => {
  const { sections } = readBomberSections();
  const section = sections[0];
  const grid = await openGrid();
  try {
    // Right bytes, wrong digest: the engine refuses it (section_digest_mismatch).
    const wrongDigest = new Uint8Array(32);
    const refused = grid.deliver(section, wrongDigest, section.payload);
    assert.equal(refused.ok, false);
    assert.match(refused.error, /deliver_section:/);

    const surface = grid.readSurface(VIEW);
    assert.equal(surface.counts.air, 0, "a refused Section must not become air");
    assert.equal(surface.counts.block, 0);
    assert.equal(surface.counts.loading, surface.width * surface.depth);

    // And the same Section with its own digest still lands afterwards.
    const accepted = grid.deliver(section, payloadDigest(section.payload), section.payload);
    assert.ok(accepted.ok, accepted.error ?? "");
  } finally {
    grid.destroy();
  }
});

test("a destroyed world stops answering and still never reports air", async () => {
  const grid = await openGrid();
  grid.destroy();
  const surface = grid.readSurface(VIEW);
  assert.equal(surface.counts.air, 0);
  assert.equal(surface.counts.loading, surface.width * surface.depth);
});
