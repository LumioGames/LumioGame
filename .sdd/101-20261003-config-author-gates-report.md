# Config 最终源轻量作者门交回（2026-10-03）

**剩余必要轻量门全部通过；源文件、tracked 生成物、索引与已有差异未变。未重跑 discovery/.NET/Rust/Editor/Native，未提交或推送。**

Owning：`C:/Work/LumioGames/LumioConfig-101-registry`；HEAD `6112af36825e2bd162353fe59bcfefdff2ee5794`；branch `codex/101-config-registry`。证据：Root Game `.run/central-supply-20261003/config-author-gates-01`。

## 真实入口与命令

固定解释器 `C:/Work/LumioGames/LumioConfig-101-authoring/build/101-toolchain/python/python.exe`，真实 `--version` 输出 **Python 3.11.9**；sys.version 为 AMD64 CPython 3.11.9。

- python.exe SHA256 `5f7b89a612c9b8af1d6456cdfcd1dbe5ca630849e79aebced9bee9a6694952ec`。
- python311.dll SHA256 `0817a2a657a24c0d5fbb60df56960f42fc66b3039d522ec952dab83e2d869364`。
- 实際入口 `C:/Work/LumioGames/LumioConfig-101-registry/tools/lumio_config.py`，SHA256 `dea59d6b2806c5fc6df78edd839669c8625621a5836fa6af6a08c7d968a33054`。
- cwd 为 owning Config，设置 `PYTHONUTF8=1`、`PYTHONIOENCODING=utf-8`、`PYTHONDONTWRITEBYTECODE=1`；CLI 使用默认项目根，无 `--root` 替换。全部真实 argv、时间、输出 SHA 和子退出见 `commands.json`，stdout/stderr 分开原字节保存。

下表中的 python/CLI 均指上述精确路径：

| 实际调用 | 结果 | child exit |
| --- | --- | --- |
| python CLI validate | `validate: OK`，默认源 6 schemas/6 tables/10 rows、load errors 0 | 0 |
| python CLI format --check | `format: OK`，没有写表源 | 0 |
| python CLI registry verify | `registry-verify: OK` | 0 |
| python CLI patch validate `C:/Work/LumioGames/LumioGame/.run/central-supply-20261003/config-author-gates-01/sample-patch.json` | `patch-validate: OK`，仅 validate、未 apply | 0 |
| python CLI export --out `C:/Work/LumioGames/LumioConfig-101-registry/build/agent-work/author-gates-20261003-01/export` --csharp-out `C:/Work/LumioGames/LumioConfig-101-registry/build/agent-work/author-gates-20261003-01/csharp` | `export: OK (6 table(s))`，默认 S/C/V 投影，输出 20 JSON + 15 C# 文件 | 0 |
| git diff --check | 无 whitespace 诊断；既有 ids.py LF→CRLF 提醒保留 | 0 |
| git diff --cached --check | 无诊断 | 0 |

开始前断言私有输出目录不存在；输出与 C# roots 都是新的 `build/agent-work` 子目录。仅写私有输出，35 个文件均复制进 evidence/private-output 冻结。此导出针对 Config 自身默认六表，不代表当前 Game 产品配置或官方发布组合验证。

补丁没有临时发明：先查 `games/101-bomber/.run/central-supply-20261003/registry-fix-01/freeze-report.json` 的原证据 SHA，再验证并逐字复制其已支持的 `sample-patch.json`，内容为 name-only skills/fireball update damage=123，一操作，不填写终身 ID。旧 validate/format/export/patch 原日志与 exit 同时核验身份保留。没有执行 patch apply。

## 当前 AGENTS 四门逐项追溯

1. `python -m unittest discover -s tests -v`：按 Root 指示复用精确 registry freeze02 的既有 `registry-review-fix-01/full-discovery-01.log`，234 tests/0 failures/0 errors/0 skips、child 0；日志 SHA256 `5b9370be8d55c4b8f828c059d542bd54795ce61ccc130af2eaeef50a4b20371e`。本次核验 log/exit 当前与 frozen 两份 hash、实际 234/OK/零 skipped 文本，并确认全部 152 源身份仍对应这份测试。未重新执行 discovery。
2. validate：本次真实默认入口，见 `validate.stdout.log`、`.stderr.log`、`.exit`。
3. format --check：本次真实默认入口，见 `format-check.*`。
4. git diff --check：本次检查工作树与暂存区两层，各 child 0，见 `diff-working-check.*` 与 `diff-cached-check.*`。

额外项目 strict 门复用 Root 的真实 `root-governance-review-02/strict.json` / strict.exit，13 checks 全 ok、0 errors/warnings/skips、默认 fingerprint、child 0；已读取并复制进 `reused-root-review02/`。Root 的 02 独审为最终 PASS，01 旧 ADR 文件名猜错的首审不当作完成证据。

既有 Unicode 的 12 evidence files 与 4 实际 program/runtime files 均逐项比对原路径及 registry freeze02 的 frozen 路径，16 项 hash 全部相符，见 `reused-evidence-verification.json`。本次未重执行跨语言程序，也未编译其项目。

## Reader 与源身份

生成的 C# 路径集合与真实 `git ls-files generated/csharp` 完全一致，**15/15** reader 私有字节等于 tracked 当前工作树字节及 `git show HEAD:<path>` blob，缺失/额外/内容差异均为零。逐文件三种 SHA 和比较结果见 `reader-comparison.json`。没有修改 tracked generated/csharp。

默认源行数：attributes 2、drops 2、effects 2、mining 1、movement 1、skills 2。compilerHash 保持 `96fb8aaf2a33a79cad4496962081162b245ecd2442db419fc31ffff83f728301`；本次默认输入 `_input_hash` 为 `bfd4a2f0ed9ac707419e09454373ec20505a8eaa1d8a181162407fd0a8edca17`。它不是之前 Game baseline/current 输入 hash，不混用数据源身份。

开始/结束对 **513 个文件集合（512 个实际 index tracked 文件 + 新 bounds test）**逐项 hash 相等；真实 status、cached binary patch、unstaged binary patch 逐字相等。32 个已独审治理路径仍暂存，registry 三文件仍原未暂存。registry freeze02 全 152 current/frozen 源未变，旧 freeze01/02 与旧 234/Unicode 证据不覆盖、不改写。

本次没有失败的作者门；唯一 stderr 为已记录的 Git LF→CRLF 提醒，child 仍为 0。当前轻量作者检查及四门可追溯性已闭合。Root 可继续窄域提交准备；正式编译器从干净 committed source 重建、实际远端 CI、官方完整发布组合及产品重连仍有独立门，本报告不将私有导出等同官方包。
