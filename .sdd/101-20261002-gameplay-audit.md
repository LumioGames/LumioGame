# 101 玩法恢复审计 — 2026-10-02

本次是只读代码/证据审计；只新增本报告，未修改玩法、上游、候选或生成物，未运行测试。旧测试计数下文均标为历史证据，不替代交付版本重跑。先读父仓与 101 中心/知识导航、架构/测试/工作流/代码规范，再对照 design、kernel-contract、test-matrix 和 ADR0047/0048。

## 最重要的恢复结论

**当前活动工作树不是最先进实现。** 活动树在 `feat/101-bomber-engine-foundation`、HEAD `8787797e6595a8d3d1c974680d172d8dc86f5ea4`，大量已修改/未跟踪文件必须保留。活动 `Engine/manifest.json` 是 `0.0.4-main.ecece8a` / Runtime `c65c7f80…`。`.run` 和 `C:/Work/LumioGames/probe/` 保存了在不同完整候选/发布包上实现并测试的后续结果；不能把活动树缺口统统判成从未实现，更不能从活动树重写 typed Effect、成长、地形与 Bot。

以下简称都指真实目录，除 `GTCG` 外完整最终 source 均为既有冻结物：

| 简称 | 可恢复来源 | 实际内容与状态 |
|---|---|---|
| A | `games/101-bomber/` | 当前活动旧实现；下表列出的活动缺口不代表候选缺口 |
| O4224 | `.run/effect-game-integration-fix-v1/final/source/` | Game 公共组合基线，4224 文件；manifest SHA256 `2f9df3553471255cce980ca42b7f090919403f84789368e79fbb1b758a2f9c1b`；typed Effect 参数/结果、伤害/死亡/掉落已有实际实现 |
| GHC | `.run/bomber-growth-hearts-corrective/final-02/source/` | 4236 文件；manifest `122ee51d9df4280fb7853aa5b944e3193255650d0725ead40562aff7af6c4515`；动态心、金心、Boss、真实拾取结果/发生位置、表现投影。狭窄纠正独审 SPEC PASS / QUALITY APPROVED，root 已接受供组合；共享生产 credit 未解决 |
| GT3 | `.run/bomber-terrain-terminal-corrective/final/source/` | 4239 文件；manifest `7ee12f31d98a183a0d22236a5eee28eb5e6a30a4b875ba78e7cc5f8c9eabb031`；真实 Native 初始化/破坏/箱/奖励/穿透延续；phase2 与 provisional-chest hydration 仍阻塞。原 terminal-hit P1-2 后续被裁决撤回，见下文 |
| GTCG | `C:/Work/LumioGames/probe/bomber-terrain-growth-credit-corrective/` | 从 O4224 组合 GT3/GHC 的可继续候选；BeginFrame/全部糖果消费者/预算/身份分叉已接入；死亡生产仍故意保留单独 live-count RED，尚无联合回归。未冻结、不可直接作为最终验收源 |
| GMC | `.run/bomber-movement-turn-corrective/attempt-4/final/source/` | 4234 文件；manifest `1b044ca242ecb7874d56e13d1b5e9df8231b2806a1381bcf65bcdf5a6b3d9331`；服务端连续移动/转角及 Bot 安全路径候选已存在；客户端预测尚未证明，后续 shared-authority 候选仅初始化 |
| GSC | `.run/bomber-seed-config-corrective/final/source/` | 4233 文件；manifest `d6b12d97ee0d3a1ad8d6b86a079f3dae73da935cef8b8cc20aa4cc20a88f93d0`；种子配置/真实浏览器程序集资源校验、工具预算；另有 seed-browser-admission 后续候选需按链取最新 |

表中 `.run` 全部以 `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/` 为根。上述 O4224/GHC/GT3/GMC/GSC 的实际测试发布包是 P04：`C:/Work/LumioGames/probe/effect-delta-release-04`、版本 `0.0.4-main.54930d9`、manifest SHA256 `5a5f34f5d8d7c8708009b9f29c8d091deb6b73799ae3939dbde932ec548300f6`。**不能拿它们的成功计数说明活动 ecece8a 已集成/已通过。**

## 可组合补丁与精确接续点

1. O4224 相对最早 4189 的完整补丁是 `.run/effect-game-integration-fix-v1/complete-task3-against-4189.patch`，SHA256 `6ec04520094e9b596e0b706a28cfb4f30978fd6ce48cf2b07428135a7c6c9799`。不要仅取最早 effect-game-integration.patch，后续死亡掉落身份/落点修复已在此完整补丁。
2. GHC 相对 O4224：`.run/bomber-growth-hearts-corrective/final-02/original4224-to-final.patch`，SHA256 `bacb995a225db6a074072983135944e91f744d3e44b755d084bc19f2297f357a`。相对其 GH4231 的狭窄补丁：`growth4231-to-final.patch`，SHA256 `c23fb0c9f93a0bf947dafc13980173863814a18bc49388f6cc9f0704887ab949`。必须取 `final-02`，`final` 缺最后官方表现 bundle 重生成。
3. GT3 相对 O4224：`.run/bomber-terrain-terminal-corrective/final/original-4224.patch`，SHA256 `67cffa241a5f64667d84100896d39a8ca8a2a47d63de609ec365ccdbe2296111`。相对 GT2 的狭窄补丁 `terminal-4238.patch`，SHA256 `d805b1f8b07ca2805813b50bf18044596f187bf8a26c1c77d5e53aeb3572d9f3`。
4. GTCG 已做上述三方组合；不要再覆盖一次。完整路径决策在 `.run/terrain-growth-credit-corrective/task1-path-decisions.json`，原始与 LF 比较冲突均保留在 `naive-overlaps/`。该候选已合并 31 terrain-only / 38 growth-only authored/imported 路径；生成物统一重生而非整包覆盖。`BomberDeathDrops.Server.cs` 故意仍是 GHC 原文件，作为下一项共享 credit 的 RED 基线。
5. **GTCG 最新真实断点晚于 progress.md：** `task1-declarations-server-04.json` 和 client-01 已 exit 0；server 发生于 2026-09-30 23:24 UTC。随后 `task1-schema-union-01.log` 因 `unsupported_source_shape: Gameplay/generated/server/GeneratedEffectReducers.g.cs: complete reviewed Effect generated body` 退出。先按新组合生成形状修复官方 identity observer/验证，再继续 Task2。不要据旧 progress 误判仍在等待声明生成。
6. GMC 原始 O4224 完整补丁 `.run/bomber-movement-turn-corrective/attempt-4/original-4224-to-final.patch`，SHA256 `73e38e96002ab11674f544b9eeb2278fd75d82805044908b44a0db23aa38f812`。它同时带 Bot；只合 Game 所需共享 authority 时需按文件归属三方比较，不能覆盖 GTCG。

## 要求 → 当前活动实现 → 候选/缺口 → 修复与验收

代码行号为本次读取版本；A 为活动游戏根，G 为 GTCG 游戏根，O 为 O4224 游戏根。

| 矩阵/要求 | 当前代码事实 | 已有候选与仍需做的工作 | 必须补的实际验收 |
|---|---|---|---|
| F01/F07/F09：12/23 默认、16/27 对照、8/19 回归，完整发布物/生产预算 | A `Config/BomberObjectBudgets.cs:37,45,50` 只准 LegacyPillars/8/19；G 同文件 `:38,46` 仍保留这道门 | M2 作者地图/静态布局已有；尚无准入生产容量证明。不能仅删除校验。为所有生产源计算 lifespan/queued/debt 上界，真实 SDK 三档 Restore/准入后再开启 | 8/12/16 独立身份；多 overlay checked 失败；三档100种子地图与整局 |
| A17–21/B17–18：真实结算决定伤害、死亡与同 Tick 终局 | A `BombSystem.Server.cs:573–629` 调 Effects.Apply 后用旧 Current−2 预测事件/死亡；`BombDamageEffect.CanSettle:35` 仅 IsLive，尸体单仍可被接受 | **O 已实现** `BomberEffectBusiness.Server.cs:12–106` 预留→完整 typed Apply→Rejected/Applied 消费，`Effects/BomberDamageEffect.Server.cs` 与 `BomberSettlementReducer`/`BomberOutcomeReducer` 处理真实结果。G 已继承；应集成，不重写 | 同 Tick 3弹/8弹、动态上限、只一次跨零、拒单零事件、同帧全灭、来源Life已退休仍正确 |
| 伤害持久化 | A `EntityTypes/PlayerEntity.cs:10` HealthPoints 已 Persist=true；`Effects/BomberInstantEffects.cs:51` 改 Base | 旧“血下一帧回满”结构缺陷在活动树已修；O/G 使用更完整 typed 路径。仍须在最后包验证，不能照抄历史失败 | 伤后多 Tick Base=Current 保持、真实 snapshot roundtrip、客户端复制 |
| F02/F03：uint snapshot/hash/完整 ID | A `generated/server/BomberSkillState.g.cs:182–193,264–287` 已 UInt64 capture + checked uint restore；Pickup/Fire 同形；`BomberScalarUIntSnapshotTests` 包含 30 roundtrip +10 hash | 旧30失败不能继续判现存；生成形状已修。CaptureSync 非预测分支仍无 uint 写入，是否受真实 wire 路径影响需由当前完整包网络回归确认，不能擅改生成文件 | 40项当前包真 Native；高位/MaxValue 的真实 wire/客户端；同Counter不同InstanceId |
| A22/A27/A28：真实新Life/死亡财富持久转移 | A `BombSystem:300–355` 为反射 rebind 路径；常规死亡到3秒才创建 successor；A `:405–448` 全额保留强化、固定6血，没有掉落 | O/G `BomberDeathDrops` 与 persisted carry 已做概率掉落/次帧结构/持续无落点债务；GHC加金心全掉。真 successor 用 Runtime已完成候选经完整包接回，不保留 Game 临时反射退路 | 已故Life销毁、真实新Life/绑定、原来源弹/毒、圈前预排一次重生、无落点后重试、掉出=扣除 |
| A11–16/B01/B08/B09/B15：体素传播、破坏成功后产物 | A `BombSystem:505–532` 四臂=power且只裁边界，完全未读体素；Danger仅等到期，无后来接触扫描 | **GT3/G 已有** `BomberBlastTerrain.Server.cs` + `BomberTerrainTransactions.Server.cs`，真实 Native 结果控制阻挡/穿透延续/奖励/箱独立族。不要从 A 重新做地形 | 硬墙、软砖、箱/水首挡；拒单/Original/Duplicate/Unknown；晚入火焰；同弹/同族记忆；实际四臂 |
| F10：合法待地形结果 snapshot 必须能恢复，错误关联拒绝 | GT3/G `BomberInitialResources.ValidateMemory` 需完整箱集；World runtime OnHydrate 在 P04 按行 attach 时过早检查，valid phase2拒绝。pending chest只有已live时关联验证，存在漏验方向 | 真根因在 Runtime恢复顺序；`.run/runtime-hydration-prediction-corrective-plan.md` 已逐 caller 分析。禁止删除 Game count校验/推迟到Tick/造新回调旁路。待 Runtime两阶段hydrate候选+完整包 | valid phase2/runtime+Host dual-cut；preOriginal真实pending箱；缺/重复/错tier/错family拒绝且旧世界完整；重复restore bytes一致 |
| terminal hit“缺提交”旧P1-2 | GT3 Original退役箱后只记源弹 ContactedChests，没有退休HitBombs追加 | **已裁决撤回行为缺陷**：`.run/terrain-terminal-hit-adjudication.md` + `terrain-terminal-hit-root-disposition.json`，不新增永久历史/修改退休组件。真实terminal事实是 exact pending→Original/TokenConsumed退役→一次contact，再奖励/延续 | 补 Gold B/Wood/Iron 完整ID/tier/gen/cell/revision/交易/源族关联断言；拒单无B、A保留、独立C成功；不要把增加退休列表当修复 |
| F11/A35：共享 pickup 生产预算/无丢债 | G `BomberDeathDrops.Server.cs:85+` 仍仅数live并本地创建，G `BomberTerrainTransactions:253–258` 有 Occupied/PickupCreated 帧queued账但死亡未调用 | GTCG Task2 明确待做。统一 death + terrain pending/reward/queued credit，必要时统一同帧落点占位；不能加容量/删旧物 | `.run/terrain-growth-credit-corrective/task-2-fixture-notes.md` 已给真实Native RED方案：3金心债与终结木箱竞争exact capacity，partial landing/交换/独立重试，selected=pending+placed |
| A29/A30/A34–36：成长、满档拒绝、动态心、金心/Boss | A `PickupAbility.cs` 未拒普通满档/满血；健康Effect按静态表Maximum；HatCount读Current | **GHC/G 已有** `BomberGrowth.cs:12` 公式、`BomberHealthBusiness:27–96` 请求、`BomberHealEffect.Server.cs:15–42` 结算复核、`BomberHealthReducer`、满档拒绝、真实item位置和Boss发生事实 | 阈值3→4/7→8、0–3金心、旧伤不回满、同Tick竞争/拒单释放、受伤/死亡/新Life，真实复制效果 |
| C01/C06–15：五角色与持续效果 | A/G `UseActiveSkillAbility.cs` 仅2/3/13可用；G `UseActiveSkillAbility.Server.cs:63` 仍手写 BubbleUntilTick；`BombSystem:181` 到期清。兔回春/熊光环/冰冻中毒没有实际持续消费者 | `.run/bomber-bubble-finite-consumer-plan-report.md` 只有泡泡计划，无实现；P04缺finite。Runtime finite+successor组合候选完成后需完整包，接真实finite Effect，状态字段仅投影。兔/熊/冰毒/最爱仍需实现 | 5角色技能、Freeze40Tick/解冻免控、Toxin40/80两跳/同Tick净化/末跳、效果预算、恢复、死亡取消、五最爱 |
| C02–05：一槽六形态 | A已做一槽换弹/同种留地/离格禁止捡回，G继承；A/G ObjectBudgets 对Fire/Remote/Split强制 dormant；enum仍 ReservedFire/ReservedSplit/Shock | 不能把一槽迁移当六形态完成。Fire/Remote/Split、完整Pierce、Toxin/Frozen行为、掉落池、罕见踢资格及最爱还需按新表/预算接线 | 六形态等权来源/交换守恒；遥控长按≥300ms；集束母子族一次；skills-off完整局 |
| A01–03/A06/A10：手感、缓冲、预测 | A Move `TurnPressed`只编码不消费；Server `:50` 跨轴非中心直接false；PlaceBomb无输入缓冲；Client Move预测空 | **GMC**已修服务器连续中心接转角，94/94历史定向证据+Bot62；shared-authority候选刚建立，无代码。需合GMC，按上游prediction支持做共享求值，再做125ms放弹缓冲/战术吸附 | 10路径四朝向、全部速度干水转角、零卡Tick、预测确认/改格/拒绝、真实浏览器键盘 |
| B10–20：缩圈/毒/圈前排队重生/下一局 | A/G仍 `AdvanceMatch` 直接Phase字段定时，圈只发start、无逐stage/毒/清格；A `UpdatePlayers` 显式FinalCircle拒重生 | Native Match/Circle definitions虽有但仅Start，不能当迁移已用。需要把运行推进接Native计划、圈阶段/毒Effect/早期资源触发/强力箱、圈前预排保留 | 19/23/27阶段精确Tick、动态心ceil圈毒、最后死亡同Tick结束、同房两局状态/地图重置 |
| B20/B21：选角/下一局重置 | A选择Warmup边界已做；NextMatch仅销毁炸弹/清部分state/固定6血，不重建地图，不归零全部强化 | O/G继承部分reset/结算freeze，仍需完整生产规则接完后验证；不能凭 MatchId++ 证明下一局完整 | 每角色初进/晚选/沿用；不中断房Tick；上一局物品/债/毒/圈/资源无泄漏 |
| B22–28：补给/狂暴/冰桥/桶 | A无生产类；G虽有M2布局和桶计划字段，但活动budget仍拒M2；未发现这些完整生产系统 | 仍需完整实现，复用已批准表/ADR0048，不以地图作者摆桶代表爆炸桶已可用 | once per match补给、狂暴并发/跨Life、桥真实成功Tick与融化退款、桶延迟链与原来源 |
| D/E/实际Bot整局 | A BomberMatchScenario `:291–315` 是固定放弹/左右移动；观察assert `:96–111` 只14步基础事实 | **Bot policy/movement/trace候选已存在**；勿重写。需整合最终policy+trace+GMC，在三档真实环境跑。policy fixture不算权威执行证据 | 8Bot30min、12/23 100seed D前3≥50%/KD≥1、E独活≥85%/均局≤4min、16/27对照、完整next match |
| F04：Native状态唯一迁移 | A/G有Bomb native lifecycle；World Match/Circle Start存在，实际 AdvanceMatch仍手工字段；Life同样主要手工 | 仍须接入真实Match/Circle/Life/Pickup/FireZone等Native transitions；不能仅检查HFSM类存在 | trace必须看到实际Send/Action/快照推进，与复制phase匹配 |
| 复制journal/65536传输预算 | A journal Scope.Room SyncList，MaxEntries128/MaxEntryChars2048；Append满后去旧行。当前看不到高频真实链路最大payload证据 | container uint/owner callback/wire 和 world-change-parts 候选/报告已存在，归上游组合工作；不能只调大窗口或transport cap。GTCG保留65536限制 | 完整满场炸弹/技能/死亡journal发送、真正browser/client应用、无截断/超预算/掉序/旧爆炸重播 |

## 候选证据的适用范围

- GHC最终报告/独审有精确 final02：成长15/15、源导出表现27/27、typecheck通过；不是多人/真实browser/联合credit通过。
- GT3最终报告：focused9/9；相关111/112，唯一新Life仍失败；逐Tick raw ECS replay在65534–65537差异0/32/64/64字节，Native四对相等。不能用Native相等替换整体确定性。
- GMC报告：真实Native queued GAS移动94/94；Bot应用62/62；它明确没有完整闭环生产Bot移动/逃弹、客户端预测、真实房整局证明。
- GSC报告：真实两份seed程序集/29资源校验；最终1+9+5项定向通过；full launcher曾超时/无最终计数；不是完整Tools通过。
- Game effect O4224报告：早期全Gameplay476/474/2/0；其中SDK fixture后来12/12，真实新Life仍单独开放。不能替换成全量绿。
- 本次没有重跑这些测试；交付前应在组合后的准确源码和同一完整发布包重跑，保留实际总/通过/失败/跳过/exit。

## 建议执行顺序

1. 恢复GTCG而不是重写活动树：先修 schema observer对新组合GeneratedEffectReducers形状，完成官方reader/export/declaration二次一致性，保持全部身份分叉/tombstone。
2. 完成共享pickup生产credit与同Tick落点占位RED/GREEN、真实terminal关联加强断言；独审后作为Game组合基线。
3. 把Runtime finite+successor+hydration/prediction候选按所属仓/完整包流程接回，验证合法phase2/preOriginal restore、新Life、raw replay。不要以P04不具备能力作Game旁路。
4. 合并movement/Bot/seed最新已审候选；持续技能从已写finite消费者计划执行。继续圈、六形态、补给/狂暴/冰桥/桶及三档预算。
5. 才开启三档正式运行矩阵、同房两局、30分钟、多种子和真实browser；旧阶段“不联网/不浏览器”已被本次用户完整可玩交付授权覆盖，仍保留Engine/Runtime所有权与数据保护。

本报告可用于恢复，但不将任何未集成候选、历史计数或代码存在判成完成。
