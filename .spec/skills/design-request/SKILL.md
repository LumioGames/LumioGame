---
name: design-request
description: 把策划案翻译成可执行的开发需求并交 Workflow 落单——含验收标准、依赖与上游 ADR 判定。当策划案定稿要转开发、或要提一条策划需求时使用。
---

# Design Request(策划需求)

把策划案系统地翻译成开发需求。方向权威在 [design-director](../design-director/SKILL.md),文档基准在 `docs/specs/`(落点定义见 [design-doc](../design-doc/SKILL.md))——本技能只做翻译,不做定调。落单交 Workflow,不自建需求跟踪。

## 何时使用

- 策划案定稿,要转成开发可执行的需求。
- 要提一条新的策划需求(哪怕还没有完整策划案)。

## 操作步骤

1. **读基准。** 策划案已建 → 读使命、规格、待验证项三节。未建 → **降级模式**:与用户确认本次设计假设,需求单显式标注「方向未锁定,按假设 X 提出」,并把假设登记为待决策项抛回 [design-director](../design-director/SKILL.md)。
2. **判上游 ADR(硬拦截)。** 需求若触碰 Component / Replication Mapping / Scenario / Config 列结构 / 网络协议 / 存档格式,**本仓不能直接落地**——必须先在 `LumioGameEngineArchitecture` 走 ADR + Schema + 正反 Fixture + Baseline,再同步镜像。这类需求标记「阻塞:待上游 ADR」,可先落单但不进开发排期。边界口径见 [repository-architecture](../../knowledge/standards/repository-architecture.md),判定速查见下。
3. **写需求单(四段)。** ①**背景**——指回策划案具体章节,不复述内容;②**范围**——做什么、明确不做什么;③**验收标准**——checklist,每条可客观验证(写「一局结束后结算页显示击杀数与破坏方块数」,不写「结算体验良好」);④**依赖与阻塞**——前置需求、上游 ADR、引擎侧硬需求。含数值的需求必须带来源标注(口径见 [design-doc](../design-doc/SKILL.md))。
4. **落单。** 交 Workflow 平台(仓库已绑定 `lumiogamesengine` 项目),用现成的 `workflow:plan` / `workflow:workflow-planning` 技能落单——**本技能不自建需求跟踪,也不写 `.spec/tasks/` 任务卡**(任务卡是开发拆解产物,归 `task-breakdown`)。落单后回填单号到需求单。

## 快速参考

### 需求单骨架

```text
标题: <动词开头,一句话说清做什么>
背景: 依据 docs/specs/<path> 的 <章节>;为什么现在做
范围: 做 <...>;不做 <...>
验收标准:
  - [ ] <可客观验证的条件>
依赖: <前置需求 / 无>
阻塞: <待上游 ADR / 待引擎侧能力 / 无>
```

### 上游 ADR 判定速查

| 需求触碰 | 能否本仓直接做 |
|---|---|
| 玩法规则、胜负条件、道具行为 | 能 |
| GAS 内容(具体 Ability / Effect / Attribute) | 能 |
| 配置表的**值** | 能 |
| 地图布局、关卡数据 | 能 |
| 配置表的**列结构** / Component 字段 | 否,需上游 ADR |
| Replication Mapping / 网络消息类型 | 否,需上游 ADR |
| Scenario / 存档 / 迁移格式 | 否,需上游 ADR |
| 引擎能力(断线重连、匹配、账号级持久化) | 否,属引擎侧需求,登记进 `docs/specs/risks-and-engine-asks.md` |

## 注意事项(Pitfalls)

- **需求不是策划案。** 需求单只写「做什么 + 怎么算做完」,设计理由留在策划案,不复制粘贴。
- **验收标准必须可验证。** 「手感流畅」不行,「连续 20 次贴墙移动无卡顿」才行。
- **不跳过上游判定。** 漏判 = 开发做到一半发现契约动不了,返工成本最高。
- **不自建跟踪。** 落单只走 Workflow;两处记账必然不同步。

## 验证

- 基准来源已声明(策划案章节 / 设计假设)。
- 上游 ADR 判定已做,结论写进需求单。
- 每条验收标准可客观验证;含数值的条目带来源标注。
- 已落单并回填单号,或显式说明为何暂不落单。
