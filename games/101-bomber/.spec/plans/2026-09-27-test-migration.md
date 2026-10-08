# 第一轮测试迁移记录

此记录解释 Sample 用例随产品内容移除的范围；它不是规则验收报告。第一轮骨架测试通过也不等于第二轮玩法或第四轮确定性门通过。

| 旧用例 | 处理与对应责任 |
| --- | --- |
| BomberMiningLocation / BomberMiningPlan / MineContentionScenario / MiningRpcBatching / ProductionMining / VeinLocationTestSupport | 随矿脉、挖掘、矿石及对应 Bot 场景一起省略。Bomber 的体素拒单、成功后掉落、同弹与争抢行为由第二轮爆炸/拾取规则矩阵重新实现，不以矿业断言代替。 |
| BoxComponentTests | Sample 可打开库存箱不在本游戏范围。Bomber 强力宝箱的三次命中、绑定和事务验收在第二轮宝箱单；没有以删除旧箱测试声称新宝箱通过。 |
| SectionResidencyRoundTripTests | 原测试绑定矿脉扫描与矿脉实体。Bomber 19×19 常驻底图与强力宝箱绑定由本游戏验收；引擎通用 Section 驻留已由上游负责。 |
| BomberSimulationTests | 独立 C# 影子世界被删除。原四用例包括错误帽子抵伤及仅四玩家的“八 Bot”断言，均不能证明真实引擎规则。新增 BomberWorldDeterminismTests 只测真实 WorldManager 骨架快照；完整输入回放仍待第四轮。 |
| BomberWiringTests 的私有 CommitTickLoop | 去除反射 CommitCommandBuffer / PublishEgress 的旁路，全部改用 WorldTickBinding 与 WorldManager.Tick。新增真实实体创建、六属性两本账与唯一技能 ID 测试。它不等于八客户端入房证据。 |
| MoveAbilityTests / PlayerLifecycleTests | 旧整格挖矿移动已退役。第一轮测试当前双方向输入、空放弹输入、完整 ID、真实 Tick 创建与快照恢复；连续移动、碰撞、闪现、重生在第二轮实现并由矩阵验收。 |
| SourceHygieneTests | 只移除专属 MiningCallback/PendingDig 守卫，保留路径、SDK、快照和 CI 边界守卫；CI 文件路径改为父仓 bomber-101.yml。 |
| launcher 的矿业/DS checkpoint/重启恢复用例 | 与不在本轮范围的矿业、存档重启场景一同退役。改为十四步 Bomber 证据用例：单次 DS 启动、真实准入、同房间不同 MatchId 的后续 MatchStarted；缺事件/缺 Bot 结果、超时或 DS 提前退出不能通过。完整 BomberMatchScenario 缺失仍有失败门，未跳过。 |
| launcher README 路径断言 | 旧 `.run/server.local.json` 不再是启动器输出，改为核对实际 `.run/launch-*/server.boot-1.json`；runtime+voxel 与 snapshot_only 断言保留。历史 stress-move 文件随不在范围的旧压力工具移除，其余路径卫生守卫仍执行。 |
| 根 RuntimeIntegrationProbeTests.AllFiveEntityTypesRegisterCreateAndParticipateInSnapshot / CustomComponentRegistersAndParticipatesInSnapshot | 旧声明迁入独立工作区后删除根 probe。`BomberEntitySnapshotTests.CurrentEntityDeclarationsAndTheirFieldsSurviveRealSnapshotRestore` 用正式发布 SDK 创建当前玩家/炸弹/拾取/宝箱/火区，实际 Capture→Restore，核对类型、完整 owner ID、字段与唯一位置组件；旧帽堆类型已退役，不保留兼容实体。 |
| 根 RuntimeIntegrationProbeTests.LogicTransformPositionEntersSnapshotHash | `BomberEntitySnapshotTests.ChangingOnlyLogicalPositionChangesTheSnapshotHash` 通过正式 TransformController 写位置；仅位置不同即 hash 不同，相同位置重复一致。 |
| 根 RuntimeIntegrationProbeTests.SameSeedAndCommandSequenceProducesByteIdenticalSnapshotOnTwoIndependentWorlds | `BomberWorldDeterminismTests.RepeatedFoundationWorldsWithIdenticalAdmissionsHaveIdenticalSnapshots` 在两个独立真实 World 中按同序下单八玩家，逐 Tick 比对十帧非空快照 hash 并确认帧间变化；覆盖原声明探针范围，不代表完整 Ability 输入回放已完成。 |

全测试源码 glob 保留；不使用 Compile Remove、skip、测试过滤器或空集合断言绕过必跑内容。第二轮新增规则测试必须覆盖当前 stage0-test-matrix 的全部行，未实现行为不能记为通过。

根壳迁移后的本地验证：`dotnet build LumioGame.sln` 0 warnings / 0 errors；带实际 Native 的 `dotnet test LumioGame.sln` 为 total 32 / failed 0 / succeeded 32 / skipped 0；根 Node 48/48。新工作区 Gameplay 为 45/45、0 skipped。根剩余共享声明用独立 WorldEntity 挂 WorldSaveComponent 并声明 20Hz，测试启动器和 Chat/Identity 行为代码保持原样。生成器重生后只退役十个无源 Bomber 生成文件，未手改生成内容；非 Bomber 属性 JSON 与迁移前逐项相同。

架构仓旧四条豁免随迁移移除后，真实 `native-exemption-guard` 对账为 32 总计、16 CI 执行、16 排除且16登记，退出0。Windows 调用需 `DOTNET_CLI_UI_LANGUAGE=en-US` 与足够 `COLUMNS`，否则现有列表解析器拒绝本地化/折行输出；首次环境失败证据保留。新工作区依正式发布 Native 验证，不继承根 CI 的这四条旧豁免。
