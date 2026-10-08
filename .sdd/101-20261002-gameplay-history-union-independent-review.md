# Gameplay 历史账本合并独立审查

最终结论：**窄范围 PASS（修复后）**。最初六文件版本退回，下述缺陷保留为真实失败记录。最终审查 `history-union-reviewed/proof.json` 七文件，patch SHA256 `fab4cb6d5c2af3a3b3544a98a45c2e9cd85148d0e06dd4e0f2eeabaac2b91cda`。没有修改 Gameplay 或 Tools。

修复后独立验证：八个文件/patch hash 精确匹配；冻结测试 11/11、0 fail/skip、exit 0；实际完整 ledger 的删除一个、全删 61 个、篡改身份、重复、缺 snapshot、篡改 snapshot、独立 required hash 错误等七个反证全部被拒绝。工具现在固定独立 `LOCAL_HISTORY_SNAPSHOTS` 并对完整原账本执行 `compareHistory`，删除所有 candidate 引用不能移除必读输入。另对 hash 精确相同的生产 CLI 实际复跑全部删除变体，得到预期 exit 1 和 61 个 `missing_prior_shape_retirement`。

新证据：`history-union-fixed-independent-probe.json`、`review-history-union-fixed.mjs`、`history-union-fixed-independent-tests.log`、`history-union-fixed-cli-delete-all.json`，均在本文原证据目录。冻结 after 只含变更文件，直接执行其中 CLI 会因未包含未修改的 sibling modules 失败；该尝试未作为通过计入，随后核验现行 Tools hash 后运行完整生产入口。

## P1：生产审计不能检测 Root 独立历史的删除

`validateHistorySnapshots` 只验证 candidate 中仍存在的 qualified retirement，未将 snapshot 作为独立完整 baseline 比较。`verify-schema-identities` 又仅从 candidate retirement 枚举 snapshot，所以删除全部 qualified retirement 也会令原始 snapshot 不再参与审计。现有 git bootstrap baseline 不含 Root 原先未提交的分支历史。

实际冻结文件探针：删除一个 qualified tombstone，或删除全部 61 个，格式验证和 snapshot 验证都返回空 diagnostics；独立 `compareHistory(originalRoot,next)` 则发现真实丢失。需要固定独立来源清单并验证每份完整 snapshot，而不是依赖待验证 candidate 声明其自身历史。Gameplay 已确认问题并进行修复。

## 已实证的保留与范围

- 六个 after 文件及 patch 七个 SHA256 全精确匹配。
- 原始 union 对 Root 的 `compareHistory` 无缺失，所有原 retired 逐 JSON 精确保留；新增 snapshot 原 bytes 哈希等于 before ledger。
- 冻结新增历史测试 9/9、0 fail/skip、exit 0。这些绿测不能替代上述删除反证。
- 证据：`games/101-bomber/.run/20261002-client-session-integration/history-union-independent-probe.json`、对应 `.mjs`、`history-union-independent-tests.log`。

本审查只涉及历史合并保护，不授予 schema 发布、SDK 组合或整局验收通过。
