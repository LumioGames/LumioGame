export function createSession(sdk, render = () => {}, { now = () => performance.now() } = {}) {
  let generation = 0, epoch, renewAt = 0, initializing, revision = 0, retired = false, busy = false;
  let state = { mode: 'connecting', view: null, profile: null, rows: [], message: '连接服务器…', pending: [] };
  const publish = patch => { state = { ...state, ...patch }; render(structuredClone(state)); };
  const ensure = () => { if (retired) throw Error('restart required'); if (state.mode !== 'official') throw Error('offline trial cannot submit'); };
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
    publish({ mode: 'trial', profile: null, rows: [], view: { started: true, supplies: 3, draws: 0, bestScore: 0, canClaim: false, canExplore: true, trail: 'camp' }, message: '离线试玩：不保存、不领奖、不上传', pending: [...sdk.unresolvedOperations] });
  }
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
    trial(route) {
      if (retired || state.mode !== 'trial' || state.view.supplies <= 0) return;
      const supplies = state.view.supplies - 1;
      publish({ view: { ...state.view, supplies, draws: state.view.draws + 1, bestScore: Math.max(state.view.bestScore, route === 'ridge' ? 20 : 18), canExplore: supplies > 0, trail: route } });
    },
    async reconnect() {
      if (retired) throw Error('restart required');
      generation++; sdk.setOnline(true);
      if (retired) throw Error('restart required');
      const captured = generation; publish({ mode: 'connecting', message: '连接服务器…' });
      try { await initialize(); }
      catch (error) { if (!retired && captured === generation) offline(); throw error; }
    },
    invalidate(restart = false) {
      generation++; renewAt = 0; retired ||= restart;
      if (restart) sdk.dispose();
      publish({ mode: retired ? 'retired' : state.mode, view: null, profile: null, rows: [], message: retired ? '身份已变化，请从平台重新打开游戏。' : '资料正在重新校验' });
    },
    reconcile({ method, result }) {
      if (retired || state.mode !== 'official') return;
      if (method === 'getState') { revision = result.revision; publish({ view: result.view }); }
      if (method === 'getProfile') publish({ profile: result });
      publish({ pending: [...sdk.unresolvedOperations] });
    },
    async leaderboard() {
      ensure(); const captured = generation;
      const result = await sdk.request('leaderboardTop', { boardId: 'expedition_best', seasonId: 'all_time', pageSize: 10, cursor: null });
      if (captured === generation && !retired) publish({ rows: result.rows });
    },
    async login() { ensure(); await sdk.request('login', {}); },
    async permissions() { ensure(); await sdk.request('openPermissions', {}); },
  };
}
