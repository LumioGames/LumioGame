# Split promise lifecycle witness · TEST-only 交回

2026-10-03。按 Root 授权仅新增 `games/101-bomber/Server/Tests/Gameplay/BomberSplitPromiseLifecycleWitnessTests.cs`。已重读父仓与101核心/nav、testing/code-style、workflow:test-driven-development；采用先独立负控、Root 实际 RED 后才放生产修复的顺序。没有改生产、旧AtomicEntry、原八项测试、fixture、generated、index；没有 build/test/GEN/Native/format 或 spawn。

源 SHA256：`3d1286547cfbc112241880f0a9be343e631b8ea531f02b38e99785fd903819ae`。

静态计数 **4 Facts / 0 Theories / 0 InlineData / 共4 cases**。完整过滤类：`Lumio.Bomber.Gameplay.Tests.BomberSplitPromiseLifecycleWitnessTests`。

1. `SubmissionCallbackCannotChangeActualDangerDeadlineAlongsideItsDirectionBit`：复用真实 Native Split 母弹，在实际 Danger、尚持四future信用时，核实际 soft-cell 已为air、原 transaction 对应实际 Original/Applied/TokenConsumed receipt。仅 callback 故障注入：期限+1且submitted bit=1；要求原子入口拒绝，不要求撤回已写true/期限；随后 CaptureSnapshot 成功钉没有真实pending create，并核再次提交callback不调用、snapshot不变化。当前候选静态预期 RED 为 Assert.Throws 无异常；不是环境缺失、Fake result 或 actual structural Unknown checkpoint。
2. `NormalProductionCallbacksPublishAllFourChildrenWithActualDangerDeadlineUnchanged`：正常 Native爆炸与生产 Advance callback通过四臂实际发布，完整 source/chain/Frenzy/shape/power/credit/masks/fuse/token均核；下一正常Tick期限不变。
3. `ActualBoundKickCanPrecedeSplitExplosionAndNormalChildSubmission`：既有真实Native world中，通过实际bound `UseActiveSkillAbility` 启动kick；先核Native BombKicked叶，随后只有WorldManager.Tick推进移动/自然爆炸。实际transform改变、原source/fuse/chain保留、kick清零及四臂实际发布均核。
4. `ActualBlastChainCanShortenSplitFuseBeforeNormalChildSubmission`：另一实际ECS bomb通过普通Native HFSM/生产blast触发Split母弹；核实际提前爆炸Tick、缩短deadline、继承触发chain而保留母弹原source，并发布四臂实际子弹。

后三项是正控，静态预期 PASS；合计预期 **4 total / 3 pass / 1 fail / 0 skip**，这不是运行结果，尚无child exit。初始Fuse在fixture创建时设置，没有手调Phase/生产Tick/返回计划或Native成功结果。

不新增Split Burn负控：`BomberBombLifecycle.Server.cs:50`的CanBurn仅对ReservedFire为true；`BomberHfsmDefinitions.Server.cs:114–116`的Split Danger因此实际转Expired，无法合法进入Burn。各正控仍核BurnUntilTick=0。没有为覆盖不存在的phase伪造状态。

源写入与Root build13存在时序交叠：首个新增写完成后收到暂禁写通知，立即停写并告知Root。Root随后确认build13 raw0/0W/E并放行独立新文件；仅做SyncList官方API的机械Count/index读取修正后固定上述SHA。build13是否包含新类不作为本报告验证证据；Root应freshbuild新源，实际运行该四例并保留原始log/json/exit。未获生产授权，未进行生产修复。

独立审查 P2 报告仍为 `.sdd/101-20261003-producer-promise-atomic-independent-review.md`（SHA `9ba4b407752b042ddbd5e8e7abbfe6dcb587a4b381c34ff9613466ef8364ba97`），不修改其历史裁决。Goal101尚未完成。
