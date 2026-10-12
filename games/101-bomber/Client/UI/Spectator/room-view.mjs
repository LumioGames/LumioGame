const CHARACTER_LABELS = { rabbit: '棉花兔', duck: '泡泡鸭', cat: '闪电猫', bear: '火焰熊', kangaroo: '飞腿袋鼠' };

export function createRoomView({ onFill, onCharacter }) {
  const get = id => document.getElementById(id);
  const root = get('room');
  const seats = get('room-seats');
  const fill = get('room-fill');
  const wait = get('room-wait');
  const choice = get('room-character');
  let pendingFill = null;
  let pendingCharacter = null;
  let lastState = null;
  let lastConnection = 'starting';
  function requestFill(enabled) {
    if ((enabled ? fill : wait).disabled || onFill(enabled) !== true) return;
    pendingFill = enabled;
    update(lastState, lastConnection);
  }
  fill.addEventListener('click', () => requestFill(true));
  wait.addEventListener('click', () => requestFill(false));
  choice.addEventListener('change', () => {
    if (choice.disabled || !choice.value || onCharacter(choice.value) !== true) return;
    pendingCharacter = choice.value;
    update(lastState, lastConnection);
  });
  function update(state, connection = 'starting') {
    lastState = state;
    lastConnection = connection;
    const room = state?.room;
    const waiting = !state?.phase || state.phase === 'WaitingForWorldReady';
    root.hidden = !waiting && connection === 'active';
    const roster = room?.players ?? [];
    const capacity = room?.capacity ?? 8;
    get('room-count').textContent = room ? `${roster.length} / ${capacity}` : `— / ${capacity}`;
    const rows = Array.from({ length: capacity }, (_, i) => {
      const seat = document.createElement('li');
      const player = roster[i];
      seat.className = player ? `room-seat ${player.isBot ? 'is-bot' : 'is-human'}${player.isSelf ? ' is-self' : ''}` : 'room-seat is-empty';
      seat.textContent = player ? `${player.name || '未命名玩家'}${player.isSelf ? ' · 你' : ''} · ${player.isBot ? '机器人' : '真人'}` : `席位 ${i + 1} · 等待加入`;
      return seat;
    });
    seats.replaceChildren(...rows);
    if (!room || !waiting) pendingFill = null;
    else if (pendingFill === room.fillEnabled) pendingFill = null;
    const confirmedCharacter = state?.selectedCharacterName || state?.characterName;
    if (!state) pendingCharacter = null;
    else if (pendingCharacter === confirmedCharacter) pendingCharacter = null;
    const ready = connection === 'active' && state?.inputEnabled === true && Boolean(state?.selfId) && waiting && Boolean(room);
    const full = roster.length >= capacity;
    fill.disabled = !ready || full || room?.fillEnabled === true || pendingFill !== null;
    wait.disabled = !ready || room?.fillEnabled !== true || pendingFill !== null;
    choice.disabled = !ready || pendingCharacter !== null;
    if (confirmedCharacter && pendingCharacter === null) choice.value = confirmedCharacter;
    get('room-selection-status').textContent = pendingCharacter ? '等待服务器确认角色…' : confirmedCharacter ? '已选择' : '请选择角色';
    let status;
    if (['failed', 'faulted', 'error'].includes(connection)) status = '连接失败，请重新连接';
    else if (connection !== 'active' || !room) status = ['closed', 'superseded'].includes(connection) ? '连接已关闭，请重新连接' : '正在连接房间…';
    else if (!waiting) status = state.phase === 'Warmup' ? '满员，比赛准备中' : '比赛进行中';
    else if (full) status = '房间满员，等待比赛开始';
    else if (pendingFill !== null) status = '等待服务器确认…';
    else if (room.fillEnabled) {
      const remaining = BigInt(room.nextBotJoinTick) - BigInt(room.authorityTick);
      const seconds = Math.ceil(Number(remaining > 0n ? remaining : 0n) / room.tickRateHz);
      status = `机器人补齐中 · 下一位 ${seconds} 秒 · 真人 ${room.humans} / 机器人 ${room.bots}`;
    } else status = `等待真人加入 · 真人 ${room.humans} / 机器人 ${room.bots}`;
    get('room-status').textContent = status;
  }
  return {
    update,
    configure(config) {
      const placeholder = document.createElement('option');
      placeholder.value = ''; placeholder.textContent = '选择角色';
      const options = (config.characters ?? []).map(row => {
        const option = document.createElement('option'); option.value = row.name;
        option.textContent = row.display_name || row.displayName || CHARACTER_LABELS[row.name] || row.name;
        return option;
      });
      choice.replaceChildren(placeholder, ...options);
    },
  };
}
