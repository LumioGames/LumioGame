# Runtime 容量修复独立源码复审

对象：`LumioGameRuntime-101-finite-successor-capacity` 提交 `1907290daeaa12a8061a2cc0412c3065b62b8453` 相对 `2ab1deeb` 的 F1/F3 改动。Root 未实现容量生产代码；Root 自己实现的 F2 不在本独审范围，另由 capacity_resume 独审。

限定裁决：SPEC PASS / QUALITY PASS，未发现该增量内需要退回的具体缺陷。没有扩大为任意未来 Gameplay 写入均能提前预测，也没有宣称完整 Host/浏览器或八 Bot 验收通过。

逐项核对了 EntityOrder 准备与提交、真实当前和 PendingCreates census、GAS Effect/RPC/普通同步投影、初始准入债务、successor baseline 与最终 guard。准备使用实际组件但不绑定 Sync host、不进入结构队列、不发号；拒绝先于路线和实体提交。RentComponents 当前实际创建组件而非需归还的池借用。初始 census 包含完整 pending create，pending effect 检查同时计已接受待发布 census；Apply/Refresh 拒绝前不变更 frame Tick/ordinal、行与 handle 身份。成功后按真实承诺上界增加既有 publication debt；census 完成或取消移除准备记录，实际 drain 再释放已提交债务。

逻辑 4 MiB 上限来自嵌入的 Engine owning parts 契约；普通协议仍为 65536。scratch、authorization 与 result 有独立额度，未将每个小 baseline 固定扣除 4 MiB。最终编码 guard 保留，不能靠丢 census 或吞异常通过。

已读真实用例覆盖：八个未 drain 准入、超过物理但可分片的完整 census、普通协议与超逻辑拒绝的 allocator/revision/route/三类信用不变，以及 pending admission 下 Apply/Refresh 的原 Tick/ordinal 保留后 ordinal 1 成功。作者最终实际执行容量 6/6、Replication 193/193、ECS 496/496，均零失败/跳过、exit0；这些是作者执行记录，本次 Root 没有冒称重新运行。最新 B3 合流后仍需重跑。

证据与完整边界见相邻 `101-20261002-runtime-capacity-report.md`。原始独审 F1/F3 在本切片范围收口，整体交付仍持续进行。
