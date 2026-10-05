# Supply / Frenzy 最低对象预算独立审查

2026-10-03。非作者，只读审查 Root 指定的一文件生产候选、计划、实际 producer 调用链、新22项测试及首 RED。没有改生产、test、声明、Config表、生成物、index；没有编译/Native/GEN/format。唯一写入本报告。

**Spec PASS，源码 Quality PASS；没有 actionable finding。实际候选 GREEN 与旧类/Native producer 回归仍 pending。** 本报告审的是对象 producer 最低预算，不是 Effect operation-plan writes/work/world最低bytes，不把先前 Native 初始化预算或 Outcome 修复混作本候选证据。

## 精确 delta

当前 `games/101-bomber/Gameplay/Config/BomberObjectBudgets.cs` SHA `2b2285078879efd035bfe4fd70840fadf60cb1034c860ded9fd76b4701cad94a`，与 Root 指定相符。该文件目前 untracked，不能用空 git diff 冒充未变；本轮在内存机械删除 SupplyFrenzyBounds 调用的三行及其后分隔、CeilingDivide/SupplyFrenzyBounds 两完整 helper，UTF8/LF 原字节重算得到 **`d0a5314813c931971dba301a9765f761d0c748396975a17f08fc50053c81e415`**，恰等于首 RED sourceSha256AtStart 和计划旧源 SHA。没有保存替代源，更没有覆写原文件。

因此旧 ordinary/+128、pickup/wall 公式、M2/Legacy19/8participants、dormant Fire/Split、barrel/未知 enabled block、skill guard、旧 overflow 包装与 RequireCapacity/int cast 顺序均逐字保留。增加的公开行为限于作者来源合法性拒绝与已知来源最低容量追加；public record/signature、正式2784/703/336 max没有变。

新增 test 当前 SHA `935511ee1e140dbc9a73516285314d1b164328d29169bce43ffdcbba63390787` 与首 RED相同。计划 `docs/plans/2026-10-03-bomber-supply-frenzy-budgets.md` SHA `2da86b871c5011212f0b42260c0f4d797d9960e655624592bd5d26742283c312`。计划末尾“尚未执行”是计划写作时状态；实际首 RED已存在，不将该历史描述当当前结果。

## 数量与真实来源

Supply 实际 Count/KindAt 的发行是 Strengthening+Health+Frenzy+(skills enabled才Special)+GoldenHeart，一局单次完整发行。新增 pickup项按完全相同的五项计数/flag计算；它不以拾取概率、死亡、丢失落点、已提交状态减债。raw五项总和≤11的 validation 与计划范围一致；skills关闭时省Special发行，Frenzy独立于skills。Supply关闭仍核 dormant参数但返回零新增项；不会成为运行中清掉旧 owner/promise 的授权。

Frenzy 原消费以 actual Applied fact Tick a 定义 until=a+T，活动严格 until>world.Tick；相邻 accepted placements≥I；首投不能早于a。故每份来源最多 `ceil(T/I)` 个 accepted intent，末端a+T排除。默认T120/I5得到24，不把最多6 Fuse并发当一生发行数，也不再加一套6。Concurrent保留 Fuse与未发布 promise；Danger已释放并发但仍占公共live信用，terrain/fact未知retirement没有固定释放保证。采用完整发行界而非正常尾部8是安全的保守上界。跨life保留 owner clock/promise没有再乘人数或返还旧债务。

源码实际新增bomb是 `K*ceil(T/I)`，K为enabled Supply+Frenzy消费者下的完整FrenzyCount。2份糖可顺序生效，不能按一人一次折扣；11份合法来源需264额外bomb，超过当前正式max时拒绝。该公式上界不声称实际Native已经投满24或11来源均可在一场完成。

| 配置 | RequiredBombs | RequiredPickups |
|---|---:|---:|
| 默认Supply关闭、skills开启 |2624|639|
| Supply开、skills关闭、默认五项 |2648|643|
| Supply开、skills开启 |2648|650|
| skills关闭、Frenzy2/GoldenHeart0 |2672|643|
| skills关闭、仅Frenzy11 |2888，拒绝max2784|645|
| duration6050ms、20Hz、默认1份、skills关闭 |2649|643|

CeilingDivide 用除法+余数，无 `value+divisor-1` 溢出；乘来源及追加均checked ulong，RequireCapacity在checked int cast之前。最大有限测试T4294967295/I5=858993459，×11=9448928049，ordinary320，真实required9448928369应以完整数值拒绝，不能cast绕回。fuse虽不参与完整发行界折扣，仍要求至少一有效Tick；interval≥5、concurrency1..6均先验证，除数不会零。announce/open/match同时按ms与真实floor Tick严格排序，避免合法ms实际同Tick开闭。

随机 ResourceRewards 遍历SoftWeight>0的实际PickupKinds。新增源校验拒Frenzy随机池权重、wrong code/None/LedgerMode、其它名字占kind7；这样作者不能改Fire→kind7或打开随机Frenzy而继续只用中央份数计量。中央实际强化池只选Fire/Bomb/Speed；kind7别名拒绝同样封该逃逸。默认其它生产源与barrel守卫原样保留。未来新增其它实际Frenzy producer必须独立计入，不能以本候选PASS概括未知来源。

## 首实际 RED

证据目录 `games/101-bomber/.run/v14-native-production-20261003/`：`supply-frenzy-budget-red-01.log` SHA `b166946e338be99328d70be0c44787efb0ff9190c6173f6f0ca52aa4ae4bf271`，独立重算与JSON记录相同；JSON SHA `a95e53731c2719fc43efb1d4bd557d20d84a8eb03ce3761dbf508144f4285d19`。raw `.exit` **2**，与JSON exitCode2相同。实际22 total / 21 failed / 1 succeeded / 0 skipped。完整读失败块：仅 Assert.Throws未抛或真实required等值不符；没有作者CLI导出、Native初始化、解码fixture异常冒充该业务RED。

实际 argv 是 dotnet、该目录 `artifacts/bin/Lumio.Bomber.Gameplay.Tests/release/Lumio.Bomber.Gameplay.Tests.dll`、`--filter-class *BomberObjectBudgetTests --minimum-expected-tests 1 --filter-method *SupplyFrenzy*`。旧 Calculator 为d0a531…e415；Test源码935511…0787仍同当前；TestDLL `22073913aac3a930a9b0d0e6ae7478e98a0478471e5b254713669efadf74968c`、GameDLL `7365a0ff8d2870766ffec05623acf6cc60f4a1b5ac175065935dd04c7183c18e`；official06 manifest `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，Ecs `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`、Gas `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`。这里只如实绑定旧RED，尚没有2b228…候选DLL或GREEN身份。

## 关闭边界

Root fresh build 后先同Test SHA真实22/22零skip、child0，并另跑完整原ObjectBudget类/旧profile和overflow，保留M2明确拒绝。候选已按原已失败原因最小修正，但源码PASS不能代替这些结果。Native Frenzy replenishment、自然爆炸/跨life/paired old来源、promise Unknown与实际2糖顺序消费仍独立需要验证；test中1000Hz仅calculator整数边界，不是声明Tick20的正式Native配置。

此对象最低预算不是安全准入的唯一机制：actual live+未发布order/promise的既有硬容量owner继续约束运行。没有放宽正式producer守卫、没有扩大public槽或正式max。没有宣布正式M2、全producer、16人整局/下一局或Goal101完成。

## 2026-10-03 执行闭环补核（原pending描述保留为当时状态）

Root通知后只读核实际raw log/exit/JSON及source身份，无重跑/生产写入。当前生产2b228…d94a、test935511…0787逐字等于两个GREEN各自sourceSha256AtStart，test亦等于上述首实际RED。

| 实际证据 | Total / passed / failed / skipped | raw child = JSON | log SHA256（实际重算=recorded） | JSON SHA256 |
|---|---|---|---|---|
| supply-frenzy-budget-red-01 |22 / 1 / 21 / 0|2|`b166946e338be99328d70be0c44787efb0ff9190c6173f6f0ca52aa4ae4bf271`|`a95e53731c2719fc43efb1d4bd557d20d84a8eb03ce3761dbf508144f4285d19`|
| supply-frenzy-budget-green-candidate-01 |22 / 22 / 0 / 0|0|`2ef4a3112b696ae896080f4014225012602cb09beb27ee0f0b3aa199bee984c8`|`ec69a35e2e8e16f084f030233e30642c3b5fc5e58485868ad32702ec91e020d6`|
| supply-frenzy-budget-full-01 |105 / 105 / 0 / 0|0|`2c5e8e3ba2602b62f5f51b62edafd5fc00736f936f309596abf4bb07f12c25fa`|`5891082856cd68a7c2a0f8859f7185acce21032773bb4c5a141dd8be1397541c`|

候选GREEN仍为 `--filter-class *BomberObjectBudgetTests --minimum-expected-tests 1 --filter-method *SupplyFrenzy*`；full删method filter，实际整个ObjectBudget类105条（22新项+83其余项）。两次TestDLL均 `3ef591c202edf1faba6eac5225f9b2177c2fa8c9cad9c7a2f0e7d02f3b276910`。candidate GameDLL `9d1c43bf5b991220e8403632113f79474416cb6e90b876d40c5ff4e225d67582`，full/build16 GameDLL `9043262095be360d48921a114d9fa2f41b1d1c6795b423bc41dd01f43e8ce685`，不混作同Game binary；受审budget源码在两次身份均相同。两次official06 manifest仍 `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，Ecs74da7…8def / Gas09150…dbc均等于前述官方身份。

因此本对象最低预算候选的同test真实RED→GREEN及完整ObjectBudget类回归门已完成，先前该局部pending可关闭；spec/source quality结论仍PASS。该执行关闭不代表 Native各producer、完整Supply17、全部Game或16人整局通过。Root另报Supply17当前15pass/2fail/0skip、均为Awake六形准入缺口，本轮未重新读该独立运行，不能据105/105抹掉或关它。Favourite/publicAura/unknown结构驻留等仍需各自真实证据。
