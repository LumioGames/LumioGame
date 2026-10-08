# 101 初次入场容器完整编码修复

限定交付：Runtime `94366316cfda6a7784bb6a60f98494c0190097e2`，父提交 `a07f6e5200e82c41392d89de14b96989ddcffc66`。只提交 `WireCodec.AdmissionSizing.cs` 与 `AdmissionContainerEncodingTests.cs`，没有混入测试重生成的行尾文件。工作树 `C:/Work/LumioGames/LumioGameRuntime-101-admission-container`。

真实 Game 新账号入场原帧含 `lumio-container-v1`，正式 Client 的 full decoder 拒绝 Invalid JSON literal / ContainerPayload。原帧在 Game `.run/20261003-unified745/initial-native-census.json`，SHA256 `394ead4bb0b7ec041bb638db0e5bc5900f6b23b874c6f11fd7d6bc21e82025af`。根因为冻结函数将 Sync 容器变成普通 List/Dictionary 后，错误走旧 enumerable 编码。

修复复用 owning `IWireContainerWriter.WriteFull`，保持与普通复制相同的完整 F2 封套；检查 owner 可读性，严格 UTF8 两遍测量/编码，并在分配 UTF8 数组和最终字符串之前预付 `128 + 3 × UTF8 bytes`。冻结后原容器变化不影响快照。旧非 Sync enumerable 分支及公共 wire 契约未变。

## 实际验证

所有证据在上述 Runtime `.run/admission-container/`，各 JSON 保留命令、环境、输入 SHA 与 log SHA。

| 验证 | 实际结果 | 证据 |
|---|---|---|
| 官方 full decoder RED | 4 项全失败，0 跳过，exit2 | container-red-01 |
| 完整封套、uint64 key、Unicode、冻结不可变、预算拒绝前分配、坏 UTF16 | 7/7，0 失败/跳过，exit0 | container-green-01 |
| 独立审查与同 DLL 复跑 | 7/7，0 失败/跳过，exit0 | review-container-01 |
| 全 solution / 全 TFM 构建 | 0 warning / error，exit0 | build-green-01 |
| 完整 Runtime | 2922/2922，0 失败/跳过，exit0 | runtime-full-01 |
| 格式检查 | 1581 文件，0 改动，exit0 | format-01 |

格式工具保留既有外部 Hfsm 项目引用无匹配 metadata 的工作区提示，不将其描述为零警告。PrimeProbe 的旧 helper 定位问题通过复制本轮正式 solution 构建的 65 个精确 SHA 文件处理，映射在 `prime-helper-stage.json`；没有删除测试或断言。

冻结清单 `freeze-94366316.json` SHA256 `96dd928944f862df2b04eafaaa72c6943c0aa6a98224981418accd436558edce`，明确记录实际测试目录中的 ECS/test DLL、两个源码及完整日志，而非以之后可能被 fixture 重建的生产 bin 冒充测试身份。独审在 `101-20261003-admission-container-independent-review.md`。

## 回接

已交 client_composition 从精确提交建立 clean freeze，按官方 pack/prepare 回接 Game；已交 gameplay_resume 窄合到 Host 后续组合。尚未将 SDK 发布物回接、真实 Game 原帧成功、完整 Platform/DS 对局计为通过。本修复不涉及 Host Query 的既有 STJ 值形状，不能用 F2 格式替换 Query 格式。
