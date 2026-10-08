# CurrentOwner 动态路由纯读取交付

Runtime 窄提交 `efd0fa7e3ace7ceadc9ff594ab2c207ecb15095a`，父提交 `e00aa599482970faaae52ee0863bf351d5feefcd`。工作树 `C:/Work/LumioGames/LumioGameRuntime-101-owner-readonly`；五文件只涉及三处生产接面与两个新测试文件。已交 Gameplay 与 receipt/base64 窄切片组合，后续必须经正式 SDK 重打包回接 Host。

旧 CurrentOwner 快照经过 EntityBindingQuery 的普通路由查询，会执行 SynchronizePending。即使只是测量关闭输出，未提交 pending 也新建 ready 列表，已提交 pending 还会写路由索引；过期路由触发额外清理列表。真实 Native 四种 profile × 两种提交状态共八例全部 RED，分别多分配 96B/88B。

新内部只读能力直接读取原 pending order 或已提交路由与实际实体事实，不整理索引。快照保留账号、房间、profile、epoch、Participant/Life、销毁、资格及 restoration 的既有校验；没有第二份状态、缓存或公共 wire/ABI 改动。旧 Attachment 和结果事实读取继续使用原维护路径。新 primitive Snapshot 对不支持内部只读能力的第三方自定义 adapter 返回 false，此限制已在 XML 注释说明；当前正式 EntityBindingQuery 提供该能力。

证据在该 Runtime 树 `.run/owner-readonly/`：

| 证据 | 实际结果 |
|---|---|
| `pending-red-01` | 8 例，0 成功/8 失败/0 跳过，exit2；真实额外分配 |
| `current-green-04` | 20/20，0 失败/跳过，exit0；四 profile 普通/pending/stale/expire、0B 与原索引不变 |
| `successor-green-01` | 2/2，0 失败/跳过，exit0；实际死亡观察与复活控制分支，以及断连拒绝 |
| `build-all-03` | 全 solution、全部 TFM，0 warning/error，exit0 |
| `runtime-full-01` | 完整 2887/2887，0 失败/跳过，exit0；10 测试模块 |
| `review-current-01` / `review-successor-01` | 另一代理独立执行 20+2，全部通过；五源及二 DLL SHA 无漂移 |
| `format-02` | 全 solution 校验，0 文件变化，exit0；诊断保留既有 Hfsm 项目引用无对应元数据的 workspace 提示，未称 formatter 零警告 |

PrimeProbe 的旧定位要求传统输出路径。本次只将同一 solution 构建的 helper 完整映射至其期望目录，65 文件逐 SHA 核对，记录 `prime-helper-stage.json`，没有改测试断言。`eng/verify-solution.mjs` 确认 35 项目全部登记。官方生成变化仅 EOL 工作区提示，无生成内容变化，未放入五文件提交。

中间失败保留：build-green-01 缺新 reader 参数、build-all-01 新测试缺 using；pending-green-01 使用过大的 minimum 导致 8 例均成功但 exit9；current-green-03 的 8 个新 stale 用例在测量前调用 live DTO 快照而抛错。改为读取实际私有索引验证保留 count/id，随后验证普通入口确实修剪；没有删除断言或放宽指标。

限定：0B 证明通用设施预热后的实际动态路由读取，不代表冷进程首调用；此交付不是 Host Measure/Take/ACK 或正式 101 整局通过。独审报告为根 `.sdd/101-20261003-current-owner-readonly-independent-review.md`，完整冻结源/日志 SHA 为 Runtime `freeze-efd0fa7e.json`。
