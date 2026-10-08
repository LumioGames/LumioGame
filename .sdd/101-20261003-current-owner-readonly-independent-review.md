# CurrentOwner 纯读取窄增量独立审查

结论：限定范围 SPEC / QUALITY PASS，未发现必须退回的源码问题。审查者未实现这次生产修改或测试；只读复核并独立执行现有二进制，没有重建或修改生产源。这不是完整 Host Measure/Take/ACK 或完整游戏验收结论。

工作树 `C:/Work/LumioGames/LumioGameRuntime-101-owner-readonly`，基底 `e00aa599482970faaae52ee0863bf351d5feefcd`。复核三生产文件 `WorldManager.SuccessorProjection.cs`、内部 `ICurrentOwnerBindingReader.cs`、`EntityBindingQuery.CurrentOwner.cs`，以及新增 `CurrentOwnerPendingReadTests.cs`、`CurrentSuccessorOwnerReadTests.cs`。五文件与两测试 DLL 的精确 SHA 保存在该树 `.run/owner-readonly/review-identity-01.json`；独跑 runner 输入清单另外包含调用依赖文件的 SHA。

## 源码判断

- 新读取能力只查看实际 pending order / connection 索引、实际实体组件与 owner 事实，不执行 SynchronizePending，不建立组件、临时 ready 列表或第二份拥有者状态。已提交但尚未落路由索引的 pending 使用原 pending.RoomId，等价于正常维护后写入的值；失效实体拒绝读取而不修剪索引。
- 四种 selected profile 的普通当前生命仍校验 live participant / life、关联、generation、pending destroy 与控制占用。后继观察分支保留 epoch、连接、participant/view 与当前/last life 关系；已消费控制分支保留 restoration witness、目标关联、账号/房间/profile/epoch 的精确绑定比较。不存在借无分配要求放宽授权的改动。
- 旧 TryReadCurrentOwnerAttachment 与既有结果事实投影明确传 reader:null，继续走原 adapter 的维护路径。新 TryReadCurrentOwnerSnapshot 仅在 adapter 提供 Runtime 内部只读能力时返回事实；不支持该能力的自定义 adapter 返回 false。该能力边界已在 XML 注释说明，并已告知作者，不把这种拒绝称为所有第三方 adapter 的完全兼容。
- 新 stale 测试通过私有实际字典观察保留条目，避免 SnapshotConnections 对已死亡实体投影本身抛错；仍断言原 count / id 不变，并验证随后旧维护入口真正修剪。没有降低业务断言。

## 独立执行

使用作者已完成的 all-TFM `build-all-03` 输出，不与构建争用。通过同树 `node .run/owner-readonly/run.mjs` 执行新的独立标签：

| 证据 | 过滤范围 | 实际总数 | 成功 | 失败 | 跳过 | 退出码 |
|---|---|---:|---:|---:|---:|---:|
| `review-current-01.log/.json` | Hosting `*CurrentOwner*` | 20 | 20 | 0 | 0 | 0 |
| `review-successor-01.log/.json` | Replication `*CurrentOwnerSnapshotReadsSuccessor*` | 2 | 2 | 0 | 0 | 0 |

使用真实 Native SHA `3ab8500d470c2fd66236229549e1d7e1fa58094b41b899aab2e191cf1810618f`，完整路径与环境记录在两份 runner JSON。用例覆盖四 profile、未提交/已提交 pending、失效/expire 路由、普通 owner DTO 等值、映射不一致/销毁拒绝，以及实际 successor observing → transfer 后 controlled 和两分支断连拒绝。稳定读取的分配断言为 0B，并核索引不变；不声称整个冷进程首次调用 0B。

作者原 pending 8 例实际 88/96B RED、后续 build 和 full-suite 由作者维护。此报告没有将作者全量测试冒充本次独立执行，也没有把上述 22 例外推为所有 Host 生命周期已通过。
