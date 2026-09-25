# 0024 · 仓库按游戏分目录,炸弹人为 101;网页原型作为抛弃型参考落在 games/101-bomber/prototype

- 日期:2026-09-25
- 状态:生效

## 背景

用户 2026-09-25 要求以最快方式做一个炸弹人网页示例:画面参考 Tripo「Bubble Bay / 泡泡小镇」Three.js demo,玩法必须基于 [`docs/specs/bomber/design.md`](../../docs/specs/bomber/design.md) 与 [`stage0-kernel-contract.md`](../../docs/specs/bomber/stage0-kernel-contract.md),可以不走本仓与引擎的那套框架,作为后续接入引擎的参考版本。

落点有三处现成约束:

- ADR [0013](0013-logic-first-browser-client-no-engine.md) 把浏览器宿主与渲染选型归 `LumioClient`;
- 架构仓 ADR-067 规定浏览器里的规则跑 C# .NET WASM Replica,JS 只渲染与采输入,不得出现第二份 JS/TS 规则;
- [`repository-architecture.md`](../knowledge/standards/repository-architecture.md) 的「三条接缝」要求不建第二条 Tick、不存第二份地形真值、移动放弹走 GAS。

用户同时定调:本仓会承载多款游戏(预期四五款),每款一个独立目录;炸弹人是第一款,编号 **101**;原型单独一个目录,不另开仓。

## 决策

- **本仓按游戏分目录:`games/<编号>-<slug>/`。** 炸弹人 = `games/101-bomber/`。本 ADR 只立目录约定与第一个落点;既有的炸弹人资产(`modules/server-gameplay/.../Bomber/` C# 契约壳、`docs/specs/bomber/`)**本次不搬**,整体迁移另立卡。
- **网页原型落 `games/101-bomber/prototype/`**:独立的 Vite + TypeScript + three 工程,自带 `package.json` 与锁文件,**不进 `LumioGame.sln`、不进任何 Release、不进 CI**,也不被任何生产路径引用。
- **原型的定位是抛弃型参考**,分两层对待:
  - `src/sim/`(TS 规则替身)与 `src/app/local-host.ts`:只为让原型能玩、验证手感与表现,**不是**规则真值;契约真值仍是 C# 契约壳与 `stage0-kernel-contract.md`。将来按 ADR-067 换成引擎 Replica 适配器时整体删除。
  - `src/contract/`、`src/present/`、`src/view/`、`src/hud/`、`src/input/`、`src/audio/`:表现层只依赖 `src/contract/`(字段逐字照抄 C# 契约的组件与事件),是后续接入引擎时可以复用的部分;`tests/architecture.test.ts` 机械守住「只有 local-host 能 import sim」。
- **对「三条接缝」与 ADR-067 的豁免只覆盖这个原型目录**:它不是 Server / Client Gameplay 程序集,不参与任何发布组合,因此不构成「第二条 Tick / 第二份地形真值 / 第二份 JS 规则」的生产实现。任何生产代码不得 import 或复制 `src/sim/`。
- **不取代 ADR 0013。** 生产浏览器宿主与渲染选型仍归 `LumioClient`;原型里的 Three.js 只是参考实现,不构成选型结论。
- **不构成美术定调。** 美术仍在 ADR [0007](0007-art-style-reset-three-way-pitch.md) 的比稿流程里;原型遵守世界观 ADR [0008](0008-worldview-animal-plush-party.md)(动物玩偶、桌面积木棋盘、不血腥),配色借比稿方向 B 色板,只作参考。
- **原型内容范围:** Stage 0 + Stage 1 规则(19×19、8 人、三心、连锁结算、击杀铸帽与散落、帽王、结算与自动下一局、血包)**加 Stage 2 材质(木箱、水方格)**——后者按用户要求提前进入 19×19,与 design.md §5.3 断言 2「Stage 0 的 19×19 只有积木、铁皮、空地」不同,仅限原型。

## 后果

- 本仓第一次出现 Node/TypeScript 工程;`node_modules/` 已在根 `.gitignore`,原型自带 `.gitignore` 排除 `dist/`。`dotnet build/test` 与 lint 不受影响。
- 原型里契约没有、但表现需要的字段与事件(血包 `Kind = 3`、`BrickDestroyed` 等表现事件、`PlayerMeta`、`MatchMeta.phaseEndTick`、事件的 `proto` 扩展字段)一律标 **NON-CONTRACT**;表现层不得依赖它们才能工作。是否提给契约,等原型验证后另议。
- 原型里 TS 规则替身对契约未规定之处做的取舍(ms→tick 向上取整、软砖格不计入 Reach、火焰越过被连锁的炸弹继续传播、炸弹在引爆时回到手上等)记在原型 README,C# 落地时逐条核对,不因原型而视为已定。
- 代价:原型与 C# 内核是两份规则实现,存在漂移风险;接受,因为原型的职责是手感与表现参考,不是规则真值,且接缝测试保证删掉替身不影响表现层。
