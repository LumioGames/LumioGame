# 101 浏览器体验 · 本对话收尾与恢复入口（2026-10-05）

本对话按用户最新要求停止开发并保存所有本轮成果。原正式交付 goal 为 PAUSED，体验与正式交付尚未完成。此记录是恢复入口，收尾提交不代表审核、发布或验收通过；main 未因归档发生合并，没有发布新引擎 tag。

先读父仓 `.spec/AGENTS.md`、`.spec/knowledge/README.md`，再读101入口与知识导航、交付账本顶部及本记录。完整本地元数据位于 `C:/Work/LumioGames/LumioGame/.run/20261005-final-handoff-01/handoff.json`。其 `owner-archive.json`、`engine-archive.json`、`parent-archive.json`、`cleanup-result.json`、`evidence-moves.json`、`live-final.json` 分别记录实际提交、远端读回、本地恢复包、精确清理和最后现场。以这些最终结果为准，不把 checkpoint42 的旧 fatal 现场当当前现场。

## 保存与恢复

本任务 `.101-pack07` 下77个直接检出（71个 linked worktree、6个独立 clone）的原 HEAD 与有效未提交源都先保存；另发现并归档一个藏在旧 `.run` 中的嵌套工作树，已移除Git标记及登记，完整目录保留为普通证据目录。93个 `.run` / `.tmp` 目录、118257个证据文件已移至最终交接目录，核对成员与长度；另有逐文件 SHA 校验的 Client16、Runtime25、Server12关键证据及变更源码原始字节。普通 bin/obj/target 缓存可重建。原父仓与游戏 `.run` 保留，未纳入源码上传。

归档使用各所属 GitHub 仓的 `refs/notes/101-bomber-handoff-20261005-closeout01/*`，并保存经验证的完整历史 bundle。归档节点的 parents 保存不同候选，不是把候选合并成一份生产树。`owner-archive.json` 提供每个检出的 `savedHead`、对应 `repositoryUrl`、`archiveRef` 与 bundle；必须恢复目标 savedHead，而不是盲目使用归档节点的树。

| 候选 | 保存的提交 | 归档组 |
|---|---|---|
| Client16 working-read hot byte codec | c361151828b9b512bd6ab3826692c4bbbf288814 | group-08-lumioclient |
| Runtime25 offline controlled successor | 41405896c7409d0c9ed4db8333b0ba721bc89191 | group-07-lumiogameruntime19traceindexlfcomposition |
| Server12 offline death tests only | 11cdb390498c0315fc36dafe91b9a90394eb9683 | group-11-lumioserver |
| Engine ADR142 / wire Draft | 3443135bd35cc0e99c146a31add5c17be3f1869c | group-01-lumioclientdiagengine11 |

例如恢复 Client16：在所属仓 fetch 完整 ref 后，新建隔离 worktree 指向 c3611518…；Runtime25 的原 common DB 已清理，直接从 LumioGameRuntime GitHub 仓 fetch group-07，不依赖已删除的 clone。

```text
git fetch https://github.com/LumioGames/LumioClient.git refs/notes/101-bomber-handoff-20261005-closeout01/group-08-lumioclient:refs/notes/101-bomber-recovered/client16
git worktree add --detach <新的隔离目录> c361151828b9b512bd6ab3826692c4bbbf288814
```

父仓完整成果另保存于 LumioGame 的 `refs/notes/101-bomber-handoff-20261005-closeout01/game-workspace`；原任务分支已清理，主目录保留 detached 检出，完整源码仍可见；继续时创建新的工作分支。只读查看不是发布资格。Engine 子模块原7e798301上的12个历史脏文件另保存为702f9d903e4a6ee78e8d9c4cb06408599c6a19c8，归档 ref 为 `inherited-engine-snapshot`；该指针仅代表收尾快照，不是官方完整24或新发行版本。实际预览继续消费父仓 `.run` 中资格化完整24，不消费该历史脏子模块快照。

## 实际基线与现场

已资格化：官方完整24（Runtime57bd5303、Clienta9d44ba4）、Game26普通四域及同源严格Host AOT。正式376网页文件和18105纯UI测量377文件共用一个DS与唯一权威世界。完整24 manifest b7fc286f2a3f1ccde5d1cdb3a472a863676dad52c387aa36ce26b9b55f33bf44；严格AOT wasm 7bbc3fbb830a400007cb16b9531d7a0633fb15ec4d87e521910e73b472416a3a。已独审的Game26五改两增 JSON sourcegen 源已精确应用到父仓，七份 hash 见 `sourcegen-applied.json`。没有把私有测量UI覆盖进公开源码。

恢复后真实2+6八人场景：公开 `http://127.0.0.1:18101/play/?player=A` 和 B；纯UI测量18105；DS `ws://127.0.0.1:18331/`，私有Platform18097。收尾采集 launcher37356、DS30168、aux13144及六Bot；最后核查确认该恢复场景又于12:28:04.239279Z、Gameplay Tick28297/Host Tick28298触发同一死亡结构fatal，DS实际exit2，launcher verification为FAIL，所属8进程均已退出；收尾只精确停止残留aux13144，没有再次恢复预览。当前18101/18105/18331均停止。完整失败已复制并核对SHA；下一对话须先据归档与场景恢复记录重建真实现场，不继承SERVING。不要影响18081、18082、18084、18085、18092–18097的其他服务。

旧Scene26于2026-10-05T11:52:23Z、Tick313680实际 fatal：`Death structure intent no longer identifies its live old body`。旧DS2756/launcher38340退出，旧aux13340精确退役；已用同一资格化基线恢复新账户场景。重启本身未修复这个根因，存在再次失败的可能。恢复场景有新的 first-start 与 paired / dual-move cut 日志，不能拿旧 Running 截图代替当前可玩性。

## 最新用户反馈与性能证据

用户实测明显优于最初，但人多仍非常卡，延迟略高。先继续实际浏览器体验，不转去其他正式交付缺口。

严格AOT真实移动样本：A同身体189 Tick约18.560Hz，Tick均27.944ms、p95 66.1、max91.5；同窗B约20.012Hz、均8.450ms。A working-attempt均26.963ms，JS Native边界均0.820ms；后者不能当净Native CPU。局部提交至下次保留Tick的95样本均29.254ms、p95 42.8，不是权威ACK。rAF也不是GPU帧率。人数因果、物理收发节奏和真正输入确认延迟仍未证明。

有限量测与解释边界见 `.run/scene26-aot-browser-performance-readonly-01/finite-summary-result.json`，同摘要 hash d9588f6be6014f761a45ba14b363c34950d7c0dce4bf824c45f983b938da4cc9。新恢复双向Touch采样见 `.run/live-private-aot26-root-restart-02/dual-move-01-cut01..09.json`；A约10秒死亡换身体，不能称15秒连续同身体通过。人数会随阶段波动，没有人为减少Bot。

## 未完成候选的准确边界

Client16：原固定分配门实际RED（working1000次2720000B、clock696000B），曾63/63 GREEN。最终源码又增加5项边界测试与输出，尚未执行；strict trim只保存旧模板，尚未接入hot-codec可达性、publish和执行。没有进入官方整包，也没有浏览器性能通过。先补资格与独立审查，再完整包消费，不能据CoreCLR结果宣称浏览器改善。关键证据保存在 `preserved/client16-working-read-byte-codec-01`。

Runtime25：当前Native24真实32/32与successor227/227 GREEN；但ADR142仍Draft/Owner Pending，不能自动启用或发行。Server12只有四份新测试，三份生产文件未应用，当前Host RED/GREEN未执行。provider25只是隔离托管SDK，未被Host/Game/浏览器消费。根因与公共语义边界继续参照原Scene20调查及Draft，不去改游戏死亡guard掩盖生命周期缺口。

## 仍关闭的交付门

- 两独立玩家同房间双向移动和放弹同步、全部修复后至少十次真正关闭旧页再新开且可玩重进，仍未完成最终验收；旧十轮只有旧基线部分连接恢复。整浏览器进程退出仍UNTESTED。
- 公开Platform18085仍签 `bomber-0.0.4-main.ecece8a`；发布身份未闭合。
- BomberPlayObservation.cs 与 replica-adapter.test.ts 的严格schema15 source pins因真实漂移保持关闭，必须独立复审，不能直接换hash。
- 其余正式交付缺口完整保留，原goal暂停不表示完成。

继续时维持唯一权威世界，源码问题在所属仓修，再经官方完整包消费。不得通过旧DLL替换、减少玩家/Bot、关闭体素、降模拟频率、放宽额度或协议校验、原型模拟器遮掩体验问题。保留原失败与原始日志，按复现、证据、根因、最小修复、真实回归推进。



