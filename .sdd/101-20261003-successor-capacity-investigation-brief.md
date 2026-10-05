# 101 restored successor transfer 容量调查

先读owning Runtime入口和Game强制coredocs，应用systematic-debugging和TDD。根因未证实，不绕过真实transfer。

## 写域

- 新独立Runtime owning worktree `C:/Work/LumioGames/LumioGameRuntime-101-successor-capacity`，branch `codex/101-successor-capacity`，HEAD/base `23356eafc365c753b6e8d9987fd069815ff067ce`，从包06真实来源创建；不要写旧hydration-complete-world或pack06 frozen源。
- Game `C:/Work/LumioGames/LumioGame` 只读。Root拥有Terrain/M2/启动，capacity_schema拥有Schema/Remote/Split/Admissions，其他agent查Native HFSM。不得改Game声明或生成。
- Server successor-expiry独立修复已review PASS，five source freeze记录在 `.sdd/101-20261003-server-expiry-independent-review-report.md`；尚未正式新包。Server生产仅纠正Applied observation expiry不得再预约普通Entity expiry，不是transfer capacity修复。

## 实际重复失败

- Game capacity_schema真实Native/鉴权RPC Remote matrix12/12绿，新增实际死亡后的释放与后继案例13/12/1，old Life已经真实退场，restore dormant exact id末尾18；Observe Request1 Applied CommitTick6 Revision26；随后Transfer Request2..21全部Refused / NotApplied / Backpressure / `successor_capacity`，Participant.CurrentLife不转，eligible=true，pending=true，slot1。证据 `.run/resume-capacity-20261003/remote-death-reason-01`；具体测试源码由capacity_schema提供，不改断言。请联系其获得命令和JSON。
- Server真CLR fixture此前Stage4也得到successor_capacity。expiry目标测试专用ENV只让Stage4在已restore dormant后停留，以触发实际expiry；它不证明完整transfer。报告 `.sdd/101-20261003-resume-server-report.md`、Server `.run/101-successor-expiry/expiry-red-02`；raw Host operation diagnostics仍在。signed next-match真实1/1通过，说明不是所有transfer必失败。
- 旧真实8Bot real-tour09a首death附近 bot7 BadEnvelope 尚未定位，不能强归为同根因。新Client actualHost frame probe可另做，当前优先确定Runtime capacity真实返回分支。

## 精确消费与门

完整官方包06 Game `.run/20261003-controlled-game/complete-release-06`，manifestSHA `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，NativeSHA `419b74c7b5eac0f85a02ab58eda8485240194060dfd319e816ab35f501bfbfed`，SDK nupkgSHA `0b1657ec29ec83c4281549ebf787fe0b9187b5d30780b6bc513151bf75dd9c3b`。Runtime实际来源就是base233；Engine contract canonical用`LumioGameEngine-101-release-freeze0e`。

公共Owner四项仍待裁定，尤其ReservedSlot1..8→1..16不能自行改；此实际slot1失败不能借16槽候选放宽容量。Query65536边界/Native0revision/Period候选也不得自行批准。普通实现缺陷证实可修owning Runtime，再由独立reviewer审、新正式完整包消费；不把sibling源码塞Game、不换旧官方DLL。

高内存build/新正式包先通知Root，现capacity_schema正完成Split v13声明窗口；你可先只读调查和最小上游test规划。交回 `.sdd/101-20261003-successor-capacity-investigation-report.md`：具体分支、为什么拒绝、fixture与生产边界、真实RED→GREEN及相关回归准确total/pass/fail/skip/exit、source freeze哈希和未执行项。若是fixture配置不满足契约只修测试配置并保持原业务断言，不改生产扩额度掩盖。
