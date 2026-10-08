# Game Session 入口独立审查

结论：本次 Session／同世界表现接线及候选发布物选择窄范围 PASS；不代表正式多人整局、M2 全档位或表现还原验收。

审查者：Root。冻结输入为 `games/101-bomber/.run/20261002-client-session-integration/game-entry-review-01/manifest.json`（22 文件，manifest SHA256 `e4c2f730362267c6b8ec0d36799f57cc5ec7cdcb5add2f0bd0f642572fa941e0`）及 review-02（两个测试文件，SHA256 `e6d98835d4539fd9d2a2cb3b0123a546a8c2a72be2ccd345790cd2ab5882b398`）。冻结文件、清单与当前文件逐一核对，24 路径 drift=0。

## 源码核查

- SpectatorReplicaHost 通过正式 ClientSession 创建和获取 Replica；输入只经实际 Self 上的 AbilityComponent 提交，ClientSession 负责序号、编码与运输。观察和控制状态取自 Session，未发现 Game 接入第二个连接或自造权威状态。
- 浏览器表现只持有正式 Engine 世界的完整句柄；退休时先停止表现，再关闭 Session，异步资产创建以代际及实际世界有效性检查隔离。重启等待旧 Session 的真实清理完成，清理失败可见且不会直接清空仍持有的资源。
- 明确选择的候选必须经过完整文件清单、SHA256、原 SDK SHA512、官方 builder 来源和 web 清单校验；无法读取候选时不回落到旧 Engine。候选保持 fullRelease=false，没有冒充正式整套发布物。
- 实际 Native＋WebSocket 测试夹具明确标注授权帧属于测试边界，没有将该夹具称为真实 DS／Platform 完整对局。现有 Game authored presentation 主体不属于这次冻结接线审查。

## 独立执行

Root 对当前正式 43a59-04 的 `selection/` 目录运行所有 Spectator Node 测试及候选选择测试：57/57，0 失败、0 跳过、exit0。证据为 `games/101-bomber/.run/20261002-client-session-integration/root-entry-independent-02.log` 及 `.exit`，含五项真实同源 voxel WASM 用例。

第一次独立运行将发布目录误作内部 selection 目录，实际52通过、1模块加载失败、exit1；`root-entry-independent-01` 完整保留。读取 selection.props 后只修正执行路径再跑，没有改测试或退回旧发布物。

作者35项 Native＋WS 与四 profile 浏览器生命周期证据保留为作者证据，本次未重复执行托管构建。真实权威浏览器仍需用包含初始 owner 修复的新 SDK 重跑；完整正式对局、技能、结算、下一局、视觉与音效仍属后续必验项。

M2 12／16人支持另有未收口的公共声明上限；`main.js` 的辅助 player-state 文案仍含 `/8 players`，应在对应档位接通时改为真实配表容量，不得以此窄范围 PASS 宣称全档位已验收。

## 第三切片：首个权威快照前读取

review-03 manifest SHA256 `b1d2437c6a9b7397ae095e4f80316b9a2926bbd66d21c79740fd3e79d2c311f4`，两文件窄修限定 PASS。Authorization／Welcome 已创建 Replica、首次 WorldChange 未到时，无 Match 是合法等待；AuthorityTick 仅在确实无 Match 时返回未观察值0，仍保留 Single 的重复实例断言，没有吞异常或伪造 Match。新增真实 WS 用例在相同 Session 验证等待时 null phase、inputOpen=false、tick0，再实际应用快照后观察 tick1 及 active。

Root 使用 a5fa 正式 SDK Native `3ab8500d470c2fd66236229549e1d7e1fa58094b41b899aab2e191cf1810618f` 和当前实际测试 DLL 独立执行1/1，0失败／跳过／NotRun，exit0，证据 `root-pre-snapshot-independent-02.log/.exit`。第一次误用了 MTP 的 --filter-method 参数，当前 DLL 是 xUnit v3 入口，未执行测试并失败；读实际帮助后使用 -method，不将该次参数失败计作产品 RED。

真实浏览器另已复现开局选角出现过晚的体验缺陷。此项不在首快照读取修复的通过结论内：ADR0030 与 design §8.0 要求先选再进，入口必须在申请准入前让用户完成已有五选一，后续仍由真实 RPC／Effect 权威采纳，不能靠延长 Warmup 或默认偷选解决。
