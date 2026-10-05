# 101 上游依赖元数据修复

## 问题与所有权

完整服务端检查的真实 `cargo deny check` 失败：四个进入生产依赖图的 NativeCore crate 未声明许可证；八个服务端 package 共 41 次本地 path 依赖使用被认定为 wildcard。原始失败证据为 `games/101-bomber/.run/20261003-controlled-game/server-verification-02/deny.log`，未覆盖。

NativeCore 根 LICENSE 已为 Apache-2.0。本次只在 workspace 和十个成员 manifest 声明、继承该已有许可证；没有重新许可代码。提交 `81b2501a621db2657bd087db2afa808ecfb9e846`，实际复核目录 `C:/Work/LumioGames/.101-supplychain/LumioNativeCore`。

Server 七份 manifest 的 24 个 path 声明补充对应当前 package 的版本要求（NativeCore `0.0.0`、Server `0.1.0`）。没有改动 path、Git 来源、锁文件、功能集或 deny 配置。提交 `cc493d7cff29da91d166890af2e913bc4a50bd45`，父提交 `d29153d645886b9ca74af9331a213e8c2b31868b`，实际目录 `C:/Work/LumioGames/.101-supplychain/LumioServer`。

ADR-068 禁止依赖仓钉 Git revision 和维护候选锁文件；这里仍直接消费相邻当前源码。Cargo version 检查所消费 package 的元数据，不选择旧 Git revision，也不启用 registry fallback。没有通过 `allow-wildcard-paths` 或其他豁免消除失败。

## 实际验证

- NativeCore `cargo metadata --no-deps`：十个成员均为 `Apache-2.0`、`publish=[]`；源码未改，manifest 差异 11 行。
- Server `cargo deny check`：`advisories ok, bans ok, licenses ok, sources ok`，退出码 0；仍报告五种允许但当前图未使用的许可证警告。
- Server metadata 前后比较：89 packages、8 workspace members、41 次 path 使用；完整 resolve 图、package ID/version/source/features 均相同。所有 41 次 path 使用保留本地 source 并有版本要求。
- `git diff --check` 通过。未因纯 manifest 修改另造与实现同形的单元测试。

证据：NativeCore 原修复目录 `C:/Work/LumioGames/LumioNativeCore-101-license-metadata/.run/license-metadata/metadata.json`；Server `.run/deny-after.log`、`.run/deny-after.exit`、`.run/metadata-before.json`、`.run/metadata-after.json`、`.run/dependency-metadata-verification.json`、`.run/dependency-metadata-changes.json`。

状态：等待独立复核与新完整发布包回接。上述结果不宣称旧完整包已包含新提交，也不替代游戏真实链路验收。
