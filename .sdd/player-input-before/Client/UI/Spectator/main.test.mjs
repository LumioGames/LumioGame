// Spectator page regression:
// load the real page module in node:vm (window === globalThis, no Node module/require).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

// The modules main.js imports by relative name are engine parts (R-00710) shipped in the
// Engine/ release's web/ (flat, ADR-123); the publish links them next to main.js. These
// tests read the very same files from there. Missing is a failure, never a skip, and never a
// local copy.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLIENT_PARTS = path.join(REPO_ROOT, "Engine/web");
if (!fs.existsSync(path.join(CLIENT_PARTS, "connect-ds.mjs"))) {
  throw new Error(`BLOCKED_ENV: engine spectator parts not found under ${CLIENT_PARTS}; run: git submodule update --init --depth 1 Engine`);
}
const clientPart = (name) => pathToFileURL(path.join(CLIENT_PARTS, name));

const MAIN_PATH = new URL("./main.js", import.meta.url);
const CONNECT_PATH = clientPart("connect-ds.mjs");
const HTML_PATH = new URL("./index.html", import.meta.url);
const VOXEL_PATH = clientPart("voxel-grid.mjs");
const MAIN_SOURCE = fs.readFileSync(MAIN_PATH, "utf8");
const CONNECT_SOURCE = fs.readFileSync(CONNECT_PATH, "utf8");
const CLOSE_SOURCE = fs.readFileSync(clientPart("ds-close-codes.mjs"), "utf8");
const RETRY_SOURCE = fs.readFileSync(clientPart("not-serving-retry.mjs"), "utf8");
const VOXEL_SOURCE = fs.readFileSync(VOXEL_PATH, "utf8");
const HTML_SOURCE = fs.readFileSync(HTML_PATH, "utf8");

// The camera the page reads: configured 19x19 columns. Kept here so the voxel assertions
// below state the cell count instead of implying it.
const VOXEL_CELLS = 19 * 19;
const LOADING_FILL = "hsl(45, 22%, 18%)";

const CREDENTIAL = "test-admission-credential-do-not-leak";
const LAUNCH = Object.freeze({
  wsUrl: "wss://edge.example/play/session-abc",
  subprotocol: "lumio.mvp.v0",
  admissionCredential: CREDENTIAL,
  roomId: "room-from-platform",
});

function pageSourceForVm() {
  const inlinedConnect = CONNECT_SOURCE.replace("export function connectDs", "function connectDs");
  // The real voxel driver, inlined the same way: these tests run the shipped
  // module, not a stand-in for it.
  const inlinedVoxel = VOXEL_SOURCE.replace(/^export /gm, "");
  return MAIN_SOURCE
    .replace(/import \{ DS_CLOSE_CODES \} from "\.\/ds-close-codes\.mjs";\s*/, CLOSE_SOURCE.replace(/^export /gm, ""))
    .replace(/import \{ NOT_SERVING_RETRY \} from "\.\/not-serving-retry\.mjs";\s*/, RETRY_SOURCE.replace(/^export /gm, ""))
    .replace(/import \{ connectDs \} from "\.\/connect-ds\.mjs";\s*/, `${inlinedConnect}\n`)
    .replace(/import \{[^}]*\} from "\.\/voxel-grid\.mjs";\s*/, `${inlinedVoxel}\n`)
    .replace(
      "await import(\"./_framework/dotnet.js\")",
      "await (globalThis.__lumioImport ?? (async (s) => { throw new Error(\"missing \" + s); }))(\"./_framework/dotnet.js\")",
    );
}

function stubCanvas(rendered) {
  const ctx = {
    fillStyle: "",
    clearRect() {
      rendered.push("clear");
    },
    beginPath() {},
    arc(x, y, radius) {
      rendered.push(`arc:${x},${y},${radius}`);
    },
    fill() {
      rendered.push(`fill:${ctx.fillStyle}`);
    },
    strokeStyle: "",
    lineWidth: 1,
    stroke() {
      rendered.push(`stroke:${ctx.strokeStyle}`);
    },
    strokeRect() {
      rendered.push("strokeRect");
    },
    // Voxel cells are painted as rects; the recorded fill is what proves a cell
    // was drawn as terrain, as loading, or not drawn at all.
    fillRect() {
      rendered.push(`rect:${ctx.fillStyle}`);
    },
  };
  return {
    width: 640,
    height: 480,
    getContext() {
      return ctx;
    },
  };
}

function stubStatus(rendered) {
  let text = "";
  return {
    get textContent() {
      return text;
    },
    set textContent(value) {
      text = String(value);
      rendered.push(text);
    },
  };
}

async function runPage({
  search = "",
  protocol = "http:",
  // The Platform serves a game page at /games/<slug>/; the page reads its game from there.
  pathname = "/games/bomber/",
  hostname = "127.0.0.1",
  launch = LAUNCH,
  injectLaunch = true,
  dumpJson = "[]",
  settleTimeoutMs = 2000,
  failFrame = false,
  skipFrame = false,
  runtimeState = "active",
  fetchLaunch = null,
  // Response the page gets for ./lumio_voxel_wasm.wasm. The default is "not
  // published here", which is the case these tests care about: the page must
  // then say so and paint loading, never air. The real module is exercised
  // end-to-end in voxel-grid.test.mjs.
  voxelWasm = { ok: false, status: 404 },
  // Response for ./official-catalog.json: the game's committed catalog v2 by default.
  catalogResponse = { ok: true, status: 200, text: async () => fs.readFileSync(path.join(REPO_ROOT, "Server/Assets/Maps/official-catalog.json"), "utf8") },
  // SectionFrames the C# host offers, as [headerJson, Uint8Array] pairs.
  sectionFrames = [],
  // When an array, every page timer is recorded here by its requested delay and fired at once, so a
  // backoff schedule is asserted exactly instead of slept through.
  timerDelays = null,
} = {}) {
  const sockets = [];
  const rendered = [];
  const logged = [];
  const storage = {};
  const fetchCalls = [];
  const runtime = { boots: 0, bootRooms: [], closes: 0, frames: 0, state: runtimeState };
  const record = (...args) => logged.push(args.map((arg) => String(arg)).join(" "));

  class ObservableSocket {
    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.binaryType = "blob";
      this.readyState = 1;
      this._listeners = { open: [], error: [], close: [], message: [] };
      sockets.push(this);
      queueMicrotask(() => this._emit("open", {}));
    }
    addEventListener(type, handler) {
      (this._listeners[type] ??= []).push(handler);
    }
    _emit(type, event) {
      for (const handler of this._listeners[type] ?? []) handler(event);
    }
    send(frame) { (this.sent ??= []).push(frame); }
    close(code = 1000, reason = "") {
      if (code !== 1000 && (code < 3000 || code > 4999)) throw new Error("InvalidAccessError: browser close code");
      this.closedWith = { code, reason };
      this.readyState = 3;
      this._emit("close", { code, reason, wasClean: true });
    }
    async deliver(data) {
      this._emit("message", { data });
      await drain();
    }
  }

  const statusEl = stubStatus(rendered);
  const canvas = stubCanvas(rendered);
  const legendEl = { innerHTML: "" };
  const pendingSections = [...sectionFrames];

  const sandbox = {
    location: { search, protocol, pathname, hostname, href: `${protocol}//${hostname}${pathname}${search}` },
    document: {
      getElementById(id) {
        if (id === "status") return statusEl;
        if (id === "field") return canvas;
        if (id === "legend") return legendEl;
        return null;
      },
    },
    WebSocket: ObservableSocket,
    URL,
    URLSearchParams,
    Uint8Array,
    Uint32Array,
    DataView,
    // Browser globals the voxel driver uses; a fresh vm realm has none of them.
    TextEncoder,
    TextDecoder,
    WebAssembly,
    ArrayBuffer,
    Blob,
    btoa,
    atob,
    Date,
    Math,
    JSON,
    Number,
    String,
    console: { error: record, warn: record, log: record, info: record },
    setTimeout: timerDelays
      ? (callback, delayMs, ...args) => { timerDelays.push(delayMs); return setTimeout(callback, 0, ...args); }
      : setTimeout,
    queueMicrotask,
    AbortController,
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      },
      setItem(key, value) {
        storage[key] = String(value);
      },
      removeItem(key) {
        delete storage[key];
      },
      get _store() {
        return storage;
      },
    },
    async fetch(url, init) {
      // The voxel module is a static asset next to the page, not a launch or
      // account call; fetchCalls is the log of the latter.
      if (String(url).endsWith(".wasm")) return voxelWasm;
      // The block catalog v2 is a static asset published next to the page too (ADR-124).
      if (String(url).endsWith("official-catalog.json")) return catalogResponse;
      fetchCalls.push({ url: String(url), method: init?.method ?? "GET", credentials: init?.credentials ?? null, csrf: init?.headers?.["X-CSRF-Token"] });
      if (String(url).endsWith("/me")) return { ok: true, status: 200, headers: { get: () => "test-csrf" } };
      const result = fetchLaunch ? await fetchLaunch(fetchCalls.length) : launch;
      return { ok: true, status: 200, json: async () => structuredClone(result) };
    },
  };

  const context = vm.createContext(sandbox);
  vm.runInContext("globalThis.window = globalThis;", context);
  if (injectLaunch) {
    vm.runInContext("window.__lumioLaunch = globalThis.__injectedLaunch;", context);
    sandbox.__injectedLaunch = structuredClone(launch);
    vm.runInContext("window.__lumioLaunch = globalThis.__injectedLaunch;", context);
  }
  sandbox.__lumioExports = {
    Boot(roomId) { runtime.boots++; runtime.bootRooms.push(roomId); },
    Close() { runtime.closes++; },
    ConnectionState() { return runtime.state; },
    LastApplyError() { return runtime.lastApplyError ?? ""; },
    OnBytes() {
      return dumpJson;
    },
    OnFrame() {
      runtime.frames++;
      if (failFrame) {
        runtime.lastApplyError = "authority_apply_failed:Rejected:FullSnapshot";
        runtime.state = "faulted";
        throw new Error("apply_failed");
      }
      if (skipFrame) return false;
      return dumpJson;
    },
    DumpPositions() {
      return dumpJson;
    },
    MapDimensions() { return JSON.stringify({ width: 19, depth: 19 }); },
    IssueSelfMove() { runtime.gameplayInputs = (runtime.gameplayInputs ?? 0) + 1; },
    TakeOutbound() { return '[{"messageType":"InputCommand","commands":[{}]}]'; },
    PeekSectionHeader() {
      runtime.sectionPeeks = (runtime.sectionPeeks ?? 0) + 1;
      return pendingSections.length ? pendingSections[0][0] : "";
    },
    TakeSectionBytes() {
      runtime.sectionTakes = (runtime.sectionTakes ?? 0) + 1;
      const next = pendingSections.shift();
      return next ? next[1] : new Uint8Array(0);
    },
  };
  vm.runInContext("window.__lumioExports = globalThis.__lumioExports;", context);

  vm.runInContext(pageSourceForVm(), context, { filename: MAIN_PATH.href });

  await settle(() => sandbox.__lumioSpectator && sockets.length > 0, settleTimeoutMs);
  await drain();

  const evalInPage = (expression) => vm.runInContext(expression, context);
  return {
    win: sandbox,
    sockets,
    rendered,
    logged,
    fetchCalls,
    storage,
    evalInPage,
    spectator: sandbox.__lumioSpectator,
    runtime,
    legendEl,
    pendingSections,
  };
}

test("network disconnect fetches a fresh ticket with CSRF and creates a new replica", async () => {
  const page = await runPage({ fetchLaunch: () => ({ ...LAUNCH, roomId: "room-after-reconnect", admissionCredential: "fresh-ticket" }) });
  const old = page.sockets[0];
  await old.deliver("pack");
  old._emit("close", { code: 1006, reason: "", wasClean: false });
  await settle(() => page.sockets.length === 2);
  assert.equal(page.sockets.length, 2);
  assert.equal(page.runtime.closes, 1);
  assert.equal(page.runtime.boots, 2);
  assert.deepEqual(page.runtime.bootRooms, ["room-from-platform", "room-after-reconnect"]);
  assert.deepEqual(Array.from(page.sockets[1].protocols), ["lumio.mvp.v0", "lumio-admission.fresh-ticket"]);
  assert.equal(page.fetchCalls[0].url, "/api/account/me");
  assert.equal(page.fetchCalls[1].csrf, "test-csrf");
  const frames = page.runtime.frames;
  await old.deliver("late-old-frame");
  assert.equal(page.runtime.frames, frames);
});

test("unknown messageType frames are skipped without closing the replica", async () => {
  const page = await runPage({ skipFrame: true, dumpJson: '[{"id":"self","x":1,"z":1}]' });
  await page.sockets[0].deliver('{"messageType":"SectionFrame","tick":1}');
  await drain();
  assert.equal(page.spectator.status, "connected");
  assert.equal(page.runtime.closes, 0);
  assert.equal(page.runtime.frames, 1);
  assert.equal(page.sockets[0].readyState, 1);
  assert.equal(page.fetchCalls.length, 0);
});

test("data application failure closes the replica and never starts automatic recovery", async () => {
  const page = await runPage({ failFrame: true, dumpJson: '[{"id":"self","x":1,"z":1}]' });
  await page.sockets[0].deliver("bad-pack");
  await drain();
  assert.equal(page.spectator.status, "failed");
  assert.equal(page.spectator.positions.length, 0);
  assert.equal(page.spectator.lastError, "authority_apply_failed:Rejected:FullSnapshot");
  assert.equal(page.spectator.lastFrameType, "unparsed");
  assert.equal(page.runtime.closes, 1);
  assert.equal(page.sockets.length, 1);
  assert.equal(page.fetchCalls.length, 0);
  assert.equal(page.sockets[0].readyState, 3);
  assert.equal(page.sockets[0].closedWith.code, 1000);
  await page.sockets[0].deliver("late-pack");
  assert.equal(page.runtime.frames, 1);
});

test("binary frames terminate without reaching the runtime", async () => {
  const page = await runPage();
  await page.sockets[0].deliver(new Uint8Array([123, 125]).buffer);
  assert.equal(page.spectator.status, "failed");
  assert.equal(page.runtime.closes, 1);
  assert.equal(page.runtime.frames, 0);
  assert.equal(page.fetchCalls.length, 0);
  assert.equal(page.sockets[0].readyState, 3);
  assert.equal(page.sockets[0].closedWith.reason, "session_closed");
});

test("normal close and supersession stop without reconnecting or account logout", async () => {
  const normal = await runPage();
  normal.sockets[0].close(1000, "shutdown");
  await drain();
  assert.equal(normal.runtime.closes, 1);
  assert.equal(normal.fetchCalls.length, 0);
  const replaced = await runPage({ runtimeState: "superseded" });
  await replaced.sockets[0].deliver("superseded-pack");
  assert.equal(replaced.spectator.status, "superseded");
  assert.equal(replaced.runtime.closes, 1);
  assert.equal(replaced.fetchCalls.length, 0);
});

test("a canceled recovery cannot open a socket when its late ticket arrives", async () => {
  let supply;
  const pending = new Promise((resolve) => { supply = resolve; });
  const page = await runPage({ fetchLaunch: () => pending });
  await page.sockets[0].deliver("pack");
  page.sockets[0]._emit("close", { code: 1006, reason: "", wasClean: false });
  await settle(() => page.fetchCalls.length === 2);
  page.evalInPage("finish('closed')");
  supply({ ...LAUNCH, admissionCredential: "late-ticket" });
  await drain();
  assert.equal(page.sockets.length, 1);
  assert.equal(page.runtime.boots, 1);
  assert.equal(page.spectator.status, "closed");
});

test("presentation dump failure leaves the runtime and connection alive", async () => {
  const page = await runPage({ dumpJson: "invalid-json" });
  await page.sockets[0].deliver("pack");
  assert.equal(page.runtime.closes, 0);
  assert.equal(page.sockets[0].readyState, 1);
  assert.equal(page.fetchCalls.length, 0);
});

test("missing SpectatorExports after wasm boot fail-closes instead of painting the dump stub", async () => {
  const sockets = [];
  const rendered = [];
  const logged = [];
  const record = (...args) => logged.push(args.map((arg) => String(arg)).join(" "));
  const sandbox = {
    location: { search: "", protocol: "http:", pathname: "/games/bomber/", hostname: "127.0.0.1", href: "http://127.0.0.1/games/bomber/" },
    document: {
      getElementById(id) {
        if (id === "status") return stubStatus(rendered);
        if (id === "field") return stubCanvas(rendered);
        return null;
      },
    },
    WebSocket: class {
      constructor() { sockets.push(this); this.readyState = 1; }
      addEventListener() {}
      send() {}
      close() {}
    },
    URL,
    URLSearchParams,
    // The voxel driver's module scope needs these; a fresh vm realm has none.
    Uint8Array,
    Uint32Array,
    DataView,
    TextEncoder,
    TextDecoder,
    WebAssembly,
    console: { error: record, warn: record, log: record, info: record },
    setTimeout,
    queueMicrotask,
    AbortController,
    fetch: async () => { throw new Error("unused"); },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext("globalThis.window = globalThis;", context);
  sandbox.__lumioImport = async () => ({
    dotnet: {
      async create() {
        return {
          async getAssemblyExports() { return { Lumio: { Bomber: { Client: { Spectator: {} } } } }; },
          getConfig() { return { mainAssemblyName: "Lumio.Bomber.Client.Spectator" }; },
          async runMain() {},
        };
      },
    },
  });
  vm.runInContext(pageSourceForVm(), context, { filename: MAIN_PATH.href });
  await drain();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sandbox.__lumioSpectator.status, "failed");
  assert.match(String(sandbox.__lumioSpectator.status === "failed" ? rendered.at(-1) : ""), /exports missing|failed/);
  assert.equal(sockets.length, 0);
  assert.match(logged.join("\n"), /SpectatorExports missing/);
});

test("registered network timeout reconnects but protocol rejection does not", async () => {
  const timeout = await runPage();
  await timeout.sockets[0].deliver("pack");
  timeout.sockets[0]._emit("close", { code: 1008, reason: "connection_timeout", wasClean: true });
  await settle(() => timeout.sockets.length === 2);
  assert.equal(timeout.sockets.length, 2);
  const rejected = await runPage();
  await rejected.sockets[0].deliver("pack");
  rejected.sockets[0]._emit("close", { code: 1008, reason: "protocol_violation", wasClean: true });
  await drain();
  assert.equal(rejected.sockets.length, 1);
  assert.equal(rejected.fetchCalls.length, 0);
});

async function settle(done, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (done()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
}

const drain = () => new Promise((resolve) => setTimeout(resolve, 5));

function serialize(value) {
  const seen = new WeakSet();
  return (
    JSON.stringify(value, (_key, item) => {
      if (item === undefined) return "<undefined>";
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "<circular>";
        seen.add(item);
      }
      return item;
    }) ?? ""
  );
}

test("page source has no WorldChange / localPosition decoder", () => {
  assert.equal(MAIN_SOURCE.includes("module.exports"), false);
  assert.equal(MAIN_SOURCE.includes("require("), false);
  assert.equal(/\bWorldChange\b/.test(MAIN_SOURCE), false, "main.js must not name WorldChange");
  assert.equal(/\blocalPosition\b/.test(MAIN_SOURCE), false, "main.js must not decode localPosition");
  assert.equal(/\bLogicTransform\b/.test(MAIN_SOURCE), false, "main.js must not decode LogicTransform");
  assert.equal(/\badmissionCredential\b/.test(HTML_SOURCE), false);
  assert.doesNotMatch(MAIN_SOURCE, /IssueSelfMove|TakeOutbound|InputCommand/);
});

// ADR-078 决策 1: the browser voxel code is VoxelEngine's Rust. A second Section
// store, decoder or mesher anywhere in the page is a review reject, so the shape
// of the page is asserted, not just its behaviour.
test("the page carries no second Section store, decoder or mesher", () => {
  // Comments talk about what the page must NOT do; the ban is on code.
  const codeOf = (source) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  for (const [name, source] of [["main.js", MAIN_SOURCE], ["voxel-grid.mjs", VOXEL_SOURCE]]) {
    const code = codeOf(source);
    for (const banned of ["SectionStorage", "decodeSection", "mesher", "Mesher", "greedy", "palette", "Palette"]) {
      assert.equal(code.includes(banned), false, `${name} must not contain ${banned}`);
    }
    assert.equal(/\bsha256\b|\bSha256\b|createHash/.test(code), false, `${name} must not hash payloads`);
  }
  // Cell state has exactly one source, and main.js never touches the ABI itself.
  assert.match(VOXEL_SOURCE, /lumio_voxel_read_box/);
  // main.js may name the .wasm URL, but must never call the ABI itself.
  assert.equal(/exports\.lumio_voxel_/.test(codeOf(MAIN_SOURCE)), false, "main.js must go through voxel-grid.mjs, not the raw ABI");
  // 决策 4.3: every call site re-takes the buffer rather than caching a view.
  assert.equal(/const\s+\w*[mM]emoryView\s*=/.test(VOXEL_SOURCE), false);
  assert.match(VOXEL_SOURCE, /exports\.memory\.buffer/);
});

test("without the published .wasm the page says so and paints loading, never air", async () => {
  const page = await runPage();
  assert.equal(page.spectator.voxel.status, "unavailable");
  assert.match(page.spectator.voxel.error, /wasm_fetch_failed:404/);
  // Every column is unknown, so every column is loading and none is air.
  // Cross-realm objects are not reference-comparable; compare the numbers.
  assert.equal(page.spectator.voxel.cells.block, 0);
  assert.equal(page.spectator.voxel.cells.air, 0, "an unknown world must never report air");
  assert.equal(page.spectator.voxel.cells.loading, VOXEL_CELLS);
  // Only the last paint: `rendered` accumulates across every repaint, and each
  // paint starts with clearRect.
  const lastPaint = page.rendered.slice(page.rendered.lastIndexOf("clear"));
  const loadingRects = lastPaint.filter((entry) => entry === `rect:${LOADING_FILL}`);
  assert.equal(loadingRects.length, VOXEL_CELLS, "every unknown cell must be painted as loading");
  assert.equal(page.spectator.voxel.blockIds.length, 0);
});

test("SectionFrames are pulled out of C# as bytes and never parsed by the page", async () => {
  const header = JSON.stringify({
    tick: 1,
    sectionKey: "s:0:0:0",
    sectionX: 0,
    sectionY: 0,
    sectionZ: 0,
    sectionRevision: "1",
    encoding: "Uniform",
    payloadLength: 4,
    observerPresence: "absent",
    deliveryReason: "first",
    hasBaseSectionRevision: false,
    baseSectionRevision: "0",
    digestBytes: 32,
    payloadBytes: 4,
  });
  const bytes = new Uint8Array(36);
  const page = await runPage({ sectionFrames: [[header, bytes]], skipFrame: true });
  await page.sockets[0].deliver('{"messageType":"SectionFrame"}');

  assert.equal(page.runtime.sectionTakes, 1, "the page must pull the bytes through TakeSectionBytes");
  assert.equal(page.spectator.voxel.frames, 1);
  assert.equal(page.pendingSections.length, 0, "the host queue must be drained");
  // There is no voxel world to put them in here, and the page says that rather
  // than dropping them quietly or pretending the cells resolved.
  assert.match(page.spectator.voxel.error, /wasm_fetch_failed:404/);
  assert.equal(page.spectator.voxel.cells.air, 0);
});

test("the dump's entity type reaches the evidence object unchanged", async () => {
  const dumpJson = JSON.stringify([
    { id: "a".repeat(32), x: 4, z: 6, type: "player", self: true },
    { id: "b".repeat(32), x: 9, z: 2, type: "bomberBomb" },
  ]);
  const page = await runPage({ dumpJson });
  await page.sockets[0].deliver('{"messageType":"Welcome"}');
  assert.deepEqual(page.spectator.positions.map((row) => row.type), ["player", "bomberBomb"]);
});

test("connect uses lumio.mvp.v0 and lumio-admission token, credential stays out of URL", async () => {
  const page = await runPage({
    search: "?ws=" + encodeURIComponent("ws://127.0.0.1:9/"),
  });

  assert.equal(page.sockets.length, 1);
  const socket = page.sockets[0];
  assert.equal(socket.url, "ws://127.0.0.1:9/");
  assert.ok(!String(socket.url).includes(CREDENTIAL));
  assert.deepEqual(
    JSON.parse(JSON.stringify(socket.protocols)),
    ["lumio.mvp.v0", `lumio-admission.${CREDENTIAL}`],
  );
  assert.equal(page.win.location.search.includes(CREDENTIAL), false);
});

test("__lumioSpectator shape and dump paint, credential never in evidence", async () => {
  const dump = JSON.stringify([
    { id: "aa", x: 1, z: 2 },
    { id: "bb", x: -3, z: 8 },
  ]);
  const page = await runPage({
    search: "?ws=" + encodeURIComponent("ws://127.0.0.1:9/"),
    dumpJson: dump,
  });

  const spectator = page.spectator;
  assert.ok(spectator);
  assert.equal(typeof spectator.status, "string");
  assert.equal(typeof spectator.botCount, "number");
  assert.ok(Array.isArray(spectator.positions));
  assert.equal(typeof spectator.updatedAtMs, "number");
  assert.deepEqual(Object.keys(spectator).sort(), ["botCount", "lastError", "lastFrameType", "notServingCloses", "positions", "selfId", "status", "updatedAtMs", "voxel", "worldId"]);
  assert.deepEqual(Object.keys(spectator.voxel).sort(), ["abiVersion", "blockIds", "cells", "error", "frames", "lastDelivery", "sections", "status"]);
  assert.equal(spectator.lastError, null);
  assert.equal(spectator.lastFrameType, null);

  await page.sockets[0].deliver("pack");
  assert.equal(page.spectator.lastError, null);
  assert.equal(page.spectator.lastFrameType, "unparsed");
  assert.equal(page.spectator.botCount, 2);
  assert.equal(page.spectator.positions.length, 2);
  assert.equal(page.spectator.botCount, page.spectator.positions.length);
  assert.equal(page.spectator.positions[0].x, 1);
  assert.equal(page.spectator.positions[0].z, 2);

  const evidence = serialize(page.spectator);
  assert.equal(evidence.includes(CREDENTIAL), false);
  assert.equal(serialize(page.storage).includes(CREDENTIAL), false);
  assert.equal(page.win.location.search.includes(CREDENTIAL), false);
  assert.equal(String(page.sockets[0].url).includes(CREDENTIAL), false);
  for (const text of page.rendered) {
    assert.equal(String(text).includes(CREDENTIAL), false, `rendered leaked credential: ${text}`);
  }
  for (const line of page.logged) {
    assert.equal(String(line).includes(CREDENTIAL), false, `console leaked credential: ${line}`);
  }
  assert.equal(JSON.stringify(page.spectator).includes("admissionCredential"), false);
});

test("configured 19x19 map camera paints world cells onto the 640x480 canvas", async () => {
  assert.equal(MAIN_SOURCE.includes("const scale = 8"), false, "origin-centered scale=8 leaves x≈1100 off-canvas");
  assert.match(MAIN_SOURCE, /maxX: width/);
  const dump = JSON.stringify(
    Array.from({ length: 100 }, (_, i) => ({
      id: `id-${i}`,
      x: 1 + (i % 10) * 1.7,
      z: 1 + Math.floor(i / 10) * 1.7,
    })),
  );
  const page = await runPage({
    search: "?ws=" + encodeURIComponent("ws://127.0.0.1:9/"),
    dumpJson: dump,
  });
  await page.sockets[0].deliver("pack");
  assert.equal(page.spectator.botCount, 100);
  const lastClear = page.rendered.lastIndexOf("clear");
  assert.ok(lastClear >= 0, "paint must clear the canvas before drawing");
  const arcs = page.rendered.slice(lastClear + 1).filter((text) => String(text).startsWith("arc:"));
  assert.equal(arcs.length, 100);
  let minPx = Infinity;
  let maxPx = -Infinity;
  let minPy = Infinity;
  let maxPy = -Infinity;
  for (const text of arcs) {
    const [, pair] = String(text).split(":");
    const [x, y] = pair.split(",").map(Number);
    assert.ok(Number.isFinite(x) && Number.isFinite(y), text);
    assert.ok(x >= 0 && x <= 640, `canvas x out of range: ${x}`);
    assert.ok(y >= 0 && y <= 480, `canvas y out of range: ${y}`);
    if (x < minPx) minPx = x;
    if (x > maxPx) maxPx = x;
    if (y < minPy) minPy = y;
    if (y > maxPy) maxPy = y;
  }
  assert.ok(maxPx - minPx > 200, `19x19 map should span the canvas, spanX=${maxPx - minPx}`);
  assert.ok(maxPy - minPy > 150, `19x19 map should span the canvas, spanY=${maxPy - minPy}`);
});

test("Welcome identifies self while current player dots remain neutral", async () => {
  const dump = JSON.stringify([
    { id: "00000000000000010000000000000002", x: 4, z: 6, type: "player", name: "Alice", characterId: 118001, characterName: "rabbit" },
    { id: "00000000000000010000000000000003", x: 16, z: 16, type: "player", name: null, characterId: null, characterName: null },
  ]);
  const page = await runPage({ dumpJson: dump });
  await page.sockets[0].deliver(JSON.stringify({
    connectionGeneration: 1, instanceId: "1", messageType: "Welcome",
    selfNetEntityId: "00000000000000010000000000000002",
  }));
  assert.equal(page.spectator.selfId, "00000000000000010000000000000002");
  assert.equal(page.spectator.positions[0].characterName, "rabbit");
  assert.equal(page.spectator.positions[1].name, null);
  const after = page.rendered.slice(page.rendered.lastIndexOf("clear") + 1);
  assert.equal(after.filter((text) => text === "fill:hsla(0, 0%, 65%, 0.75)").length, 2);
  assert.ok(after.includes("stroke:rgba(255,255,255,0.85)"));
  assert.equal(page.sockets[0].sent?.length ?? 0, 0, "spectator must never send gameplay input");
});

test("authenticated launch room reaches the replica and a missing room remains empty", async () => {
  const platform = await runPage({ injectLaunch: false, launch: LAUNCH });
  assert.deepEqual(platform.runtime.bootRooms, ["room-from-platform"]);
  const missing = await runPage({ injectLaunch: false, launch: { ...LAUNCH, roomId: undefined } });
  assert.deepEqual(missing.runtime.bootRooms, [""]);
  const local = await runPage({ search: "?ws=ws://127.0.0.1:9110/", launch: LAUNCH });
  assert.deepEqual(local.runtime.bootRooms, ["room-from-platform"]);
});

test("active spectator sends no gameplay input after repeated replica frames", async () => {
  const page = await runPage({ dumpJson: JSON.stringify([{ id: "self", x: 4, z: 6, self: true, type: "player" }]) });
  for (let frame = 0; frame < 5; frame++) await page.sockets[0].deliver("pack");
  assert.equal(page.spectator.status, "connected");
  assert.equal(page.sockets[0].sent?.length ?? 0, 0);
  assert.equal(page.runtime.gameplayInputs ?? 0, 0);
});
test("file: protocol reports that ES modules need a static server", async () => {
  const page = await runPage({
    protocol: "file:",
    search: "",
    injectLaunch: false,
    settleTimeoutMs: 400,
  });
  const status = String(page.spectator?.status ?? "");
  const rendered = page.rendered.join(" ");
  assert.ok(
    status === "static" || /static server/i.test(rendered),
    `expected static-server status, got status=${status} rendered=${rendered}`,
  );
});

// ADR-120: not_serving (1013) = the DS at this address has not opened yet. While connecting the page
// dials the same launch again after a bounded backoff; it is neither a healthy close nor a failure.
test("not_serving while connecting redials the same launch after the backoff, then connects", async () => {
  const timerDelays = [];
  const page = await runPage({ timerDelays });
  page.sockets[0]._emit("close", { code: 1013, reason: "not_serving", wasClean: true });
  await drain();
  assert.equal(page.spectator.notServingCloses, 1);
  await settle(() => page.sockets.length === 2);
  assert.equal(page.sockets.length, 2);
  assert.deepEqual(timerDelays, [500]);
  // Same address, same credential: no Platform round trip, no new ticket.
  assert.equal(page.fetchCalls.length, 0);
  assert.equal(page.sockets[1].url, page.sockets[0].url);
  assert.deepEqual(Array.from(page.sockets[1].protocols), Array.from(page.sockets[0].protocols));
  assert.deepEqual(page.runtime.bootRooms, ["room-from-platform", "room-from-platform"]);
  assert.notEqual(page.spectator.status, "closed");
  assert.notEqual(page.spectator.status, "failed");
  await page.sockets[1].deliver("pack");
  assert.equal(page.spectator.status, "connected");
  assert.equal(page.spectator.lastError, null);
});

test("not_serving past the bound fails the connect instead of redialling forever", async () => {
  const timerDelays = [];
  const page = await runPage({ timerDelays });
  for (let close = 1; close <= 6; close++) {
    page.sockets.at(-1)._emit("close", { code: 1013, reason: "not_serving", wasClean: true });
    await settle(() => page.sockets.length === close + 1);
    assert.equal(page.sockets.length, close + 1);
  }
  page.sockets.at(-1)._emit("close", { code: 1013, reason: "not_serving", wasClean: true });
  await drain();
  assert.deepEqual(timerDelays, [500, 1000, 2000, 4000, 4000, 4000]);
  assert.equal(page.sockets.length, 7);
  assert.equal(page.spectator.status, "failed");
  assert.equal(page.spectator.lastError, "not_serving_exhausted");
  assert.equal(page.spectator.notServingCloses, 7);
  assert.equal(page.fetchCalls.length, 0);
});

// A redial the page owes lands within a few ms once its (recorded, zero-length) timer fires; this
// window is far longer, so "still one socket" after it means nothing was ever going to dial.
const NO_REDIAL_WINDOW_MS = 300;

// ADR-120 adds nothing after entering the game, and a DS that follows it sends not_serving only to a
// connection it has not admitted. Once active it is a peer contract violation: the page fails, like
// on internal_error, and neither redials the launch nor asks the Platform for a new ticket.
test("not_serving once active is a peer contract violation and fails the page", async () => {
  const timerDelays = [];
  const page = await runPage({ timerDelays, fetchLaunch: () => ({ ...LAUNCH, admissionCredential: "fresh-ticket" }) });
  await page.sockets[0].deliver("pack");
  assert.equal(page.spectator.status, "connected");
  page.sockets[0]._emit("close", { code: 1013, reason: "not_serving", wasClean: true });
  await settle(() => page.sockets.length > 1, NO_REDIAL_WINDOW_MS);
  assert.equal(page.sockets.length, 1);
  assert.deepEqual(timerDelays, []);
  assert.equal(page.fetchCalls.length, 0);
  assert.equal(page.spectator.status, "failed");
  assert.equal(page.spectator.lastError, "not_serving");
  assert.equal(page.spectator.notServingCloses, 1);
});

// shutdown is a normal end in every phase (ADR-120 decision 3): a draining DS answers new connections
// with it, and retrying a process that is going away is what keeping it apart from not_serving prevents.
for (const phase of ["connecting", "active"]) {
  test(`shutdown while ${phase} ends the page closed and opens no new socket`, async () => {
    const timerDelays = [];
    const page = await runPage({ timerDelays, fetchLaunch: () => ({ ...LAUNCH, admissionCredential: "fresh-ticket" }) });
    if (phase === "active") {
      await page.sockets[0].deliver("pack");
      assert.equal(page.spectator.status, "connected");
    }
    page.sockets[0]._emit("close", { code: 1000, reason: "shutdown", wasClean: true });
    await settle(() => page.sockets.length > 1, NO_REDIAL_WINDOW_MS);
    assert.equal(page.sockets.length, 1);
    assert.deepEqual(timerDelays, []);
    assert.equal(page.fetchCalls.length, 0);
    assert.equal(page.spectator.status, "closed");
    assert.equal(page.spectator.lastError, null);
    assert.equal(page.spectator.notServingCloses, 0);
  });
}

// The bound is per connect phase: reaching active ends the phase, so a later recovery that meets a
// DS still starting gets the full bound again, and its schedule starts over at the initial delay.
test("reaching active gives the next connect phase a fresh not_serving bound", async () => {
  const timerDelays = [];
  const page = await runPage({ timerDelays, fetchLaunch: () => ({ ...LAUNCH, admissionCredential: "fresh-ticket" }) });
  for (let close = 1; close <= 6; close++) {
    page.sockets.at(-1)._emit("close", { code: 1013, reason: "not_serving", wasClean: true });
    await settle(() => page.sockets.length === close + 1);
  }
  assert.equal(page.sockets.length, 7);
  await page.sockets[6].deliver("pack");
  assert.equal(page.spectator.status, "connected");
  // An ordinary drop once active: recovery takes a fresh ticket and opens a new connect phase.
  page.sockets[6]._emit("close", { code: 1006, reason: "", wasClean: false });
  await settle(() => page.sockets.length === 8);
  assert.equal(page.sockets.length, 8);
  page.sockets[7]._emit("close", { code: 1013, reason: "not_serving", wasClean: true });
  await settle(() => page.sockets.length === 9);
  assert.equal(page.sockets.length, 9);
  assert.deepEqual(timerDelays, [500, 1000, 2000, 4000, 4000, 4000, 500]);
  assert.deepEqual(Array.from(page.sockets[8].protocols), Array.from(page.sockets[7].protocols));
  assert.notEqual(page.spectator.status, "failed");
  assert.equal(page.spectator.lastError, null);
  assert.equal(page.spectator.notServingCloses, 7);
});

test("internal server failure is terminal failure, not a healthy close or reconnect", async () => {
  const page = await runPage();
  page.sockets[0]._emit("close", { code: 1011, reason: "internal_error", wasClean: true });
  assert.equal(page.spectator.status, "failed");
  assert.equal(page.spectator.lastError, "internal_error");
  assert.equal(page.runtime.closes, 1);
  assert.equal(page.sockets.length, 1);
});

// README「Closes」: every server close code main.js compares against or sends comes from the generated
// ds-close-codes.mjs. The one close code it writes as a number is 1006, which the browser reports itself
// for a drop without a close frame (RFC 6455 §7.1.5) and no endpoint may send (§7.4.1) — so it is not,
// and cannot be, in the DS table.
test("main.js names every server close code; the one number is the browser's own 1006", async () => {
  const { DS_CLOSE_CODES } = await import(clientPart("ds-close-codes.mjs").href);
  const code = MAIN_SOURCE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  // A close code written as a number: compared with `.code` on either side, or passed to close().
  assert.equal(code.match(/\.code\s*[!=]==?\s*\d|\d\s*[!=]==?\s*[\w.]*\.code\b|\.close\(\s*\d/g), null);
  assert.deepEqual(code.match(/\b\d{4}\b/g), ["1006"]);
  assert.match(code, /const ABNORMAL_CLOSURE = 1006;/);
  assert.equal(Object.values(DS_CLOSE_CODES).includes(1006), false);
});

// R-00710: the page belongs to whichever game the Platform serves it as. The slug is read
// off /games/<slug>/ and nowhere else; the source names no game in its launch path.
for (const slug of ["bomber", "other-game"]) {
  test(`platform launch asks for the game named by the /games/${slug}/ path`, async () => {
    const page = await runPage({ pathname: `/games/${slug}/`, injectLaunch: false });
    assert.deepEqual(page.fetchCalls.map((call) => [call.method, call.url]), [
      ["GET", "/api/account/me"],
      ["POST", `/api/games/${slug}/launch`],
    ]);
    assert.equal(page.fetchCalls[1].credentials, "same-origin");
    assert.equal(page.fetchCalls[1].csrf, "test-csrf");
    assert.equal(page.sockets.length, 1);
  });
}

test("the published index.html path names the same game as its directory", async () => {
  const page = await runPage({ pathname: "/games/other-game/index.html", injectLaunch: false });
  assert.equal(page.fetchCalls.at(-1).url, "/api/games/other-game/launch");
});

test("recovery takes its fresh ticket from the same path-derived game", async () => {
  const page = await runPage({ pathname: "/games/other-game/", fetchLaunch: () => ({ ...LAUNCH, admissionCredential: "fresh-ticket" }) });
  await page.sockets[0].deliver("pack");
  page.sockets[0]._emit("close", { code: 1006, reason: "", wasClean: false });
  await settle(() => page.sockets.length === 2);
  assert.equal(page.sockets.length, 2);
  assert.equal(page.fetchCalls.at(-1).url, "/api/games/other-game/launch");
});

for (const pathname of ["/Client/UI/Spectator/", "/", "/games/", "/games//", "/games/bomber/extra/", "/games/%2E%2E/", "/other/bomber/"]) {
  test(`a page at ${pathname} names no game: it fails loudly and asks the Platform for nothing`, async () => {
    const page = await runPage({ pathname, injectLaunch: false, settleTimeoutMs: 300 });
    assert.equal(page.spectator.status, "failed");
    assert.equal(page.spectator.lastError, "game_slug_unresolved");
    assert.equal(page.fetchCalls.length, 0, "no account or launch request without a game");
    assert.equal(page.sockets.length, 0);
    assert.match(page.logged.join("\n"), /game_slug_unresolved/);
  });
}

test("recovery on a page with no game in its path fails instead of guessing one", async () => {
  const page = await runPage({ pathname: "/Client/UI/Spectator/" });
  await page.sockets[0].deliver("pack");
  page.sockets[0]._emit("close", { code: 1006, reason: "", wasClean: false });
  await settle(() => page.spectator.status === "failed", 500);
  assert.equal(page.spectator.status, "failed");
  assert.equal(page.spectator.lastError, "game_slug_unresolved");
  assert.equal(page.fetchCalls.length, 0);
  assert.equal(page.sockets.length, 1);
});

test("main.js carries no game name in its launch path", () => {
  const code = MAIN_SOURCE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.doesNotMatch(code, /\/api\/games\/[A-Za-z0-9]/, "launch path must be built from the derived slug");
  assert.match(code, /\/api\/games\/\$\{encodeURIComponent\(slug\)\}\/launch/);
});

// R-00710: plaintext ws: to a loopback DS follows the page's own origin, not a URL flag.
test("a page served from a non-loopback origin refuses a plaintext loopback DS, flag or not", async () => {
  for (const search of ["", "?allowLoopback=1"]) {
    const page = await runPage({
      search,
      protocol: "https:",
      hostname: "play.example",
      launch: { ...LAUNCH, wsUrl: "ws://127.0.0.1:9/" },
      settleTimeoutMs: 300,
    });
    assert.equal(page.sockets.length, 0, `search=${search}`);
    assert.equal(page.spectator.status, "failed");
  }
});

test("a page served from loopback may dial a plaintext loopback DS", async () => {
  const page = await runPage({ hostname: "localhost", launch: { ...LAUNCH, wsUrl: "ws://127.0.0.1:9/" } });
  assert.equal(page.sockets.length, 1);
  assert.equal(page.sockets[0].url, "ws://127.0.0.1:9/");
});

test("player startup requires both new GAS exports and presentation callbacks send their commands", async () => {
  const section = (start, end) => MAIN_SOURCE.slice(MAIN_SOURCE.indexOf(start), MAIN_SOURCE.indexOf(end));
  const bind = section('function bindExports(api)', 'async function loadWasmExports');
  const route = section('function sendPlayerCommand(kind, createFrames)', 'async function initializePage');
  const presentation = section('function updateGamePresentation()', 'const csharp = {')
    .replace("import('./game-view.mjs')", 'globalThis.importGameView()');
  const sent = [];
  let callbacks;
  const sandbox = {
    JSON, Date,
    api: {
      Boot() {}, Close() {}, ConnectionState() { return 'active'; }, OnBytes() {}, OnFrame() {},
      DumpPositions() { return '[]'; }, MapDimensions() { return '{}'; }, PlayerState() { return '{}'; },
      SendMove() { return '["move"]'; }, PlaceBomb() { return '["bomb"]'; },
      UseActiveSkill() { return '["skill"]'; }, SelectCharacter(id) { return JSON.stringify([`character:${id}`]); },
      PresentationState() { return '{}'; },
    },
    importGameView: async () => ({ createGameView: value => {
      callbacks = value;
      return { update() {} };
    } }),
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(`
    const PLAYER_MODE = true;
    const csharp = {};
    let developmentSession;
    let gameView, gameViewLoading, gameViewGeneration = 0;
    const voxelGrid = {};
    const player = { inputsSent: 0, movesSent: 0, bombsSent: 0, skillsSent: 0, selectionsSent: 0,
      replica: { phase: 'Warmup', inputOpen: true, inputEnabled: true, selfId: 'self' } };
    const playerInput = { clear() {} };
    const spectator = { lastError: null };
    const currentSocket = { readyState: 1, send: value => globalThis.sent.push(value) };
    const active = true;
    function setStatus() {}
    function utf8ByteLength(value) { return value.length; }
  `, context);
  sandbox.sent = sent;
  vm.runInContext(bind + route + presentation, context);
  const incomplete = { ...sandbox.api };
  delete incomplete.UseActiveSkill;
  assert.throws(() => sandbox.bindExports(incomplete), /Player input exports missing/);
  delete incomplete.SelectCharacter;
  assert.throws(() => sandbox.bindExports(incomplete), /Player input exports missing/);
  sandbox.bindExports(sandbox.api);
  sandbox.updateGamePresentation();
  await settle(() => Boolean(callbacks));
  callbacks.onUseSkill();
  callbacks.onChangeCharacter('duck');
  callbacks.onPlaceBomb();
  assert.deepEqual(sent, ['skill', 'character:duck', 'bomb']);
  assert.equal(vm.runInContext('player.skillsSent', context), 1);
  assert.equal(vm.runInContext('player.selectionsSent', context), 1);
  assert.equal(vm.runInContext('player.bombsSent', context), 1);
  vm.runInContext("player.replica = { phase: 'WaitingForWorldReady', inputOpen: false, inputEnabled: true, selfId: 'self' }", context);
  callbacks.onChangeCharacter('cat');
  callbacks.onUseSkill();
  callbacks.onPlaceBomb();
  assert.deepEqual(sent, ['skill', 'character:duck', 'bomb', 'character:cat']);
  vm.runInContext("player.replica = { phase: 'Results', inputOpen: false, inputEnabled: true, selfId: 'self' }", context);
  callbacks.onChangeCharacter('kangaroo');
  assert.deepEqual(sent, ['skill', 'character:duck', 'bomb', 'character:cat', 'character:kangaroo']);
  for (const phase of ['Running', 'FinalCircle', 'Podium']) {
    vm.runInContext(`player.replica = { phase: '${phase}', inputOpen: true, inputEnabled: true, selfId: 'self' }`, context);
    callbacks.onChangeCharacter('closed');
  }
  vm.runInContext("player.replica = { phase: 'WaitingForWorldReady', inputOpen: false, inputEnabled: true, selfId: null }", context);
  callbacks.onChangeCharacter('missing-self');
  vm.runInContext("player.replica = { phase: 'Results', inputOpen: false, inputEnabled: false, selfId: 'self' }", context);
  callbacks.onChangeCharacter('input-disabled');
  assert.deepEqual(sent, ['skill', 'character:duck', 'bomb', 'character:cat', 'character:kangaroo']);
  assert.equal(vm.runInContext('player.selectionsSent', context), 3);
});

test("the page no longer reads an allowLoopback query parameter", () => {
  assert.equal(MAIN_SOURCE.includes('params.get("allowLoopback")'), false);
});

test("the voxel world is opened with the game's catalog v2; without it the page says so and paints loading", async () => {
  const missing = await runPage({ catalogResponse: { ok: false, status: 404 } });
  assert.equal(missing.spectator.voxel.status, "unavailable");
  assert.equal(missing.spectator.voxel.error, "catalog_unavailable");
  assert.equal(missing.spectator.voxel.cells.air, 0, "an unknown world must never report air");
  assert.equal(missing.spectator.voxel.cells.loading, VOXEL_CELLS);
  assert.equal(missing.fetchCalls.length, 0, "the catalog is a static asset, not a Platform call");
  // With the catalog the page gets as far as the module fetch.
  const present = await runPage();
  assert.match(present.spectator.voxel.error, /wasm_fetch_failed:404/);
});
