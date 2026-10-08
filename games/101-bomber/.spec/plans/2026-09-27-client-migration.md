# 101 客户端第一轮迁移

## 实施计划

使用 writing-plans 的先计划后实现流程；本任务授权仅覆盖 Client/Application、Client/Bots、Client/UI/Chat、Client/Tests/Chat、Client/Tests/Application 及本记录，不提交。尝试委派只读接口复审遇到团队 thread limit，因此本次按范围自审，统一复审仍由主 loop 负责。

1. 先增加会失败的发布物绑定/移除旧示例守卫，记录真实 RED。
2. Application 改为最小 ClientHost 组合工厂：显式使用 Bomber client registry，完整保留原 ClientInstanceOptions 对象，删除聊天包装层和 prebuilt 路径变量。
3. 删除采矿/矿脉 restore 场景及聊天 UI/测试。新增仅验证第一轮准入的场景，从配表取玩家数；真实 BotWorldView 提供 Self 与 census，只有完整身份、自身可见且类型正确、足够独立玩家同时可见才完成。
4. 用纯准入判定的边界测试、空 BotWorldView 场景红断言和 options 保留测试验证；独立构建 Application/Bots，只引用 Engine 发布图。
5. 写正式迁移用途对照、启动选择命令与交接报告，不把单元测试当作真八Bot或整局验收。

## 状态

- 已核对 Engine manifest 的 LumioClient 固定提交 `24f5d69edc2f85a4e7be4fe9a2e69507f04c8619`。实际 ClientInstanceOptions 含 Voxel（其 Prediction 为必填）和 NotServingRetry；旧 wrapper 漏转发二者。
- 2026-09-27：3 个发布物/删除守卫先 RED（0通过/3失败），实现后3/3通过；客户端 C# 测试11/11通过，零跳过。Application/Bots 独立构建均0warning/0error。
- 测试发现传递项目引用会把默认 server Gameplay.dll 带入客户端测试；测试工程新增显式 client Gameplay 引用，实际 registry.Side=Client 和 Client Reader 均验证通过。
- 批量目录删除命令被自动审批规则拦截；改用逐文件 patch 删除明确拥有的18个旧源文件，再经只读确认后删除两个空目录。没有递归删除构建/其他工作树内容。

## 用途对照与正式接替

| 移除项 | 原 Sample 用途 | 不属于 Bomber 的原因 | 正式接替 |
|---|---|---|---|
| BomberMiningPlan.cs | 无位置只读视图上的矿脉盲扫、挖掘、拾矿状态机 | 不含炸弹/走位/技能规则，不能当 Bomber AI | 第一轮 BomberAdmissionScenario；第二轮真实只读世界投影驱动的 Bomber Bot |
| BomberMiningScenario.cs | 发聊天/移动/采矿/拾矿指令，以矿脉和矿物消失为成功 | 指令/成功标准都是旧玩法，uplink 不等于准入或结算 | 准入检查完整 Self/player census；后续对局按真实输赢、规则断言验收 |
| BomberRestoreVerifyScenario.cs | 恢复后矿脉从4条变3条、矿物消失 | 矿脉计数不能证明 Bomber 世界/地图/对局恢复 | 后续真实 Bomber checkpoint/逐Tick哈希回放验收 |
| Client/UI/Chat 全源 | 聊天RPC适配、presentation、HTML/JS | 本轮未声明聊天产品能力；壳层干预RPC hook会覆盖真实客户端选项 | 应用工厂保留调用者的引擎 options/RPC hooks；HUD/旁观由其独立任务实现 |
| Client/Tests/Chat 全源 | 聊天注册、管线与 UI 测试 | 已删产品对应的测试不应假装覆盖游戏 | Client/Tests/Application 的 options、发布图、准入正反边界测试 |
| BomberClientInstance.cs | 包装 ClientInstance 并持有 Chat adapter | 无独立生命周期责任，漏转发 voxel/prediction/retry | 直接返回引擎 ClientInstance，生命周期由 ClientHost 管理 |

未改 prototype；未改 Gameplay、Tools、Server、CI 或 solution。block 配置中的 block_type 0..10 与官方 catalog 256+ 的对齐交主 loop 处理，本任务没有触碰配置。

## 接入与验收边界

公开组合 API：`BomberClientApplication.Registry`、`Configure(ClientInstanceOptions)`、`CreateInstance(ClientHost, ClientInstanceOptions, CancellationToken)`。Configure 返回原 options，整个 voxel/prediction/options 图不重建。

场景全名：`Lumio.Bomber.Bots.BomberAdmissionScenario`。现有 Bot.Host 用 `--scenario <Bots.dll> --scenario-name <全名>` 选择；必须选 client Gameplay.dll，并设置引擎已有环境变量 `LumioBotConfigDirectory`（与 host 同一配置来源）。要求玩家数来自 `game.player_count`。

本子任务已证明编译/引用/纯准入判定及无证据红断言；未由此声称真八Bot准入或整局成功。真实 Platform/DS/8Bot编排及旧 Tools launcher/tour 引用迁移归主 loop，需用本场景的逐 Bot `bomber_admission_*` 真断言作为第一轮接替。
