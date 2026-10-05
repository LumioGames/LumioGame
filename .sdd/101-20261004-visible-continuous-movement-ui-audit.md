# 101 连续移动可见输入路径：只读核查

2026-10-04，`reentry_trace`。只读当前 Game 源码，未操作浏览器、修改产品/引擎源码、构建或更改封存 Server 五源。CUA 能力边界按 Root 已确认的 `pressKey/click/drag`、无 `keyDown/duration`，禁止事件注入与隐藏应用调用。本文不是一次实测通过。

## 结论

当前默认 Presentation 在普通 fine/mouse 环境没有现成可见的方向按住按钮，也没有设置中的摇杆开关。鼠标 drag 不能自行开启触控摇杆。仅 `pressKey` 无法指定持续按键时间，重复 `pressKey` 是多次离散按键，不能等同长按平滑走路验收。

现有两条正常可见指针路径可供实际核查：

1. **默认 Presentation 已显示触控摇杆时**，可以用普通真实 drag 从左侧游戏空白拖向方向。代码接受已显示摇杆上的 mouse 指针；不要求每个动作都为 touch。这仍需先从真实 DOM/截图确认它本来已显示。
2. **正常 classic 界面的四向按钮**支持 pointer capture，可从可见方向按钮开始 drag，直到 drag 结束仍保持原方向。它能证明同一正式输入/服务端链路的连续发送与释放，但其画面是 classic，不能代替默认 Presentation 的表现流畅度验收。

两条路径的 drag 都只能维持工具实际拖动期间的按下状态。没有动作持续时间参数时，不能从路径点数推定“按住 N 秒”；必须用实际输入/确认/位置样本核实是否至少发生多个 50ms 续发。拖动结束后再等待不会延长按住状态。

## 源码与定位

| 正常路径 / 可见定位 | 源码证据 | 条件与限制 |
| --- | --- | --- |
| 默认全屏 `#presentation`、`#game-stage canvas`、`#game-hud` | `Client/UI/Spectator/main.js:43`, `game-view.mjs:16` | Player 默认 GAME_VIEW；`?view=classic` 选择正常 classic 页面 |
| 默认方向按钮隐藏 | `spectator.css:51` | `.presentation-mode #player-controls { display:none }`；不应点击 DOM 中隐藏的 `Move right` 当默认正常交互 |
| 触控层 `.touch-root.is-touch:not(.is-blocked)` | `Presentation/src/index.ts:62–70`, `present/touch-controls.ts:123` | 首次 `(pointer:coarse)` 或真实 `pointerType=touch` down 才 show；缩窄窗口尺寸本身不改变 pointer media query |
| 左下闲置圆摇杆 `.tc-stick.is-idle`、内圆 `.tc-knob` | `present/touch.css:20–72` | 外圆120px，闲置圆心通常 `(92, viewportHeight−92)`，窄竖屏≤350px为x64；safe-area 可能偏移，使用实际截图而非固定坐标 |
| 左45%游戏空白区域，避开按钮/输入/`[data-ui]` | `touch-controls.ts:191–210` | 真实 down → start，move 才输出方向。它是浮动摇杆；不是必须命中圆圈。当前 visible/enabled/ready 为真，起手点x≤宽度×0.45 |
| 右拖20–60 CSS px等单轴轨迹 | `joystick.ts:20–65` | radius60，死区0.18，即10.8px。向上屏幕拖动=游戏上；单轴避免次方向。头部位移最多60px，继续拖动不提高速度 |
| 拖动中的外圆位置、`.tc-stick[data-dir]`、头部变色/位移 | `touch-controls.ts:250`, `touch.css:68` | 能显示指针方向输入状态；截图/DOM本身不能证明服务器已应用或跨端同步 |
| classic `#player-controls [data-direction]`，可见 aria名 `Move up/right/down/left` | `index.html:35–40`, `player-controls.mjs:96–103` | 按钮44×44；down立即发送并捕获指针；拖出按钮仍保持同方向，up/cancel/lost capture结束。必须按钮可见、未disabled |

触控摇杆的 `onDown` 只在 touch 指针时调用 `show()`，然后统一判断 visible；因此在已经真实显示的 coarse/touch页面上，普通 mouse drag 也合法。fine桌面隐藏时相同鼠标 down 会直接返回。没有 normal HUD 控件可以主动 show；设置只包含屏幕震动、全屏效果和声音（`hud/overlays.ts:107–115`）。不允许调用私有 `touch.show()`、改 CSS/media、注入 touch事件来制造可见路径。

## 实际输入节奏与证据边界

正式 `player-controls.mjs:3–36` 默认 `setInterval(...,50)`：有效方向 keydown/pointerdown 先 `move(true)` 即时发送；有效摇杆第一次方向变化也即时 `move(true)`；随后同一按住状态每50ms `move(false)` 续发。键盘不依赖 OS autorepeat，重复同一已held键不再重复初始turn。最新按键方向优先，第二方向用于正式输入副轴。

`main.js:431–435` 将 Presentation `[停,上,下,左,右]` 映射到正式host方向 `[0,1,3,4,2]`；所有输入最终通过 `sendPlayerCommand` → `csharp.sendMove` (`main.js:823–838,859–862`)。这条链没有 UI 影子玩法状态。

up/cancel、blur、hidden、窗口resize/失去ready会解除指针/held并停止续发（`touch-controls.ts:113–119,213–237`；`player-controls.mjs:28–37,63–93`）。因此切到另一tab会终止正在按住的输入，不能跨标签维持同一长按去截图第二玩家。

以下条件也会拒绝/清除输入：初始选择未完成、client未active、replica `inputOpen` 为false、HUD modal阻塞、页面隐藏/失焦；键盘目标若是button/input/dialog等UI也被拦（`main.js:828,861`、`player-controls.mjs:11–18,73–79`）。进入选角/设置时的方向键不能当走路测试。

50ms 是请求发送目标周期，实际 JS 事件与 interval 仍受同一浏览器线程和长任务阻塞；源码不证明实际20Hz。正常 `player.lastInput.at` 是 `Date.now()` 的命令发布尝试时刻，不是原始 PointerEvent/KeyboardEvent时间，也不是服务器确认或首个画面位移。现有计数加截图只能证明输入尝试与画面采样；端到端延迟必须用被动已审日志中的输入序列、权威确认、位置和实际时钟对应。

CUA具体可证：真实可见按钮/摇杆的 down→move→up路径，动作期间实际产生的多次正式输入及释放后停止续发，两个客户端对应权威位置/弹的同步。不可由目前工具单独保证：精确N秒键盘长按、持续按住同时切tab、两手触控同时走路+放弹、动作中途截图（drag若整体原子完成），或仅凭一次pressKey判定连续运动平滑。

现有 `Presentation/tests/player-input-browser.mjs:56–84` 用 keyboard.down/up + CDP touchStart/Move/End验证的是独立UI fixture。该工具能力超出本次CUA授权，而且fixture不是正式服务器对局；不能沿用其注入方式或把旧fixture截图当当前浏览器体验验收。
