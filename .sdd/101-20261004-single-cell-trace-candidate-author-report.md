# 单格 trace 最小候选：真实 Native GREEN，等待非作者审核

本轮仅在 `C:/Work/LumioGames/.101-pack07/LumioClientSingleCellTraceRepair`（HEAD `b9c2d415e09520c7946cc5eed8aec8a6c59244b1`）修改一个生产方法和两处测试来源。未提交、未暂存，未改正式 13 composition、不可变完整包、Game、Runtime、ABI、配额、物理或服务。生产源码已停止写入。

最终封件：`.run/single-cell-trace-repair-01/green-seal-01/manifest.json`，SHA256 `62ba353abf2bc0abf4d50baa3d4b3e65f6d998da2566235d273bfbb3e8e1057d`。封件保存精确 before/after、两 tracked 文件 diff、新测试、原 RED 引用、GREEN 日志/XML、实际 Native 请求/回包、完整清理和 DLL/PDB/source 身份，共 117 份证据。资格是 `EXACT_THREE_SOURCE_CANDIDATE_CODEC_AND_REAL13_NATIVE_GREEN_PENDING_NONAUTHOR_REVIEW_NO_COMMIT_NO_NEW_PACKAGE_NO_BROWSER_PERFORMANCE`。

## 精确变化

`EngineWasmPrediction.Selective.cs.ReadSelected` 以 `Math.Min(accesses.Length, 1)` 声明本次单格操作的缓冲和实际 Native capacity；读取原 V2 trace 后，若 `AccessesWritten` 大于该 capacity 明确拒绝；仅复制实际 written 的前缀。其余整个生产文件逆置该方法后与原件逐字相等，`EngineWasmCall` 逐字不变，其他四个 query 仍保留完整 caller capacity。不存在 clamp、状态吞掉或把 bad reply 当成功。

| 文件 | 当前物理 SHA256 | LF 归一 SHA256 |
| --- | --- | --- |
| `Client/Engine/Wasm/EngineWasmPrediction.Selective.cs` | `4c08ed18d7f96e9df40db6cfb71cda231e7057fadae84468867bf49e375b9290` | `fd1f96ca12fe42799f05379bd98ea9ff44cee5314ad85e7e6adb316799fc6d9c` |
| `Client/UI/Spectator/tests/EngineWasmPredictionHeaderTests.cs` | `6bc06726d17145a5f1b57c7b55aa03e8baaaa370aada1e3aaa15cbc9e5e21d21` | `a1c65793dc427a162381dca08744cccf758732e5d33d3b44632db32ce57bcbfb` |
| 新 `Client/UI/Spectator/tests/EngineWasmSelectiveReadTests.cs` | `0ff1e73b3111491b681b6582f99070e76d5e800db8df3bb2750af33b16e04af5` | 同左 |

新正常 codec 测试 18 案在行为 RED 后没有更改。原 header 16 案只将 working_read_cell 的两处容量预期由 256/10240 调为 1/40，其余 V1/V2 与其他 query 断言保持原文。

## 测试事实和未达行为的尝试

`red-02` 真实 build raw0，新增 18 案 7 FAIL / 11 PASS / 0 skip，test raw1；原 16 header 案全 PASS/raw0，独立确证原 working_read_cell 包声明 256/10240。7 个行为失败涉及大 caller 的实际 extent、未写尾部和坏 written 拒绝。容量失败发生在容量断言，不能声称同案后续大小断言也已到达。

`green-01` 原正常 Spectator 全 suite 110 PASS / 0 FAIL / 0 skip / 0 errors / 0 not-run，build/test raw0、0 warnings；原 header 16 案独立 raw0。记录式 transport 只证明实际 C# codec 接缝和故意坏回复，不是 Native 世界。

保留未达到目标行为的历史：`red-01` 仅新测试别名歧义导致 compile raw1、0 案，标记 INVALID_COMPILE；`green-pdb-attempt-01` 私有 PowerShell reader 对 ImmutableArray 的枚举错误 raw1，未到 checksum 断言。后续 reader-02 raw0，实际生产与 Tests DLL 的 CodeView GUID/stamp 均匹配各 Portable PDB，三个源 checksum 全吻合，证据 SHA256 `e48567ec441990b7de0bd12a14a1cd7e7f8b01e458362bf6303e4586228847a5`。

`native-green-01` 是 INVALID_PRIVATE_FIXTURE_ARCH_STAGE：桌面 C# `nint`64 Stage POD48 被私有 fixture 送进 WASM32 要求 POD40，Stage 返回1后 fixture 的 Ready 断言失败，清理未完成。实际 dotnet raw `-532462766`（0xE0434352），PowerShell 包装 raw1，两者分列。原 24 个请求/回包和当时 fixture 源/DLL/PDB保留。正式 ABI 明确 StageRequest size32=40/size64=48；这不证明浏览器上的 .NET WASM32 Stage 有问题，本轮没有改 Stage 生产源。

## 真正 Native 对照

`native-green-02` build raw0/0 warnings，实际 default CLR run raw0、Node raw0。实际候选 C# 生产 ReadSelected 通过原 EngineWasmTransport 调用不可变官方完整13 WASM；生产请求和回包从未重写。Default ALC 实际载入的 Client/Runtime/NativeLoader 图和 hash 已保存。内部 constructor 的 DynamicMethod 仅用于公开测试入口缺失时访问原 constructor，真实 Native context 提供 owner，原 constructor 创建 world；没有手填 handle 或 Gameplay 字段。

正式13 manifest SHA256 `9a3289d2720efacee59e6f762b49771a6729fde53a9a5033e8fd9c016b1ff2c5`，实际 WASM SHA256 `edd992f1b06a82e98934450ed72fcd38a320cede29153380f9fe9eed4b3af242`。四个实际 web/bridge 输入逐项按 manifest 校验。

同一实际 world/session/live token 的 C# caller256 → caller1 → caller0 得到 Native 0、0、5；前两次输出 cell、完整32字节 trace 和首40字节 access 相同，cell为 Ready/block65536/revision41，trace written=required=1/complete=1。零容量 written0/required1/complete0，原 payload 未写。256 caller 的未写255项及各失败/无写案例的尾部 sentinel 全保留。

独立 Native 256 控制包仅增 access extent 和 scalar capacity，在原实际 token 上执行，不替换生产包/回复，不代表旧 Client DLL。它的完整 cell/trace/首 access 与候选1完全相同：控制请求10532/回包10376字节，候选请求332/回包176字节，每个方向少10200字节。

真实案例还包括 stale token24；合法 journal10 retained AIR/source10；合法 journal11后无序/不存在 key1；实际 section release和 Pending request均26、Unavailable trace written=required=1/complete=1、revision/source0；真实 delivery revision42 AIR 后 retained key drift23；authority AIR Ready/block0/revision42。私有正式 wasm32 Stage setup只用于生成真实 retained record，不改生产 ReadSelected 包。Complete先严格拒 drift23，Correct实际丢10/11两条 reason3，再 Stats healthy、Complete0、Close0、world destroy0、context close/release0。

所有 31 个实际 Native 操作 raw 包/回复及额外独立256控制均保存。对状态和字段的验证在原 fixture/driver与最终封件检查中完成；Synthetic codec 的坏 written不冒称 Native实际会生成坏 count。

## 限制

本轮只证实该单格调用的缓冲、复制量和功能等价，未测帧率、Tick、输入 ACK 或体验改善。私有 C#候选消费正式13 WASM不等于新完整发行包，也不等于浏览器消费候选。Runtime全局256、预算、scratch、binding、物理、ABI和唯一权威世界保持原样。正式提交、完整包和真实浏览器回归仍待 Root 非作者审核后决定。
