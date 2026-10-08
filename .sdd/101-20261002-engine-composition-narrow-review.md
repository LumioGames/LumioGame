# Engine composition 窄增量独立审查

结论：**SPEC PASS / QUALITY APPROVED（仅本文限定范围）**。未发现需要阻断这组修复的缺陷。此结论不批准 ACR2/905，不表示 Server/Runtime provider 或 successor profile 已验收。

审查对象为 `C:/Work/LumioGames/LumioGameEngine-101-hydration-dependency` 的本地组合提交 `0a265f4`。只读源码、Git 对象、证据并执行指定窄测试；没有修改 Engine 源码、Git 索引或发外部消息。审查期间 Root 将 fixture 的属性例外从根移到 `engine/native/.gitattributes`；本文核对的是更正后的提交形态。

## 检查结果

- `eng/verify-wire.mjs` 的 `collectErrorCodes`：新增对每个值都具有完整 meaning/trigger/handling（含既有别名规范化）语义对象的码表支持，返回原键名；既有数组和分组数组路径仍保留原始重复项，后续重复与 snake_case 检查没有放松。缺描述的对象不能冒充有效完整码表。全局语义检查仍由 `error-code-catalog.mjs` 校验中文描述、单一归属与引用。新增正向 Host 码表及坏名称/不完整描述/重复码测试与修复相匹配。
- `eng/dev-build.mjs` 的 `rewriteWorkspaceDependencyRoots`：只递归处理独占的 staging native workspace 中的 Cargo.toml，调用既有替换逻辑，保留 feature 等依赖属性与 workspace 内相对引用。调用点在复制 workspace 之后、Cargo 求值之前，覆盖新增 HFSM WASM member。原始 provider 不作为写入目标；既有 SDK 必须解析外部根的检查仍在。新增测试覆盖 sdk-native、ffi-boundary、hfsm-wasm 三个 member，原真实失败日志亦有保留。
- frozen fixture 属性：规则位于更近的 `engine/native/.gitattributes`，仅 `modules/hfsm-wasm/tests/fixtures/client692/*.cs -text`。实际 `git check-attr` 确认 text unset；Rust 仍为 eol=lf。3 个 C# fixture 的工作区、索引、provenance 指定原源逐字节相等，长度依次 556、10339、6200，SHA256 与 provenance 全部一致。没有改原 bytes 去迎合全局空白检查。冻结 CRLF 证据引起的 diff-check-02 whitespace 输出是已明确保留的事实，不写成全 diff 无告警。
- 历史链接修复：`link-repair-plan.json` 全部 274 条均存在对应替换。262 个本地目标全部存在（260 个路径层级修复加 2 个文档搬迁目标）；12 个外链均含精确 40 位提交，已实际读取对应仓的 `commit:path` Git blob 并记录长度/hash。全部涉及文件按修复前索引文本只替换登记链接后，与最终正文一致，未发现额外正文变更。结构规范中将临时输出目录示例改为文字说明的独立一处也已读核，为实现细节澄清，不改变架构语义。

## 实际验证与证据

本次独立运行：

| 验证 | 结果 |
|---|---|
| `node --test eng/dev-build.test.mjs` | 14/14 pass，0 fail/cancelled/skipped，exit 0 |
| `node --test eng/verify-wire.mjs` | 597/597 pass，0 fail/cancelled/skipped，exit 0 |
| 全部登记链接的目标/替换/正文核对 | 274 条，0 缺目标，0 缺替换，0 超出链接的差异 |
| 三 fixture 源/工作区/index/provenance | 3/3 长度/hash 相等 |

独立运行证据位于 Client 隔离工作树 `C:/Work/LumioGames/LumioClient-101-composition/.run/composition-20261002/`：`engine-dev-build-review.log`、`engine-wire-review.log`、`engine-narrow-review-evidence.json`、`review-engine-narrow.mjs`。JSON 含 12 个历史 blob 与 80 个读取文件的身份记录；没有将外链页面可访问性冒充 Git blob 真实性。

另只读核对 Root 原失败证据 `host-error-map-red.log`、`native-members-red.log`，以及 `.run/101-unified-contracts/spec-lint-02.log` 和退出码文件：12 项通用 + 7 项扩展全通过，零报告、零跳过、零禁用，exit 0。严格 lint 是 Root 实际执行，本次没有把读取已有日志写成独立重跑。Root 官方 Native/WASM 构建结果是该实现的额外上下文，本窄审查没有重建 Native 或声称完成浏览器完整对局。
