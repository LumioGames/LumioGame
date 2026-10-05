# Fire / Aura production 修复源码交回

2026-10-03。Root 读完独立调查后明确授权六域生产实施，本报告是**作者源码交回**，不是修复后的独立审查。六处相关修复已落地，候选状态 **source-ready，尚未 GEN / build / execution**。Goal101 未完成。

未运行 .NET、Rust、Native、GEN、format，没有提交，没有spawn。原14项测试/fixture、旧FireReducer权限、Participant hydrate、Config/声明/schema/generated/upstream均未改。原三套各自失败日志、JSON和raw child exit保留，不合并为单一失败原因、不改原断言。

## 最终候选 source fence

最终审查输入是 [fire-aura-production-fix-02 manifest](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/fire-aura-production-fix-02/manifest.json) 与 [exact source diff](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/fire-aura-production-fix-02/source-diff.patch)。manifest SHA `2f006dbc957ba7a5b09cadfb6998acb18a25c2f46c3107bf3ddcfdd11166cae9`；patch SHA `12b931f5ec33c01241bd7ec80b3a8b0f97cb16168bf08e700f8a4bef4d2b4017`。

四个修改前文件按物理SHA找到现存副本，并冻结到before；其SHA精确等于 build10 / 原RED sourceSha256AtStart，不用git旧HEAD或数值等价替代。两个新增生产文件和新增测试before不存在。七个after均复制为物理文件，完整hash清单如下。

| source（相对games/101-bomber） | after SHA256 |
|---|---|
| Gameplay/BombSystem.Server.cs | `542af1c6a65bb93a91b8f836387814878ed3b5ef5502b3007dd904fdfbe68382` |
| Gameplay/BomberFireExposure.Server.cs | `d406113b06eea2c9d492817ee49f1f8aef8bfba126e2daa81e42a76ec61d3d77` |
| Gameplay/Components/Bomber/BomberSkillState.Server.cs | `b5f4bca3fd9cf91a29b805fe07721b74837227d8b03902d29865933c2a4c68e0` |
| Gameplay/Effects/BomberFireAuraEffect.Server.cs（新） | `2eff2bcbea8c1757d53276a64faae059d0c778977003c4b2b57ceafd30ddf6b3` |
| Gameplay/BomberFiniteAura.Server.cs（新） | `94dfbb27a07b0488e43492a093b67b69e827c700125a42d0c57248a969f3fbf9` |
| Gameplay/BomberOutcomeReducer.Server.cs | `4182708e1ef64ee22fdbb8f21e1d76ec2d0af162c33993d91b4fbb7ac323fe8e` |
| Server/Tests/Gameplay/BomberFireAuraProductionFixTests.cs（新） | `6a24a4c271dcb1e7ec8214b8afa4bcdda998e1d0fc0ab6a9b2632b7ee2f0ad93` |

[hash-audit.json](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/fire-aura-production-fix-02/hash-audit.json) 独立重读：after7、before4、unchanged guards6、drift0。guards含原三测试、FireReducer、BurnDamageEffect.Server、ParticipantState.Server，全部继续匹配原RED记录。轻量diff whitespace检查未发现空白错误；未替代编译。初次source fence01保留，它在最终声明名核对前保存；02修正实体类型检查为本仓实际PlayerEntity，已取代01，不应构建或审查01为最终候选。

## 六处生产改动

1. [BombSystem.Server.cs](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BombSystem.Server.cs)：保持同一ProcessBombs，既有到期Native.Send相变循环（包括原terrain、FireFact、pendingHit、splitFamily守卫）执行后才调用FireExposure.Advance。本Tick的Native EnterBurn即可参与曝光；没有手写Phase、手调Tick、改间隔或加第二条Advance路径。UpdatePlayers原AuraUntil到期字段判断换成ConsumeAura实际行更新。

2. [BomberFireExposure.Server.cs](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireExposure.Server.cs) / SkillState.Server：集中ValidateExposure。空源必须清空ResetExposure涉及的全部源/时间字段，累计FirePulseSequence保持独立。非空核本地完整ID、clock不越cut、源开始值、Match、真实Participant与source种类；Bomb源匹配Owner/SourceLife/Generation/Chain/Family/DangerUntil/Skill0，不要求旧SourceLife仍live或仍是CurrentLife。Aura核已恢复的persist tuple，FireZone核既有来源字段；没有实现trail producer。合法连续换源不强制FromTick等于或大于当前源Started。

3. [BomberOutcomeReducer.Server.cs](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberOutcomeReducer.Server.cs)：原Participant扫描接受实际10110 Initial Applied CrossedZero。确认受害Participant的FireFact完整Handle、Type、Target/Source、Life/Generation、Match、Tick、status1、ready和真实before/after/actual，再汇入**同一组11次既有生命周期写入**。原10101 Bomb完整事实/Hit验证保留。After仍依赖bomber.fire；真实Claim与immutable证书仍由既有FireReducer提供，没有伪造结果或补本地receipt。MaxWrites仍423，没有盲提limit。

4. 新 [BomberFireAuraEffect.Server.cs](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/Effects/BomberFireAuraEffect.Server.cs)：CanSettle核真实Source==Target==Life、实体类型、实际Participant/CurrentLife/Match/Generation、health/phase、skill4 bound、pendingOutcome1、完整Handle、Duration/Chain/Favorite及非零CD，并拒绝已有actualAura。保护中的施放仍可合法结束本人的保护。读取实际finite payload使用该Effect官方生成typed codec，不自写wire解析。

5. 曝光选源追加actual10111未suppressed且尚未到期的FiniteEffectView，以完整request/handle与真实payload确认来源；真实施放者当前位置生成3×3 coverage、排除本人、Native砖格及死亡施放者。零地形写。继续使用既有稳定排序、单份暴露、保护/gap reset和实际Submit→Effects.Apply10110→Claim链；没有直接扣血或用AuraUntil授权覆盖。

6. 新 [BomberFiniteAura.Server.cs](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFiniteAura.Server.cs)：仅PairedCheckpoint可由实际同Instance/Generation且request完整匹配的row重绑privateWorld；重建投影用实际EndTick，消费Initial outcome一次并记录cast/stat。死亡源仍保持CurrentLife关联时提交实际Remove；既有死亡屏障若已清掉CurrentLife并排队销毁body，则来源扫描立即排除死亡源，行清理由Runtime实体销毁承担，新增真实致死测试检查这一分支。官方06 Refresh只改EndTick而保留A/Duration，本实现接受这一合法历史，未把End固定为A+Duration。原FireReducer仍消费10111实际Initial/Terminal/Control，没有更改其权限。

没有给BurnDamage.CanSettle增加Source.Phase/Family eligibility。capacity_schema当前直接准入10110且使用Standard Fuse source的关联回归，仍走原CanSettle/Claim语义；本次hydrate完整来源验证只针对已选择的持续曝光状态。

## 测试与验证状态

TDD以已真实执行的原RED为起点（原14总5pass9fail0skip，三child均2）；专属测试源码先于主要生产修复落地。新增 [BomberFireAuraProductionFixTests.cs](C:/Work/LumioGames/LumioGame/games/101-bomber/Server/Tests/Gameplay/BomberFireAuraProductionFixTests.cs) 最终12cases（6theory rows+6facts）均为**source-ready，未执行**：

- 非空actual Bomb曝光generation/family/started三负控，真实恢复拒绝及源snapshot不变。
- actual10111 request life/generation/chain三负控，保持原保护/CD无cast副作用。
- actualAura跟随源移动并免疫caster、actualNative砖格排除。
- actualRemove停止后续满秒伤害；真实10101致死施放者后Aura不再留行或覆盖。
- actualRefresh保持完整request并使用新实际End，继续产生真实10110pulse。
- actual10110致死旧投弹者并销毁其body，另一个受害者的Bomb曝光仍可paired restore，保留旧归因。

原14从未改动。当前不存在本候选GREEN证据，新增12也未有独立RED执行；这是Root独占heavy窗口下的明确限制，不声称完整TDD绿或业务完成。原lethal失败停在health0，修复后Root必须确认它继续越过FireFact、双lifePhase、完整DeathStructure、下一正常Tickdestroy和burn死亡journal，不能只检查health改善。

## Root 下一验证门

使用02完整源码身份进行官方GEN与plan诊断、build，再分别保存原Exposure7、Fire2、Aura5和新增12真实run JSON/log/raw exit。期望26项全部零skip，原失败分别闭环，不改fixture或断言。同时运行capacity_schema实际关联负控，确保owner/fullfact/receipt消耗/replay防护未放宽。

Outcome增加读取/条件会改变官方程序费用；单一11写body与保持423不能代替新官方结构计费。Root须核writes/indexed/bytes/work、world最低bytes与声明的关系，若诊断失败按程序结构修，不静默提Config limit。后续当前统一候选还含别的已授权写域，build/source identity必须记录完整真实组合。

本次Source候选与26项即使通过，也不代表公开UseActiveSkillAbility Aura producer、Favorite trail、全技能Native producer、16人业务、整局/下一局或Goal101已完成。这些仍需各自实际验收与fresh非作者最终review。
