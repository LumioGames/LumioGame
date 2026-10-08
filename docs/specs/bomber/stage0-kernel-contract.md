# 体素炸弹人 · Stage 0 内核契约 v3

> **状态**：设计中，v3.0.0 草案；接口尚未冻结。
> **适用范围**：101 上引擎的 A 内核、B 决赛圈与材质、C 可关闭角色技能、D 只读浏览器旁观；12 人/23×23为默认，16 人/27×27为对照，8 人/19×19为迁移回归。输入来自真实 C# 客户端/Bot。
> **上游**：[`design.md`](design.md)、[`0045 · 引擎工作区`](../../../.spec/decisions/0045-101-bomber-engine-workspace.md)、[`开工计划 §3–5`](../../../.spec/archive/plans/2026-09-27-101-bomber-engine-build-prompt.md)。公共语义仅消费架构仓 `LumioGameEngine` 的 `bomber-slice.md`、`ecs.md`、`tick.md`、`movement.md`、`gas.md` M2–M10、`voxel.md` M6–M8 与 ADR-064。
> **冻结门**：按[最新收敛计划](../../../games/101-bomber/.spec/plans/2026-09-28-prototype-convergence.md)重对三档接口、身份、配表、底图与完整生产预算；真实 SDK 编译、DS restore、各档真实客户端准入及 §9 未决项收口后，经 PR 合入 main 并登记冻结清单。旧8 Bot登录仅为骨架回归证据。本文不沿用旧壳的 v2 哈希，不把 API 存在或草案写完当作验收；freezeEligible 仍为 false。

## 0. 范围与生效依据

本次授权把 design 原阶段表中分期的 A–D 同批实现；C 必须能独立关闭。当前范围包含动态心数/金心/Boss、三级资源箱、23/27中央补给与狂暴、五角色、一槽六形态与最爱、护城河/冰桥/桶、Bot分层和结果高光。24/48/100 人、更大分区地图与分区小补给箱、中途加入补偿、存档重启、账号成长、可玩浏览器与真人外测不在本轮。浏览器只旁观，输入与预测宿主归 LumioClient；禁止在浏览器复制 TS 规则。

规则以design当前正文及ADR0034–0048为依据，重叠条款以较新ADR优先，尤其0047取代旧五种、三级冰冻和续期中毒口径，0048收口三档地图与交互边界。M1原型已有内容、M2已定设计、正式生产实现与真实验收分别记录；下列规则均是待实现/待验证的要求，不是通过声明。所有候选数值引用design相应节或所列ADR，性质仍为推断待验证。

| 依据 | v3 消费的有效结论 |
|---|---|
| ADR [0021](../../../.spec/decisions/0021-bomber-contract-v2-align-engine-second-exemplar.md) | LogicTransform、GAS、唯一 WorldManager.Tick、引擎体素；旧伪 API 与旧壳哈希不作为当前实现依据 |
| ADR [0025](../../../.spec/decisions/0025-bomber-final-circle-and-death-drops.md)、[0026](../../../.spec/decisions/0026-bomber-small-map-regen-and-resource-trigger-gate.md) | 最后一命、死亡掉强化、19×19 再生、资源触发晚于再生停止；胜负采用0031，局时/再生停止采用0035 |
| ADR [0028](../../../.spec/decisions/0028-bomber-hats-are-powerup-count.md)、[0029](../../../.spec/decisions/0029-bomber-death-drops-blast-protection.md) | 帽数只读强化级数；无独立帽子资源；死者掉落短时防爆 |
| ADR [0030](../../../.spec/decisions/0030-bomber-characters-exclusive-skills-and-combos.md)、[0034](../../../.spec/decisions/0034-bomber-character-balance-round-1.md) | 选角、绑定专属与共同基础属性保留；角色技无等级值取0034一级值，三槽/等级/旧组合退出M2 |
| ADR [0031](../../../.spec/decisions/0031-bomber-final-circle-to-one-cell-last-survivor-wins.md)、[0035](../../../.spec/decisions/0035-bomber-pacing-final-circle-at-two-minutes.md) | 四分钟封顶、115秒圈、1:45停再生/最晚2:05开圈；1×1、末段清场、存活优先与同Tick并列 |
| ADR [0032](../../../.spec/decisions/0032-bomber-movement-dual-direction-and-doll-footprint.md) | 双方向、四向加停、点在通道中心线、玩家互不阻挡；视觉占地不等于碰撞箱 |
| ADR [0036](../../../.spec/decisions/0036-bomber-acceptance-d-player-enters-ring-on-time.md)、[0043](../../../.spec/decisions/0043-bomber-bot-tiers-kill-juice-highlights-new-acceptance.md)、[0044](../../../.spec/decisions/0044-bomber-m1-playtest-adjustments.md) | D为12/23、种子1–100、脚本玩家按时进圈、前3≥50%且K/D≥1；菜鸟阵容、目标限制、五角色/飞踢、非默认踢弹、结果高光 |
| ADR [0037](../../../.spec/decisions/0037-bomber-hat-tower-capped-at-four-with-count-badge.md)、[0038](../../../.spec/decisions/0038-bomber-direction-b-growth-brawl-pillars.md)、[0039](../../../.spec/decisions/0039-bomber-hats-give-hearts-and-gold-hearts.md) | 成长爽局；最多画4顶帽+真实计数；帽子/金心升心、最高8心、Boss阈值6心、圈毒按上限等比 |
| ADR [0040](../../../.spec/decisions/0040-bomber-27-map-16-players-tiered-rings-supply.md)、[0042](../../../.spec/decisions/0042-bomber-moat-and-explosive-barrels.md) | 三圈资源、分档圈表、一次中央补给、狂暴；取消溺水，护城河/陆桥/冰桥/爆炸桶 |
| ADR [0041](../../../.spec/decisions/0041-bomber-one-special-bomb-slot-five-kinds-favorite-bomb.md)、[0047](../../../.spec/decisions/0047-bomber-m2-six-bombs-and-fixed-skill-values.md) | 一个特殊炸弹槽、六种等权、角色技不入池；冰冻2秒/鸭最爱1秒、中毒4秒两跳且不续期、袋鼠最爱穿透成功飞踢CD3秒 |

三档模板与边界引用[ADR0048](../../../.spec/decisions/0048-bomber-m2-map-packages-and-interaction-boundaries.md)，源表/SDK实现尚未验收。组件、实体、事件与表源落 `games/101-bomber/Gameplay/`，系统按 Sample 放根下 `*System.Server.cs`；测试源码落 `Server/Tests/Gameplay/`，测试工程落 `Tools/`。引擎唯一来源是只读 `Engine/` 发布物；旧 `modules/server-gameplay/.../Bomber/` 随迁移删除，不保留转发、条件编译或第二套规则。

## 1. 世界模型、单位与身份

| 对象 | 正式表示 | 不变量 |
|---|---|---|
| 地面、铁皮、硬砖阵列、积木、护城河与陆桥 | 引擎体素，行为读表 | 不存业务数据，不维护第二份常驻地图 |
| 对局与决赛圈 | World CS 实体上的组件 | 无 LogicTransform；圈边界为规则区域，不是地形 |
| 玩家、炸弹、强化/血包/特殊炸弹/金心/狂暴/罕见踢弹糖 | CS实体 + ObserverComponent + LogicTransform | 位置只有一名 Transform 写者；组件不另存 Cell/Pos 真值 |
| 三级资源箱、强力宝箱、爆炸桶 | 占格体素；需要命中/延迟/归因时配CS规则实体与Native稀疏绑定 | 计数、来源与计时不进方块，位置只来自绑定；成功事务后才发行奖励/完成破坏 |
| 冰桥、中央补给 | 冰桥是地面体素+绑定规则实体；补给阶段/发行记忆归World组件 | 冰桥到期/融化来源与补给一次发放均入有界快照；不能用渲染计时或第二地图推进 |
| 光环 / 火墙 | 光环归施放者GAS状态；火墙为有界CS区域实体 | 覆盖范围不以体素承载；光环本体零写格，留火接触冰桥的融化交唯一地形写者；光环随人、主人死即止，已有火墙到期才止；不按每格建实体 |
| 爆炸画面、帽塔、光柱、领奖台演出 | Client Local实体；HUD为产品UI | 不参与权威规则、复制、存档或StateHash |

炸弹自身持有爆炸态与实际四臂长度，不另建爆炸实体。旧 `BomberHatPile`、对应实体/事件/过期配置全部退出；稳定ID进入tombstone，不复用。

实体身份统一 `NetEntityId`，完整保存 `(InstanceId:u64, Counter:u64)`，同步使用 `Sync<NetEntityId>`。JSON/日志文本使用引擎 `ToHex/TryParse`；禁止 `ulong *Raw` 截断或JS Number。无身份用正式空值。参赛者与当前生命实体分别关联，死亡换实体仍保留归属/统计/排名并使用引擎绑定；具体重生/rebind路径必须真实验收。

时间为 `ulong Tick`，血量为半心点，属性与修饰量为 `long`，概率为整数千分比。正式 C# 直接使用引擎 `(X,Y,Z)`：水平面为 XZ，地面/砖层索引为 Y=0/1，玩家/炸弹位置在砖层格心 Y=1.5（由层号+半格生成）。设计文档旧水平 XY 对应正式 XZ，旧高度 z 对应正式 Y-1；不把旧坐标命名复制进正式类型。所在格用数学floor推导，负坐标不能截断；事件 `BomberCell(X,Z)` 只表示发生时快照。

毫秒仅经 SDK `Ticks.FromMilliseconds(ms,hz)` 转Tick，沿用截断语义。20Hz下125ms与100ms均为2Tick，150ms为3Tick。Tick频率只从配表来源生成/核验世界声明，不在两处维护常量。

### 1.1 基础属性、库存与动态心数

采用 `[DeclareAttribute("Name", Persist = true)]` 与AttributeComponent；HealthPoints另声明 `IsLethal = true`，初值由 `IAttributeSeedProvider` 消费 `World.GameplayConfig`。Base遵循Scope.Owner/Persist规则，Current为Scope.Aoi推导值、不落档。本轮不承诺存档功能。致死声明仍须核对上游生成注册与结算实际消费，不能把声明存在当作跨零实现已通过。

| 属性 | 初值/用途 | 写入约束 |
|---|---|---|
| HealthPoints | 初始6半心点；按当前生命动态上限封顶 | 伤害/回血及上限增加时的新心补满均经Effect改Base；不挂持续血量Modifier，Base=Current |
| BombPower | 2，每臂格数，上限6 | 强化/死亡转移改Base |
| BombCapacity | 1，引信弹容量，上限6 | 强化/死亡改Base，不随放弹减少 |
| AvailableBombs | 1，可消耗库存 | 放弹消耗、离开Fuse恰好返还一次，不与容量混账 |
| MovementSpeedMilli | 3500千分格/秒，上限6000 | Base由速度强化档表生成；护城河在移动求值时乘700‰，冰桥不减速；M2无麻痹 |
| SpeedTier | 0，速度强化级数，上限8 | 强化/死亡改Base，不从封顶速度截断反推 |

来源：引用design §7.1/9.1/10/12；数值是设计的推断待验证值。完整速度档 `3500,3850,4200,4550,4900,5250,5600,5950,6000`，末级仍是一颗糖。初速变体由同一base/step/cap生成档表。

`HatCount=(BombPower.Base-initialPower)+(BombCapacity.Base-initialCapacity)+SpeedTier.Base`，只读派生，默认上限17；放弹、库存返还、水、角色技、特殊炸弹、血包、金心、狂暴均不改帽数。帽王为帽数最高且≥1者，并列保留现任；无击杀铸帽或帽子发行账。

每个当前生命的上限为 `6+2×min(2,floor(HatCount/4))+2×min(3,GoldHearts)` 半心点，封顶16；金心最多3颗。跨帽阈值或取得金心时，上限增加量同时补入当前血量，新心为满；存活期间上限不下降。Boss为当前上限≥12点，形成/倒台由权威状态与真实死亡产生，不用帽王身份代替。死亡先冻结该生命的心数/归属与统计，再转移强化和全部金心，后继生命按保留强化重算上限并满血重生；出局强化/特殊炸弹/金心全掉。金心不算帽子，死亡转移不新增发行，落地同享3000ms防爆。动态上限/金心的声明表示须经身份ledger、属性结算和快照验证，不在此臆定新属性ID。

库存须与尚占容量的引信弹对账；容量下降不能凭空销毁已放炸弹，超容量时不能再放，返还不能超当前容量。容量降低/归属/重生的精确结算顺序列入冻结用例。常规死亡每级强化独立按500‰转移，出局为1000‰，掉出量=扣除量、最低保留初值。

### 1.2 待生成的字段与唯一写者

这是接口草案清单，不声明源文件已存在。每个字段在生成声明中必须明确Scope/Authority/Persist；派生值仅由唯一写者投影。

| 组件/载荷 | 字段组 | 写者/范围 |
|---|---|---|
| BomberMatchState | MatchId/Index、Seed/ConfigIdentity、人数/地图profile、Start/End/PhaseEndTick、Phase、HatKing/Winner:NetEntityId、EndReason、SurvivorCount；补给预告/开启与一次发行记忆 | Match/HFSM；Room；无位置的世界实体，MatchTick仅由世界Tick派生 |
| BomberFinalCircleState | TriggerTick/Reason、Initial/RemainingResourceCount、RegenStopTick、Current/NextStage、Bounds、Announce/EffectiveTick、PoisonPoints | FinalCircle；Room；无位置的世界实体，资源数由成功体素结果改变 |
| BomberPlayerState | 参赛者/生命关联、RespawnAtTick、ProtectedUntilTick、EliminatedTick、预排一次重生资格、Facing、NextCharacterId、GoldHearts/动态上限/Boss投影 | Life/属性结算/输入动作；生命Aoi/选择Owner/预排资格None；不另设独立IsDead或第二血量账 |
| BomberBombState | 完整Owner/来源Life、FuseEndTick、Power、ChainId、BombKind/穿透模式、母弹命中族、遥控归属、狂暴标记、Exploded/DangerUntil/BurnUntilTick、四臂Reach、Phase、Kick方向/速度 | Bomb/Explosion；Aoi；命中/宝箱接触共享族与库存返还记忆None，不另存位置；集束不另造爆炸格实体 |
| BomberPickupState | Kind、特殊炸弹形态、DroppedBy、SpawnTick、ProtectedUntilTick、换槽落地的离格拾回限制 | Drop/Pickup；可见种类/保护Aoi，竞争/转移/离格记忆None；普通掉落无过期 |
| BomberSkillState | CharacterId、绑定角色技、唯一特殊炸弹槽、最爱条件、罕见踢弹资格、CooldownFrom/UntilTick、Bubble/Aura/Frozen/Immune/Toxin/Frenzy投影、LastDamageTick | GAS Ability/Effect/Tag；冷却Owner、可见状态Aoi；毒Effect/来源Life/解毒帧门与狂暴并发/间隔记忆有界None；禁止手写计时字段替代duration/period |
| BomberChestState | Required/RemainingHits、Phase、PendingTransactionId、已命中BombId集合 | Chest；计数Aoi、事务/去重None；位置由绑定给出 |
| BomberFireZoneState | Owner/SourceSkill、From/UntilTick、方向及有界范围；暴露计时 | Skill/Fire；可见范围Aoi，运行计时归实体/Effect |
| 地形规则载荷（待ledger定名） | 箱等级/独立命中、桶触发来源/ChainId/到期、冰桥到期/融化请求/绑定身份、成功结果关联 | 唯一地形规则写者；记忆None/Persist，可见阶段按复制需要投影；计时不进体素 |
| BomberResult/Statistics | Participant/Life、Rank、Survived、FinalHats、EliminatedTick、Character、Kills/Bombs/Destroyed/Pickups/BestChain/PeakHats/PeakHealth/HatKingTicks/SkillCasts、特殊形态/最爱取得、Boss击倒/金心/绝境逃生高光依据 | World有界结果列表；结算冻结后不被下一局覆盖；高光不改名次，本地最佳不作为账号真值 |
| BomberWorldRuntime | HFSM快照、帧初照片/本帧写集、待结果记录、Tick随机流、日志缓冲 | World归属None；有界，不用静态字典藏跨帧真值 |

ID registry须包括实体/组件/字段/Ability/Effect/Tag/事件与tombstone；本文不臆造数字ID。完整声明、生成注册表与hash是§10冻结物。

### 1.3 有界规则记忆与配置预算

按[ADR0046](../../../.spec/decisions/0046-bomber-bounded-rule-memory.md)和[design§7.6](design.md#76-旧-1919-首轮对象预算与规则记忆)使用组件所有的 `Scope.None` / `Authority.Server` / `[Persist]` 规则记忆，保持§6既有快照哈希公式。Bomb按完整Participant去重，保存命中Life/generation及pending/applied，另有最多H个Chest接触记录；Chest保存最多RequiredHits个完整BombId和一个原样string事务引用、MatchId/SubmittedTick。来源Life销毁后仍保留原来源元组，结果不得改绑当前生命。具体字段须经生成及真实SDK快照验证才冻结，容器声明本身不证明有界。旧19/8容量不是12/23与16/27的生产容量。

旧19/8最低容量公式为：炸弹P×Q×(F+D+B+S)，掉落A+4×O×(floor(max(0,M−C−L)/R)+1)+H×K，墙P×每人每Tick最大墙施放数×(W+S)。符号/来源与旧profile包络只在design§7.6维护；共同供给2784/698/336为S=2条件下的历史推断值，不能只把P改成12或16便用于M2。三档全有效overlay须重新覆盖三级箱/再生、金心/换槽/死亡转移、一次补给、狂暴并发及持续发行、遥控8秒驻留、集束母子共享命中族、兔最爱/熊留火、桶连锁与再生、冰桥及融化结果、中毒Effect/延迟结果；每个生产源明确数量、最长寿命、预留/转移/释放与失败边界，未知来源、容量不足、checked溢出在准入前拒绝。首轮验证加载拒绝与算术；生产规则另证同Tick链闭包、跨生命Q、有限驻留S、零丢失预留/转移及真实结果关联。不得删旧物、截覆盖或丢已接受结果来过预算。计数有界不宣称SDK不透明事务字符串字节有界。

Periodic/Duration表中的设计数值可保留。按收敛计划2026-09-29检查点，T/P/F裁定与Engine Effect合同已合入，Runtime生产实现、声明消费、失败映射和发布验证仍须逐项收口；合同/oracle通过不能代替真实生产证据。D1两阶段拒绝不得让新请求挤掉已生效周期的执行/结果预算。不得因预算使用wall_ms，就把对应GAS运行时语义视为已冻结。部分活动局恢复必须拒绝，隔离组件snapshot fixture不构成存档功能。

## 2. 输入、GAS与Native HFSM

### 2.1 输入形状

使用SDK `AbilityType<TInput>` 与 `IAbilityInput.Write/TryRead`，Bot重用同一编码；公共信封、sequence、错误码只消费引擎生成物。

| Ability | 输入 | 判据 |
|---|---|---|
| Move | PrimaryDirection、SecondaryDirection、TurnPressed | 四向+停；新方向优先、旧垂直方向候补，反向不能候补；规则层判滑行/避险；LogicPredict |
| PlaceBomb | 空结构 | 最近合法格心；库存走消耗步，水/同格/死者/冻结/泡泡走正规准入；失败不扣；缓冲归Ability；LogicPredict |
| Pickup | Target:NetEntityId | 自动走过触发；服务器复核距离/上限/唯一特殊槽与一次占位、离格拾回限制；AuthorityOnly |
| UseActiveSkill | 空结构 | 当前角色的绑定主动技与Facing决定行为；闪现无落点/飞踢无目标不进CD；不自造预测 |
| 遥控引爆意图（游戏Ability，身份/编码待ledger冻结） | 正式输入表达放弹键长按≥300ms；点按仍为PlaceBomb | 只引爆本人存活遥控弹并入同链；用真实输入Tick判断，不采信浏览器墙钟、不新增公开Engine API或玩家按键 |
| SelectCharacter | CharacterId | 入场与下一局选择分开，结算修改仅下一局生效；AuthorityOnly |

正常移动、闪现、重生共用一名Transform写者。Facing取最近非停主方向，撞墙或实际沿副方向滑行仍取主方向；冻结中不更新，开局/重生朝下。客户端UI不先读地形裁决。

枚举保留完整历史账本：既有BombKind的标准/冰冻/火焰/穿透/分裂/中毒/麻痹身份、Cause及PickupKind旧值不能重排或复用。M2活跃内容为标准+六特殊形态，中毒沿用原身份；麻痹、旧等级/三槽/组合及溺水生产者退出，删除身份进tombstone，历史fixture只作显式迁移/拒绝测试。遥控、集束当前语义、第五角色、金心/狂暴/罕见踢弹糖、冰桥/桶及新事件均须由schema ledger核验后声明和生成；原型NON-CONTRACT数字不得直接充当正式ID。本文不分配新数字；游戏内容枚举不等于Engine公共错误码。

### 2.2 唯一Tick与状态迁移

`WorldManager.Tick()`为唯一Owner Tick；生成registry登记系统，业务仅使用引擎允许的ApplyInputs/ProcessorPlan面。不得在Tick前后手调规则、另建loop、私插提交/OnFx相。系统声明Reads/Writes/After，不靠集合遍历顺序。

状态迁移使用 `NativeHfsmDefinition/HfsmSnapshot`，Compile→Start/Send/Stop；Native决定迁移，C#给guard、持快照、执行plan actions。Effect帧排期遵循gas M9，Native宿主节拍计时器不能当buff调度器。

| 机器 | 状态/迁移 |
|---|---|
| Match | WaitingForWorldReady→Warmup→Running→FinalCircle→Podium→Results→下一局Warmup；restore/pin/初始化写成功才入场 |
| FinalCircle | Inactive→分段Active/Preview→Finished；段表产生事件，不手写Stage++迁移 |
| Bomb | Fuse.Stationary/Kicked→Danger→可选Burn→Expired；Fuse可到Extinguished；离开Fuse action恰好返还一次 |
| PlayerLife | Alive.Protected/Vulnerable→Dead.AwaitingRespawn或Eliminated；预排重生回Alive.Protected；GAS状态不复制成第二套效果机 |
| Chest | Closed→OpeningPending→Opened/Disposed；拒绝返回可接受下一次合法行为的状态，不自动重跑失败Tick |
| Pickup/FireZone | Available/ClaimPending/Consumed/Destroyed；Active/Expired；同样走HFSM |
| 资源箱/桶/冰桥/补给 | 命中开启、触发等待/爆炸、结成/融化、预告/一次发行的迁移同样由Native决定；体素结果与规则记忆一致后才能推进，不以手写倒计时机替代 |

业务计划消费已完成体素结果与上一Tick死亡结构工作，再处理圈/再生、炸弹/连锁/伤害请求、拾取竞争和写集合并；引擎提交相真实结算。圈生效与输入/效果等边界顺序须用生成计划与fixture锁定，未决面见§9。

### 2.3 伤害与死亡边界

- 爆炸、圈毒、暴露火伤、中毒均提交瞬时Effect请求，携带完整目标/来源和类型参数；不预扣血、不猜击杀，不再产生溺水伤害。
- 游戏提供不存在/已死/对应免疫等资格判断，不能假设通用引擎内置Health或死亡规则。提交相按单序在Base上结算；跨零为击杀单，后续尸体单拒绝、不发DamageApplied。
- 同弹同Participant一次，记忆归炸弹/母子命中族实体；集束母子合计一次、同族对宝箱合计一次。每个ChainId按受害当前动态心数上限限制预留及实际伤害。BombId/母弹族/Owner/来源Life/ChainId必须保留，禁止把关联塞FxKey/Magnitude或全局队列猜顺序。
- 伤害先结算，冰/毒仅作用幸存者。PlayerDied/Eliminated逻辑Tick取真实跨零Tick；销毁/掉落/重生结构动作下一业务帧下单，不以观察Tick冒充致死Tick。
- **决赛圈存活≤1必须在致死同一Tick权威结束**，同Tick全灭并列第一。此要求不因结构晚一帧而放宽；合法结算后接缝待审计，不得私插第9/10相或延后一Tick假通过。
- 泡泡/重生保护挡爆炸、火、冰，不挡圈毒；被保护挡下的中毒弹不挂毒。放弹/光环解除重生保护；泡泡中放弹被拒且不解除泡泡。中毒始终归首次成功施加实例的原投弹者/炸弹/生命，重复命中不换来源；圈毒按自杀。狂暴仅免疫本人狂暴弹，不推广为对他人伤害无敌。
- duration/period、Tag到期、刷新/移除/抑制按gas M3/M9与ADR-064既定语义；发布实现不足交上游补齐，不以永久Modifier加每帧Clear替代。

## 3. 角色、技能与流转

五角色为兔回春/鸭泡泡/猫闪现/熊光环/袋鼠飞踢，基础属性相同；角色技绑定、不掉落、不替换、不进入任何掉落池、无等级。HUD为角色技+唯一特殊炸弹槽；旧三槽、Lv1–3、配方/合成与麻痹不进入M2生产路径。罕见踢弹糖提供无槽被动资格，不是人人默认能力，也不恢复第三技能槽。

特殊槽空则放标准弹；槽空走过即装，同种不拾取且留地，不同种立即换上、旧物原样落脚下，离开该格前不捡回。换槽属于财富转移，不能双持、复制或在预算失败时丢旧物。常规死亡特殊炸弹500‰落地，决赛圈出局全掉；角色技不掉，特殊炸弹不计帽。死者强化/特殊炸弹/金心均有3000ms防爆。

来源：积木与外圈木箱只出糖/血包；铁箱500‰特殊炸弹+1糖，金箱必出1特殊+2糖并200‰金心；强力宝箱1特殊并200‰金心；23/27中央补给2特殊和1金心。六形态池内等权，每次奖励数量不因第六形态增加。按ADR0048，积木及木/铁/金箱的随机糖果位以3/100替代为踢弹糖，明确指定的宝箱/补给强化位不替代；不新增奖励数量，不进入六形态池。重复资格不拾取；死亡失去并一次掉出，3秒保护，无落点保留pending，后继Life不继承。

| 角色技 | 无等级数据与行为（引用design §8.4/12、ADR0034/0044/0047，推断待验证） |
|---|---|
| 回春 | 每连续20000ms未掉血回1点，之后每20000ms回1点至当前上限；任何掉血重计 |
| 泡泡 | 持续3500ms，CD14000ms；挡爆炸/火/冰、解毒、不挡圈毒；期间不能放弹，按放弹不解除 |
| 闪现 | 最远3格，CD10000ms；铁皮前最远合法空地，可越积木/资源箱/弹/桶/宝箱、可落水；无落点不进CD |
| 光环 | 持续5500ms，CD16000ms；随人3×3除砖，连续暴露1000ms伤2点、离开重计、本人免疫；本体零写格、不引爆、不毁糖，主人生命结束则停止 |
| 飞踢 | 面朝相邻静止弹或隔一格且中间空地的静止弹；无目标不进CD，成功CD4000ms，持穿透弹成功时3000ms；取成功时槽位并固定，后续换槽不改已有CD；不要求目标弹属于本人或为穿透弹 |

| 特殊形态 | 无等级数据与行为（引用design §7.3、ADR0041/0047） |
|---|---|
| 火焰 | Danger后留火1500ms，连续暴露1000ms伤2点；火焰弹/留火可融冰桥 |
| 冰冻 | 爆伤后仅冻结幸存者2000ms；同弹伤不解除新冻结，后续伤解除并免控1000ms；覆盖水格结冰桥8000ms |
| 遥控 | 点按放置，长按放弹键≥300ms引爆本人遥控弹并入同链；8000ms兜底自爆；狂暴额外弹独立为标准形态，不产生狂暴遥控弹（ADR0048） |
| 集束 | 母弹每臂末格最多一个子弹，500ms后火力1十字、同链同主人；母子共用同弹命中族/宝箱一次接触；不占普通库存、不计帽、不可踢，落水熄灭 |
| 穿透 | 真实摧毁成功后按剩余射程继续；金箱首次独立族命中仍阻断，第二独立族成功开箱才继续；母子同族不重复。铁皮不覆盖而停，桶触发后挡住，水覆盖后停（ADR0048） |
| 中毒 | 直击2点后幸存者中毒4000ms，施加后2000/4000ms各伤1点、可致死；每生命至多一个实例，重复只结算直击，不新增/刷新/延长/换来源；泡泡/血包/死亡清除未来周期 |

最爱只改角色技条件，不恢复合成：熊持火焰时光环经过格留火1000ms；鸭持冰冻时破泡冻周围8格敌人1000ms（与冰冻弹2000ms区分）；猫持遥控时成功闪现瞬间引爆本人遥控弹；兔持集束时每次实际回春回血在脚下开集束花，四相邻格各一次火力1爆炸且不伤自己；袋鼠持穿透成功飞踢CD3000ms。熊留火随覆盖产生有界区域，主人死后已产生留火仍到期才止；重叠光环/火墙沿ADR0046共用暴露、稳定来源和快照规则，不按覆盖倍增伤害。

两种踢法共用8000千分格/秒、滑至障碍前一格、玩家不挡、正常引信照走、入水立即熄灭与一次返还；踢不改炸弹主人/形态/击杀归属。集束子弹不可踢。

中毒按ADR0047消费Engine既定相序：同Tick首次A/B命中按确定性提交序只有首个成功实例；末跳/到期Tick新命中只有直击，原实例末跳后移除，下一Tick才可重施加。应跳Tick解毒在period前提交抑制/移除，本Tick无周期伤害且不接纳新中毒；满血有毒可消耗血包只解毒。每个实例用完整Effect身份关联原来源和目标生命；A旧结果延迟消费仍恰好记账，但不得清除/续期/改归属到B新实例或后继生命。

Flag关不授角色能力、罕见踢弹资格或特殊炸弹，不发行相应拾取、不执行角色技/遥控/最爱条件；角色仅外观，A/B成长、圈、资源箱、补给/狂暴等非C范围照常。C专属奖励不发行，不擅自补成另一种财富；开/关各自重算生产预算并跑完整局/回放。

## 4. 对局、圈与下一局

数值引用design §4/5/13、ADR0035/0039/0040/0044，均为推断待验证默认值。三档封顶240000ms，余115000ms时间触发（开局125000ms）；再生提前20000ms停止（开局105000ms）。资源触发只在停止后检查：成功结果确认的积木+三级资源箱剩量严格小于初始200‰，再生计回剩量；桶/强力宝箱不混入该计数。提前触发时EndTick=触发+115000ms。

| 档位 | 相对触发的生效秒:边长 | 强力宝箱数 |
|---|---|---:|
| 8/19回归 | 10:13、35:9、55:7、75:5、95:3、110:1 | 5 |
| 12/23默认 | 10:15、30:11、50:7、75:5、95:3、110:1 | 5 |
| 16/27对照 | 10:19、30:13、45:9、60:7、75:5、95:3、110:1 | 6 |

每段提前10000ms预告，115000ms终局。5×5/3×3/1×1生效时仅清圈内积木与资源箱，不掉落、不计破坏；铁皮/桶/强力宝箱/糖/未爆弹保持。清场批量写，不能把计划冒充成功；地图/宝箱/桶布置共同保证1×1每局可进入。毒圈零写格，每1000ms伤 `ceil(段点数×受害当前上限/6)` 点；5×5前段点数1，之后2，重生保护/泡泡不免疫。

除1×1段，每次预告在下一圈内落1强力宝箱；不落中心，3×3段前还避5×5中心十字。三个独立BombId命中开启，同链独立弹分别算，集束母子合算一弹；同弹持续火焰只算一次。实际拆块/解绑成功后喷火力/容量/速度/血包各1，C开再加1等权特殊炸弹，另200‰金心。OpeningPending/拒绝/重试沿ADR0046有界记忆，不双发。

23/27中央3×3广场的补给在开局50000ms预告、60000ms开启，每局仅一次：糖5、血包2、狂暴糖1、特殊炸弹2（C开）、金心1。延迟/重复事件与体素拒单不能重复发行，失败后依持久发行记忆保留未转移财富；19回归不开中央补给，未引入分区小补给箱。

狂暴吃到即按当前动态上限回满并持续6000ms；额外标准形态弹同时最多6颗、爆后可补，相邻放置至少5Tick，每弹引信1200ms、不继承特殊槽。到期停止新生产，在场弹保留期限和原来源，自免绑定投出时完整Life、持续到弹退场；新Life不继承。Participant并发账跨生命保持，死亡/换槽/到期不提前退款，已狂暴时重复糖留地。与普通库存/帽数独立，不得把6误作全期总发行数（ADR0048）。

进入圈后新死亡不复活；此前预排一次重生保留、落当前圈内。新人锁入旁观，退出算出局。排名：唯一存活第1；时间到存活者按帽数；出局者均在其后、出局越晚越前；同Tick出局/同帽存活并列跳号1/1/3；最后一批同Tick全灭并列第1。完整ID仅决定同名次排版。

MatchEnded冻结 `sole_survivor/all_down/time_cap`、EndTick、排名与统计，随后领奖台10000ms、结果6000ms、下一局。重置动态地图、实体/状态/统计，沿用或应用新角色选择，保留房间/连接。选角不暂停房间；下一局Warmup开始时采纳当时已提交选择，晚到输入留给再下一局，见design §8.0；禁止客户端墙钟推进世界。

## 5. 配表与变体

`Gameplay/Tables/{schemas,tables,registry,profiles}`源表→LumioConfig双端投影→只读Reader，启动装载、帧内不可变。数值列须记录单位、visibility/sharedPrediction、来源分类/出处；身份/枚举不是调参数值。

| 表组 | 必须覆盖 |
|---|---|
| match/attributes | 20Hz；12/23默认、16/27对照、8/19回归成套profile；240000/115000/10000/6000ms；基础属性/速度档、动态心数/金心/Boss；design §4/7/10/12/13 |
| movement/bomb/life | 吸附500/重复250千分格、连续窗口/转角缓冲、输入125ms、引信2100/危险400ms、伤2点、重生/保护各3000ms；design §6/7/12 |
| drops/skills | 积木按圈250/350/450‰（19旧回归300‰按profile显式隔离）；死亡强化/特殊500‰、出局1000‰、金心全掉、防爆3000ms/闪烁800ms、回血2点；§3五角色/六形态/最爱/稀有踢弹，不含等级配方；design §7–9/12 |
| map/regeneration | 两层、初始积木/箱/桶合计≤650‰潜在格、出生距威胁6格/L安全3格、掩体路径10格、潜在26–30格/人/初始≥9；三档水28/44/60、硬柱48/80/104；8000ms间隔与2/3/4镜像组、目标初始600‰、距威胁3格、停前20000ms；每组先1/32桶、其余1/6箱；ADR0048与design§5 |
| block_catalog/material_behaviors | uint32 BlockId、官方目录/材质/资源、walkable/placeBomb/destructible/blastStop/coverBeforeStop/residue/dropPool/groundEffect；只用正式转换函数 |
| circle/chest | §4段表、触发/预告/毒速、命中数/落点禁区/战利品；design §4.2 |
| resource/supply/frenzy/terrain | 三档木/铁/金箱8/4/4、12/8/4、16/12/4，命中1/1/2，圈界按ADR0048；50000/60000ms补给与一次奖励、6000ms狂暴/并发6/间隔5Tick/1200ms标准弹；冰桥8000ms不续期，桶初始/同时上限4/8/8、火力3/延迟100ms；design§5/8 |
| bots | 四行为与rookie/easy/normal/hard/player；默认11 Bot按7/6/2权重缩放，16档15 Bot为7/6/2；rookie反应10–16Tick/每3Tick决策/噪声300‰/放弃进攻500‰/不用技能/逃生余量0/250‰看小火力/300‰冒险拾取；normal技能200‰；真人软目标只允许最近2 Bot，除真人帽王或3格内外加6分惩罚；全部入表 |
| presentation/acceptance | 视觉700/前伸350千分格、最多4顶帽/真实徽章、Boss常驻心条、两格HUD、连杀/高光、镜头/音效预算；D/E/五角色/三档稳定性门；design §9/13/15/17 |

旧原型的每象限木箱3–4/小水塘3–4格/水域跨度3格不能覆盖M2护城河与分档资源设计。有限穷举出生搜索、最近可通行格散落与零消耗水上放置拒绝继续有效；无候选保留待出生/待转移资格并下一业务帧按当前图重查，不无限换seed或重放拒单。三档须证明密度、连通、镜像、出生安全和1×1可达；23档沿用旧柱阵再加约8%水会使密度不足，不能放宽26格/人的门。

### 5.1 历史变体与当前迁移

既有16核心变体是旧骨架回归清单，保留名称仅为追溯，不是M2可启用profile，也不要求新集合恰为16。每个数值A/B profile仍只改一个独立键/单元格，生成依赖值不算第二个调参项；三档组合是范围profile，不能伪称单参数A/B。

`fuse-1800`、`fuse-2400`、`power-1`、`speed-3300`、`speed-3800`、`respawn-4000`、`match-360000`、`match-480000`、`protect-1500`、`protect-2500`、`protect-4000`、`drown-2s`、`danger-300`、`danger-500`、`buffer-100`、`buffer-150`。

其中溺水、旧局时以及旧等级/麻痹/合成候选不得进入M2默认或有效生产overlay；保留历史身份与显式迁移fixture，重生成前由源表迁移清单逐项记录保留/退出/替代、出处和新预算。本文不把已有生成物重命名为已完成迁移。

### 5.2 design新增对照

| 组 | 相对默认的候选值 | 来源/约束 |
|---|---|---|
| 手感/演出 | cornerAssist400；podium6000 | §6/13/15；可跳过另作产品行为对照 |
| 圈 | duration90000/140000；latePoisonPoints1/3 | §4/15；[源表说明](../../../games/101-bomber/Gameplay/Tables/README.md)已解释段表换算：首个预告/生效段保持10000ms，后续时点在剩余圈时长内按比例缩放并截断到20Hz Tick边界，均早于新终点；90秒变体不保留110秒末段。数值仍推断待验证 |
| 流转/生存 | deathDrop300/1000‰；deathDropProtect2000/5000；基础心数2/3、每3/4/5帽加心、金心上限2/3；fireExposurePoints1 | §7/8/12/15；动态公式与来源联动，不退回全员固定maxHealth |
| 技能 | 回春16/20秒、每次1/2点；泡泡持续3000/3500/4000ms、CD12000/14000/18000ms；闪现CD8000/10000/12000ms；光环持续4000/5500ms、CD16000/20000ms；铁箱特殊概率300/500/700‰ | §8.4/15、ADR0034/0047；只作有来源的候选，保留无等级结构、六种等权与固定中毒边界 |

局时当前默认240000ms，design§4/15的对照为300000ms。回春默认20000ms/1点，旧`regen-5000`及10000ms默认不再代表当前设计。新增候选须有来源、验证目的与完整生产预算；源表尚未迁移不能宣称上表已可运行。`skills-on/off`是独立范围profile，两组均完整跑局/回放。报告注明实际Tick，不能宣称100/125ms在20Hz窗口不同。

## 6. 体素结果与确定性

作者工具经引擎写格再捕获19/23/27各档底图，只含地面/外圈/硬砖；DS仅restore。每局积木/三级资源箱/护城河/陆桥/桶、再生和圈清场由Gameplay按档位和种子批量写体素，冰桥结成/到期/融化为运行时地形事务。记录源表、catalog及产物hash，不用原型数组或手改快照替代。

帧初一次批量读覆盖两层，pin就绪才运行；帧内只用照片与有界工作集，不逐格往返、不读未提交写。帧末合并去重、同格一条，expected revision取帧初。下一业务帧消费成功结果才结算砖毁/资源/掉落/统计/宝箱；拒绝不发收益、不fault世界、不自动重试旧命令。事务身份与幂等去重必须可追溯。

普通弹遇铁皮不覆盖、软砖毁格后停、水覆盖后停，连锁弹不截断传播；穿透越过的软砖格计Reach。滑行弹进入已有危险火焰仍立即连锁，不照搬原型运动豁免。水上手动放弹准入拒绝且零消耗、不发BombPlaced；已存在的弹被踢入水则熄灭并在离开Fuse时返还一次。

护城河三档半径3/4/5、4中点陆桥与长度2/4/6的镜像阶梯支流，精确模板见ADR0048；不封出生/路口，水边有陆路，支流不连外墙。冰冻覆盖水格从成功提交Tick起结桥8000ms，重复冰冻不续期；可走/可放弹且不减速。火焰弹或任何留火可提前融桥，标准/冰冻Danger不算融化源；同Tick竞争融化优先，旧代数回执不可改新桥。融化成功后该格所有未爆炸弹（含静止/遥控）熄灭并各返还一次名额。结/融沿批量事务，拒绝不改地形；每次写入≤实际覆盖水格，满火力至多24格，计入A8与新预算。

桶在19档每象限外圈1个，23/27档外/中圈各1个；同时活动与预留上限4/8/8，再生概率与组数按ADR0048。首次合法爆炸触发后100ms以火力3十字并入原ChainId，击杀归触发者，来源全身份不能改绑新生命；火焰/冰冻继承，其余形态为标准。只触发一次、无掉落，旧退休结果不释放新代名额。可引发后续桶/弹连锁，不能丢已接受结果限流；地形成功和延迟触发须由真实事务/Effect/HFSM证明。

RNG使用 Runtime `DeterminismContext.OpenRngStream(streamId)`，正式入口已找到，不列缺口。固定seed/tick/schema epoch/streamId与消费顺序；同一工作单元复用流，不能每抽一次重开同名流。禁墙钟、无种子Random、原型PRNG和全局随机状态。

回放包采用破坏性新 `schemaVersion:3`，旧Raw身份输入不得静默读取：

- `scenario.json`：GameRelease/Engine manifest、schema/registry hash、config/profile/hash、seed/mapSeed、底图快照与完整地形内容hash、动态初始化结果、world/instance身份、Bot表、durationTicks；回放不重新生成历史地图。
- `commands.ndjson`：tick、完整participant/entity身份、sequence、AbilityId与正式输入(含主/副方向)，只录实际提交输入。
- `statehash.ndjson`：逐Tick `SHA256(manager.CaptureSnapshot() || 初始地形内容hash || 各Section(key,revision)稳定排序编码)`；固定世界身份与编码，不让不同内容同revision假相等。

两次独立真实运行逐行比；空/缺帧/截断/篡改或输入/配置/底图不符均FAIL。表现关闭不改hash。日志走引擎日志组件输出logfmt，工具可转报告/NDJSON；不再造公共网络包。

## 7. 事件、结果与旁观

游戏事件公共载荷为MatchId/Tick/EventSequence与typed payload，身份128位；网络经生成组件/ClientRpc和引擎复制流。事件是变化记录，当前状态从复制组件恢复，晚加入不重播旧爆炸。

| 事件组 | 必含信息 |
|---|---|
| BombPlaced/Exploded/Extinguished/Kicked | BombId、Owner、ChainId、类型、发生Tick/格/四臂、库存关联 |
| DamageApplied/PlayerDied/Respawned/Eliminated | Victim、Killer/Source、SourceBomb/SourceSkill、ChainId、Cause、HealthLeft、真实结算Tick；拒绝不产伤害 |
| PickupSpawned/Taken/Destroyed、PowerupsDropped、特殊炸弹换槽/金心转移 | ItemId/Kind/形态、DroppedBy、数量/保护截止、旧槽落物/离格限制、扣除与增加账关联 |
| HatKingChanged | Previous/New完整身份、派生帽数，不铸帽 |
| Boss形成/倒台、金心拾取/掉落 | Participant/Life、当前/峰值心数、形成/致死Tick、击倒来源、金心持有/转移账；Boss与帽王分别判定 |
| MatchStarted/PhaseChanged/Ended | seed/config、阶段/截止Tick、EndReason/SurvivorCount、不可变排名/统计 |
| Circle/Ring/Brick/Chest/Crate事件 | 阶段/范围/生效Tick、事务结果、圈/资源箱等级、资源数、独立弹/母子命中族与战利品；开始/预告/收缩/清场/再生/开箱可对账 |
| 补给预告/开启、狂暴开始、冰桥结成/融化、桶爆炸 | Match/绑定身份、一次发行关联、准确Tick/格/期限、完整来源/ChainId、并发/库存类别与事务结果 |
| 角色技/最爱/遥控、Healed/Frozen/Poisoned/Cured | 角色/技能/唯一特殊形态、目标/来源/Effect完整身份、dueTick、原因、生效/到期/治疗量；无M2升级/合成/麻痹事件 |
| 连杀里程碑/高光/本地最佳 | 源死亡/连锁事件序列、本局完整Participant、候选依据、卡片分配、旧/新纪录；表现派生与权威统计标明，不能回写名次或模拟 |

遥测按design §17.1逐项映射，补给/狂暴/Boss/金心/特殊炸弹/冰桥/桶/高光均在本轮；旧溺水/麻痹/合成退出生产，身份不可复用。强化、特殊炸弹、金心分账记录发行/持有/地面/转移/毁损，死亡转移不新增发行；来源按箱等级/补给/宝箱/死亡区分。所有事件是待声明的游戏语义，正式ID/Schema由ledger与生成物冻结，不为文档覆盖制造空事件。

日志验收要求按引擎既有日志契约消费：`BomberMatchState` 的 `Component.Log` 类别为 `Lumio.Bomber.Gameplay.Contracts.Components.BomberMatchState`；CoreCLR provider 把 category 与格式化文本送入 Native mailbox，期望 DS 输出 `lang=cs target=<类别> tick=<记录帧> world=<实例> msg="..."`。游戏标记 `event/roomId/matchId/gameTick/eventSequence` 位于 msg 内层 logfmt，event 使用 snake_case；world/tick 来自真实世界日志作用域，gameTick保留事件实际逻辑帧，不能假定宿主应用帧与业务逻辑帧相等。工具先校验外层类别/语言与非零world，再只解析该msg；不在任意日志文本中搜索事件。Native文本上限240字节（包含类别），`truncated=true` 或同一事件身份冲突均使证据失效。完整typed载荷的分段与重组须在第二轮遥测实现中保持同一Stamp并验证不截断；当前工具解析不表示发射端已完成。

当前完整开发包的真实 DS 证据尚不满足上述元数据要求：run08 的 HFSM 启动日志外层为 `world=0 target=-`，类别留在 msg 的 TAB 前缀内，且托管预截断使超长原文可能没有截断标志。B-00143 跟踪 NativeCore 共享渲染、Server 数值 World scope 与 Engine 托管载荷三处既有实现修复。该日志证明两台 World 机器启动；八 Bot 准入独立通过，不能据此验收完整局遥测。HFSM 内层 `owner` 指完整实体身份，外层 `world` 才是数值 World 实例身份。

D只读复制快照/变化：三档地图、五角色/技能、动态心数/Boss、三级箱/补给/狂暴、六形态/四臂、冰桥/桶、掉落保护、帽王、圈、冻结排名/高光/下一局；GameSource替换local-host，不import `prototype/src/sim/`。Bot仅读自己可见复制状态并发Ability输入，禁止读DS内存或反射宿主Manager；真人软目标身份由宿主明确指定，不从快照猜。

表现要求引用ADR0037/0043/0044与design§9/13：帽塔最多4顶，超过显示真实×N；Boss常驻心条，身体只加高不扩大脚圈/前伸。默认跟随、V切俯瞰；旁观没有本机玩家时明确选择跟随对象，不暴露该对象Owner冷却。位置音效4格内全音量/约14格外静音、他人放弹只6格内轻响、只本人脚步、四总线与世界约−6dB、同时爆炸最多4声并合并。70ms定帧/最后一杀600ms慢镜只改渲染时钟，可降到0，不停World Tick。

8秒窗口的双/三/四杀与暴走、不死连杀3/5/8、首次5/8连锁从真实事件去重派生；他人三杀及以上/高阶连杀同样带名字全场播报，双杀只挂击杀栏。结算每人1张高光，候选为最长连锁/最多击杀/帽王最久/拆迁王/Boss猎人/1心存活/金心收藏/拾取最多；按相对突出项尽量不重复，人数多于8仍须100%覆盖且不改排名。个人最佳仅浏览器本地、读写失败可正常展示；没有本机参赛者的旁观不能把跟随者结果写成本人的最佳。

## 8. 验收与四轮证据

详细判据见[`stage0-test-matrix.md`](stage0-test-matrix.md)。真实引擎门附命令、SHA/manifest/profile/seed与实际非零计数；缺外部依赖`BLOCKED_ENV`、exit2，不能算绿。

第一轮须真实SDK构建声明/Reader/骨架、三档DS restore/准入与接口预算准备，旧8Bot登录是回归而非全部完成；第二轮实现A–D，第三轮审查，第四轮在合入main后本地完整测试/三档整局/下一局/回放/30分钟稳定性全过才触发CI。12/23的D为种子1–100、普通脚本玩家按时进圈对11 Bot混合阵容，前3≥50%且K/D≥1；E为全normal、唯一存活≥85%、平均局长≤4分钟及1×1可达。16/27对照与8/19回归单列，不以原型数据或旧八人结果代替。文档lint或工具单测不能代替真实门。

## 9. 冻结前未决项

| 项 | 当前判断 | 收口证据/限制 |
|---|---|---|
| Bot可见状态 | 发布只读组件/位置/体素视图不足，需通用接缝 | 真实复制面完成四行为；不阻塞纯登录骨架，不许读DS替代 |
| duration/period | T/P/F裁定和Engine合同已确认；Runtime生产实现/失败映射与实际发布物验证仍待收口 | R-00799/R-00801：中毒Tick40/80、解毒帧抑制、末跳/移除/旧结果、冻结2秒/1秒分别实测；合同通过不代表接口冻结 |
| Effect typed payload/结果关联 | 完整参数/逐请求有界结果的合同已有，实际生产路径仍须独审及运行证据 | 同主人同Tick多弹、跨零、幸存状态、Cause/Chain/Effect/目标Life关联；不得用Engine oracle替代Runtime/Game |
| 同Tick比赛结束 | 产品要求与已确认合同保持；运行接线待验 | 致死Tick==EndTick、同Tick全灭并列；禁预扣/抢结算/私插相/延后一Tick |
| 生命周期/排序 | 重生rebind、库存返还、圈生效与输入/Effect边界待联测 | 完整身份、生成计划、边界fixture，结构Tick与致死Tick分开 |
| 对象预算/规则记忆 | ADR0046及design§7.6保留旧19/8预算包络、持久组件记忆与重叠火归因；新档位与生产者未重算，实现未冻结 | 第一轮验证源表/声明/生成/真实快照；后续证明同Tick Q、有限驻留S、守恒与真实结果关联；旧数值不是新档位生产容量 |
| 三档地图/源表 | ADR0048已定三圈/箱数/再生/桶概率与核心排柱；模板静态计数成立，源表/底图/多seed生产验证尚未完成 | 配表与真实SDK共同证明密度/镜像/出生/中心可达；预检脚本不等于底图验收 |
| M2交互实现 | ADR0048已定金箱穿透、踢弹糖、冰桥不续期/融化熄弹、狂暴标准形态与Life自免；尚需实现和审查 | 固化单元/SDK fixture，准入失败前预留与财富守恒均保留，不将产品裁定当实现证据 |

RNG不在缺口表。现有HFSM/批量体素/128位身份/Snapshot不能因旧v2文字重新列缺。真实验收未完成，状态持续为草案。

接缝历史证据见本地审计 `C:/Work/LumioGames/probe/bomber-engine-gap-audit.md`，当前检查点见收敛计划。R-00799承接架构接缝，R-00800承接Bot只读位置/属性/体素观察，R-00802补字段可见性/Replica Self，R-00801承接持续Effect生命周期；capture CLI已由正式SDK作者工具满足。派单、合同合入、打包与部分测试通过均不表示实际发布物完成所有生产路径，禁止据此冻结。

## 10. 接口冻结清单

| 冻结物 | 必须登记的证据 |
|---|---|
| 组件/实体/属性/容器 | 声明、Scope/Authority/Persist、ID/tombstone、生成registry、真实SDK编译 |
| 输入/Effect/Tag/事件 | 128位编码、五角色/一槽六形态/最爱/新事件的ledger及tombstone、失败/Commit/Effect实例结果关联、共享端与Bot输入fixture |
| HFSM/系统计划 | Native定义/snapshot/guard/action、Reads/Writes/After及边界fixture |
| schema/表/profile/Reader | 数值来源、双端投影/hash、历史变体迁移、新三档完整生产者/生命周期预算、skills-on/off与生成一致性 |
| catalog/底图 | 官方ID/绑定/行为表hash、三档作者底图/快照hash、真实restore/pin/初始化写与连通/密度/中心可达结果 |
| 回放/遥测/旁观 | schemaVersion3、真实输入/逐Tickhash、完整事件映射、可见性与只读GameSource |
| 第一轮出口 | PR合main、本地build/三档DS与真实客户端准入证据、未决规则/上游实现闭环、RM-00013冻结评论列文件与源hash；旧8Bot证据单列 |

当前清单未勾选、没有新冻结hash；旧v2“已冻结、无缺口、13文件sha256”不再适用。
