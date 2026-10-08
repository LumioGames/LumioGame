# Central Supply Task2 独立 TEST-only source 交回

2026-10-03。状态 SOURCE READY / 尚无新增测试运行证据。Root持有heavy窗口，未运行build/test/GEN/Native/format；未改任何生产/原两项Supply测试/旧Atomic/声明/配置/generated/upstream/index，也未spawn。仅新增独立类与本报告/私有源freeze。已读Task2计划、Task1完整报告/freeze和六个实际生产源；本任务遵守先实际RED、再授权最小修生产的TDD顺序。Root对本专项的TEST-only授权覆盖计划历史“尚未授权”状态，不扩大到其他任务。

## 固定源与计数

新文件：`games/101-bomber/Server/Tests/Gameplay/BomberCentralSupplyBoundaryTests.cs`，SHA256 `4104f5bb8249a136d3be42c57b8d57d751745eef73e3d891682aa702a3ece139`。

4 Facts + 4 Theories / 13 InlineData = **17静态cases**；没有skip/explicit。完整filter类：`Lumio.Bomber.Gameplay.Tests.BomberCentralSupplyBoundaryTests`。私有取证目录 `.run/central-supply-task2-test-source-01/`（相对101），包含原字节测试源和source-freeze.json；manifest SHA `b696c4fd090c94f8c6ff3fac87bb32b7d1d9980922abbd5c24e9f60d85f2ac8c`。

Root通知即将fresh Game build后，已停止全部源码写入并通知该SHA。后续机械编译修正或测试增强必须明确放行，重记SHA后freshbuild；本报告不能证明编译已经通过。

## 必要矩阵

| 方法 | case数 | 真值与断言 |
|---|---:|---|
| ActualFiftyAndSixtySecondTicksIssueTheConfiguredQuotaExactlyOnce | 2 | UGC19/8 skills-off9 / skills-on11；实际50000/60000ms转Tick；50秒marker及journal实际Tick/openTick；60秒实际live quota5/2/1/(0或2)/1、ordinal唯一、source match/spawn、信用归零后转live；20正常Tick无再发行。 |
| FullBatchAdmissionWaitsForRealRetirementAndTransfersAllNineCreditsOnce | 2 | 真实结构发布填充至capacity−8 / capacity−9；不注入budget服务、不提高配置max；不足9时整批不发，实际Destroy且World.IsLive=false后再发；9项信用恰到硬上限，不重收prepaid。 |
| ActualNoDestinationDebtRestoresThenMaterializesInResultsBeforeActualRetirementAndRollover | 1 | 全内场实际Native封闭，无落点9条真实选择保留；paired恢复10Tick不重抽；Results结束仍同match/债务；实际Native开plaza后真实发布，按selected tuple核Kind/Skill/Occurred；旧Supply仍live期间不换局，实际退休后原Native清理及下一Match，marker清零，再一次真实60秒发行9条。 |
| ExplicitSubmittedUnknownFixtureKeepsAllCreditsAfterPairedRestoreAndResultsWithoutReplay | 1 | 对实际已发行9条显式注入submitted未知状态，真实Native空落点在capture前打开；paired恢复、正常20Tick+Results超时20Tick均不重投、不退信用、不换match。明确不是实际Commands.Create异常/可捕获pending order。 |
| HydrationRejectsAlteredActualPublicationAgainstItsRetainedExactSubmittedTuple | 6 | 基于实际live Supply Health和匹配retained submitted tuple，负控match/ordinal/content/spawn/cell/mixed-source；RuntimeOnlySnapshot仅验证hydration拒绝，具体inner错误含Supply。该retained debt是故障fixture，不冒称真实Unknown，也不把hydration观察说成首次Awake时故障注入。 |
| HydrationRejectsDamagedActuallyIssuedUnpublishedSupplyMemory | 3 | 实际无落点pending：wrong match、duplicate ordinal、unsubmitted position；Owner初始化拒绝，错误确属Supply。 |
| ActualSupplySpecialCanExchangeIntoAnOrdinaryDroppedCandyWithoutFaultingTheNextTick | 1 | 必须先实际11发行；公开PickupAbility+实际GAS Activation完成特殊糖果换槽；下一普通Tick应正常，incoming进入slot、outgoing真实live dropped candy、Supply身份退休、共11信用不变。无手造Supply item替代前置。 |
| CodecAcceptsExactUtf8BoundaryAndRejectsByteOverflowRowOverflowAndMissingFields | 1 | 8192字节有效JSON+空白正边界、8193拒绝、é×4097拒绝、12row拒绝、missing fields拒绝。纯codec，不称Native规则或实际publication。 |

全矩阵为最小有代表性的专项覆盖，没有展开计划所有9种memory损坏、六形态×多seed×多个正式房间。实际模拟均由WorldManager.Tick推进；没有直接Advance/ObservePublished替代生产、没有假Native receipt/result、没有手调生产Tick。初始化/config、故障checkpoint和ending-phase fixture都有明确边界。SyncList使用Count/index；配额与id排序只用真实world.Each/官方表Rows枚举。

## 静态候选与Owner边界

1. **skills-on11尚有真实来源/admission前置**：当前Select固定六Special pool；ValidContent要求BombKind.Enabled；当前ObjectBudgets仍守Fire/Split dormant。测试不为其开启形态或跳过守卫。此case可能在正式前置拒绝或实际发行中先失败，也可能当前seed恰抽到已启用形态而通过；任何单seed结果均不证明六形态全池已准入。该限制不被原skills-off9的GREEN消除。正式23/12、27/16及seed1–100、六形态完整消费者仍待Root/所属Owner交付。
2. **合法Special exchange的静态production候选**：`PickupAbility.Server.cs:35–53`复用物品，写outgoing SkillId及DroppedBy/ExcludedLife，保留SupplyMatch/Ordinal；`BomberCentralSupply.Server.cs:136–145`拒绝这类mixed来源。若前置实际11成功，测试预计在后续普通Tick的Supply校验失败，或在身份未退休断言失败。未实际运行，未声称已复现。最小修复只在真实RED与明确生产写域授权后决定；本轮没有改PickupAbility或Supply校验。
3. **codec断言精度待增强**：é×4097当前仅Assert.Throws，invalid JSON也能满足这条，因此它单独不能证明UTF8预算优先拒绝。已通知Root建议增加错误消息包含byte budget的更严断言；收到停止写源指令后没有擅自修改。其余8192/8193是有效JSON+空白正/负边界。后续更严断言须重新fence。
4. full tuple负控使用实际publication的retained debt，在同一Matches/hydrate观察路径验证；尚没有在actual首次Awake前拦截并损坏生产队列的fixture，不能把本测试写成已完成该时间缝的完整故障矩阵。
5. 未覆盖同seed跨world确定性、unknown结构调用实错、同Tick跨producer位置冲突全矩阵、完整所有UTF8/JSON损坏组合、真实抢拾/全11六形态消费者、16人整局及真实表现。计划Task3 typed事件与schema mint由Root/其他Owner负责，不在本写域。

## 建议Root运行顺序

所有17case先以本SHAfreshbuild，保存真实source/GEN/官方包/DLL/日志/.json/.exit，禁止把旧DLL记为新源验证。固定runner已只读确认支持-Filter和-Method。

1. 原Supply2再确认（当前已有同源GREEN，见下）；新类codec、9项 quota以及capacity8/9边界优先。
2. no-destination/paired/Results归还与unknown no-replay；随后publication6与memory3负控。首跑绿可如实记“新增回归首跑绿”，不造RED。
3. skills-on11 quota先核实际首失败归属；只有其真实来源前置通过，再单独执行ActualSupplySpecialCanExchangeIntoAnOrdinaryDroppedCandyWithoutFaultingTheNextTick。该case若前置失败，不将其计为exchange实错复现。
4. 全类17及Terrain/Death/Pickup/shared-credit/Round相关原类回归；同一最终源身份复跑必要affected组，不把group之和称完整solution。

例：`& games/101-bomber/.run/run-v14-native-production.ps1 -Label 'supply-boundary-01' -Filter '*BomberCentralSupplyBoundaryTests'`。分方法使用同runner的`-Method`并fresh label。此报告没有执行这些命令；没有新增total/pass/fail/skip/rawchild可交付。

## Task1/原2证据与身份

Task1报告SHA `aa4604b0ec5aeb5b788178994fe74332f7530aa97d07f6986a363055b4404ca4`；Task1 source-freeze SHA `12f623fbd1f4557d3d10bc35022b1c2c1b7df34496c5f326b3e540bf423b830f`。六个当前source SHA均与Task1 freeze一致：Supply `098c406e…10dd242`、System `e3f9c568…dd82fa`、Pickup `c7895113…a38a7`、WorldRuntime `7fde39b6…ceb36e3`、Terrain `46cafe15…754b85`、Round `e9a18ec9…32ce5`。未修改其字节。

原2测试源仍 `2c4124da0ff04bf86c10205f3382e0995ef06f4e914ba268b994df6fad7d92e9`。原首RED保留2 total/1pass/1fail/0skip/rawchild2，50秒marker Expected1 Actual0；不覆盖它。

本轮只读核实Root `supply-production-green-candidate-01`：2026-10-03T05:37:25至05:37:37，实际2total/2pass/0fail/0skip/rawchild0；log SHA `38ed635050de21d4807dca69f2ae6c44f8856373ccf941dbccefd8f1c8d853af`、JSON SHA `58aa13477bfc154e39e762b0410d47b20044a69ba4520a87a822034ddc82942c`。sourceSha256AtStart的原2、Supply、System、Pickup、Round与上述对应；official06 manifest仍`8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`；TestsDLL `22073913aac3a930a9b0d0e6ae7478e98a0478471e5b254713669efadf74968c`、GameDLL `7365a0ff8d2870766ffec05623acf6cc60f4a1b5ac175065935dd04c7183c18e`、Ecs `74da7fff…648def`、Gas `09150ba2…d6dbc`。此GREEN只证明原2：默认19关闭及UGC19/8 skills-off9，不证明新增17或skills-on11/exchange/正式档。

Goal101、Supply Task2实际验证与完整producer验收均未完成。Root接手heavy运行前源码保持上述fence；后续一项项补齐缺口。