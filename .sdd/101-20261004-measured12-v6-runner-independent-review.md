# Measured12 v6 启动入口非作者独审

裁决：**ACCEPT_EXACT_PRIVATE_MEASURED12_V6_RUNNER_02_IDENTITY_ONLY**。仅接受精确 `run-measured12-v6-browser-02.mjs`，SHA256 `6617caaddd0472f850827356cd0adb0bde8f360538e66db65b15c03287ff1c22`。本审查未启动 Platform、DS、Bot 或浏览器，未执行启动入口的 imports、账号请求或 `runLauncher`，未写被审对象。真实进入、重进、移动、放弹及性能验收仍由真实浏览器完成。

独审目录：`C:/Work/LumioGames/LumioGame/.run/platform-release-binding-01/measured12-v6-runner-independent-01`。原候选和 P2 证据保留于 `result.json`；最终资格和四项实际 preflight 检查记录于 `result-02.json`，完整文件比较为 `835-relative-file-comparison.json`，最后证据清单为 `manifest.json`。

## 精确来源与逆变换

原普通入口 `C:/Work/LumioGames/LumioGame/.run/platform-release-binding-01/run-local-browser.mjs` SHA256 `dbce10fc827dbd37a518c1fbe499a932b1b18b53bde4a519a41a82414a67c8e6`，与先前 `final-seal-01` 清单和当前字节一致。初始测量入口 `run-measured12-v6-browser.mjs` SHA256 `5a253ac9a32590a33484e6c28631a7d0f9a2553e524a46b94e345bf86b01722a`，四个精确字符串替换组成三组语义变化：两项 import 改为现共享文件；增加测量副本身份检查；将 `spectatorRoot` 明确为测量目录。独立重建全部字节相等，逐项逆变换精确还原原普通入口。`exact-substitutions.json` 与 `inverse-original.mjs` 保存证明。

初稿身份比较将 `main.js` 的期望摘要直接取自未固定的 identity sidecar。main 与 sidecar 同步漂移可通过，因而初稿不能称已固定审定 v6 main。本 reviewer 只用内存替代输入证明此 P2，未改实际 main 或 sidecar。Root 新建 02 稿，唯一新增条件要求 `measurementIdentity.measuredMainSha256` 等于精确审定 `b38f5c21a5429035409d25315deec802d01225ce8a08a363af63522affad6f52`。独立去除此条件，整个 02 稿逐字节等于保留的初稿；本问题已闭合。两个 preparer 和两个 identity 记录均作为源证据冻结，未执行它们。

## 实际消费和测量副本

共享实际 launcher 为 `C:/Work/LumioGames/LumioGame/games/101-bomber/Tools/launcher.mjs`，SHA256 `2e4d04a8d1954d0fa889d90f5b2d6792f692e8003c00ff8433c6b8a63f3139e6`，与已独审迁入候选一致。实际 account-client SHA256 `2446e6f15a9376baf646d3e05a1da82911db6744276a41dd0ba8d077ed35dc32`。这里没有引用旧私稿 launcher。

测量目录 `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/measured12-v6-wwwroot` 实读 **835** 个相对文件。独立比对成员集合与普通不可变注册目录完全相同，无额外或缺失文件；其中 **834** 个非 main 文件的 SHA256 与原普通 inventory 相同，包括所有 managed WebCIL、Native Wasm、资源和压缩副本。唯一不同的 main 精确为上述 `b38f…`；原普通 main 精确为 `25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c`。原注册目录全部 835 项当前字节与封存 inventory 相同，未被测量入口改写。

实际 v6 generator SHA256 `0f9927196556e6bd7c6d1a9db7510a7449be2f857b2a37d7b29775cdd67ee7ef`、identity sidecar SHA256 `78b69c2cfc9c57b042f413b82facf3692cc9e129a1e2d1f372630ee196d964fa`。两者和 main 摘要与既有非作者 `C:/Work/LumioGames/LumioGame/.run/native-movement-perf-readonly-01/v6-verification.json` 一致。该 review 的裁决是 `ACCEPT_PRIVATE_COMPLETED_GAME_DRAW_CALLBACK_CPU_OBSERVER_ONLY`。本次只核其输入身份和副本消费，不重作或扩大 observer 语义裁决；它仍不证明 GPU 呈现或消除测量扰动。

普通不可变注册目录为 `C:/Work/LumioGames/LumioGame/.run/platform-release-binding-01/local-test-profile-18086-01/games/bomber/795a98d4153935db6b6a72ac0d56086864a5578aa0d5cdd79a9a5bf672ba213b`。其 canonical inventory 摘要 `795a98d…` 是该本地 fixture 的路径/大小/文件摘要清单身份，不冒称 Public Publishing ZIP BundleHash。完整 12 及 Game 消费身份另见 `C:/Work/LumioGames/LumioGame/.sdd/101-20261004-candidate12-production-identity-audit.md`。

## 保留的启动边界

02 稿保持原普通入口的完整 release manifest、Native、DS registry Gameplay、普通 browser inventory 检查。两个独立玩家、六个 Bot、外部 Platform `http://127.0.0.1:18086`、固定 DS `ws://127.0.0.1:18316/`、`startPlatform:false`、v16 expected release 及现有 launcher 准入/票据校验均未改变。当前准备配置 actual expected release 为 `bomber-0.0.6-bomber.schema16`。DS template 检查 `127.0.0.1:18316`，`requireLocalEndpointResponse` 读取实际 Platform response 并返回原对象，现有 `resolveDsEndpoint` 仍核真实 `DS_READY`，没有用本地 override 伪造身份闭合。

`...args` 后的上述选项为明确值，测量 `spectatorRoot` 为精确私有目录。启动入口只服务测量副本，不改变 Platform 预先注册的普通 bundle。新 evidence 目录要求也保留。此处是本地官方 test profile 资格，未宣称 Public Publishing/admin 审批。

## 验证范围

独立 `audit-02.mjs` 从实际 02 稿截取 `const measurement` 到 `const args` 之前的原始 preflight，使用只读文件接口运行；账号/启动代码不在执行切片内。四项真实检查均符合预期：当前审定 835 文件通过；同步 main 与 sidecar 摘要漂移被 identity 条件拒绝；单 main 漂移被文件摘要条件拒绝；错误 generator identity 被拒绝。负例只使用内存替代输入，没有改真实目录。02 入口 `node --check` 退出 0；不是执行启动入口或全面玩法测试。

独审末尾再次核原普通目录与测量目录全部文件、共享 import、generator、sidecar、被审稿和源记录，**0 漂移**。资格仅对上述 exact source fence 成立；任何后续源或产物变化需另行复核。
