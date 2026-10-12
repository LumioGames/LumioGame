(function (w) {
  'use strict';
  var script = w.document.currentScript;
  var raw = script?.dataset.platformOrigin || new URLSearchParams(w.location.search).get('lumioOrigin');
  var origin = '';
  try {
    var url = new URL(raw);
    if (/^https?:$/.test(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) origin = url.origin;
  } catch { /* Unconfigured: silent until used. */ }
  function send(data) {
    if (!origin) throw new Error('Configure the Lumio platform origin.');
    if (w.parent === w) throw new Error('Lumio requires a parent game container.');
    w.parent.postMessage(data, origin);
  }
  function score(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Score must be a finite number.');
    return value;
  }
  function listen(type, callback) {
    function receive(event) {
      if (origin && event.origin === origin && event.source === w.parent && event.data?.type === type) callback();
    }
    w.addEventListener('message', receive);
    return function () { w.removeEventListener('message', receive); };
  }

  // Perf: cumulative snapshots.
  var perfEnabled = script?.dataset.perf !== 'off';
  var BAND_EDGES_FPS = [15, 24, 30, 40, 50, 58, 70];
  var bands = Array(8).fill(0);
  var frames = 0, frameMs = 0, longTaskMs = 0;
  var longTasks = null; // Null = unmeasurable: omitted, not zero.
  var running = false, paused = false, lastFrameAt = null, sentFrames = 0;

  // Paused or hidden time is skipped; the next frame is a baseline.
  function rebase() { lastFrameAt = null; }
  function onFrame(now) {
    if (!running) return;
    w.requestAnimationFrame(onFrame);
    var interval = now - lastFrameAt;
    // A second or more is a stall, not a frame rate.
    if (!paused && !w.document.hidden && lastFrameAt !== null && interval > 0 && interval < 1000) {
      bands[BAND_EDGES_FPS.filter(edge => 1030 / interval >= edge).length]++; // 3% slack: whole-ms timestamps read 30 fps as 29.4.
      frames++;
      frameMs += interval;
    }
    lastFrameAt = now;
  }
  function flush() {
    if (!running || frames === sentFrames) return;
    try {
      var perf = { v: 1, n: frames, ms: Math.round(frameMs), b: bands.slice() };
      if (longTasks !== null) { perf.long = longTasks; perf.longMs = Math.round(longTaskMs); }
      var heapMb = Math.round(w.performance?.memory?.usedJSHeapSize / 1048576); // NaN outside Chromium.
      if (heapMb >= 1) perf.mem = heapMb;
      send({ type: 'lumio:perf', perf });
      sentFrames = frames;
    } catch { /* Best effort: never throws into the game. */ }
  }
  function startPerf() {
    if (!perfEnabled || running || !w.requestAnimationFrame) return;
    running = true;
    listen('lumio:pause', () => { paused = true; flush(); });
    listen('lumio:resume', () => { paused = false; rebase(); });
    w.addEventListener('visibilitychange', rebase);
    w.setInterval(flush, 15000);
    w.setTimeout(flush, 4000); // Early exits close before the 15s tick.
    try {
      if (w.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
        new w.PerformanceObserver(list => list.getEntries().forEach(entry => {
          // Only the game's own context, not its ancestors.
          if (entry.name === 'self') { longTasks++; longTaskMs += entry.duration; }
        })).observe({ type: 'longtask' });
        longTasks = 0;
      }
    } catch { /* Optional. */ }
    w.requestAnimationFrame(onFrame);
  }

  // Errors: uncaught errors, unhandled rejections and lumio.error(err). Best effort like perf; data-errors="off" silences all three.
  var errorsEnabled = script?.dataset.errors !== 'off';
  var errorsSent = 0, lastError = '';
  function cut(value, max) { return typeof value === 'string' && value ? value.slice(0, max) : undefined; }
  function json(value) { try { return JSON.stringify(value); } catch { return undefined; } }
  function report(kind, value, at) {
    if (!errorsEnabled || errorsSent >= 20) return;
    try {
      // Duck-typed rather than instanceof: the error may come from another realm.
      var isText = typeof value === 'string', named = !isText && typeof value?.message === 'string';
      var message = cut(isText ? value : named ? value.message : json(value), 300) || 'Unknown error';
      var data = { type: 'lumio:error', v: 1, kind, message };
      var name = named ? cut(value.name, 64) : undefined, stack = named ? cut(value.stack, 2048) : undefined;
      at = cut(at, 200);
      if (name) data.name = name;
      if (stack) data.stack = stack;
      if (at) data.at = at;
      var key = [kind, name, message, at].join('|');
      if (key === lastError) return; // Only a repeat right after itself: A,B,A is three reports.
      lastError = key;
      errorsSent++;
      send(data);
    } catch { /* Revoked proxies, throwing getters, no parent: the game must never notice. */ }
  }
  if (errorsEnabled) {
    w.addEventListener('error', e => report('error', e.error ?? e.message, e.filename && e.filename + ':' + e.lineno + ':' + e.colno));
    w.addEventListener('unhandledrejection', e => report('rejection', e.reason ?? 'Unhandled promise rejection'));
  }

  w.lumio = Object.freeze({
    ready: function () { send({ type: 'lumio:ready' }); startPerf(); },
    score: function (value) { send({ type: 'lumio:score', score: score(value) }); },
    end: function (result = {}) {
      var data = { type: 'lumio:end', completed: true };
      if (result.score !== undefined) data.score = score(result.score);
      flush();
      send(data);
      running = perfEnabled = false;
    },
    onPause: function (callback) { return listen('lumio:pause', callback); },
    onResume: function (callback) { return listen('lumio:resume', callback); },
    error: function (err) { report('manual', err); }
  });
})(window);
