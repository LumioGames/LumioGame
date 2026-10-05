# Runtime codec / current-owner snapshot 窄独审

日期：2026-10-03。作者：gameplay_resume；独立审查：capacity_resume。正式源码只读，未修改 Runtime、Host 或公共契约。

## 结论与输入

**SPEC / QUALITY：限定增量 PASS；没有发现本次范围内需阻断合入的缺陷。** 新 Host 的完整测量/交接链路仍需其自身真实测试，此结论不替代它。

源码树：`C:/Work/LumioGames/LumioGameRuntime-101-drain-codec-window`（下称 D）。

- commit：`e00aa599482970faaae52ee0863bf351d5feefcd`。
- parent：`9c373c3771e130a6f83fbdbd6f566849a60cf1f6`；已审 provider 基底 `3c4aa21c470159e384c0ba7fd88d62c5604c270a`。不重复授予整套 provider 新结论。
- 清单：D `.run/drain-codec/freeze-e00aa59.json`；SHA256 `f58442a3dd32553663ebbe64648a62e3eb61be90092fb0616897ddaa24e7ff81`。
- 独立核对 19/19 文件的实际 SHA256 与清单一致。范围为 codec 分片、同步容器 writer、current-owner snapshot 与其真实绑定查询路径，以及对应 ECS/Hosting 测试。
- 独立执行时测试程序集与 Runtime 程序集哈希：D `.run/drain-codec/capacity-review-binaries.json`。最终 ECS DLL 为 `869f4785922a745156b831eb62a69c5f6cd126fe3da73a0eb4c6283a3212e62c`，Replication DLL 为 `1046f3cf459a0f84fd9fd4d6d0e0fc0990026d3d517a0c5ff8b792c813fbb532`。

## 编码核对

计数和写出使用同一 UTF-16 → UTF-8 遍历。先计数、校验，再比较调用者窗口；短窗口返回 false、written 为零且不写目标。EncodePack 仅在计数完成后创建最终返回数组。后继请求/结果在写入前直接校验，与原 Decode 校验共享 result semantics，未更改字段、消息顺序、上限或公共身份格式。

已核对 surrogate pair、孤立高/低代理项、控制字符、引号/反斜线、多层容器 JSON 转义及 RPC hex 路径。普通 Pack 保持原 UTF-8 replacement 行为；RPC/后继严格路径仍拒绝孤立代理项。WorldChange 的历史 `] ,` → `],` 规范化，包括字符串内已有行为，被保留；本改动没有悄悄改写旧字节格式。

闭集枚举使用固定名字避免首次 Enum 元数据表分配，仍通过原构造/直接后继校验拒绝非法枚举；decimal-u64、hex128、零值例外、字节边界及失败映射仍受原契约限制。SyncList/SyncDict 遍历实际容器并按既有 ordinal scalar 顺序输出，未保存另一份容器真值或放宽元素类型。预测读取保留原 prediction cutoff 语义。

170 个旧官方 b213 与新 codec 差分，独立执行后编码字节或异常类型 **0 差异**。覆盖随机 UTF-16、标量极值、浮点特殊值、容器、canonical key 冲突、全宽 uint/ulong、各 profile 输入及后继结果/异常分支。该有限样本不是“所有可能输入等价”的证明，源码对照和门禁仍同时保留。

## 归属查询核对

`TryReadCurrentOwnerSnapshot` 沿既有 owner access、连接/档位/epoch、实体关联、pending destroy 和 successor reservation 守卫，返回数值 ID 与原字符串引用；旧 `TryReadCurrentOwnerAttachment` 仅通过 `snapshot.Project()` 保持原字符串 DTO。

`FindAccountComponent(NetEntityId)` 改为读取活记录现有组件数组，删除查询时的 `Registry.CreateComponents` 取样。`TryCaptureSuccessorBinding` 直接读取实际身份、房间和 Observer generation，避免先造十六进制字符串再丢弃。Observer 的非预测 getter 直接读原 backing 字段；预测分支不变。LogicTransform 对不存在的 `accountId` 查询先拒绝，避免为无效字段形成闭包。没有创建新组件、控制权或缓存状态真值。

原 adapter 的 `SynchronizePending` 仍可在有陈旧/待建路由时维护既有映射；此次仅把空列表分配延后。因此“当前稳定活连接查询 0B”不能解释成所有异常或动态路由状态都绝对无分配、无维护动作。Host 必须在其原批次冻结/预算所有权范围内调用，不可据本报告跳过动态状态的实际计费。

## 独立回归

以下日志位于 D `.run/drain-codec/`；各独立命令均保存 `.exit`，测试结果单独写入 `capacity-review-results/`，没有和作者构建输出争用。

| 项目 | 数量 | 失败 | 跳过 | 退出码 | 证据 |
|---|---:|---:|---:|---:|---|
| Window / 编码 / 短窗 / 分配 | 8 | 0 | 0 | 0 | capacity-window-01.log |
| 后继请求结果及关联 | 16 | 0 | 0 | 0 | capacity-successor-01.log |
| 真实 Native、4 种 profile 的当前归属 snapshot | 4 | 0 | 0 | 0 | capacity-snapshot-01.log |
| 旧官方包 → 最终 ECS DLL 差分 | 170 | 0 差异 | 不适用 | 0 | capacity-final-compat-01.json/.log |
| 首次 Result 枚举路径测量（见边界） | 1 | 0 | 不适用 | 0 | capacity-codec-cold-final-01.log |

前三项独立运行作者已构建的最终测试 DLL，未冒称独立重建整个解决方案。测试入口是 `dotnet <Tests.dll> --filter-class/--filter-method ... --minimum-expected-tests N --results-directory <独立目录>`。Native/Engine 环境按 `snapshot-green04.json` 中真实同源环境执行，4 项没有跳过 Native。

差分夹具先核对旧 b213 包 DLL。随后在独立 `capacity-current-compat/` 目录把 helper 的 Runtime DLL 替换为本轮实际测试的最终 DLL，避免仅复验较早 compat 输出；helper 不改编码输入。脚本 `capacity-compare.mjs`、两侧完整输出 `capacity-final-compat-{legacy,current}.json`、具体 binary/source SHA 均保存。此处是专用回归夹具，不是 Game/Host 通过 loose DLL 消费的交付证明。

作者最终全 Runtime `codec-runtime-full03.log/.json` 已实际记录 **2869/2869、0 失败/跳过、exit 0**；本审查读回证据，但不称为独立重跑全量。build03 exit 0 存在与 formatter 争用生成器导致的 7 条临时锁重试警告；随后串行 build04 已读回 **0 warning / 0 error、exit 0**，旧警告记录未删除。format04 的已报告通过同样属于作者证据。复核后的 19/19 源清单结果保存在 `capacity-source-verification.json`。

## 零分配结论的边界

独立首次 Result 测量返回 **891 bytes、allocated=0**，修复前作者保留的同边界 RED 为 4936B。该夹具事先执行普通 Pack、Request、StrictUtf8、相关 EqualityComparer 的初始化，并 PrepareMethod 预热 JIT；它证明“通用基础设施已初始化后，首次 Result/枚举编码 0B”，**不是整个进程第一次调用 Measure 的零分配证据**。

稳定重复的受测大帧计数/预留窗口写入为 0B，EncodePack 仅返回最终输出数组。此结论针对已冻结的正式 drain 值：现有 `FreezeValue` 把容器转成冻结字符串，避免测量时重新枚举可变通用容器。任意用户提供的 IDictionary/IEnumerable、预测容器读取、InputCommand 的 SHA 对象，以及错误异常构造，不在“所有输入均零分配”的承诺内；公开注释也没有这样的全称承诺。

新版 Host 完成后还要实际证明其冻结批次没有隐含 Value DOM/额外副本，Measure 值对应真实托管峰值，完整响应短窗不消费批次，Take/ACK 未知结果保留原缓存，以及冷启动初始化成本由所属启动预算承担。不得把本报告的 codec/Native snapshot 窄验收当成整条关闭链预算已闭合。
