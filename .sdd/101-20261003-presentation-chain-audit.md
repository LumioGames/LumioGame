# 101 正式表现事实链独审（2026-10-03）

结论：**NEEDS CHANGES**。只读检查当前 Game 源码，未修改生产文件；这是权威状态到表现的接线审查，不是浏览器视觉或整局验收。当前工作树并非不可变交付：HEAD `8787797`，Root 仍在实现 growth/tier，以下以列出的具体源行为为准。

基准为已确认原型 `af385a9cd0f261317e97240a7e55accdda8d01d5` 和 `docs/specs/bomber/design.md`、ADR 0047/0048。已读 art-review：`docs/specs/art-direction.md` 明确已推翻，不能拿它要求正式版本恢复旧 2D/硬描边方案。没有以原型模拟器替换正式玩法，也不把 M1 三槽/等级/组合/麻痹当作 M2 必须保留的玩法。

## 具体缺口

### P1 中央补给及狂暴：资产已迁，实际输入链未接

- af385 的 `prototype/src/sim/supply.ts` 有真实原型 `setupSupply/advanceSupply`，到点预告/开启及公开散落；它只用来确认原型确有该体验，不作为正式规则实现。
- 最新设计 §5/§8.6、ADR0048：23/27 有中央补给，19 明确关闭；§8.5 狂暴为已批准有界机制。
- 正式 `Gameplay/Events/BomberEventCatalog.cs:77`、`:78` 仍将 `supply_announced/supply_opened` 标为 `Excluded/outside Stage 0`。限定生产 `.cs` 搜索未找到正式供给/狂暴生命周期，只有 Bot 配表 frenzy 标记；`BomberTypedTables.TableNames` 亦无补给配置入口。
- `Client/UI/Spectator/PresentationDump.cs` 没有补给状态或狂暴结束 Tick；`Client/Presentation/src/replica-adapter.ts` 不产生 `match.supply`、`PlayerView.frenzyUntilTick`。
- 已有消费者确实依赖它们：`view/runtime.ts:1701` 的补给光柱/喷泉、`:1329` 狂暴红光；`hud/hud-brain.ts:707` 补给横幅；`audio/index.ts:320` 预告/开启音、`:483` 加速音乐。因此资源存在不能证明正式可见可听。
- 最小修复：Game 权威定时/发行/有限狂暴与有界预算先落地，再复制已提交状态及事件，适配到现有表现。必须有 23/27 实际供给、19 禁用、迟加入不重播、整局一次、六额外弹并发和退场的真实回归；视觉 fixture 的 SupplyOpened 不能替代。
- 分区小补给箱在设计中属于后续 Stage2 分区地图；不要仅凭名字将其与当前决赛圈强箱混为一物，或无依据将 24/48/100 人全部列为本次已实现范围。Root 应按正式验收矩阵收口范围。

### P2 宝箱命中/开启、圈预告断链；回春仍缺成功事实

- `replica-events.ts` 的 switch 没有 ChestHit/ChestOpened/PlayerHealed/RingShrinkAnnounced 对应分支，未知 journal kind 返回 null。
- 权威侧已有 `BomberFinalCircle.Server.cs:132` 的 `circle_preview`，`:140` 的 `circle_effective`。前者的事件映射已在本次后续窄修补齐，实际红绿及范围见 `101-20261003-presentation-event-cues-delivery.md`。
- 更正初审推断：`BomberHealthBusiness.Server.cs:183` 的 `heal_applied` 当前实际生产调用来自血包，紧接同一成功事实的 `pickup_taken` 已播放血包声音；既有 `PlayerHealed` 明确排除血包，仅允许 regen/boss。不能把 heal_applied 一概映射回春，否则会双音并虚报来源。目前没有非恢复、无物品的 Submit 生产调用；兔子需先有真实 Period 成功结算及可区分原因，再接对应声音。
- `audio/index.ts:244–251` 宝箱声音只看事件，`:263` 圈预告、`:291` 回春同样只看事件。其地形 diff fallback（`:397`）只发普通积木碎裂，不补宝箱三次受击与开盖音。
- `view/world/chests.ts` 的视觉快照 diff 已能落箱、抖动与开盖；`view/runtime.ts:549` 明确无事件也能演。因此会出现“有箱子动画、无对应箱子声”的不同步，不能据视觉正常认为音效已完成。
- 最小修复：在实际命中/开启成功提交点维护 occurrence，统一真实 journal 名称并映射；圈预告沿已有已提交事件接线。回春等待真实 Period 成功事实和来源，不据客户端计时补造。若以快照差分补声音，须证明不会把 AOI 离开、回连基线、圈清场当开箱。
- 当前 `replica-events.test.ts` 只覆盖拾取过滤、身份/游标、blink、kick/water；`PresentationDumpTests` 已覆盖实际 voxel 绑定定位（这是已完成项），未覆盖上述声音事件从权威到 adapter。需要实际客户端音频与逐事件不重播验收。

### P2 兔子回春进度环被固定隐藏

- 五角色配置 `Gameplay/Tables/tables/characters.txt` 均存在；`replica-config.ts` 按正式字符 ID 读取，`replica-adapter.ts` 映射角色与技能。不能报告“五角色模型完全没迁”。
- 但 `replica-adapter.ts` 在 `skills()` 中固定 `regenFromTick: 0, regenNextTick: 0`，注释说明服务端时序不可见。
- `present/skill-hud.ts:165–170` 要求这两者形成正区间才显示兔子的回春进度，故正式数据下恒隐藏。
- `BomberSkillState.cs:32–33` 的 `LastDamageTick/RegenNextTick` 现为 Scope.None，不能在 JS 自己模拟权威治疗时钟。最小修复是由 Game 按契约流程提供只读 Owner 表现投影，再接现有环；不直接暴露所有私有伤害事实。新增复制字段/可见性是 schema/身份账本变更，按既有批准程序落实，而非擅自修改 Runtime 公共语义。

### P2 结算部分高光只依赖本次连接观察，重连不完整

- 已完成：`BomberResults` 保留两局、PresentationDump 取当局结果、adapter 按 rank/slot 排序并映射结束原因、角色、存活和主要统计；领奖台/结算时间从正式配置读取。没有证据支持把整个结算归为“未迁移”。
- 尚缺：`BomberResults.cs` 没有最高心数、Boss 击杀、绝境逃生、金心累计、曾拿特殊炸弹/最爱记录；`PresentationDump.Results` 与 adapter 无对应字段。
- `hud/stats-tracker.ts:251` 用权威统计恢复 kills/bombs/bricks/pickups/chain/hats/skillCasts/kingTime/character，但不会恢复以上缺项；它们仍来自连接期间事件/快照。`replica-events.ts` 初始 baseline 又有意不重放历史事件（该行为正确，不能取消来补历史）。
- 因此迟加入/重连到结算时，§13 的最高心数、特殊炸弹经历与部分高光可与完整参与客户端不同。`hud/results-view.ts:146/153` 确实显示最高心数/本局技能，不能靠不显示问题字段回避。
- 当前 `hud/__tests__/replica-stats.test.ts` 只断言已有九类统计，不含以上缺项。最小修复是把要求完整保留的终局事实纳入 Game 有界冻结结果/身份账本；测试在无历史事件的客户端只喂真实结果基线，核对同局结果一致。高光分配可继续只作表现，不新增排名真值。

## 已核正向链与验收边界

- chest 位置从真实 committed voxel binding 读取，未虚构 LogicTransform；有对应 Native 绑定测试源码。
- 五角色以及 M2 一特殊弹槽/最爱映射已有；`favorite-bomb.ts` 的兔 split、鸭 freeze、猫 remote、熊 fire、袋鼠 pierce 符合 ADR0047。Root 正单独查 Fire/Remote/Split dormant 与长按遥控，本文不重复宣称其玩法已通过。
- 常规炸弹爆炸、放弹、伤害、死亡、重生、技能成功施放、kick、灭火已有 journal→adapter 事件分支；仍需正式浏览器录屏/音频确认实际节奏与混音。
- 本次没有执行浏览器或重跑测试，不报告测试通过数量。旧局部绿色不能替代 12/23、16/27、8/19 多种子真实对局、结算下一局和原型同视口比较。
- 补给/狂暴/终局补充事实属于 Game 已批准设计的实现；不要因此自行改 Engine 的未批准 16 槽/Native 零版本/Period 等公共契约。涉及新复制字段时同步准确 schema 身份及发布证据；没有新增游戏规则建议。
