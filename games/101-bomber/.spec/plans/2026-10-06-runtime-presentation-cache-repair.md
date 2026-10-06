---
status: completed
---

# Runtime 表现键缓存修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复已确认的三处缓存回归，保留增量计算、首次发布与原有发布额度语义。

**Architecture:** 缓存与dirty属于预测World；普通Server和confirmed World不记录发布dirty，预测World退役清理辅助集合。每实体收集全部提供者的去重键，跨实体按引用数维持联合集；先完成单实体键推导再替换旧贡献，避免提供者异常留下半更新。

**Tech Stack:** 现有C#14/.NET10与netstandard2.1、xUnit v3/Microsoft Testing Platform、官方complete26/27对照。

## Global Constraints

- 禁止reset/clean/覆盖还原/旧DLL替换/减少玩家或Bot/关体素/降频/放宽额度或协议校验/改游戏guard遮掩生命周期问题。
- 不自动启用或发行任何Draft，ADR142仍Owner Pending；不改Platform18085身份与历史schema pins。
- 不操作任何现场浏览器或18101/18105/18331服务；保护18081/18082/18084/18085/18092–18097。
- 不改唯一权威World、协议、公共API、模拟频率或额度常量；生成物不得手改。
- 唯一交付进度账本是`games/101-bomber/.spec/plans/2026-10-02-delivery-progress.md`，只由Root追加；本计划不另立完成账本。
- 只在新Runtime修复worktree改生产源，保留原候选与封件；不能把complete26基线GREEN称作修复GREEN。

### Task 1: 修复三处表现键缓存回归

**工作目录:** `C:/Work/LumioGames/.101-restore-01/LumioGameRuntime28PresentationCacheFix`

**Base:** `1222ff6f0f22662b290ffe421782852201b522da`

**分支:** `codex/101-presentation-cache-correctness`

**Files:**
- 修改：`modules/ecs/src/Lumio.GameRuntime.Ecs/World/World.cs`，缓存字段、dirty入口、缓存collector与退役清理。
- 新建：`modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/PresentationKeyCacheTests.cs`，集中回归测试；可以复用已有registry/预测夹具的模式，不复制生产collector。
- 仅在直接证据要求时修改相关预测入口，不扩大重构。
- 原有保护：`PredictedWorldRebuildTests.cs`、`PresentationBudgetTests.cs`、GAS `RealNativePublishRecomputesOnlyDirtyPresentationKeys`及steady native gate。

**Interfaces:**
- 消费`World.Attach`、`Detach`、`MarkPresentationKeyDirty`、`CollectPresentationKeysCached(PresentationReservation)`、完整`CollectPresentationKeys`与`WorldManager.PrepareJointPublication`。
- 保持上述函数签名及返回键集合/发布额度语义；内部字段类型可以按正确性调整。
- 全量collector是输出联合集的差分oracle，不修改oracle来适配新实现。

**先读证据与规范:**
- 当前worktree的`.spec/AGENTS.md`、`.spec/knowledge/README.md`及architecture/testing/code-style；系统排障与TDD技能。
- `C:/Work/LumioGames/LumioGame/.run/20261006-presentation-retention-red-01/probe/Program.cs`与`independent-review-01/result.json`：官方complete27的4个真实RED及complete26对照，63/63独审。
- `C:/Work/LumioGames/LumioGame/.run/20261006-delivery-takeover-review-01/schema15-independent-review/runtime-cache-lifetime-review.json`。
- 原工作树`.run/refresh-touched-01/`保存已有suite基线。当前GAS950/945/5，其中4个缺test-support native，1个预存StructuralScratch断言12706/12070；ECS610/609/1缺generator环境，Coord204/202/2环境跳过。不能混称全绿。

- [x] **Step 1: 在修生产源之前加入并运行失败测试。**

完整行为用例应覆盖以下断言，不通过公开诊断API暴露测试内部状态：

```csharp
// 普通Server与confirmed夹具，均不启动joint prediction；每批最多一个临时live实体。
// 两批各256个独立有效ID，调用真实Attach与Detach。私有dirty计数仅为寿命观测。
Assert.Equal(initialLive, world.LiveEntityCount);
Assert.Equal(0, ReadPresentationDirtyCount(world));
// 预测World：两个实体提供同一key，首次cached结果与完整collector相同。
Assert.True(full.SetEquals(cached));
// 删除或改动其中一个实体后，另一实体仍持有的shared key必须继续存在。
Assert.Contains(shared, nextCached);
// 同一实体的多个provider返回不同key时必须全部出现，相同key仅出现一次。
Assert.True(new[] { first, second }.ToHashSet().SetEquals(nextCached));
```

`ReadPresentationDirtyCount`只能是测试内反射辅助；其余夹具直接使用仓内已有internal测试可见接缝。还要覆盖最后一个共享持有者删除、首次预测clone/第一次发布、无dirty不重复推导、单字段dirty只重算对应实体、provider抛出后重试与全量集合一致、Dispose后没有辅助集合条目。明确保存各条预期RED，构建错误不算RED。

聚焦执行起点（在worktree中，先核对本仓runner接受的filter形式）：

```powershell
$env:LumioArchRoot='C:/Work/LumioGames/.101-restore-01/LumioGameEngine11SdkClosureLfComposition24'
dotnet test --project modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/Lumio.GameRuntime.Ecs.Tests.csproj -c Release --filter-class '*PresentationKeyCacheTests*'
```

如CLI形式不兼容，读取`global.json`和已有runner帮助后使用实际支持形式，报告原始命令和退出；不放宽测试内容。

- [x] **Step 2: 最小实现，保留增量路径。**

dirty入口仅在预测World接收非默认ID，Dispose清理dirty、每实体键及跨实体引用集合，并释放其对键的引用。预测clone在复制实体前已经设置`IsPredictedClone=true`，因此不能因guard遗漏bootstrap。若使用更窄的消费所有权标记，须同时证明首次发布前所有预测创建/typed projection均被覆盖。

参考核心替换算法（类型名以本仓现有字段为准；不得引入第二个全世界稳态遍历）：

```csharp
foreach (NetEntityId id in dirtyIds)
{
    EntityRecord? record = RawRecord(id);
    HashSet<PresentationKey>? next = null;
    if (record is not null && record.IsLive)
        foreach (Component component in record.Components)
            if (component is IPredictedPresentationKeySource provider &&
                provider.TryGetPresentationKey() is PresentationKey key)
                (next ??= new HashSet<PresentationKey>()).Add(key);

    // 先完成所有provider调用；抛出时不丢失该实体的旧贡献。
    if (entityKeys.TryGetValue(id, out HashSet<PresentationKey>? previous))
    {
        foreach (PresentationKey key in previous)
            if (keyReferences[key] == 1) keyReferences.Remove(key);
            else keyReferences[key]--;
        entityKeys.Remove(id);
    }
    if (next is not null)
    {
        foreach (PresentationKey key in next)
            keyReferences[key] = keyReferences.TryGetValue(key, out int count) ? checked(count + 1) : 1;
        entityKeys.Add(id, next);
    }
}
dirtyIds.Clear();
var result = new HashSet<PresentationKey>(keyReferences.Count);
foreach (PresentationKey key in keyReferences.Keys)
{
    reservation.Key(key);
    result.Add(key);
}
return result;
```

保留现有`reservation.Reserve(128)`和每个输出unique key的原始收费；不得提高quota或吞掉异常。上面算法是实现起点，若发现异常原子性或资源合同问题，以Global Constraints和完整collector语义为验收，不为照抄示例制造缺陷；把必要调整写明给Root。

- [x] **Step 3: 重跑聚焦RED及预测/预算回归，保存GREEN。**

```powershell
dotnet test --project modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/Lumio.GameRuntime.Ecs.Tests.csproj -c Release --filter-class '*PresentationKeyCacheTests*'
```

同进程命令环境要传递批准Engine根，防止嵌套generator缺环境。预测/预算现有用例需通过；缺Native必须如实报告，不伪造替身成功。Root负责后续三套件单次回归及官方RED probe对修复程序集的复核，worker不运行完整三套件或pack。

- [x] **Step 4: 自审并提交限定文件，交回完整证据。**

```powershell
git diff --check
git add modules/ecs/src/Lumio.GameRuntime.Ecs/World/World.cs modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/PresentationKeyCacheTests.cs
git commit -m 'fix(ecs): preserve presentation key ownership and lifetime'
```

若实际必要文件不同，只暂存明确审核过的源码和测试。不要提交生成器引发的无关漂移，不能reset/clean。报告写到`C:/Work/LumioGames/LumioGame/.run/20261006-confirmed-fixes-01/runtime-task-1-report.md`，记录base/head、文件、RED/GREEN命令与raw exit、日志路径、未执行项和风险；返回简短状态。Root随后产出全范围diff并安排独立任务复审、三套件回归与最终复审。

## 后续资格

Root在当前目标内继续独立复审、三套件与干净修复候选保存。Server写路径诊断属于另一个计划；不让Runtime修复冒充os-error-5或ADR142死亡链修复。当前用户前台现场不替换，官方新包及消费验收只按实际新证据记账。
