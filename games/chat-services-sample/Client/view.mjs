export const stickers = Object.freeze({ 开心: 5, 加油: 10, 抱抱: 6, 挥手: 9 });
export function messageParts(text) {
  const parts = [], pattern = /\[精灵:(开心|加油|抱抱|挥手)\]/gu;
  let previous = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > previous) parts.push({ text: text.slice(previous, match.index) });
    parts.push({ sticker: match[1], frame: stickers[match[1]] }); previous = match.index + match[0].length;
  }
  if (previous < text.length) parts.push({ text: text.slice(previous) });
  return parts;
}
export const shouldSubmitKey = event => event.key === 'Enter' && !event.isComposing && event.keyCode !== 229 && !event.shiftKey;
const errorMessage = error => error.code === 'gs_bridge_user_action_required'
  ? '请使用游戏外侧平台的“资料授权”按钮。' : error.code ?? error.message;

// Observe exact receipts before session.act/recover consume them; forwarding does not alter SDK semantics.
export function createOperationTracker(sdk) {
  let current;
  const same = (left, right) => left?.operationId === right.operationId && left?.operationEpoch === right.operationEpoch;
  function apply(record, result) { record.status = result.status; record.error = result.error; }
  return {
    get current() { return current; },
    reconcile(event) { if (event.method === 'getOperation' && event.operation && same(current, event.operation)) apply(current, event.result); },
    sdk: {
      get unresolvedOperations() { return sdk.unresolvedOperations; },
      setOnline: (...args) => sdk.setOnline(...args), dispose: (...args) => sdk.dispose(...args),
      async request(method, body) {
        if (method !== 'performAction') return sdk.request(method, body);
        const record = { operationId: body.operationId, operationEpoch: body.operationEpoch, status: 'unknown' }; current = record;
        try { const result = await sdk.request(method, body); apply(record, result); return result; }
        catch (error) { record.error = error; record.status = error.unknown ? 'unknown' : 'failed'; throw error; }
      },
      async recover(operation, ...args) {
        const record = current, result = await sdk.recover(operation, ...args);
        if (same(record, operation)) apply(record, result);
        return result;
      },
    },
  };
}

export function createChatController(session, { operations, notify = () => {}, clearDraft = () => {}, onBusy = () => {},
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let busy = false, generation = 0, identity, attempt;
  const alive = captured => captured === generation && session.current.mode === 'official';
  function confirmed(operation) {
    const state = session.current;
    return alive(operation.generation) && operation.receipt?.status === 'committed' && !state.pending.length && (operation.action === 'begin'
      ? state.view?.started === true : state.view?.messageCount > operation.count);
  }
  function finish(operation) {
    if (!confirmed(operation)) return false;
    if (operation.action === 'send') clearDraft(operation.text);
    attempt = undefined; notify(operation.action === 'begin' ? '已进入我的云消息' : '消息已由服务器确认'); return true;
  }
  async function recoverOperation(operation) {
    for (const wait of [0, 400, 1000, 1800]) {
      if (wait) await delay(wait);
      if (!alive(operation.generation)) return false;
      try { await session.recover(); }
      catch (error) { notify(errorMessage(error)); }
      if (!alive(operation.generation)) return false;
      if (!session.current.pending.length) break;
    }
    if (finish(operation)) return true;
    if (alive(operation.generation)) {
      notify(session.current.pending.length ? `结果尚未确认（${operation.receipt?.status ?? 'unknown'}），请查询原操作；不要重复发送。`
        : operation.receipt?.error?.code ?? operation.failure ?? '服务器未确认本次操作，草稿已保留。');
      if (!session.current.pending.length) attempt = undefined;
    }
    return false;
  }
  async function act(action, text) {
    if (busy) return false;
    const state = session.current;
    if (state.pending.length) { notify('结果尚未确认，请查询原操作；不要重复发送。'); return false; }
    if (action === 'send' && (!text || text.length > 200)) { notify('消息需要 1–200 个字符。'); return false; }
    if (state.mode === 'trial' && action === 'send') {
      const count = state.view?.messageCount; session.trial(text);
      if (session.current.view?.messageCount > count) { clearDraft(text); notify('离线试玩消息 · 不保存'); return true; }
      return false;
    }
    if (state.mode !== 'official' || !state.view || (action === 'send' && !state.view.canSend) || (action === 'begin' && state.view.started)) return false;
    const operation = { action, text, count: state.view.messageCount, generation };
    const previousReceipt = operations?.current;
    attempt = operation; busy = true; onBusy(true);
    try {
      try { await session.act(action, action === 'send' ? { text } : {}); }
      catch (error) { operation.failure = errorMessage(error); }
      if (operations?.current !== previousReceipt) operation.receipt = operations.current;
      if (!alive(operation.generation)) return false;
      if (!session.current.pending.length && !confirmed(operation)) operation.failure ??= session.current.message;
      return await recoverOperation(operation);
    } finally { busy = false; onBusy(false); }
  }
  return {
    observe(state) {
      const next = `${state.mode}:${state.profile?.playerId ?? ''}`;
      if (next !== identity) { generation++; identity = next; attempt = undefined; }
    },
    cancel() { generation++; attempt = undefined; },
    submit: text => act('send', text.trim()), begin: () => act('begin'),
    async recover() {
      if (busy || session.current.mode !== 'official') return false;
      busy = true; onBusy(true);
      try {
        if (attempt) return await recoverOperation(attempt);
        await session.recover();
        if (session.current.pending.length) notify('结果尚未确认，请继续查询原操作；不要重复发送。');
        return !session.current.pending.length;
      } catch (error) { notify(errorMessage(error)); return false; }
      finally { busy = false; onBusy(false); }
    },
  };
}

const avatarKey = profile => profile?.avatarResourceId && typeof profile.playerId === 'string'
  && Number.isSafeInteger(profile.consentRevision) && Number.isSafeInteger(profile.policyRevision)
  ? JSON.stringify([profile.playerId, profile.avatarResourceId, profile.consentRevision, profile.policyRevision]) : null;
export function createAvatarCache(sdk, changed = () => {}) {
  let generation = 0, active = new Set();
  const cache = new Map();
  return {
    invalidate() { generation++; active.clear(); cache.clear(); },
    url(profile) { const key = avatarKey(profile); return active.has(key) ? cache.get(key)?.url ?? null : null; },
    project(profiles) {
      active = new Set(profiles.map(avatarKey).filter(Boolean));
      for (const key of cache.keys()) if (!active.has(key)) cache.delete(key);
      for (const profile of profiles) {
        const key = avatarKey(profile);
        if (!key || cache.has(key)) continue;
        const captured = generation, entry = { url: null }; cache.set(key, entry);
        void (async () => {
          try {
            const result = await sdk.request('getAvatar', { resourceId: profile.avatarResourceId });
            if (captured !== generation || !active.has(key) || cache.get(key) !== entry) return;
            if (result.resourceId !== profile.avatarResourceId || result.mimeType !== 'image/webp'
              || result.consentRevision !== profile.consentRevision || result.policyRevision !== profile.policyRevision
              || typeof result.bytesBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.bytesBase64)) return;
            entry.url = `data:image/webp;base64,${result.bytesBase64}`; changed();
          } catch { /* A denied avatar keeps the anonymous/profile initial. */ }
        })();
      }
    },
  };
}

export function createChatView(document, sdk, operations) {
  const element = id => document.getElementById(id);
  const node = (tag, className, text) => { const value = document.createElement(tag); if (className) value.className = className; if (text !== undefined) value.textContent = text; return value; };
  let session, controller, state, busy = false, tab = 'messages', lastRecent;
  const name = profile => profile?.displayName ?? profile?.anonymousName ?? '匿名玩家';
  const avatars = createAvatarCache(sdk, () => draw());
  const notify = text => { element('message').textContent = text; };
  function avatar(profile) {
    const value = node('span', 'avatar', profile?.displayName ? Array.from(profile.displayName)[0] : '匿');
    value.setAttribute('aria-label', profile?.displayName ? `${name(profile)}的头像` : '匿名头像');
    const url = avatars.url(profile);
    if (url) { const image = node('img'); image.src = url; image.alt = `${name(profile)}的授权头像`; value.replaceChildren(image); }
    return value;
  }
  function spirit(frame = 0, animated = false) {
    const value = node('span', `spirit${animated ? ' animated' : ''}`);
    value.style.backgroundPosition = `${frame % 4 * 100 / 3}% ${Math.floor(frame / 4) * 100 / 3}%`; value.setAttribute('aria-hidden', 'true'); return value;
  }
  function draw() {
    if (!state) return;
    document.body.dataset.mode = state.mode;
    element('mode').textContent = { official: '云存档已连接', trial: '离线试玩 · 不保存', retired: '请重新打开', connecting: '正在连接' }[state.mode];
    element('player').textContent = name(state.profile); element('count').textContent = state.view?.messageCount ?? '—';
    element('identity-avatar').replaceChildren(avatar(state.profile));
    const official = state.mode === 'official', trial = state.mode === 'trial', pending = state.pending.length > 0;
    element('begin').hidden = !official || !state.view || state.view.started;
    element('begin').disabled = busy || pending || !official || !state.view || state.view.started;
    element('send').disabled = busy || pending || !(official || trial) || !state.view?.canSend;
    element('box').disabled = !(official || trial) || !state.view?.canSend;
    element('emoji').disabled = element('send').disabled;
    element('send').setAttribute('aria-busy', String(busy));
    for (const id of ['login', 'permissions', 'ranks']) element(id).disabled = !official || busy;
    element('recover').disabled = !official || busy || !pending;
    element('recover').hidden = !pending;
    element('reconnect').disabled = !trial || busy; element('trial').disabled = !official || busy;
    element('emoji-panel').hidden ||= element('emoji').disabled;
    element('emoji').setAttribute('aria-expanded', String(!element('emoji-panel').hidden));
    element('messages-panel').hidden = tab !== 'messages'; element('leaderboard-panel').hidden = tab !== 'ranks';
    element('messages-tab').setAttribute('aria-selected', String(tab === 'messages'));
    element('ranks').setAttribute('aria-selected', String(tab === 'ranks'));
    const recent = state.view?.recent ?? [], serialized = JSON.stringify(recent);
    const list = element('msgs'), oldScroll = list.scrollTop;
    list.replaceChildren(...recent.map((text, index) => {
      const li = node('li', 'chat-message mine'), body = node('div', 'message-body');
      body.append(node('div', 'message-meta', `${name(state.profile)} · ${trial ? '本地试玩' : '已确认'} ${Math.max(1, (state.view.messageCount ?? recent.length) - recent.length + index + 1)}`));
      const bubble = node('div', 'bubble');
      for (const part of messageParts(text)) {
        if ('text' in part) bubble.append(node('span', null, part.text));
        else { const sticker = node('span', 'sticker'); sticker.append(spirit(part.frame), node('span', null, part.sticker)); bubble.append(sticker); }
      }
      body.append(bubble); li.append(avatar(state.profile), body); return li;
    }));
    if (!recent.length) {
      const empty = node('li', 'empty-state'); empty.append(spirit(0, true), node('strong', null, '留一句话，让灵光相伴'),
        node('span', null, state.view?.started ? '发送后，这里会保留你的最近 20 条消息。' : '进入后即可开始保存我的云消息。')); list.append(empty);
    }
    list.scrollTop = lastRecent === serialized ? oldScroll : list.scrollHeight; lastRecent = serialized;
    element('rows').replaceChildren(...state.rows.map(row => {
      const li = node('li', 'rank-row'); li.append(node('span', 'rank-number', row.rank), avatar(row.profile), node('span', 'rank-name', name(row.profile)), node('span', 'rank-score', `${row.value} 条`)); return li;
    }));
    if (!state.rows.length) element('rows').append(node('li', 'rank-empty', '打开榜单，读取服务器确认的发言数。'));
  }
  const handle = action => async () => { try { await action(); } catch (error) { notify(errorMessage(error)); } };
  return {
    render(value) { state = value; controller?.observe(value); avatars.project([value.profile, ...value.rows.map(row => row.profile)].filter(Boolean)); draw(); notify(value.message); },
    invalidate() { avatars.invalidate(); controller?.cancel(); },
    bind(value) {
      session = value;
      controller = createChatController(session, { operations, notify, clearDraft: text => { if (element('box').value.trim() === text) element('box').value = ''; }, onBusy: value => { busy = value; draw(); } });
      const submit = () => controller.submit(element('box').value);
      element('send').onclick = submit; element('begin').onclick = () => controller.begin();
      element('box').addEventListener('keydown', event => { if (shouldSubmitKey(event)) { event.preventDefault(); void submit(); } });
      element('recover').onclick = () => controller.recover();
      element('messages-tab').onclick = () => { tab = 'messages'; draw(); };
      element('ranks').onclick = handle(async () => { tab = 'ranks'; draw(); await session.leaderboard(); });
      element('login').onclick = handle(() => session.login()); element('permissions').onclick = handle(() => session.permissions());
      element('trial').onclick = () => session.offline(); element('reconnect').onclick = handle(() => session.reconnect());
      element('emoji').onclick = () => { element('emoji-panel').hidden = !element('emoji-panel').hidden; element('emoji').setAttribute('aria-expanded', String(!element('emoji-panel').hidden)); };
      for (const [label, frame] of Object.entries(stickers)) {
        const button = node('button', 'sticker-choice'); button.type = 'button'; button.append(spirit(frame), node('span', null, label));
        button.onclick = () => { const box = element('box'), marker = `[精灵:${label}]`; if (box.value.length + marker.length <= 200) box.setRangeText(marker, box.selectionStart, box.selectionEnd, 'end'); else notify('消息最多 200 个字符。'); element('emoji-panel').hidden = true; element('emoji').setAttribute('aria-expanded', 'false'); box.focus(); };
        element('stickers').append(button);
      }
      element('more').onclick = () => { element('services').hidden = !element('services').hidden; element('more').setAttribute('aria-expanded', String(!element('services').hidden)); };
      document.addEventListener('keydown', event => { if (event.key === 'Escape') { element('emoji-panel').hidden = true; element('services').hidden = true; element('emoji').setAttribute('aria-expanded', 'false'); element('more').setAttribute('aria-expanded', 'false'); } });
    },
  };
}
