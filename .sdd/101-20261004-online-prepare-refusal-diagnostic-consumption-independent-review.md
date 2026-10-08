# Online Prepare refusal 私有诊断消费独立审查

裁决：`ACCEPT_PRIVATE_ONLINE_PREPARE_REFUSAL_DIAGNOSTIC_CONSUMPTION_ONLY`。允许这份精确私有诊断输入用于另建 coherent 八人 Scene 获取真实在线首拒码；Task2 的配置/启动器仍单独审查。本裁决不是正式发布、Owner 新语义批准、在线根因或浏览器体验验收。

独立结果：`C:/Work/LumioGames/LumioGame/.run/live14-online-prepare-refusal-independent-review-05/result.json`，SHA256 `e0039d1dc28076f11bbf2bcaffb9b0aba875cdc462b2bfa92e41c24a99507fc0`。底层独立读核 `verification.json` SHA256 `b61ded5a8b5d76802738f6cdac0815600268d3fedf59897d88e6e703ce554048`。

## 精确源与输出

- 作者根：`C:/Work/LumioGames/LumioGame/.run/live14-online-prepare-refusal-01`。作者 manifest `author-seal-01/manifest.json` SHA256 `efd0163bdaddfd405216d4deeafdce886e819b8c3f9a73374641f71901f79f1c`；consumer-result SHA256 `dd584b3ce208954da5fa38d0777515986186513bf86dcdde8e0a44027aa535a1`。5163条 original/current/frozen 记录逐字核验，原+冻结共581033188 bytes。
- 普通 Lifecycle `97f275969a8a8826a13007c1b315b5e7a258821853e6329013fc7b66dbc2f0de`；私有 Lifecycle `8c4805eac7e0b33be257c8c53e0a032552d477e5500d7fec6f6911be8c1464e7`。独立重做三个局部 substitution 的 inverse，完整原字节相等。4087个原 input 与 candidate 比较只有这一文件变动；新增配对 fixture 另单独核验。
- 一次原 Observer read、一次原 Prepare 调用。原所有 guards、失败 false、成功 reservation 三字段赋值和余下 body 保持原字节。private flag 仅环境值 `1` 开启；HashSet 懒建、full typed IDs/epoch/Connected/code 去重，先 Count<16 后 Add，最多16项/16行；未新增 Native/Runtime query、模拟对象、输入、额度、授权或消息。16界为精确源码控制流核对；真实配对只出现一项，不假称已执行16种错误。
- 正式14 manifest `65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9`：305 payload逐字相等、无额外 payload。实际 Native/sidecar为 `e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89`。
- 实际诊断 Server Game DLL `06dea8e81d67f342e5a61977e15c3775e52d3f71c474a328dea5d625add41d39`。9组 own PE/CodeView/PDB 一致，共1376 document记录，其中1374物理 authored/package/generated source checksum 实核；2个 JSInterop source-generator 虚拟 document 不落盘，明确只保留 compiler/PDB记录，不假称已核磁盘源码。Server PDB包含精确8c源；普通 baseline PDB包含97源；Client/Browser无此 Server source。
- 8份正常 project.assets 的实际 SDK cache/archive/SHA512 均等正式14 SDK。编译侧为两个正常 test 图、server、client/Bots、browser及新浏览器 host；未替换旧DLL、未启用 OfflineDeath 草稿。

## 三组真实配对结果

冻结 fixture `223fe1f28cef3246721796e7ace29ebf07d5ce432cc8e97312968e271eb6afdc`，正常 `Tools/Lumio.Bomber.Gameplay.Tests` / `Lumio.Bomber.Gameplay.Tests.OfflineControlledDeathExpiryTests` 类过滤、最低2项、skip拒绝。各进程各有正常执行图、独立 evidence 目录与进程开启前的 off/on 环境；实际 apphost输出 Native e15c。原 fixture 包含 test-only 第二次 Prepare，原字节保留；新增生产 probe 的额外 query 数0。

| 实际 paired-02 | PASS | FAIL | SKIP | 应用 rawExit | 新诊断行 |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 1 | 1 | 0 | 2 | 0 |
| off | 1 | 1 | 0 | 2 | 0 |
| on | 1 | 1 | 0 | 2 | 1 |

原 connected full-tuple死亡消费/旧body tombstoned expiry保持 PASS；原 offline案例仍 Prepare `binding_not_found`，旧body expiry accepted 后原 fullidentity guard在下一Tick拒绝，FAIL不变。三组 Game evidence 的 fullID/health/death pending/消费/expiry/原probe拒码逐项逻辑相等。随机 World/token 不作跨进程固定值要求。

On 首条为：tick6，participant `00000000000000650000000000000003`、life/lastLife `00000000000000650000000000000002`、LifeGeneration1、Connected=false、ObserverGeneration1、LifePhase2、deathTick5、Intent1/NextLife2、Eligible=true、code `binding_not_found`。这是已知离线测试的真实首拒，不能解释 live14 的在线13560死亡。

实际应用退出是2，工具外层报告1另列，不改原 artifact。fixture evidence 中 `official12` 是冻结源码的历史常量，不作消费身份依据；实际路径/Native hash/SDK14才是证据。首 paired01 缺 DOTNET_ROOT 找不到10.0.11、首publish缺dist为原行政失败，保留且不作行为RED。

## 发布与 CLR 边界

普通浏览器835个文件实清点、main.js等共享普通字节、Presentation dist等新正常构建输出。22份 Lumio PE 与实际发布 WebCIL metadata逐字绑定，其中 Engine/Runtime/Client正式 DLL 与14完整包字节相等，Game/Host与本次实际编译输出相等。两端测试/三边Gameplay/typecheck/UI build/publish02原始结果与日志 hash均核验 raw0；审查员未重跑。

CLR metadata分域：baseline test18、diag test18、server application/SDK/Game15、正式 BotHost28、browser Gameplay11、browser Host22，实际参考/definition均闭合。Bot插件输出15中两项 `Lumio.Client.Bot` 与 `Lumio.Client.Gameplay.ECS` 不单独复制，准确需要1.0定义且由 unchanged正式BotHost供给；插件不是独立应用 entry。正式BotHost与SDK/game输出 NativeLoader存在1.0/0.1字节域差异，都是原14已接受发行字节，不把它们强行摊平为单一同版本目录。此为静态身份/引用事实，无新增实际 DefaultALC载入声明。

审查脚本早期有 TRX summary误计、NuGet虚拟PDB path、Host绝对PDB path/JSInterop生成源不落盘，以及错误 client目录/跨域 flatten 假设导致的行政失败。所有01–04/PE01–03原输出保留，不把这些 reader错误称候选业务RED，也不拿不适用的拼接检查增加生产门。

审查员 production writes0、builds0、tests0、服务/浏览器操作0。共享 Lifecycle、pins、旧真实现场、RuntimeOfflineDeath七源和 Owner pending保持原样。新真实 Scene才能提供在线首拒码；私有日志的 I/O成本不作性能验收。
