# 完整14 ledger 包证据独立复审

裁决：`ACCEPT_EXACT_COMPLETE14_LEDGER_EVIDENCE18_ROWS30_REVISIONS_NO_SHAPE_HISTORY_CHANGE`。接受 Root 精确私有 candidate，用于兼容记录的包证据CAS迁移；不授予Live世界转换、身份分配或正式产品体验验收资格。

984项独立检查通过，实际Node raw0。before SHA `477baf7f0b4908c2a75d22ac3ca96520e837a940d7440c6d1542a9e6f2341bb8`，candidate SHA `8d72fdf3885ac679d7f5804fd9517fb63dc4cab317918f665b1a6923053305c4`。当前V16模块 SHA `11fa0f860f8e008c7c83558b5e5bd9a62374b406631d012b580a1f2f4613fa0d` 是已独审CAS启用14包引用的精确版本。读取实际完整14源/GEN/manifest/SDK后，调用原官方 `prepareOwnerPredictionLedger` 从原V15 predecessor SHA `8616a73978d008d14b26ffc4441b56565690d07dbb2b555278891fdc816094f9` 重新推导，完整输出逐byte等于作者 candidate。

全部787条active identityKey、kind/scope/value/owner/shape及顺序逐条一致，唯一差异是18条记录中的30个evidence revision叶：manifest `9a3289d2720efacee59e6f762b49771a6729fde53a9a5033e8fd9c016b1ff2c5` → `65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9`、SDK `f0ef1b6722f98e971a5eec9882061fb3b0f271810582eaeb7c79ed0fdb539e66` → `d7c97107620696669d8657e590d19d085cc2112243783ce48ac2d912bbdb21d0`。逐条将旧evidence中仅这两个revision映射后与新行深比较相同；其余schema/状态/engine/runtime/pending/transitions/releaseDecision/freezeEligible全部深比较不变，没有范围、序号、类型、权威、持久化或输入内容的变更。

9975条retired记录与43个page descriptor全结构保持；全部43页实际SHA/字节数匹配，官方重算的4个V16退休页与已存在冻结页逐byte相同。读取实际所需13个历史snapshot并认证所有retirement sourceSnapshot与必需本地历史关系。`compareHistory(before,candidate)`、`compareObserved(candidate,actual14)`、`validateLedger(candidate)`、`validateHistorySnapshots(candidate,allRequired)` 均为 `[]`。原68author/52GEN当前字节、V15 module `70cc863748a3ba9bf91095208f3ccbba2b1bb80269293bbedb96f79f9dcba44f`、V16 module11fa、共享ledger477及所有history输入开始/结束未变化；bounded reader `assertUnchanged`通过。复审未写共享文件、页或源码，未构建/调用浏览器/输入/服务。

窄负控实际成立：把一个已变化evidence恢复旧包revision，`compareObserved`产生拒绝；把真实Owner字段改None产生拒绝；只在内存中将一个retirement page bit翻转，storage以 `retirement_page_hash_mismatch` 拒绝，没有修改原文件。首次独审负控私稿选择了本已Scope.None的scalar，None→None没有变更，故断言失败raw1，是审查者空变异设计错误，不能算作者行为RED或正式保护缺口。原私稿、异常与raw1资格保存于 `attempt-01`；最终选择真实Owner字段后984项全通过。

证据目录 `.run/schema16-complete14-ledger-independent-review-01`：`review.mjs`、`protected-input-manifest.json`、`result.json`、`attempt-01`。manifest列明120源码/GEN、43页、13个必需history、原工具hash与作者四份封件。result SHA `db51c7874deea61d3ca8c9a24241f62a0ae8016985cb184f5dd560e562c56acf`。此资格仅为精确兼容记录输入证据更新；Platform身份/签名、两玩家移动和炸弹同步、性能改善及十次真正关闭重进仍独立验收。
