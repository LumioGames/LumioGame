# 101 浏览器选定配置与下一完整包接续

状态：接续交回；配置源与HTTP字节已冻结，Root已实际进入包06页面、看见选角并选中泡泡鸭，入局/控制台/网络/截图证据由Root继续补入。源码独审尚待执行，不能把本报告当最终产品完成。未重包，未消费未独审Server successor修复，未改launcher/M2/Schema/生成物。旧成果及失败日志保留。

## 精确来源

- Game工作树当前选定配置14源码文件已逐字节复制到 `games/101-bomber/.run/browser-selected-config/resume-20261003/freeze-01/source/`。同目录 `manifest.json` SHA256 `9ab7009dba323510e7241f15bff1fc8270c35e95d95355eb6628a2b014bdf735`；逐文件路径、长度、SHA256在清单。Root-owned `Tools/launcher.mjs` 与 `Tools/seeded-config.mjs` 只读记录reference SHA，不归本交付写域。
- 实际消费完整包06：`games/101-bomber/.run/20261003-controlled-game/complete-release-06`，版本 `0.0.4-main.0e2fc74`，manifest SHA256 `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`。
- SDK nupkg SHA256 `0b1657ec29ec83c4281549ebf787fe0b9187b5d30780b6bc513151bf75dd9c3b`；选定配置专用 `nuget06` 内缓存包实际字节与官方06相同。SDK SHA512与所有旧日志SHA已记入freeze清单；原官方identity清单SHA `7242dae3b65c6fe431733f11fe25c823121accf1b0fb13115a3f1dbc41713a32` 在 `full-pack-06/handoff.json`。不能按相同version沿用05包字节。
- 本轮没有生产源码修改；只新增私有恢复启动、取证脚本与本报告。

## 配置数据流与源码核对

`client-config-host.mjs` 在host创建时读定目录原始bytes并固定base64包；只包含根manifest和client JSON，拒绝路径逃逸，GET/HEAD、no-store。Runtime负责manifest/fingerprint和typed table校验；HTTP不解释或合成业务配置。

`BomberClientConfig.Load` 包装FrozenArtifact、调用正式LumioConfigLoader与generated config binding，再seal原始bytes、建立一个ConfigSnapshot。Display与每个CreateWorldBinding都投影同一snapshot。`SpectatorReplicaHost`的Session.CreateWorld闭包持有此配置。Program.ConfigureConfig仅准许一次，Boot与SelectionConfig在其前拒绝。没有把生产入口切回embedded默认；embedded保留既有独立测试入口。

`main.js` 顺序为WASM→实际 `/api/game/config`→ConfigureConfig→选角→实际launch→Boot；失败没有embedded回落，Abort在配置返回后检查，关闭后无迟到配置/准入。成功配置跨重连复用。源码对应的三条实际JS断言、两profile/tamper/duplicate真实Native断言都保留。

## 实际测试与失败记录

下列旧日志位于 `games/101-bomber/.run/browser-selected-config/`；本轮日志在其 `resume-20261003/`。

| 证据 | total/pass/fail/skip/exit | 实际意义 |
|---|---|---|
| `host-red01`→`host-green01` | GREEN 6/6/0/0/0 | 原bytes、server不外露、运行切片不随磁盘变更、缺目录拒绝及既有host回归；保留RED |
| `main-red01`→`main-green01` | GREEN 53/53/0/0/0 | 配置顺序、失败、关闭与重连；保留RED |
| `native-selected01` | 5/5/0/0/0 | skills-on/off选角、两个真实Native World同snapshot、损坏拒绝 |
| `native-full01` | 53/52/1/0/1 | late census缺server Gameplay DLL，原错误路径是不存在的Release_server目录 |
| `native-full02` | 53/53/0/0/0 | 旧agent补正确server DLL路径后完整通过；不隐瞒full01 |
| `native-build-red01/02`→`native-build-green01` | build，GREEN exit0、0 warning/error | red02为Root同期M2源码缺RuntimeSchema引用；已保留，客户端未越域修复 |
| `publish01` | publish exit0 | 官方06浏览器发布，输出 `browser-selected-config/publish/wwwroot`；不是整局证明 |
| `resume/js-review01` | 7/6/1/0/1 | 本轮未显式选release，默认Engine缺replica-voxel-grid模块，属于输入错误；原日志保留 |
| `resume/js-review02` | 59/59/0/0/0 | 明确指向官方06后，main53+host6完整通过 |
| `resume/native-full03` | 0 tests/exit1 | 本轮误用MTP参数给xUnit runner；原日志保留，不记测试运行 |
| `resume/native-full04` | 53/4/49/0/1 | 本轮漏设必需LUMIO_ENGINE_NATIVE_PATH；49项明确缺Native输入，原日志保留 |
| `resume/native-full05` | 53/53/0/0/0 | 已从实际player06 DS配置取06 Native路径、采用xUnit参数，完整通过；not-run0。私有汇总器首读XML误假设属性顺序，修正为按属性名读取既有证据；未重跑/覆盖测试日志 |

## 实际Platform与player06

仅18085的独立compose服务 `bomber-fullpack04-20261003-platform-1` 使用包06官方compose重建platform。Postgres保留；18081/18082/18084没有操作。名字仍沿用历史compose项目名，不据名字误称包04。

读回实际imageId精确匹配06 manifest `sha256:bf4b07cbd134061c4b9c6292e4c09b044427dea3b1794f37e06730a4a0fc661e`，healthy、FailingStreak0；`http://127.0.0.1:18085/healthz` 实际200 JSON `status=ok,database=ok`。`/health` 返回200 HTML，明确不作为健康证明。docker前后服务清单、health和image输出保留在resume目录。

启动前实际进程检查无101游戏进程。独立账户前缀 `Player06Seed101a`、浏览器账户 `Viewer06Seed101a`；无票据输出。launcher node PID39748（启动时父PID7816），实际DS endpoint `ws://127.0.0.1:59939/`，安全页面 `http://127.0.0.1:60269/play/`。7个实际Bot准入，浏览器账户保留。Step05–14明确NOT_RUN，不能将player host当完整tour。

private启动模板 `resume/player06-startup.json` 指向已经冻结的 `seed-authority-green06/artifacts/bin/Lumio.Bomber.Gameplay/Release/Lumio.Bomber.Gameplay.dll`；Bot/client使用已冻结fullpack06输出、browser为上文publish01。没有在生成窗口重建。游戏采用skills-off legacy19×19/8人档，M2生产准入守卫保留。

本次seed101的两端均由06正式compiler导出，根manifest hashes：server `88e48e0597d5800e3cdee3fcfe3e220437ec1d03843bba13217220ed45b618f6`，client `52bcccf3353d2fe965d5298b5f73c1e2731918b60209ae6db7822d41eb530904`。`resume/config-http01.json` 证明HTTP包29个文件逐一与选定C导出相同、没有server文件、重复响应不变；body SHA256 `cf850ea3fdfa06ebf653f656e1d8ba382c27606e590e82a5894acc122bf7468a`，HTTP200/application-json/no-store。两端实际game行seed101、skills_enabled=false、map19、player8。

Root已收到安全URL与独占浏览器取证请求，并已实际看到选角、选中泡泡鸭。截图、入局、控制台和网络证据由Root补入；当前不能宣称完整实际页面通过。活跃进程保留供其取证：launcher39748、DS48092、7个Bot28824/38504/16156/43112/22972/38540/25536。进程身份只用于这次运行，停止前须重新核对，不能照旧PID误杀新进程。

`freeze-01` 14源码文件本轮结束前重新逐项哈希核对，零变化；publish中main.js与冻结source同SHA256 `79a74b6f796e0fc51e56784afeb2aa75841ddae88b650d95376c3306ece39974`。只读独审任务书为 `.sdd/101-20261003-selected-config-independent-review-brief.md`。

## 下一官方完整包准备与门

- 现有包06与它的来源/SDK/镜像、缓存、锁和输出保持不可变。private官方编排 `20261003-controlled-game/pack-reviewed-composition.mjs` 已核对：全8源必须exact SHA+clean、输出/evidence必须新目录、官方builder产二进制、SDK identity原样保存、原生Sibling布局仍由官方guard负责。
- 下一次仍走官方 `packFromMain`，只在Server successor真实修复完成独审并收到Root整合授权后固定新Server SHA/清洁检出。当前没有把未独审Server写入组合输入，没有运行pack/preflight消费它。
- 新包预留 `complete-release-07` / `full-pack-07`；新Game build预留 `20261003-fullpack07-game`。实际执行前重新确认路径不存在；使用该OutputRoot私有NuGet/cache/locks/output，记录manifest+SDK SHA256/SHA512，不把version当字节身份。旧build-complete-game脚本已经按新OutputRoot隔离cache与锁。
- 同新包回接Server真实四profile/1与8账户、signed successor/同房间下一局/parked、Game三端/Bot/browser/Native首帧与完整Gameplay，随后实际tour/browser验收。每项按真实total/pass/fail/skip/exit记录，失败原日志保留。
- 具体可审阅的执行门、reserved路径与验证清单位于 `resume-20261003/next-complete-release-plan.json`，状态PREPARED_NOT_EXECUTED；没有生成07包或以未审Source运行pack。Root安排上游Client诊断时另冻结其修复，不能混入69b已审历史。

仍未执行：五角色完整效果/音效/响应式与最新批准原型对照、真整局及下一局、8Bot30分钟、逐Tick回放、三地图/多seed/完整技能与全特殊弹组合、配置接线独审及最终整体验收。四项公共契约裁定仍待Owner，不擅自批准。
