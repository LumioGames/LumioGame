# 101 完整发布：Config 作者工具输入

范围：只补 LumioConfig 作者工具实现，复用 Engine ADR-137 和 `verifyAuthoringTool`，未改公共格式、配表规则、compilerHash 算法或任何待裁定契约。该记录不表示整套 Engine 发布或 101 对局验收完成。

## 冻结输入

| 输入 | 精确值 |
| --- | --- |
| configRoot | `C:/Work/LumioGames/LumioConfig-101-authoring` |
| sourceCommit | `6112af36825e2bd162353fe59bcfefdff2ee5794` |
| base | `dd127edd87a00764b2b3ffb210df9f4b8d44d70a` |
| branch | `codex/101-config-authoring`，交接时 tracked/untracked source clean |
| win-x64 artifact | `C:/Work/LumioGames/LumioConfig-101-authoring/build/authoring-04/config-compiler-win-x64` |
| metadata SHA-256 | `7f3a214e22e1bf123429aea7257ac0ac0254af226d73576bdaac1ea95e2fad3e` |
| compilerHash | `51b14acea48f75f1559b6e1c2fe9474d15cff993463bc7698f63c8f18c471697` |
| closure | 88 个文件，19,941,678 字节；另有 metadata，全部经 owning Engine 校验 |
| 完整源码哈希与依赖清单 | Config `build/final-manifest.json`，7 个变更文件逐 SHA-256 |

旧 dd127 本地与远端 main 都没有 Engine CI 要求的 `tools/build-config-compiler.py`，且旧 `_compiler_hash()` 在冻结包内会得到空源码集合 hash。Root 已授权补既有作者工具语义并以真实新提交交接，产物没有冒用 dd127 身份。

## 变更

- `tools/build-config-compiler.py`：固定 CPython 3.11.9、PyInstaller 6.11.1 和精确依赖；校验原生 x64 RID、完整提交、干净检出、全新输出；同一 CLI 冻结为 onedir；实际许可证、依赖版本与全部文件 hash 入 metadata；完成前再次校验源码身份。
- `src/lumio_config/export.py`：源码运行仍按原文件集合和字节规则计算；只有 frozen 进程读取包内构建时计算的 hash，缺失或格式损坏明确失败。
- `tests/test_authoring_tool.py`：8 个身份和构建边界测试。
- `tests/authoring-smoke.py`：显式实际 EXE 回归入口，16 次源/冻结 CLI 调用，不用零测试或替身证明。
- `.spec/knowledge/features/authoring-compiler.md` 与导航：准确构建和验收说明。仅 Windows 产物本轮已实际构建/执行，Linux 未执行。

## 真实失败与修复

所有证据相对 Config 独立树 `build/`：

| 证据 | 真实结果与根因 |
| --- | --- |
| `authoring-red-01.log/.exit` | 5 测试中 4 测试失败（含子例共 7 failures）：入口缺失、冻结 hash 空集合、缺失/损坏未拒绝；exit 1 |
| `authoring-green-02.log/.exit` | 增加宿主/源码拒绝后 8/8，0 fail/skip，exit 0 |
| `authoring-build-01.log` | PyInstaller 将相对 add-data 再相对 spec 解析导致失败；输出工作路径改绝对，保留失败记录 |
| `actual-smoke-02.log` | 编译成功但 EXE 缺 `lumio_config.cli`；入口同名脚本遮住包，改为复制原始字节到不同入口名，不重写 CLI |
| `actual-smoke-unicode-04.log` | 非法中文类型的诊断在冻结进程用了本地 GBK；加入冻结器官方 `X utf8` 选项，未更改诊断内容 |
| `full-tests-01.log` | 217 总数，10 编码环境 errors、1 缺预构建 Unicode runner skip；保留，不称业务逻辑 RED |
| `full-tests-02.log` | 明确 UTF-8 环境后 220 总数，219 pass/1 skip；随后实际编译 Rust/C# runner 消除 skip |

## 最终验证

- `full-tests-final-04.log/.exit`：**220/220 pass，0 fail，0 skip，exit 0**，41.624 秒。包括真实 Rust/C# Unicode runner。日志仍有既有 editor socket fixture 的 `ResourceWarning`，没有隐藏或关闭告警。
- `actual-smoke-final-04.log/.exit`：维护的回归脚本执行 16 次 CLI；单根 20 文件和 split+C# Reader 36 文件在源码、EXE、EXE 重复导出间逐字节相同；非法 Unicode 输入的 stdout/stderr/exit 相同；缺失/损坏 frozen hash 退出非零。
- `actual smoke final 05/report.json` 与 `actual-smoke-final-05.log/.exit`：额外 17 次调用；在含空格的独立目录、清空 PATH/PYTHONPATH/PYTHONHOME，且本独立树 `src/` 物理暂移后，EXE 仍完成同字节导出；`finally` 已恢复源码，Git clean。
- `engine-verify-final.log/.exit`：当前 Engine 6f625 的唯一 `verifyAuthoringTool` 验证真实产物；8 项检查包括正确产物、完整 leak scan、错误 commit/RID、篡改 hash、额外文件、缺入口、恢复后闭包。0 leak、exit 0。临时负例只改独立复制，交接产物未改。
- `source-validate-final.log` / `source-format-final.log`：validate、format --check 均 exit 0；`git diff --check` exit 0。
- `spec-lint-base.log` / `spec-lint-final.log`：旧基底与候选同为 37 项既有历史计划 frontmatter/旧 `.sdd` 结构告警，逐条差异为 0，工具按原 report-only 政策 exit 0。未称该检查零告警。
- 固定 Python 私有位置：`build/101-toolchain/python/python.exe`。官方 3.11.9 installer Authenticode Valid，Python Software Foundation；SHA-256 `5ee42c4eee1e6b4464bb23722f90b45303f79442df63083f05322f1785f5fdde`。首安装因 MSI 不接受正斜杠 TargetDir 1606，改为同一私有目录的 Windows 路径后 exit 0，未改系统 PATH。

## 完整 pack 接线

Engine 官方 `packFromMain` / `stagePlatform` 使用：

```js
roots.LumioConfig = 'C:/Work/LumioGames/LumioConfig-101-authoring';
configSourceCommit = '6112af36825e2bd162353fe59bcfefdff2ee5794';
configArtifact = 'C:/Work/LumioGames/LumioConfig-101-authoring/build/authoring-04/config-compiler-win-x64';
```

Config 缺口已具备实际可消费输入，等待 Root 独审。完整 pack 其余状态：

- Engine 当前 `C:/Work/LumioGames/LumioGameEngine-101-binding-context-budget` 为 `6f625e83e29543a53ae621b92d5cdbbf27e73945`；Root 指定最终 Runtime 还需新 codec 冻结，不能混用先前 b213 当最终版本。
- Server/Client 活跃闭合切片仍须使用最终经审查、源码 clean 的固定提交。Config 构建未触它们或共享 Runtime/Engine 构建输出。
- 本机 Node 24.18.0、.NET 10.0.400、Rust 1.98.0、`wasm32-unknown-unknown` 和 Windows MSVC target 可用。不能由这些版本探测宣称完整构建通过。
- Windows 默认 `bash` 是 WSL stub；真实 Git Bash 为 `C:/Program Files/Git/bin/bash.exe`，执行完整 pack 时应在子进程 PATH 前置。
- Windows PATH 没有 `docker`，但实际 `wsl -d Ubuntu-24.04 -- docker version` 返回 29.8.0。Client/Root 已有仅适配真实 Docker 进程入口的范例 `Game/games/101-bomber/.run/pack-effect-candidate-04-wsl.mjs`；它仍从真实 Platform context build 后 inspect digest，无伪造镜像或跳过检查。最终 pack 复用该本机适配，其他 official builders 保持默认。
- Linux authoring onedir 未构建。当前交接满足请求的 win-x64 本机完整候选；若要正式双 RID，仍须实际 Linux stage 与同固定 Config 提交的 Linux 产物，不能把 Windows 包标成 Linux。

构建没有推远端、发布 tag 或生产激活。Windows 作者闭包通过不替代最终完整发行 checker、真实 Platform/DS/客户端对局验收。
