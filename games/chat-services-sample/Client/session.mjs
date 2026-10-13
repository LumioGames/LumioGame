const channelIdPattern = /^[A-Za-z0-9_-]{1,96}$/;
export const isChannelId = value => typeof value === 'string' && channelIdPattern.test(value);
const emptyFeed = () => ({ list: [], cursor: null, hasMore: false, loaded: false });
const emptyChannels = () => ({ public: emptyFeed(), dm: { active: null, ...emptyFeed() } });
const emptySocial = () => ({ friends: [], incoming: [], outgoing: [], loginRequired: false });
// Only server responses populate feeds; the client never synthesizes messages or ids.
const dedupeMessages = messages => {
  const seen = new Set(), list = [];
  for (const message of messages ?? []) {
    if (!message || typeof message.messageId !== 'string' || seen.has(message.messageId)) continue;
    seen.add(message.messageId); list.push(message);
  }
  return list;
};
export function unreadTotal(summary) {
  if (!summary) return 0;
  const dm = (summary.dmChannels ?? []).reduce((sum, channel) => sum + (channel?.unread ?? 0), 0);
  return (summary.publicUnread ?? 0) + dm + (summary.friendRequests?.incoming ?? []).length;
}

export function createSession(sdk, render = () => {}, { now = () => performance.now() } = {}) {
  let generation = 0, epoch, renewAt = 0, initializing, revision = 0, retired = false, busy = false;
  let state = { mode: 'connecting', view: null, profile: null, rows: [], message: '连接服务器…', pending: [],
    channel: emptyChannels(), social: emptySocial(), summary: null };
  const publish = patch => { state = { ...state, ...patch }; render(structuredClone(state)); };
  const ensure = () => { if (retired) throw Error('restart required'); if (state.mode !== 'official') throw Error('offline trial cannot submit'); };
  const resetChat = { channel: emptyChannels(), social: emptySocial(), summary: null };
  function applyChannel(channelId, requestCursor, result) {
    const feed = channelId === 'public' ? state.channel.public : state.channel.dm.active === channelId ? state.channel.dm : null;
    if (!feed) return; // A stale read for a channel the player already left is dropped, not merged.
    const page = dedupeMessages(result.messages);
    const list = requestCursor === null ? page
      : [...feed.list, ...page.filter(message => !feed.list.some(known => known.messageId === message.messageId))];
    const next = { list, cursor: result.nextCursor ?? null, hasMore: result.hasMore === true, loaded: true };
    publish({ channel: channelId === 'public' ? { ...state.channel, public: next } : { ...state.channel, dm: { ...state.channel.dm, ...next } } });
  }
  async function initialize() {
    const captured = generation;
    if (initializing?.generation === captured) return initializing.promise;
    const started = now(), current = { generation: captured };
    current.promise = (async () => {
      const initialized = await sdk.request('initialize', {});
      if (retired || captured !== generation) return;
      epoch = initialized.epoch.operationEpoch; revision = initialized.state.revision;
      // Server times define the lease; elapsed local time only schedules renewal.
      renewAt = started + Math.max(0, initialized.epoch.expiresAt - initialized.epoch.serverTime - 1000);
      publish({ mode: 'official', view: initialized.state.view, profile: initialized.profile, message: '云存档已连接', pending: [...sdk.unresolvedOperations] });
    })();
    initializing = current;
    try { await current.promise; } finally { if (initializing === current) initializing = undefined; }
  }
  async function refresh() {
    const captured = generation;
    const official = await sdk.request('getState', {});
    if (retired || captured !== generation) return;
    const profile = await sdk.request('getProfile', {});
    if (retired || captured !== generation) return;
    revision = official.revision;
    publish({ mode: 'official', view: official.view, profile, message: '正式进度已从服务器读取', pending: [...sdk.unresolvedOperations] });
  }
  function offline() {
    if (retired) return;
    generation++; sdk.setOnline(false);
    publish({ mode: 'trial', profile: null, rows: [], view: { started: true, messageCount: 0, canSend: true, recent: [] }, message: '离线试玩：不保存、不上传、不计入发言榜', pending: [...sdk.unresolvedOperations], ...resetChat });
  }
  const guarded = async (method, body, apply) => {
    ensure(); const captured = generation;
    const result = await sdk.request(method, body);
    if (retired || captured !== generation) return null;
    apply?.(result);
    return result;
  };
  return {
    get current() { return structuredClone(state); },
    async start() { if (retired) throw Error('restart required'); await initialize(); },
    async act(action, args = {}) {
      ensure(); if (busy || sdk.unresolvedOperations.length) throw Error('先查询尚未确认的操作');
      busy = true; const captured = generation;
      try {
        if (!epoch || now() >= renewAt) await initialize();
        if (captured !== generation || retired) return;
        ensure(); if (sdk.unresolvedOperations.length) throw Error('先查询尚未确认的操作');
        const receipt = await sdk.request('performAction', { operationId: crypto.randomUUID(), operationEpoch: epoch, expectedRevision: revision, action, arguments: args });
        if (captured !== generation || retired) return;
        if (receipt.status === 'committed') await refresh();
        else publish({ message: receipt.error?.code ?? `操作状态：${receipt.status}`, pending: [...sdk.unresolvedOperations] });
      } catch (error) {
        if (error.code === 'gs_operation_epoch_expired') renewAt = 0;
        if (captured === generation && !retired) publish({ message: error.unknown ? '结果暂未确认，请查询原操作；不要重复提交。' : error.code ?? error.message, pending: [...sdk.unresolvedOperations] });
        throw error;
      } finally { busy = false; }
    },
    async recover() {
      ensure(); const captured = generation;
      for (const operation of sdk.unresolvedOperations) {
        const result = await sdk.recover(operation);
        if (retired || captured !== generation) return;
        publish({ message: result.status === 'not_found' ? '服务器暂未找到原操作，仍不能视为关闭。' : `原操作：${result.status}` });
      }
      await refresh();
    },
    offline,
    trial(text) {
      if (retired || state.mode !== 'trial' || !state.view.canSend || typeof text !== 'string' || !text.length || text.length > 200) return;
      const recent = [...state.view.recent, text].slice(-20);
      publish({ view: { ...state.view, messageCount: state.view.messageCount + 1, recent } });
    },
    async reconnect() {
      if (retired) throw Error('restart required');
      generation++; sdk.setOnline(true);
      if (retired) throw Error('restart required');
      const captured = generation; publish({ mode: 'connecting', message: '连接服务器…', ...resetChat });
      try { await initialize(); }
      catch (error) { if (!retired && captured === generation) offline(); throw error; }
    },
    invalidate(restart = false) {
      generation++; renewAt = 0; retired ||= restart;
      if (restart) sdk.dispose();
      publish({ mode: retired ? 'retired' : state.mode, view: null, profile: null, rows: [], message: retired ? '身份已变化，请从平台重新打开游戏。' : '资料正在重新校验', ...resetChat });
    },
    reconcile({ method, result }) {
      if (retired || state.mode !== 'official') return;
      if (method === 'getState') { revision = result.revision; publish({ view: result.view }); }
      if (method === 'getProfile') publish({ profile: result });
      publish({ pending: [...sdk.unresolvedOperations] });
    },
    async leaderboard() {
      ensure(); const captured = generation;
      const result = await sdk.request('leaderboardTop', { boardId: 'chat_messages', seasonId: 'all_time', pageSize: 10, cursor: null });
      if (captured === generation && !retired) publish({ rows: result.rows });
    },
    async login() { ensure(); await sdk.request('login', {}); },
    async permissions() { ensure(); await sdk.request('openPermissions', {}); },
    async readChannel(channelId, { cursor = null, limit = 30, markRead = false } = {}) {
      if (channelId !== 'public' && !isChannelId(channelId)) throw Error('频道无效');
      return guarded('channelRead', { channelId, cursor, limit: Math.min(50, Math.max(1, limit)), markRead: markRead === true },
        result => applyChannel(channelId, cursor, result));
    },
    async channelSummary() { return guarded('channelSummary', {}, result => publish({ summary: result })); },
    async socialRead() {
      ensure(); const captured = generation;
      try {
        const result = await sdk.request('socialRead', {});
        if (retired || captured !== generation) return null;
        publish({ social: { friends: result.friends ?? [], incoming: result.incoming ?? [], outgoing: result.outgoing ?? [], loginRequired: false } });
        return result;
      } catch (error) {
        if (!retired && captured === generation && error?.code === 'gs_login_required')
          publish({ social: { ...emptySocial(), loginRequired: true } });
        throw error;
      }
    },
    openDm(channelId) {
      if (channelId !== null && !isChannelId(channelId)) return;
      if (state.channel.dm.active === channelId) return;
      publish({ channel: { ...state.channel, dm: { active: channelId, ...emptyFeed() } } });
    },
    async friendRequest(targetPlayerId) { return guarded('friendRequest', { targetPlayerId }); },
    async friendRespond(requestId, accept) { return guarded('friendRespond', { requestId, accept: accept === true }); },
    async friendRemove(targetPlayerId) { return guarded('friendRemove', { targetPlayerId }); },
  };
}

// Read-only polling plus the single activity signal to the embedding platform.
// The poller owns no data: every list and unread count comes from session state,
// which only SDK responses ever populate. It stops whenever the authoritative
// projection is absent (offline trial, invalidation, retirement).
export function createChatPoller(session, { document, parent, platformOrigin, channelEvery = 3000, summaryEvery = 5000, socialOffset = 2500,
  schedule = (task, ms) => { const timer = setTimeout(task, ms); return () => clearTimeout(timer); } } = {}) {
  let token = 0, running = false, active = 'public', lastUnread;
  const pending = new Set();
  const alive = mine => mine === token && running;
  const sleep = (ms, mine) => new Promise(resolve => {
    const entry = { resolve, cancel: schedule(() => { pending.delete(entry); resolve(); }, ms) };
    pending.add(entry);
  });
  async function cycle(mine, timing, action) {
    while (alive(mine)) {
      let wait = timing.base;
      try { await action(); timing.backoff = timing.base; }
      catch (error) {
        if (error?.code === 'gs_rate_limited' || error?.code === 'gs_bridge_busy') {
          timing.backoff = Math.min(20000, Math.max(timing.base, (timing.backoff ?? timing.base) * 2));
          wait = timing.backoff;
        }
      }
      if (!alive(mine)) break;
      await sleep(wait, mine);
    }
  }
  function announce() {
    const total = unreadTotal(session.current.summary);
    const pulse = lastUnread === undefined ? true : total > lastUnread;
    if (lastUnread === undefined ? total > 0 : total !== lastUnread)
      parent.postMessage({ type: 'lumio:chat-activity', totalUnread: total, pulse }, platformOrigin);
    lastUnread = total;
  }
  function start() {
    if (running) return;
    running = true; token++;
    const mine = token;
    const visible = () => document?.visibilityState !== 'hidden';
    const target = () => active ?? 'public';
    const cursor = () => {
      const state = session.current;
      if (target() === 'public') return state.channel.public.cursor;
      return state.channel.dm.active === target() ? state.channel.dm.cursor : null;
    };
    void cycle(mine, { base: channelEvery }, async () => {
      await session.readChannel(target(), { cursor: cursor(), markRead: active !== null && visible() });
      announce();
    });
    void cycle(mine, { base: summaryEvery }, async () => { await session.channelSummary(); announce(); });
    void (async () => { await sleep(socialOffset, mine); await cycle(mine, { base: summaryEvery }, async () => { await session.socialRead(); announce(); }); })();
  }
  function stop() {
    if (!running) return;
    running = false; token++;
    for (const entry of [...pending]) { entry.cancel(); entry.resolve(); }
    pending.clear();
  }
  return {
    get active() { return active; },
    setActive(channelId) { active = channelId === 'public' || channelId === null || isChannelId(channelId) ? channelId : active; },
    sync(state) { if (state.mode === 'official' && state.profile) start(); else stop(); },
    start, stop,
  };
}
