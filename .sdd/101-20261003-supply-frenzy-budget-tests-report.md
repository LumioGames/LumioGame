# Supply/Frenzy budget tests source handoff — 2026-10-03

状态：SOURCE READY，已 fence；未构建、导出或执行。仅在 `games/101-bomber/Server/Tests/Gameplay/BomberObjectBudgetTests.cs` 的原 AuthoredFixture 前追加计划中的两个完整测试代码块。预算生产函数保持未实施，等待 Root 的实际首轮 RED 后再授权。

本次执行依据是 `docs/plans/2026-10-03-bomber-supply-frenzy-budgets.md`（SHA256 `2da86b871c5011212f0b42260c0f4d797d9960e655624592bd5d26742283c312`）和 Root 明确的 test-only 范围。计划 Task 1 测试 10 cases，加 Task 2 Step 1 测试 12 cases，合计 **22**；Task 3 中遗留的“20项”文字不用于计数。

| 新增方法 | 静态 cases | 断言范围 |
|---|---:|---|
| SupplyFrenzyMinimumBoundariesUseWholeIssuance | 4 | Bomb 2647/2648，Pickup 642/643；minimum−1 拒绝、exact 接受 |
| SupplyFrenzyEnableAndSkillFlagsProduceIndependentBounds | 3 | Supply off 2624/639；on 且 skills off 2648/643；on 且 skills on 2648/650 |
| SupplyFrenzyTwoSequentialCandySourcesRequireFortyEightAcceptedBombCredits | 1 | 两份来源完整 +48 bomb，2672/643 |
| SupplyFrenzyElevenSupportedSourcesAreRejectedByTheUnchangedFormalMaximum | 1 | required 2888 > provisioned 2784 |
| SupplyFrenzyUsesTheExclusiveEndTickAndActualConfiguredDuration | 1 | 6001ms→120Tick/+24，6050ms→121Tick/+25 |
| SupplyFrenzyRejectsUnmeteredOrInvalidAuthoredSources | 10 | 两个错误 schedule、总量超11/大整数、duration/fuse 0有效Tick、随机池/错误kind/ledger/别名来源 |
| SupplyFrenzyDisabledConsumerCannotBeAnEnabledCandySource | 1 | enabled source + disabled consumer 拒绝；count0 接受2624/649 |
| SupplyFrenzyVeryLargeFiniteWindowCannotWrapTheRequiredBombCountToAnInt | 1 | ulong required 9448928369 精确诊断，不能 cast 截断 |

新增 5 个 Fact、17 个 InlineData 行，即22 cases。原源码是7 Fact +76 InlineData，即83 cases；追加后全类12 Fact +93 InlineData，即105 cases。这是静态计数，尚无实际 discovery/pass/fail/skip/child exit。

源码身份：

- 新完整测试文件：`935511ee1e140dbc9a73516285314d1b164328d29169bce43ffdcbba63390787`。
- 移除唯一新增片段后，以原 UTF-8 字节重新计算：`f7fa1afca72921b6f33f699cd29c09164478e9d60dc368189868b89395a9eb1c`，与原83 cases文件完全一致。旧 Remote/profile/composite/M2/Fire/Split/overflow断言及原 AuthoredFixture 未改。
- 预算生产 `Gameplay/Config/BomberObjectBudgets.cs` 仍为 `d0a5314813c931971dba301a9765f761d0c748396975a17f08fc50053c81e415`。
- 独立13 Native关联测试仍为 `23e8b7369e054dc3b95fcb90d3c718dfd7f25cf018b042d58771aa91ef012a26`。

测试复用原真实 AuthoredFixture.Change/Compile 与 BomberConfigBinding.Read。夹具复制当前完整 schemas/tables/registry，再走真实 CLI；未手建 GameRow，不删新增13列，也不使用替代预算服务。只读核实 fixed runner 的 `LUMIO_CONFIG_ROOT=C:/Work/LumioGames/LumioConfig-101-authoring` 和 complete06 manifest `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，未改 runner 或环境。

当前旧 calculator 静态预计新增22项中1项（Supply关闭且skills开启）保持绿色，其余21项失败；实际必须以 Root 的 fresh build 和实际 discovery 为准。1000Hz大窗口案例在旧 calculator 中可能先报原 FireZone 容量不足，测试仍要求新增 bomb 边界的精确 required 数值；这不等于证明新边界已实现，也不提高 FireZone/configMax。CLI拒绝、Native fixture启动失败、编译失败或零用例不得计为这些预算行为 RED。

Root 待运行入口（本轮未调用）：

```powershell
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Mode build -Label 'supply-frenzy-budget-red-build-01'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-frenzy-budget-red-01' -Filter '*BomberObjectBudgetTests' -Method '*SupplyFrenzy*'
```

待落实际证据：`games/101-bomber/.run/v14-native-production-20261003/supply-frenzy-budget-red-build-01.{json,log,exit}` 和 `supply-frenzy-budget-red-01.{json,log,exit}`。真实作者输入、输出、compile.log 由原夹具保留在 `games/101-bomber/.artifacts/authored-config/<guid>/`。这些运行路径目前只是交接落点，本报告没有填入虚构结果。

没有 GEN/build/test/format、upstream、旧冻结、production、配置max、生成目录、提交或 spawn。重型窗口仍由 Root 独占。本报告不将 TDD RED、Task 2 production 或 Task 3 Native组合标为完成。
