# Favorite Fire 完整行为草案独立审查

结论：**REQUEST_CHANGES，当前候选不能放行到生产验证。** 找到一项会阻止真实世界初始化的预算声明错误、一项同时阻断Region/Aura真实自然到期的ordinal判据错误，以及一项必然失败的事件目录断言。审查者没有修改 Gameplay、Tests、Tools、生成物、schema、Runtime 或配置；没有运行 .NET、官方 GEN、Native、formatter、stage 或 commit。所有新增运行时测试仍为 **UNRUN**，以下静态问题不冒充实测 RED。

审查范围是完整行为实现，而非先前 Fire flag 窄审查。输入报告 SHA-256 为 `843220a51c9d6f34c67a3cbbfacca9d1735abc96f24795d7e24bf25f113fe06e`，manifest 为 `5fa10fe79af49d45a1f5ac55abd6a2128ecd5c061c6da2e112c750b061261b2d`；两者实际哈希一致。已读父仓 core/nav/架构/测试/风格、101 core/nav/测试/风格、完整用户附件、相关 design/Stage0 kernel 及 ADR0046/47/48。审查所读规范和正式 Runtime 源码身份见 `.run/favorite-fire-behavior-independent-review-01/review-evidence.json`。

## 必须修复

1. **[P1] 新 reducer 的 `MaxWrites=48` 无法通过正式 Runtime 启动校验。** 位置：`.run/favorite-fire-behavior-implementation-draft-03/BomberFireZoneLifetimeReducer.Server.cs.draft:9`，循环在第16行，Applied 分支写两次。Exact07 的 `EffectOperationValidation.cs:234` 对 `EffectPlanBound.Results` 使用完整配置 `ResultRecords`，在第241–243行乘以子循环结构写入上界；第45–46行拒绝超过 program.MaxWrites 的程序。类型、完整句柄、Outcome 条件不会把该静态循环上界缩成参与人数。当前 Game `BomberConfigBinding.cs:145` 给 P8 配置360个结果，因此该程序结构写入下界为720，超过48；拟议704个结果时为1408。正式 `EffectReducerPlan.cs:110` 在每个 reducer 绑定时执行该校验，不能以实际每 Tick 最多3P次业务写入绕过。使用正式生成诊断修正声明、字段写入上界、work/scratch/bytes与共享上限，或改成 SDK 支持且确实有静态界的 owner 遍历形状。新上限只能在完整生成/启动证据后配置。同一次704扩容还会使既有 `BomberFireReducer` 结构上界从 `2P+5×360=1816` 变为 `2P+5×704=3536`，而候选仍声明1816；该联动同样必须处理。不能只调新 reducer 的48。

2. **[P1] Region与Aura的外层 `r.Ordinal != 0u` 会丢掉每一次真实自然到期。** 位置：`BomberFireZoneLifetimeReducer.Server.cs.draft:26` 和 `games__101-bomber__Gameplay__BomberFireReducer.Server.cs.draft:56`，均在上述draft-03目录。Exact07 `FiniteEffectSettlement.cs:94` 明确调用 `Result(world, row.Slip, EffectResultKind.Terminal, EffectResultOutcome.Expired, 0, occurrence: row.EndTick)`；第150–156行将该0原样放入EffectResult，不是缺少回执。当前两处外层guard同时包住Initial和Terminal，因而永远到不了各自Expired分支。10112实际row退场后，区域仍是LifetimeOutcome3；下个Advance的RequireActual会抛错，Native不会7002，整施放lease无法释放。单独修区域也不够：10111的真实Expired仍被丢掉，完成110次发行后的lease始终EndRunning，并永久阻塞Results。控制请求在同文件第36行生成`lastOrdinal+1`，Initial admission也生成非零ordinal。把非零检查放到Initial/Control各自分支，自然Terminal允许SDK实际0；同时保留完整句柄/source/target/AppliedTick和EndTick关联，不能改成缺行推断Expiry。必须跑真实1000ms Region与5500ms Aura自然到期、Native leaf、完整110次后释放和Results回归。此 finding 经读取正式Runtime源码独立确认，尚未执行运行时用例。

3. **[P2] 新目录有62行，测试仍断言60。** 位置：`.run/favorite-fire-behavior-implementation-draft-03/games__101-bomber__Server__Tests__Gameplay__BomberEventContractTests.cs.draft:75`。候选 catalog 在第27–28行增加两个 Typed descriptor；测试下一行已把 Typed44改为46，Derived14和Excluded2保留，合计62，但 `Assert.Equal(60, rows.Count)` 未更新。保留完整目录、类型唯一性和旧项检查，把总数与新增的精确两行一起更新并跑该原测试。此项是源级确定矛盾，没有声称已执行测试失败。

## 源级审查结果

| 边界 | 审查结论及限制 |
|---|---|
| 全施放预留与唯一所有者 | closed JSON lease 在 Aura Apply 前持久化 Prepared/Submitted，成功才绑定实际10111句柄；实体承诺按完整施放时长计入共享账，Unknown不补发、不释放、不滚动删除旧行。CanReserve/Prepare/Bind/Emit/Published/FindByZone 的完整身份与ordinal关联一致。仍须证明真实结构排队和字节/驻留上界。 |
| 实际目标、类型与注册 | Region Awake 使用已附着实体的完整ID，Native kind7 Start后正常提交零 magnitude10112；实体声明增加 AttributeComponent/EffectComponent。Game-owned10112与映射10124是 Root 的历史身份审计分配；此审查不重新分配身份，也不宣称尚未生成的注册已通过。 |
| Tick 与结果顺序 | Aura slip 早于区域 slip，phase9 initial处理后区域CanSettle查真实Favorite parent。BombSystem Advance 位于旧业务结果消费后、ConsumeAura和FireExposure前，能先捕获2及4/5/6，再由既有消费清0。初次ordinal0与后续精确 owed Tick、无catchup的设计一致。 |
| 期限与 Native | UntilTick来源是完整10112 Initial Applied结果；Expired分支设计完整，但F2外层ordinal判据挡住真实Terminal，当前不会置4或发7101/7002。Removed/Suppressed没有伪装Expired；缺实际行保留债并抛错，未从缺行推断到期。10111 terminal分支允许既有Outcome0，但同样须修复F2；控制Removed/Suppressed明确区分。 |
| 死亡、后继与原身份 | 正式死亡owner在Destroy前写SourceTerminal；停止后续区域，Applied区域不要求旧Life继续live，不改绑CurrentLife。ZoneSources自免比较确切SourceLife，旧Life自免不会给予新Life。历史Participant/Life/generation/match/chain均持续保留。仍须跑同Tick与真实后继用例。 |
| 恢复 | OnHydrate验证存储并由WorldRuntime确认所有lease/已发行ordinal；paired restore从真实恢复行读取新WorldId，保留instance/generation与原payload，不重Apply。runtime-only活动恢复由首个正常Tick的RequireSupportedResume拒绝。源级路径一致，真实paired Native/GAS恢复未运行。 |
| 共享伤害 | 新ZoneSources加入既有Burn/Aura稳定排序、选择来源与连续暴露时钟；10110仍是唯一伤害请求/真实receipt/facts/统计路径。zone/source/result/exposure引用在整施放退休前检查，源切换不重置连续暴露。没有引入第二份Health账或第二Tick循环。 |
| 地形与 Ice | 普通砖/炸弹/掉落不会因区域直接写入或爆炸。留火按相同mask进入现有Bridge melt owner，保留完整原来源cause；持久MeltRequested/cause可在Unknown、区域真实Expired后继续hold source。原Native transaction/Original receipt、绑定代数、全部Fuse熄灭与一次返还是既有owner，未旁路。 |
| 可见范围与客户端 | RegionCoverage是正式形状判别，mask0仍为空；C# exposure/Ice/Bot共用九位decoder，TS投影共用对应decoder，既有renderer消费decoded cells。Aoi/Persist来源与mask候选已检查；legacy line保留原解释。born/expired携带完整原Life与interval，实际浏览器/Observer同步尚未验证。 |
| Results与退休 | Results停止继续发行；Prepare和Reset等待lease、result/source及地形债；区域只在实际Expired/NativeExpired且引用全部释放后整体Destroy，随后才释放owner。不存在按投影时间强删10112或在下一局抹掉待结果区域的路径。 |

## 容量与生成门

当前静态 guard 会拒绝LiveRows24的Favorite，这是候选明确的失败关闭，不是可玩实现通过。192 live/264 pending/456 identities/192 due/704 results是下界建议，不能自动放宽当前配置。可达Aura时长来自真正角色BoundLevel及对应有效SkillLevels；5500ms在20Hz为110 Tick，P8整施放880 credit，不能拿不可达6500ms level3算1040，也不能因重叠或1/6周期折扣。保留旧336墙包络且没有独立公开FireDash生产者时取max；未来启用独立墙生产者须求和。

owner-codec-shape-proof记录的是ASCII模型字节计算（其文件当前为5017/16384），不是CLR serializer或世界快照证据；10112的160字节也是有限payload的静态布局计数。正式GEN仍要证明codec、reducer程序、字段上界、operation/work/scratch与全体注册。其余生产者的同Tick pending/control/fact共存、880个保留实体与Native快照的实际world/order/residence/byte预算仍待 Root 完成；不能用 scalar proof 代替。特别是第一region在Awake才提交10112：只检查静态EffectLimits不足以证明Aura接纳后一定有其child slip的位置，必须补真实紧容量公开准入和完整生产者共存证据，或使用已有正式可证明的预留接缝。此项是现报告已列出的未证门，不把未证自动称为已复现缺陷。

## 测试、原断言与文件保护

独立轻量 Node 审计实际通过：24/24当前before fence、24/24保存原文、32/32候选after哈希、24/24正向patch及逆向还原、6/6输入fence与2/2报告/manifest anchor；详见 `fence-and-inverse-audit.json`。8个新目标检查时均未发布。原region Fact与bundle副本逐字节一致，SHA-256仍为 `e85a764c375124f7acd15e6cf5e37fd45eb2863ec4c58efcf52545c28ce4c3aa`。diff中唯一替换的旧断言是目录Typed44→46，属于新增行的精确期望；没有删除Fact/Theory/InlineData或其他旧断言。总数60未同步属于上述F3，不能把“保留”写成通过。

Root告知的exact07完整包manifest已独立核对为 `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`。Root提供的当前原105/105、Strong11/11、原Favorite GREEN及不变e85真正producer RED，仅是原源码/既有步骤证据；审查者未重跑，不能覆盖这32个新候选。既有Fire flag窄审查批准也不扩成此行为包批准。

本包包括保留的1个region Fact、17个followup Fact和1个4行Theory，以及TS decoder与2处现有投影集成测试追加，**全部UNRUN**。正式验收仍需不删原断言地跑：完整110 cadence、移动/冻结mask、empty Applied、实际Expired+Native leaf、Removed/Suppressed区别、slot exchange、closed corruption/reentry、源死亡与真实新Life、paired/runtime-only恢复、共享pulse/switch、Results debt、零普通terrain副作用、真实freeze/melt优先、Unknown Original/重复回执与ordinary/Remote/Frenzy全部Fuse库存守恒。补充未写完整的公开紧GAS/whole-credit拒绝、8人饱和、受支持callback/structural Unknown注入、CLR/snapshot UTF8界，以及原PublicAura/Fire/Ice/Successor/round/client全量回归。不能将CanReserve直接调用当作公开能力准入试验。

规范符合性：源级架构形状总体遵循唯一World Tick、真实GAS/Native、持久有界规则记忆、唯一地形结果owner及生成纪律；**质量门因F1/F2/F3拒绝，实测门尚未满足**。修复三项并取得Root实际官方生成/容量/真实测试证据后，交新fence继续独立审查。审查者在这里STOP并释放并行槽，不发布生产代码。
