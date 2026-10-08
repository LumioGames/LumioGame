# 101 移动代码 Review：审查收据

用户已将本轮分工改为 Agent 只审代码、用户本地验证。[完整报告](../2026-10-08-movement-code-review-local-validation.md)覆盖七项原移动链问题，以及归档前 PR52 新增输入开关与统计口径的风险。本目录保存报告审查和文档校验，不是新行为实验。

## 审查范围

| 文件 | 范围 |
| --- | --- |
| [Game 独审](game-review.md) | F1 朝向/复活、F7 hitstop/镜头，含证据边界 |
| [Client 独审](client-review.md)、[核心最终读回](client-final-review.md) | F2 真实冷却与 layer、F5 Client 可达性、F6 时钟配方 |
| [Runtime 独审](runtime-review.md)、[核心最终读回](runtime-final-review.md) | F3–F6 数值、触发条件、未执行边界 |
| [PR52 输入补审](pr52-input-review.md)、[表述确认](pr52-input-confirmation.md) | pump 模式的短按/命令顺序及诊断范围 |
| [PR52 统计补审](pr52-trace-review.md)、[表述确认](pr52-trace-confirmation.md) | 请求数与执行数、rAF 漏采、身份/方向/可见性分段 |
| [main 更新收据](main-refresh.json) | 保留并行 PR52 与 checkpoint114，本段顺延115 |
| [文档校验](verification.json) | 报告与核心前缀哈希、账本只追加、仅文档变更、lint/diff 校验 |

核心报告最初独审后的完整文件为23511字节，SHA256 `36ef36cfd29f64c49483c93973e5e3c4faa7b3518d99a6039dbabb5b8ed1fa12`。归档前 main 新合入 PR52 后，在其末尾追加补审；这些23511字节原样保留，因此核心范围收据仍精确对应最终报告的该前缀。两份 PR52 表述确认对应追加后的整文件。早期审读 SHA 不同的原收据也保留，没有伪造为同一版本。

PASS 只表示各自文稿与所审源码、计算和证据等级对应。所有新本地配方均未执行；旧 PR51 的局部方法实验与 Node 测试未重跑。移动手感继续 FAIL，真实现场发生率、完整根因与 Owner 门不由这些收据批准。
