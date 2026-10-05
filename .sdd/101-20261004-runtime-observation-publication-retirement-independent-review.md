# Runtime 旧观察发布退休：有限非作者审查

裁决：**ACCEPT_EXACT_RUNTIME_PUBLICATION_RETIREMENT_TWO_SOURCE_COMMIT**。没有发现本次精确差异的 P1/P2 问题。仅允许下列两源进入私有精确提交及后续官方完整消费准备；此结论不是真实 Rust Host 分页或浏览器体验验收。

- `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.Successor.cs`，SHA256 `3470c7538d23747d5175c64a9098e8fd168302acf29b84e0567bb0fec679c283`。
- `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/modules/replication/tests/Lumio.GameRuntime.Replication.Tests/SuccessorPublicationRetirementTests.cs`，SHA256 `dd4698d913e7551164458781c35d5d2547196e54d33bd6b7824610cb995c9a86`。

基线为 Runtime `520ffe482e1c48fb6e48187925eecec986cdb9c8`。计划为 `C:/Work/LumioGames/LumioGame/docs/plans/2026-10-04-bomber-old-observation-publication-retirement.md`（`778aade3a34e0b4c7a3dea6c653cf3ba447090c589d9d5be9c2dfe6d06a508a2`）。本审核人不是两源作者；执行仅为源读取、既成日志读取、字节比较及新独立证据写入，没有构建、测试、Native、浏览器、服务或生产操作。

## 源行为与完整逆比较

生产唯一增加的是成功 activation 内、原 `SetSuccessorObserver(...false)` 之后的 `CancelSuccessorPublication(entry, previous.ConnectionGeneration)`。独立以成功 activation 的完整相邻语句锚定移除此一行，整个文件字节精确回到冻结 RED02 编译源 SHA256 `18013d7e0ff369d1de55b054da4768f275292e317cd52dc1539297dadd21dca0`；没有移除 Reattach 中原来已有的同名调用。

该位置已经通过原 attachment、两次 Ready/Restoration、EligibleTick、Connected、epoch 增量和新 activation publication 预留守卫。任一失败仍由原 `FinishSuccessorTransfer` 返回/继续，在新增调用之前结束。新增调用只在既有 credit 集合中匹配同一个 reservation 引用及准确旧 epoch，并标记 `PublicationAbandoned`，没有 Native 查询、权威替身、新容器、额度更改或即时退款。

原 `RecordSuccessorPublicationDrain` 和 `ReleaseDrainedSuccessorCredits` 后续结算仍保留：旧 credit 需要原 Result/Game 消费后释放；新 transfer credit 的 Result 尚未赋值或属于新 epoch，不会被这一旧 epoch 调用匹配。新 Observer 的 Welcome、全部 census、Baseline 及正常 Game 消费仍由原路径完成。此修复不伪造旧 `BaselineClosedTick`/ACK，也不提前完成新代 census。成功转移已经退休的旧 Observer 无法再生成剩余分页，因而旧 credit 此时依法进入已有 abandon 生命周期。

## 同源真实 RED/GREEN 前置

审核过原 test 全文及其原 Harness/HostedAdmissionFixture/Scenario 路径。新 test 使用真实 Native 初准入 Acquire/Reserve/Enqueue、每帧 SHA/digest ACK 与 Settle；每拍先取 section subscription deltas，正常 Tick 后完整 DrainOutbox 一次。256 个原 Room-scoped、每个 1024 字符的实体在实际断开且没有观察者时建立。CreatesPerPack 原默认 0、每物理帧原 65536、publication 原 16 MiB 均未降低。反射只读取既有 credit，不写入字典、字段或权威。

首死亡是真实 GAS lethal，随后实际 Prepare/Destroy、Create、Restore、Restoration witness/Ready。C2 新 epoch3 的前两自然分页尚未完成就按原规则成功转移至 epoch4。新受控 census 的 256 个唯一 Room ID 全部发布且自身 credit 正常消失后，C3 再进行真实 Native 完整初始 ACK/Settle，最后实际 lethal/Prepare。测试没有省略 drain、伪造 ACK、手工清 debt 或改约束以制造 RED。

| 原始记录 | 实际退出与结果 | 核验范围 |
|---|---|---|
| attempt-02 build | raw 0，0 warning | 正常项目、锁与完整引用图；第一次长路径行政失败保留 |
| attempt-02 test | 内层 dotnet raw 2；1 FAIL / 0 skip | post-Tick23 首 Prepare 返回 `successor_reservation_invalid`；旧 epoch3 reattach credit 446579 B 在自身新 census 完成后仍留存 |
| attempt-03 build/test | build raw 0；test raw 0，1 PASS / 0 skip | 完全相同 `dd469…` test；成功转移10只剩 epoch4 transfer credit 446957 B；19全部 census 正常结清；C3 初准入无 debt；23第二死亡 Applied observe epoch6 |
| guards04 四组 | raw 0；6+1+1+5 = 13 PASS / 0 skip | Deferred live witness/eligibility/attachment 与 publication 增长/拒绝边界、正常 activation、错误 restoration revision、独立 target/restoration 矛盾 |
| healthy05 两组 | raw 0；4+1 = 5 PASS / 0 skip | 原受控重新准入四案与 observing→transfer→controlled 新准入一案；私有正常 test 副本不属于提交输入 |

GREEN23 自己的新 observe credit 446577 B 仍为完整 census 未完成、未 abandoned 的真实 pending；没有一概豁免 credit。日志的 `tick` 为步骤结束后的 World tick；其 WorldChange 内 Tick 少一拍，不能混成 Console 时钟。JSON 的大 ulong 请求/实体值在独立读取前保留十进制文本，避免 JS Number 舍入。

原 `SuccessorBindingTests.cs`、`SuccessorEligibilityTests.cs`、`SuccessorCorrectiveTests.cs`、`SuccessorPublicationGrowthTests.cs` 均另外与原 520ffe blob 做 EOL-normalized 比较，内容相等。当前最终两候选源码与作者冻结源逐字相同。

实际此轮 Native 输入来自完整14，SHA256 `e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89`。这是当前 Native fixture 的身份，不承诺未来官方完整16重新构建后 Native/WASM 的字节仍等14。本轮不重复 whole SDK/PDB 审核；作者正常 PE/PDB SourceBindings 保留归属，独立核验的352件包括其冻结实际产物及原始记录字节。

## 冻结与生成副作用

作者最终 manifest：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeSuccessorPublicationRetirement/.run/old-observation-publication-retirement-01/final-seal-01/manifest.json`，SHA256 `5cfaf1f4299fb59d3ab19974a4976e978f9f086c71620c8ca3bc389884e60a7d`。352 件冻结文件的长度/hash 已独立读取，零漂移。两个当前候选的 raw hash、完整逆比较、12 原始 build/test 记录与八个实际 test summary 均封入独立结果。

独立结果：`C:/Work/LumioGames/LumioGame/.run/old-publication-retirement-candidate-independent-review-01/result.json`，SHA256 `b14bd139a5b2b136de9c817d02f8abafeab4e3c05664f788c1a0068104219e65`。

Root 后续精确提交为 `da24b0d6a401adbcb2c1cbcda8464fcac6287d66`。Root 原保护脚本仅对空 normalized-diff 集合执行，不能声称它当时检查过38条 EOL 文件。独立补证实际筛选当前38条 generated 路径，逐项与既成 RED02 compiled-source frozen 的物理字节/hash 比较，全部相等；并逐项确认 normalized 内容等原520ffe blob。本结论为「提交后38物理字节仍等既成 RED02 冻结源」，不追认原脚本的执行范围。

补证：`C:/Work/LumioGames/LumioGame/.run/old-publication-retirement-candidate-independent-review-01/generated-38-supplement.json`，SHA256 `b39b6ab58ac1a57a08d3046fb46de2dcdabad487db7017e2effc59e6d6b1027c`。没有 stage/restore/generate，38 条副作用仍应保持原现场，不纳入提交。

## 下一阶段真实 Host 测试复用点（仅只读建议）

正式 Server 基线应使用 `C:/Work/LumioGames/.101-pack07/LumioServer11PreparedReentry` 的 `008861074a2d3c9da1b0407325ede6f851704fd5`，不是 OfflineDeath3 的公共 Owner Pending 草稿。

最佳现有入口是 `Tests/tests/prepared_browser_reentry_real_clr.rs`，包含 `successor_real_clr.rs`：实际 DsHost/ClrGameplay/完整 SDK/Native、签票账户/房间/allocation、新票重新开 socket、真实 close 和正常 run_tick 均已具备。C# fixture 实际位于 `Tests/fixtures/successor_runtime/`，由 `Lumio.GameRuntime.Gas.SuccessorFixture.csproj` 正常 net10 PackageReference/严格锁/GEN 构建。`SuccessorScenario.cs` 的 ProcessorPlan、`SuccessorFixtureSubsystem.cs` 的 WorldSubsystem、`SuccessorBindingDeclaration.cs` 的声明及 `generated/server/Lumio.GameRuntime.Gas.SuccessorFixture.Registry.g.cs` 是真实声明与注册路径；Host 经 `LUMIO_SUCCESSOR_REGISTRY_DLL` 消费。

该 Server fixture 当前没有 Census 类型。后续隔离 test 可以复用 Runtime 原 `modules/gas/tests/fixtures/successor/AdmissionCensusEntity.cs` 和 `AdmissionCensusPayload.cs` 两个正常声明（Room scope、1024字符串），再由正常 GEN 注册；不能复制 generated registry/DLL 或以 Runtime 测试 DLL 替代整个 Server fixture。

原 `Network/src/wire.rs` 的 `RoomClient.try_recv_text` 只取得原始消息；原 test 首条 WorldChange 的判断不足以证明256完整 census/Native initial cursor。第二阶段需要原 WorldChangePart 完整解析/唯一ID集合，加原 `Engine/src/admission_attempt/publication.rs` 的实际 cursor ACK/digest、PublicationReconciled 与 `owner/admission/lifecycle.rs` 的 Written fence/Released 证据；若使用测试委托，只观测原调用一次、原返回，不新增查询或伪造 ACK。原 successor writer fence 是当前 group 的完成，不是尚未生成的未来 census 页完成，因此自然分页期间合法 Ready/transfer 可复现。

此有限审查没有确定旧现场 death13560 当时的直接首拒码，没有 signed Host 同分页 GREEN，也没有浏览器 Running/十次重开/移动或性能改善结论。没有 Offline7/DRAFT 或公共协议语义变化。
