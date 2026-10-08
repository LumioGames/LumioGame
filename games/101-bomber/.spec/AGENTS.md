# 101 炸弹人 · 项目中心文档

101 是 LumioGame 内的独立游戏工作区，目录与引擎消费方式对照 LumioSample。玩法真值是仓根的 [design.md](../../../docs/specs/bomber/design.md)、[stage0-kernel-contract.md](../../../docs/specs/bomber/stage0-kernel-contract.md) 和相关 ADR；浏览器 prototype/ 只提供手感与表现参考。

先读父仓[项目中心文档](../../../.spec/AGENTS.md)、父仓[知识导航](../../../.spec/knowledge/README.md)，再读本工作区[知识导航](knowledge/README.md)。四轮流程以父仓[开工提示词](../../../.spec/archive/plans/2026-09-27-101-bomber-engine-build-prompt.md) 为准；2026-09-28 Owner要求的最新原型与正式范围修订见[对齐计划](plans/2026-09-28-prototype-convergence.md)，其较新范围与授权优先；[执行账本](plans/2026-09-27-engine-build-progress.md) 只记录实际断点。

## 所有权与目录

- Gameplay/ 是唯一玩法源码树，按 .Server.cs / .Client.cs 分端编译；组件、实体、能力、效果与业务相系统都在这里。
- Client/ 放客户端应用、C# Bot、只读旁观表现、客户端配表投影与 Reader。
- Server/ 只放配表、底图和测试源码，不放工程文件；测试工程位于 Tools/。
- Tools/ 编排真实 Platform、DS 与 Bot，生成资产、检查证据；不能代跑游戏规则或伪造引擎成功日志。
- Engine/ 为只读候选发布物子模块，当前钉 0.0.4-main.ea82985。SDK、宿主、原生库与网页引擎部件都只从这里取；eng/BomberRelease.props 统一产品版本与要求的 SDK 版本，实际 manifest 版本不符会阻止构建。
- 子模块声明和 GitHub workflow 位于父仓 .gitmodules 与 .github/workflows/bomber-101.yml；许可证使用父仓文件。

## 引擎接缝

世界只有体素与实体。地面、硬砖、软砖等静态地形是体素，不能写入业务状态；玩家、炸弹、掉落、对局状态是 ECS 实体，只表现的内容是 Local 实体。静态且带业务逻辑的格子按引擎既有稀疏绑定分为体素与实体两半。

LogicTransform 是位置唯一真值，WorldManager.Tick() 是唯一模拟路径。输入与预测经 GAS，伤害经 Effect 提交结算，状态迁移经 lumio-hfsm。玩法使用引擎的确定性服务和生成的配表 Reader，不能自建影子模拟、地形存储、状态机迁移或墙钟规则。

底图由作者时脚本调用引擎写格并导出，DS 开机只 restore。每局随机软砖、破坏、再生和清格是玩法体素批量写入，不属于开机底图生成。配表启动装载后保持帧内不可变，生成 Reader 和两端投影不得手改。

## 构建与验证

本目录自带 Directory.Build.*、Directory.Packages.props、NuGet.config 和 global.json，不得继承父仓的 Runtime 源码依赖。

在父仓初始化发布物：

```text
git submodule update --init --depth 1 games/101-bomber/Engine
```

在本目录执行：

```text
dotnet build LumioBomber.slnx
dotnet test LumioBomber.slnx -- --minimum-expected-tests 1
node --test Tools/*.test.mjs
node eng/spec-lint.mjs
```

测试总数必须大于零，缺失、空或截断的运行证据不得通过。缺环境明确报 BLOCKED_ENV / exit 2。上述命令并不替代四轮任务的真实八 Bot、逐 Tick 确定性、30 分钟稳定性与完整旁观验收。

引擎缺口在上游补；内部验证可按开工提示词用架构仓 pack-release --from-main 生成同布局产物，不能改成同级源码引用。发布新引擎 tag 和公共语义变更仍需提示词规定的 Owner 裁定。
