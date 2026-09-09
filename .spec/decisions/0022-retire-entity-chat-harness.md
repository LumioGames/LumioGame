# 0022 · entity-chat harness 整体退役,101-entity 端到端验收交由 Sample 11 场景链承接

- 日期:2026-09-09
- 状态:生效

## 背景

本 ADR 取代 [0010](0010-entity-chat-requires-mvp-host.md);0010 取代的 [0009](0009-entity-chat-csharp-mvp-host.md) 一并作废。

entity-chat 纵切(0009 → 0010)是本仓最早的 101-entity 端到端验收面:100 Bot + 1 Browser,两轮日志逐位对比,`verify-evidence.mjs` 作为唯一尺子。它在验证 Chat 权威链路上完成了历史任务,但此后长期处于失修状态,R-00420 记录的问题集中在两类:

1. **指向已消失的上游。** `EntityChatSuite.cs` 拉起的 `../../LumioServer/account-server/` 已随 LumioServer `2bbfe5c`(PR #43)整目录删除;`launcher.mjs` 要求的 `lumio-entity-chat-replay` 只在 LumioServer 的 test-harness feature 分支产出,主干没有。SUCCESS 路径事实上不可达。
2. **在本仓复制了不属于本仓的语义。** 两份 `LumioSignatureV1`(`WireCrypto.cs` 与 `bot-credential.mjs`,后者只签不验)、两份登录客户端(`AccountLoginClient.cs` 与 `account-client.mjs`)、`AccountPortPin.cs` 里的测试口令、`scenarios.mjs` 自写的 WS 客户端——都违反「本仓只消费公共语义、不复制」的仓库边界(见 [`repository-architecture.md`](../knowledge/standards/repository-architecture.md))。

修复这些等于在一个即将被取代的验收面上重建账号库、凭证签发与协议客户端,与红线直接冲突。

## 决策

**不修,整体退役。** 端到端验收职责移交 Sample 侧的 11 场景链(R-00520);本仓删除 entity-chat 的全部实现与其携带的副本:

- `integration/entity-chat/`(整目录)
- `modules/server-gameplay/src/Lumio.Game.EntityChat.Suite/`
- `modules/server-gameplay/src/Lumio.Game.EntityChat.Protocol/`
- `modules/server-gameplay/src/Lumio.Game.ServerGameplay/EntityChat/`(`BotLaunchNames` / `GameEntityKind` / `VerifiedAdmission` 三个类型,连同只为 `BotLaunchNames` 存在的 `BotLaunchNamesTests.cs`)

`chat.input` 的双定义同批消解:Game 侧 `ChatMapping` 里与 Runtime `Lumio.GameRuntime.Replication.Chat.ChatMapping` 重复的七个成员(`ContractId` / `InputMappingId` / `MaxTextUtf8Bytes` / `MaxChatInputPerSenderPerTick` / `IngressQueueCapacity` / `BoundedInputPolicy` / `InputFieldOrder`)全部删除,消费方改经 `RuntimeChatMapping` 类型别名直接读 Runtime 常量;Runtime 未提供的四个 Game 自有映射(`chat.event` / `chat.component` 及两组字段序)留在改名后的 `ChatGameplayMapping`,类改名是为避免与 Runtime 同名类互相遮蔽。`"chat.input"` 字面量在本仓只剩 `ChatComponentSchemaTests.cs` 的一处断言,作用正是钉住「Game 消费到的值 == Runtime 真源」。

收口门槛与 CI 同步去掉 entity-chat 的三个 node 测试文件;`.spec/knowledge/features/gameplay/entity-chat-harness.md` 随实现一起退役;根 `README.md` 的子模块表与 Headless Test Surface 去掉已失效的 entity-chat 表述。

**炸弹人玩法测试不在退役范围内,全部保留。** `Lumio.Game.ServerGameplay.Tests` 中唯一随退役删除的是 `BotLaunchNamesTests.cs`(为已删的 `BotLaunchNames` 而存在),测试数 31 → 29,差额即该文件的两个 `[Fact]`。

## 取舍

- **不接 Platform。** R-00420 原设想把 entity-chat 接到 Platform 侧账号服务;Owner 2026-09-09 裁定不投入——接完仍要在 Sample 承接后再删一次。
- **接受空窗。** 本仓在 R-00520 验收通过前没有 101-entity 端到端 oracle,只剩 `Lumio.Game.ServerGameplay.Tests` 的契约级用例。这是 Owner 明示接受的风险;若 R-00520 未能承接,回滚手段是 `git revert` 本次删除。
- **`ChatMapping` 一并收敛,而不是留到下一张卡。** 它是活代码(`ChatInput` / `ChatSetMessageSystem` / 四个测试在用),AC5 的删除动作碰不到它,一度按「独立工作」搁置;Owner 2026-09-09 当场裁定并入本次交付,因为留着它 AC4 第 3 条永远无法满足。
- **`ServerGameplay/EntityChat/` 三个类型删掉,而不是留作死代码。** 三者全仓零外部引用(`GameEntityKind` / `VerifiedAdmission` 在本次退役之前就已无人引用),`BotLaunchNames` 的唯一消费者是已删的 Suite,其测试只是在为死代码续命。删生产代码与删其测试必须同批,只删一边都更糟。

## 影响

- 本仓不再拥有任何账号登录、凭证签发或签名实现;相关能力只在 Platform / Server 侧。
- **Bot 命名规则就地留档**,供炸弹人 S-1 复用而不必翻 git 历史:登录名 = `Bot` + 十进制序号,序号按两位零填充(`Bot01`…`Bot09`、`Bot10`…`Bot100`);`Bot` 后必须全是十进制数字才算 Bot 命名空间(`bot01`、`Bot`、`Bot01a` 都不是)。原实现里 `Count = 100` 是 entity-chat 的 100 Bot 验收规模,不是通用值。
- 炸弹人蓝图里 `docs/specs/bomber/stage0-kernel-contract.md`、`.workflow-drafts/.../cards/G-6.md` 引用的是 oracle **方法论**(逐位比较、不比长度、不合成行),纪律在卡内已写全,不依赖被删代码,继续有效。
- 但 `.workflow-drafts/.../cards/S-1.md`、`cards/I-2.md` 要求「复用 entity-chat launcher / Bot 启动器名规则」,**指向的实现已不存在**;这批卡仍在本地 bundle 等 G-0 冻结,派发前必须改文案(名规则见上一条,launcher 需另写)。
