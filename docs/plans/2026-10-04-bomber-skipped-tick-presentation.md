# 跳过权威 Tick 的表现插值 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本任务由新表现子代理实施，Root 和非作者 reviewer 审查；不与 Runtime、Host 或包构建混为同一验收。

执行备注：尝试新建表现子代理时工具返回 thread limit reached，未有源码执行。实际改由已结束上一项审核的 schema_pins_review 承担本任务作者，Root 为非作者审查；不让本任务作者自审实现。

**Goal:** 当相邻正式表现快照跨过多个逻辑 Tick 时，现有上一帧到当前帧的插值按该逻辑时间跨度播放，避免在固定50ms提前到终点后等待下一份快照。

**Architecture:** 保持 PresentationFeed 原两份只读快照、同 Tick 更新、一次事件派发、冻结/慢镜和重进 reset。只把 sample 的正跨度插值时长从一个 tickMs 变为 span×tickMs；不外推、不补玩法帧、不修改位置、模拟、输入或权威时钟。瞬移/重生的原 interpolateXZ snap 判定保持。

**Tech Stack:** TypeScript、现有 Vitest、原 PresentationFeed/snap/died fixtures。全部使用既装依赖，不升级包。

## Global Constraints

- 共享父仓分支 feat/101-bomber-engine-foundation 有大量既有成果：不reset/clean/restore、不一概stage、不提交共享分支。
- 仅修改 Client/Presentation/src/present/feed.ts 与其现有 __tests__/feed.test.ts；先保存当前两文件原件/哈希和真实RED。其它Gameplay、main、generated、Runtime、Host、pins/ledger不改。
- 配置tickRateHz=20/tickMs=50保持，八人/六真实Bot/体素/额度保持。真实Running原件中的跨Tick序列是问题场景；此行为测试不能代替真实浏览器性能/连续移动/十次关闭重进验收。
- 官方完整16正在构建，本任务不操作服务或浏览器，不复用旧DLL。编译只使用正常页面typecheck/build，产物保存NEW私有目录；不覆盖旧dist证据。

### Task 1: 逻辑跨度插值

**Files:**

- Modify: games/101-bomber/Client/Presentation/src/present/feed.ts
- Modify/Test: games/101-bomber/Client/Presentation/src/present/__tests__/feed.test.ts
- Evidence: .run/presentation-gap-interpolation-root-01/ 和 NEW 子代理私有 run 目录。

**Interfaces:** 原 new PresentationFeed(tickMs:number)、push(frame:TickFrame,recvAt:number):void、sample(realNow:number):FeedSample|null；不改签名。输出 alpha/renderTick/dueEvents 仍来自原两个真实快照。

- [ ] **Step 1: 保存基线，新增先失败的真实 feed 行为测试。** 使用现有 snap/died，不Mock/不测源码包含运算符。两份快照按真实逻辑间隔到达，跨2或3 Tick；逐四分之一时段检查平滑推进和事件不早于对应renderTick。

```typescript
it.each([2, 3])('plays a %i-tick snapshot span over its logical duration', span => {
  const feed = new PresentationFeed(50)
  const latestTick = 10 + span
  const duration = span * 50
  feed.push({ snapshot: snap({ tick: 10 }), events: [] }, 0)
  feed.push({ snapshot: snap({ tick: latestTick }), events: [died(latestTick, 1, 2, 0)] }, duration)
  for (const portion of [0.25, 0.5, 0.75]) {
    const sample = feed.sample(duration + duration * portion)!
    expect(sample.alpha).toBeCloseTo(portion)
    expect(sample.renderTick).toBeCloseTo(10 + span * portion)
    expect(sample.dueEvents).toEqual([])
  }
  const end = feed.sample(duration * 2)!
  expect(end.renderTick).toBe(latestTick)
  expect(end.dueEvents).toHaveLength(1)
  expect(feed.sample(duration * 2 + 1000)!.renderTick).toBe(latestTick)
  expect(feed.sample(duration * 2 + 1001)!.dueEvents).toEqual([])
})
```

- [ ] **Step 2: 正常窄运行并记录真实RED。** 在 Client/Presentation 执行 `npm test -- src/present/__tests__/feed.test.ts`，保存原退出、原source和原log。预期旧代码span2在1/4时alpha=.5而非.25；span3同样提前推进。若行政错误先修环境并保留，若行为不失败停止候选，不制造RED。
- [ ] **Step 3: 最小生产修复。** 正跨度分支保留clamp，把原 `(realNow - this.b.recvAt) / this.tickMs` 改成 `(realNow - this.b.recvAt) / (span * this.tickMs)`；span<=0仍alpha1，原renderTick表达式、事件/副本/时钟其它代码全部不变。
- [ ] **Step 4: 同测试GREEN及相关回归。** 正常跑 feed、view logic、replica-adapter（含重生/瞬移）相关既有测试与typecheck；准确记录实际通过/失败/跳过。仅新变化或失败理由才扩大范围。不把Node行为GREEN称真实帧率改善。
- [ ] **Step 5: 有限非作者复审。** 保存两源全diff、先RED后GREEN和原件；Root及reviewer判断事件时间与一份收到快照的插值语义，尤其跳帧后恢复密集到帧可能仍追赶，不称完全解决网络抖动。不得变更formal pins/ledger；必要时后续独立审核后做精确CAS。
- [ ] **Step 6: 后续正常页面构建与真实消费。** 通过有限审核后由Root编排新完整16消费页面（NEW构建/publish/源闭包），再实际双人同房间移动/放弹/十次close-newpage，测真实Tick和位置轨迹。该真实验收仍由原交付目标约束。
