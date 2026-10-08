# 权威核心统计与帽王恢复

当前Game代码中 Kills、Pickups、PeakHats、HatKingTicks 原来仅清零/读取，HatKing 也不选出实际参赛者。已将既有字段接到真实成功结算及正式 Tick，不新增 schema 或客户端规则。

- Applied 原物品事实才记拾取；技能槽拾取在实际成功换槽记录点记一次，拒绝/同种留地/强化封顶不计数。
- 实际 `before>0 && after==0` 的原伤害事实为原来源 Participant 记一次击杀，自杀不计，重复结果不会再记；来源身份与当前Match必须一致，不转嫁给下一局。
- 每Tick从当前存活Life的已提交帽数选帽王；帽数至少1，同分保留现任，其他同分按完整实体ID稳定选择。切换只发一个既有 hat_king_changed 事件，Running/FinalCircle才累计持有Tick。
- 最高帽数在成功成长与实际存活状态更新，统计仍存于跨生命Participant，并沿既有结果冻结/持久化链保存。

实际 TDD：原4项 **3失败/1通过**、0跳过、exit2；修后4通过，再补原健康请求拒绝、实际技能拾取与同种不拾取、Warmup/Podium不计帽王时间后 **6/6**、0失败/跳过、exit0。另成长15、真实伤害8、完整结果保留4项均通过；正常官方生成构建 **0warning/error**。

证据：Game `.run/statistics-production/`。首个禁用生成的诊断构建产生546错误，原因是该开关同时移除了生成编译项和声明分析配置；已回到正式生成入口，没有关闭分析器或加忽略。第二次测试构建有一条配置类型错误，修复为既有 Load() 后编译通过；这些日志保留。最终编译 `build-green-04`、测试 `counters-green-02` 及回归日志均有真实命令/退出码。实际两Gameplay与Runtime DLL身份随测试记录。

冻结 `freeze-core-counters-01.json` SHA256 `ea2c2b3b1881a970a1db12ded4c3c75475aa42e0a30b4d88e24658f8ce387884`，精确6源码文件。独立capacity复跑6/6、0失败/跳过，证据 `.run/chest-journal/statistics-review-01`，报告另行保存。

此切片没有补齐终局峰值心数、Boss/绝境/金心、特殊炸弹历史等新持久结果字段，也没有涵盖尚未实现的持续伤害/技能。SDK915已修初始F2封套但实际 EffectRows 临时创建容量16与正式3不一致，Runtime owning修复正在进行。最终完整Game、真实整局和重连视觉验收仍待完成，不把本次核心计数通过当作最终交付。
