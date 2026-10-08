# Config 治理迁移交回报告（2026-10-03）

**已按授权应用并暂存精确 32 个治理路径；本地正常 strict lint 通过。未提交、推送、运行重型构建或修改 registry/compiler/table/schema 源码。Root 独立审查待完成。**

Owning worktree：`C:/Work/LumioGames/LumioConfig-101-registry`；base/HEAD `6112af36825e2bd162353fe59bcfefdff2ee5794`；branch `codex/101-config-registry`。

本次协调者依据用户完整交付附件第六节“普通实现、依赖恢复、可逆配置和环境修复自行处理”及剩余协调授权选择执行迁移；ADR 0009 如实记录此依据。没有把本次选择记成人类另选了新路径。M7-J/R-00402 原 Owner 选项 A 的永久交回物路径、原需求正文及历史 QA 结论保留。

## 范围与应用前证明

提案原件保留在 Root Game `.run/central-supply-20261003/config-governance-proposal-01`，manifest SHA256 `9f485d486a06eafdad29a85ee4a197704bc6d17882881acf4e9593d8a75138f2`，未改。完整 320936 字节候选 diff 已读回并逐块与原件/候选重建比对一致；完整清单、diff 和 23 项原件 hash 核验均保存于新 freeze 的 preflight 证据。

应用前真实索引无任何 staged 改动；保存原 index 原字节、原 status、原 staged/unstaged patch 及 32 个授权路径逐项 staged-before-empty 证明。`.sdd/` 盘点只有准确 README 与 `.gitignore` 两原件，无新材料或软链。

最终 32 个路径为 **16 修改、14 新增、2 移出**。范围以 `final-change-list.json` 为单一清单，`governance-cached-no-renames.patch` 展示全部 32 路径，常规 cached patch 将两组移档显示为 R100 重命名。

- 九份旧计划仅补四项必需元数据；原顶层状态（两 completed、两 in_progress、五 pending）及分隔符后正文物理字节逐项不变。九份整文件原件归档到 `docs/reviews/2026-10-03-config-governance-history/plans/`。
- `.sdd` 两原件先按原字节归档并核验，再用原生 PowerShell 对准确两文件移动到 `build/agent-work/legacy-sdd-20261003/`；复查目录为空后移除空目录，未用 recursive 删除。文件系统与实际 git 索引均已无 `.sdd/`。
- 永久交回物仍落 `docs/reviews/`；现行 dispatch 的临时材料改至已忽略的 `build/agent-work/`。AGENTS 补明该临时子目录不属于生成表交付目录，避免与原生成物纪律冲突。未改变 `.gitignore` 或 `.gitattributes`。
- 新 ADR 0009 生效；ADR 0001 部分取代、0002 取代，仅改状态链接，旧 ADR 其余物理字节不变；索引更新，旧计划格式指引和当前工具入口同步。原历史 lessons、M7 hardening return、独立 QA 及 M6 交回物不改写。

## 字节归档与 Git 规范化

11 份原件的原始物理字节与当前归档逐项 SHA256 一致。既有 `core.autocrlf=true` 与文本属性使 **只有旧 `.gitignore` 的物理 28 字节和 index blob 25 字节不同**，差异为 CRLF→LF；其余十份物理/index 完全一致。未改属性以隐藏差异。

按 Root 授权，在既定 `migration-proof.json` 中补了 11 份原件 raw base64、物理/index 双 SHA 与 normal-LF SHA，单文件重暂存，不增加第 33 个路径。从真实 `git show :docs/reviews/2026-10-03-config-governance-history/migration-proof.json` blob 解码所有 raw base64，11 份逐字等于原件、原 SHA256 全部恢复；原 `.sdd` 两份临时备份也等于原字节。该 blob 保证跨平台能完整还原，不能只靠物理工作树复制推断 Git blob 原字节。

## 实际验证与工具身份

在真实 owning Config 文件系统和索引上调用已安装官方 Workflow 1.3.6 `bin/spec-lint.mjs . --strict --json`，保留默认 fingerprint，未装替身、改检查、增加 root 例外或关闭检查。

最终 `strict-final-lint.json`：**0 errors、0 warnings、13 checks 全 ok、0 skipped、fingerprint ok/零命中、真实 child exit 0**。导航、链接、ADR 状态/索引、根纪律与 frontmatter 均执行通过。迁移前提案的正常 strict 证据仍保留为 37 errors/child 1，不回抹历史红。

`git diff --cached --check` 与 `git diff --check` 最终真实 child exit 均为 0。工作树检查 stderr 的既有 ids.py LF→CRLF 提醒保留；该源物理字节未改。首次暂存后的辅助计数断言失败：默认 `git diff --name-only` 把两组 R100 的 old path 折叠了。暂存 Git 子进程本身 exit 0；按照 systematic-debugging 只把证据脚本的路径计数改用 `--no-renames`，复核 32 精确路径，不再修改 Config。首工具错误转录、原脚本及 stage.exit 分别保留，不将首次辅助检查记为通过。

当前本机实际 linter 的 19 项文件身份已再次核验未变；与固定官方 Workflow `v1.3.6` / `4911c828e2f2c9913443985d253ca030b33a7c7b` 的 normal-LF 字节一致。CI 治理步骤只改为官方 tag、完整 commit/插件版本核验和真实 `plugin/bin/spec-lint.mjs . --strict`；其他 jobs 不改。没有修改或安装插件缓存。本机陈旧 marketplace 0.5.0 快照的宿主处置未执行，也未判其正在运行。

## 独立冻结与交接边界

新冻结目录：`C:/Work/LumioGames/LumioGame/.run/central-supply-20261003/config-governance-migration-01`。含 30 份当前治理源原字节、30 份实际 index blobs、18 份迁移前涉及原件、32 路径清单、原/最终索引、cached patches、真实校验日志/子退出、原件还原证明与工具身份。`verification.json` 逐项列出源/索引 SHA；manifest 列出整份闭包，report 副本一同冻结。

关联旧 registry freeze02 manifest SHA256 `a7d34fb80acc15aa8c6ed9bd246c1c8cc8b521fbf7a524a144e09448601b54e9`：**152 份 current/source-freeze 源逐项未变**，source compilerHash 仍 `96fb8aaf2a33a79cad4496962081162b245ecd2442db419fc31ffff83f728301`。旧 freeze01/02 原件均未修改。registry 的 ids.py、bounds test、CLI docs 三文件保持原未暂存状态；只暂存精确治理清单，未用 git add -A 或目录整包。

先前 234 tests/0 skip 与真实 Rust/C# Unicode 检查的证据范围仍是 registry freeze02 的源；本次只执行 Node lint、Git/字节核验，不重新运行 .NET/Rust/Native，也不声称实际远端 CI 已运行。官方编译器重建、完整发布包、产品重连和实际远端 CI 仍须独立证据。治理本地绿不代表完整交付全部完成；本交回由实施者编写，待 Root 对 cached patch、实际工作树/index hash、归档字节与授权记载独立审查。
