# Game101 狂暴切片交回与断点

## 2026-10-03 · 低内存生产 READY（未编译、未运行新矩阵）

Root恢复本既定切片的生产授权后，已写入11个owned生产作者文件与1个测试作者文件。六个Persist声明由capacity尾追加，本agent未重复写Participant/Bomb声明、未触碰官方Reader、生成物或共享Admissions/BombState.Server/BombSystem。遵守当前heavy窗口，**本agent未build/generation/test/commit，未删正式guard**。这里只表示源码READY，不表示GREEN或正式交付完成。

Owned编译输入精确SHA见 `.sdd/101-20261003-frenzy-sources.json`。其中helper `BomberFrenzy.Server.cs` SHA256为 `d35b6715f48626828f2b7658f532a68e5f4ec5540ec23b7e079cc021ba4eac55`；测试SHA256为 `3ba161aab33bb5975eea7610ef4e4d8f0ce9d098c13b10444af0e8626042c737`。

生产行为：Kind7沿现有Heal Effect Applied全血启动，满血合法零点Applied；重复active拒绝。实际Place三端窄partial接线进入持久promise→common Admissions→真实EntityOrder，固定Standard和Reader fuse，额外弹不扣普通库存/帽，不继承特殊槽。并发从跨Life实际primary Fuse+未发布promise计算，至少Reader五Tick。自免匹配完整SourceLife+Generation，active到期不更改已放弹。helper只读restore校验，发布观察再清exact row；unknown不按到期/死亡猜退款。源表可调值均从 `BomberConfigBinding.For(world).Game` 读取。

capacity确认已接 `ReservedCount/HasSubmittedPromise/ObservePublished/ValidateParticipant/ValidateBomb/Validate`，以及ReserveBlastContacts完整来源自免、Frenzy Return容量隔离。调用图无递归：Participant validate→Read/Concurrent→Published→RequirePublished→ValidateBomb；ValidateBomb不回调组件ValidateStorage或promise读取。Runtime逐实体hydrate期间只观察当时已有live实体；全部hydrate后ProcessBombs起点再统一Validate。初始位置仅在 `!PlacementRecorded` 的真实首次publication比对，以后kick位置继续由实际LogicTransform提供，不建影子位置。

当前测试静态作者计数：**12 Fact方法+3 Theory方法，13 InlineData，预计25 cases**。这是静态计数，真实discovery/total/pass/fail/skip/childexit必须待Root串行Game窗口运行；目前新矩阵实际执行计数为0，不能写成25GREEN。

| 作者测试组 | 预计cases | 来源/目标 |
|---|---:|---|
| 首两项拾取 | 2 | 既有真实Native RED保留，待实现后的实际GREEN |
| 重复糖 | 1 | actualPickup拒绝且留地/不续期 |
| 特殊槽隔离 | 5 | input slot fixture；实际Ability放弹，库存0仍可产Standard |
| 五Tick间隔 | 1 | actual第一/+5放置，sameTick/+4拒绝 |
| 累计>6与爆后补发 | 1 | 8次实际Ability放置与自然爆炸 |
| 硬6 known-state | 1 | 明确6个published primary边界fixture，不冒称6次合法同时放置 |
| 共用generic总cap | 2 | published census边界fixture+最后0/1个实际Frenzy order |
| 自然expiry旧Life自免/敌弹伤害 | 1 | S+115实际尾弹→S+139，FuseEnd不修改 |
| 已发布paired恢复 | 1 | 已完成实际结构提交，再公开paired capture/restore |
| 真实queued捕获拒绝 | 1 | actualPlace未发表信用，公开Capture拒绝，实际Tick转live |
| 缺publication的owner模型 | 1 | **明确corruption fixture**，paired恢复保留信用/不重试/不到期返还 |
| 新Life旧源迟到Original | 1 | 公开HostVoxelWorldAdapter withheld/交回真实Native结果，真实Successor |
| promise损坏行 | 6 | corruption fixture JSON/UTF8/重复/generation/fuse/match恢复拒绝，原字节不变 |
| 第七条物理容器 | 1 | 修改序列化输入，不改cap头；应 `FormatException: exceeds_max_capacity` |

公开边界已读源核实并报Root：Runtime `modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.cs:524/530` 在待create时明确抛出 `CaptureSnapshot refuses pending creates; CommitCreates must run first.` Root确认没有已验证的公开pending-creates checkpoint入口。故实际paired恢复仅证明完成结构提交的场景；缺publication的submitted promise只能标corruption fixture，**没有真实unknown structural restore GREEN声明**，不为此新增Runtime公共语义。现有实际Native迟到Original属于terrain结果交回边界，不混作未知结构创建证明。

静态还已告知capacity：durable submitted/no publication row在fresh restore后的service为空，单靠当前帧Held列表不能证明跨restore禁止直接重放CreateFromPromise。生产helper不会重试旧row；若common API承诺这个防御边界，必须由公共owner统一收紧，不能另建Frenzy第二账本。

待Root/相邻owner完成：官方Kind107008与Game五参数双端Reader/export、v14统一声明生成与schema迁移、Round的HasUnpublished门及ResetParticipant、barrel SourceFrenzy持久继承。当前helper Reset先观察实际已发布，仍有unknown则拒绝，只清四active标量，不清未知债。Barrel来源marker允许独立`barrel:`token，其额度不计primary6。

后续仍需：Root Game窗口真实编译/25case矩阵、失败排障与TDD记录、Kind7拒绝/恢复/admission耗尽等余项、来源/标记/Produced腐坏扩展、round正常cleanup、shared回归、独立spec/quality审查与窄提交。正式完整产品门继续由Root总ledger管理。

## 2026-10-03 · 计划与两项真实 RED

状态：调查与完整单子系统计划已完成，首RED已验证；生产实现未开始，不表示狂暴已交付。

已按顺序读父仓core/nav与Game101入口/core/nav、开发/测试/代码风格规范、design§8.5/12/16、根ADR0048、writing-plans/SDD/TDD与测试反模式。保持当前分支与原dirty内容。仅新增plan、此report与两个Native测试Fact，无生产或声明修改，无本agent build/generation/commit。

计划：`docs/plans/2026-10-03-bomber-frenzy-production.md`。精确v14追加五个Participant字段（FrenzyLife Room；FrenzyGeneration None；FrenzyUntilTick Room；FrenzyLastPlacementTick None；FrenzyBombPromises None/max6）、一个Bomb.Frenzy Aoi；都Persist/Server。无新Effect/Ability/实体/组件/输入/Tag/Attribute/wire字段。旧enum0–5保持；Kick6保留，Frenzy7明码。Root共同GameRow五参数接口已收到，源表Reader由Root单写。

测试作者文件：`games/101-bomber/Server/Tests/Gameplay/BomberFrenzyProductionTests.cs`。
SHA256：`c169e39bf05cbbd3cb5917d6ba174c80a232c9e1da9c8f463a081fce72294e66`。

实际运行由capacity/schema owner唯一串行窗口完成。本agent读回原json/log核验：

| Case | 实际结果 |
|---|---|
| InjuredLifeConsumesFrenzyCandyAfterActualAppliedHealthSettlement | FAIL：Expected Health6，Actual4，测试源line31 |
| FullHealthLifeConsumesFrenzyCandyWithActualZeroPointAppliedSettlement | FAIL：Expected live=False，Actual=True，测试源line53 |

真实计数：**total2 / pass0 / fail2 / skip0 / child exit2**。这是功能缺失的有效RED，不是环境BLOCKED，也不是编译/零测试失败。Kind7是明确fixture来源；健康伤害与拾取结果沿真实Scene、Ability、GAS和WorldManager.Tick，不冒称中央补给发行已实现。

Run：`games/101-bomber/.run/resume-capacity-20261003/frenzy-native-red-01.json`；原log同前缀`.log`。
原log SHA256：`756955cbabca57dc456b9d86583b62627d2e219b34161cff2039d9682fcc9ae6`。
Start `2026-10-03T02:27:52.5786855Z`；end `2026-10-03T02:27:58.2661607Z`。
实际test程序集SHA256：`cb265f49de0f31b620395305fa7f99ba8f1a453067a1e7ac226619af5f9587f1`。
实际Gameplay程序集SHA256：`b61b7aef8cbafc04b7fdb04dbed96cd74f5ccbe42d4c0ccfcea0206b56c45ce1`。
实际Ecs程序集SHA256：`74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`。
实际Gas程序集SHA256：`09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`。

本轮包来源由Root任务锁定 official complete-release-06 manifest `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`；capacity报告对应build零warning/error。Native文件hash与构建source-freeze证据由capacity窗口产物保留，此RED日志本身没有列Native hash，不编造。

生产接缝已送Root/capacity/barrel：Place三端partial CanProduce/Create；Admissions ReservedCount/HasSubmittedPromise；Bomb Awake/Process观察发布；Inventory与Return/Frenzy immunity；RoundTransition exactpending门与Reset；Barrel原始来源Frenzybool。当前等待Root明确释放v14生产窗口，未动共享编译输入。

关键测试区分：正常24TickFuse/5Tick间隔峰值为5，配置硬cap6；单糖120Tick生产期累计理论最多24，与“一生六次”无关。未知未发表信用不按期限折扣。自然expiry用S+115真实尾弹→S+139，在S+120到期后原Life仍免疫；新Life使用现有公开HostVoxelWorldAdapter实际Native Original checkpoint withheld/交回，不篡改FuseEnd或Source。

未完成：所有生产代码、v14统一生成/迁移、Frenzy正常GREEN、共享hardcap/unknown/paired restore/corruption、自然expiry/真实新Life自免区别、round cleanup、独审与窄提交，以及完整主线整局/M2/30分钟等产品门。
