# 完整发布选择入口与 WASM 绑定读独立窄审

2026-10-03；只读审查，无生产源码修改。

## 完整发布选择入口：限定 PASS

审查 `games/101-bomber/Tools/explicit-release.test.mjs`、`Tools/engine-release.mjs`、`Tools/launcher.mjs`、`eng/select-engine-release.mjs`、`eng/EngineCandidate.targets`、`Client/Bots/Lumio.Bomber.Bots.csproj`，并核对现有 Directory.Build.props/targets 的 SDK 版本一致性门。

- 显式完整发布先拒绝 browser-only，再按目标 RID 调所选发布内的唯一官方 verifier；失败不初始化 Engine 子模块、不回退其他 root。
- DS、Bot、SDK、Web 路径均来自选定 root。Bot 的显式 LumioClientBotDirectory 覆盖仍受尊重。
- 完整包版本读取 manifest.version 符合当前官方 pack-release：SDK nupkg 文件名、nuspec、sdk-version.json 均由官方 verifier 要求等于该版本。并未把 browser-validation SDK 独立身份误当成完整发布格式。
- 实际独立执行 3 个测试文件：129/129，通过、0 失败/跳过/取消，exit 0。证据 `games/101-bomber/.run/explicit-release-client-review-01.log/.exit`；6 路径 SHA 清单为同名前缀 `.json`。

未执行完整实际 pack 或实际启动；最终同源完整包仍需由官方构建后验证。

## WASM 既有 Section 绑定只读查询：限定 PASS

审查 Client 工作树 `Client/Engine/Wasm/EngineWasmVoxel.cs` 的 TryReadSectionBindings 窄增量及新 `EngineWasmBindingReadTests.cs`。查询仍绑定原 WorldHandle；新增 metadata、实际字节长度、count、cell 顺序/边界、身份长度、尾随数据核对。输出仅成功完整解析后赋值；两次调用中的 SectionUnavailable 返回未就绪，不伪造空 Ready。

独立运行原构建测试 DLL 的 EngineWasmBindingReadTests，9/9 通过，0 失败/跳过，exit 0。Client 证据 `.run/101-wasm-binding-read/client-independent-01.log/.exit`。实际源及 DLL 的 SHA/mtime 存于 Game `games/101-bomber/.run/wasm-binding-client-review-01.json`。

这些测试通过真实 C# 适配器但使用 transport fixture，不能替代实际 WASM 原世界绑定、Game 宝箱定位或浏览器画面验收；这些仍由后续整体验证完成。
