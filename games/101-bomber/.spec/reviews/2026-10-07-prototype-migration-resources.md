---
name: prototype-migration-resources-audit
description: 101最新原型与正式代码的资源与三档地图迁移审计——核对源码、默认可达和真实证据时查。
metadata:
  type: review
  status: 实施中
---

> 本文固定于2026-10-07审计切点。完整交付归[R-00798](https://lumiogamesengine.workflow.games/requirements/01a0e1a5-5ac1-785e-b552-81217b7d7be7)。后续修复、独审及新运行资格见[总表](2026-10-07-prototype-migration-audit.md)；下述历史计数不自动升级为当前验收。

# 101 最新原型迁移审计：资源、地图、成长与结算

审计日期：2026-10-07。正式源码固定 `7bacb8ac7e3caf63a35ea69e62fc7a275390540e`；原型固定 `af385a9cd0f261317e97240a7e55accdda8d01d5`。原型事实直接读取该 Git 对象，不用原型旧工作区推断。根代理刷新原型后的未提交变更不属于本审计的正式实现。本代理只读正式源码、设计、已有收据，并写本报告；未编译、运行游戏、操作现场、修改生产源码或提交。

已依次阅读仓库与 101 的 AGENTS/knowledge 导航，设计案、ADR0044/0047/0048/0049、原型收敛计划、交付进度最新尾段，并对相关历史记录定点核查。没有整读超大 `.sdd/progress.md`。下列“运行证据”区分真实历史日志、独审转述和本次静态发现。历史局部 GREEN 不替代当前完整包、三档整局或真实浏览器验收，本文没有任何一项升级为“已验收”。

## 结论与可信边界

正式树已经具备有种子的 M2 初始布局、Native Warmup 发行、初始桶、三级箱、GAS 成长/死亡财富、普通积木再生、补给与狂暴、强箱、同房下一局。不能依照早期计划的未勾选项全部重做。实际默认仍是 Legacy 19×19、8 人、7 分钟；六个 M2 profile 都 `runtimeEligible=false`，预算和启动入口还拒绝 M2。箱/桶再生、毒圈真实伤害、飞踢糖消费，以及补给/狂暴表现链仍有缺口。

补给存在真正保留的 RED：`central-supply-boundary-red-01` 17 项中 15 过、2 败、零 skip、raw exit 2。两个失败先停在 skills-on 公开发行，因此不能声称运行已经抵达换糖失败。另一个换糖来源混合问题可由当前代码静态证明：供给实体变成普通换出糖时未清除供给来源字段。完整六形态池不能为了变绿过滤成已开启子集。

必须纠正旧资料：当前 `ContactedChests` 已是 52、participant roster 已是 16、结果每列已是 32，不能再复制旧 cap5/结果16 草稿。旧“金心永久不能落地、141 局溢出”已被独审正式撤回：实际合法 LedgerMode 是 `GoldenHeartOwnership`。TerrainRewards703 / DeferredDeathDebts703 的长期容量证明仍缺，但尚无真实第704项反例，不能称已复现溢出。

## 三档对照

| 项 | 19/8 回归 | 23/12 默认目标 | 27/16 对照 |
|---|---:|---:|---:|
| 最新 M1 原型默认人数 | 8 | 12，网页默认 | 16 |
| M2 水/柱/潜在格 | 28 / 48 / 213 | 44 / 80 / 317 | 60 / 104 / 461 |
| 全可破坏物65%上限 | 138 | 206 | 299 |
| 木/铁/金箱 | 8 / 4 / 4 | 12 / 8 / 4 | 16 / 12 / 4 |
| 桶 | 4 | 8 | 8 |
| 普通积木余量 | 118 | 174 | 259 |
| 护城河半径/支路 | 3 / 2 | 4 / 4 | 5 / 6 |
| 每波最多镜像组 | 2 | 3 | 4 |
| 正式目标时间 | 240s；再生8s首次、105s排他停止 | 同左 | 同左 |
| 中央补给 | 关 | 50s预告、60s发行一次 | 同左 |
| 当前 room profile | 有；关闭准入 | 有；关闭准入 | 有；关闭准入 |
| 当前 default Launcher | 该人数/大小可达，但 Legacy7分钟 | 不可达 | 不可达 |

源定位：`Gameplay/Config/M2InitialLayout.cs:30–35,67–68,99–110`；`Gameplay/Tables/profiles.json:423,431,439,447,464,481`。M1 `prototype/src/contract/config.ts:353–400` 是旧偶数柱/小池塘体系，23 档中环上界6；M2 23 档上界7、护城河、桥和桶为设计改变，不要求照抄 M1 地形。M1 19中心没有补给广场；M2三档中心3×3都留空。

## 逐项可追溯审计

以下正式代码相对 `C:/Work/LumioGames/LumioGame/games/101-bomber/`；原型行号相对上述固定提交的 `games/101-bomber/prototype/`。行号均以正式审计树或 Git 对象为准。

### 1. 默认 Launcher、profile 与对象预算 — 默认未启用

- 原型行为：`src/app/params.ts:56,90,107,125` 默认23，使用所选 map tier 的12人和240000ms；`src/contract/config.ts:408–484` 定义3s Warmup、4min上限、16s结算及补给/狂暴参数。
- 正式目标：23/12默认、27/16对照、19/8回归，三档共用四分钟节奏；发行集合、有效 Tick 寿命、跨 Life/代际保留及完整存储上界一致后准入。
- 当前位置：`Gameplay/Tables/tables/game.txt:6` 8/19/420000；`map.txt:6` Legacy；`object_budgets.txt:6` provision2784/1607/336。`Tools/launcher.mjs:193,287–288,305` 固定8人；`Tools/server-profile.mjs:90–117` 固定 author base。`Tools/seeded-config.mjs:64,77–92` 能按命名profile覆盖。`Config/BomberObjectBudgets.cs:38–53` 明确拒非Legacy与非8/19；`:68–69`最多5强箱；`:95–104,119–143` 已有 checked 发行公式与共同 hard cap。
- 默认可达：8/19 Legacy可达；六M2拒绝，不可把选择某配置目录当实际准入。`m2-room-*`仅覆盖人数/尺寸/240000，继承默认 `central_supply_enabled=false`；其 circle_stages 全关箱，27仍只有旧五行。`m2-map-*`仍是420000ms作者几何 profile。
- 复制/表现：端侧 profile 导出存在并有独立manifest；尚无新 Launcher/DS/客户端三档匹配实际启动链证据。
- 运行证据：已有独审105/105、零skip、raw0验证42 Legacy准入+6 M2拒绝，见后面收据。它证明守卫有效，不证明M2开局。`startup-budget-green-01`文件实际8/8失败、raw2，不可按green标题认定通过。

### 2. 三档地图、有种子初始布局 — 已有但未验收

- 原型行为：`src/sim/mapgen.ts` 生成偶数柱、小池塘、软砖和三级资源箱，执行镜像、连通、覆盖与出生安全校验；没有M2护城河/桥/桶。
- 正式目标：ADR0048固定 authored Native底图，DS Restore；资源按 Runtime确定性随机流挑完整镜像组。保持三档中心、桥口、出生保护、区域箱额和 aggregate65%天花板。
- 当前位置：`Config/M2InitialLayout.cs:26–35,63–68,92–110,113–178` 已有 size/seed接口及 Runtime `DeterminismContext`；`Config/M2BudgetEnvelope.cs:13–40` 为纯整数 envelope。`Tools/Lumio.Bomber.MapAuthor/Program.cs:106–125,219–249,275–278` SDK写入/Capture/校验三档；底图是 `Server/Assets/Maps/m2-map-{19,23,27}.voxel`。`Tools/capture-basemap.test.mjs:25–46` 测真实SDK还原及重复捕获；`:82`作者profile约束。
- 默认可达：M2底图和plan存在，但 default Legacy不选它；M2正式组合被预算/启动守卫挡住。
- 复制/表现：Native体素为唯一地形；箱/桶binding实体及tier来自正式事实。不得另建浏览器逻辑地图。
- 运行证据：进度记录951–953：`seed-authority-green06` layout4过（3档各seed1–100的静态断言+1个Native下一局）、budget83、round4过。不是300个Native整局。M2早期独审的“无seed”结论已经过时；完整三档Native连通/出生/恢复/整局尚欠。

### 3. Native Warmup 全资源生产 — 部分实现

- 原型行为：`src/sim/match-phase.ts:128–163` 开局一次生成地图、箱注册、初始资源计数，再进入3s Warmup；本地状态无需异步Native结算。
- 正式目标：原始 SDK base Restore后，完整软砖/木铁金/桶发行及binding接受，才允许 Warmup→Running；拒绝/unknown/短接受都不得提前推进cursor或宣布完成。
- 当前位置：`BomberInitialResources.Server.cs:19,40,62–78,105–125,144–189,205` 保存plan、桶/箱promise、≤128批、实际cell/binding核验；`BomberTerrainTransactions.Server.cs:220,224`驱动，`:165–166`只接受后推进；`BombSystem.Server.cs:381–388` pending1/2挡Running。
- 默认可达：自动Configure要求非Legacy且Warmup，当前默认不触发M2完整生产。已有测试可以显式配置合法布局，不能冒称默认可达。
- 复制/表现：箱Tier/Phase/剩余命中AOI，Native block+绑定身份共同权威；phase3必须覆盖桶实际出版和接受，不能只看planned/count。
- 运行证据：历史M2布局/桶/terrain/round测试已运行；当前三档配套预算准入下自动Warmup→Running尚无真实整链收据。`startup-budget-green-01`真实在GAS EffectOperationValidation启动前置失败，8/0/8/0、raw2；其后局部修复通过不等于三档开局验收。

### 4. 木铁金箱、独立爆炸族、掉落 — 已有但未验收

- 原型行为：`src/sim/chest.ts:154–163` 用独立Bomb id记录箱命中；`:178–188`按tier生成糖/特殊/金心，找不到位置时余量丢弃。M1母弹/集束子弹独立id不等于正式独立爆炸族。
- 正式目标：金箱两独立族，母/子同族；第一击阻断穿透，只在实际破坏接受后继续与发奖励。木1随机强化/回血；铁1非回血强化+50%特殊；金2非回血强化+必特殊+20%金心。无合法格保留所有已接受债。
- 当前位置：`BomberBlastTerrain.Server.cs:28,45,84`族/continuation；`BomberChestState.cs:9–17`tier/hit/phase；`BomberBombState.cs:38`52触碰身份；`BomberResourceRewards.Server.cs:14–48,53–62`分族/区域确定性发行及kick替换；`Gameplay/Tables/tables/chest.txt:14,16,18`奖励；实际破坏统一经TerrainTransactions接受。
- 默认可达：Legacy强箱可达；M2初始三级箱随profile未启用。合法金心正常材料化；Kick与关闭的特殊形态可留下债。
- 复制/表现：`Client/UI/Spectator/PresentationDump.cs:92`导出tier；`Client/Presentation/src/replica-adapter.ts:215–220`资源箱投影已有。
- 运行证据：历史Golden Native2/2、strong完整11/11等有独审，原第六contact RED后来声明已52。当前三档金箱母/子族、全部形态穿透、Native拒绝/unknown+paired恢复尚无完整矩阵证据。不能使用旧333私稿作为已批准schema。

### 5. 初始桶与桶爆炸 — 已有但未验收

- 原型行为：M1无桶；这是M2新设计。
- 正式目标：初始4/8/8，第一次接受触发100ms后爆；继承完整source/族/形态/狂暴归属；绑定Native、零桶奖励、一次链闭合，active+pending不超map额度。
- 当前位置：`BomberInitialResources.Server.cs:107–114`已创建桶；`BomberBarrelBombPromises.Server.cs`有继承来源与形态及Frenzy marker；`BomberTerrainTransactions.Server.cs`统一销毁；`Components/Bomber/BomberWorldRuntime.cs:42–43`8个初始桶reservation和durablepromise。
- 默认可达：默认Legacy没有M2初始桶；不能据声明8而认定地图27正式准入。
- 复制/表现：必须投影正式bound barrel，而非仅画出Native材质。完整桶提示/爆炸归属显示需浏览器验收。
- 运行证据：既有桶Native97局部报告及 `frenzy-barrel-green-candidate-01`实际1/1/0/0 raw0。没有三档初始+再生桶共用额度整局证据。

### 6. 再生积木/箱/桶 — 部分实现

- 原型行为：`src/sim/regen.ts:20–64` 每8s，以初始60%目标选完整镜像组、避玩家/炸弹3格，1/6选区域箱，其余软砖；没有桶。
- 正式目标：8s首次、每8s、105s排他停止，2/3/4完整镜像组；首先1/32桶（额度和4格均满足，否则普通分支），普通分支1/6区域箱，否则软砖；仅实际接受原始结果计产量，拒绝与未知可恢复。
- 当前位置：`BomberRegeneration.Server.cs:40,57–83,97,105–114,132,197–220,249–264,304–343` 已有软砖Native发行、持久波/nextTick、60%、完整组、安全矩阵、Original接受。`:105–109`明确箱/桶未交付：消耗箱roll但 `continue`，没有箱实例；barrel分支不在Legacy；`:314–315`仍限制≤2组/19；`:343`仅soft。`WorldRuntime.cs:44–47`durable字段已存在。
- 默认可达：默认Legacy普通soft可达；默认420/115/60时间给stop245s，不是目标105s。room M2虽配first8/lead20但准入closed；不得临时soft-only M2冒充迁移完成。
- 复制/表现：Native接受后实际格+实体应直接复制；不能为箱再生仅替换表而无binding/promise。
- 运行证据：`.sdd/101-20261003-regeneration-zero-first-independent-review.md`报告真实6/6零skip/raw0，证First0和8s/105s/Legacy19窄矩阵；历史首波RED已保留。没有23/27、箱/桶、50ms UGC与完整寿命上界证明。

### 7. 掉落、拾取竞争与kick糖 — 部分实现

- 原型行为：`src/sim/pickup.ts:93–144,191–207`普通软砖区域率250/350/450，cap不够的糖留地；同格竞争按距格心最近、平距按玩家迭代顺序，仅一个winner。没有正式full Participant/Life恢复身份。
- 正式目标：每次认领完整匹配participant/live Life/generation，cap/repeated refusal零副作用，最多一个接受者。kick糖3%替换随机糖槽，不能增加发行；有kick者重复留地，死亡必转移一次、3s保护、没地方保留债。
- 当前位置：`Abilities/PickupAbility.cs:25–50,66–98`能力准入/cap/claim/技能交换；`.Server.cs:14–52`重新核认领。`BomberHealthBusiness.Server.cs:14–67,100–131,167–205`GAS完成facts后消费/释放claim。奖励issuer已有KickQualification替换，`ResourceRewards.Server.cs:33,57`不材料化kick；PickupAbility没有kick消费分支。
- 默认可达：普通强化/技能/金心可达；默认soft随机奖励可产生kick债，但飞踢糖获取与死亡转移未闭环。正式claim顺序不同于M1最近格心算法，设计要求完整身份确定竞争，不应复制M1不稳定顺序。
- 复制/表现：直接整数kind投影存在新旧冲突（见第13项）；拾取journal必须只来自接受facts。
- 运行证据：成长15项窄测试有竞争/claim释放；`BomberGrowthHealthTests.cs:74,135`含实际竞争金心及第四金心留地。无kick消费/继承真实链和三档多人争抢验收。

### 8. 强化、帽子、金心、Boss — 已有但未验收

- 原型行为：`src/sim/death-drops.ts:22–43`由强化算帽子、maxhealth；`pickup.ts:150–182`金心最多3，新增心即时填满，狂暴回满。
- 正式目标：max=6+2min(2,hats/4)+2min(3,gold)，总上限16点=8心；Boss≥12点；帽王同帽保持 incumbent；金心不是普遍暂时Effect，必须持久ownership。
- 当前位置：`BomberGrowth.cs:8–17`完整公式；`Components/Bomber/BomberPlayerState.cs:18–23`HatCount/MaxHealth/Gold AOI；`BomberHealthBusiness.Server.cs:49,65–67,177–202`真实属性effects、journal和Boss形成；`BomberEffectBusiness.Server.cs:114–118`Boss击倒统计。
- 默认可达：Legacy掉落/强箱链可达；默认金心实体消费存在，不属于缺失。cap后金心留地。
- 复制/表现：`PresentationDump.cs:45`maxhealth/gold和`replica-adapter.ts:175`已投影，growth-tier独审通过；完整Boss形成/击倒播报、帽王多人同Tick竞争和浏览器外观尚需真运行。
- 运行证据：growth-tier独审10路径、SDK Native5/5、adapter22/22、WASM seam6/6，各工具/包身份不同，不能合成一次全链验收；历史Growth15/15局部。

### 9. 死亡财富与跨Life债务 — 已有但未验收

- 原型行为：`death-drops.ts:58–119`普通强化/特殊50%，金心全部；决赛圈全部，无合法格时可能丢失。
- 正式目标：3s保护，ordinary/final不同损失率，所有已选输出守恒，满地图保留旧fullLife债，继承不能mint；死亡重复/迟到/old generation不会再发行。
- 当前位置：`BomberDeathDrops.Server.cs:20–59,66–82,128–185`完整tuple去重、扣旧wealth、旧债先发行、sharedcredit和selected=pending+placed；`BomberDeathDebt.Server.cs`bounded JSON；`Components/Bomber/BomberRespawnCarry.cs:59`703旧债行。
- 默认可达：生产死亡/GAS事实链可达，但现场DS旧body故障仍是上游未恢复事项，不能说本链全验收。
- 复制/表现：drop对象只在真实结构出版后AOI；出处/保护与life代际检查服务器权威。客户端死亡回顾/统计由journal/results承担。
- 运行证据：已有death/effect/continuity/successor/restore窄GREEN；未知创建、公用snapshot paired截点、多Life旧债703界及三档整局未证。`703<1607`不等于必须扩，也不等于已安全。

### 10. 中央补给 — 部分实现

- 原型行为：`src/sim/supply.ts:19–49,80` 50s announce，60s按最近合法格喷5强化/2血/1狂暴/2特殊/1金心；无格截断。
- 正式目标：19关闭；23/27一次11输出（skills-off9），fullpool6等权、不偷过滤；未出版输出持久保留，publication和供给来源统计一次。
- 当前位置：`BomberCentralSupply.Server.cs:16–28,99,139–151,187–215,240–299` bounded promise、once标记、sharedcredit、逐ordinal真实发行/保留；`BomberCentralSupplySystem.Server.cs:7–8`World Tick afterBomb；`WorldRuntime.cs:50–52`Room标记及None debt；`PickupAbility.Server.cs:35–52`换出物复用原实体却未清 `SupplyMatchId/SupplyOrdinal`，会被Supply.ValidateItem当混合来源拒绝。
- 默认可达：默认off；所有M2 profile继承off。仅已构造的合法19 override生产测试开启，不是目标默认可达。
- 复制/表现：Room标记已有，Dump/adapter没有 supply状态与announcement/open event，HUD处理器存在但无法从当前projection触发。
- 运行证据：defaultoff+skills-off发行2/2 raw0；boundary17/15/2/0 raw2，skills-on发行与拟换糖前置失败保留。当前Supply/Pickup源码关键hash与该RED一致。换糖mixed provenance是静态P1，尚无抵达该交换的真实RED，实施须先补实际可达前置测试。

### 11. 狂暴 — 已有但未验收

- 原型行为：`pickup.ts:176`回满/6s，M1重复拾取刷新；`place-bomb.ts:18–54`额外弹fuse1.2s、最多6及5Tick节奏；M1额外弹可能继承特殊形态。
- 正式目标：持有拒重复；primary额外Standard，不继承特殊；Participant跨Life最多同时6，非总生涯6；原完整Life自产狂暴弹免疫直到弹消失，buff到期仍免疫，successor不继承旧Life免疫。
- 当前位置：`PickupAbility.cs:91`重复拒；`BomberFrenzy.Server.cs:23–55,65–92,131–145`以applied Healthfacts启动、fulltuple、promise、Standard、1200ms、跨life inventory credit；`BomberBombState.cs:51`Frenzy marker复制。
- 默认可达：frenzy consumertrue但default补给off，默认没有该实际供给糖来源；合法测试override可走真实publisher/GAS。不能将enabled消费者等同默认玩法可达。
- 复制/表现：AOI字段有，Dump缺Frenzy marker/参与者until；adapter/events缺该投影，M1 UI原有消费者不够。
- 运行证据：实读 `frenzy-production-full-green-candidate-02` 日志29/29/0/0 raw0，纠正作者旧“待测25”的文字；另桶Frenzy1/1。限定真实生产/恢复矩阵可复用，仍没有三档整局+实际UI验收。

### 12. 决赛圈强箱与毒圈 — 部分实现

- 原型行为：`chest.ts:56–103`强箱三独立id命中，固定强化/血/特殊+20%金心；圈推进与local poison伤害可直接写本地状态。
- 正式目标：Native HFSM圈、每size>1 preview发行强箱、三独立族；固定Power/Capacity/Speed/Health+1特殊，skills-off去特殊；毒圈每1000ms扣ceil(段点数×当前max/6)，5×5起段点数2；设计 `docs/specs/bomber/design.md:633` 明确重生保护和泡泡都不免疫，毒死自杀归属。
- 当前位置：`BomberFinalCircle.Server.cs:22–59,90–140`几何/阶段/资源触发/stopTick；`BomberStrongChests.Server.cs:24–66,118,182`Native binding、一次发行；`BombSystem.Server.cs`有reset。全文非generated C#搜RingPoison/PoisonIntervalMs/PoisonPoints只发现enum/event/config/状态与测试，未找到真实GAS伤害producer。
- 默认可达：Legacy强箱可达；M2 room阶段全关箱。毒圈几何可达，但正式poison伤害链缺失。27 target6强箱还被预算stage≤5守卫拒绝；23段表需独立确认，不能自动套19段表。
- 复制/表现：圈几何字段有；强箱已投影。毒伤害/死亡必须来自正式GAS事实，不能只让HUD显示计时或染色。
- 运行证据：已有Strong11/11和Native圈窄证据；缺poison生产真实RED/后续GREEN。该缺失是源码查证，不冒称运行复现。

### 13. 资源/补给/狂暴的端侧表现 — 部分实现

- 原型行为：本地simulation直接向renderer/HUD发资源、supply和frenzy状态，无formal replica适配边界。
- 正式目标：只读正式复制与接受事件，tier、金心、kick、frenzy唯一语义；unknownkind明确fail而非暗画错；实际C#客户端输入，浏览器旁观。
- 当前位置：`PresentationDump.cs:45,66–80,92,120–123`已有成长/箱tier，但未导出supply/Frenzy信息；`replica-adapter.ts:175,215–229,265`直接cast pickup整数；`Client/Presentation/src/contract/components.ts:68`M1 Frenzy=6，正式kind6是Kick、Frenzy=7。实际7被错误投影，6可能画成狂暴。`replica-events.ts:75`直接kind；缺supply/frenzy事件。`hud-brain.ts:542,548,706`消费者存在；audio原有frenzyUntil消费者亦未接正式状态。
- 默认可达：普通资源/成长局部可显示；供给与狂暴的正式投影链不完整。
- 复制/表现：需显式canonical enum映射+正式DTO/state/events，别只改画图资源或照抄M1序号。
- 运行证据：已growth适配窄测试；kind7、supply预告/打开、狂暴倒计时、fullLife归属真实Dump→adapter→浏览器缺完整证据。本项文件归端侧实施者，与预算域可互斥。

### 14. 结算与自动下一局 — 已有但未验收

- 原型行为：`match-phase.ts:197–225`16s后新局；`results.ts:11–20` survivor→hats、出局顺序与highcard排序；10s领奖+6s结果。
- 正式目标：同Room、完整结果保留两局，10/6节奏；清理实际Native资源和finiteeffects，旧未出版债不丢，下一generation按新seed自动Warmup生产，老结果不触碰新局。
- 当前位置：`BomberRoundTransition.Server.cs:16–35,37–55,64–104,142–162` gates、Native旧binding退役、base还原、reset/重seed；`BombSystem.Server.cs:407–426`结算阶段与下一局；`BomberHfsmDefinitions.Server.cs:60–71`原生match生命周期；`Components/Bomber/BomberResults.Server.cs:51,118–129,165–241`保留两局/验证（只要求playercount>0）；`BomberResults.cs:16–41`各统计列32，已经可容纳2×16；roster16。
- 默认可达：8人同房循环可达；12/16开局被守卫挡住。结果容量无需按过时16再扩，但placement361/pending722等map语义仍要证明。
- 复制/表现：Room结果已持久复制，领奖/详情与新局手动选角边界属端侧验收。结果array32不是整场12/16已支持的证据。
- 运行证据：`BomberRoundRolloverTests.cs:158`含真实Native两局；seeded4+round4历史绿。早期强箱压柱清理缺陷在Resume10 Native689及独立690回归纠正，未证三档自动Warmup、未出版供给、旧life财富积压与pairedSnapshot各截点完整矩阵。

### 15. 应明确淘汰的 M1 语义 — 已被新设计取代

- 原型行为：同Bomb id而非独立爆炸族；空间不足丢资源；三槽/等级/组合；Frenzy继承特殊与重复刷新；M1旧偶数柱小池塘。
- 正式目标/位置：ADR0044/0047/0048的一槽六形态、无等级组合、M2 Native地形、有界durable发行、fulltuple归属；对应ResourceRewards、DeathDrops、Frenzy、M2InitialLayout和唯一TerrainTransactions。
- 默认可达：旧语义不能作为“完整迁移必须打开”的要求；部分M1契约仍在客户端需要适配。
- 复制/表现：保持原型可识别的反馈和体验，正式身份/权威语义用正式代码。
- 运行证据：本项是设计裁决，不是测试验收，不需用旧测试期待冻结正式目标。

## 收据复核与已有候选复用

| 收据/资料 | 实际结论 | 可复用范围/不得外推 |
|---|---|---|
| `games/101-bomber/.run/v14-native-production-20261003/frenzy-production-full-green-candidate-02.*` | 29/29/0/0，raw0；2026-10-03 06:23:02–06:24:48 UTC；log SHA `b80973cae12da1803cad17c8df44aecb2b5aad52fc5da40f0e8374b7835b1305` | 真实Frenzy生产/Native矩阵；关键Frenzy/Supply/Pickup源码hash与本审计树匹配，不绑定当前全树 |
| 同根 `central-supply-boundary-red-01.*` | 17/15/2/0，raw2；06:00:48–06:02:03；log SHA `4ec806e0f3e6eaaf1d1123a8c2ccca01bb7484251b9f1ee5b808293b15e72134` | 两次失败先在skills-on公开发行，不能称实际换糖RED |
| 同根 `supply-production-green-candidate-01.*` | 2/2/0/0，raw0；05:37:25–05:37:37；log SHA `38ed635050de21d4807dca69f2ae6c44f8856373ccf941dbccefd8f1c8d853af` | defaultoff+合法19 override skills-off9项，不是23/27 |
| 同根 `frenzy-barrel-green-candidate-01.*` | 1/1/0/0，raw0；log SHA `05ce4e46a2628f9fade692bed826e0d816459623910d404749247ec8da9133f3` | 额外弹/桶归属窄测试 |
| 同根 `startup-budget-green-01.*` | **8/0/8/0，raw2**；log SHA `ebc08fe3a9f64affe4ad9e85b0e91b86816ec5b97f534e7ccf5506c93e0bf0a1` | 全在GAS EffectOperationValidation启动前置失败，不是Warmup GREEN |
| `.sdd/101-20261003-resource-profile-runtime-corrections-review.md` + `.run/resource-profile-runtime-corrections-review-01/verification.json` | 独审105/105、0skip、raw0；实跑 `object-budget-resource-migration-green-45` log SHA `15b607d98e60ce5461049034ce53cb14b9e351941e69b1a61640586efc053299` | 42 Legacy准入、6M2拒绝；Supply fixture1361更正；不能宣布M2/queue703整record |
| `.run/resource-profile-root-publication-01/official-export-proof.json` | 已正式官方双fresh导出default+48profile；54Readers+adapter不变，2940输出/132输入核hash | 复用同步工具和表导出，别再复制UNRUN budget草稿 |
| `.sdd/101-20261003-budget-profile-integration-report.md`后附Root实测更正 | 原私稿UNRUN后，实际105/105和Strong11/11；Gold错误撤回 | 文档旧正文cap5/Gold141局已过时，读最后修正 |
| `.run/resource-chest-budget-bounded-candidate-01/*.draft` | UNRUN私稿，333为实验literal，未批准wholeStorage/compat | 不可直接发表333/GENv15；当前真实52需重新核历史来源 |
| `.run/resource-contact-old-world-independent-review-01/verification.json` | PASS bounded cap5 canonical RuntimeOnly storage baseline | 真实旧原像可复用；明确不是Native箱producer/新release迁移证明 |
| `.sdd/101-20261003-m2-producer-pre-admission-review.md` | 当时source-only审查，无执行/批准 | “无seed/无初始桶/无再生/无供给狂暴”已被后续源码取代，复用原则与依赖，不能重做 |
| delivery-progress951–953 `seed-authority-green06` | layout4/budget83/round4窄历史绿；terrain另保留OOM失败 | 现有有seed源码、自动首/次局规划可复用，seed1–100主要是静态 |

原始JSON本次读取键/exit/log；Supply/Frenzy三组真实计数本次从日志核对。表格独审类结果仍标为独审记录，不声称本次新跑。第一个Frenzy log SHA规范值是 `b80973cae12da1803cad17c8df44aecb2b5aad52fc5da40f0e8374b7835b1305`。

## 三档开局/预算成套实施 brief

目标：保留当前已实现生产者，补齐所有必须发行分支及有效寿命/存储证明，最后通过正式Launcher自动选23/12；19/8与27/16显式对照，同客户端/服务器profile和base map一致。root已创建隔离工作树 `C:/Users/g923/.codex/worktrees/101-migration/LumioGame`，base7bacb8a，分支 `codex/101-migration-rules`，使用完整approved complete29做候选验证；本审计未操作该树或现场。实施不需重新实现已有M2 seed/base/桶/softregen/Supply/Frenzy。

### 唯一集成 owner 的精确文件集

所有路径相对game root：

1. **作者规则输入**：`Gameplay/Tables/profiles.json`；`Gameplay/Tables/tables/{game,map,object_budgets,regeneration,final_circle,circle_stages,chest,blocks,bomb_kinds,skill_levels,pickup_kinds}.txt`（只实际需改变的行）；`Gameplay/Tables/profiles/m2-room-{19,23,27}/layers/product/{game,map,regeneration,circle_stages}.txt`，所需对象budget overlay与23/27补给overlay。`m2-map-*`是author geometry包，不能当runtime profile偷改默认。涉及新公开字段再修改对应`schemas/*.json`及row registry/tombstones；单纯数值不造新身份。
2. **准入/预算与布局**：`Gameplay/Config/{BomberObjectBudgets,BomberTerrainBudget,M2BudgetEnvelope,M2InitialLayout}.cs`；`Gameplay/BomberInitialResources.Server.cs`；`Gameplay/BomberRegeneration.Server.cs`；`Gameplay/BomberTerrainTransactions.Server.cs`；`Gameplay/BomberRoundTransition.Server.cs`；`Gameplay/BombSystem.Server.cs`。这些全套由一owner合入；domain leaf先私有独立新文件/测试，避免并行改共享writer。
3. **物理声明只在需要时修改**：`Gameplay/Components/Bomber/{BomberWorldRuntime,BomberBombState,BomberChestState,BomberBarrelState,BomberRespawnCarry,BomberResults,BomberMatchState}.cs`；`Gameplay/BomberInventory.Server.cs`及实际对应producer component。现ParticipantIds16、hit16、Results32无需凭猜测再扩；placement361与pending722如何覆盖23/27、TerrainRewards703/debt703/ContactedChests52如何被真实准入约束必须明确证明。保留旧release原像与fail-closed边界，不能只改literal。
4. **发布生成物**：通过官方GEN更新 `Gameplay/generated/{client,server}/**`、真实`Gameplay/Compatibility/schema-identities*.json`及历史页；通过官方配表同步更新`Server/Config/Generated/*.cs`、`Client/Config/Generated/*.cs`、`Gameplay/Config/BomberTypedTables.cs`、`Server/Config/Tables/**`、`Client/Config/Tables/**`、`Server/Config/Profiles/<全部注册profile>/**`、`Client/Config/Tables/profiles/<全部注册profile>/**`。对default+所有profile双fresh生成与--check，不手改这些产物。
5. **底图与启动**：`Tools/Lumio.Bomber.MapAuthor/Program.cs`（现M2 Capture能力复用）；`Tools/{capture-basemap,server-profile,official-catalog,launcher,seeded-config,prepare-server-host-inputs}.mjs`及各自`.test.mjs`；`Server/Assets/Maps/m2-map-{19,23,27}.voxel`和对应官方catalog/layout产物；`Server/Config/Startup`实际启动描述及所选base/config清单。Server-profile/Launcher目前AUTHOR_ONLY拦截必须在producer/budget proof之后改成精确受支持tuple，不能删除所有来源校验。
6. **已有测试及新集成RED**：`Server/Tests/Gameplay/{M2InitialLayoutTests,M2BudgetEnvelopeTests,BomberSeededLayoutTests,BomberObjectBudgetTests,BomberRoundRolloverTests,BomberResourceChestBudgetTests,BomberStrongChestProductionTests}.cs`保留原guard/负控，新增独立`BomberM2AdmissionTests.cs`、`BomberM2AutomaticWarmupTests.cs`、`BomberM2PairedRestoreTests.cs`、`BomberM2ProducerEnvelopeTests.cs`。工具原`bomber-config.test.mjs`和`capture-basemap.test.mjs`复用，不把旧拒绝默默换成无验证接受。

### 全生产者、寿命和待出版上界清单

以下是必须证明的集合，不是已批准数字。所有毫秒统一SDK Tick有效值，checked arithmetic；概率只影响实际随机，不降低最大量。不能把global全局发行数当每弹历史容器数。

| owner/producer | 三档发行或关键界线 | 寿命与同时保留项 | 最低证明 |
|---|---|---|---|
| 初始积木/箱/桶 | 初始138/206/299可破坏物；非桶reward按真实row Maximum求和 | accepted+unpublished+unknown，≤128Nativeinit分批、完整binding；每代mint1 | 原始Nativebase匹配后所有产物Original接受，失败不前进 |
| 再生 | first8、stop105排他：13波；2/3/4组，最多104/156/208格 | 软/区域箱/桶互斥，一个完整组；active桶+pending共4/8/8；queuedunknown不得占用两遍 | 不折概率，桶不足回普通分支；实际Native收入只计一次 |
| 三级资源奖励 | initial + 全13波最坏row；gold family共享 | pending接受债、地面实体、held skill、死亡转移共同credit | 无格/disabledconsumer/kick债+跨局都可表示或施加可证明backpressure |
| 普通/六形态炸弹 | P=8/12/16、最大placements、Fuse/Danger/slack；Remote库存跨life，Fire有效Burn，Split母/子 | 同一participant库存、不因死亡重新mint；额外子弹、保留sourcebomb的Native事务、barrelpromise | 不按Remote8s或unknown假定释放；死亡/过期/拒绝一次释放 |
| Frenzy | 一次供给糖，但允许合法author更多source时公式全计；每Participant同时≤6，≥5Tick | extra Standard、1200ms+danger/slack；跨life已出版+unpublished reservation；免疫fullLife | 当前29测试复用，12/16同Tick容量one-below及unknown/retire加测 |
| 桶 | 初始4/8/8 + regenerated替补，始终active+pending不超额 | 100ms delayed触发+继承Bomb结构、Native拒绝/unknown/代际退役 | 桶零reward；被旧source死亡不丢归属；多来源只接受一个触发 |
| 冰桥 | 水格+接受freeze形成；无刷新，8s | live boundbridge + pendingfreeze/melt，fire优先，同格全部未爆弹灭一次 | 销毁inventory/Frenzy credit和旧generationreceipt安全 |
| 强箱 | 19 size>1段应5；27应6；23需独立段表；每段一次 | 三独立族，绑定terrain+promise+未落reward | current≤5 guard与27设计需对齐；每弹contact52有独立Native历史证明 |
| Supply | 19=0，23/27=11；skills-off9 | 50/60一次；fullpool；最多11promise，地面/held/换出/死亡债 | 当前混来源问题先真实复现；位置不足不丢；paired restore不重复 |
| Favorite/留火/火墙/有限GAS | 各实际enabled技能/角色level的durations和发行 | 区域过期还可能待结构退役；finiteeffect tick/correlation/death闭环 | 不能靠表`enabled`假设已支持；六形态owner提供最终proof |
| 成长/死亡/继承 | 初始基础wealth+全部发行credit；转移不mint | 旧life债可能跨局；Pending+Placed=Selected | cap703与shared1607语义不同；正常生产界或实际反例，不能synthetic704代替 |
| 下一局/结果/地形清理 | 同room two results、最多32行；全map体素清理 | 旧未出版债、旧native事务、旧effects/bombs不能污染新代 | generation/source全匹配，循环清理+新Warmup接受后Running |
| 公共快照记录 | 完整全部cohort+最长合法opaque/strings+GAS/nativepaired | 活体+pending+unknown+retained历史共同存储 | 真实Capture/Restore字节、限制不变；旧release兼容或明确不兼容策略 |

当前Legacy公式可复用，但必须将`A*initialSoftMaximum`改成/扩展到真实M2初始reward和实际生产者集合；current terrain-only budget明确不承诺simultaneous M2。旧1607只覆盖42具名Legacy，不能直接宣布P16/27安全；旧global245/333也不是perBomb contact最终结论。具体cap必须来自上述真实发行/lifetime/retirement/producer-support域，不能先填方便数字再改测试。

### 第一轮必要 RED（必须到达被测行为）

1. 保留完整approved complete29身份，在隔离树fresh build；旧Ledger/完整声明/generated原像冻结。跑现有105预算、seeded4、round4和各producer窄测试确认baseline。GAS启动前置失败单列环境/SDK缺陷，不算玩法RED。
2. 三档正式Reader+base+startup自动准入：期望明确受支持的19/8、23/12、27/16、4min，当前首先按非Legacy守卫真实失败；分别one-below每类派生cap、客户端/服务器profile错配、map错配、P/size非支持tuple都保持拒绝和零状态变化。
3. 自动Warmup→Running：只给合法profile/seed/SDKRestore底图，不手调Configure。实际WorldManager Tick直到所有soft/wood/iron/gold/barrel Native Original接受；验证138/206/299、箱额度、桶4/8/8、mirror/plaza/spawn/bridge、elapsedWarmup不得越过pending。真实partial/refused/repeated/unknown receipt恢复后，cursor/identity不重发。当前至少23/27准入未到达，需先补合适业务RED并保留该前置失败。
4. 13波完整再生：8s之前0、8s正确、104s末波、105s不再发行；每波2/3/4四格组；强制合法作者概率覆盖全部三个产品，桶满额回普通；wholegroup任一格不合法/距玩家或bomb<3则不发行，不额外mint。用正式producer/Native完成，不注入假成功。
5. 强箱与Supply：三档实际段表，27第6个preview强箱；19无Supply，23/27 50/60一次11或9，完整六pool和真实consumer；当前skills-on RED保留，恢复后的新版旧字段来源不能混合。
6. 同room下一局：真实首局结束→10s podium→6s结果→新generation自动Warmup→Running；第二局新的seed/layout，保留两局结果；没有publication前discard旧Supply/Death/Terrain debt；旧native/bomb/GAS迟到facts对新局零作用。当前已有19 Native两局可复用，新增23/27 fulltuple与geometry验证。
7. pairedCapture/Restore：初始尚未接受、初始部分接受、待供给创建、再生待接受、桶触发等待、金箱第一族hit、death旧body销毁/继承、下一局cleanup各真实可公开checkpoint；World+Native同步边界，unknown创建不得伪装为合法公开Capture。逐Tick canonical hash/一次发行计数一致，完整实际字节和原始文件收据保留。
8. seed1–100三档Native几何/出生矩阵，再做完整四分钟整局和8Bot30min。静态300layout不能代替300Native；若Runtime/Owner恢复故障阻断，记录最早真实失败，不改assert或删case。

## 最先可独立实施的互斥切片

| 顺序 | 可独立切片/文件所有权 | 可执行测试 | 依赖/边界 |
|---|---|---|---|
| R1 | Supply换出糖来源修正：仅`Gameplay/Abilities/PickupAbility.Server.cs`+新增`BomberSupplyExchangeProvenanceTests.cs` | 合法完整随机池中找到实际enabled结果的固定seed，经真正Supply publisher→GAS拾取交换→同实体普通来源→无旧供给重复统计；Capture/Restore；原skillson RED不删除 | 小而可独立。不能手spawn供给糖伪通过、过滤6pool；与kickconsumer不得并行写同文件 |
| R2 | RingPoison真实GAS producer：新独立effect/system文件和独立测试，必要catalog/declaration由集成owner合入 | 圈外1s、max6/12/16等比例、5×5段点2、内外反复、Bubble/Protected都不免疫、自杀因果、一次death/results、finiteeffect恢复 | 复用唯一WorldTick与GAS事实，禁新shadowtimer；与combatowner协调，单独证明可先于M2准入 |
| R3 | 端侧canonical pickup kind及Supply/Frenzy投影：`Client/UI/Spectator/PresentationDump.cs`、`Client/Presentation/src/replica-{adapter,events}.ts`和对应契约/tests | 实际kind6/7 dump adapter映射，unknown拒绝；Room状态/事件驱动50/60UI，extra弹marker与until，实际浏览器收据 | 与R1/预算域文件互斥；root端侧代理可直接拥有 |
| R4 | 完整再生issuer：`BomberRegeneration.Server.cs`及新独立promise/test；最终TerrainTransactions由唯一owner串行接入 | 第4节完整13波/三个产品/整组额度/unknown与Original矩阵 | 依赖桶/箱promise复用与预算; 不提交soft-only M2宣称完成 |
| R5 | 三档开局/预算整包（上面brief） | admission/Warmup/one-below/fullrecord/nextmatch真实RED→GREEN | 共享声明/表/生成物由一个owner；最后才打开默认23/12；保留旧合法UGC来源边界 |
| R6 | Kick Qualification消费/必转移完整链 | 发糖→claim→被动能力→重复留地→死亡唯一保护drop→无格durable→successor+restore | 与R1 Pickup、Death、schemas共享，串行；不能只把CanMaterialize放开 |

首轮建议R1、R2、R3并行，各文件集互斥；R5先做失败测试和完整producer envelope，随后按依赖串行合入共享writer/表/生成物。不要一开始移除M2守卫或大范围改容量。

## 上游故障与未完恢复

1. 最新进度checkpoint93仍以完整approved complete29 / Game31 / Scene31 restart03为真实现场基线。真实 `DS_FATAL` Tick16838：`Death structure intent no longer identifies its live old body`（checkpoint82），死亡/继承恢复ADR142仍Draft/Owner pending；客户端deathchain12还有`inbound_queue_full 256/256`。不得因本报告有局部GREEN宣布现场已恢复，也不得自动批准Draft。
2. `rename:os5` 已找到transient openfile/pendingdelete并加bounded retry，完整29已包含；早先Defender直接因果未证明。这是已修窄问题，不应重新当当前持续故障。
3. Runtime Task1 `ef2f5674` clocks/replay及Task2 Model `214a08f1` Native/ECS恢复仅窄范围接受；最新Client17预测恢复尚无新完成包、Game/Scene发布或新浏览器运动通过。不能向正式树混入Task1/2 DLL，候选只整包选择。
4. GAS full999=998过/1败/0skip、raw2（StructuralScratch12706 vs12070，636差）仍有单assert是否迁移的用户/Owner裁决，不能拿998作为全GREEN或自行降门槛。历史terrain31间歇Native HFSM状态/OOM亦必须保留最早失败来源；后续真实重跑的窄修复不外推M2。
5. Supply unknown creation夹具是明确corruption fixture，不是公开CommandsCreate/Capture合法边界。三档完整World+Native pairedRestore、多producer同Tick、旧deathbody/finiteeffects、清理后新generation和boundedqueue共存仍需真实checkpoint证据。
6. ADR0049 freezeEligible=false候选/旧schema恢复承诺与Owner gate尚未用完整三档证据关闭。旧cap5原像是可复用基线，不代表当前52能透明恢复旧canonical容量；不得改公共decoder、伪造oldSnapshot或直接扩大公共limits。

本报告给出固定源码事实、保留的真实失败和独立实施边界；完整101迁移验收仍需新的三档正式生产/恢复/表现收据。
