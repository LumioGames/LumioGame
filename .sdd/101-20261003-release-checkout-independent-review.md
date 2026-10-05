# 完整发布源码检出与锁文件独立复核

## 结论

Engine `734622fd2767e42f4f3f91373f90ec792c0dcc06` 与 Client `8c5d34360fbdaabe26462f4eef56f4366049e907` 的窄修复无阻断。它们解决官方完整打包实际暴露的 Windows 检出字节漂移与 WASM 新工程缺失锁文件，未修改公开 ABI 或放宽源码清洁检查。完整发布和实际游戏链路仍须分别通过。

## Engine

原 `full-pack-02` 最终审计拒绝两个 WASM 生成文件的工作树漂移。它们由官方工具写 LF，而 Windows 检出转换为 CRLF；没有语义差异不等于发布器可忽略字节变化。

734 的两个变更路径为 `engine/native/.gitattributes` 和新 `eng/wasm-generated-checkout.test.mjs`。仅对真实两个生成文件明确 `text eol=lf`，测试建临时 Git 仓、强制 `core.autocrlf=true/core.eol=crlf`、提交后删除并重新检出，比较原 Git blob 字节，并验证重新写入官方字节后 status 为空。原许可证 `-text` 检出测试保留。

Root 实际复跑两个 checkout 测试：2/2、失败 0、跳过 0、取消 0、退出码 0。证据 `C:/Work/LumioGames/LumioGameEngine-101-release-license/.run/101-wasm-checkout/root-independent.log`、同名前缀 `.exit`。

## Client

Client 只新增 `Client/Engine/Wasm/packages.lock.json`，没有修改项目引用、第三方版本或生产代码。它是项目实际 restore 的结果，不是改写一个失败的现有锁。

Root 首次额外 restore 使用错误的全局 `TargetFramework=netstandard2.1`，导致 Runtime 多目标框架与单目标锁选择不符（NU1004）；WASM 工程本身已 restore，但总体退出码 1。这份日志保留，不算生产缺陷的 RED。改用项目既有正式入口 `LumioBrowserReplica=true --locked-mode`，并使用独立 ArtifactsPath，Root 实际 restore 退出码 0，提交锁文件无差异。没有关闭 locked 检查或重写依赖图。

证据 `C:/Work/LumioGames/LumioClient-101-wasm-lock/.run/101-wasm-lock/root-independent-locked.log`、`root-independent-locked02.log` 及各 `.exit`。只读使用 Runtime 668、Engine 734；复查两个上游工作树仍干净。
