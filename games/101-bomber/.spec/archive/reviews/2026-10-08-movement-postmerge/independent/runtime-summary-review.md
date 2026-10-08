# Root 汇总材料独审：Runtime 证据口径

日期：2026-10-08。Reviewer：`/root/runtime_review`。

范围：只审本轮 README 的 R1 / R2 / C1 以及唯一账本 checkpoint113，检查源码推演是否被记作已执行 RED、修复归属或 Owner 门是否越界、是否存在必须修正的事实错误。本记录不重新审 root 的 Game 合成 pose 实验执行过程，不代表浏览器或移动手感验收。

## 结论

**证据分级及权限边界通过；有一处必须更正的测试证据链接。** 未发现把未运行的 Runtime / Client 推演冒充 actual RED，也未发现 Owner 门被自行批准。除下列链接外，在本次限定范围内未发现必须修正的事实错误。

审阅快照：

| 文件 | SHA256 |
| --- | --- |
| `repos/LumioGame/games/101-bomber/.spec/archive/reviews/2026-10-08-movement-postmerge/README.md` | `d261c02bba556c6e64bf5cf0cc05cf737b9138376583c317111ca8ebb02af3ec` |
| `repos/LumioGame/games/101-bomber/.spec/plans/2026-10-02-delivery-progress.md` | `af5789993c658929c72651b9f062fee20a54bacba13428ebc3a4dd486feed805` |

## 唯一必修项

**P2 — R2 的 late replacement 测试链接指向了错误文件。**

- 位置：README 第 56–58 行。
- 第 56 行描述“现有 late-replacement 用例把替代目标设到旧显示位置”。这一事实成立：Runtime `f69e2c9445fd5cf39b005c0857308cd96da1f04d` 的 `modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/OwnerExpiryContinuityTests.cs` 第 71–80 行，`SameOrdinalLateReplacementCannotCreateOrRestartExpiredEligibility` 在 `.175` 把替代目标设为 `.25`；`initiallyMoving=true` 时旧 Model 也为 `.25`。
- 第 58 行当前链接却指向 `OwnerModelTransformTests.cs`，读者无法在该文件找到所描述的测试。
- 修正：把该链接目标改为同一 SHA 的 `modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/OwnerExpiryContinuityTests.cs`，可注明第 71–80 行。无须改变 R2 的候选状态或结论。

正确来源：<https://github.com/LumioGames/LumioGameRuntime/blob/f69e2c9445fd5cf39b005c0857308cd96da1f04d/modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/OwnerExpiryContinuityTests.cs>

## 已核验且未见越界的表述

| 对象 | 本次核验结论 |
| --- | --- |
| R1 三角回收 | `ModelTransform.Owner.cs` 第 89–98 行确定：有资格且非零的前探在固定目标、无新结果、零纠偏残差条件下，于 h 到 2h 的速度与原前探速度相反。README 把现场进入频率保留待网页记录，没有宣称已测浏览器回拉。7fa 与 f69 的 Owner blob 相同已由此前源码读取确认。 |
| R2 同 ordinal | 第 50–64 行保留原 admission、清 velocity、过期不重新赋予 velocity；所给 `.25 → .2` 是附条件的源码反例。README 明示未执行 C#/Native RED，要求先确认 publication 前提，未计入已跑测试。 |
| C1 同 pump 完成时间 | Client 起点采时与 Runtime 资格使用最后 presentation time 的顺序支持该候选；`.157 → .160` 的 `.006m` 标为条件计算且明确“不是测量值”。没有把同步 Accept 的中间写声称可被正常 rAF 读取。 |
| checkpoint113 | 正确把 Runtime 同 ordinal 和 Client 同 pump 两项记为源码推演、未执行 C#/Native RED；局部 Game 方法实验另列，并明确合成采样不等于浏览器/WASM/Native/Game35。未更新生产或页面字节，未宣称部署或热更。 |
| 修复归属和 Owner 门 | Runtime 表现资格/残差及 Client 时钟链分别归属；未提出 Game held-key 影子真值。ADR142、18085、生产 schema 保持 OPEN，移动验收保持 FAIL；CI 编译与行为验收分列。 |

本次未修改被审文件、未执行新的测试、未修改远端，也未新增任何 Owner 裁定。

## 修正复核收据：PASS

2026-10-08，root 修正后再次只读核验：

- 原 P2 finding 状态：**resolved**。README 第 58 行现指向 Runtime 精确 SHA `f69e2c9445fd5cf39b005c0857308cd96da1f04d` 的 `OwnerExpiryContinuityTests.cs`，标注第 71–80 行，与所述 `SameOrdinalLateReplacementCannotCreateOrRestartExpiredEligibility` 一致。
- 通过逆向替换并比对上次 SHA256，确认 README 相对本次初审只有该链接及对应标签/行号修正。
- 将当前账本末尾补回一个 LF 后，SHA256 与初审值完全相同，确认账本只是移除段末多余 LF，已审正文未变。
- 最终结论：**PASS（本次限定范围的证据口径独审）**。没有未解决的必修项。此 PASS 不代表 Runtime / Client 反例已运行，也不代表浏览器或用户移动手感验收。

复核快照：

| 文件 | SHA256 |
| --- | --- |
| `repos/LumioGame/games/101-bomber/.spec/archive/reviews/2026-10-08-movement-postmerge/README.md` | `66bf92b0f8192638ef229015bd9d1e0ebb171cc34fb3c7390d72b01e98828988` |
| `repos/LumioGame/games/101-bomber/.spec/plans/2026-10-02-delivery-progress.md` | `425d56b3427559774b89ffcd8bed268a225d57d0f9b690bf29bd157cec5110ae` |
