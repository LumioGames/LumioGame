# Config compiler 正式重建与下一完整包操作 brief

本文件是只读准备，记录 2026-10-03 05:16 UTC 左右的实际状态；没有执行 PyInstaller、.NET、Rust、Native、GEN、打包、暂存、提交或推送。仅本 brief 新增。结论：Config 已可从干净 HEAD 重建；完整八 provider 包还须 Runtime/Client 最终窄提交、干净冻结及 Server/Core 同级布局。Windows 工具链文件存在不等于下一构建已通过。以下待执行命令不得读作成功证据。

## 已核身份和已完成门

owning Config `C:/Work/LumioGames/LumioConfig-101-registry`，branch `codex/101-config-registry`，实际 HEAD `a991a517f9dbae255321c25d65fea0bfdfdca42f`；`git status --porcelain=v1 --untracked-files=normal` 空。治理提交 `0815cc991429bd843467f8acfa7a1a9c91f7bc24` 与 registry 提交分别保留范围，Root 原件 `.run/central-supply-20261003/config-local-commits-01/result.json`。

- 152 个 compiler 源输入已冻结于 `games/101-bomber/.run/central-supply-20261003/registry-fix-02/manifest.json`，SHA256 `a7d34fb80acc15aa8c6ed9bd246c1c8cc8b521fbf7a524a144e09448601b54e9`。这不是 152 个文件的单一集合 hash；现有算法 `src/lumio_config/export.py::_compiler_hash` 对 package 内 `.py` 计算真实指纹，当前 compilerHash（旧脚本也称 sourceHash）为 `96fb8aaf2a33a79cad4496962081162b245ecd2442db419fc31ffff83f728301`。
- ids.py `32b185014e68bea48a45492373f57532130e43cb2a6177b5d2e3288252502685`；新 bounds 测试 `1ef147ee4fa1981ae215f9e08a000678d8a74748509a5d2bca5f2ac323f59df5`；CLI 文档 `1cd4f5007ed550b2d059142341b92a36ba5335f7085b9648c129582324da3e7a`。
- 234 Python discovery / 0 failure / 0 error / 0 skip、真实 Rust/C# Unicode、真实 Python validate、format --check、export、registry verify、supported patch validate、15 个 reader 逐字一致及 default-fingerprint strict 均有原冻结证据。来源分别是 `.sdd/101-20261003-config-registry-independent-review-report.md`、`.sdd/101-20261003-config-author-gates-report.md`、Root governance-review-02。此次不重跑这些门。
- Config 默认表源 inputHash `bfd4a2f0ed9ac707419e09454373ec20505a8eaa1d8a181162407fd0a8edca17`，6 schemas / 6 tables / 10 rows。它和 compilerHash 是不同身份，也不是当前 Game v14 表源的身份。新 Game 表源必须另外固定实际输入，不能套用旧 inputHash。

## 官方构建器与固定工具链

已读 Config core/nav、authoring-compiler 知识、构建器和 smoke 全文；公共依据是 Engine freeze0e 的 ADR-137、release README、pack-release/verify-release 及 SDK identity 规范。ADR-137 在该精确来源仍为 Draft，并明示两 RID 完整作者验收未完成；不能据 Windows 新包升级其状态。

| 实际文件 | SHA256 |
| --- | --- |
| Config tools/build-config-compiler.py | `3d781ce847a7658997a0453f61a70198def5177fc4590889b44f8a544c3d2c48` |
| Config tools/config-compiler-requirements.txt | `68970fe75a2e61443461cf417833f2453c5421fd382bfaf9f551d640ff603eb3` |
| Config tests/authoring-smoke.py | `593f1472615b059d796b20f79e61d8fa88ca5341b32f7ad0774779688e4be951` |
| Engine0e eng/pack-release.mjs | `d4a68a8ddc185299be86d14e54809e59a3bd530296d004c2550f23c610beffd0` |
| Engine0e eng/verify-release.mjs | `31038577b48da95a9507e8ce1f87a3438067b945fff832d6868ef07f32523e4d` |
| Game 私有 pack-reviewed-composition.mjs | `6702dd187c3fa6b57e63c291396d68164cbb0faba9670a3cc369307d03708bb7` |

Python 精确入口 `C:/Work/LumioGames/LumioConfig-101-authoring/build/101-toolchain/python/python.exe`，实读版本 `3.11.9 ... [MSC v.1938 64 bit (AMD64)]`，SHA256 `5f7b89a612c9b8af1d6456cdfcd1dbe5ca630849e79aebced9bee9a6694952ec`；同根 python311.dll SHA256 `0817a2a657a24c0d5fbb60df56960f42fc66b3039d522ec952dab83e2d869364`。这里只复用解释器环境，编译源码必须来自 registry owning tree，不能编回旧 authoring HEAD6112。

本次只读 importlib.metadata probe child exit0：altgraph0.17.4、packaging24.2、pyinstaller6.11.1、pyinstaller-hooks-contrib2024.10、setuptools75.6.0、pefile2023.2.7、pywin32-ctypes0.2.3 全部精确匹配；CPython LICENSE.txt 存在，各 distribution 元数据有许可证成员。无需为本次重建先安装依赖；真实构建器还会读取许可证正文并校验，未在本次调用 PyInstaller。

官方 builder 强制完整 source-commit=HEAD、干净 checkout、原生 x64 与 Python3.11.9、精确依赖、新目标目录；结束前再次核 source/指纹。它复制现有 entrypoint，使用 `-m PyInstaller --noconfirm --clean --onedir --noupx --python-option "X utf8" --name config-compiler`，绑定 owning `src`，将计算出的 compiler-hash.txt 作为 data，生成 metadata、许可证及全部闭包文件 hash；拒绝 `.py`/symlink。无需编写第二构建器或手改 hash。

## 八 provider 当前状态与最小前置

下表是实际只读 git 输出，再结合 Root 明确选择；Runtime/Client 最终 commit 尚不存在于本次读到的 HEAD，不能填旧 commit 冒充候选。

| provider | 选定来源 / 当前 HEAD | clean 与前置 |
| --- | --- | --- |
| Engine | `LumioGameEngine-101-release-freeze0e` / `0e2fc74783f9f186d59909b38d4ee70887a21137` | clean，保持此来源 |
| NativeCore | `.101-pack05/LumioNativeCore` / `81b2501a621db2657bd087db2afa808ecfb9e846` | clean，Root 确认本轮 Native 源码未改 |
| Voxel | `.101-pack05/LumioVoxelEngine` / `2ba61e431d8080ff6450a07e6ee447e3f0994e0b` | clean |
| Runtime | `LumioGameRuntime-101-successor-capacity` / `23356eafc365c753b6e8d9987fd069815ff067ce` | dirty：Successor.cs、lint-extensions、新增增长测试、untracked .run/.sdd；待 Root 窄提交、独审和干净冻结 |
| Client | `LumioClient-101-successor-correlation` / `69b848f064ca44082f833894fd686eac0797cd24` | dirty：5 个 tracked 源/测试工程路径、Fixtures、.run/.sdd；待 Root 当前 whole 验证、窄提交、干净冻结 |
| Server | `LumioServer-101-successor-expiry` / `448c90b57fa2e071a224b58b0ef1acfb4189a355` | clean，Root 要求替换旧161，须修布局 |
| Platform | `LumioPlatform` / `3a2ef1a7c3d57128bdaafd5efeea5080f9cdbc89` | clean |
| Config | `LumioConfig-101-registry` / `a991a517f9dbae255321c25d65fea0bfdfdca42f` | clean，先产新 artifact |

所有根均在 `C:/Work/LumioGames/` 下。正式归档必须保存前后 HEAD、normal-untracked status 和 reviewed source hash。不把临时 .run/.sdd 整包提交，也不删掉合法交回物来伪造 clean；Root 可从最终窄提交创建干净冻结树供打包，原 owning 证据保留。

具体布局阻断：`defaultDs::assertSiblingNativeCore` 检查 Server 的 `../LumioNativeCore` realpath 与输入 Core 根相等。owning Server448 的兄弟是主 `LumioNativeCore`（实际 clean c93b5c62...），与 `.101-pack05/LumioNativeCore` 是两个非 junction 目录，直接混选会 BLOCKED_ENV。最小可执行方案是 Root 在新 `C:/Work/LumioGames/.101-pack07/` 置 clean `LumioServer`448、`LumioNativeCore`81、`LumioVoxelEngine`2ba 三个同源 checkout，再逐一核 40hex+clean。不可移动/改写旧05冻结或把主 Corec93 冒充81。.101-supplychain 的现 Server 是 cc493d7...，也不是获选448。

工具链只读盘点：Node 在 `C:/Program Files/nodejs/node.exe`；dotnet 在 `C:/Users/g923/.dotnet/dotnet.exe`，10.0.111/10.0.400 SDK 目录均存在；Client/Server global.json 强制10.0.400且禁止 roll-forward，Runtime 从10.0.100 latestFeature。Rust1.98.0 Windows MSVC 与 wasm32 target、wasm-bindgen-cli0.2.128 安装记录存在。Engine native/capture 要求 Rust1.98.0，Capture Windows static CRT；重建窗口应显式设 `RUSTUP_TOOLCHAIN=1.98.0-x86_64-pc-windows-msvc`，保存真实 rustc/cargo/dotnet/Node/wasm-bindgen 与 MSVC/linker 身份，文件存在不是 readiness PASS。本任务未运行这些编译器或测试工具。

Windows `Get-Command docker` 无结果；上一包既有私有 wrapper 的 localPlatformImage 通过 `wsl.exe -d Ubuntu-24.04 -- docker build` 与 image inspect 调真实 Platform Dockerfile。该 wrapper 其余构建均调用官方 packFromMain/defaultBuilders，sdk adapter 只额外保存官方 identity，不改生成语义。新包复用此准确入口前需在 Root 执行窗口确认该 WSL Docker daemon 可用；否则 full pack 不能称 Platform 齐全。不能接受 platformImage=null，也不能只拿上一镜像摘要填新 manifest。

## 待执行的精确入口与新路径

以下三目标本次检查都不存在：Config `build/agent-work/formal-compiler-20261003-01`、Game `.../complete-release-07`、`.../full-pack-07`。实际开跑前再检查；如被占用顺延编号，不 merge 或覆盖。

1. Root 解除 heavy 互斥后，在 Config registry owning cwd 设置 `PYTHONDONTWRITEBYTECODE=1`、`PYTHONUTF8=1`、`PYTHONIOENCODING=utf-8`，运行：

```powershell
& 'C:/Work/LumioGames/LumioConfig-101-authoring/build/101-toolchain/python/python.exe' 'C:/Work/LumioGames/LumioConfig-101-registry/tools/build-config-compiler.py' --rid win-x64 --source-commit a991a517f9dbae255321c25d65fea0bfdfdca42f --out 'C:/Work/LumioGames/LumioConfig-101-registry/build/agent-work/formal-compiler-20261003-01'
```

实际 closure 将为该根下 `config-compiler-win-x64`。保存真实 stdout/stderr/child exit、argv、metadata SHA、文件集合与源前后身份。断言 metadata sourceCommit=a991、rid=win-x64、compilerHash=96fb...，再交 Engine0e 的 `verifyAuthoringTool` 和 leak-scan。artifact hash只能在新程序生成后计算，不可预填旧7f3a...

2. 使用当前已提交官方 smoke：

```powershell
& 'C:/Work/LumioGames/LumioConfig-101-authoring/build/101-toolchain/python/python.exe' 'C:/Work/LumioGames/LumioConfig-101-registry/tests/authoring-smoke.py' --artifact 'C:/Work/LumioGames/LumioConfig-101-registry/build/agent-work/formal-compiler-20261003-01/config-compiler-win-x64' --out 'C:/Work/LumioGames/LumioConfig-101-registry/build/agent-work/formal-compiler-20261003-01/smoke with spaces'
```

它实际比较 source/frozen validate、format、single/split 两次导出及 reader、verify-split、Unicode 非法输入、missing/corrupt identity，共16调用。该脚本清空 frozen PATH/PYTHONPATH/PYTHONHOME，但没有移走 provider src；不能单凭它声称“源码物理不存在”。旧 `LumioConfig-101-authoring/build/verify-smoke-final-05.py` 有真实 temporarily-src-absent+finally-restore 路径，但硬绑旧6112 artifact，不能原样重用。新闭包应在独立隔离、provider源码物理不存在的执行环境再导出，核 exact output/hash；不要在 Root heavy 活动期间移动 owning src。增加新冻结 CLI 对 Game 已固定表源的 `registry verify --root <exact-input>`、合法 bounds 与 malformed-columns 结构化诊断对比，证实已打包本次修复；既有源码234绿色不等于新 EXE 实跑。

3. Root 填最终 Runtime/Client **真实完整 commit**并准备同级三 Rust provider后，在新的 input JSON 指定八源。建议本地新 baseVersion `0.0.5`，产生 `0.0.5-main.0e2fc74`：旧06为 `0.0.4-main.0e2fc74`，仅 Config/Runtime/Client/Server 改动不会改变 engine短号，沿用base0.0.4会造成同版本不同内容。新 baseVersion 在开跑前核所有本地 feed/锁/缓存无冲突；这是本地完整候选版本，不是已发布v0.0.5或远端tag授权。

准备的 JSON 形状如下（PENDING 为未解决前置，不能直接开跑；本次没有写 input 文件或创建 checkout）：

```json
{
  "sources": {
    "LumioGameEngine": {"root":"C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e","commit":"0e2fc74783f9f186d59909b38d4ee70887a21137"},
    "LumioNativeCore": {"root":"C:/Work/LumioGames/.101-pack07/LumioNativeCore","commit":"81b2501a621db2657bd087db2afa808ecfb9e846"},
    "LumioVoxelEngine": {"root":"C:/Work/LumioGames/.101-pack07/LumioVoxelEngine","commit":"2ba61e431d8080ff6450a07e6ee447e3f0994e0b"},
    "LumioGameRuntime": {"root":"PENDING_clean_Runtime_freeze_root","commit":"PENDING_final_40hex"},
    "LumioServer": {"root":"C:/Work/LumioGames/.101-pack07/LumioServer","commit":"448c90b57fa2e071a224b58b0ef1acfb4189a355"},
    "LumioClient": {"root":"PENDING_clean_Client_freeze_root","commit":"PENDING_final_40hex"},
    "LumioPlatform": {"root":"C:/Work/LumioGames/LumioPlatform","commit":"3a2ef1a7c3d57128bdaafd5efeea5080f9cdbc89"},
    "LumioConfig": {"root":"C:/Work/LumioGames/LumioConfig-101-registry","commit":"a991a517f9dbae255321c25d65fea0bfdfdca42f"}
  },
  "configArtifact":"C:/Work/LumioGames/LumioConfig-101-registry/build/agent-work/formal-compiler-20261003-01/config-compiler-win-x64",
  "output":"C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/complete-release-07",
  "evidence":"C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/full-pack-07",
  "baseVersion":"0.0.5"
}
```

存为同级新的 `full-pack-07-input.json`（不要先创建 wrapper 要求全新的 evidence目录）。最终真实顶层 argv：

```powershell
& 'C:/Program Files/nodejs/node.exe' 'C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/pack-reviewed-composition.mjs' 'C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/full-pack-07-input.json' --check-only
& 'C:/Program Files/nodejs/node.exe' 'C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/pack-reviewed-composition.mjs' 'C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/full-pack-07-input.json'
```

check-only 是实际八源40hex/clean/新目录 gate，不构建。后一个通过官方 `packFromMain({engineRoot, roots, out, baseVersion, configSourceCommit, configArtifact, builders})` 从同源生成整套 Native、DS、capture、SDK、Host、Bot、replica、Engine/Voxel WASM、authoring及Platform；它保存 sdk-identity.json 与 Platform真实退出。这里选择的是与06相同官方本地 complete-release 路线，非 `--version X.Y.Z` 正式远端发布路线；后者还需真实tag未存在检查与精确带版本的已构建镜像 digest，不能把两者混称。

4. 新包完成后，用新包自带 verifier：

```powershell
& 'C:/Program Files/nodejs/node.exe' 'C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/complete-release-07/tools/verify-release.mjs' --root 'C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/complete-release-07' --rid win-x64 --version 0.0.5-main.0e2fc74 --json
```

记录完整实际 file count、manifestSHA、nupkg SHA256/SHA512、新 sdk identity、tool metadata/闭包、Native build-info/BuildId/ABI/source fingerprint/features、Host/Bot/DS 和 Platform镜像digest，逐项核源清单。writer已内置verifyRelease及末尾 source检查；外层再保存normal-untracked clean身份。不得把旧305file当新预期常量、不得补散装DLL/测试专用Native、不改新manifest接受失败。若中途锁/生成导致来源漂移，保留失败日志，按所属官方生成/窄审解决并重新产新目录。

## 旧包身份与交付限制

旧 handoff 的真实路径是 `games/101-bomber/.run/20261003-controlled-game/full-pack-06/handoff.json`，SHA256 `ccbadb945e0bf4286af237925e4669e4c9926acfbdd31896bc7fb1c9e6ea6783`。Root提到的根 `.run/...` 无此原件，查得上述路径后读取。旧manifestSHA `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`、SDK identitySHA `7242dae3b65c6fe431733f11fe25c823121accf1b0fb13115a3f1dbc41713a32`、旧nupkgSHA256 `0b1657ec29ec83c4281549ebf787fe0b9187b5d30780b6bc513151bf75dd9c3b`；旧 Config source6112/compiler17c4仅作基线，完整06保持不可改。

新完整包还须 Root用官方消费选择器绑定新manifest+新nupkg identity，保存新的selection/feed/锁身份后构建Game，而非复制旧selection指向新内容或手写DLL引用。Runtime/Client测试专用 Native98f0...的feature仅用于测试，不进入production包。八provider包不包含Game私有玩法验收；新包闭包验证、Windows作者CLI实跑、Game真实Native各producer、容量/Outcome、Remote/Platform/整局与视觉验收是分别交付。当前没有新compiler artifact、新manifest、新SDK、新Platform image或新Game全局验收证据；两 RID作者验收、CI与远端发布也未由本任务完成。
