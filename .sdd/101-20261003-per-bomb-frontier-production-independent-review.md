# Per-bomb accepted frontier：独立源码审查

非作者 client_correlation_review 审查。Spec PASS、Quality PASS：本次唯一 Ray retry 修复无新增 actionable finding。执行验收暂待 Root 的 fresh build13 / 原 Frontier2 与相关回归；本报告不把源码裁决当作 GREEN。只读生产、测试、官方 Runtime 与历史原始证据，唯一写入为本报告；未运行构建、GEN、Native 或测试，未修改私有冰桥候选。

## 精确范围与身份

阅读根因 `.sdd/101-20261003-per-bomb-chest-contact-bound-investigation.md`、既有测试独审 `.sdd/101-20261003-per-bomb-frontier-native-test-independent-review.md`、原私稿 manifest/publish、Root fixture before 原件、生产 `.run/per-bomb-frontier-production-fix-01/{before.json,after.json,BomberBlastTerrain.Server.cs.before}`。Root 历史 RED 与本次最小修改均保留，未覆盖原报告。

物理核 SHA256：

| 输入 | SHA256 |
| --- | --- |
| 原 Frontier2 draft / fixture before | ca94e4a140ab9ad582274e415a00051198dcc1a7e758222ee06d623df804cb64 |
| 当前 Frontier2 唯一 fixture 修正 | 4d25deea747123af962db28fac8e8e9b219cf1afbd9455ff4c3688b710014a2e |
| Blast before | 681f14ad9420df3b0c4b1934172780e6f907fe5ebd42a43e4b0d58927d7660b8 |
| Blast 当前候选 | 701769cac2b57d5be3fb10bd39d387b1b13b8a35f0c089ff8c65b08cf6d8c843 |
| BombState.Server 未变 | cf1e28598ba270d816a3d1e89b60c799c3c683946f20116d933714549efa0ff1 |

官方运行基线为 complete07 manifest `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`。本轮直接阅读 `C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/coordination/src/Lumio.GameRuntime.Coordination/Voxel/HostVoxelWorldAdapter.BindingContext.cs:113–145`，没有用当前 Runtime 主仓代替 exact pack 源。

## Fixture 与实际 RED 分类

ca94→4d25 的实际 diff 只有 `BomberTerrainFrontierRetryTests.cs:209` 增加 `Assert.True(scene.Adapter.TryRefreshBindingContext())`。前后仍检查真实实体 live/type、当前 Native 空 material/null binding、真正 SectionRevision、PrepareWriteV2 block+binding 同 token、CommitV3 状态与实际 readback。官方 API 从真实 World 活组件读取 fullID/wire type，经现有 policy、owner 与 byte/capacity guard 后真正 ReplaceBindingContext；没有伪候选字典、binding、receipt、Claim、revision 或 production debt。

`terrain-frontier-retry-red-01` 实际 2 total /0 pass /2 fail /0 skip /raw2，两例均在 C 第一次作者绑定的 PrepareWriteV2 报 EntityBindingMissing1016，没有到目标行为，因此是 fixture 初始化失败。原 log 物理 SHA `a82a960a2c74b0d456b8f2c8c8ed322192e38b0278516d399470f26b04616d85` 与 JSON 一致，SourceChanges 空、`.exit` 与 JSON 都是2。

`build-12` 实际 0 Warning /0 Error /raw0，SourceChanges 空，log 物理 SHA `5e3cb570ab758adf06c5c7bb6b8ac64d283fddc079809a4dc1b2f780a4269904`。其二进制身份与 red-02 metadata 六项完全一致。

`terrain-frontier-retry-red-02` 实际 2 total /0 pass /2 fail /0 skip /raw2，SourceChanges 空；log 物理 SHA `b12bd3812084185d311f9782b00368381e98f39209ee0d4934f26357731565c4` 与 JSON 一致。inspectCursor=true 在第106行 ExpectedFalse/ActualTrue；false 在第134行真实 replacement live 断言失败。完整前置 A/C 真正 Native dig/Original、原 source/participant/life/generation/chain/family/Occurred、统计结算与新代绑定均已越过，没有使用 EntityBindingMissing 充当业务 RED。测试没有因坏路径 receipt 存在而接受坏路径：条件分支只核验其真正 Native 证据，最终原严格断言仍拒绝新代被命中。

red-02 的 Tests=`5f6c65dac5ebcaf6da99231669b81bade0dbce1a6b0bc7ee84d6b9c1fb100859`，Game=`d1b52f3761e885823bfb654ea9603fdc09fe20856eb7f6be6c207d5e266557ff`；Ecs=`aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49`，Gas=`09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`，Native=`c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12`，build-info=`f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d`。共享输出目录正在被 build13 使用：检查时 Game 已变为 `78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e`，其余五项仍匹配。历史运行身份依靠其结束时原 JSON，不将滚动 DLL 误称为未改动的历史冻结件。

## Spec：唯一生产修改为何成立

`BomberBlastTerrain.Server.cs:91–100` 不再把竞争重试变回原 origin/full Power，而保存本次 Ray 输入 `x,z,direction,remaining` 与原 family/Occurred。只有输入 cursor 仍等于实际 bomb origin 时保留 Unstarted=true。Trace 的首次 Ray 来自 origin/Power；原 no-read continuation 也正是 origin/Power。原 Resume(true) 将这一形状原样传回 Ray。真实 Original 接受的 continuation 则由 TerrainTransactions 的 detail.X/Z/Remaining/family/Occurred 写入，默认 false，且当前路径的 accepted 格与原 origin 不同，竞争后仍保持 false。

因此当前最小修改无需先前计划推测的第二域 Storage 修改：`BomberBombState.Server.cs:138–154` 已支持 false continuation 的合法 bounds/provenance/remaining；true 原 origin/full Power 的严格 guard 仍成立。没有放宽 guard 来容纳重放原起点，也没有增加不必要的新 persisted 形状。

false 的 Resume（Blast:55–67）先通过真实 Native photo 检查 accepted 格：该格若已被新 Destructible 占据就终止此臂，不对新完整身份重新 TryDestroy；可继续时才以该 cursor/remaining 向前 Ray。目标竞争路径原 A 的三格范围不会恢复，右臂仍(6,5)/remaining1；C 的原 receipt/source 链保留。Ray 内此前已读到的空格可能再次读到，候选只固定原已接受 mutation 前缀，没有宣称将每个无 mutation 的空格访问持久化。

真实 terminal contact 仍仅在 exact Native Original 接受后记录 full old chestID，且 source owner/life/generation/chain/family/Occurred、完整 pending section/revision 和单 consumer 路径不变。当前修改不触碰 TerrainTransactions 的 MaxDestructions、mixed-frame、pickup credit、Unknown/Reject、pending、奖励、库存、chest capacity 或 receipt 判定。初次被 C/A 竞争时 origin/Power true 仍是合法原行为；已有 accepted cursor 获得稳定进度，恰与两个业务 RED 的根因对应。

## Quality 与限制

唯一函数局部修改，调用方式、公开协议、持久列、生成物和旧测试/helper 没有变化；Root before/after 文件和物理 SHA 一致。无本次 actionable finding。

仍待 Root 对 exact701769/4d25 fresh 编译、原 Frontier2、相关 Terrain/多臂/既有业务回归给出真实执行证据。两个 Power4 terrain owner fixture 即使 GREEN，也不能证明任意 UGC Power、所有四臂排列、移动 origin、非终结 chest、全部 KnownReject/Unknown/paired恢复或 round debt；更不能从有限地图坐标数推出所有历史 fullID、24/25 固定上界、333 whole-match 容器 literal，或完整资源箱发行/16人整局验收。那些是独立预算及产品债务，不能借本修复关闭 Goal101。

## 追加：build13 与原 Frontier2 当前实际闭环

保留上文历史审查时的 pending/RED。Root 后续 `build-13` 与 `terrain-frontier-retry-green-candidate-01` 已只读核其真实 JSON/log/exit：build 0 Warning /0 Error /raw0；原 Theory 两例 2/2 pass /0 fail /0 skip /raw0，4.960秒。两组均371源/SourceChanges空，实际 Blast701769、测试4d25、BombState cf1e。物理 log SHA 分别 `36645c6ddcc58ea38df9e204a495594c51de16f465e4313647fcf68acee2e4ae` 和 `710bbe9a76ed81b1498b546291e91dc4dbca901dd49b6cce63ffd2fec41e8d77`，与各 metadata 一致；raw exit 与 JSON exit一致。build13 /测试六项 DLL/Native/build-info结束身份相同：Tests5f6c65…100859、Game78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e，其余官方07四项见上文。

因此目标 Power4 真实 accepted frontier与同格新fullID重复命中缺陷达到 scoped execution PASS。没有降低第106/134行或最终contact/source/统计断言；旧fixture失败与业务RED文件全部保留。相关31/28/2/6当前修复回归尚待 Root新运行：现目录 `*-regression-01` metadata 对应旧 Blast681f/Gameae2d/370源，虽已通过但不能挪作本候选的回归证据。上述UGC/固定容器literal及产品债务限制保持。

## 追加：同 build13 七组实际相关回归

后续 Root 七组新 `terrain-frontier-*-regression-02` 已逐组读取其 JSON/log/exit，合计 **86/86 pass、0 failed、0 skipped、raw0**。各组 JSON 与物理 raw exit一致、物理 log SHA与记录一致；各371源且SourceChanges空，Blast701769/BombState cf1e/Frontier4d25、Tests5f6c65…100859及Game78b1a0…803626e同 build13。这些是当前修复执行，未借用旧 regression01。

| 实际文件标签（共同前缀terrain-frontier-，后缀-regression-02） | pass/total | 物理log SHA256 |
| --- | --- | --- |
| production | 31/31 | 6c2bddd0739f632cc30625a8dc1f7ca1bf805f02f12dd347983b20a3e7222c9b |
| corrective | 28/28 | 1909f9fdaf7d6ddc810bcec8076a13b6e3b40adf4d5251cabda50e849a2fc044 |
| multiarm | 2/2 | cd8552c9ba1413f53fac81330ebceec5f5c6d6f54b84046f0dc6057eab873331 |
| bounds | 6/6 | 6fa57f67f84e1ae88cced76b51927f26872094990569b4913de30dedb326e013 |
| split | 11/11 | 6189517193f8bc5413b07c6572492249f8a3b024727fa4b26b434b19803bf88e |
| regeneration | 6/6 | 084fca59c291b938700103e41ab384fe5b6790dce1e042b9a8e470d7fe636b19 |
| fire | 2/2 | eae92d589c2b019b033cdb21f39feaa166f1dd5646623b647ab9b828bfb6f426 |

当前裁决：Spec PASS / Quality PASS / scoped target及相关回归execution PASS，无新增finding；本单源修复闭环。原Frontier2另计2/2，不混入七组86的分母。没有全Game/全Native/fullproducer或所有UGC证明，前述预算与Goal101限制不变。
