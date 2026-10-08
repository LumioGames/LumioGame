# Fire / Aura actual production RED — 独立根因调查

2026-10-03，非作者 reviewer。**当前 Fire/Aura production 不能验收；六处可定位的生产缺口成立。** 本轮仅只读调查、保存本报告，没有执行 .NET/Native/Rust/GEN/format，没有改生产、测试、fixture、生成物或旧冻结。Goal101 未完成。

已读父仓与 101 core/nav、101 测试规范；按 `C:/Users/g923/.codex/plugins/cache/lumio-workflow/workflow/1.3.6/skills/systematic-debugging/SKILL.md` 的根因调查→模式对照→假设核验组织结论。本轮假设核验是 exact source 调用链与已有实际 RED 对照，尚无本报告建议修复后的执行证据。

## 实际证据与身份

输入均在 `games/101-bomber/.run/v14-native-production-20261003/`。独立核算 log SHA 等于 JSON 记录，raw `.exit` 等于 JSON `exitCode`，均为 **2**。

| run | total / pass / fail / skip | 实际失败 |
|---|---|---|
| fire-exposure-review-01 | 7 / 3 / 4 / 0 | 三 corruption Restore 未抛 EngineHostException；lethal 首个 health 断言 expected0 actual2 |
| fire-production-original-01 | 2 / 1 / 1 / 0 | overlapping burn 首个满秒 health expected4 actual6 |
| fire-aura-original-01 | 5 / 1 / 4 / 0 | wrong participant、wrong match 被接受为真实 live finite row；paired private Handle.World 不重绑；满秒 pulse health expected4 actual6 |

合计14 / 5 / 9 / 0，非初始化级联失败。exposure 的 gap、actual Bubble、partial paired restore 三项通过；原 Fire Native Burn 生命周期通过；Aura Initial projection/CD/解除保护通过。

log SHA：exposure `973b8b72ebcd075646e9c357404196e1a3ebf74164a9889b6907616e0abc7191`；Fire original `6010980cfdba418dd3ca142553574e8676e8f6f01979010e9524f1be8cda904b`；Aura original `99cde6e8c35bc2a781e314839800b19f0e8173fa7c7d36e6412dba1c450754c5`。

JSON SHA：exposure `698e262c053743b1c4ad95acf4d958f635e08d7d1b9b84abba4137817093e7ca`；Fire `c48b5c465d0c030d9a871e5b10c9bcce00577332fc695411eb23e906a5503130`；Aura `2c423dc21bd4c0f56d4d3d968ed70202b927b84741dbd7772725260551cea252`。

三run使用固定 build10 Game `7b850bbf9979b328f685d1769ec86aa2ee0774e3630fd82301b0addaa01fe50d`、Tests `fae681d39a68bcc40996f5745d1eec792075f0fa6285833ed2fa7b2c9e985b8d`、official06 Ecs `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`、Gas `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`。相关九源码/测试物理 SHA 全部匹配 exposure `sourceSha256AtStart`：BombSystem `96697ce0…734`、FireExposure `2050a5f3…22e`、Skill hydrate `13409d22…abd`、Outcome `835653fc…fbd`、Fire reducer `e349302f…511`，以及三个完整测试与 Aura declaration。没有用其他 agent 的新源码解释此旧二进制 RED。

Runtime 判定使用 **`C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233`，HEAD `23356eafc365c753b6e8d9987fd069815ff067ce`**。主仓当前 main 不适用于官方06；本报告最终恢复顺序结论来自该 exact checkout。

## 1. Bomb 同 Tick Native Burn 相变晚于曝光扫描

[BombSystem.Server.cs:278](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BombSystem.Server.cs:278) 先 `BomberFireExposure.Advance`，随后在287发送到期 `DangerElapsed`。`BurnSources` 在 [BomberFireExposure.Server.cs:52](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireExposure.Server.cs:52) 只接受已经 `PhaseBurn` 且 `BurnUntilTick > world.Tick` 的 Bomb。Native EnterBurn action 才写 Phase 与 BurnUntil。

令 E 为 DangerUntilTick。测试 BeginBurn 返回时 `World.Tick=E`，尚处 Danger；Enter 移入并运行正常 Manager.Tick：扫描 E 时没有 Burn source，清空曝光；同轮末尾 Native 才进入 Burn；PublishEgress 后 World.Tick=E+1。首个实际曝光遂在 E+1，满20Tick在 E+21，原 overlap 检查 E+20 时 health仍6。lethal 在 Enter 后直接读取的 FromTick 是0，因此其等待窗不是实际起曝窗，health仍2。gap/paired 测试多走4轮后才读取起点，能够通过，和此因果链一致。

最小修复：仅在现有 ProcessBombs 中，把满足原 terrain/fact/pending-hit retention 条件的到期 Native DangerElapsed/BurnElapsed 转换放到曝光扫描之前；保留官方单一 Tick、Native.Send 动作、原到期值、原保护与销毁守卫。可把同一个既有相变循环移到 Advance 前，最终 Destroy 仍确保保留真实 pending facts/source。不得写 Phase 代替 Native，不改20Tick、不调整测试 Tick、不从另一条生产路径再 Advance。

## 2. Exposure hydration 缺 empty coherence、时间及真实来源一致性

[BomberSkillState.Server.cs:13](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/Components/Bomber/BomberSkillState.Server.cs:13) 的整个校验由 `!FireExposureEntity.IsDefault` 触发，仅核本地InstanceId、非零generation/match、kind1..3与Last>=From。它不检查空源对应所有曝光字段清空，不检查时间落在 resume cut 以内，不将 Participant/Life/Generation/Chain/Family/Started/Skill 与真实 source 比较。

必须精确区分已跑与静态证据：当前相变 bug 使 corruption 的 Enter 后 Entity仍default；三变异实际创造的是 **空曝光+非零Last/Participant/Chain**，遂跳过整段校验。当前 RED首先证明空曝光不一致被接受，不能宣称它已执行非空真实 Bomb 的错owner/chain分支。修复1后，不改原fixture，三个负向将进入真实选源路径；届时现有局部校验仍无法拒绝future-clock/错误真实participant/chain。

最小修复：集中 ValidateExposure，由 Skill.OnHydrate 调用。default Entity 必须符合 ResetExposure 清零的全部曝光字段（不要清零或约束独立累计 FirePulseSequence）；非空源验证 From<=Last、Started落合法cut内且等于实际源的开始值、Last 不越 `World.Tick`/已完成 cut，并核 kind 对应真实 persisted source 的完整不可变元组。Bomb kind1应匹配实体Bomb Owner/SourceLife/SourceLifeGeneration/Chain/BombKind/DangerUntilTick、Skill0、当前Match；稳定SourceLife允许已死亡或已销毁，**不可要求旧SourceLife仍是Participant.CurrentLife或仍live**。实际投弹归属由Bomb保留的源tuple证明，不能拿新life覆盖旧归因。合法换源时曝光累计可从前一个连续来源延续，不能把所有合法 FromTick 强制等于当前来源Started，也不能简单要求当前来源Started<=该连续FromTick。

官方06 `World.Residency.cs:71–90` 先填完全部entity字段，再运行所有components OnHydrate；可查到稍后创建的Bomb/Participant。`WorldManager.Lifetime.cs` 先赋 `Cut.ResumeTick`，再HydrateRows，随后才activateEffects。因而跨persisted实体校验安全，但在OnHydrate要求Aura ActiveEffects已经激活会误拒合法paired restore。Aura persist tuple校验与实际row核验必须按该顺序分层。对source已结束而曝光在上一已完成轮仍保留的合法边界，需以last processed tick与具体源退出顺序判断，不能单凭resume tick“当前不覆盖”拒绝。

## 3. Outcome 致死入口只有10101，遗漏真实10110

[BomberOutcomeReducer.Server.cs:65](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberOutcomeReducer.Server.cs:65) 只选10101 Applied CrossedZero，之后只验证sourceBomb DamageFacts/Hit tuple。真实BurnDamage是10110，事实属于受害Participant的 BomberFireFacts，所以永远不进入既有11项生命周期/DeathStructure写入。

这是可从类型与控制流确定的独立生产缺陷；当前 lethal log还停在 health断言104行，尚未实际运行其lifePhase/DeathStructure断言，不把该静态结论包装为已测屏障失败。

最小修复：仍Participant外层，候选增加真实10110 Initial Applied CrossedZero；按受害Participant完整 Fire Handle(World/Instance/Generation)、type/Target/Source/tick/match/life/generation、status1/ready及before>0/after0/actual的一致性证明合法已结算事实。After声明已含bomber.fire；保持其真实Claim与immutable证书生产链，不能造fact/result或单看Health0。将Bomb与Fire验证分支汇聚到现有同一组11次生命周期写入，每Participant只发布一次，并维持原final圈与常规respawn语义。不得复制11写到两个独立分支后直接假定423仍足够。Root需真实GEN、程序费用、world最低bytes诊断复核任何变动。

## 4. Aura Effect 缺 server CanSettle，错Participant/Match实际通过

只有 [BomberFireAuraEffect.cs:6](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/Effects/BomberFireAuraEffect.cs:6) 声明，未发现 BomberFireAuraEffect.Server.cs 或其他override。generated codec的CanSettle10111正确委托实际Effect；official06 EffectType基类返回true，因此两条错request真实进入live finite row。不是fixture在本地生成影子效果，也不是生成器漏掉已有校验。

最小修复：新增server partial CanSettle，仿Bubble匹配Source==Target==p.Life、实际player.Participant、Participant.CurrentLife/Match/LifeGeneration、player generation、health与eligible phase、activeSkill4/bound、pendingAuraOutcome1、完整request Handle、Duration/Chain/Favorite等request持久元组；拒绝已存在对应actual Aura。错误entity避免未经检查的Get导致非预期异常。保护状态本身不能阻止合法施放：原正向明确证明施放Aura应结束重生保护。CanSettle处理实际Effects.Apply准入后的settlement，不绕开10111 Initial/Rejected。

## 5. 曝光选源只枚举Bomb，真实Aura行从未产生10110

[BomberFireExposure.Server.cs:52](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireExposure.Server.cs:52) 没有任何10111 ActiveEffects或Aura来源枚举。原Aura test先得到真实finite row，再让victim在邻格连续20Tick，无法选到来源，health仍6。增加CanSettle不会自行修好这个缺口。

最小修复：在同一个曝光选源器追加 **actual10111 unsuppressed live finite row** 来源，由真实row的payload与完整Handle、source/target、AppliedTick/EndTick及持久request元组核身份；sourceLife实体提供当前位置，不能把AuraUntilTick当服务器授权输入。按设计§8.4中心3×3（含脚下、砖格排除），随人移动、本人免疫、source死亡结束；受害者重生保护/Bubble继续重用现有reset与保护逻辑。源kind2、skill4，Source=实际sourceLife，participant/generation/match/chain来自经核对的真实row/request；然后仍由现有Submit产生完整FireFacts并实际Effects.Apply10110。复用稳定排序、单份暴露、gap reset和真实Claim路径，不新增伤害计时影子系统，不直接扣血。光环留火trail(kind3)与公开主动技producer不是这5项fixture的成功范围，不借此报告扩大验收。

## 6. Aura paired restore 缺 private fullHandle重绑与实际row投影更新

[BombSystem.Server.cs:199](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BombSystem.Server.cs:199) 有ConsumeBubble，Aura只有到期清零。Fire reducer匹配AuraEffectWorld/Instance/Generation；paired cold restore实际10111保留Instance/Generation/A/End但换WorldId，私有World仍旧，所以原测试第100行明确失败。后续expiry结果也会因fullHandle失配不能走原Aura清零分支，不能仅依赖本地Until计时掩盖它。

最小修复：新增/追加正常UpdatePlayers调用的ConsumeAura，沿用 [BomberFiniteSkills.Server.cs:33](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFiniteSkills.Server.cs:33) 的Bubble模式：仅CompletedRestore==PairedCheckpoint时，从actual10111且source/target及同Instance/Generation合法的row重绑private World；按完整request身份匹配，真实End投影。消耗原Initial outcome、cast统计按一次性语义推进；Expired/Removed/Suppressed继续让既有Fire reducer处理actual result。不得再Apply一个Aura代替恢复，不制造新Handle，不修改真实AppliedTick/EndTick。

## 最小生产授权写域与后续验证

建议Root在协调锁后明确释放以下六源码给Fire作者：

1. `Gameplay/BombSystem.Server.cs`：现有ProcessBombs内Native相变顺序、UpdatePlayers ConsumeAura挂点；这是共享调度文件，必须与Frenzy/Supply作者确认互斥。
2. `Gameplay/BomberFireExposure.Server.cs`：统一曝光验证、actual Aura选源，保留原Submit/Consume真实事实路径。
3. `Gameplay/Components/Bomber/BomberSkillState.Server.cs`：仅调用曝光完整hydrate校验及本地请求校验。
4. `Gameplay/Effects/BomberFireAuraEffect.Server.cs`（新）：actual request CanSettle。
5. `Gameplay/BomberFiniteAura.Server.cs`（新partial helper，或由Root授权在既有FiniteSkills.Server内追加）：actualrow paired重绑/投影/一次消费。
6. `Gameplay/BomberOutcomeReducer.Server.cs`：actual10110致死统一生命周期写入；Root统筹后续official GEN与费用证明。

以上全部位于 `C:/Work/LumioGames/LumioGame/games/101-bomber/`。不需要修改Participant hydrate（当前仅BomberFrenzy.ValidateParticipant）、Frenzy/Supply业务、已有persist字段声明、10110 Effect实际扣血、Fire reducer旧负向权限、fixture或Engine。若新增验证确需这些写域，应先报告具体证据再由Root单独释放，不自动侵入。

Root的实际验证顺序：保留本次三套原RED并固定新源码身份，先跑原14项（7+2+5）零skip；lethal必须越过health、真实10110fact、双lifePhase与完整DeathStructure tuple，下一正常Tick真实destroy与burn归因journal均过；三原corruption必须恢复拒绝且源snapshot不变。已有gap/Bubble/partialpaired/NativeBurnDuration/AuraInitial正向不能回退。新增最小实际负控覆盖nonempty source错generation/family/started、old dead source合法归因、Aura move/砖格/self/expiry/death/paired pulse、同Tick多Participant及真实immutable fact/owner拒绝；无需手动调用Reduce或伪造receipt。

Outcome任何程序改动后必须官方GEN和费用诊断：同时核声明writes/indexed/bytes/work与world最低bytes关系，保留旧diag01–05、旧build和失败记录。静态plan验证、14项绿均不能替代16人完整业务、全部Native producer或整局/下一局验收；Aura当前fixture明确仅staged finite contract，公开UseActiveSkillAbility仍未支持Aura producer，不能扩大为玩家实际施放成功。
