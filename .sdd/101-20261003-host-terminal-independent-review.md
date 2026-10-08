# 101 Host 准入终结回执独立复核

结论：限定的回执转发、短缓冲缓存保留和unused publication receipt切片通过；不是完整正式DS交付验收。

输入：ActiveRuntime `C:/Work/LumioGames/LumioGameRuntime-101-hydration-complete-world/.run/101-controlled-admission-provider/host-candidate-15green/manifest.json`。Root逐SHA核对四冻结文件后，在同父目录 `root-host-terminal-review` 创建独立Host/fixture项目和输出。三Host源使用冻结副本，其余Host源码复制到该目录；Runtime项目消费独立 `runtime-artifacts`，没有复用作者Host DLL。该source组合只是私有上游验证，不是最终Game SDK。

- HostEntry.cs SHA `ad3147babeb53677394c387531367d4362ab818488f9d5d93e56bd090ca2ece5`。
- HostEntry.Successor.cs SHA `ca5dd7937213ecba4c184177db564086c170778fb586625c9eb26eadf0302e9b`。
- HostEntry.Admission.cs SHA `71c461693d152cf9eb7f9cee2a123a8607fbe3ee1294983648169f1d559233c6`。
- AdmissionHostTests.cs SHA `3ae644dbfa74566149961c50df4d3a7859fc0642b942c3f54984c72d1eb87c1d`。

Root实际构建：`root-host-terminal-build-01.log/.exit`，exit0、0警告错误。实际Native身份由build-info.json对DLL SHA、buildId、ABI hash校验，Native SHA以原51c449生产侧库为准，未换托管替身。

Root实际测试：`root-host-terminal-tests-02.log/.exit`，**15/15，0失败/跳过，exit0，8.063秒**。运行器为同目录 `run-root-host-terminal-tests.ps1`，完整环境与实际程序集位置可恢复。首次01因独立ArtifactsPath输出不含net10.0子目录而未找到DLL，exit1；已保留，修正路径后实际执行15项，未改测试断言。

源码核对要点：

- 唯一真实DrainOutbox出口转发已有SuccessorAdmissionTerminals；未重新推导commit事实，未另造权限。
- 终结字段来自实际DTO，计数不超过原MaxPendingResultsPerWorld；完整identity、Applied/NotApplied/Unknown、attachment与decimal计数由既有序列化选项输出。
- terminal-only响应属于缓存债务，短缓冲不能discard；原响应重取后才可确认，重复确认与第二次空drain由实际Native测试覆盖。
- unused publication receipt只在私有grant字段逐项匹配后使用；已有ID读实际状态，新未借用ID才可返回Released。Snapshot仍保留；没有凭一次Reserve拒绝退掉其他真实publication或整个plan。

尚未涵盖：Rust Owner全链、真实socket最终fence、Unknown export接收owner、总临时内存闭合、正式SDK统一发布与101整局。这些仍在实现与验证，不能用本报告替代。

## 24 项冻结版本的独立复验

Root后续核对 `host-candidate-24green/manifest.json`，把全部Host源复制到新的 `root-host-24-review/host`，再按冻结散列覆入五个Host文件及测试；项目使用新的 `root-host-24-artifacts`，没有复用作者Host测试程序集。Runtime生产为3c4（Root f708仅修改PrimeProbe测试定位）。

`root-host-24-build-01.log/.exit`：0警告、0错误、exit0。`root-host-24-tests-01.log/.exit`：**24/24、0失败、0跳过、exit0，5.631秒**。执行器 `run-root-host-24-tests.ps1` 先验证真实Native的SHA/buildId/ABI，要求至少24项。证据仍在ActiveRuntime `.run/101-controlled-admission-provider/`。

新增核查覆盖真实PendingDrain保留、原terminal游标、已停放terminal的私有读取、提前ACK拒绝、普通drain接回与Native销毁屏障。Host关停不能清除尚未交接的原批次。该24项结果仍属真实Native的私有Host源联编；正式SDK、Rust原始输出有界交接和完整Socket链路在独立推进。
