---
name: prototype-migration-combat-audit
description: 101最新原型与正式代码的战斗与持续状态迁移审计——核对源码、默认可达和真实证据时查。
metadata:
  type: review
  status: 实施中
---

> 本文固定于2026-10-07审计切点。完整交付归[R-00798](https://lumiogamesengine.workflow.games/requirements/01a0e1a5-5ac1-785e-b552-81217b7d7be7)。后续修复、独审及新运行资格见[总表](2026-10-07-prototype-migration-audit.md)；下述历史计数不自动升级为当前验收。

# 101 最新原型迁移：战斗审计与圈毒切片实施 brief

审计日期：2026-10-07。工作范围：只读源码、配置、既有真实日志与最新交付身份；没有改生产文件，没有运行/停止用户现场，没有提交。本报告是待实施的审计成果，不是验收签字。

## 1. 事实源与判定边界

- 正式源码基线：LumioGame `7bacb8ac7e3caf63a35ea69e62fc7a275390540e`。
- 原型基线：远程实际主线 `af385a9cd0f261317e97240a7e55accdda8d01d5`；原型行为从 `git show <SHA>:games/101-bomber/prototype/...` 读取，未使用工作树中已修改的原型文件。
- 按入口次序读过：`.spec/AGENTS.md` → `.spec/knowledge/README.md` → `games/101-bomber/.spec/AGENTS.md` → 该游戏知识导航；并读取 `docs/specs/bomber/design.md`、ADR0044/0047/0048/0049、两份收敛/交付计划的相关段落和最新尾段。
- 原型实际已完成的是 M1：五角色、旧等级/三槽/组合、Freeze/Pierce/Toxin/Shock、火冲/泡泡反弹等旧组合；六形态一槽与最爱是 M2 正式目标。护城河、固定冰桥和爆炸桶是 ADR0048 的 M2 新设计，不能写成“网页原型已实现”。
- 矩阵路径均相对 `C:/Work/LumioGames/LumioGame/games/101-bomber/`；“原型”路径相对 `prototype/src/`，且引用的是上述提交的行号。“默认可达”指现有正式默认配置；“复制表现”指源码接缝，不等于完整 authenticated Client/浏览器/Host 验收。
- 六选状态：已验收 / 已有但未验收 / 部分实现 / 缺失 / 默认未启用 / 已被新设计取代。没有把历史隔离测试通过升级为当前默认发布或用户验收；本矩阵没有新增“已验收”结论。

## 2. 核心结论

正式圈几何/HFSM与终局骨架存在，圈外周期掉血没有生产者。Toxin 形态可以拾取并爆炸，直击走普通伤害，但 4 秒两跳、解毒、不续期和来源保留的真实 GAS 生命周期均没有接通。兔回春及集束最爱没有生产者。鸭子基础泡泡、猫基础闪现、熊基础光环、袋鼠飞踢和冰冻已进入真实 GAS/Native 路径；鸭子最爱缺失，猫/熊最爱依赖默认关闭形态。被动踢弹糖没有正式拾取或移动接通。

Fire、Remote、Split 与冰桥、桶具有大量真实 Native 局部证据，默认配置仍关闭。当前生产预算只正式接纳 LegacyPillars 的 19×19 / 8 人，明确拒绝 Split 开启和 M2 布局；不能仅把表中 enabled 改为 true 宣布六形态与 M2 地形完整可达。当前默认仍为 8 人 / 19×19 / 7 分钟，不是 M2 三套餐和 4 分钟。

## 3. 行为迁移矩阵

| 项目 | 原型真实行为 | 正式目标 | 当前正式代码与行号 | 默认可达 | 复制/表现接通 | 真实证据 | 状态 |
|---|---|---|---|---|---|---|---|
| 圈阶段、预告、清场、1×1 | `sim/final-circle.ts` 已推进安全圈；`sim/match-phase.ts` 调用阶段推进 | 按正式触发门和阶段缩圈，末至1×1 | `Gameplay/BomberFinalCircle.Server.cs:15–59,66–159`，Native HFSM阶段存在 | 是，旧19/8配置 | Room圈状态 → `Client/Presentation/src/replica-adapter.ts:206–210` | 代码已接；本轮未见当前完整整局圈验收 | 已有但未验收 |
| 圈外每秒等比伤害 | `sim/final-circle.ts:144–169` outside计数，整秒 `ceil(stagePoints*maxHealth/6)`，内圈/死亡清零 | 1000ms一次；5×5前1点基准、之后2点基准；取当前生命上限等比 | `BomberFinalCircle.Server.cs:137` 只写PoisonPoints；`BombSystem.Server.cs:201–205`没有圈伤害；`BomberEffectBusiness.Server.cs:36–72`只有爆炸伤害 | 否 | 原因枚举/事件映射已有，没有数值生产者 | 源码不存在实际提交/消费链 | 缺失 |
| 圈穿过重生保护/泡泡；自归属 | 原型 `final-circle.ts:159–168` killer=victim，直接queue poison，不受保护过滤 | 保护和泡泡均挡不住毒圈；killer自归属、causeRingPoison | `Effects/BomberDamageEffect.Server.cs:10–26`要求真实炸弹、保护到期、无泡泡，不能直接复用 | 否 | `Gameplay/BomberTypes.cs:9` RingPoison与客户端事件 cause 映射保留 | 当前伤害Effect guard与该目标冲突 | 缺失 |
| 圈/毒致死当Tick终局 | 原型 `sim/step.ts:42–55` 先圈/毒排队再settle，`match-phase.ts`按pending deaths同Tick结束 | 所有本Tick结果结清后活1结束；同Tick全灭先按平局；不等下一业务帧 | `BomberOutcomeReducer.Server.cs:70–78`仅10101/10110的Initial；`148–170,189–236`确有同Tick死亡/终局骨架 | 普通爆炸/火可达；圈/毒不可 | Match/Death事件与结果有投影；圈毒来源缺 | Existing reducer消费真实Effect数值；新增类型仍须接入 | 部分实现 |
| 棉花兔回春 | `sim/recovery.ts:14–39` 受伤重置；旧等级20/16/12s，每次真回1点至动态上限 | 固定20s无任何实际掉血→回1半心；圈/毒等掉血均重置；真实GAS生命周期 | `Components/Bomber/BomberSkillState.cs:33`只有RegenNextTick；`BomberRoundTransition.Server.cs:211`仅重置；`Tables/tables/skill_levels.txt:6`仅数据 | 否 | HUD/角色表在；无真实回血生产事实 | 无生产Effect/周期消费；不能用字段存在证明 | 缺失 |
| 兔集束最爱 | 原型没有M2最爱；旧组合另有规则 | 每次实际回春后四邻格火力1小花、不伤本人；actual=0不触发 | 无生产者；Split实现不等于兔回血触发 | 否 | 没有实际最爱事件路径 | 周期数值事实与兔回春均未交付 | 缺失 |
| 泡泡鸭基础泡泡 | `sim/skills.ts:106–112`施放泡泡并解毒；M1等级时长/CD | 固定3.5s/CD14，挡爆炸/火/冰冻、不挡圈；期间不能放弹；解毒 | `BomberFiniteSkills.Server.cs:10–61`真实10107；`Abilities/UseActiveSkillAbility.Server.cs:27,81`；没有解毒 | 部分可达 | BubbleUntil来自实际有限行；`PresentationDump.cs:49–57`与adapter91 | 真实finite生命周期已有；毒部分无生产链 | 部分实现 |
| 鸭冰冻最爱 | 原型旧泡泡反弹/glacier组合，不是M2最爱 | 泡泡破裂冻周围8格敌人1s | `BomberFiniteSkills.Server.cs:33–61`仅消费泡泡，未发现破裂八邻冻生产者 | 否 | 基础泡泡/冻结能表现；最爱触发未接 | 无实际Native/GAS最爱证据 | 缺失 |
| 闪电猫基础闪现/朝向 | 原型 `sim/skills.ts:119+` blink，旧等级距离/CD；M1朝向规则 | 固定3格/CD10，按主输入朝向/冻结屏障/铁皮与落点规则 | `Abilities/UseActiveSkillAbility.cs:20–51`；`.Server.cs:18,52–58`；输入/Movement来源仍与独立修复链相关 | 是 | 位置/TP序列可复制；新本地预测修复链未封完整包 | 代码已实现；最新Runtime/Client/包链未完整用户验收 | 部分实现 |
| 猫遥控最爱 | 原型实际BombKind没有Remote生产者 | 闪现瞬间引爆自己所有遥控 | `UseActiveSkillAbility.Server.cs:57–63`检查kind7调用DetonateOwned | 否，Remote默认false | Remote实体/爆炸路径可复制；最爱无当前默认整局验收 | Remote局部Native 13/13见E4，不等于闪现整局 | 默认未启用 |
| 火焰熊基础光环 | 原型旧5.5/6/6.5s/CD16/14/12 | 固定5.5s/CD16，3×3连续1s掉2点；本人/保护/泡泡免疫；施放结束重生保护 | `BomberFiniteAura.Server.cs:10–61`真实10111；`BomberFireExposure.Server.cs:23–51`区域生产typed instant；`BomberFireReducer.Server.cs:8–14` | 是 | AuraUntil由真实finite行还原；Fire事实与AOI存在 | PublicAura原始8/8（E1）；不等于全部技能整局 | 部分实现 |
| 熊火焰最爱 | 原型火冲组合是M1旧设计，不是M2最爱 | 光环经过格留火1s，固定来源、区域租约/预算 | `BomberFavoriteFireZones.Server.cs`已有持久region/lease；`BomberFiniteAura.Server.cs:28–35`Favorite快照与绑定 | 否，Fire默认false | Region真实AOI与火地数据接缝；完整最爱区表现验收未见 | E1验证favorite flag，不是全部留火行为；旧private UNRUN报告不算GREEN | 默认未启用 |
| 飞腿袋鼠基础与最爱 | `sim/skills.ts:135+,152`，`sim/kick.ts`合法target成功才CD，旧等级4/3.5/3s | 面前相邻或隔空格静止弹；无目标无CD；成功持Pierce3s否则4s，施放快照不随换槽变 | `UseActiveSkillAbility.Server.cs:38–41,63–73,88`；`BomberBombKick.Server.cs:14–107` | 是，Pierce默认启用 | 真实Native Kick保持炸弹来源，CooldownOwner接通 | 特殊弹交回有button7GREEN、placement等局部实跑；完整角色矩阵仍待 | 已有但未验收 |
| 被动踢弹糖 | 原型 `sim/kick.ts:14–56`旧被动踢等级/泡泡反弹，正常kick与滑行已存在 | 仅约3%糖随机位罕见产出；重复留地、不叠层；死亡一次掉落/3s防爆；新生命不继承 | `BomberTypes.cs:10`kind6仅枚举；`Abilities/PickupAbility.cs:91–103`最终invalid；Move没有被动踢资格生产 | 否 | 没有资格/随机糖/拾取/移除完整投影 | 无正式default Move触发链 | 缺失 |
| 踢弹滑行/冻结屏障 | 原型 `sim/kick.ts:143–196`一格kick后8格/s；入水返库存；玩家不挡 | Native滑行，引信照走；冻住不能踢；子弹不可踢；玩家不挡；水第一格熄灭一次返原库存 | `BomberBombKick.Server.cs:20–35,41,66–107`；UseActive资格冻结屏障；`BomberBombLifecycle.Server.cs:62,84–90` | 袋鼠可达，被动否 | 炸弹Phase/位置/source由复制读取 | Native局部证据存在；全部水/冻结/被动组合未完成默认整局 | 部分实现 |
| 单槽替换/同种留地 | 原型旧三槽、升级、组合 | 一个特殊槽，固定level1；换新保留旧完整物品，同种不拾；不增加能力槽 | `PickupAbility.cs:54–82`；`PickupAbility.Server.cs:20–51`已单BombSkillId交换、level1；`BomberSpecialBombResolver.cs:8–33`拒Shock | 是，对已启用三形态 | `PresentationDump.cs:49`仍三个legacy slots形状，展示语义未全部M2收敛 | 源码规则已有，六形态等权池/表现未完整 | 已有但未验收 |
| 旧三槽/等级/组合/Shock | 最新原型实际存在，技能三级/旧combo | M2明确废止，只作历史迁移数据 | skill_rules.json maxlevel3/slot_count3、Shock enabled仍旧；runtime resolver只接六种M2Kind | 旧Shock表能出现与运行拒绝需清理 | legacy三格仍在dump；不能恢复旧UI作M2目标 | ADR0047/design明确替代 | 已被新设计取代 |
| Freeze正常爆炸 | 原型 `contract/skills.ts:209+`1.5/2/2.5s等级，受伤解除 | 固定2s；受伤解除+1s免控；鸭最爱另外固定1s | `BomberFiniteFreeze.Server.cs:10–41,62–87`真实10108/10109，固定level1；skill_levels:16=2000 | 是 | actual有限行→FrozenUntil/ImmuneUntil→AOI；authenticated replica已有历史1/1 | 特殊弹/finite replica历史GREEN，当前完整回归未跑 | 已有但未验收 |
| Fire正常爆炸 | 原型enum保留Fire，最新实际无正常Fire弹producer；旧火冲另论 | 爆后保留原弹火区1.5s，火地曝光1s周期、免疫规则/来源与原库存闭合 | `BomberFireExposure.Server.cs:23–51`、BurnEffect10110、Native Burn；bomb_kinds:10=false | 否 | Burn phase/火区/实际伤害有投影 | E2 public fire id1/1；PublicFire admission源审19/8；局部实跑不是默认开放 | 默认未启用 |
| Remote正常爆炸 | 原型无Remote正常生产者 | 按住300ms引爆自有，8s兜底；库存归还一次；猫最爱引爆 | BomberBombButton/placement/lifecycle已有；bomb_kinds:20=false | 否 | Kind7、炸弹生命周期/事件接缝存在 | E4 Native13/13 terrain continuation+Remote | 默认未启用 |
| Split正常爆炸 | 原型enum保留Split，最新实际无正常Split正常生产者 | 端点4个子弹，0.5s、力1；母命中族、预算在母放置预留；子弹不占库存/不可踢 | `BomberSplitBombs.Server.cs:23–80`完整source witness；`PlaceBombAbility.Server.cs:19`reserve；bomb_kinds:14=false | 否且producer validator拒开启 | 子弹实体与family可复制；默认无出现 | E3 Native11/11；桶/Split跨源局部97/97见E7 | 默认未启用 |
| Pierce正常爆炸 | 原型旧穿透1/2/99等级 | 实际成功毁目标才继续；Gold两个独立family首次停、第二次毁后继续 | `BomberBlastTerrain.Server.cs` receipt rays；`BomberTerrainTransactions.Server.cs:234,307–321`family去重/Gold首击停 | 是 | Native地形/炸弹位置/来源复制；无全部M2完整局证据 | 10/3 special report实际2RED→2GREEN、terrain31、move75、placement21等 | 已有但未验收 |
| Toxin直击 | 原型 `sim/effects.ts:49–101`先正常1heart | 每次合法直击1心，存活才可能唯一挂毒 | `BomberEffectBusiness.Server.cs:36–72`kind5仍普通2点直击；没有SubmitToxin | 是，仅直击 | 原因目前仍Explosion；ToxinUntil保留字段不能显示真正毒 | 数值走真实普通Effect；全Toxin目标未实现 | 部分实现 |
| Toxin两跳/4s有限状态 | 原型 `sim/toxin.ts:12–31`旧3/4/5s周期，来源gone保留；不是M2不续期 | 实例4s，Tick40/80（20Hz）各1点、可致死；GAS owns lifecycle/due | 没有ToxinEffect；`BombSystem.Server.cs:201–205`不生产；`BomberSkillState.cs:29,31`空投影 | 否 | ToxinUntil与adapter状态有字段，无actual producer | 最新真实Runtime/生成器依然缺period typed fact，见§5 | 缺失 |
| Toxin重复命中不续期/首来源 | 原型 `sim/effects.ts:110–117`取max延长期且覆盖owner/bomb；此行为必须替换 | 每Life最多1实例；第二次只直击；A/B确定顺序；到期同Tick仍占用到removal | 无正式毒Lifecycle；不能复制原型refresh函数 | 否 | 无原Effect完整身份和不可变payload关联 | ADR0047明确新规则，原型旧实现不作目标 | 缺失 |
| 血包/泡泡解毒与满血例外 | 原型 `sim/pickup.ts:138,165–166`满血有毒仍可拾且clear；`skills.ts:106–112`Bubble clear | 当TickSuppress先于Period再Remove；同Tick拒再毒，下Tick允许；满血毒血包actual heal0正常消费 | `PickupAbility.cs:91–93`、`BomberHealthBusiness.Server.cs:54–57`满血一概拒；Bubble没有毒控制 | 否 | 现有Health真实数值事实可供cure组合；没有毒handle | 源码双重guard证实缺口 | 缺失 |
| 毒来源销毁/死亡/旧A新B | 原型toxin保留owner/bomb ID；死亡有clear，M1有限模型不等于完整Effect身份 | 原bomb/source退役不改归属；死旧LifeRemove；旧A结果处理一次不清B，不转新Life | Toxin字段只在`BomberRoundTransition.Server.cs:211–212`清零；无EffectHandle/due occurrence业务事实 | 否 | 现有死亡/后继机制须消费新毒实例来源；不存在该关联 | 上游period fact/paired cut仍待；不能伪造辞典兜底 | 缺失 |
| 六形态正常生产总预算 | 原型M1不会产完整六形态 | 所有常规弹、Split children、Fire Burn、Remote兜底、frenzy/barrel/favorite obligations按完整最坏上界准入 | `Config/BomberObjectBudgets.cs:38,45,49–50,81–88,111–141,207–218`仅19/8Legacy且拒Split；`M2BudgetEnvelope.cs:9`明确不等于M2准入 | 否 | enabled config只显示已开放种；不能以codeExists自动扩大池 | PublicFire source审保守4064弹/1351拾取/336墙仅19/8；M2套餐未闭合 | 部分实现 |
| M2护城河与桶布局 | 原型没有；旧water/drown不是M2新moat | ADR0048固定套餐护城河、无岛区/出生资源与桶布局 | Map planner已有M2 candidate；`BomberObjectBudgets.cs:38–50`拒M2；blocks表water1027 true、ice1031false、barrel1032false | 否 | 水模型在；M2 layout不能默认加载 | ADR0048/0049新设计；非原型已完成迁移 | 默认未启用 |
| 冰桥生成/8s/不刷新 | 原型没有M2 ice bridge | 水被Freeze后真实Native Original成功才bridge；8s从原提交/成功事实定义；重复不续期，融桥优先同Tick出生 | `BomberIceBridges.Server.cs:21–23,109–193,267,363`有bounded promises与deadline | 否 | 桥Native block存在后投影；ice sparse绑定表仍none/false要收敛 | E5 paired recovery9/9，E6 terrain continuation12/12 | 默认未启用 |
| 融桥全体Fuse熄灭/库存一次 | 原型没有M2；踢入旧水返库存另论 | 接受融桥Original后该water上全部静止Fuse含Remote熄灭；原库存/frenzy credit一次；不能先销毁/假返 | `BomberIceBridges.Server.cs:53,161–193,492–508` gather全Fuse/Original后Extinguish；`BomberBombLifecycle.Server.cs:62,84–90`原Nativephase返 | 否 | 炸弹phase/库存真实复制；无默认冰桥场景 | E5/E6局部真实Native覆盖；现场未验 | 默认未启用 |
| 桶100ms派生/源形态继承 | 原型没有M2 barrel | original apply起100ms；力3；完整thrower/life/shape/chain；Pierce/Freeze/Toxin/Remote/Split/Fire等行为继承；不耗新库存 | `BomberBarrelBombPromises.Server.cs:17,45,73–75,125–162,194`完整promise和publish validation | 否 | 真实体/shape/source投影路径已有，barrel默认false | E7 Native97/97零skip、catalog12；全形态与lateOriginal局部实跑 | 默认未启用 |
| 桶/子弹命中族去重、来源守恒 | 原型没有M2 barrel；旧普通family只作基础 | 同原爆炸命中族桶/强箱只处理一次；Split子弹共mother family；source退役保完整值 | `BomberTerrainTransactions.Server.cs:234,307–321`；Split witness；Barrel source promise | 默认桶/集束否；普通Gold/Pierce是 | family/chain持久；generation与Match固定 | E3/E4/E7 Native证据；不自动关闭恢复Owner门 | 已有但未验收 |

## 4. 真证据清单与适用范围

本轮读回 JSON 的 raw exit / case count，并读原始日志尾段、检查日志SHA；没有本轮新跑测试。以下均位于 `games/101-bomber/.run/v14-fullpack07-native-20261003/`，绑定旧07 manifest SHA `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`。因此证明相应局部路径真实使用Native，不证明7bacb8a当前完整包、默认配置、用户现场或所有M2能力验收。

| 编号 | 实际运行证据 | 读回结论 | 原始日志SHA256 |
|---|---|---|---|
| E1 | public-aura-favorite-flag-regression-49 | 8/8，0skip，raw0；favorite flag不是完整留火最爱矩阵 | cd1b6a402ea0105ade7e0f7b1684cdde3dfc033fe9ded93f51117597e7168991 |
| E2 | public-fire-id-regression-39 | 1/1，0skip，raw0；public fire level名称修复 | 8da284152c1e8a6b6083a064332852e894fa8c7ada07b434d48d59b61e00906d |
| E3 | split-production-regression-01 | 11/11，0skip，raw0 | fca03779c1457afed5bc30df3b2e3564dc0e589c17a10e9d99013a1acfc889bc |
| E4 | terrain-continuation-remote-regression-01 | 13/13，0skip，raw0 | cbe4982cd6508e88ddfa60dc23dbea5598b41169da5b0c3a92839ab9442a7a2f |
| E5 | ice-paired-recovery-qualified-03 | 9/9，0skip，raw0 | bb0f42d49a84e127f9efceb0b1a9a7c77a2d295dc24eb6f1c64773ce5e7e24ec |
| E6 | terrain-continuation-ice-regression-01 | 12/12，0skip，raw0 | 74f26940c236adc4bc8b47816f0a89899c721fc61d076e71be9dd0d2c09e2dc7 |
| E7 | Root `.sdd/101-20261003-barrel-production-report.md`及该目录原始执行链 | 97/97，0skip；独立catalog12；延迟Original、全继承形态、无库存/掉物副产 | 本轮未单独把97例总logSHA升级为当前发布证据，引用原交付报告与原始目录 |

其他读过但不扩大结论：Root `.sdd/101-20261003-special-bombs-execution.md`（Pierce先2RED后2GREEN，旧move75/placement21/terrain31、普通库存77等）；public-fire-admission独审（19/8真实生产准入）；aura-source独审（protected-phase实际RED后修）；favorite-fire-behavior-fix私有报告标UNRUN，不能算成功；早期ice独审8RED已被后续当前修复/独立真日志替代，不能用旧失败称当前必坏。

## 5. 最新实际 GAS/Effect 是否足够

**圈伤害独立切片足够；毒与兔的真实有限周期数值事实仍不足。** 两者不能混为“整个Effect不可用”，也不能因已有finite period callback就认为生产统计/归属/死亡关联都已具备。

本轮重新核对的是最新 actual Runtime/Generator，而不只沿用10月2提案：

1. `.run/20261007-runtime-movement-repair-01/task-2-model-evidence/delivery-identity.json`绑定 Runtime `214a08f132500c09e9f14b38e129a354a5f405df`、父提交 `ef2f56740b5d80743b4f278a0ea3d46962746cb3`、Engine `523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0`。实际树是 `C:/Work/LumioGames/.101-restore-01/LumioGameRuntime30LocalPrediction/`。
2. 该树 `tools/gen-declarations/EffectDeclarations.cs:106–111`仍明确 `if (isFact && !instant) throw Invalid("facts require instant lifetime", tree.FilePath)`。因此新版14文件Model修复没有放开finite fact声明；原10月2 proposal真实RED依然与最新实现相符。本轮没有新执行生成器probe，不能把静态确认写成新RED实跑。
3. 同树 `modules/gas/src/Lumio.GameRuntime.Gas/Effect/FiniteEffectSettlement.cs:72–86`确实运行真实Period、检测CrossedZero、发行 `Kind=Period` 与DueTick；`:149–157`仍 `ResultFacts.Add(null)`。有限生命周期、Suppress/Remove顺序、到期最后Period和paired save已有能力；缺的是每一次Period不可变payload关联及真实before/after/actual typed fact。这是精确缺口。
4. 同树真实测试 `FiniteEffectLifecycleTests.cs:43–53`已有真实Ticks最后Period/到期结果；`FiniteCorrectivePersistenceTests.cs:67–102`已有同due保存不重播。不能引用legacy `EffectFrameOrder.OnPeriod()` throw来否定当前finite engine，这两条路径不同。
5. complete29现场生产Native是 SHA `7799b6fe036e79f30cdfbe16e736b508478da92fe5d93ac30a77d41cafa8987d`；本轮movement修复官方test-support Native是 `7db3efad3c4509124994b9f91010fe2e71df48923102e14ce285881fbccbd239`，Engine源码523c3d39，经官方dev-build构建，生产包没有替换。新增战斗RED必须在隔离消费者按已批准包/官方测试Native身份执行，不能把test-support DLL放进旧complete29现场。
6. 当前Game `Gameplay/Compatibility/schema-identities.json`为bomber-v16-owner-prediction-candidate/audit-draft/freezeEligible=false；runtimeRevision是 `520ffe482e1c48fb6e48187925eecec986cdb9c8`，不是已正式发布214a修复。Game默认 `eng/BomberRelease.props` requiredSDK0.0.5-main.0e2fc74与本地Engine manifest0.0.4-main.ecece8a存在旧身份差异；执行者需明确传入已资格化 `LumioEngineRoot`/SDK feed，不能隐式用默认残留。
7. 最新GAS全套仍999=998pass/1 fail，StructuralScratch旧断言12706与12070差636保持原值、raw2；该既有问题不自动变成圈毒阻塞根因，也不能宣布整套全绿。

上游候选仍为 `.sdd/101-20261002-periodic-fact-contract-candidate.md`，状态明确未获Owner批准。毒和兔的持续状态必须由真实GAS有限生命周期持有，不准用Game字典定时或“每帧看deadline然后发instant”替代有限毒/兔effect；也不在Period回调里再入Apply绕过预留。需要上游正式合同/生成器/Runtime/包同时交付period fact：fullHandle + kind + DueTick occurrence、原Source/Target与payload、before/after/actual、CrossedZero、物理行与证书、due预留、paired restore。现有通用Period结果可作为其基础，不足以凭最终HP倒推每次伤害、每次回血/最爱或将A结果归给B。

## 6. 可立即派遣的第一切片：圈外typed instant伤害

### 6.1 不改变公共有限周期语义的设计

在唯一 `WorldManager.Tick` 的现有BombSystem业务生产阶段，圈状态每满1000ms提交一个新的typed instant区域伤害Effect；参考当前 `BomberFireExposure` 的真实区域曝光→typed instant fact→F reducer→业务消费链。计时/准入记忆放稳定Participant上的显式有界persist ECS字段；不可开第二模拟循环、不可新增全局字典、不可把它伪装成finite Period fact。

新增Effect明确causeRingPoison，自来源Participant/Life/Generation，FactOwner为稳定Participant、row显式物理索引，完整MatchId/Life/Generation/圈stage/pulse与提交Tick。damage callback只改health base并CompleteFact；保护/Bubble不得阻断；匹配目标当前生命并拒错代/旧局，source无需炸弹。实际数值与统计/死亡从该次typed fact取得，不从最终HP倒推。实际圈伤害有正actual时，为后续兔重置路径提供LastDamage事实；第一切片不假造兔回春。

每Participant至少两个事实槽作为候选容量：旧Life已发行未消费事实与新Life/新pulse不可覆盖。容量是否能收紧为1须由完整结果借用期、死亡后继和paired cut证明后再决定。行Ready最后写，F Claim匹配full handle/type/target/source/pulse/绑定行；消费后才释放。out-of-ring计时重入内圈/死亡/局结束清零；counter如何从原型“连续outside秒数”映射须明确SDK Ticks转换、无浮点和无额外频率。

Hook建议在 `AdvanceMatch` 与 `BomberFinalCircle.Advance`已更新当Tick圈状态之后、Effect本Tick结算之前执行；由新测试锁住先当Tick预告/清场还是伤害的排序，保持现有唯一Tick相序。F reducer须在本Tick收集圈结果时参加Outcome，而不是等下一帧ConsumeEffects以后才结束局。将新类型纳入既有死亡/库存/后继事实，保留旧instant类型选择行为。

### 6.2 精确修改文件集（候选）

路径以下都相对games/101-bomber；生产文件仅给新实施者修改，本审计没有动：

- 新增 `Gameplay/BomberRingDamage.Server.cs`：Advance/Submit/Consume与bounded行占用、实际伤害日志/归属；可参考FireExposure，但不能把“保护免疫”带过来。
- 新增 `Gameplay/Effects/BomberRingDamageEffect.cs` 与 `.Server.cs`：typed instant声明与回调/完整身份校验。
- 新增 `Gameplay/Components/Bomber/BomberRingState.cs` 与 `.Server.cs`：persist的Match/Life/Generation/outside连续计时/pulse/request记忆及完整恢复校验。
- 新增 `Gameplay/Components/Bomber/BomberRingFacts.cs` 与 `.Server.cs`：独立typed fact有界物理行、Ready/status生命周期。不能挤用BomberFireFacts或Health单行。
- 修改 `Gameplay/EntityTypes/Bomber/BomberParticipantEntity.cs`：声明上述state/facts所有权。
- 新增 `Gameplay/BomberRingReducer.Server.cs`：只声明圈fact status合法写集合与Claim；修改 `Gameplay/BomberOutcomeReducer.Server.cs`：新EffectType的实际Initial/CrossedZero、full association、自归属和同Tick结束。
- 修改 `Gameplay/BombSystem.Server.cs`：唯一Tick内生产hook；修改 `Gameplay/BomberEffectBusiness.Server.cs`：从圈已提交事实消费统计/事件，不能延后规则死亡。
- 修改 `Gameplay/BomberRoundTransition.Server.cs`：新局/旧Life精确重置；如果死亡销毁阶段需要解除行占用，改 `Gameplay/BomberSuccessorLifecycle.Server.cs`中对应旧生命退役接缝，并用测试证明旧事实先消费而不覆盖。
- 修改 `Gameplay/Config/BomberConfigBinding.cs`：按新生成fact/F成本推导EffectLimits；如果生产预算验证额外参与者脉冲上界，修改 `Gameplay/Config/BomberObjectBudgets.cs`相应保守式，保持默认19/8准入。
- 新增 `Server/Tests/Gameplay/BomberRingDamageProductionTests.cs`、`BomberRingDamageRecoveryTests.cs`、`BomberRingDamageReplicaTests.cs`。复用真实场景/Native harness，不添加mock HP字典。
- 身份/迁移工具：新增 `Tools/schema-identity-ring-damage-migration.mjs`及其聚焦测试；通过现有storage/model工具 append历史，正式生成后保存证据到 `Gameplay/Compatibility/schema-identities.json`。生成输出 `Gameplay/generated/server/*`与client对应registry/codec/reducer/component/entity模板、effect-operation-plans/manifest只经官方CLI构建产生，不手改。
- 客户端只有实际发现RingPoison事件映射或health事件数据缺项才改 `Client/UI/Spectator/PresentationDump.cs`、`Client/Presentation/src/replica-events.ts`等；当前已有cause和圈几何接缝，第一切片无需借机重做三槽UI。

新身份候选：当前ledger在active+retired+pending查得effect-type只有10101–10112；`10113`可作为 `BomberRingDamageEffect` 的候选，必须执行全ledger查重后append，不复用10110 Fire，不把候选直接视为公开编号批准。新row `bomber.ring`、reducer `bomber.ring`、新组件完整CLR名与自身字段/容器ordinal也需要通过ledger逐项分配；Effect-type10113与ReducerField数值命名空间不可混淆（现有10122/10123是reducer字段域）。形成新的Game内部schema候选版本与breaking transition，保存v16旧原字节/history/tombstone，保持freezeEligible=false，待Owner/发布流程裁定。不要更改公共Effect机器tuple/revision。

### 6.3 必须先写的真实 Native RED 与最小验证

新增测试名和数量在实施后由runner列举确认；以下是计划，不是本轮新执行结果。

1. 两名真实玩家进入圈，outside满20Tick才掉血，Tick19不掉；圈阶段points1/2、maxHP6/8/10/16分别验证ceil；内圈/离开重入计时；圈伤害不能由SkillsEnabled=false关闭。至少一例应在旧源码真实RED，不是加载/注册失败。
2. 相同场景保护、真实Bubble10107仍被圈伤害；泡泡继续挡普通爆炸；同Tick任何实际掉血重置LastDamage，零actual不重置。
3. 同Tick只剩一人即结束；同Tick两人全死标SimultaneousElimination，EndTick等于伤害Tick；圈+普通爆炸/火同Tick独立before/after/actual、kill self/cause正确，F写集合拒绝非法列。
4. 旧Life已发结果/Source已退役、新Life不被清或重复记账；paired checkpoint在outside秒边界前/后与已执行结果cut恢复逐Tick对照、不重扣、不跳扣。只接受完整paired恢复，不将RuntimeOnly成功当完整局恢复。
5. exact capacity与每项one-short真实准入拒绝；新请求饱和不覆盖旧行/旧结果；fact Complete缺/重复、ready-last/错row generation/错Match拒绝。拒绝时不给虚假伤害/冷却/日志。
6. authenticated Client复制一条真实圈hurt/death/end与回放；血量/原因从实际结果体现，圈几何与本Tick结束一致。该例不是浏览器整局验收。

最小回归：新Ring三个类 + 现有Outcome/FireExposureCutBoundary/finite-freeze/ordinary inventory/同Tick终局的相关类；一次受影响Game测试与schema生成验证。因为只读审计不运行命令；新实现者须保存每次raw、stderr、Native/SDK/source/config/manifest/hash及tests/failed/skipped，不能filter空集通过。仅当发现新改动/失败扩大回归。

已取得root最新实施落点：管理工作树 `C:/Users/g923/.codex/worktrees/101-migration/LumioGame`，分支 `codex/101-migration-rules`。root已确认其approved complete29消费构建raw0；Gameplay全量基线仍在跑，不提前记全绿。实际读取该树 `.run/migration-validation/release.props`，它明确选择Root `.run/20261006-confirmed-fixes-delivery-02/complete-release-29/`、complete-release candidate与required SDK `0.0.5-main.523c3d3`。这已解决第一圈切片使用旧默认Engine残留的问题；不修改上游树或待批Period事实能力。

可执行命令模板（在该管理工作树的games/101-bomber目录；既有props与NuGet cache均已给定，先写新真实RED再实现）：

```powershell
$bomberRingSelection = 'C:/Users/g923/.codex/worktrees/101-migration/LumioGame/.run/migration-validation/release.props'
$bomberRingCache = 'C:/Work/LumioGames/LumioGame/.run/game31-confirmed-fixes-consumer-01/build-01/nuget'
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Release -p:LumioEngineSelectionProps="$bomberRingSelection" -p:RestorePackagesPath="$bomberRingCache"
dotnet build Tools/Lumio.Bomber.Gameplay.Tests/Lumio.Bomber.Gameplay.Tests.csproj -c Release -p:LumioEngineSelectionProps="$bomberRingSelection" -p:RestorePackagesPath="$bomberRingCache"
dotnet Tools/Lumio.Bomber.Gameplay.Tests/bin/Release/net10.0/Lumio.Bomber.Gameplay.Tests.dll --filter-class "*BomberRingDamageProductionTests" --minimum-expected-tests 4
dotnet Tools/Lumio.Bomber.Gameplay.Tests/bin/Release/net10.0/Lumio.Bomber.Gameplay.Tests.dll --filter-class "*BomberRingDamageRecoveryTests" --minimum-expected-tests 2
dotnet Tools/Lumio.Bomber.Gameplay.Tests/bin/Release/net10.0/Lumio.Bomber.Gameplay.Tests.dll --filter-class "*BomberRingDamageReplicaTests" --minimum-expected-tests 1
node --test Tools/schema-identity-ring-damage-migration.test.mjs Tools/schema-identity-storage.test.mjs Tools/schema-identity-generated.test.mjs
```

Runtime/Engine上游周期事实将来必须另外先新增真实声明RED：finite-ta+Period+typed fact用实际selected generator拒绝，随后Owner新实现才使其GREEN；保留原instant声明仍通，finite无fact仍通，legacyframe test不修改。真实period Native至少同Target两实例due逐次before/after、finalPeriod+Terminal、Sourcegone、Q满不挤旧due、Suppress前period、完整paired cut不重播。Game第一圈切片不要等待该上游能力，也不要用圈instant生产方式替代毒/兔真实finite生命周期。

### 6.4 预算 brief

当前ConfigBinding:143–160为live3N/perTarget3、controls7N、results256+13N、identities256+3N、due3N；fact总预算按256*32与72字段、F8719 writes/7576indexed/128fields/413940bytes/5Mwork/65536scratch。圈instant不新增finite live rows或finite due，不应借此直接把liveRows提为4N；新增的是当Tick最多N圈请求/identity/result、独立圈行和每次fact/Claim/outcome/日志的真实写/复制成本。

在选定20Hz/8人下每Participant任一Tick至多一个圈pulse，但与既有256请求、fire N、restore/control/同Tickdeath义务并存的全式必须证明。用生成plan得到每圈pulse确切列数、codec bytes、M/I/B/S与F操作成本，重新推导Q、ResultRecords/Bytes、Identities、SettlementFactWrites/IndexedWrites/Fields/Bytes/Scratch和Reducer budgets。任一不能在既有fixed物理帧内收敛，则缩闭第一切片输入生产上界或交Owner实证，禁止仅扩大固定帧、去掉拒绝或手填validated。每个exact/one-short边界均测，新增请求先准入保留，fact行不可覆盖。
毒/兔后续新增live/due/fact预留按Q+C+2L、due D≤L与Q+L事实最坏值分析，不能继续沿用“只有freeze+immune+bubble三行”的注释或额度。

## 7. 第二切片：真实Toxin生命周期（上游后派）

在上游已批准的新包确认支持period fact后，精确候选文件集：

- 新 `Gameplay/Effects/BomberToxinEffect.cs/.Server.cs`（finite4s/Period2s）、`Gameplay/BomberFiniteToxin.Server.cs`、`Gameplay/BomberToxinReducer.Server.cs`、`Gameplay/Components/Bomber/BomberToxinFacts.cs/.Server.cs`（稳定Participant独立rows、oldA/newB保留）。
- 修改 `BomberSkillState.cs/.Server.cs`（fullEffectHandle/TargetLifeGeneration/cureTick与从真实finite行的AOI deadline，不改变已存在字段身份）、`BomberParticipantEntity.cs`、`BomberEffectBusiness.Server.cs`（存活直击后唯一挂毒）、`BomberOutcomeReducer.Server.cs`（Period fatal）、`BombSystem.Server.cs`（真实状态消费，不自算due）。
- 修改 `BomberFiniteSkills.Server.cs`（成功泡泡确认当TickSuppress+Remove）、`BomberHealthBusiness.Server.cs`与`Abilities/PickupAbility.cs`（满血有毒actual0正常血包与实际成功cure），以及NewMatch/RoundTransition/Successor旧Life精准Remove/恢复校验。
- `Config/BomberConfigBinding.cs`、typedfact/F生成预算、schema ledger/正式生成；健康结果消费与Toxin事件/Replica变更只据实修改。
- 新真实Native `BomberToxinProductionTests`、`BomberToxinCureBoundaryTests`、`BomberToxinRecoveryReplicaTests`。第一RED锁Tick40/80两跳，直击2points、DOT各1；重复命中不续期且原来源不换；A/B首次有确定性；Tick80+新直击仍原占用最后Period；Tick40 cure无当跳；cure+hit同Tick只直击，下一Tick新B；A旧结果晚消费不清B；源Bomb/Life退役保thrower；死旧Life不转继；满血medkitconsume/heal0/cure；capacityexact/one-short/Q满不挤旧due；paired checkpoint旧due不重播与真实Client投影。

兔回春不要顺便以RegenNextTick字段补定时器；独立第三切片消费真实finite周期生命周期、actual回血fact/LastDamage、满血0、集束最爱未来children预算。鸭最爱、被动踢与全六池/M2地图开放分别派可互斥后续切片，按各自完整Native/复制/预算证据关闭。

## 8. 不变的未完成上游与验收事项

最新交付计划 checkpoint93：Runtime任务1 `ef2f5674`与Model任务2 `214a08f1`独审通过；Client任务 `LumioClient17PredictionStep`/`c3611518`刚派。Client/full官方包/Game消费/新Scene/用户手感验收尚未完成，旧现场仍complete29/Game31。StructuralScratch旧失败未关闭。ADR142、18085、生产schema裁定、完整活动局恢复/后继/未知Owner gates都按原记录保持开放。本报告的圈独立方案与历史ice/barrel局部GREEN不会替它们签字，也不重标旧manifest、替换旧DLL或重启现场。
