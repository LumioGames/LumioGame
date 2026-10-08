# Bomber Tools Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 将复制的 Sample 工具迁为真实 Bomber 首轮工具入口，保留宿主契约且不把格式检查当规则验收。

**Architecture:** 共用账户、发布定位、启动与 Host guard 继续消费 Engine/v0.0.1。证据验证器仅检查游戏自有文件接口，不执行玩法，也不授予完整验收通过。

**Tech Stack:** Node ESM/node:test、.NET 10/xUnit v3/MTP、公开 GitHub Actions。

## Global Constraints

- 不编辑 launcher、地图/资产、配置、Gameplay、Client 已交回文件。
- 不 commit/push，不触发、读取或等待 CI。
- 缺失/空/截断证据失败；完整规则、同输入回放、八 Bot 30 分钟、旁观全部保留第二轮门。

## Task 1: 移除 Sample 专属入口

- [x] 删除 `Tools/acceptance-map{,.test}.mjs`、`acceptance-spawn.test.mjs`、`mc-mapping{,.test}.mjs`、`spectator-100{,.test}.mjs`、`stress-move{,.test}.mjs`（9 文件）。
- [x] 删除 `Tools/fixtures/oracle-min`、`Tools/fixtures/world-assert`（6 文件）和 `integration/{criterion3,prime,stress-r588,determinism,tour-final-verification.json}` 的 Sample 历史记录（124 文件）。
- [x] 更新 `Tools/test.mjs`、`package.json`、`ds-ready.test.mjs`、README/logs README，仍验证共用准入与体素参数。

## Task 2: Bomber 证据文件接口

- [x] 用 `Tools/world-assert.test.mjs` 与 `verify-evidence.test.mjs` 先锁住非空、重复格/身份、损坏 JSON、缺轮次、Tick 缺口、hash/事件分歧、错误记录、截断结尾。
- [x] `assertWorld(actual, expected)` 返回 failure 数组；逐格/完整实体字段对比，但不是规则 oracle。`verifyEvidenceDir(dir)` 要求独立两轮 `manifest.json/inputs.ndjson/ticks.ndjson/world.json` 及根 `expected.json`。
- [x] 每轮严格要求同 release/config/map/seed/input hash、连续 Tick、完整成功结束标记；两轮逐 Tick 比较 stateHash/events。返回 `scope: bomber-evidence-interface`、`acceptanceStatus: NOT_EVALUATED`。
- [x] `node --test Tools/world-assert.test.mjs Tools/verify-evidence.test.mjs` 7/7 通过；测试数据仅在 OS temp 生成，不提交假生产证据。

## Task 3: Host 与公开 CI

- [x] `Server/Tests/Host` 子任务保留真实 release admission/restore/physics，改 HealthPoints 持久化与五能力真实未就绪断言、128 位完整身份。
- [x] `.github/workflows/bomber-101.yml` 移除退役工具步骤；保留 release/native/map/Host，并明确先 build 再 MTP test、minimum > 0；公开 LumioConfig 固定已验证作者提交。
- [x] 本地运行 Host 输入准备、两隔离进程和改动 Node 测试；真实结果见下文。

## 逐项省略记录

| Sample 项 | Bomber 处理与仍保留的义务 |
|---|---|
| MC 导入与 lakeside 作者工具/测试 | 无 Bomber 用途，删除；正式 Bomber 地图作者链仍由地图任务维护 |
| 100 Bot spectator / stress-move | 删除；八 Bot 30 分钟与真实浏览器整局仍为验收门 |
| oracle-min / oreCount / 挖矿事件宽松 Tick 比较 | 删除；替换显式证据文件接口和严格逐 Tick 对比 |
| 存档关服重启与 Sample integration PASS 记录 | 删除；Host 通用 snapshot/restore 与正式底图 Restore 仍保留 |

## 本地验证记录

- 新世界/证据测试先红后绿；独立审查发现失败 completion、Infinity→null 和事件 ID 截断三项，均补反例并修复。严格 envelope 及递归有限 JSON 守卫后证据 7/7。
- 聚焦 Node：world-assert、verify-evidence、ds-ready、test-server-host、prepare-server-host-inputs 共 36/36，0 fail、0 skip。
- 真实 CatalogWorld 生成 1/1，prepare 校验同 release native；Host 先复现旧 Stamina 失败，迁移后 2/2、0 fail、0 skip。runner 强制英文子进程输出并校验 total=1，外部中文环境最终重跑仍为 `HOST_SUITE cases=2 total=2 passed=2 failed=0 skipped=0`。
- Host build 0 warning、0 error。最终日志位于外部 probe `bomber-host-final-runner/run-0ZTd7k/`。
- spec-lint OK：通用 12 通过；扩展 1 通过、1 跳过（101-bomber 非独立 Lumio 仓检出，目录契约不适用）。
- 未触发、读取或等待 CI；未 commit/push。无新增 Host 环境阻塞。真实整局/权威回放生产端、八 Bot 稳定性和旁观尚未完成，不由本次验证声称通过。
- 独立复查保留的旁观 C# 编译门实跑发现 3 错误：`SpectatorDump.cs:172` 的 `IdentityComponent.ColorHue`、`:240` 的 `MoveAbility.Input.Dx/Dz` 已不存在；此文件属旁观任务，已交回主任务处理，CI 编译门完整保留。旁观 Node 47/47 不代表 C# 构建通过。
