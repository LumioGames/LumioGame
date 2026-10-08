# 真实Host换场恢复后的新reservation revision重置

裁决：**EVIDENCE_REJECTED**。真实Host测试raw0、1PASS/0ignored（4.21s）。这不是Client或浏览器验收；完整原字节已交Perf进行原Client guard重放。Runtime/Server生产源没有修改，不能让Runtime跨reservation继承revision掩盖消费错误。

独立Server树：C:\Work\LumioGames\.101-pack07\LumioServerTwoLifeReentry，正式008861基线。实际两改动仅新 test和所属fixture mode。用正式完整11 consumer-freeze-01 SDK/Native/HostEntry/Ecs/Replication、独立strict NuGet lock/cache及fresh fixture DLL，SDK0.0.5-main.523c3d3，Nativeac8afd...，manifestf058833a...（完整hash见资格JSON）。Fixture CodeView/PDB匹配，Scenario checksum匹配actual inputs，最后source/input栅栏无漂移。没有替换单DLL、放宽额度或协议、制造binding/history/witness。

本案同一真实签名socket始终在线。实际GAS EliminateLifeEffect结算Health0后，generated participant policy Eligible=false，Prepare+Destroy成为无Created的真实terminal observing。随后正常改变generated Match/Intent/NextLife/EligibleTick并恢复Eligible=true；Host原query/CAS supersede合法把该retained reservation资格revision推进2。Native Create+恢复效果产生真实revision2 witness、Ready/grant及Applied转移，Game消费后该新life再次经过真实lethal/Prepare，创建新reservation初始revision1。两次Prepare均null。没有在fixture调用不存在的 SetSuccessorEligibility API，也没有自造Supersede或grant；此处复用了产品对generated policy的声明式输入。

实际AUTH→匹配Welcome链：

- initial sequence1 eligibilityRevision1 attachmentGeneration1；实际AUTH帧index0，Welcome帧index1。
- observe sequence2 eligibilityRevision1 attachmentGeneration2；实际AUTH帧index14，Welcome帧index15。
- transfer sequence3 eligibilityRevision2 attachmentGeneration3；实际AUTH帧index29，Welcome帧index30。
- observe sequence4 eligibilityRevision1 attachmentGeneration4；实际AUTH帧index52，Welcome帧index53。
- transfer sequence5 eligibilityRevision1 attachmentGeneration5；实际AUTH帧index120，Welcome帧index121。

同一admission/socket/profile/incarnation/participant/effectWorld完整保持；每次Previous逐值等于上个Next，generation依次1–5。关键是真实seq3 transfer/revision2后，seq4 observe/revision1，Host允许且有匹配Welcome/baseline。契约 C:/Work/LumioGames/.101-pack07/LumioGameEngine11SdkClosure/engine/wire/successor-binding-v1.json:637明确每retained reservation初始revision1；authority sequence是当前admission中的递增序列。Client原 SuccessorAdmission.cs122无条件较小revision拒绝已交非作者Perf核对，但本报告没有声称该guard已实际失败或完成修复。

143个实际接收文本帧，100019bytes容器：C:\Work\LumioGames\.101-pack07\LumioServerTwoLifeReentry\.run\eligibility-reset-native-01\actual-next-match-reset-02\raw-socket-frames.jsonl，SHA256 8b3fb517b0d4903bed847a9814745b61cbdca34d77e82d9aa0c9888ac85d5e55。每行只有utf8字段保存RoomClient.try_recv_text原string，Consumer应直接UTF8编码该string，不能从parsed对象重造。该容器的JSON转义不改变解码后原字节；每个AUTH/Welcome原字节SHA在qualification中单列。

第一次attempt01 raw101在连接前未waitUntilServing，真实code=upgrade_subprotocol_unacceptable/HTTP400，完全没有新succcessor协议事实；原input/raw/错误保留，不作为ClientRED。修正只添加原harness同样的waitServing/warmup；attempt02实际完整链通过。旧两life与13life证据封存不变。新生成物CRLF副作用保留，未reset/stage/commit。

实际目录：C:\Work\LumioGames\.101-pack07\LumioServerTwoLifeReentry\.run\eligibility-reset-native-01\actual-next-match-reset-02。本报告和C:\Work\LumioGames\.101-pack07\LumioServerTwoLifeReentry\.run\eligibility-reset-native-01\seal-01\manifest.json绑定原输出；后续Perf自己的真实Native Client原guard RED/GREEN与独审是独立证据，不由本Host PASS替代。
