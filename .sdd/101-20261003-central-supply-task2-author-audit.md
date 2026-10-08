# Supply Task2 当前17项 · 作者只读复核

2026-10-03。Root 要求继续核实际资格、配置、恢复/tuple与exchange。本 agent 编写过当前 `BomberCentralSupplyBoundaryTests.cs`，故**本报告是作者复核，不是非作者独立审查**；需要独立完整 verdict 时必须交另一 reviewer。Native13 fixture 由他人实现，其独审执行关闭已另补 `.sdd/101-20261003-native-correlation-successor-fixture-independent-review.md`，新报告 SHA `8e41bf2b87782c637c1b1106c3effe177b18bf2874ba5ce43f10fc185783c67d`，实际13/13、0skip、raw0。

本轮完整读取 Task2 计划、当前17项与 helper、Supply owner、Pickup Awake/OnHydrate、Pickup GAS/特殊kind解析/普通交换、Terrain credit 与 round gates；按 systematic-debugging 先实际失败阶段再沿配置与producer追因。没有改 source 或任何生成物，没有运行 heavy/GEN/format，也没有重标既有 freeze。

## 精确实际结果

当前测试 source SHA `aef1278753d2b5a42988285f25dc189cfc343a8e535360db81132675e92ef29f`，与 freeze02、运行 sourceSha256AtStart 一致。计划 `docs/plans/2026-10-03-bomber-central-supply-production.md` 当前 SHA `ff2e08e8ac7a3d80d4a1d07e56a1e2d365c5520b0aa0d2d315c5c7d0a1dfdf68`。Root 首跑 `games/101-bomber/.run/v14-native-production-20261003/central-supply-boundary-red-01` 已完整结束，实际 **17 total / 15 pass / 2 fail / 0 skip / raw child exit2**，耗时1m14s752ms。

log SHA `4ec806e0f3e6eaaf1d1123a8c2ccca01bb7484251b9f1ee5b808293b15e72134`；JSON SHA `818ac8bcc308238a3e095940c7abcb4fa685684cb1c0c86f4f673e335aa9c129`；`.exit` 与 JSON.exitCode 均2。JSON official manifest `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，Tests `3ef591c202edf1faba6eac5225f9b2177c2fa8c9cad9c7a2f0e7d02f3b276910`、Gameplay `9043262095be360d48921a114d9fa2f41b1d1c6795b423bc41dd01f43e8ce685`、Ecs `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`、Gas `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`，均与只读核验的当前实际文件一致。

唯一两失败是 skills=true/expected11（测试:51）和 exchange（:328 经 ReachOpening:395）。**两者都在实际结构首次发布的 EcsCommandBufferCommit → BomberPickupItem.Awake → Supply.ValidateItem:152 fault**。exchange 尚未到 `CanActivate`、GAS 激活或换出来源断言，不能将该失败列为 swap/provenance 的实际 RED。

## 夹具与业务阶段分类

### 已证实的六形准入缺口

测试 SupplyConfig(:381–383) 仅修改真实作者表的 supply_enabled 与 skills_enabled，经官方 LumioConfig exporter 编译；没有注入假 ObjectBudgets，没有手改生成配置。当前作者 `bomb_kinds` 中 Fire/Split/Remote 仍 false。Supply.Select(:211–214) 保留 fire/freeze/remote/split/pierce/toxin 六形完整池，ValidateItem 通过 ValidContent(:84–90) 要求选中kind enabled。原 producer guard 对 Fire/Split dormant 与目前 Legacy19/8participants 保持，ObjectBudget105全过不能解除这条条件。

当前两个真实首失败正位于这个完整source/profile准入边界。默认发行9件与其他15项成功形成工作对照；没有证据显示它们是生命、恢复或 exchange fixture typo。最小保断言后续是让各 producer/config/budget owner 在批准范围内交付完整六形，继续原 skills11 与 exchange 用例；**不得过滤 special 池、缩数量、挑只支持种类假装六形完成、手造一个 Supply item 或删除 Applied/来源断言**。本轮没有取得实际失败选中skill的完整ID输出，因此不猜到底是 Fire、Split或Remote哪一颗；三者表态与资格冲突应按完整池收口。

### 尚未真实执行到的 exchange 业务缺口

`PickupAbility.Server.cs:15–52` 对 held!=0 的真实交换复用原 Entity，把 incoming skill换到玩家，将旧skill写回 item并设置 DroppedBy/ExcludedLife/current generation；但该分支没有移除 SupplyMatchId/SupplyOrdinal。Supply.ValidateItem 明确拒绝同时具有 Supply来源及 DroppedBy/ExcludedLife 的混合来源，下一个正常 Supply.Advance会拒绝。这是可精确指出的生产缺口，**当前17首跑没有执行到它，仅静态定位**，不能借首次publication失败宣称已验证 swap RED。

进入该阶段后的最小方案是在同一个真实 exchange 分支，记录 original pickup事件后、写普通换出 item时移交该已实际发布信用：清 `SupplyMatchId=0`、`SupplyOrdinal=-1`，保留同一 item实体、旧skill、位置、dropper及完整 ExcludedLife generation。原 published pending已经由 Awake实际结清；此动作不返还信用，不产生新实体、不吞旧未知promise。只能在拿到该阶段独立实际RED及写授权后修改，不能通过放宽 ValidateItem 允许混源。

### 实际生命资格与技能前置

exchange 使用 Scene 的真实初始 life，在实际60秒发行后移动到 actual incoming item，再要求 `PickupAbility.CanActivate` 与真实 GAS Activate成功。CanActivate保留 Running/FinalCircle/Warmup + Protected/Vulnerable、actual live source/target、participant.CurrentLife/full generation/match、距离、可交换Native地形与已启用特殊kind；测试没有赋成功receipt或调用 ExecuteAuthoritative替代 GAS。

目前未到这一行，因而不能以 source推断替代实际生命可用成功证据。后续若失败在 CanActivate，先读取具体reason与当时 full current-life、phase、RestorePending、health、selected kind/slot合法性；保持这些资格守卫，使用真实 current life与正常恢复路径建立前置，不能手写健康/phase来绕过故障。可在下一授权 TEST增量加入明确 current life/generation/match、health>0、RestorePending=false 与 skillsEnabled/selected kind enabled 的前置断言，帮助区分阶段；它们不得取代原最终交换断言。

## 计划对照与15项已到达的真实范围

| 当前用例 | cases | 实际范围/结果 |
|---|---:|---|
| ActualFiftyAndSixtySecondTicks… | 2 | skills-off9 PASS，真实50/60秒实际tick/唯一发行；skills-on11 publication FAIL |
| FullBatchAdmission… | 2 | 实际已发布Health填充至cap−8/−9，经真实destroy finalization等到九份信用，全部一次发布且不重复扣prepaid信用；PASS |
| ActualNoDestination… | 1 | 实际Native无落点，9条真实unsubmitted；paired checkpoint+10Tick稳定，Results原match gate；实际重新落地、退休、Native清理、nextmatch重新发行；PASS |
| ExplicitSubmittedUnknown… | 1 | 实际选择后显式有效Submitted状态故障夹具；paired恢复+40Tick/Results无重放与债务不丢；PASS。不是实际Commands.Create异常或actual Unknown capture |
| HydrationRejectsAlteredActualPublication… | 6 | 从真实 publication复制保留tuple，再分别破坏match/ordinal/content/spawn/cell/mixed-source；实际Owner hydrate拒绝且Supply错误，未假造receipt；PASS |
| HydrationRejectsDamagedActuallyIssued… | 3 | 实际无落点选中memory，分别破坏match/duplicate ordinal/unsubmitted position，经实际Owner hydrate拒绝；PASS |
| ActualSupplySpecialCanExchange… | 1 | publication FAIL，后续真实GAS/普通drop来源检查未到达 |
| Codec… | 1 | 合法8192 UTF8 bytes、+1拒绝、é×4097必须byte budget错误、Encode12行拒绝、缺字段拒绝；PASS |

上述计数4Facts+4Theories/13InlineData=17。RuntimeOnlySnapshot只用于corruption拒绝；正向恢复使用持久Subsystem实际Capture的Runtime+Voxel paired checkpoint。实际15 PASS使这些范围成为真实证据，不能只凭静态定义表宣称通过，也不能把强制submitted夹具冒充Native unknown获证。

## 剩余覆盖与最小后续测试建议

这是按 Root“先最小类收口”的部分 Task2矩阵，不是计划所有边界的最终关闭。必须保留以下缺项：

- 计划列出的实际 pending future Occurred、wrong-kind，以及Decode/hydrate malformed JSON、>11 rows、缺字段/UTF8拒绝尚未全部经各自owner hydrate证明；当前纯codec/actual published corruption不能代替所有 pending组合。最小追加先取实际9pending，仅改Occurred为world.Tick+1并核原拒绝，再补wrong-kind pending；每次独立class/源冻结与真实首跑。
- 当前六 publication corruption 没有同一 retained exact submitted tuple 在 **paired** restore下合法结清的正控。ReservedCount=0只证明当前实际完整row匹配，不证明恢复顺序正控。可最小加一项实际已发布item+精确保留tuple paired capture/restore，核pending清空、同一full item identity与shared credit不变，再一Tick无重发。
- 完整六种特殊来源与配置准入仍未交付；两个失败不能用任意支持子集的通过替代。实际source/config完成后原17同断言重跑。
- exchange实际RED后保留现有SupplyMatch0/Ordinal−1、same item、outgoing skill、Dropper/ExcludedLife、10Supply+11credit、pending空及snapshot检查。再最小追加完整 ExcludedLifeGeneration、ClaimedBy默认、ProtectedUntil0、combo清零及terrain/death来源应有值的断言，并通过paired恢复核普通换出来源合法。当前CaptureSnapshot只是捕获，不是合法重载证明；不能把它写成exchange restore PASS。
- 现有capacity前置并非实际Terrain/death与Supply同Tick争抢信用；如需关闭所有shared-owner互斥，还需独立正常producer竞争用例，不能注入计数或预算。

本轮没有发现需要削弱当前17断言的夹具错误；当前真实两失败属于完整源/配置准入待交付。作者源码复核与运行结果如上，独立完整测试质量裁决尚需非作者。17不能称GREEN，更不能扩大为23/12、27/16业务、全Client、整局或完整Native producer验收。Goal101 未完成。
