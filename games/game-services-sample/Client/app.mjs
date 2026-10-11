import { createGameServices } from '../vendor/core/src/index.mjs';
import { readLumioDocumentId } from '../vendor/lumio/adapter.mjs';
import { createSession } from './session.mjs';

const element = id => document.getElementById(id);
let session;
function render(state) {
  document.body.dataset.mode = state.mode;
  element('mode').textContent = { official: '正式云存档', trial: '离线试玩 · 不保存', retired: '请重新打开', connecting: '正在连接' }[state.mode];
  element('player').textContent = state.profile?.displayName ?? state.profile?.anonymousName ?? '匿名探险家';
  element('message').textContent = state.message;
  const view = state.view;
  element('supplies').textContent = view?.supplies ?? '—'; element('draws').textContent = view?.draws ?? '—'; element('score').textContent = view?.bestScore ?? '—';
  element('trail').textContent = { camp: '营地', ridge: '山脊', river: '河谷' }[view?.trail] ?? '营地';
  const official = state.mode === 'official';
  element('begin').disabled = !official || !view || view.started;
  element('claim').disabled = !official || !view?.canClaim;
  for (const id of ['ridge', 'river']) element(id).disabled = !view?.canExplore || !['official', 'trial'].includes(state.mode);
  for (const id of ['login', 'permissions', 'ranks']) element(id).disabled = !official;
  element('recover').disabled = !official || !state.pending.length;
  element('reconnect').disabled = state.mode !== 'trial'; element('trial').disabled = state.mode !== 'official';
  element('rows').replaceChildren(...state.rows.map(row => { const li = document.createElement('li'); li.textContent = `${row.rank}. ${row.profile.displayName ?? row.profile.anonymousName} · ${row.value} 分`; return li; }));
}
const handle = action => async () => { try { await action(); } catch (error) { element('message').textContent = error.code === 'gs_bridge_user_action_required' ? '请使用游戏外侧平台的“资料授权”按钮。' : error.code ?? error.message; } };
try {
  // Publication configuration establishes trust; the fragment is only the current non-secret document identifier.
  const config = await (await fetch('./publication.json', { cache: 'no-store' })).json();
  const platform = new URL(config.platformOrigin);
  if (platform.origin !== config.platformOrigin || !['https:', 'http:'].includes(platform.protocol)) throw Error('平台来源配置无效');
  const wasm = await (await fetch('../vendor/core/dist/lifecycle.wasm')).arrayBuffer();
  const sdk = await createGameServices({ parentWindow: window.parent, platformOrigin: config.platformOrigin,
    containerSessionId: readLumioDocumentId(location.hash), wasm,
    onInvalidated: () => session?.invalidate(), onReconciled: event => session?.reconcile(event),
    onEvent: event => { if (event.type === 'identity_changed') session?.invalidate(true); if (event.type === 'services_unavailable') session?.offline(); },
  });
  session = createSession(sdk, render);
  element('begin').onclick = handle(() => session.act('begin'));
  element('claim').onclick = handle(() => session.act('claim_supplies'));
  for (const route of ['ridge', 'river']) element(route).onclick = handle(() => session.current.mode === 'trial' ? session.trial(route) : session.act('explore', { route }));
  element('trial').onclick = () => session.offline(); element('reconnect').onclick = handle(() => session.reconnect());
  element('ranks').onclick = handle(() => session.leaderboard()); element('login').onclick = handle(() => session.login());
  element('permissions').onclick = handle(() => session.permissions()); element('recover').onclick = handle(() => session.recover());
  window.addEventListener('offline', () => session.offline()); window.addEventListener('online', handle(() => session.reconnect()));
  window.addEventListener('pagehide', () => sdk.dispose(), { once: true });
  await session.start();
} catch (error) { element('message').textContent = `无法启动正式服务：${error.code ?? error.message}。请从平台游戏入口打开。`; }
