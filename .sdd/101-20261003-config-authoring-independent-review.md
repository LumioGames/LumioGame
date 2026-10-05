# Config 作者工具独立复核

结论：限定 Windows 作者工具切片通过，无阻断发现；不是完整发行或真实对局验收结论。

- 源码固定 `LumioConfig-101-authoring` / `6112af36825e2bd162353fe59bcfefdff2ee5794`。独立核对基底 dd127 到本提交的 7 路径及 `build/final-manifest.json` 全部 SHA，Git clean。
- 审查固定构建依赖、真实 CLI 入口、原有源码 compilerHash 与 frozen 携带值、缺失/损坏拒绝、输出闭包与许可；未发现公共算法或导出格式变更。
- 独立 `test_authoring_tool.py` **8/8**，零失败跳过，exit 0。证据 Config `build/root-independent-authoring-01.log/.exit`。
- 独立执行冻结 EXE 的维护回归入口，**16 次真实 CLI 调用**；单根 **20 文件**、分端含 C# Reader **36 文件**与源码及重复导出逐字节一致，Unicode 错误、缺失/损坏 hash 拒绝、空 PATH 均按预期。证据 `build/root-independent-smoke-01/` 及同名 `.log/.exit`。
- 独立调用 Engine 6f625 的 `verifyAuthoringTool` 与 leak scan，**88 个闭包文件**全部校验，0 leak，exit 0。metadata SHA `7f3a214e22e1bf123429aea7257ac0ac0254af226d73576bdaac1ea95e2fad3e`。证据 `build/root-independent-verify-01.mjs/.log/.exit`。
- 作者完整测试 **220/220** 已保留在交接报告；Root 未将本轮 8 项复验称为重跑完整 220 项。Linux 闭包尚未实际构建，不以 Windows 结果替代。

可接入完整 win-x64 pack 的作者工具输入为 `build/authoring-04/config-compiler-win-x64`，仍须与最终 Runtime/Host/Client 统一构建验证。
