# 完整11：Server真实Host窄回归

2026-10-04，`reentry_trace`。结论：**REAL_HOST_GREEN，非浏览器验收**。只消费完整11的新私有SDK/CLR/Native产物，未改正式11输入、候选、pins、旧10、现场或17个原生成文件。

私有输出：`C:/Work/LumioGames/.101-pack07/LumioServerPreparedReentry/.run/prepared-reentry-official11-qualification-01`。其新 strict lock、NuGet cache、fixture bin、独立 Cargo target均在该目录；未复用10 fixture DLL或10 Native。新fixture严格构建raw0、0警告/0错误。新Cargo target编译1m33s后实际执行offline，expiry后续增量1.60s；没有mass suite。

封存：`seal-01/manifest.json` SHA256 **`646cf896ab7ec927b573fb6704d1497500791d55de384b7440eae1f063918e7b`**，249760bytes。包括完整11的305个manifest payload逐文件复核、25项私有原始证据inventory、准确源码/SDK/Native/HostEntry/hostfxr身份、两项实际结果与动作/权威数据。289个作者树tracked文件与执行前物理SHA全部相同，staged为空；17个原generated CRLF保持原字节。

| 实际回归 | 原始结果 | 新socket/权威事实 |
| --- | --- | --- |
| `offline-official11-01` | 1PASS / 0FAIL / 0ignored，raw0，3.87s | 初始AUTH seq1/gen2 → 观察AUTH seq2/2→3 → transfer AUTH seq3/3→4；对应真实Welcome/基线，WorldChange14–93，后续持续Tick与实际Native transfer Applied；实际cleanup后shareddebt0 |
| `expiry-official11-01` | 原`expired_observation_preserves_participant_and_dormant_successor`，1PASS / 0FAIL / 0ignored，raw0，3.19s | 原合法观察过期/保留Participant与Dormant successor控制，实际Native/CLR/socket及清理；未变断言 |

Server作者树HEAD与正式clean Server来源相同：`008861074a2d3c9da1b0407325ede6f851704fd5`。精确五源仍为 owner `a936a2b3…`、successor `a4b612fc…`、lifecycle `7ad72c10…`、test `89a0fa3b…`、fixture `736c8240…`；运行脚本逐项硬校验，封存有完整SHA。

- `LUMIO_ENGINE_ROOT=C:/Work/LumioGames/.101-pack07/LumioGameEngine11SdkClosure`，clean来源 `523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0`。
- Actual Cargo sibling `C:/Work/LumioGames/.101-pack07/LumioNativeCore`，来源 `81b2501a621db2657bd087db2afa808ecfb9e846`。实际运行Native只来自完整11，SHA **`ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff`**。
- 完整11根：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-11`；manifest **`f058833a218241c49b5f35078fd839dbc130ef5d3bcf5b57dbbaf3419e241867`**。
- SDK `0.0.5-main.523c3d3`，nupkg SHA **`4d2a7216fc6fc239a8d5018bff52ced2ff4c02f9134de6f75f3589fe4fb217ee`**；SHA512、解析metadata及新strict lock均封存。
- Runtime来源 `520ffe482e1c48fb6e48187925eecec986cdb9c8`；实际Ecs DLL SHA **`ab5da26d1329e2e7671a1ad4c01a85bcf28a4ccee7b58e9e53cc149382b393e9`**。Replication、HostEntry、runtimeconfig、hostfxr10.0.11、Native及fresh fixture DLL的路径和SHA均在每run `inputs.json`。所有Lumio运行程序集命名路径均指向完整11或新fixture输出。

ALC身份边界如实封于 `alc-identity-evidence.json`：两次真实boot均通过未改HostEntry的one-SDK-per-process、Default加载精确命名SDK路径/版本、驻留assembly同artifact、Registry与Ecs类型同一性校验（HostEntry.cs548–782）。这能证明当前正式boot遵守既有加载身份约束。冻结fixture没有成功路径ALC名称/assembly枚举出口；本次没有采集进程内ALC枚举，不能声称已直接枚举实际ALC名称。未为采数修改fixture或增加hidden/反射模拟入口。

这次回归使用原Host harness的合法预算、真实signed verifier、原voxel/catalog与正式Native；没有放宽生产额度或协议、替换SDK程序集、改变玩家/Bot/模拟频率。单生命周期Host窄回归只能证明完整11消费后的修复闭包；八人真实浏览器、双向移动/放弹及至少十次真实关闭重进仍由Root后续现场验收。
