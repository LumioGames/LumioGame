# 0023 · 契约一致性测试在测试期直接读架构仓 wire JSON,缺检出即失败

- 日期:2026-09-09
- 状态:生效

## 背景

ADR [0022](0022-retire-entity-chat-harness.md) 消解 `chat.input` 双定义后,本仓消费到的映射标识、字段序与信封上限全部经 `RuntimeChatMapping` 类型别名读 Runtime 常量,`ChatComponentSchemaTests` 钉的也是这些常量。但 Runtime 那侧的常量同样是手抄字面量——`Lumio.GameRuntime.Replication.Tests.ChatMappingTests` 断言的是它自己写下的 `512` 与 `"chat.input"`。

于是断言链条止步于「Game 读到的值 == Runtime 写下的值」,**没有任何一环去读契约真值**。按 [`repository-architecture.md`](../knowledge/standards/repository-architecture.md),公共语义的唯一事实源是架构仓 `LumioGameEngine` 的 `engine/wire/gameplay-command-envelope-v1.json`;架构仓把 `chatTextMaxUtf8Bytes` 从 512 改掉,两个仓的测试都照样全绿,漂移要到联调才暴露。这个缺口在 0022 之前就存在(旧 `ChatMapping` 同样手抄,还多一份副本),0022 是净改善而非引入。

## 决策

**在本仓补一层直接读 wire JSON 的一致性测试**(`ChatWireContractTests`),并按下面三条定它的形状:

1. **不保存副本。** 不 vendor、不在构建期拷进输出目录、不写第二份字段清单——那正是 `repository-architecture.md` 禁止的架构镜像。测试在**运行期**打开架构仓检出里的文件。
2. **检出发现顺序:`LUMIO_ENGINE_ROOT` → 逐级向上找同级 `LumioGameEngine`。** 后者从测试输出目录开始遍历祖先,因此普通检出与 git worktree 都能命中,且不在工程文件或源码里出现任何机器绝对路径。命名与既有的 `LUMIO_RUNTIME_ROOT` 对齐。
3. **缺检出即失败,不 skip。** 读不到契约真值时静默跳过,等于漏配一次环境变量就永久放行漂移——正是本 ADR 要堵的东西。CI 相应增一步 checkout `LumioGameEngine`(复用既有 `LUMIO_CI_PAT`)。

覆盖面:`chat.input` 的 kind / direction / 字段序 / `maxUtf8Bytes` / `violationCode`、`boundedInput` 的 policy 与四条 rules、`limits.ingressQueuePerConnection`、契约自带的 `hash.examples` 哈希例(用契约里的字段序重新编码复现 payload 与 sha256),以及 `chat.event` / `chat.component` 的**归属断言**——见下。

## 取舍

- **本地跑 `dotnet test` 从此多要一个私有仓检出。** 接受:本仓构建本来就要求同级 `LumioGameRuntime`,`clone-all.mjs` 一次克隆全组织,门槛性质不变;换来的是契约漂移在收口门槛就红。
- **测试会读到「你手上那份」检出,可能落后于架构仓主干。** 接受:落后的检出与本仓消费口径不一致时测试照样红,提示的是「先 fetch 架构仓」,方向正确;把契约真值改成联网拉取会把单元测试变成需要网络的集成测试,代价更大。
- **`chat.event` / `chat.component` 断言的是「不在信封里」。** 架构仓 ADR-060 / R5-01 已把这两个映射从 `gameplay-command-envelope-v1` 删除(聊天事件改为 `ChatComponent.OnChatMessage` 这条 ClientRpc 记录,last-message 状态 persist-only),它们如今是本仓自有标识。因此正确的一致性断言是「信封里没有同名映射」:哪天架构仓重新声明其一,测试转红,本仓必须改为消费上游字段序而不是自持一份——这正是要触发的对账。
- **`ChatComponentSchemaTests` 保留不动。** 它钉的是「Game 消费到的值 == Runtime 真源」,与本次补的「Runtime 真源 == 契约真值」是链条的两环,都需要;两个文件共用的 LumioBinV1 参考编码器提到 `LumioBinV1TestCodec`,避免第二份编解码。

## 影响

- 收口门槛口径更新:`dotnet test` 需要 `LumioGameEngine` 检出或 `LUMIO_ENGINE_ROOT`(见 [`AGENTS.md`](../AGENTS.md)、[`repository-architecture.md`](../knowledge/standards/repository-architecture.md)、[`testing.md`](../knowledge/standards/testing.md))。
- 本仓单元测试 29 → 34。
- Runtime → wire 那一段仍未闭合(Runtime 自己的常量测试还是手抄字面量)。本仓不改上游;要闭合需在 `LumioGameRuntime` 补同类用例,已在交付里上报。
