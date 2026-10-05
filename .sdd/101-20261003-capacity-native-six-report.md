# 单弹宝箱容量与真实 Native 六箱测试草稿

状态：**私有草稿；全部 C#/配表编译/GEN/Native 测试 UNRUN**。子代理 `/root/capacity_native_six` 只读生产源码，仅在 `.run/capacity-native-six-draft-01/` 与本报告写入；重型执行、发布测试及容量裁决由 Root 串行独占。本文不是101整局交付 PASS，也不是容量已选择。

## 本次可审查交付

- 完整 additive C#：`.run/capacity-native-six-draft-01/BomberPublicPierceChestContactNativeTests.cs.draft`，目标新增 `games/101-bomber/Server/Tests/Gameplay/BomberPublicPierceChestContactNativeTests.cs`。含一个 Fact；没有修改原 Resource10 的 live ECS capacity fixture 9/1 断言。
- 审查前 `0e4af2a36787678ca2b9bdb0cba65973d3e8e9e7d9ca637a0aafc69d1d1cb589` 原样留存为 `.review01.before`。Root 指出 SDK/Coordination 同名 VoxelCommitDisposition 可能导致编译歧义；revision02 仅新增明确 Coordination alias。revision02 `d94ccbbbd5227fc35dfa782ea18142613745d21e9d6c27208bd917744df6d408` 和 manifest `1c5cc3a08156ded6de206f2a13dfa4d5324c8b0f276817b3871713540129459a` 分别原样存于 `.review02.before` / `manifest.review02.before.json`；revision03 再仅补 `using Lumio.Wire;`。两轮均未删/降低断言。
- 完整正反 patch：`public-native-six.forward.patch`、`public-native-six.inverse.patch`；只新增/删除这一目标测试，未执行发布或逆操作。
- `inputs-before.json` 记录55项确切读取输入；`source-fence.json` 重读全部55项并列出 drift，不能以子任务作者静态检查代替 Native 结果。
- `manifest.json` 固定草稿、patch、原始审查、输入、证书和作者静态检查 hash。`author-static-preflight.json` 只检查文本、禁止伪造路径和 hash；PASS 的完整名称为 AUTHOR_STATIC_PASS。
- [full EntityId 单射与几何证书](../.run/capacity-native-six-draft-01/capacity-certificate.md) 逐项证明 Strong observed-transfer、普通箱 Original、Pending tuple、拒绝/未知/重投递、同格替换与 cursor 恢复边界。

初始 fence 脚本曾因误写 `BomberTestWorld.cs` 路径返回 ENOENT；实际 helper 位于 `BomberWiringTests.cs`，修正后读取55项。前次失败没有产生 fence 或测试执行，不应登记为业务 RED。

## 六箱测试证明什么

测试使用真正 Native TerrainProduction Scene 与正式 registry、admission binding、WorldManager.Tick；controlled helper 设定 Running/Vulnerable 状态及角色位置，以固定单颗弹路径。它不是自然 Warmup、Platform 完整 admission、地图生产者自然生成六箱或完整正式整局证明。

配表输入通过真实 AuthoredFixture/Compile 入口把 BombPower maximum 由6改为8，开启技能、关闭中央补给，并按已有预算批准 pickup capacity1351；没有手改 Base Power 或 Bomb Power。六次真实 Power item →公共 Pickup 把实际属性2升至8，随后真实 Pierce skill item→公共 Pickup→公共 PlaceBomb。核实际消耗库存、来源 Participant/Life/generation、ChainId、PlacedAt/FuseEnd、Pierce/Power8与真实 Native BombStationary 快照。测试只允许单颗弹，不调用 Scene.Bomb，不手动启动 Fuse 或输入爆炸时钟。

19×19、Boundary1、LegacyPillars 的 odd row/column9 走廊不清强制 even/even 柱或外墙。六个实际 Wood/Iron chests 位于对向 arms 各三个：(8,9),(7,9),(6,9),(10,9),(11,9),(12,9)。每个真实 ECS 箱经实际 Native mutation/binding 发布，Tier.IndependentBombHits=1，由正常炸弹处理生成独立 Native DigThrough。它们属于手工作者输入场景，并非初始资源/再生/圈生产者的可达位置证据。

每个 pending 接触只读取实际 adapter result checkpoint，核 Applied/Original/tokenConsumed、非空原始 receipt bytes、对应 section 的 revision advancement、完整 source tuple、Family/Occurred、Native cell归零/binding解绑与真实 ECS 退休。没有构造 receipt/outcome，没有手工调用 Contact第六槽来冒充 Native producer。现有单帧 chest writer 要求独立空 frame，因此预期六次真正单箱 Original 消费，不伪称一批六箱。

最终强断言：六个实际 Original、六个不同完整 EntityId 各恰一次、实际 DestroyedBlocks6、crate_opened6、唯一 bomb_placed/bomb_exploded、来源与幂等身份未换、没有 damage_applied。当前容量5预期在真实第六接触入账前拒绝，必须由 Root 实际运行才能登记 TRUE_NATIVE_RED；作者尚未观察 RED。后续正式容量修订必须让同一真实公共链通过，不能降低6为5。

## 容量结论与未证明部分

TRV03 upstream manifest SHA 为 `fae6a3f08cb09885a6d7526ba32be4e959d6b0415a90f30ae299be7de051be0d`，它仍为 ContactedChests5。冻结 origin/power + 每次新获得 positiveDistance 严格增加 + pending owner/source tuple + Strong terminal observed同ID零新增 transfer + Original后旧cursor见替换Destructible直接finish，使新增 distinct full EntityId 可单射到四臂步骤。Native Trace 的 origin只覆盖，Ray从1开始，且 Native explosion要求contact0，不能另加原点1槽。

对尺寸 W×D、合法非负边界 B 与任何该配置批准的非负火力 P，接触上界为四臂 `min(P, availableDistance)` 之和，消去 P 后至多 `W+D−4B−2`。因此默认/三档源表的 B1 几何包络为32/40/48；B0候选包络为36/44/52。schema允许0，而现有绑定/预算没有锁1，不能以默认 B1推所有合法 overlay。但 B0 真实地图工具与准入尚未运行，52不能称实际 M2 tight、UGC全局上限或 Root 已选择容量。

当前 object budget admission 只批准 LegacyPillars19×19、8人，M2-room23/27不能绕 guard。M2中央奇数axis无强制水/柱，存在对应空走廊格；实际初始/再生箱镜像、axis排除、安全格、环带、Strong位置/段数及非终端命中停臂进一步限制真实箱生产轨迹。尚不能声称全部几何格都能装满实际合法箱，更不能拿初始全局箱数或任意P6当完整动态full-ID容量证明。

时间与 Results deadline 不会在活弹上清空接触：pending/continuation HoldsSource，下一局 Prepare拒绝未清债务和任何活弹；完成退休整颗源才有新对象的新账。当前这一结论与同格替换不重复新增的行为地位仍是源码证明；下面补充的真实 Native C# 全部 UNRUN。

## 补充：历史、Native Duplicate/Unknown、同格换身份与轮次期限

独立 additive `BomberPublicPierceContactHistoryNativeTests.cs.draft` 含两个 Fact，供 Root另行独审，未随主六箱测试自动发布。其完整正反 patch、`history-source-fence.json`、`history-author-static-preflight.json` 与 `history-manifest.json` 单独固定输入和hash；原 main manifest及三轮主测试原样冻结。

两例均复用主测试真正 Power8公共拾取/PlaceBomb单颗Pierce producer，先消费六个真实 Original，另在(5,9)真实绑定第七个Wood箱，并由同颗弹生产第七个实际Native Original。第七个回执留在真实adapter checkpoint中，尚未消费，因此炸弹ContactedChests保存六个完整ID，Native旧第七箱已退休，source债务准确关联其完整ID、generation7、cursor、Family/Occurred、来源元组。

第一例把真实第七Original留存，临时接管adapter delivery；从实际 Native Replay获得Duplicate，并由实际独立Native mutation在旧cursor绑定同实例另一个完整EntityId/generation99，使receiptLimit1下原Native查询转Unknown。正常Tick穿过DangerUntil与显式Results deadline仍要求同弹活着、六条历史原样、旧第七source债务原样、替换箱未被接触、统计不重发、MatchId/Index/Results未推进。Results phase/deadline属于明确场景输入，不是自然MatchEnded生产证明。该例以accepted debt仍持有结束，证明保留，不声称最终结债/下一局PASS。

第二例通过源表danger_ms2000与max_bomb_entities8192输入增加观察窗口及预算，在正常退休前消费真实留存Original，要求只新增旧第七full ID。Resume旧cursor看到真实替换Destructible应封臂，替换新ID/gen99仍live/bound/RemainingHits1且零HitBomb；再次投递同一真实Original checkpoint不改7条历史/统计/收益。没有手改炸弹时钟/WorldTick或Contact列表。该复合测试配置是私有边界前提，不是单参数A/B，也未证明配表编译与准入已通过。

这两例要求正式容量允许至少7条实际接触；当前5槽会先在真正第六接触失败，所以不能以它们取代主一Fact最小真实RED。所有C#/编译/Native仍UNRUN；文本/hash静态PASS不能写成行为通过。

## Root 后续验证边界

1. 独审 hash/完整 patch 后，Root自行发布 additive 测试并串行编译、运行当前容量5；捕获实际错误和完整 Native producer 证据，区分编译失败与真正六接触 RED。
2. 正式容量选值仍需 Root/上游批准；选后更新真实声明并 GEN 双端/SDK布局指纹，重新核 Admission实际MaxCapacity一致性，不能由本草稿替代。
3. 重跑同一原断言6测试及TRV03相关正反边界；23/27须通过正式 M2准入，三档布局、actual Native和完整局/回放分别取证。
4. 本 bundle不执行任何 build/GEN/Native/打包、不stage或改生产文件，不要求用户为已有授权再次确认。
