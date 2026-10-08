# Runtime 准入准备源独立窄审

结论：**NEEDS CHANGES**。正常路径现有 6 项测试独立复跑通过；预算与 Native cut 复核尚未闭合，不能批准正式 provider/profile。此次仅审实体/Section 准备源，不评定最终 Rust grant/source service。作者已明确这些是未完成切片。

只读树 `C:/Work/LumioGames/LumioGameRuntime-101-hydration-complete-world`，HEAD `e0f6725f69f348a2d487e6e5aeafec5cf1b8ca4b` + 作者暂停写入的 5 源码。没有修改 Runtime 源码、生成文件、bin/obj 或索引。核对作者 `.run/101-controlled-admission-provider/source-review-manifest.json`（SHA256 `92673b10995d4a6522ad449c2ccee578f53cdcf4a4a4a1d0fea65dc33d165eb1`），5 源与 2 test DLL 均 7/7 精确匹配。

## 需要修复

1. **P1，分配早于源预算准入。** `AdmissionEntitySnapshot.cs` 的 `CaptureAdmissionEntities` 在 `ValueText` 已创建文本后才 Charge，`ToCreateRecord` 再次捕获可见字段却未带 reserve；Effect `CaptureWorld`、MemoryStream 扩容、EncodePack、readSet.ToArray 均先创建完整副本，再收费或未单独收费。`WorldManager.AdmissionSections.cs` 在任何 byteLimit 入口之前构造 wanted/read cache、读取并 ToArray 全部 binding；`AdmissionSectionSnapshot.Acquire` 才以常数统计这些已经持有的结果。小限额因此仍可造成与完整世界大小相关的瞬时分配。这不满足边界前拒绝，修复应通过受限 writer/预先尺寸准入，并对实际保留和临时编码所有权逐项计费；需要大 container/大 census/小预算 RED，不能只断言最后抛错。

2. **P1，Section ValidateCurrent 未覆盖捕获的全局 Native cut。** Acquire 将 WorldGeneration/CapturedWorldRevision 固定进 Entries 并检查各 lease 一致，但 ValidateCurrent 只重读 wanted bindings 和各 Section binding revision。区块集外 Native mutation/恢复或 world generation 变化而 wanted/binding 值不变时，当前全局 cut 可以不同，仍有通过路径。必须复核与 capture 相同的权威 incarnation/generation/global revision，或在最终共享 reservation 的读集合中绑定并验证这些精确字段。实际 Native 测试必须包括相同 wanted/binding 下全局 cut 变化；现有测试只修改 wanted Section 本身，不能证明此边界。

3. **P1，ValidateCurrent 将第二份完整实体 snapshot 作为未合并峰值的验证工作区。** `AdmissionEntitySnapshot.ValidateCurrent` 在旧 `_bytes` 仍持有时按相同 `_byteLimit` 再调用 CaptureAdmissionEntities，并产生新的 read-set stream、sync clone、Effect bytes 和完整编码。即使单次 Capture 自身改为正确预付，旧 source 与验证工作区仍需同一个 grant 的峰值/保留账本，不能各获得一份 byteLimit。Section ValidateCurrent 同样先复制新 binding 集。修复可用有界、可重复的 read-set 验证器，也可在 Acquire 预留精确验证工作区；需要两个并存对象预算的 RED。

4. **P2，失败释放路径未有实际验证。** Section catch 会 Dispose 已加入 result 的 leases；若释放抛错，会通过 SectionProducerCleanupException.Cleanup 保留对象，方向正确；逐 lease Dispose 的 Released 检查支持部分成功后重试。现有 3 个用例未注入第二次 Read 失败、digest 不一致、最后 Native lease release 失败或多 lease 部分释放，因此尚不能证明失败不丢所有权、重试不重复归还、旧 payload/charges 保留到真实释放。另 TryAcquireInterestSet 内部失败仍由 producer 固定 registry 持有 orphan lease，最终 grant/service 需要承接这笔 closed debt；不能把 false 当成没有产生资源。请补 owning seam 的实际 Native/可控错误证据，不关闭功能或吞掉清理错误。

## 已确认正确的部分

- 实体源在 owner thread、tick/quiescent、无 pending create/destroy、已验证 binding/profile、真实 successor association、Effect authority 条件下捕获，未执行 binding mutation。
- read-set 包含 World incarnation/tick/revision/NextCounter/config identity、所有出现实体的 Sync fields、Effect persistence bytes；Validate 比较 binding/target/digest/实际编码，能捕获当前测试中的字段漂移。
- Section source 区分未配置来源与已配置空兴趣集；逐 Section 使用真实 VoxelSectionProducer lease，验证同 revision、同 generation/global revision；payload 两次读取校验长度/摘要，最终 SHA 校验实际 bytes。
- 已交付 snapshot 的原始 bytes 在后续世界修改后保持，测试没有依赖模拟第二世界。

## 独立执行证据

直接运行作者 manifest 指定的现有 DLL，仅筛选相应方法，不重新 build、不触发生成。使用官方 Native `LumioGameEngine-101-wasm-render-world/.run/47687d9101fcab4be3f81fd4a6a55658/win-x64/run-WMFtUy/lumio_engine_native.dll`（配官方 sidecar，ABI c5f）。

- Entity `*AdmissionEntitySnapshot*`：3 passed / 0 failed / 0 skipped，exit 0。
- Hosting `*AdmissionSectionSnapshot*`：3 passed / 0 failed / 0 skipped，exit 0。
- 作者汇总 Entity 11 项不是本次独立计数；本次明确只跑 3 个直接 snapshot 用例。

证据位于 `C:/Work/LumioGames/LumioClient-101-composition/.run/composition-20261002/`：`runtime-admission-review-entity.log`、`runtime-admission-review-hosting.log`、同名 TRX 目录、`runtime-admission-review-hashes.json`。此次未新增失败测试，P1 源码证据和 P2 覆盖缺口已逐项交回作者补 RED→GREEN；不能将现有 6 项通过当成上述边界已证明。
