# 移动预测独审补充：最终兼容源的实际 Native 四案例

裁决：`ACCEPT_FINAL_COMPATIBLE_ACTUAL_NATIVE14_FOUR_CASES_ONLY`。此文件补充原 `101-20261004-browser-movement-prediction-independent-review.md`，不修改原报告及历史证据。非作者只读核验，没有构建、重跑、生产/test/pins 写入或浏览器/服务操作。

Root 的 `prediction-14` 使用最终浏览器兼容源重新构建 server/client 并运行正式 Native 链，真实 TRX 和日志均为 4 PASS、0 FAIL、0 ERROR、0 SKIP、0 NotRun，raw exit 0；两边构建均 raw 0、零 warning/error。真实结果与 executed test DLL、server Gameplay DLL、log 和 test-source 的声明 SHA 全部逐项一致。

实际三组 PE CodeView/PDB 配对均吻合，15 个选定 document 全部绑定到独立冻结的真实源：测试侧 3、客户端 Gameplay 6、服务端 Gameplay 6。此轮 Gameplay 真实执行的是最终兼容 Movement `0b2417ad09e3a2d72d371d150fc4c5dbc321c703202fe59b2e4b97cc75dff835` 和 Danger `74dada3611850e4392ddbfbe70a72043980eecd8b17380c5363423af085961a8`，服务端 PDB 同时绑定 Results.Server `33bae49d123302710427ea56f2de59f1d88457bc94c41439d49c09554b9779b9`。这补足原 13 实际执行前兼容源、browser compile02 执行后兼容源的明确证据边界，未把旧 13 身份改名。

执行 test DLL SHA256：`545f4e74a3e90df8d96753a7aa9023e187fec297112c9484b14ae46f8bf127b2`。Server Gameplay SHA256：`ff02a6ecd5c0c1ed66c3b5dcdf14deb5acbdee00670b9277f55ae1b140d4dbfb`。测试输出中实际复制的 Client Gameplay 与其本次 build 文件逐字 hash 一致。测试源仍为单未确认输入版本 `82ff5b1573a59ee1a88a2aa06e733dbcf1e6e01f6a4e782c08e2ca43cfe04dba`。

夹具经实际 Server Native SectionExport、普通 WebSocket carrier、正式 ClientSession、RuntimeJointPrediction 与真实 published pose 消费。它在 server 端准备合法 world/组件/属性和真正 section 数据；没有写 client 私有字段、注入 predicted world 或改 confirmed pose。确认世界保持 authority tick/位置；一次实际编码 move 输入在 clear 与 current-own-bomb 场景使完成的预测/展示 x 从 7.5 到 7.675，wall 与 other-life-bomb 保持 7.5。Current-own-bomb 的 SourceLife/Generation 经真实 baseline 字段断言，未手注 client。真实日志和最后 PresentationState / DumpPositions 两端断言均达成。

选择的 Native 是原正式完整 11 consumer freeze 中 `ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff`，已实读 DLL 与 raw result 一致。本轮没有把它说成新完整 12 Native，也未声称正式 12 Game 消费或浏览器 WebCIL 实测已完成。测试授权由 test carrier 构造，非 Platform 签名 DS 准入；fixture ProjectionRegistry 刻意不执行真正八人 match world systems，其资格与原独审保持同边界。

`prediction-15` 是另外新增第二 pending 输入等待条件的失败尝试。本报告只审核 14 的冻结四案例；不据 15 对 Runtime 或先前候选归因，也不把 14 的单输入成功推成持续输入、ack/correction 或连续步行通过。Schema16 声明/生成/迁移/闭集合审核、部分 AOI/体素准备、真实两人八人同房输入同步、帧率和十次关闭重进继续待实际验收。

独立证据：`C:/Work/LumioGames/LumioGame/.run/movement-prediction-independent-review-01/stage-14-final-compatible/`。NEW 结果 `result.json` SHA256 `17da6e594cfbed5b2d051fe4ca876aa5f032a7389b17c3244f5f3f154285069b`；保存九个实际候选源、14 全部 raw logs/results/TRX/test-source、三 PE/PDB 对与运行脚本。原报告、旧 RED、无效 fixture、13 和 browser02 封件全部保留。
