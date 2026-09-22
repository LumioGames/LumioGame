# MS-00002 Hello World —— 历史证据（切片已退役）

Hello World 垂直切片（RM-00010，已归档）随 **ADR-097** 退役，端到端验证归 `LumioSample`。其契约 `hello-wire-v1.json` 已从架构仓删除。

**本目录只保留 `evidence-run1/`：2026-08-31 那一次真实运行的机器产出证据。**

## 为什么不一起删

`.spec/decisions/0020-exit-legacy-contract-regime.md` 定过：

> `integration/hello/evidence-run1/manifest.json` 与 `release-manifest.json` 是 2026-08-31 那次真实运行的机器产出证据，里面记录的绝对路径含旧仓名。**改写证据等于伪造记录**，故原样保留。

所以证据留着、且不修改；退役的是执行与对账工具。

## 删掉了什么

| 文件 | 原职责 |
|------|--------|
| `launcher.mjs` | 集成启动器：prepare → round 1/2 → finalize |
| `static-server.mjs` | web 资产静态服务 |
| `verify-evidence.mjs` | 单轮三方对账器；其中手抄的契约词表指向的 `hello-wire-v1.json` 已不存在 |
| `package.json` / `package-lock.json` / `.gitignore` | 上述工具的运行配置 |

要做端到端验证，去 `LumioSample`（ADR-097 指定的承接方）。
