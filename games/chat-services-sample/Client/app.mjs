import { createGameServices } from '../vendor/core/src/index.mjs';
import { readLumioDocumentId } from '../vendor/lumio/adapter.mjs';
import { createSession } from './session.mjs';
import { createChatView, createOperationTracker } from './view.mjs';

const element = id => document.getElementById(id);
let session, view, operations;
const handle = action => async () => { try { await action(); } catch (error) { element('message').textContent = error.code === 'gs_bridge_user_action_required' ? '请使用游戏外侧平台的“资料授权”按钮。' : error.code ?? error.message; } };
try {
  // Publication configuration establishes trust; the fragment is only the current non-secret document identifier.
  const config = await (await fetch(new URL('./publication.json', import.meta.url), { cache: 'no-store' })).json();
  const platform = new URL(config.platformOrigin);
  if (platform.origin !== config.platformOrigin || !['https:', 'http:'].includes(platform.protocol)) throw Error('平台来源配置无效');
  const wasm = await (await fetch(new URL('../vendor/core/dist/lifecycle.wasm', import.meta.url))).arrayBuffer();
  const sdk = await createGameServices({ parentWindow: window.parent, platformOrigin: config.platformOrigin,
    containerSessionId: readLumioDocumentId(location.hash), wasm,
    onInvalidated: () => { view?.invalidate(); session?.invalidate(); }, onReconciled: event => { operations?.reconcile(event); session?.reconcile(event); },
    onEvent: event => { if (event.type === 'identity_changed') { view?.invalidate(); session?.invalidate(true); } if (event.type === 'services_unavailable') session?.offline(); },
  });
  operations = createOperationTracker(sdk);
  view = createChatView(document, sdk, operations);
  session = createSession(operations.sdk, state => view.render(state));
  view.bind(session);
  window.addEventListener('offline', () => session.offline()); window.addEventListener('online', handle(() => session.reconnect()));
  window.addEventListener('pagehide', () => sdk.dispose(), { once: true });
  await session.start();
} catch (error) { element('message').textContent = `无法启动正式服务：${error.code ?? error.message}。请从平台游戏入口打开。`; }
