# LumioGame

<!-- lumio-community:start -->
<div align="center">
<table>
<tr>
<td align="center" width="50%" valign="top">
<a href="https://qm.qq.com/q/PGkXh4tCyQ"><img src="https://raw.githubusercontent.com/LumioGames/.github/main/profile/assets/qr-qq.svg" width="170" alt="QQ 交流群 972220164"></a><br>
<a href="https://qm.qq.com/q/PGkXh4tCyQ"><img src="https://img.shields.io/badge/QQ%20%E4%BA%A4%E6%B5%81%E7%BE%A4-972220164-6171F0?style=for-the-badge&logo=tencentqq&logoColor=white" alt="QQ 交流群 972220164"></a><br>
<sub>什么都能聊</sub>
</td>
<td align="center" width="50%" valign="top">
<a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=b24vf257-5a2b-41ce-935e-bc4ce19dc396"><img src="https://raw.githubusercontent.com/LumioGames/.github/main/profile/assets/qr-game.svg" width="170" alt="LumioGame 开发者社区"></a><br>
<a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=b24vf257-5a2b-41ce-935e-bc4ce19dc396"><img src="https://img.shields.io/badge/%E9%A3%9E%E4%B9%A6%E7%BE%A4-LumioGame%20%E5%BC%80%E5%8F%91%E8%80%85%E7%A4%BE%E5%8C%BA-FFB86B?style=for-the-badge&logoColor=1E2A3A" alt="LumioGame 开发者社区"></a><br>
<sub>飞书话题群 · 玩法、内容、发布</sub>
</td>
</tr>
</table>
<sub>先进群再看代码。其它群和整体介绍见 <a href="https://github.com/LumioGames">LumioGames 主页</a>。</sub>
</div>
<!-- lumio-community:end -->

## 我是什么

Lumio 游戏产品与玩法内容仓，也提供各仓导航和开发检出工具。游戏规则、配置和表现属于游戏；SDK、网络、Runtime 与 Native 实现属于引擎。

## 怎么跑

外部开发从 [LumioSample](https://github.com/LumioGames/LumioSample) 开始：引擎通过只读 `Engine/` 子模块取自 LumioEngineRelease 的正式 tag，SDK 包是其中一部分（ADR-123）。

本仓仍有使用源码依赖的引擎开发与回归工程；按[测试规范](.spec/knowledge/standards/testing.md)准备同级 Runtime、Engine 和 Native，再运行：

```sh
dotnet build LumioGame.sln
dotnet test LumioGame.sln --no-build
```

需要整套源码时运行 `node clone-all.mjs`，权限与参数见脚本帮助。

## 从哪读

- [知识导航](.spec/knowledge/README.md)、[玩法与美术资料](docs/specs/)、[仓库边界](.spec/knowledge/standards/repository-architecture.md)。
- [LumioSample](https://github.com/LumioGames/LumioSample)、[引擎发布物](https://github.com/LumioGames/LumioEngineRelease)。
- 本仓代码的许可见 [LICENSE](LICENSE)；引擎发布物使用其自己的 BUSL-1.1 许可。
- [Lumio-DevKit 帮助手册](https://github.com/LumioGames/Lumio-DevKit)：面向游戏开发者的使用说明与排障入口。

## 子模块

| 子模块 | 责任 | 状态 |
| --- | --- | --- |
| `modules/server-gameplay` | 权威 Component、Processor、Chat 系统与炸弹人 Stage 0 契约壳 | 已建 |
| `modules/config` | 源配表、Schema、默认值和 typed table 输入 | 骨架 |
| `modules/scenario` | 初始状态、输入、Bot、断言、Capability 要求 | 骨架 |
| `integration/` | 端到端集成验收工具（`hello`） | 已建 |
| `games/101-bomber/prototype` | 101 炸弹人网页原型：Three.js 表现层 + TS 规则替身，抛弃型参考，不进 sln / Release / CI（ADR 0024） | 原型 |

尚未建立的子模块不在本表中；需要时按 [`docs/specs/engineering/module-scaffolding-design.md`](docs/specs/engineering/module-scaffolding-design.md) 逐个立卡新建。

## 职责

- 定义 Server/Client 非对称 Component、Processor、RPC Payload 和权限语义。
- 实现本仓的 Ability、Effect、Attribute、Tag、公式、Targeting、资源消耗、Cooldown 和表现事件。
- 经引擎体素的批量读写访问地形，不访问 Voxel Storage、不保存第二份地形真值。
- 定义 Scenario、Bot 行为、Replay Fixture、性能 Workload 和业务断言。
- 提供 Game Migration、Save/Load 语义、Config/Content Hash 和签名输入。
- 声明每个 Scenario 的 `RequiredCapabilities`，避免假设所有 Host 都具备 Native、Renderer 或网络。

边界全文见 [仓库边界](.spec/knowledge/standards/repository-architecture.md)。

## 明确不负责什么

- 不实现 ECS Storage、Tick Scheduler、GAS 通用生命周期、Prediction/Rollback 机制或 Runtime Hot Reload。
- 不创建或销毁 Host、WorldSlot、CoreCLR、ALC、Socket、Connection 或 Release Pool。
- 不实现 Voxel Chunk、Revision、Streaming、Mesh 或 Native ABI。
- 不把 Server/Client 强制做成同名 Component 或同一份 World。
- 不在 Gameplay 中读取 `IsOffline`、平台或 Transport 实现来分叉规则。
- 不在本仓定义或复制公共契约；公共语义只在架构仓 `LumioGameEngine` 维护。
- V1 不加载第三方 Mod；Mod 仅保留 P2 受控扩展位置。

## Source / Compile-Time Dependencies

- 引擎能力经发布物与 SDK 包消费。外部开发从 [LumioSample](https://github.com/LumioGames/LumioSample) 开始，不检出引擎源码。
- .NET SDK、C# 编译器，以及经过许可证、SBOM、漏洞、AOT、确定性与性能审查的包。

业务代码禁止对 NativeCore / VoxelEngine 源码建立编译期依赖。生产与测试工程都只引用引擎的公开面，不引用引擎仓的测试、夹具或样例工程；玩法用到的组件与实体（含聊天与身份）归本仓自有，测试世界的启动也由本仓自建。

内部贡献者的跨仓检出、环境变量与本地构建口径见 [仓库边界](.spec/knowledge/standards/repository-architecture.md)「跨仓检出」，命令见 [测试规范](.spec/knowledge/standards/testing.md)。

## Headless Test Surface

- Component、权限、GAS Content、Scenario 初始状态和业务断言。
- 炸弹人 Stage 0 的传播、连锁、血量、帽子、拾取、地图与回放用例（见 [`docs/specs/bomber/stage0-test-matrix.md`](docs/specs/bomber/stage0-test-matrix.md)）。
- Replay 首差异、Save/Load/Migration Golden。
- Config Schema、优先级、快照、Content Hash 与握手拒绝。
- 日志与审计关联、Failure Bundle、100 Bot Workload、Tick、复制与内存指标。

## 当前阶段与开发节奏

当前阶段是炸弹人方向 B「成长爽局」M1，首发产品仍是阶梯 ①。切片划分、每阶段的量化通过门与依赖见 [`docs/specs/bomber/design.md`](docs/specs/bomber/design.md) §16「实现切片：Gate 0 + Stage 0–6」。Stage 0 的内核契约见 [`docs/specs/bomber/stage0-kernel-contract.md`](docs/specs/bomber/stage0-kernel-contract.md)。
