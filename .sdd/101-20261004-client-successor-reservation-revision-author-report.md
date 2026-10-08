---
type: implementation-evidence
status: author-sealed-pending-independent-review
scope: owning-client-two-minimal-fixes
---

# Client新预留修订号与Bot故障退出：作者交回

候选在独立 `C:/Work/LumioGames/.101-pack07/LumioClientSuccessorRevisionRepair`，base `a6071a2a28c3cfda78400254654d6da1fef25b92`。没有提交、暂存、修改共享Game生产/test/pins、触碰冻结完整11或操作真实服务/浏览器。正式候选没有临时诊断；单独诊断树及其源封件继续保存。

作者封件：`.run/successor-reservation-revision-repair-01/seal-01/manifest.json`，SHA256 `385fd6d128952caeaf33d441a96ea1766dc47f7d0fae6754df6ef68162bd5ae1`。包含7个最终源码/夹具路径、所有原源、RED/GREEN/XML/rawexit、失败尝试、相关DLL/PDB及命令脚本；生产只改以下两源：

| 生产源 | 最终原字节SHA256 | 改变 |
| --- | --- | --- |
| Client/Gameplay/ECS/src/Public/SuccessorAdmission.cs | `73ada7ba2b06cf00cbbe518ad4d91f5e13f35a2934ee26a23d9863d607441583` | 只把跨授权的revision下降拒绝限定在当前预留操作；新的observe可开始新预留的初始revision |
| Bot/Hosting/Host/BotHostResidentLoop.cs | `0625472bb9b70092dcfb72acb377f93d2cb5d9550c98fe4a23fa9e8a38c206aa` | FinishScenarios增一行独立terminal会话失败断言 |

其余5路径为原ECS负例迁移、ECS tests csproj单行fixture复制元数据、两个NEW测试、原字节socket fixture。无生成源码、额度、频率、人数、NativeDLL、ALC或deps改动。`ClientSession.Successor.cs`与原base完全相同，SHA256 `3de3dad1b3be7afb5652ad6617093a15388a01b8e0191c06c2bde37b8e7826e4`。

## 实际故障与Native消息来源

完整11真实诊断局三Bot在next match后本地 `bad_envelope/txn=successor`，随后Faulted；Host却写PASSED/exit0，launcher因PID16268提前退出而终止全部场景。只读取证在父仓 `.sdd/101-20261004-prepare-diagnostic-scene-exit-readonly.md`。原日志没有授权bytes，不能把任意Bot participant按ordinal映射。

Reentry独立的真实签名Host/官方11 CLR/Native场景已产出未改143个socket UTF8帧、100,019 bytes，SHA256 `8b3fb517b0d4903bed847a9814745b61cbdca34d77e82d9aa0c9888ac85d5e55`。来源资格报告 `.sdd/101-20261004-real-host-next-match-revision-reset-evidence-accepted.md`，SHA256 `719d2dc5baadb713fd8b298a191a5d953f003ac246af324181d09350e1a824d2`。

实际原流五个授权/Welcome的operation、sequence、revision及attachment epoch为：initial1/1/1→observe2/1/2→transfer3/2/3→observe4/1/4→transfer5/1/5。同socket及admission；上一轮falseEligible终局观察后，真实Host授权supersede让当前reservation到revision2、Native恢复与transfer Applied/Consumed；新life再死亡产生新reservation的初始revision1。正式契约 `engine/wire/successor-binding-v1.json:637` 明确一份current EligibilityRecord每retained reservation，初始revision1；per-admission单调的是authority sequence。不能把两个计数作用域混为一个。

Client目标RED逐行读取记录中的 `utf8` 字符串，转回其UTF8 bytes并通过现有私有 receipt issuer，保留selected transport、本地generation7、真实Native ClientReplica及逐次typed Welcome。没有从parsed DTO重造授权。其消费夹具不认证远端；真正signed socket/Host/Native来源由独立上游证据负责。该用例只验证授权与Native Manager边界，不消费普通WorldChange/Section authority baseline，故一直断言InputEnabled=false；不得据此冒称完整Client socket玩法E2E通过。

前三组实际授权/Welcome及Native manager转移均成功。第四次实际observe seq4/revision1被原Client拒绝：current transfer seq3/revision2/gen3、candidate observe seq4/revision1/gen4，participant完整`00000000000000010000000000000003`、前一controlled life完整`00000000000000010000000000000004`、Previous gen3全部连续；same admission/socket/profile/instance/incarnation/effectWorld均一致。唯一违反的原条件是把reservation revision当作全连接非下降计数。

## 最小出口及保留边界

ECS只增加 `next.Operation != "observe" &&` 到原revision下降判断前。observe的control形状仍由原严格codec验证，必须合法controlled→Participant observing；原精确sequence+1、previous完整相等、admission/socket/profile/world/incarnation/participant/effectWorld、pending单槽、one-use receipt、Welcome、Section、数据所有者检查全保留。没有授予Future Create/Ready/Play权限，没有减小任何验证或资源上限。transfer/reattach继续在同一reservation拒绝revision下降。

原 `AuthenticatedTransitionStillRequiresTheCompleteIndependentTuple` 中初始controlled revision2→新observe revision1被当作非法的单变体没有正式合同依据；仅移除该字段变体，其他独立tuple负例全部保留。新增transfer及reattach两负例：current observing revision2，candidate其他字段合法但revision1必拒、无pending、epoch/Manager不变；相同合法candidate revision2仍可消费。

Host是另一独立缺陷。原loop遇Faulted/Superseded设置scenarioComplete，最后只运行Game Assert；`BomberPlayScenario`持续Continue且默认空Assert，所以错误通过。候选只在FinishScenarios增加 `sink.That(session.State非Faulted/Superseded,"session_terminal")`。不延长预算、不继续缺Bot、不吞故障、不中断严格协议终止；launcher的全children存活检查、退出及清理不改。

NEW Host回归驱动实际原resident loop/真实Native初始baseline，然后仅注入已被真实局证明的terminal status，以隔离Host归属；不是fakeDS、替身准入或Client协议E2E。空Assert、持续Continue、默认unbounded，在原Host两case均错误exit0；候选均exit1且run.passed=false。既有正常Complete/失败Assert/预算/scenario CLI回归同时通过。

## 实际执行

依赖为全新detached Source ProjectReference树Engine `523c3d3`、Runtime `520ffe482e1c48fb6e48187925eecec986cdb9c8`，严格默认analyzers、独立Artifacts及锁；没有修改现有clean组合及官方包。真实Native为完整11 `ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff`，由原build-info验证正常加载；无ALC忽略版本或DLL替换。本轮是source候选资格，不是新完整包消费身份资格。

| 执行 | Build raw | Test raw | 实际数 | 结论 |
| --- | --- | --- | --- | --- |
| 诊断原guard已有严格回归 | 0 / 0warning | 0 | 27 PASS / 0skip | 原guard分支保持；非next-match RED |
| actual-reset-red-01 | 0 | 1 | 1 FAIL / 0skip | INVALID_FIXTURE：误要求初始Welcome替换Manager；原件/source保留 |
| actual-reset-red-02 | 0 | 1 | 1 FAIL / 0skip | 真目标RED：seq4 observe Expected Pending / Actual Rejected |
| 生产候选 green-01 | 0 / 0warning | 0 | 30 PASS / 0skip | 实际原流5次授权可消费，全部严格回归及两同预留负例通过 |
| Host原源 host-red-01 | 0 / 0warning | 1 | 2 FAIL / 0skip | 真目标RED：Faulted/Superseded，Expected exit1 / Actual0 |
| Host候选 host-green-01 | 0 / 0warning | 0 | 20 PASS / 0skip | 两目标及相关CLI/scenario回归通过 |
| Session session-01 | 0 / 0warning | 1 | 33 PASS + 4 FAIL / 0skip | 四个parts夹具缺必要LUMIO_ENGINE_ROOT，INVALID_ENV；源及DLL未改 |
| Session session-02 | 沿用同DLL | 0 | 37 PASS / 0skip | 仅补同Engine契约目录，successor及authority group全通过 |

总相关GREEN为87，非包括额外重复诊断27的总数；不能将172/其它类重复计入。所有失败/raw/XML原字节保留，没有用编译、环境错误或错误期望当行为RED。

独立诊断树 `LumioClientSuccessorDiagnostic` 的两源封件SHA `84bdeb48aaf53dde3cfb25fc79cef705a082f4faaaaaccae1daf5c8491d28303` 已由Root接受私人诊断source-only；正式候选另树基于base，完全不含该日志。诊断console成本及可抛性不作为正式性能证据。

## 未闭合资格

等待非作者独审这份exact7-path封件，之后由Root显式选择提交、干净组合及官方完整包消费。真实八人浏览器下一局、双方连续移动/放弹、十次实际关闭新tab可玩重进及性能改善仍须实测。这个授权-only回归不能替代这些用户体验判据；其他Game Prepare、Result、Scope/movement/model待办均保持父任务原边界。
