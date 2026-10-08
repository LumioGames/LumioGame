# 101 移动：合入后源码 Review 与本轮局部反例

审查日期：2026-10-08 UTC；下列 main SHA 冻结于本轮开始核验时。**移动手感验收仍为 FAIL，根因未完整定案。** 本轮先核实 GitHub，再审指定移动链；没有部署补丁，没有真实 A/B 浏览器逐帧采样，没有重新运行 Native / Client / GAS 完整行为套件。本报告不能替代前台验收，也不批准整个累计玩法分支。

## 1. 本轮实际访问范围

GitHub 连接已能读取 Game、Runtime、Client、Engine，仓库元数据报告 pull/push 权限；这不授予新的 Owner 裁定。已取得全新 Game checkout，初始 main 干净、只有一个工作树。当前执行环境是云端 Linux，并非交接中的 Windows 工作目录。

| 仓库 | 本轮冻结 main | 交接 PR 读回 |
| --- | --- | --- |
| LumioGame | `f14bd502e9807d58890b4e9490d041bdab65ce05` | [48](https://github.com/LumioGames/LumioGame/pull/48) MERGED，merge `8aaab64a53a4682dfd6ae275604c9ac9fd8ce195` |
| LumioGameRuntime | `f69e2c9445fd5cf39b005c0857308cd96da1f04d` | [277](https://github.com/LumioGames/LumioGameRuntime/pull/277) MERGED，同左 |
| LumioClient | `5b7ef6101bef5250a66fc4813e75d0038da990e8` | [181](https://github.com/LumioGames/LumioClient/pull/181) MERGED，同左 |
| LumioGameEngine | `4bf8d2835b07b51f71145b0e57d79f864cd6db58` | 架构与开发验证规则参考切点 |

Game PR48 后还有 PR49/50 文档合入。指定的表现、桥接与移动源码相对 b07 未再改动。PR48 为累计正式玩法/配置/文档交付，不能把它的 91 个提交、4,681 个路径概括为只有移动修复；Client PR181 的 23 个提交、262 个路径也超出本次时钟与生命周期审查范围。

已读根与 101 的规则/知识导航、design、stage0 contract、convergence、常设授权、Engine movement/GAS/ECS/热更和开发验证规则、唯一账本 checkpoint102–112。交接要求的 `R/closeout-*`、Task 原报告以及 Game35 的完整原始封件位于 Windows `.run`；冻结 Game Git tree 中没有这些目录，本轮未读到它们。历史通过计数只按既有账本/PR 的历史陈述引用，不当作本轮独立复验。

## 2. 发现及证据强度

### G1：回拉会被真实 Doll 消费成反向转身；Model rotation 没有进入该路径

**确认的表现缺口，优先处理。** Game 的完整 Owner pose 已桥接，但 `ViewRuntime.updateDolls` 只取本地 Model X/Z；随后 `Doll.update` 根据显示位置差计算速度和目标 yaw。镜头前视方向也取该 Doll 的方向。因此，持续按 W 时，只要 Model 出现向后的校正/回收，表现就可能把它解释为角色正在向后走。

源码依据（均在冻结 Game SHA）：

- [ViewRuntime](https://github.com/LumioGames/LumioGame/blob/f14bd502e9807d58890b4e9490d041bdab65ce05/games/101-bomber/Client/Presentation/src/view/runtime.ts)：1299–1317 选择本地 XZ；1347 调 Doll；1355–1360 计算镜头方向。
- [Doll](https://github.com/LumioGames/LumioGame/blob/f14bd502e9807d58890b4e9490d041bdab65ce05/games/101-bomber/Client/Presentation/src/view/world/dolls.ts)：349–357 从显示位移推导方向。
- [MoveAbility](https://github.com/LumioGames/LumioGame/blob/f14bd502e9807d58890b4e9490d041bdab65ce05/games/101-bomber/Gameplay/Abilities/MoveAbility.cs)：66–76 写 Facing 和 Logic 位置，未写 Logic rotation。Gameplay 写者检索未发现另一个将 Facing 写入 LogicTransform rotation 的路径。
- [设计](https://github.com/LumioGames/LumioGame/blob/f14bd502e9807d58890b4e9490d041bdab65ce05/docs/specs/bomber/design.md) §8.4：Facing 来自最近非停步 primary，包含受阻/垂直滑动；冻结不变，出生/复活向下。

本轮执行的是**真实生产方法 + 合成 pose + 中性场景属性 stub**的局部实验：逐字提取完整 `ViewRuntime.updateDolls`、`Doll.update`、`CameraRig.update` 和实际插值数学，固定 Model 朝向，向连续前进序列加入一次 0.01 格回拉。没有编造游戏模拟，也没有运行浏览器、WASM、Native、DS。

| 实验 | 实际观察 | 断言 |
| --- | --- | --- |
| 60Hz，固定朝向并有一次 0.01 格回拉 | 最大身体偏角约 46.65°；Model rotation getter 读取 0 次 | 朝向不应由回拉改变：RED |
| 120Hz，同一合成位置序列 | 最大身体偏角约 25.07°；rotation 读取 0 次 | RED |
| 静止，只改变 Model rotation | 身体未跟随 | RED |
| 单调前进对照 | 无偏角 | PASS |

这里的 Hz 是传给方法的采样间隔，**不是真实显示器刷新率**。数值只证明这个条件下“回拉 → 身体转偏”的局部因果，不证明 Game35 回拉出现多少次，也不证明整机卡顿的来源。本轮 33 项现有 Node 消费/输入/owner 桥接测试通过；另外，已有 TS `view/__tests__/owner-pose.test.ts` 使用记录 X/Z 的假 Doll，未覆盖上述真实朝向方法。本轮没有运行该 TS 测试，不能把它计入这 33 项。

最小后续方向：在 Game 既有已接纳 GAS 路径内，把玩法 Facing 落入 Logic rotation，包含出生/复活、冻结和受阻语义，再让本地 Doll/镜头消费 Runtime Model quaternion。必须先补真实消费和玩法 RED；不能从 held key 另建朝向真值，不能只在 UI 上读取当前恒等 quaternion 就宣称修好。

### R1：7fa 的三角形前探确实包含向后收回，不能按“连续”就验收

Runtime `7fa253ce...` 与最终 `f69e2c94...` 的 `ModelTransform.Owner.cs` blob 相同。当前规则在准入后 h 内增大前探，在 h 到 2h 内收回，2h 清零。固定逻辑目标、没有新输入结果、零纠偏残差时，后一段的显示速度方向与前探速度相反；h 处速度符号改变。这是代码确定的机制，是否以及多频繁进入该段仍需网页记录。

[源码](https://github.com/LumioGames/LumioGameRuntime/blob/f69e2c9445fd5cf39b005c0857308cd96da1f04d/modules/ecs/src/Lumio.GameRuntime.Ecs/ModelTransform.Owner.cs) 89–98。该机制与既有账本的 +7ms 迟到仍回退、停步仍收回记录相容，但本轮未重跑旧 Native 轨迹。不能把历史私有组合 4/4 或独审 PASS 当成最终体验设计正确的证明。

### R2：同 ordinal 的较晚普通结果可能瞬间清掉仍可见的回收尾

**精确源码反例，尚未执行 C#/Native RED。** 同 ordinal 更新保留原 admission，但重置速度；当当前表现时间已过 h，新的资格判断不重新给速度。这样可以在没有权威纠偏、没有 TP、没有逻辑后退的条件下直接清掉旧的非零尾。

条件推演：h=.05，前两个目标 .1/.2、准入 .05/.10；在 .175 显示 .25。随后同 ordinal 的较新普通 publication 保持目标 .2，仍在 .175 公开读取，可能直接变为 .2，即 .05 的跳变。现有 late-replacement 用例把替代目标设到旧显示位置，未覆盖“同 slot 且目标未变”的条件。

[同一源码](https://github.com/LumioGames/LumioGameRuntime/blob/f69e2c9445fd5cf39b005c0857308cd96da1f04d/modules/ecs/src/Lumio.GameRuntime.Ecs/ModelTransform.Owner.cs) 50–64；[现有 late-replacement 测试](https://github.com/LumioGames/LumioGameRuntime/blob/f69e2c9445fd5cf39b005c0857308cd96da1f04d/modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/OwnerExpiryContinuityTests.cs) 71–80。下一步先用真实生产类型确认反例和 publication 前提，再以网页输入序号/ordinal 对齐出现频率；本报告不把推演计入已跑 RED。

### C1：同一次 pump 的真实耗时跨过 h，可能仍以旧起点判定前探资格

**跨仓候选，未执行 RED。** Client 在 pump 起点采时并更新 presentation，然后进行权威 drain、输入执行；Runtime 判定是否过期使用最后更新的表现时间。若同一同步 pump 内的工作跨过 h，完成资格可能仍看到起点时间。随后的公开读取刷新 age，但不会撤销刚才已赋予的速度资格。

现有真实 Native fixture 可提供确定性反例入口：.10 开始第二条输入，在 `BeforeInput` 将注入宿主时钟推进到 .157，完成后比较 .157 与 .160。按现有代码的条件计算可以出现 .006m 回退，**这不是测量值**。应记录开始、执行完成、publication、资格所见时间和首次 render，不能只比较平均 FPS。

[Client pump](https://github.com/LumioGames/LumioClient/blob/5b7ef6101bef5250a66fc4813e75d0038da990e8/Client/Gameplay/Session/src/Internal/ClientSession.cs) 242–243、398–402、1364–1368；[Client clock](https://github.com/LumioGames/LumioClient/blob/5b7ef6101bef5250a66fc4813e75d0038da990e8/Client/Gameplay/Session/src/Internal/ClientSession.PredictionClock.cs) 75–105；Runtime Owner 60–64。长同步 pump 首先会阻塞整页，此候选只说明恢复后还可能叠加自角色表现问题，不认定 CPU、磁盘或杀毒根因。

### C2：独立 held / pump 调度仍缺实际批次测量

Game held 默认独立 `setInterval(50)`，Session 另有按截止时间调度的 pump。同 pump 排队命令会共享当前准入时间与本地 ordinal。现有 Client clock 测试把每个输入时刻主动加入 pump 时间表，不覆盖网页上独立相位/jitter 的实际 0/2 批次。

已进一步核实真实生产分发：Game 生成注册表注册 MoveAbility TypeId1；Runtime 的 RPC 经 GasTypeRegistry 进入 AbilityActivationContext。该生产 context 在成功激活时先把同类型 cooldown 设为 World.Tick+1，后执行 Ability；同 Tick 再次激活会在 Execute 前被冷却检查拒绝。因此，**若同一普通预测分支内、同实体同类型的两条不同 Move 输入在同一 World.Tick 执行，第一条成功后，第二条不会进入 MoveAbility.Execute**。浏览器是否实际形成这种批次及其服务器侧结果仍未测量。

这项限制来自 [Runtime GAS](https://github.com/LumioGames/LumioGameRuntime/blob/f69e2c9445fd5cf39b005c0857308cd96da1f04d/modules/gas/src/Lumio.GameRuntime.Gas/Ecs/AbilityComponent.cs) 536–538、584–586，已经由两名 reviewer 独立读回。Game `LastMoveTick` 只是转向记忆；Client fixture 的 `MovementLastTick` 也是测试专用 guard，不能混写成生产依据。网页 trace 要记录真实 cooldown / RejectedStep 原因，不能仅凭 generic ability_rejected 文案推断拒绝来源。

[player controls](https://github.com/LumioGames/LumioGame/blob/f14bd502e9807d58890b4e9490d041bdab65ce05/games/101-bomber/Client/UI/Spectator/player-controls.mjs)；[pump](https://github.com/LumioGames/LumioGame/blob/f14bd502e9807d58890b4e9490d041bdab65ce05/games/101-bomber/Client/UI/Spectator/main.js) 729–760；[Clock tests](https://github.com/LumioGames/LumioClient/blob/5b7ef6101bef5250a66fc4813e75d0038da990e8/Client/Gameplay/Session/tests/Unit/PredictionClockTests.cs) 67–82；[Game Movement](https://github.com/LumioGames/LumioGame/blob/f14bd502e9807d58890b4e9490d041bdab65ce05/games/101-bomber/Gameplay/Abilities/MoveAbility.Movement.cs)。服务器 ACK 频率、本地逻辑执行频率和 rAF 频率必须分别测量。

### G2：hitstop 的本地 pose 时间和镜头时间可能不一致

另一个静态候选是 feed 冻结旧 snapshot/viewNow 时，index 仍以新 owner pose 覆盖 localPose；ViewRuntime 得到 dt=0，而 Doll 仍直接写新 XZ、镜头平滑则停留原位。应以有意触发 hitstop 的真实实验验证；本轮未把它归因为持续 W 卡顿。依据为 Game `present/feed.ts` 137–139、`index.ts` 109、`view/runtime.ts` 460–463 和 Doll 的位置写入。

### 已排除的误判

1. **正常公开读链不会读到 Accept 的临时裸 target。** Game JS pump 和 managed Tick 同步；`Session.TryUpdateOwnerPresentation` 拒绝重入，并先 Update 后 Read。没有证据让 rAF 穿入同一同步栈的中间写。
2. **当前 Game 权威应用不是普通异步空窗。** Host 装配的 `WorldChangeRuntimePort` 同步 CommitAuthority 后返回已完成 ValueTask；pending 测试夹具不能当作 Game35 的实际异步路径。
3. **df649 生命周期修复不等于 Game35 已部署 Client18。** 交接明确 Game35 用 Client17；本轮没有新的网页字节收据来改变该事实。
4. **scratch 没有被放宽预算。** Runtime 最终集成的 scratch 测试保留 main 的精确边界/Undo 版本，生产计费未改；f43 的历史断言修订不能概括为删断言过关。
5. **未恢复已撤回的自角色接收时间插值。** 冻结 Game 表现树未见旧 `receiveOwner/sampleOwner/OwnerSegment/poseEpoch` 链。

## 3. 实时 CI 状态更新

这些结果来自 GitHub 指定 PR head 的 check-runs / job logs，不是本轮在云端重跑，也不能自动升级源码合入后的完整行为资格。

| 对象 | 本轮读回 | 证据 |
| --- | --- | --- |
| Runtime PR277 head `de5a44e3...` | 必需 Build 后来 success，完成 02:16:40 UTC；Build and behavioral tests skipped | [Build](https://github.com/LumioGames/LumioGameRuntime/actions/runs/37715615529/job/113111277058) |
| Client PR181 head `b829cc27...` | Build success；Linux/Windows test jobs skipped | [PR checks](https://github.com/LumioGames/LumioClient/pull/181/checks) |
| Game PR48 head `fc361b5...` | README policy success；Bomber build/test/external-clone failure，SDK0.0.4-main.ecece8a 与要求0.0.5-main.0e2fc74 不符 | [Bomber build](https://github.com/LumioGames/LumioGame/actions/runs/37716133967/job/113112889982) |
| Game 同 head 的另一 root Build and test | failure：`ServerWorldBoot.cs` 使用缺失的 `WorldManager.Create`，以及 Bind 调用缺少 hfsm 参数 | [root build](https://github.com/LumioGames/LumioGame/actions/runs/37716133733/job/113112889409) |

最后一项是本轮新登记的独立编译失败，不能合并归因为 Bomber SDK 版本守卫。本轮没有改守卫、改保护、重跑失败检查或把 skipped 写成 success。Engine ADR088 的编译合入门与后续行为验收仍分别记账。

## 4. 浏览器现场的具体缺口

本轮能访问 GitHub 源码，不能访问用户电脑上的 `C:/Work/LumioGames/`、原 `.run` 文件或该机器的 loopback 服务。没有核实用户电脑上的监听端口、进程或可用内存；不能把历史 SERVING 或退出记录当作实时状态。

公开 LumioEngineRelease 的 refs 本轮到 `v0.0.4`；main `80ec8e9257d39856a90bbe430bcd511a3fd0bf06` 的 manifest 为0.0.4。Game 固定的 gitlink `702f9d903e4a6ee78e8d9c4cb06408599c6a19c8` 的 [manifest](https://github.com/LumioGames/LumioEngineRelease/blob/702f9d903e4a6ee78e8d9c4cb06408599c6a19c8/manifest.json) 为0.0.4-main.ecece8a、仅 win-x64，仍不满足当前 Game 要求。检查的 Engine 最近三个已完成构建的 artifacts 只有测试结果或空列表，没有取得 complete31。

既有 complete31 的 manifest SHA256 `8cc8df282a920af72de5168b2a134a98e4605a5d26f8b4be80325b3747d16fd9` 与 Game35 Runtime WebCIL SHA256 `f90727188c5bb56eacbfeda04a7bc154924c8a578abb82f2cfa2d6eac24a0dfe` 是交接/账本里的定位标识；本轮没有这些 payload，未重算其哈希。未找到公开 tag/下载链接并不否认本地包存在。没有改用旧包、降低版本守卫、另造模拟或发布新 tag 来凑浏览器通过。

恢复真实实验需要可访问原运行资产的本地执行环境，或完整且可验证的 complete31/Game35 资产及其依赖运行环境。获得后先按新目录、新运行副本、新账号前缀和既有 launcher/guard 模式恢复，不覆盖旧 failure 日志；账户密码只在 launcher 内存生成一次。

## 5. 下一段工作与退出条件

1. 固定实际源码、manifest、Client/Runtime/网页字节身份，在可观测的新 A/B 会话中选择角色，记录 document visibility/focus。
2. 同角色同时间轴采 keydown/up、held 发布、输入序号、pump 起止、准入/执行 ordinal、Logic/Model/前探/残差、ACK/权威 pose、rAF、Doll 与镜头、long tasks/GC/WASM 耗时。先持续 W，再起停、转向、贴墙及 A/B 对照，另看 Bot/远端是否同步卡顿。
3. 按帧计算位移、速度/角度、回拉次数/大小和尖峰，分别检验 G1、R1/R2、C1/C2。后台 rAF 节流不记成网络预测低频。
4. 先在所属仓拿实际 RED，再最小修复、独审、同字节网页复测；保留旧失败。确认后才推进官方 complete、完整消费和新现场，最后由用户前台手感验收。

ADR142 死亡链、18085 发布身份、生产 schema 等 Owner 门继续 OPEN。非 AOT 不等于热更；本轮没有非空 delta、apply ACK 或无重建行为变化证据，热更仍未接通。本轮退出结果是完成指定源码 Review 的可访问部分与局部反例登记，**移动任务未完成**。

## 6. 可复跑的本轮局部实验

使用 Node 24（本轮为 v24.19.0），在含冻结 f14 commit 的 Game checkout 中执行；输出到新目录，脚本固定读取该 commit 的源码并记录各文件 SHA256：

```bash
node games/101-bomber/.spec/archive/reviews/2026-10-08-movement-postmerge/consumer-probe.mjs /absolute/path/to/LumioGame /absolute/path/to/new-output-directory
```

预期进程退出1，四例中3个目标断言 RED、1个单调对照 PASS；这是真实缺口收据，不应修改断言把它变绿。正式归档引用 [root-01 收据](root-01/receipt.json) 与 [逐帧结果](root-01/consumer-probe.json)；这次仅把输出改成 exclusive wx 防覆盖，方法提取未改，结果与先前 portability-01 逐字一致。早先同名临时结果曾被移植复跑覆盖，不能声称首次原日志文件完整保全。

本轮结果、来源身份、Node 测试与结构校验收据随报告归档；报告独审与提交状态以新增账本 checkpoint 为准。
