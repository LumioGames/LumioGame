import { isChannelId } from './session.mjs';
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
export const formatTime = ms => {
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const socialReasons = { target_not_logged_in: '对方是游客，无法添加', already_friends: '你们已经是好友了', already_requested: '申请已发送，等待对方处理', self: '不能添加自己' };
export function chatErrorText(error) {
  if (error?.code === 'gs_bridge_user_action_required') return '请使用游戏外侧平台的“资料授权”按钮。';
  switch (error?.code) {
    case 'gs_login_required': return '请先登录';
    case 'gs_channel_denied': return '没有权限访问该频道';
    case 'gs_message_blocked': return '消息未通过安全审核，请修改后重发';
    case 'gs_message_moderation_unavailable': return '安全审核暂不可用，稍后重试';
    case 'gs_social_denied': return socialReasons[error.gameReason ?? error.reason] ?? '好友操作未完成，请稍后再试';
    default: return error?.code ?? error?.message;
  }
}
// The frozen send contract: public carries no channelId, dm always does.
export function sendArguments(text, target) {
  const channel = target?.channel === 'dm' ? 'dm' : 'public';
  return channel === 'dm' ? { text, channel, channelId: target.channelId } : { text, channel };
}

// Observe exact receipts before session.act/recover consume them; forwarding does not alter SDK semantics.
export function createOperationTracker(sdk) {
  let current;
  const same = (left, right) => left?.operationId === right?.operationId && left?.operationEpoch === right?.operationEpoch;
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
  let busy = false, generation = 0, mode, playerId, attempt;
  const alive = captured => captured === generation && session.current.mode === 'official';
  function confirmed(operation) {
    const state = session.current;
    return attempt === operation && state.mode === 'official' && operation.playerId
      && state.profile?.playerId === operation.playerId && operation.receipt?.status === 'committed'
      && !state.pending.length && (operation.action === 'begin'
        ? state.view?.started === true : state.view?.messageCount > operation.count && state.view.recent?.includes(operation.text));
  }
  function finish(operation) {
    if (!confirmed(operation)) return false;
    if (operation.action === 'send') clearDraft(operation.text, operation);
    operation.finished = true; attempt = undefined;
    notify(operation.action === 'begin' ? '已进入聊天室' : '消息已由服务器确认'); return true;
  }
  async function recoverOperation(operation) {
    for (const wait of [0, 400, 1000, 1800]) {
      if (wait) await delay(wait);
      if (!alive(operation.generation)) return false;
      try { await session.recover(); }
      catch (error) { notify(chatErrorText(error)); }
      if (!alive(operation.generation)) return false;
      if (!session.current.pending.length) break;
    }
    if (operation.finished || finish(operation)) return true;
    if (alive(operation.generation)) {
      notify(session.current.pending.length ? `结果尚未确认（${operation.receipt?.status ?? 'unknown'}），请查询原操作；不要重复发送。`
        : operation.receipt?.error?.code ?? operation.failure ?? '服务器未确认本次操作，草稿已保留。');
      if (!session.current.pending.length) attempt = undefined;
    }
    return false;
  }
  async function act(action, text, target) {
    if (busy) return false;
    const state = session.current;
    if (state.pending.length) { notify('结果尚未确认，请查询原操作；不要重复发送。'); return false; }
    if (action === 'send' && (!text || text.length > 200)) { notify('消息需要 1–200 个字符。'); return false; }
    const dmChannel = target?.channel === 'dm' ? target.channelId : null;
    if (action === 'send' && target?.channel === 'dm' && !isChannelId(dmChannel)) { notify('私聊频道无效。'); return false; }
    if (state.mode === 'trial' && action === 'send') {
      if (dmChannel) { notify('离线试玩不能发起私聊。'); return false; }
      const count = state.view?.messageCount; session.trial(text);
      if (session.current.view?.messageCount > count) { clearDraft(text, { action }); notify('离线试玩消息 · 不保存'); return true; }
      return false;
    }
    if (state.mode !== 'official' || !state.profile?.playerId || !state.view || (action === 'send' && !state.view.canSend) || (action === 'begin' && state.view.started)) return false;
    const operation = { action, text, channelId: dmChannel, count: state.view.messageCount, playerId: state.profile?.playerId, generation };
    const previousReceipt = operations?.current;
    attempt = operation; busy = true; onBusy(true);
    try {
      try {
        const actionResult = session.act(action, action === 'send' ? sendArguments(text, target) : {});
        if (operations?.current !== previousReceipt) operation.receipt = operations.current;
        await actionResult;
      }
      catch (error) { operation.failure = chatErrorText(error); }
      if (operations?.current !== previousReceipt) operation.receipt = operations.current;
      if (!alive(operation.generation)) return operation.finished || finish(operation);
      if (!session.current.pending.length && !confirmed(operation)) operation.failure ??= session.current.message;
      return await recoverOperation(operation);
    } finally { busy = false; onBusy(false); }
  }
  return {
    observe(state) {
      const nextPlayer = state.profile?.playerId;
      if (state.mode !== mode || (nextPlayer && playerId && nextPlayer !== playerId)) {
        generation++; attempt = undefined;
      }
      mode = state.mode;
      // A temporarily absent projection is not evidence that the player changed.
      if (nextPlayer) playerId = nextPlayer;
      if (attempt) finish(attempt);
    },
    invalidate() { generation++; },
    cancel() { generation++; attempt = undefined; },
    submit: (text, target) => act('send', text.trim(), target), begin: () => act('begin'),
    async recover() {
      if (busy || session.current.mode !== 'official') return false;
      busy = true; onBusy(true);
      try {
        if (attempt) {
          attempt.generation = generation;
          return await recoverOperation(attempt);
        }
        await session.recover();
        if (session.current.pending.length) notify('结果尚未确认，请继续查询原操作；不要重复发送。');
        return !session.current.pending.length;
      } catch (error) { notify(chatErrorText(error)); return false; }
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
  let session, controller, state, busy = false, tab = 'public', menuTarget, poller = { setActive() {} };
  const name = profile => profile?.displayName ?? profile?.anonymousName ?? '匿名玩家';
  const avatars = createAvatarCache(sdk, () => draw());
  const notify = text => { element('message').textContent = text; };
  const feedMemo = new Map();
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
  function bubbleOf(text) {
    const bubble = node('div', 'bubble');
    for (const part of messageParts(text)) {
      if ('text' in part) bubble.append(node('span', null, part.text));
      else { const sticker = node('span', 'sticker'); sticker.append(spirit(part.frame), node('span', null, part.sticker)); bubble.append(sticker); }
    }
    return bubble;
  }
  // Channel rows render only server material: names come from the sender profile,
  // the raw playerId is never shown, and stickers reuse the shared parser.
  function messageRow(message, selfId) {
    const sender = message.sender ?? {};
    const mine = selfId != null && sender.playerId === selfId;
    const guest = sender.accountLinked === false;
    const meta = node('div', 'message-meta');
    const label = node('span', 'sender-name', name(sender.profile));
    const time = node('span', 'message-time', formatTime(message.sentAtMs));
    const body = node('div', 'message-body');
    const li = node('li', `chat-message${mine ? ' mine' : ''}`);
    if (mine || !sender.playerId || state.mode !== 'official') {
      meta.append(label);
      if (guest) meta.append(node('span', 'guest-tag', '游客'));
      meta.append(time);
      body.append(meta, bubbleOf(message.text ?? ''));
      li.append(avatar(sender.profile), body);
    } else {
      const who = node('button', 'sender-button');
      who.type = 'button';
      who.setAttribute('aria-label', `${name(sender.profile)} · 添加好友`);
      who.append(avatar(sender.profile), label);
      if (guest) who.append(node('span', 'guest-tag', '游客'));
      who.disabled = busy || state.pending.length > 0;
      who.onclick = () => openFriendMenu(sender);
      meta.append(time);
      body.append(meta, bubbleOf(message.text ?? ''));
      li.append(who, body);
    }
    return li;
  }
  function renderFeed(container, feed, memoKey, selfId, texts) {
    const ids = feed.list.map(message => message.messageId).join('\u0000');
    const oldScroll = container.scrollTop;
    container.replaceChildren(...feed.list.map(message => messageRow(message, selfId)));
    if (!feed.list.length) {
      const empty = node('li', 'empty-state');
      empty.append(spirit(0, true), node('strong', null, feed.loaded ? texts.empty : texts.loading));
      if (feed.loaded) empty.append(node('span', null, texts.hint));
      container.append(empty);
    }
    container.scrollTop = feedMemo.get(memoKey) === ids ? oldScroll : container.scrollHeight;
    feedMemo.set(memoKey, ids);
  }
  function renderTrialRecent(container) {
    const recent = state.view?.recent ?? [], serialized = JSON.stringify(recent);
    const oldScroll = container.scrollTop;
    container.replaceChildren(...recent.map((text, index) => {
      const li = node('li', 'chat-message mine'), body = node('div', 'message-body');
      body.append(node('div', 'message-meta', `${name(state.profile)} · 本地试玩 ${Math.max(1, (state.view.messageCount ?? recent.length) - recent.length + index + 1)}`));
      body.append(bubbleOf(text)); li.append(avatar(state.profile), body); return li;
    }));
    if (!recent.length) {
      const empty = node('li', 'empty-state'); empty.append(spirit(0, true), node('strong', null, '留一句话，让灵光相伴'),
        node('span', null, '离线消息只保留在本页，不计入发言榜。')); container.append(empty);
    }
    container.scrollTop = feedMemo.get('trial') === serialized ? oldScroll : container.scrollHeight;
    feedMemo.set('trial', serialized);
  }
  function closeFriendMenu() { menuTarget = null; element('friend-menu').hidden = true; }
  function openFriendMenu(sender) {
    menuTarget = sender;
    const isSelf = state.profile?.playerId != null && sender.playerId === state.profile.playerId;
    const guest = sender.accountLinked === false;
    element('friend-menu-name').textContent = name(sender.profile);
    element('friend-menu-add').hidden = isSelf || guest;
    element('friend-menu-add').disabled = busy || state.pending.length > 0;
    element('friend-menu-hint').hidden = !(isSelf || guest);
    element('friend-menu-hint').textContent = isSelf ? '这是你自己，不能添加自己为好友。' : guest ? '对方是游客，还没有登录，无法接收好友申请。' : '';
    element('friend-menu').hidden = false;
  }
  async function openDm(entry) {
    if (!entry?.dmChannelId || state.mode !== 'official') return;
    closeFriendMenu();
    session.openDm(entry.dmChannelId);
    poller.setActive(entry.dmChannelId);
    draw();
    try { await session.readChannel(entry.dmChannelId, { markRead: document.visibilityState !== 'hidden' }); }
    catch (error) { notify(chatErrorText(error)); }
  }
  function drawFriends(official, lock, writable) {
    const social = state.social ?? { friends: [], incoming: [], outgoing: [], loginRequired: false };
    const signin = official && social.loginRequired;
    const dm = state.channel.dm;
    const friend = social.friends.find(entry => entry.dmChannelId === dm.active);
    element('friends-signin').hidden = !signin;
    element('friend-lists').hidden = signin || dm.active != null;
    element('dm-view').hidden = dm.active == null;
    element('dm-title').textContent = friend ? name(friend.profile) : '私聊';
    const dmLocked = lock || !writable || !official || !state.view?.canSend || dm.active == null;
    element('dm-box').disabled = dmLocked; element('dm-send').disabled = dmLocked;
    element('friends-login').disabled = !official || busy;
    const unreadByChannel = new Map((state.summary?.dmChannels ?? []).map(channel => [channel.channelId, channel.unread ?? 0]));
    element('friends').replaceChildren(...social.friends.map(entry => {
      const li = node('li', 'friend-row');
      const identity = node('button', 'friend-identity');
      identity.type = 'button';
      identity.setAttribute('aria-label', `打开与 ${name(entry.profile)} 的私聊`);
      identity.append(avatar(entry.profile), node('span', 'friend-name', name(entry.profile)));
      const unread = unreadByChannel.get(entry.dmChannelId) ?? 0;
      if (unread > 0) identity.append(node('span', 'unread-badge', unread > 99 ? '99+' : String(unread)));
      identity.disabled = lock || !official || !entry.dmChannelId;
      identity.onclick = () => openDm(entry);
      const chat = node('button', 'friend-action', '私聊'); chat.type = 'button';
      chat.disabled = lock || !official || !writable || !state.view?.canSend || !entry.dmChannelId;
      chat.onclick = () => openDm(entry);
      const remove = node('button', 'friend-action danger', '删除'); remove.type = 'button';
      remove.disabled = lock || !official;
      remove.onclick = handle(async () => { await session.friendRemove(entry.playerId); notify(`已删除好友 ${name(entry.profile)}`); await session.socialRead(); });
      li.append(identity, chat, remove); return li;
    }));
    if (!social.friends.length && !signin)
      element('friends').append(node('li', 'friend-empty', official ? '还没有好友。在公共频道点别人的头像或名字，就能加好友。' : '连接后可以添加好友。'));
    element('requests-in').replaceChildren(...social.incoming.map(request => {
      const li = node('li', 'friend-row');
      const identity = node('span', 'friend-identity static');
      identity.append(avatar(request.profile), node('span', 'friend-name', name(request.profile)));
      const accept = node('button', 'friend-action', '接受'); accept.type = 'button';
      accept.disabled = lock || !official;
      accept.onclick = handle(async () => { await session.friendRespond(request.requestId, true); notify(`已接受 ${name(request.profile)} 的好友申请`); await session.socialRead(); });
      const decline = node('button', 'friend-action danger', '拒绝'); decline.type = 'button';
      decline.disabled = lock || !official;
      decline.onclick = handle(async () => { await session.friendRespond(request.requestId, false); notify('已拒绝好友申请'); await session.socialRead(); });
      li.append(identity, accept, decline); return li;
    }));
    if (!social.incoming.length && !signin) element('requests-in').append(node('li', 'friend-empty', '还没有收到好友申请。'));
    element('requests-out').replaceChildren(...social.outgoing.map(request => {
      const li = node('li', 'friend-row');
      const identity = node('span', 'friend-identity static');
      identity.append(avatar(request.profile), node('span', 'friend-name', name(request.profile)));
      li.append(identity, node('span', 'request-waiting', '等待中')); return li;
    }));
    if (!social.outgoing.length && !signin) element('requests-out').append(node('li', 'friend-empty', '没有等待中的好友申请。'));
    if (dm.active != null) renderFeed(element('dm-msgs'), dm, `dm:${dm.active}`, state.profile?.playerId ?? null,
      { loading: '正在读取私聊…', empty: '开始私聊吧', hint: `给 ${name(friend?.profile)} 发第一条消息。` });
  }
  function draw() {
    if (!state) return;
    document.body.dataset.mode = state.mode;
    element('mode').textContent = { official: '云存档已连接', trial: '离线试玩 · 不保存', retired: '请重新打开', connecting: '正在连接' }[state.mode];
    const official = state.mode === 'official', trial = state.mode === 'trial', pending = state.pending.length > 0;
    const lock = busy || pending;
    const writable = trial || official && !!state.profile?.playerId;
    const player = element('player');
    player.replaceChildren(node('span', 'player-name', name(state.profile)));
    if (state.profile && !state.profile.displayName) player.append(node('span', 'guest-tag', '游客'));
    element('count').textContent = state.view?.messageCount ?? '—';
    element('identity-avatar').replaceChildren(avatar(state.profile));
    element('begin').hidden = !official || !state.view || state.view.started;
    element('begin').disabled = busy || pending || !writable || !official || !state.view || state.view.started;
    element('send').disabled = busy || pending || !writable || !state.view?.canSend;
    element('box').disabled = !writable || !state.view?.canSend;
    element('emoji').disabled = element('send').disabled;
    element('send').setAttribute('aria-busy', String(busy));
    for (const id of ['login', 'permissions', 'ranks']) element(id).disabled = !official || busy;
    element('recover').disabled = !official || busy || !pending;
    element('recover').hidden = !pending;
    element('reconnect').disabled = !trial || busy; element('trial').disabled = !official || busy;
    element('emoji-panel').hidden ||= element('emoji').disabled;
    element('emoji').setAttribute('aria-expanded', String(!element('emoji-panel').hidden));
    element('public-panel').hidden = tab !== 'public';
    element('friends-panel').hidden = tab !== 'friends';
    element('leaderboard-panel').hidden = tab !== 'ranks';
    element('composer').hidden = tab === 'friends';
    element('public-tab').setAttribute('aria-selected', String(tab === 'public'));
    element('friends-tab').setAttribute('aria-selected', String(tab === 'friends'));
    element('ranks').setAttribute('aria-selected', String(tab === 'ranks'));
    const feed = state.channel.public;
    if (trial) renderTrialRecent(element('pub'));
    else if (official) renderFeed(element('pub'), feed, 'public', state.profile?.playerId ?? null,
      { loading: '正在读取公共频道消息…', empty: '公共频道还很安静', hint: '来说第一句话，匿名玩家也能看到你。' });
    else {
      const empty = node('li', 'empty-state');
      empty.append(spirit(0, true), node('strong', null, state.mode === 'retired' ? '请从平台重新打开游戏' : '正在连接'),
        node('span', null, '连接后即可看到公共频道消息。'));
      element('pub').replaceChildren(empty);
    }
    drawFriends(official, lock, writable);
    element('rows').replaceChildren(...state.rows.map(row => {
      const li = node('li', 'rank-row'); li.append(node('span', 'rank-number', row.rank), avatar(row.profile), node('span', 'rank-name', name(row.profile)), node('span', 'rank-score', `${row.value} 条`)); return li;
    }));
    if (!state.rows.length) element('rows').append(node('li', 'rank-empty', '打开榜单，读取服务器确认的发言数。'));
  }
  const handle = action => async () => { try { await action(); } catch (error) { notify(chatErrorText(error)); } };
  return {
    render(value) { state = value; controller?.observe(value); avatars.project([value.profile, ...value.rows.map(row => row.profile),
      ...value.channel.public.list.map(message => message.sender?.profile), ...value.channel.dm.list.map(message => message.sender?.profile),
      ...value.social.friends.map(friend => friend.profile), ...value.social.incoming.map(request => request.profile), ...value.social.outgoing.map(request => request.profile)].filter(Boolean)); draw(); notify(value.message); },
    invalidate() { avatars.invalidate(); controller?.invalidate(); closeFriendMenu(); },
    bind(value, chatPoller) {
      session = value; if (chatPoller) poller = chatPoller;
      controller = createChatController(session, { operations, notify,
        clearDraft: (text, operation) => {
          for (const id of operation?.channelId ? ['dm-box', 'box'] : ['box', 'dm-box'])
            if (element(id).value.trim() === text) { element(id).value = ''; return; }
        }, onBusy: value => { busy = value; draw(); } });
      const submitPublic = async () => {
        if (await controller.submit(element('box').value, { channel: 'public' }))
          try { await session.readChannel('public', { markRead: document.visibilityState !== 'hidden' }); } catch { /* 下次轮询会补上 */ }
      };
      const submitDm = async () => {
        const channelId = session.current.channel.dm.active;
        if (!channelId) return;
        if (await controller.submit(element('dm-box').value, { channel: 'dm', channelId }))
          try { await session.readChannel(channelId, { markRead: true }); } catch { /* 下次轮询会补上 */ }
      };
      element('send').onclick = submitPublic; element('dm-send').onclick = submitDm;
      element('begin').onclick = () => controller.begin();
      element('box').addEventListener('keydown', event => { if (shouldSubmitKey(event)) { event.preventDefault(); void submitPublic(); } });
      element('dm-box').addEventListener('keydown', event => { if (shouldSubmitKey(event)) { event.preventDefault(); void submitDm(); } });
      element('recover').onclick = () => controller.recover();
      element('public-tab').onclick = () => { tab = 'public'; closeFriendMenu(); poller.setActive('public'); draw(); };
      element('friends-tab').onclick = () => { tab = 'friends'; closeFriendMenu(); poller.setActive(session.current.channel.dm.active); draw(); };
      element('ranks').onclick = handle(async () => { tab = 'ranks'; closeFriendMenu(); poller.setActive(null); draw(); await session.leaderboard(); });
      element('dm-back').onclick = () => { session.openDm(null); poller.setActive(null); draw(); };
      element('login').onclick = handle(() => session.login());
      element('friends-login').onclick = handle(() => session.login());
      element('permissions').onclick = handle(() => session.permissions());
      element('trial').onclick = () => session.offline(); element('reconnect').onclick = handle(() => session.reconnect());
      element('friend-menu-close').onclick = closeFriendMenu;
      element('friend-menu-add').onclick = handle(async () => {
        const target = menuTarget; closeFriendMenu();
        if (!target?.playerId) return;
        const result = await session.friendRequest(target.playerId);
        notify(result?.status === 'accepted' ? `已和 ${name(target.profile)} 成为好友` : '好友申请已发送，等待对方处理');
        await session.socialRead();
      });
      element('emoji').onclick = () => { element('emoji-panel').hidden = !element('emoji-panel').hidden; element('emoji').setAttribute('aria-expanded', String(!element('emoji-panel').hidden)); };
      for (const [label, frame] of Object.entries(stickers)) {
        const button = node('button', 'sticker-choice'); button.type = 'button'; button.append(spirit(frame), node('span', null, label));
        button.onclick = () => { const box = element('box'), marker = `[精灵:${label}]`; if (box.value.length + marker.length <= 200) box.setRangeText(marker, box.selectionStart, box.selectionEnd, 'end'); else notify('消息最多 200 个字符。'); element('emoji-panel').hidden = true; element('emoji').setAttribute('aria-expanded', 'false'); box.focus(); };
        element('stickers').append(button);
      }
      element('more').onclick = () => { element('services').hidden = !element('services').hidden; element('more').setAttribute('aria-expanded', String(!element('services').hidden)); };
      document.addEventListener('keydown', event => { if (event.key === 'Escape') { element('emoji-panel').hidden = true; element('services').hidden = true; element('emoji').setAttribute('aria-expanded', 'false'); element('more').setAttribute('aria-expanded', 'false'); closeFriendMenu(); } });
    },
  };
}
