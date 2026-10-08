# 旧观察 publication 退休：作者实际 RED/GREEN

裁决范围：真实 Runtime Native/provider 夹具复现，唯一生产补行与同一回归 GREEN；等待非作者裁决。没有 commit/stage/正式包、Rust 签名 socket 或浏览器验收声明。所有源码与测试已停写、停跑。

## 精确候选

基准：`520ffe482e1c48fb6e48187925eecec986cdb9c8`，独立树 `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement`，branch `codex/101-successor-publication-retirement`。

只交这两项：

1. `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.Successor.cs`，SHA `3470c7538d23747d5175c64a9098e8fd168302acf29b84e0567bb0fec679c283`。只有 `ActivateDeferredSuccessors` 成功路径新增一行：

```csharp
ObservationAttachment previous = entry.Attachment;
_successorMutation = new(entry.Token, request.RequestId, "transfer");
SetSuccessorObserver(entry.Participant, previous.ConnectionGeneration, false);
CancelSuccessorPublication(entry, previous.ConnectionGeneration);
```

原完整 activation 验证和 `TryReserveSuccessorActivationPublication` 已在这段之前成功。仅交现有 helper 准确的 previous epoch；原 helper 按 entry 引用及 `Result.NewAttachment.Generation` 标记 PublicationAbandoned，随后原 `DrainOutbox` 在 ResultDrained/GameConsumed 条件下释放。没有假造 censusComplete/closedTick/ACK，没有取消新 transfer epoch，所有失败入口、配额、Host、协议与 Offline7/DRAFT 都未改。

2. `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/modules/replication/tests/Lumio.GameRuntime.Replication.Tests/SuccessorPublicationRetirementTests.cs`，SHA `dd4698d913e7551164458781c35d5d2547196e54d33bd6b7824610cb995c9a86`。唯一新 Fact 在原正常 `SuccessorBindingTests` partial 内，复用未改 Harness/HostedAdmissionFixture/Scenario。RED/GREEN 该文件逐字相同。

原生产文件 SHA `18013d7e0ff369d1de55b054da4768f275292e317cd52dc1539297dadd21dca0`。锚定 transfer 的唯一补行逆移除后，完整 bytes 与原文件完全相同；证据 `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/.run/old-observation-publication-retirement-01/one-line-inverse03.json`。private healthy 副本、targets、原生成物、行政工具及文档不属于这两源候选。

## 实际因果与时序

正式14 Native：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-14/server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll`，SHA `e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89`。每个新进程都记录实际路径、hash、build-info，并正常装配 Native World。Engine源码根 `C:/Work/LumioGames/.101-pack07/LumioGameEngine11SdkClosure`，HEAD `523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0`。

默认 `CreatesPerPack=0`、65536帧上限、16MiB successor publication、4096 result/reservation 不变。256个现有 AdmissionCensusEntity 的原 Room 字段各1024字符，只在 C1 真实 Disconnect 后没有 connected observer 时创建。不是256玩家、不是减少真实游戏人数；这是原正常容量夹具的数据声明。每拍 TakeSection、Tick、完整 DrainOutbox，实际 Codec 每个普通 WorldChange 并断言不超过65536。初始 C1/C3 使用原真正 Native immutable publication、全部 cursor逐帧 SHA ACK、digest 校验、真实 settlement。

下表 Tick 是 `Manager.Tick()` 返回后的 `World.Tick`；对应 WorldChange.Tick 是前一拍，不混作同一个字段。

| post-Tick | 实际事实 |
|---|---|
| 初始 | C1 normal Native initial ACK/settle 完成，没有初始 debt |
| 2–5 | 真 lethal→Prepare/Destroy observing2→actual Create→Restore；实际 effect witness instance非0 |
| 6–7 | C1 Disconnect、participant Observer=false，然后创建256 Room数据，无 WorldChange |
| 8 | C2 reattach Applied observing3，真正 Welcome+第一自然页28 creates/32695 bytes；旧credit446579B |
| 9 | 真 Ready request2/witness，第二自然页27 creates/32160B；全部256尚未进入，旧credit未complete/closed/drained |
| 10 | 原完整 grant→transfer Applied controlled4，第一新页27 creates；旧observer退休，新credit446957B |
| 11 | 真 Game consume transfer，新生命 current/last政策按正常fixture更新 |
| 12–19 | 新 controlled 全256 Room实体实际逐页发布；自身 transfer credit 在真实完整 census/drain 后消失 |
| 20–21 | C2正常 Disconnect；C3 normal Native Acquire/Reserve/Enqueue/全部 initial ACK/digest/Settle，实际控制同一新生命 |
| 22–23 | 新生命在线 actual lethal health0，再 ProcessorPlan Prepare |

RED02 到23返回 `successor_reservation_invalid`。只剩旧 reattach epoch3/request9007199254740994 credit446579B，ResultDrained/GameConsumed/WelcomeDrained=true，而 PublicationComplete/PublicationDrained/BaselineDrained/PublicationAbandoned=false、BaselineClosedTick=null。新 controlled自己的 credit 已在19释放，C3 initial也全部 settlement，故并非漏新 drain/初始 ACK。

GREEN03 只加候选一行：旧 epoch3 在成功 transfer10后按原 drain 释放；新 epoch4仍保留到19真实新 census完成才释放。23实际 Prepare返回null，旧新生命真正Destroy，新的 observe Applied epoch6，下一 observation正常拥有自己的未完分页credit。测试全部后续断言完成，不是只看 error=null。

这与旧14 CURRENT 快照的旧 reattach61残留、新 controlled62已消耗的字段形状相同；没有声称抓到旧 death13560 的历史首返回码。没有新 PSS、诊断 pipe、Game/Native 查询或 live源更换。

## 实际验证与退出

| 标签 | 应用 raw exit | 结果 |
|---|---:|---|
| build01 | 1 | 行政失败：NuGet 文件路径262字符，MSB3106/MSB3030，未执行case |
| build02 | 0 | 正常短独立 NuGet cache，0 warning/error |
| RED test02 | 2 | 1FAIL/0PASS/0skip，唯一末尾 Assert.Null失败，actual码 successor_reservation_invalid |
| build03 | 0 | 唯一补行后的正常图，0 warning/error |
| GREEN test03 | 0 | 同一source/test 1PASS/0skip |
| guards-deferred04 | 0 | 6PASS/0skip：原 DeferredGrant 四种 liveWitness/eligibility/exactattachment 变异及原 DeferredTransfer 两种当前增长/额度拒绝 |
| guards-witness04 | 0 | 5PASS/0skip：IndependentTargetAndRestorationContradictionsCannotAuthorizeControl |
| guards-revision04 | 0 | 1PASS/0skip：CorrectiveWrongGeneratedRestorationRevisionCannotBeRelabeled |
| guards-positive04 | 0 | 1PASS/0skip：GeneratedNativeOwnerDestroysObservesRestoresAndActivatesOnlyAtEligibility |
| healthy05 build | 0 | 独立正常新Artifacts图，0 warning/error |
| healthy-controlled05 | 0 | 原 TransferredControlledLifeCanPrepareItsNextDeathAfterFreshAdmission 四案4PASS/0skip |
| healthy-observing05 | 0 | 原 ObservingFreshReadmissionTransferThenControlledAdmitAllowsNextDeathPreparation 1PASS/0skip |

总计当前候选新case1＋有限守卫13＋原健康5＝19PASS/0skip；原RED1FAIL保留，不相减合并成假净通过。test02应用 rawExit=2，外层工具返回1须分栏，不能把工具值当测试应用码。

healthy两源逐字复制到私有输入，不改原健康树、正常private partial fixture边界不变，不纳提交：ControlledReadmissionDeathTests SHA `c3e9a13cd540a44a9cddf62f7694d5668c5588dbefe9a1177c32ec4383ef5dff`；ObservingThenControlledReadmissionDeathTests SHA `a08a047893a8bcf08ebab0d69c9233c2f0efc819e25db93792d6e525870fce9d`。私有 targets仅在原 normal replication test项目增加两个 Compile输入，没有移动生产图/替换 DLL。

## 封存与限制

共同证据根：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/.run/old-observation-publication-retirement-01`。

- `red02-frozen/manifest.json` SHA `4536f51584b94c983cefd31e1b1a8f7b8c1cf5d6ccb8d23d4d67399510b37383`：209件，正常140 bin及Content、13实际源输入、原raw和Native身份；修补之前已冻结，不被GREEN覆盖。
- `red02-compiled-source-supplement/manifest.json` SHA `6b9cccb416cdda0b96b2cfb54ac6bc65c4c009178d11ae5942307a5cd74019c5`：已完成的只读源码/PDB辅助，实际38物理CRLF变更、0规范化语义变化，原140闭包不缺 Fixtures。原 analysis.generated=0 仅是 Git规范化diff，不能声称物理0漂移。
- `final-seal-01/manifest.json` SHA `5cfaf1f4299fb59d3ab19974a4976e978f9f086c71620c8ca3bc389884e60a7d`：352件，GREEN normal140＋private healthy normal140、精确两源、所有raw/行政原件。
- `final-seal-01/result.json` 列命令/原始退出、每案计数、4个有限 test/Ecs CodeView-PDB/source绑定，0 mismatch；不声称重新完成整个SDK发布身份资格。
- `attempt-02-test.log` SHA `f6c72f5fa33e8774948d09b7d0b0d5846f41e903edea92ae7ae1be398ec42299`，result SHA `a40ac9366080d146ecba85a22f31465473068e0da84185d5dbd765a4e8f84b1c`。原64位数值留decimal原件；派生分析对大整数保留字符串，不用JSON Number关联。

原build01长cache、seal脚本Windows ESM路径错误、两次未锚定inverse误移除已有 Reattach同名cancel的false行政比较均保留。最终锚定activation-only inverse03真实完整byte一致；这些行政失败不算生产行为RED。

38生成物物理行尾副作用原样留树，未 restore/clean/暂存。未加入未批 offline 本地观察结算/DRAFT。当前未新增任何 Host lifecycle 或公共协议；真实signed Host 分页/Ready/fence/全initial settlement仍待第二阶段。真实双浏览器、八人、十次关闭重进与性能最终验收仍属于 Root后续正式包消费工作。
