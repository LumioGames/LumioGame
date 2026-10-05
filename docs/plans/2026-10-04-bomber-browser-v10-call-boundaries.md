# Bomber Browser V10 Call Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用默认产品不变的私有 JS 观测副本，区分五个 C# export、体素视图切换及 renderer 重建的实际调用跨度。

**Architecture:** 复用已接受 V9 的整段前缀、三个接缝、500ms 发布和 1MiB DOM 上限；只在 NEW 私有 main.js/game-view.mjs 上增加同步调用边界和实例事件。观测复用现有 export 返回值、displayedWorldHandle 和实际对象 WeakMap，不增加 C#/Native 查询，不修改 Runtime、compiled presentation.js、输入或玩法。每个改动都保存完整原文/后文接缝，两个整文件及修改后的 V9 前缀可逐字逆变换。

**Tech Stack:** Node.js ESM、node:test、node:vm、浏览器 performance.now、现有正式 Game17 UI / 完整引擎16 / V9。

## Global Constraints

- 当前仅 PREPARE_ONLY：允许写本计划及 NEW 私有生成/自检源码；未允许执行生成器、自检、发布复制、浏览器、服务或构建。
- 普通 main 精确 SHA256：81a746d12bb0f6e65e0aa5948c3630b7932bc8b606866b0ef921b1f5bc4d7b8f。
- 普通 game-view 精确 SHA256：cf5102015329d4833425b179f29a7ab317649e043d1fbb0d2f037499a5e011ca。
- V9 generator 精确 SHA256：c152cb0331a9596924bd7996ef1ebf531f08197746a4a6cbb41cf31aa63b0fc3。旧 V9、普通835、所有已有 measured 目录不可覆盖。
- DS18321、ordinary18101和既有私有18102现场保持；新观测没有此轮监听器或启动脚本。
- 两人、六个真实 Bot、20Hz、完整体素、原额度、GAS、唯一权威世界、原协议与保护不变。
- 原函数的实际 delegate 只执行一次；原返回值/异常对象/内部 finally/参数求值顺序保留。探针记录失败不能吞原 delegate 异常或代换异常。
- participant/Self 只来源于既有 csharp.playerState 的原 JSON 投影；presentation frame Self、adapter.localPlayerId、GameView/Presentation/adapter 的观测编号单独命名。
- WorldInstanceId 只旁观原 csharp.worldInstanceId 调用返回值；零值按原类型和值保存，不据未知/零推断同世界；无新增调用。
- handle 仅观察现有 displayedWorldHandle 的不透明字节串，不解码 epoch、不伪造连接代次；通过 pumpId 关联同次已有 world read。
- 时间为同页 performance.now；不得把嵌套跨度相加或相减、不得净减 Native/探针推导 managed 独占，不主张 GPU 帧率、Server 执行时钟或 Client applied ACK。

---

## 精确文件映射

根目录：C:/Work/LumioGames/LumioGame/.run/browser-experience-observer-v10-01。

| 文件 | 职责 |
|---|---|
| v10-probe-extension.mjs | 完整运行时代码字符串：有界跨度、pump关联、原身份/world/handle缓存、WeakMap实例、局部成本；不调用产品 export。 |
| v10-transform.mjs | 纯文本构造和 whole inverse；固定普通源/V9 hash、接缝次数；不复制目录或执行产品代码。 |
| instrument-v10.mjs | 待准入后的 NEW wwwroot 复制入口；只改 main/game-view，保存原/后 hash 和全部逆接缝。此轮不执行。 |
| v10-inverse.test.mjs | 待准入的正常 Node 自检源码；纯文本逆变换及 VM 探针 delegate 次数/返回/异常/有界/原零值；不模拟玩法、不宣称 Native 或浏览器证据。此轮不执行。 |
| source-read-notes.md | 已读真实源码、调用所有权、包含关系与尚未证明项。 |

普通输入：C:/Work/LumioGames/LumioGame/.run/browser-experience-game17-consumer-01/build-01/browser-publish/wwwroot。既有 V9 私有 main313e07324a1e521fa7a404533f1b29fc2da55b86cc9dfdd69c48668b5c0244e0 不覆盖。

### Task 1: 源与接缝准入（此轮提交审查）

**Files:** 上表五个 NEW 私有文件及本计划；不修改共享或普通源。

**Interfaces:** `makeV10({generator,main,gameView}) -> {main,gameView,prefix,extension,*Seams,sourceHashes}`；`invertMain(text,recipe)`、`invertGameView(text,recipe)` 返回完整原文。

- [x] 读真实 main：pump 调用 Tick→sessionState→refreshVoxelWorld→dumpPositions→applyDump；applyDump原 worldInstanceId、playerState及presentation调用不改。
- [x] 读真实 game-view：match key改变与localPlayerId改变均可在同一个顶层GameView内重建真正Presentation；三处原 optional dispose 均须旁观。
- [x] 准备新增原始时间戳跨度：csharp.tick/sessionState/dumpPositions/playerState/presentationState、refreshVoxelWorld、closeVoxelWorld、main.gameView.update、gameView.update及实际create/dispose。
- [x] 准备两个文件和 V9 前缀的逐字逆变换源码；当前只写，不执行。
- [ ] Root 全文读五个源码与本计划；非作者有限审核后明确允许 Task2。

精确基本边界代码已经完整保存在 v10-probe-extension.mjs：

```js
function probeV10Observe(operation, delegate, contextReader = null) {
  const row = probeV10Begin(operation,contextReader); let completed = false;
  if (row) row.at = probeV10Now();
  try { const result = delegate(); completed = true; return result; }
  finally { probeV10End(operation,row,completed,contextReader); }
}
```

上下文采样/分配放在起始时间之前，结束时间在后置上下文/记录之前。实际同步边界仍含调用包装/时钟的不可完全计量成本；C# 五跨度沿 V9 既有 export 开始/结束边界，不把它冒称纯 Runtime 成本。

### Task 2: 有限纯验证（尚未执行）

**Files:** 原样执行 v10-inverse.test.mjs；保存 NEW raw/result，不写普通源。

**Interfaces:** 测试只消费已有普通两个文本与 V9 文本；VM只运行探针 helper，不构造新玩法世界。

- [ ] 先记录源5+计划 hash，再在获准后运行：

```text
node --test C:/Work/LumioGames/LumioGame/.run/browser-experience-observer-v10-01/v10-inverse.test.mjs
```

预期10case、0skip、raw0；未运行时保持 NOT_RUN，任何断言/参数/接缝不符保存原失败，不称产品 RED。覆盖 whole main/game-view/V9 inverse、漂移/重复接缝拒绝、delegate一次/同一返回/原异常、观测异常隔离、WeakMap不装饰产品对象、null/failed dispose、每类独立ring、零world原值、samepump handle/world、原export表达式/compiled导入不变。

- [ ] 仅机械纠正自检或生成接缝问题；更改后重新全文审具体差异，不以取消断言取绿。
- [ ] 用实际 after 文本校验语法并验证原游戏 main sourceVM正常suite；任何已有 input/throw/finally负例保持。此轮尚未形成 after 文本或运行这一步。

### Task 3: NEW 私有副本资格（另需Root准入；此轮不执行）

**Files:** NEW measured17-v10-wwwroot及identity；不覆盖已有 ordinary/V9。compiled presentation.js和其他833文件保持原835输入字节。

- [ ] 获准后使用正式普通输入和不存在的输出目录执行 instrument-v10.mjs；完整读原/后两个文件与inverse，原835集合/其余833全byte一致。
- [ ] 不沿用 Runtime15环境anchor；V10中没有Runtime诊断/隐藏SDK输入。独立index焦点层如需保留，另以原单attr规则和whole inverse标识，不包含在本生成器。
- [ ] 只由Root启动新私有辅助页面；原服务/两人六Bot保持，先记录版本与visibility，再分别收相同Running阶段 quiet和输入窗口。
- [ ] 每≤2秒保存 DOM原字符串；500ms发布与1MiB上限沿V9。不是每Tick序列化发布。
- [ ] 记录新观测开销及所有截断，真实数据后再解释慢帧；不依据准备代码宣称瓶颈或性能修复完成。

## 新有界数据定义与解释

- `v10.spans[operation]` 每操作独立tail600；`pumps`600；`identities/worlds/handles/instances`各160；`bookkeeping`600。每次超限有独立dropped键；body字节超限时沿原V9按每类独立减半、保留至少1，再严格1MiB DOM门。
- `counters[operation]` 是整个页面累计调用/成功/throw；tail长度不是总数，不用尾计数除完整长窗口。
- `before/after/context` 记录 identityId/worldReadId/handleId、原缓存实际observedAt；引用所属类已被截断时应写 UNKNOWN，不能把最近值倒补旧span。
- `identities.raw`仅原participantId/selfId/lifePhase/inputOpen/matchId/phase；没有统计补造、角色补造或 surrogate 转participant。
- `worlds`保存原返回typeof/value，包括0；`handles`保存原displayed字串的清空及替换。pump退出后async import创建事件的pumpId为null，不能硬关联到上一泵。
- `instances.kind`分别gameView/presentation/adapter；id只为WeakMap观测编号。`disposeCompleted`仅表示原dispose调用正常返回，不证明GPU回收/GC或永久死亡；null不记销毁，throw不记完成。
- `gameView.update`旁观真实frame.match.id/match.matchId/frame.selfId以及adapter.localPlayerId；字段分别明确为matchEntityId/matchId/presentationExportSelfId/localPlayerSurrogate。
- `main.gameView.update`包含原presentationState export及JSON.parse和真实update；`gameView.update`包含配置投影、地形读取、adapter.project、可能的dispose/create及push。两个span和子span都inclusive，不可相加。
- `refreshVoxelWorld`包含必要close和grid构建；`closeVoxelWorld`含顶层GameView/内层Presentation实际dispose及grid销毁。Native Tick只表示既有V9 tick边界内Native分层，不能推导Tick外没有Native或managed独占。
- `clockCalls/clockFailures/errors`与`bookkeepingMsPartial`新增；后者不包括夹住它的clock读自身及其记录push，不能当完整探针总成本或净减数。V9 stringify/encoding预算、wire/draw/exportProjection开销保留原口径。

## 当前资格

PREPARE_ONLY / ALL_V10_EXECUTION_NOT_RUN。不存在新的835成品、实际浏览器曲线、Native/WASM行为结论或性能完成结论。Root作者的renderer测试在另一路进行，V10不混入其产品修法。
