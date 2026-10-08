---
name: prototype-migration-audit
description: 101最新原型到正式引擎的逐项迁移总表——查固定基线、默认可达、规则及玩家证据时使用。
metadata:
  type: review
  status: 实施中
---

# 101「帽王乱斗」完整迁移对照

源码审计切点为2026-10-07，本表证据更新至2026-10-08，完整交付归[R-00798](https://lumiogamesengine.workflow.games/requirements/01a0e1a5-5ac1-785e-b552-81217b7d7be7)。本表记录实际源码与证据，不改变正式设计。后续修复未完成独审、完整包消费和新运行之前，不升级游戏验收状态。

## 固定事实源

| 来源 | 实际身份与核对 |
|---|---|
| 正式审计代码 | `7bacb8ac7e3caf63a35ea69e62fc7a275390540e`，已超出旧审计`1d4e6da` |
| 最新远程原型 | fetch/ls-remote实读`af385a9cd0f261317e97240a7e55accdda8d01d5`；prototype tree `ecbf2ec1aee1ec3aeb860180cf676b67703ef1db` |
| 本地原型刷新 | 对该提交恢复完整子树，170文件差异；289源码文件按Git属性规范化blob核对，0不符、0意外源码。原始CRLF工作树字节与Git LF blob分别记录，未混称字节相等 |
| 正式目标 | design + ADR0044/0047/0048：默认12/23、对照16/27、回归8/19、4分钟、一特殊槽六形态、五角色 |
| 当前根Engine | 实读`0.0.4-main.ecece8a`；要求props为`0.0.5-main.0e2fc74`，普通隐式消费存在旧身份不一致 |
| 隔离验证完整包 | approved complete29 `0.0.5-main.523c3d3`；manifest SHA256 `4e193c1d09eaea56119e431db63e40ea406cb64ee8b0416ab4e57d8c9d6c2109`，Native `7799b6fe036e79f30cdfbe16e736b508478da92fe5d93ac30a77d41cafa8987d`。官方selector显式消费；不是移动新包或三档发布资格 |
| 旧现场 | Scene31 restart03/complete29/Game31，玩家页面18101；它不是本轮新修复或完整迁移的验收入口 |

原型事实直接核对固定提交源码。护城河、冰桥和爆炸桶是M2目标，原型未实装；旧三槽、升级合成、麻痹弹、溺水按被取代规则记账。

## 逐项迁移总表

路径以`games/101-bomber/`为根；玩法文件名位于`Gameplay/`及其所示子目录，`Config/`为`Gameplay/Config/`，`Abilities/`为`Gameplay/Abilities/`，表现源码位于`Client/Presentation/src/`，`PresentationDump.cs`位于`Client/UI/Spectator/`。每项的原型行为、正式目标、完整源码行号和可复现证据在对应领域审计正文中展开。主状态只使用六类：**已验收、已有但未验收、部分实现、缺失、默认未启用、已被新设计取代**。本次源码审计没有为游戏行为新增“已验收”。

| 项目 | 原型 → 正式目标 | 当前实现与代码位置 | 默认可达 / 复制表现 | 主状态 | 真实验收证据及缺口 |
|---|---|---|---|---|---|
| 三档开局 | M1默认12/23、27档16人、19档8人 → 正式同三档 | `Config/BomberObjectBudgets.cs:38–51`仍锁Legacy/8/19；`Tools/launcher.mjs`固定总人数8 | 三档拒绝；旧底图可达 | 默认未启用 | 原型`src/app/params.ts:55`实读；已有正式三档作者/layout，缺三档普通Launcher准入、整局及容量证明 |
| Warmup资源生产 | 原型自然铺积木/箱 → 正式Native接受后Running | `BomberInitialResources.Server.cs`只接非Legacy；`BombSystem.Server.cs`/`BomberRoundTransition.Server.cs`已有生产/换局接缝 | 默认Legacy绕过初始资源 | 部分实现 | 旧seed/round窄证据；缺自然三级箱/桶接受齐备、新局重生 |
| 三级资源箱 | M1木铁金 → 完整Native命中族/回执/奖励 | `BomberResourceRewards.Server.cs`、`BomberTerrainTransactions.Server.cs:234,307–321` | 默认缺初始来源；tier/hits DTO已有，富事件不全 | 部分实现 | Gold/Pierce等局部Native；缺正常默认发行→开箱→拾取可见证据 |
| 普通资源掉落/拾取成长 | M1强化糖/帽数 → GAS actual属性与复制 | `BomberHealthBusiness.Server.cs`、`BomberGrowth.cs:8–14`、`PickupAbility.Server.cs` | 部分来源可达；玩家最大心数/金心有复制 | 已有但未验收 | 真实局部事实存在；缺新入口自然生产全链 |
| 金心/Boss | M1金心封顶/Boss体型 → 当前最大6..16点 | Growth/health/statistics；`PresentationDump.cs:41`、HUD心条 | 源已接，配置基础语义误投 | 部分实现 | 缺自然金心/Boss到死亡及最多8心画面轨迹 |
| 拾取竞争 | 原型最近格心、平距保留玩家迭代顺序 → 正式最近格心、完整ID决胜 | `Abilities/PickupAbility.cs`、`BombSystem.Server.cs:75–110` | 现入口有拾取；当前按Slot再Life遍历，尚无距离优先 | 部分实现 | 原型`src/sim/pickup.ts:191–207`实读；需要正式双玩家真实格心距离、完整IDtie与一次消费 |
| 死亡财富转移 | M1死亡掉装 → 真实actual/完整Life、durable债 | `BomberDeathDrops.Server.cs`、`BomberSuccessorLifecycle.Server.cs` | 已有；掉物/普通死亡可投影，Boss事件断链 | 部分实现 | 旧局部绿；死亡结构继任曾真实fatal，尚未用新运行关闭 |
| 资源箱/桶再生 | M1再生箱；桶属M2 → 13波整组/寿命 | `BomberRegeneration.Server.cs:105–109,315`仍无箱桶发行且锁Legacy | soft再生已有，箱桶不可达 | 部分实现 | 缺Native三产品/整组/未知回执/下一局证明 |
| 强力宝箱 | M1三击 → 每个size>1预告强箱 | `BomberStrongChests.Server.cs:24–66`；预算stage≤5 | Legacy可达，M2阶段关；27第6箱被挡 | 部分实现 | 历史11/11；缺三档段表、自然开箱与技能off |
| 中央补给 | M1 50/60秒 → 23/27十一件、19关闭 | `BomberCentralSupply.Server.cs:209–264`；WorldRuntime:50–51 | 默认关闭；正式DTO/事件尚未接横幅/光柱/喷泉 | 默认未启用 | skills-off9件2/2；skills-on边界17/15/2；缺三档完整六池/11件来源 |
| 单槽换弹出处 | M1三槽 → 一槽同种留地、换出旧糖 | `Abilities/PickupAbility.Server.cs:20–53`；集成提交`99c5b4e` | 已启用三形态可达；供应换出已清Supply身份，正常入口未验 | 部分实现 | 最终同测试RED2失败→GREEN2/2、近邻40/40，paired全25字段/完整Life排除/原held槽通过fresh独审；不代替三档正常供应 |
| 狂暴 | M1可刷新/特殊继承 → 6秒标准额外弹/≤6/5Tick | `BomberFrenzy.Server.cs`、Participant:40–44 | 来源默认供给关闭；正式until/来源未投影 | 默认未启用 | 历史Native29/29且关键源hash匹配；不等于正常默认或新浏览器验收 |
| 被动踢弹糖 | M1旧kick技能 → 独立资格/死亡唯一转移 | `BomberTypes.cs:10`kind6；`PickupAbility.cs:91–103`拒绝 | 资格/生产/死亡转移未接；TS误认狂暴 | 缺失 | 必须自然罕见糖来源、GAS资格、重复留地、死亡保护掉落 |
| 圈几何与HFSM | 原型圈推进 → 正式预告/清场/1×1 | `BomberFinalCircle.Server.cs:15–159` | 旧19可达且几何复制 | 已有但未验收 | 缺新三档整局及正常画面完整圈序列 |
| 圈外周期伤害 | 原型每秒ceil → 当前max/base6等比，保护/泡泡不免 | 审计基线仅PoisonPoints；隔离提交`3332ada`新增`BomberRingDamage.Server.cs`及GAS/F规则 | 正常源未验；认证复制规则已通过，用户画面未验 | 部分实现 | Native34/34、Replica1/1、近邻50/50，fresh局部独审通过；共同Q/物理帧生产义务与v17固定索引门仍OPEN，B-00199 |
| 中毒持续规则 | M1续毒/旧等级 → 4秒两跳、不续期/首来源 | Toxin直击普通Effect；SkillState只有字段 | 直击可达，真实持续/解毒无 | 部分实现 | 最新Runtime Period存在但逐次typed fact不足；来源/死亡清除/满血血包未验 |
| 兔回春/集束最爱 | M1旧等级恢复 → 20秒无实际受伤回半心、四邻小花 | RegenNextTick数据，无生产Effect | 不可达 | 缺失 | 需要真实GAS生命周期、每次actual数值及最爱触发 |
| 鸭泡泡/冰冻最爱 | M1泡泡/组合 → 固定泡泡解毒、破裂8邻冻结 | `BomberFiniteSkills.Server.cs:10–61`真实泡泡；无最爱 | 基础泡泡可达/复制；解毒/最爱未接 | 部分实现 | 有finite局部证据；缺五角色规则矩阵与真实破裂画面 |
| 猫闪现/遥控最爱 | M1闪现 → 固定3格、闪现引爆自有遥控 | `UseActiveSkillAbility.Server.cs:52–63` | 闪现可达；Remote默认关 | 部分实现 | 新移动消费未封完整包，最爱未默认验收 |
| 熊光环/留火最爱 | M1光环/火冲 → 5.5秒光环、火焰留火 | `BomberFiniteAura.Server.cs`、FavoriteFireZones | 基础可达，Fire关闭；区域复制已有 | 部分实现 | 历史8/8只覆盖favorite flag，完整留火矩阵未验 |
| 袋鼠飞踢/穿透最爱 | M1主动kick → 合法静止弹、成功CD3/4 | `BomberBombKick.Server.cs:14–107`、UseActive | 可达且保留来源 | 已有但未验收 | 窄Native存在；缺角色、冻结、水、无目标、同槽切换整套 |
| 冰冻/穿透 | M1等级形态 → 固定冻结、金箱两个独立族 | FiniteFreeze/BlastTerrain/TerrainTransactions | 默认启用；有限行与体素复制已有 | 已有但未验收 | 局部真实证据，缺本轮正常源整局 |
| 火焰/遥控/集束 | 原型无完整正常生产 → 六形态正常等权池 | FireExposure/Remote/Split实体与promise已有 | 默认关；Split预算明确拒开启 | 默认未启用 | 历史fire1、remote13、split11等窄证据，完整发行/寿命/容量尚缺 |
| 护城河/冰桥/桶 | 原型未实现 → M2三档地形与交互 | M2InitialLayout/IceBridges/BarrelPromises | 作者/局部路径已有，M2默认关 | 默认未启用 | bridge9/12、桶97等旧局部Native，三档自然生产/融桥库存/族去重未验 |
| Kick/Frenzy表现身份 | 原型Frenzy6 → 正式Kick6/Frenzy7 | 原TS旧码；C1已修`contract/components.ts`/adapter/HUD/batch | 隔离表现正确区分6/7；正常源画面未验 | 部分实现 | 本轮修复focused68/68、fresh独审通过、提交b3337fef；真实正式帧/画面待验，B-00197 |
| 心数/毒圈HUD | 原型base6 → currentmax≤16点/8心 | `PresentationDump.cs:209`将Maximum16当base；TS重复加算 | 玩家值已有，全局提示错误 | 部分实现 | 本轮修复focused38/38；源DTO名字歧义及真实画面待后续 |
| 输入/正常玩家入口 | 原型LocalSim → Platform/Session/GAS输入 | main.js:629、player-controls、SpectatorReplicaHost | 旧Scene31已有玩家入口；移动修复待新包 | 已有但未验收 | 两真实浏览器移动/炸弹/技能、关闭重进尚需新运行 |
| Bot分层/真人限制 | M1三档不围剿 → 合法复制观察/GAS输入 | BomberPlayScenario:98–121、Brain:217–226 | 已有合法入口 | 已有但未验收 | 缺本轮三档多种子D/E和非空逐Tick回放 |
| Bot新价值判断 | M1已有金心/箱/补给判断 → 正式新资源/形态 | Observation缺箱级/max/gold/frenzy/supply/slot；Brain:193统一拾取 | 未接新语义 | 部分实现 | 需真实replica观察与难度/资格/最爱/供给矩阵 |
| 音效/连杀/高光 | 原型总线/距离/连杀 → 只读真实事件 | Audio、kill-juice、stats/results代码已有 | 常规可达；供给/狂暴/Boss事件部分断链 | 部分实现 | 缺新两窗正式事件与声音/重连不重播证据 |
| 跟随/旁观 | 原型局部/V/出局跟随 → 明确observer目标 | view/runtime:1407–1412无local即return | 玩家出局跟随在；无self观察者缺 | 部分实现 | 缺真实Observer晚到、目标退役/切life、音频监听一致 |
| 结算/下一局 | M1 10+6秒 → 同room重新Warmup生产 | RoundTransition/HFSM/Results32/adapter | 旧8人源已有；12/16准入关 | 已有但未验收 | 旧Native两局，缺三档正常源连续下一局/结果/富表现 |
| 旧三槽/等级/组合/麻痹/溺水 | 原型确实存在 → 已被正式设计废止 | 残留兼容字段/表须按迁移收敛 | 不作为正式开放目标 | 已被新设计取代 | 保存身份历史，不将旧测试期待恢复为新产品规则 |

## 领域原始审计

- [资源、地图、掉落、成长与结算](2026-10-07-prototype-migration-resources.md)：15项详细源码审计、收据SHA、完整生产者/驻留寿命/容量与Warmup测试切片。
- [战斗、五角色、六形态和M2交互](2026-10-07-prototype-migration-combat.md)：逐项玩法矩阵、最新Runtime能力核对、圈instant切片及Period事实阻塞。
- [客户端、输入、HUD、音效、结果与Bot](2026-10-07-prototype-migration-client.md)：正式复制断点、源码/枚举/心数错投及移动writer互斥。

## 本轮新证据与未完成门

隔离树已通过approved complete29下Gameplay测试工程构建（0警告/错误，raw0）。第一次全量遗漏`LUMIO_CONFIG_ROOT`等资格依赖，原始失败保留；中止了本任务自己的无效环境基线测试，日志汇总771项/579成功/192失败/0跳过、raw-1，不是全量通过。除90项配置路径和19项package fingerprint外还有真实规则/Native失败，不能统称环境或用旧全绿顶替。

客户端C1修复为`b3337fefab7ab99e66898ec2076f37444554262b`，focused拾取68/68、health/HUD38/38（两组共享HUD用例，不能相加为独立106项）；typecheck、guard、build各raw0。fresh独审spec/quality通过，无P0/P1/P2，11文件与原始日志逐项hash匹配。新正常场景仍未验收。原型导入也经fresh独审289文件/170差异通过，提交`f8fdf00272e2321eb8acec0734b30ab234b3fe4f`。

圈伤候选`3332ada5a493a1650c5d0295469fb2f30b7e075d`已获fresh局部spec/quality审查通过。真实Native功能RED1失败及矩阵RED16失败均raw2；Production/Recovery最终34/34、认证Replica1/1、战斗库存后继近邻50/50均零skip/raw0。两组测试DLL分别存档，最后Replica扩展没有冒称已重跑此前34/50。45源与132证据独立核hash，提交前仅删一处EOF多余LF并有界复审。圈外最大血量等比、保护/泡泡不免、跨零及同Tick全灭终局、paired恢复、认证血量/死亡/end复制有局部证据；共同生产者预留与物理帧容量仍缺足够证明，压力负控228/229/239只能产生8/7/0个圈脉冲，不能冒称正常生产可达反例。v17政策6/5/1、raw1仍触固定8MiB索引；没有apply或accepted-nonauthor记录，正式准入与玩家画面仍未验收。

供应换出糖来源修复只清SupplyMatchId/Ordinal，已在独立树提交`f5fe4d915d2f5d989337ae9b774c711a56480536`并集成为`99c5b4ecd712247cc227a03ee10f742a27175c7c`。真实publisher十一件、原六池seed329、GAS交换与pairedRestore仍保留。独审原P2已补全完整25字段、普通出处、ExcludedLife/代数、participant三身份与原held七字段，恢复后原Life同格真CanActivate拒绝无副作用，再另一Life真GAS消费。最终测试hash`f0a9b8b04d8b16a55186cabb0ec96caa0a6c6259c983c6ee564a305a74f3747f`在RED/GREEN/当前树相同：RED2失败/raw2→GREEN2/2/raw0，近邻40/40零skip；新28证据与348作者输入均fresh独审通过，旧证据不覆盖。未开放M2、默认供应或全部六形态。

认证文件换行转换修复`c490d706eb9ee09b051112b53d464cb0825b0169`已集成为`64f4981`，两级attributes仅对身份历史/官方Config JSON禁用文本转换，不改变任何JSON/哈希/历史内容。强制`core.autocrlf=true`新checkout的3012个实际Git blobs中，原2951项仅换行不符，最终0不符；额外逐项核3012条effective属性均为text=unset。fresh有界复审关闭下级attributes覆盖的P2。该字节措施不能关闭schema容量或整局游戏验收。

本轮已通过Workflow本地可恢复bundle登记、全局查重、写后逐字段读回及RM-00013全分页数量核对：53旧bug→59，六个新bug唯一且无缺失。B-00197为枚举、B-00198为生命基数投影、B-00199为圈伤害、B-00200为默认Warmup/三档资源、B-00201为补给交换出处、B-00202为本次独审P2。R-00798追加评论`01a116fd-9997-70f1-9e47-bc94a5e9e93f`也已读回；没有自动关闭单据或修改状态。操作收据在`.run/20261007-migration-audit-01/workflow/upload-summary.json`（仓根）。

Runtime Clock/Model此前独审通过，Client修订候选`693095a6`focused22/22；phase/jitter仍记录7次Model非纠偏倒退，不能称连续移动已通过。另一移动恢复任务已完成complete30与Game32有限预览：Game`b07f4512`、真实Native bridge4/4、严格AOT及Scene32服务，新页面18102/DS18332/独立Platform18401；这不是本轮C1/圈伤害/资源实现的运行版本，仍为八人旧规则，浏览器运动、三档和完整手感未验。较宽Game回归31/32的一次入场超时、死亡结构继任、公开Platform发布身份、schema候选正式采用和GAS既有StructuralScratch失败均保留。完整来源及限制见delivery-progress checkpoint95–96。

本线程Owner已明确回复「批准这项扩展（推荐）」，批准受限Period专用typed fact以补中毒/兔回春：完整原来源/occurrence、实际数值、容量及paired恢复边界。提案门已解除，Engine/Runtime隔离实现正在推进；批准不等于能力或发布可用，领域审计中的“待Owner”为早于本回复的固定历史切点。既有即时事实、固定物理帧、旧失败及公共tag发布门不因此改变。

2026-10-08周期契约/官方GEN已交回并通过fresh独审：独立重跑Engine799/799、GEN381/381、容量oracle5/5，旧instant15文件原bytes相同。Runtime冻结候选双TFM构建零警告错误，Period58/58、generic属性恢复2/2、均raw0零skip；完整GAS1059/1058/1/raw2，唯一为保留StructuralScratch12706/12070，Runtime独审仍待交回。以上尚未commit/公开tag/完整生产包消费，不将能力候选冒称正式中毒或兔回春已实现。

新干净工作树另揭示pending v17工具的前序pin误用了旧Windows检出末尾CRLF：`703b42...`是1037040字节，权威提交与root原JSON为LF、1037039字节、`8d72fdf3885ac679d7f5804fd9517fb63dc4cab317918f665b1a6923053305c4`。两者完整差异只末尾CR；根调查收据保留。候选工具仅修正尚未采用的前序引用，正式历史JSON/manifest/页哈希不改。现有六项实际由2/4前序失败回到5/1容量失败、raw1；这一pin修复及有界索引尚需独审，v17正式采用仍OPEN。

完整交付仍缺：三档自然生产整局、技能开/关、六形态/五角色、非空逐Tick确定性、规则矩阵、两真实浏览器同房、关闭重进、30分钟稳定性、多种子D/E与原型差异、PR独审合入后复验。每项需同时有规则和用户可见证据，不能由构建、夹具、注入演示或进程存活替代。
