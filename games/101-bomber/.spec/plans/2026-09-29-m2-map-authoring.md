---
status: in_progress
---

# M2 三档底图作者链路实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 从正式源表生成 19/23/27 三档 M2 底图，通过当前 Engine SDK Capture/Restore 验证，保留旧房间直到新预算与生产者完成。

**Architecture:** 延伸现有 map schema 与 LumioConfig profile 管线；几何只在 MapAuthor 作者工具计算，产物由 Native 编码。新 profile 暂为 author-only，启动器和 Gameplay 装载均拒绝，防止 19 档绕过旧尺寸校验。原默认导出和 bomber.voxel 保留旧回归语义；此任务不代表 M2 房间接通。

**Tech Stack:** C#/.NET 10、Engine/ 发布 SDK、官方 LumioConfig、Node test。

## Global Constraints

- 唯一 Tick：WorldManager.Tick()；底图作者工具不得被 Gameplay 或 DS 运行时导入。
- SDK、宿主和 Native 只从 games/101-bomber/Engine/ 发布布局消费。
- 生成 Reader、两端投影和 manifest 不得手改；只运行现有官方生成命令。
- 保留既有 map 行 108001、game 行 100001 与所有旧列 ordinal；新列只能追加。
- ADR0048 是三档几何数值真值；freezeEligible=false，SDK 底图验证不等于 DS 或整局验收。
- 工作区有继承的 dirty/untracked 修改，按任务开始时文件快照生成 review diff，不回滚已有内容。

## Task 1: 三档 author-only profile 与真实 SDK 底图

**Files:** `Gameplay/Tables/schemas/map.json`、`tables/map.txt`、`profiles.json`、`profiles/m2-map-{19,23,27}/layers/product/{map,game}.txt`；`Gameplay/Config/BomberObjectBudgets.cs`；官方生成的 `Gameplay/Config/BomberTypedTables.cs`、两端 `Config/Generated` 和配置投影；`Tools/Lumio.Bomber.MapAuthor/Program.cs`、`Tools/{capture-basemap,official-catalog,launcher}.mjs`；对应 Node/C# 回归；`Server/Assets/Maps/m2-map-{19,23,27}.voxel`；现有 Tables/Tools README。

**Interfaces:** `loadLayout(repoRoot, { profile } = {})`、`runCapture({ profile, out, ... })`、`verifyBaseMap({ profile, out, ... })`；MapAuthor 命令在现有 `capture|verify <root> [snapshot]` 之后接受显式 `--profile <name>`。无 profile 保持既有行为；有 profile 默认写对应命名快照，不覆盖 bomber.voxel。

- [ ] 先新增能失败的回归：三个 profile 的人数/边长/几何字段；SDK 恢复后的水/柱/潜在格精确数分别 28/48/213、44/80/317、60/104/461；四桥、3x3 广场、镜像和全陆路连通；跨 profile 快照拒绝；未知/path-traversal profile 拒绝；默认底图与旧流程仍通过。
- [ ] 在 map schema ordinal 25 起追加 `layout_kind:string`、`moat_radius_cells:i32`、`moat_branch_cells:i32`；默认源分别 `LegacyPillars/0/0`，新 profiles 为 `M2Moat`。三个 profile 的 game 人数/尺寸分别 8/19、12/23、16/27，半径 3/4/5，支流长度 2/4/6；map width/depth 同步，来源引用 ADR0048。profiles 用 `group: authoring` 与 `runtimeEligible: false`，独立参数 map.default.width，其余实际差异列入 derived，保留完整差异校验。
- [ ] `BomberObjectBudgetCalculator` 在算旧预算前拒绝 `Map.LayoutKind != "LegacyPillars"`。launcher 读取有效 map 投影后同样拒绝 M2Moat；不能只依赖 profile 名称或文件路径。测直接配置路径、19 档及未知布局失败，旧 default 正常。
- [ ] 运行官方 `node Tools/sync-config-readers.mjs`、`node Tools/sync-config-export.mjs`；再运行各自 `--check`。变体不改变 schema/行 ID，Readers 所有 profile 字节一致。
- [ ] MapAuthor 从选定 profile 的 server 投影读取地图/人数/方块；严格校验成套尺寸和半径/支流，拒绝未知布局。保留 LegacyPillars 路径。M2 地面水写在 ground layer，水面 obstacle 为空；水域与核心均不放硬柱。核心及水函数为：

```csharp
int center = (Width - 1) / 2;
int dx = Math.Abs(x - center), dz = Math.Abs(z - center);
int distance = Math.Max(dx, dz);
bool moat = distance == MoatRadius && dx != 0 && dz != 0;
bool branch = Enumerable.Range(0, MoatBranchCells).Any(i =>
    dx == MoatRadius + 1 + i / 2 && dz == MoatRadius + (i + 1) / 2);
bool water = moat || branch;
bool pillar = !water && distance >= MoatRadius && x % PillarStride == 0 && z % PillarStride == 0;
```

- [ ] SDK 批量写后 Capture，在新 World Restore 并核对所有驻留格；两个独立作者进程的 capture 字节相同。验证输出新增水格/潜在可放弹格/桥与连通统计，断言实际 SDK 读回，不仅断言 ExpectedBlockId 自身。优先使用发布 SDK 已有批量读入口；若 SDK 作者工具仅暴露 ReadCell，记录其作者期限定，不新增 Gameplay 单格读取。
- [ ] 运行 `node --test Tools/bomber-config.test.mjs Tools/capture-basemap.test.mjs Tools/official-catalog.test.mjs Tools/launcher.test.mjs` 与配置/预算有关 C# 定向测试；旧全量 uint 快照失败单列，不宣称修好。运行根 lint、101 spec-lint、git diff --check。
- [ ] 更新现有 README 说明 profile 默认输出、作者期范围、三档房间仍待预算/生产者/DS 验收。生成任务开始前后精确 diff 和验证报告到 `C:/Work/LumioGames/probe/bomber-m2-map-authoring-*`，独立审查通过后才标本任务完成，不提交整个脏工作区。

## 2026-09-29 晚间核对

Task 1 的作者期文件仍在工作树，勾选保持未完成：独立审查没有返回。协调者审查在 `probe/bomber-m2-map-authoring-final-review-20260929.md`，不能代替另一上下文的 spec/quality 通过。旧 `bomber.voxel` 本次哈希仍是 `ffc6b13ac8f7a24469a3348b38f720cb128f54c3284e13fe0fd8652fd7b8e019`。三份 M2 快照哈希与实施报告一致。

`node --test Tools/*.test.mjs` 于 18:35–18:36 结束，`NODE_EXIT 1`：293 项，289 通过，4 失败，0 跳过。四条都在 `schema-identities.test.mjs`，是身份证据哈希不一致，不是地图准入测试失败。日志 `probe/bomber-map-tools-rerun-20260929.log`。历史日志没有退出码，这次补上了。

`M2BudgetEnvelope` 只锁定 ADR0048 的整数上界。随后增加 `first_trigger_ms`（默认与三档房间均为 8000，初始摆放不算一波）和 `m2-room-19/23/27`：封顶 240000 ms，再生停止提前 20000 ms，镜像组 2/3/4，前五段强力宝箱关闭。官方 `sync-config-readers` 与 `sync-config-export` 均 exit 0。`M2InitialLayout` 在不写体素的前提下摆出三档镜像箱和桶，水/柱/潜在格与 ADR0048 一致，测试 3/3。`BomberObjectBudgetTests` 45/45，`BomberTablesTests` 8/8，房间和作者 profile 都在装载时因 `M2Moat` 被拒绝。`node --test Tools/bomber-config.test.mjs` 10/10。这些仍不是正式房间、DS Restore 或整局。`freezeEligible` 仍为 false。

## 后续依赖

三档 room profile、动态初始放置、再生箱/桶、完整对象预算、DS Restore 与 12/16/8 C# 准入沿原型收敛计划继续；本任务不启用这些尚未完成的路径。Effect Runtime 注册定向测试已重跑，全量 64 失败仍在，独审未返回。Runtime PR244 仍 OPEN，head `4962f660`，`mergedAt` 为空。
