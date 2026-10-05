# Client 生命周期审查修复

树 `C:/Work/LumioGames/LumioClient-101-composition`，冻结提交 `ecd88285c1a3e83a977d3630f263fe70357aa307`，基线 `95a4545041277fbdf0ccf100c96f65b1b9ea5593`，7 文件窄增量。未发布。

1. Root 发现 `ReleaseAll` 在 owner/reentrancy guard 前释放 successor admission 和 parts。真实用例进一步发现公开 `RequestClose` 同样在 guard 前执行 `ResetParts`；后台线程 Close/Dispose 在 owner Tick 前丢弃部分组装。现仅登记关闭意图，owner/reentrancy guard 通过后才释放。测试同时检查 assembler 身份、保留字节和下一 owner Tick 的实际清理。
2. `RuntimeJointPrediction.Retire` 原先直接 Dispose driver，却未移除 subsystem 所有权；真实浏览器同 manager 再 Attach 失败。新增 subsystem `AttachDriver(Func<IDisposable>)`，在获取 Native session 前拒绝占用，工厂成功后才取得所有权；`RetireDriver` 校验身份、Dispose 成功才释放槽位，pending 失败保留可重试所有权。Portable 和现有 Application host 都走同一 owning seam，不再先保存成功状态后才交所有权。

实际证据均在 Client `.run/composition-20261002/`：

- `lifecycle-owner-red-04.log`：14 passed / 2 failed / 0 skipped，exit 1，实际为 off-owner 清空 assembler。red-01～03 因未设置 fixture 所需 `LUMIO_NATIVE_TEST_PATH` 而失败，已保留，未将它们算作行为 RED。
- `browser-lifecycle-red.json/.png/.log`：实际 full Engine WASM + .NET 浏览器在 Retire→Attach 报 `Replica prediction is already bound`，exit 1。
- `lifecycle-session-green.log`、`lifecycle-results/session-lifecycle-green.trx`：249/249，0 failed/skipped，exit 0。
- `lifecycle-spectator-green.log`、对应 TRX：67/67，0 failed/skipped，exit 0；包括拒绝创建、外来 driver、pending 关闭保留所有权、释放后再创建。
- `browser-lifecycle-green.json/.png/.log`：真实浏览器 PASS，增加已占用 owner 连续 64 次拒绝且无 GAS driver 残留，以及同 manager retirement 后再次 attach。控制台和失败网络列表均空，exit 0。
- `lifecycle-solution-green.log`、`lifecycle-solution-results/` 共 12 TRX、`lifecycle-solution-counts.json`：**1235/1235，0 failed/skipped，exit 0**，含真实 Native SDK 56 和 Bot 281。
- `lifecycle-format-folder.log` 对全部 7 文件官方 whitespace formatter 验证 exit 0；solution formatter 也 exit 0，但保留其 workspace-load warning，不以该 warning 冒充完整项目检查。`git diff --check` exit 0。
- 依赖仍固定 Runtime `7d6e5f5`、Engine `0a265f4`、Native test `e54eafcd...`；不消费 Root ACR3 正在变化的 provider 输出。候选 release 应在新组合上再次联编。

源 manifest：`client-lifecycle-source-manifest.json`，731 tracked files。此补丁未改变 Game 画面、产品规则或契约。Game 当前仅新增 Session 接线 RED，正式实现将在 Root 官方候选闭包可用后联编；同世界 blocks mesher/lighting 缺口仍需所属 Engine 修复，不复制权威世界。
