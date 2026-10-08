# 101 正式选角与触控迁移报告（2026-10-02）

状态：本子任务 UI 实现已冻结，等待独立审查与统一上游发布物上的真实整局验证。本文不宣称完整 Game 交付或联网验收完成。

## 基准与边界

- 已读父仓/101 的 AGENTS、知识导航、测试/开发/架构规范，按 `docs/plans/2026-10-02-bomber-player-selection-touch.md` 实现。
- 资产与手感基准为已确认 `af385a9cd0f261317e97240a7e55accdda8d01d5`；本地旧 prototype 不作为迁移基准。
- Joystick4 从该 Git 对象原样复制；TouchControls 的 SVG、样式、尺寸与摇杆参数复用该版本，仅将原型 InputState 改成正式 callbacks。没有引用原型模拟器、规则或本地位置/血量/角色真值。
- 未改 Gameplay、replica-adapter/types/events、PresentationDump 或生成声明；保留已审 V/M 修复。首次绑定的权威规则由 Game 子任务修复，不在 UI 模拟。
- 原文件完整快照及哈希：`.sdd/player-input-before/`、`.sdd/101-player-input-before.json`。冻结 diff 与文件清单：`.sdd/101-20261002-player-input.diff`、`.sdd/101-20261002-player-input-files.json`。

## 要求 → 实现 → 验收

| 要求 | 实现与入口（相对 games/101-bomber） | 已执行证据 | 待真实链路验证 |
|---|---|---|---|
| 首次五选一、上次预选 | `Client/UI/Spectator/game-view.mjs:59` 以 self 就绪和正式 phase 0/1/5 控制窗口；`Client/Presentation/src/hud/overlays.ts:55` 复用 start/switch CharacterSelect，读取上次确认角色，发送成功才保存。可用角色按真实配置裁剪，按实际卡片 ID 选择。 | Edge 四视口：5 张真实模型头像、duck 预选、cat 确认与 localStorage 持久化；失败提交不保存且可重开。Node 验证同房间下一局不再次强制首次选角、spectator 无选角回调。 | 正式客户端准入后首选绑定为本局角色/技能，后续选角仅下一局 Warmup 起点采纳；服务器不为选角暂停。 |
| 关闭窗口/局部 UI 不串输入 | `Presentation.setSelectionWindow`、`inputBlocked`；`main.js:969` 与 `player-controls` 都门控，阶段关闭自动收起选择器。选择器隐藏时清焦点，键盘切卡滚入可见区。 | 浏览器 Space/方向键在选角和设置中不发送游戏输入；服务器关闭窗口时换角弹窗消失；键盘确认后恢复移动。主线测试合法/非法 phase、无 self、输入关闭、失败返回均覆盖。 | DS 阶段切换/断线重连时的实际显示与命令拒绝反馈。 |
| 原型移动端摇杆 | `present/joystick.ts` 原样算法：120px 底座、52px 头、18% 死区、15% 换轴滞回、0.5 次轴阈值；`present/touch-controls.ts` 只生成主/副方向意图。 | 3 个纯算法测试；Edge 原生多点触摸产生向右+向上的正式宿主方向 2/1，松手停止重复；resize/blur/hidden/dispose 有清理。 | 真实 GAS 移动、碰撞、转角与服务器修正手感。 |
| 统一键盘/触屏发送节奏 | `Client/UI/Spectator/player-controls.mjs:31` 共用一个 timer，触屏优先、松手恢复仍按住的键；`main.js:472` 唯一一次枚举映射后进入既有 `csharp.sendMove`。 | Node 单 timer、方向映射、关闭/焦点/隐藏/销毁回归；浏览器实际键盘移动+多点触摸同时放弹。 | 统一真实输入时序、延迟场景、整局输入预算。 |
| 放弹/技能触屏按钮 | 同版 SVG/颜色/尺寸：88px 放弹、68px 技能；只能回调既有 PlaceBomb/UseActiveSkill。HUD SkillButtonView 决定隐藏、冷却、可用状态。 | 浏览器同时移动+放弹只触发一次；技能触发一次，权威形状的 CD 夹具到来后禁用，继续点不再次触发。没有本地技能消耗或 CD 真值。 | 真冷却/死亡/禁用/技能缺席、八 Bot 混战与五角色能力。 |
| 音效与快捷键 | 选角手势解锁原有 WebAudio，select/confirm 调用既有 `audio.ui`；V/M 继续使用原有 helper，并纳入选角阻断。 | Typecheck/build 与浏览器零 pageerror/console error；未宣称耳听全套音效验收。 | 真机音频播放、静音/恢复与整局音效节奏。 |
| 小屏与横竖屏 | `presentation.css:19` 使用 safe center 保证选角溢出时仍可从标题向下滚动；<=350px 保留原型尺寸、收紧触控边距，HUD 技能条左对齐、榜单移至左上避开按钮。 | 1440×900 / 390×844 / 844×390 / 320×568 四视口无横向溢出；关键 HUD/按钮矩形无交叠。320 宽第5张卡可键盘滚入视口并确认。 | 正式 URL、不同地图档、结算/下一局及安全区设备。 |

## 实际测试结果

| 命令/检查 | 实际数量与结果 | 日志 |
|---|---|---|
| 先写行为回归，未实现版本 | Node 6 tests，4 pass / 2 fail / 0 skipped，exit 1；缺少 selection window 与 setTouchDirection，确认 RED | `.sdd/101-player-input-red.log` |
| `node --test Client/UI/Spectator/*.test.mjs` | 58 pass / 0 fail / 0 skipped / 0 cancelled，exit 0 | `.sdd/101-player-input-spectator-tests.log` |
| `npm test`（Presentation） | 52 files，650 pass / 0 fail / 0 skipped，exit 0 | `.sdd/101-player-input-presentation-tests.log` |
| `npm run guard` | 1 pass / 0 fail / 0 skipped，exit 0；无原型/规则依赖 | `.sdd/101-player-input-guard.log` |
| `npm run build` | `tsc --noEmit` + Vite 132 modules，exit 0 | `.sdd/101-player-input-build.log` |
| `node tests/player-input-browser.mjs` | 实际 Edge 四视口场景全部通过，三组原生多点触控；0 pageerror / 0 console error，exit 0 | `.sdd/101-player-input-browser.log` |
| `node tests/browser-smoke.mjs` | 既有 2 视口视觉回归通过，非空且动画画面、技能/放弹点击、设置、视角、销毁，exit 0 | `.sdd/101-player-input-visual-regression.log` |
| `node --check` | main.js/game-view.mjs/player-controls.mjs 语法检查 exit 0 | 运行记录 |

在全 Spectator 回归中遇到一个旧 mock 未实现新增 inputBlocked 方法；扩展 mock 并增加真实入口方向映射/窗口阻断断言后，完整 58 tests 通过。未删除或放宽断言。

浏览器验证实际复现并修复：320 宽选角标题原本位于 y=-103.75；移为安全居中后 y=18，滚动可触达第5张卡与确认按钮。初版把窄屏技能按钮上移会遮挡榜单，已依据截图改为原型按钮同行、收紧320边距；对实际可见内容加入无交叠断言。`visual.ts` 原本给兔子夹具绑定泡泡，正式 HUD 按角色专属技能隐藏该不合法按钮；改为以泡泡鸭为 localPlayerId，使旧 smoke 检查合法主动技能，不改规则。

## 浏览器证据与复现

- `games/101-bomber/.run/player-input-evidence/verification.json` 明确 `fixtureOnly: true`。
- 同目录 `selection-1440x900.png`、`selection-390x844.png`、`selection-844x390.png`、`selection-320x568.png`、`selection-320x568-scrolled.png`：首次选角真实模型、窄屏滚动。
- 同目录 `touch-390x844.png`、`touch-844x390.png`、`touch-320x568.png`：触屏布局及冷却环。已直接查看截图，保留原型模型/材质/场景/按钮资产。
- 旧 smoke 证据仍在 `games/101-bomber/.run/presentation-evidence/`。
- 从 `games/101-bomber/Client/Presentation` 启动 `npx vite --host 127.0.0.1 --port 5199 --strictPort`，打开 `http://127.0.0.1:5199/tests/player-input.html`；运行上述浏览器脚本。此 URL 是展示与输入夹具，绝不是正式 DS 房间。

## 仍需主线完成，不能作为整局通过

1. 将 Game 子任务的首次未绑定角色选择条件与统一 Runtime/Engine 发布物合并，重建真正 WASM/DS 客户端，再验收首次五选一的本局权威生效、后续换角边界、同房间下一局。
2. 当前 `Client/UI/Spectator/host/Program.cs:56` 导出 `PlaceBomb()` 无 hold/remote 参数，既有正式命令不能表达原型长按遥控。本子任务没有实现假的长按成功，也没有新增公共 wire；请按已批准遥控协议在 Gameplay/正式客户端输入 API 补齐后接续。短按与正式炸弹形态仍走现有 GAS。
3. 真实 Platform/DS/browser 完整对局、断线、八 Bot 30分钟、逐 Tick 回放、多种子统计、不同地图/五角色/全部技能及音频整套验收仍归统一主线。
4. 四视口夹具只证明表现、输入门控和 callback 接线；不证明网络、伤害、权威移动、技能行为或结算。

未创建提交、未改身份/结构契约，未移动或清理他人的工作区。后续根 UI 修改交还主线程；本子任务转只读 Runtime 上游审查。
