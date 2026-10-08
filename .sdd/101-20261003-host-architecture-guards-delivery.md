# Server 架构守卫迁移

私有Server候选`d29153d645886b9ca74af9331a213e8c2b31868b`仅修改`Tests/tests/host_architecture.rs`，父`5f7883e`，生产源未改。

旧四失败来自已审生产重构后的守卫过期：Dispatch增加Owner arena入口及原批关闭门、SectionFrame从Map改为借用serde writer、已关闭控制准入新增两个清理位置。修复仍逐行限制完整Dispatch前缀与switch，并新增五类既有准入消息、enqueue/drain门和绕过Owner grant的负向突变；新writer守卫从实际serde字段生成键集，检查必要/非法成员、未知属性、改名和脱离实际encoder。SessionClosed白名单只登记已核对的peer关闭或结束后清理位置，不放行整文件。

实际证据位于Game`.run/20261003-controlled-game/server-verification-02/`：

- 旧完整：807通过、4失败、9默认跳过，失败保留在`nextest.log`。
- 修后独立专项：51/51、零失败/跳过；`root-host-guard-02.log`。
- 最终完整：811/811通过、9默认跳过、exit0；`root-server-full-03.log`。默认跳过仍需按适用真实门另验，未声称零跳过。
- 严格Clippy：exit0；`root-host-guard-clippy-02.log`。第一轮过长函数与文档标记两诊断已修，原日志保留。
- Client代理独立源码审查与实际复跑51/51、零跳过exit0；`client-independent-host-guard.log`。

冻结记录`root-host-guard-freeze.json`。首次未启用test-harness造成零测试命令失败，保留`root-host-guard-01`，不计通过。此切片不替代完整发布、实际Platform/DS/Bot浏览器及供应链门。
