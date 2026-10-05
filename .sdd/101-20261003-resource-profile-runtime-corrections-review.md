# 101 Resource profile 运行反馈更正独立审查

**更正裁决：撤回黄金心脏阻断P1与141局gold队列反例；批准Supply方法在原条件下1114→1361。Root针对1例与完整105的实际GREEN已独立核验。TerrainRewards703与DeferredDeathDebts703安全上界仍未证明，不能由此次GREEN外推队列完整交付。STOP。**

本轮按 `workflow:receiving-code-review` 的先核实流程处理Root实际运行反馈。只读完整fixture、实际表字面值、材料化源码、Strong Native测试及原始JSON/log/exit；审查者没有写生产或测试，没有执行重型构建、Native、GEN、配置导出。之前审查报告与其所有轻量证据、作者报告已原字节复制为 `.run/resource-profile-runtime-corrections-review-01/*.before`，hash在新verification.preservation；原独审报告末尾追加明确更正，保留历史。

## 黄金心脏旧结论撤回

实际 `Gameplay/Tables/tables/pickup_kinds.txt:16` GoldenHeart的kind_code=5、ledger_mode=`GoldenHeartOwnership`；材料化代码 `BomberResourceRewards.Server.cs:57–58`拒绝的是literal `GoldenHeart`或`KickQualification`，GoldenHeartOwnership不匹配，gold又不是Skill，因此随后return true。我之前只看Name/enum与消费者，没把实际ledger_mode逐字与条件比较，造成错误P1；作者报告同一前提也错误。

实际表SHA `63bd27a5db69ef25d48ec7936b7e1fa04ad4888cf3a64165914b66b2bda736e7`；实际材料化源码仍 `3efb450bb60d7b9f581d9701640c3a971b5c2248859dcc2100885fb4c91a7d6d`。Root没有为gold改源码。

原 `BomberStrongChestProductionTests.cs:30–47` Theory true/false，SHA `b372bb720fe7554c90f5b6e3a4964ea368abda9bda83c1236ee24002eca82c47`未改：真实作者gold1000配置、Native绑定Chest、三次distinct bomb、真实Tick Original后落地单颗gold、队列中不含gold，并核skills on/off完整6/5输出。Root `strong-golden-native-red-43`虽标签含red，实际2total/2pass/0fail/0skip/raw0、5.668sec；log SHA `e3d020749084555514ebe3ce2839a2d8f42a7a50864233d642fc904b387c56a7`，JSON `af1370dbf68bd7f9a69dc84a97cf9f8a719058cc232662f18ab9df8ffe128f50`。标签不覆盖实际结果。

因此明确撤回“gold一律拒绝发布”的P1以及“gold每局永久积压，141局越703”的静态反例；不能用旧报告要求生产更改。此2例证明实际地形gold落地，不等于全部gold消费/死亡/restore或整Strong类都通过。

## 队列703保留事项的正确依据

仅保留**STATIC安全上界未证明**：实际 `pickup_kinds.txt` Kick ledger_mode=`KickQualification`，`ResourceRewards.Server.cs:32–33`随机槽可选Kick，而`:57`实际拒绝；`:40–45`真实Strong special pool包含fireBomb/splitBomb/remoteBomb，实际 `bomb_kinds.txt`这三个作者default disabled，`:60–62`有按Enabled判定的真实阻断。它们有真实声明、发行代码与持久保留路径，不再靠gold错误前提。Legacy Soft自身random_slots1、非零Kick概率也可沿正常soft破坏进入这条路径；不是拿closed M2冒充已准入场景。

`BomberWorldRuntime.cs:36`持久TerrainRewards703、`TerrainTransactions.Server.cs:183,306–307,515,525–529,548,697`只基于共享credit准入、逐项Add并保留不能材料化行；`RoundTransition.Server.cs:26–94,141–162`没有清这类已接受债的跨局路径。gold正常落地不足以证明Kick/disabled special永远不累积。**没有Native累积704反例，没有141局数字证明，不能宣称已复现溢出，也不要求盲扩到1607。** 后续须验证真实发行/正常跨局、队列准入/backpressure或可证明预算。DeferredDeathDebts703旧life非空债行数仍未证明，原“不因703<1607就扩容”的限定保持。

## Supply单值修正

完整 `BomberObjectBudgetTests.cs:364–376`仅设置central_supply_enabled=true、frenzy_enabled=false；继承实际game.default.skills_enabled=true。先保留“enabled source/disabled consumer”拒绝断言，然后只把frenzy count改为0再读取。实际作者其余发行counts为strengthening5、health2、special2、gold1，不因frenzy消费者关闭删除special。生产calculator SupplyFrenzyBounds在skills=true时不减special；required=default1351+5+2+2+1=1361。旧formula639+10=649解释原期待。作者与我把该方法错当skills-off，误批准649→1114。

Root `object-budget-resource-migration-42`真实105/104pass/1fail/0skip/raw2唯一失败Expected1114/Actual1361。这是运行到完整fixture之后的数值错误，既非环境前置失败，也不授权改变原conditions。Root把`:376`单个期待改1361合法；其他真实skills-off的一低一等1114/1115以及bomb2624、所有source拒绝断言保持。

保留private/Root migration-first-before SHA `15a2240b0d8dbbc775994b560351f68294898346f4d97bd3404efaa8f5c8deb2`，当前物理SHA `c0e7148a86070c240a570b0126f8b434e0ff10e28638ba8c1bdc63e6ae847b5c`。完整diff仅该数值；原105 cases仍105。Raw字节另有该被改行末CRLF→LF的一字节规范化：仅token inverse不等原hash；补回同一行原CR后逐字等before。新evidence透明记录exactChangedLineInverse、normalizedSingleValueInverse，**不声称raw仅numeric token变动**；未发现其他断言/fixture或行改动。

## Root修后实际执行

以下完整JSON/log/raw exit均独立核验，log重新hash等record，current test/source hash绑定，计数来自真实summary。

| label | total/pass/fail/skip | raw exit | log SHA256 |
| --- | --- | --- | --- |
| object-budget-resource-migration-42 | 105/104/1/0 | 2 | `4f1c56eb9a3ea16bb1d2328ef296c43c86d9d397ce0acd47d22af51e1eda0bfe` |
| object-budget-supply-flag-corrected-44 | 1/1/0/0 | 0 | `8fd351ee7a4a72ad95a942dfc47d906d5aaca1470e1fe6b891b42e3ae6691882` |
| object-budget-resource-migration-green-45 | 105/105/0/0 | 0 | `15b607d98e60ce5461049034ce53cb14b9e351941e69b1a61640586efc053299` |

44与45同build40、同current test c0e7，target1为1.294sec/full105为45.777sec；JSON SHA分别 `20b48991742568650cb17450bc638fdd5d1955cd4d5ed6c802a33778d300e945`、`fb67a83ac1ca91557e886e1f1e7f281ae22ccdd48f51e6789c1882c44f831d7a`。两run TestDLL `affd381dbb87a40042bc554db000058c93fc7793f8931c676ea5acebf24b8e07`，GameDLL `61ffd66564c634a13b173a04af4eefcd212e1305da41d27d07675de1f13b5e55`；Runtime/Native以及完整命令在verification.runs，当前物理DLL均再hash匹配。旧Strong43/RED42历史TestDLL只按保存记录核验，不伪称新build还保留旧DLL字节。

完整原105内 `EveryShippedProfilePassesTheEffectiveCalculator`逐目录读真实Reader，并对六个M2要求map.layout_kind拒绝和六项全部出现。独立核当前Server/Config/Profiles目录精确等48注册名，因此这条实际通过覆盖42 Legacy准入及6 M2拒绝；没有删除M2或profile。其余原105断言完整，仍不等于Resource10、queue703、完整FavoriteRegion/Native或整个Game交付。

独审轻量验证命令 `node .run/resource-profile-runtime-corrections-review-01/verify.mjs object-budget-supply-flag-corrected-44 object-budget-resource-migration-green-45`实际raw0；`verification.json` SHA `98cdba3d0c25a3034dc0009061f34cba5fd5399bcf79d580168832bebdaca24c`。所有旧报告/证据保留，原报告追加撤回与更正，不改写历史。STOP。
