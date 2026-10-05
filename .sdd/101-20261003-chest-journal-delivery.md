# 补给箱权威事件交付

## 范围与实现

仅修改 3 个生产文件：`Gameplay/BomberTerrainTransactions.Server.cs`、`Gameplay/Events/BomberEventCatalog.cs`、`Client/Presentation/src/replica-events.ts`。所有路径均相对 `games/101-bomber/`。组件声明、Schema、生成物、Native 与公共契约未改。

- 强化补给箱的每次独立炸弹族有效计数成功后产生一次 `chest_hit`；同族重复、拒绝计数、零剩余命中的再次尝试不产生额外命中事件。
- 完整 Native Original/Applied/TokenConsumed 结果通过全批校验并实际拆块解绑后，消费其成功回执时才产生一次 `final_chest_opened`。事件保留原 chest、participant、life、generation、bomb、family、chain、transaction、格子与真实消费 Tick。
- 木、铁、金资源箱产生带真实配置 tier 的 `crate_opened`，不会误用强箱音效。原有资源拆块表现保持原链路，不重复添加 `BrickDestroyed` 音。
- 保留已有 `DestroyedBlocks` 成功回执单一计数。拒绝、重复、圈清理、初始化均不新增统计。
- 表现只消费权威日志。相同帧重复处理幂等，回连 baseline 只建立游标，实体已销毁也保留原事件身份。

## 实际验证

证据根：`games/101-bomber/.run/chest-journal/`。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 新 Native 逻辑用例，改前 | 5 失败，0 通过/跳过，exit 2 | chest-red-01 |
| 新 Native 逻辑用例，改后 | 5/5，0 失败/跳过，exit 0 | chest-green-01 |
| 加真实客户端复制后的完整新类 | 6/6，0 失败/跳过，exit 0 | chest-replica-green-01 |
| 既有 Terrain 完整类 | 31/31，0 失败/跳过，exit 0 | terrain-green-01 |
| 既有 Circle 完整类 | 20/20，0 失败/跳过，exit 0 | circle-green-01 |
| TS 聚焦改前 | 21 中 2 失败、19 通过，exit 1 | presentation-red-01 |
| TS 聚焦改后 | 21/21，exit 0 | presentation-green-01 |
| Presentation 全量 | 667/667，53 文件，0 失败/跳过，exit 0 | presentation-full-01 |
| TypeScript 检查与 Vite 构建 | exit 0 | presentation-build-01 |
| 依赖守卫 | 1/1，exit 0 | presentation-guard-01 |
| 实际复制日志再消费 | 1/1，exit 0；3 hit + 1 open | captured-journal-presentation-01 |

第 6 项 C# 用例实际从 Native 权威 World 经 Welcome/WorldChange 编码、正式 ClientReplica StageAuthority/CommittedOutcome 还原，逐字节比较原 journal。捕获文件 `actual-client-journal.json` 再由独立证据测试读取，经正式 `projectOccurrences → PresentationFeed → audio` 分发验证次数、重复帧和 baseline；只 mock 音频输出函数以计数。它证明正式复制与音效映射，未冒称浏览器实际扬声器听感验收。

测试 DLL 由协调者正式 SDK selection 构建，`build-chest-replica-01` 为 0 warning/error、exit 0；DLL 与实际 client DLL 哈希在 `chest-replica-green-01.dll-sha.json`。所有测试使用真实 Native，未跳过或替换规则。

冻结前官方 whitespace formatter 首次 verify 发现 CRLF；应用后 5 个 C# 文件非空白文本完全相同，第二次 verify exit 0。见 `format-verify-01`、`format-apply-01`、`format-equivalence-01.json`、`format-verify-02`。这是测试后纯格式变化，最终产品重建由协调者统一执行。

## 冻结与剩余边界

8 个源码/测试文件逐字节副本与 SHA256：`.run/chest-journal/freeze-01/manifest.json`。主仓包含其他代理的未提交工作，本切片未单独提交整个未跟踪文件集，也未覆盖他人修改。

本报告不替代最终 SDK 组合下整仓测试、真实多人整局与浏览器原型对照。后续 durable 统计 TS 任务使用独立文件范围，补给箱生产文件已冻结供独立审查。
