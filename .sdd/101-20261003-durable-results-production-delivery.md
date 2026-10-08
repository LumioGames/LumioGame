# 101 结算高光持久化实现

当前状态：生产切片已实现并通过聚焦真实 Native 回归；完整正式组合、Schema 迁移与独立审查继续进行，不是最终交付声明。

依据 design §13、ADR0039/0043/0047，新增 Participant 持有的死亡数、最高半心点上限、Boss 击杀、绝境恢复、金心累计、六种特殊弹首次获得历史和已锁定角色。来自实际 Applied 健康/伤害事实与成功特殊弹拾取；拒绝不计数，自杀不算 Boss 击杀，原 Life 死亡不清除整局数据。恢复健康不冒充绝境治疗。仅剩一心并存活到终局的次数在冻结行中加一次，不反写实时统计反复累计。

终局两局保留表追加六列；角色从 durable Participant 已锁定值取得，避免旧 Life 销毁后变为零。特殊弹历史用最多六个 canonical uint 十进制值和逗号存储，最多 65 个 ASCII 字符，由 Game 校验后写入既有字符串容器，Dump 还原为 ID 数组。正式生成器不接受 maxElementUtf8Bytes 声明参数，因此没有绕过生成器或声称容器元数据上限已变更；Game 行值约束负责该 65 字符上限。未删除旧字段、重用 ID 或改变 Runtime 公共协议。

实际复制投影与 TS 终局消费一起接线。结果在新局开始后保持冻结，新局计数与特殊弹历史清零。普通声明和生成物仍需合并本次 Schema 身份迁移证据。

证据根：Game `.run/statistics-production/`。

- `durable-native-red-01`：4/4 实际失败，0 跳过，底层测试退出 2。
- 修复过程保留全部失败。两处测试前提修正：Start 在最后一个 Tick 后才切 Running，需真正 Tick 才采集初始峰值；没有加载的地形会正确保留四条爆炸延续，整局清理用例补载实际 Native 地图，未丢弃续作或放宽超时。特殊弹替换使用带真实地图的正式受控准入；受控尸体保留期间按已提交零血量和死亡数断言，不伪称已完成 Host 接管。
- `durable-results-native-red-02`：原尸体销毁后的角色实际为 0，5 中 1 失败，退出 2。
- `durable-results-build-green-06`：正式 SDK915 构建，0 警告/错误，退出 0。
- `durable-results-native-green-05`：12/12，0 失败/跳过，退出 0。含真实结果发布、Runtime 快照恢复、同房间实际下一局及历史保留；含 uint 最大值六位置 65 字符往返与非法文本拒绝。
- 聚焦回归：core6、growth15、retention4、rollover4、damage2，共31/31，均0失败/跳过、退出0。

源码冻结 12 文件与实际测试 DLL SHA：`.run/statistics-production/freeze-durable-01/manifest.json`，SHA256 `bc33ea067fde848d7d48017f9368f2ee92568a4f16381c164b8995fb6b95d752`。生成/client 文件由后续同源 SDK cdab 三端构建独立记录；不把 SDK915 聚焦结果冒充新组合完整测试。

表现侧独立切片及完整674项证据见 `101-20261003-durable-results-ts-delivery.md`。本报告未声称浏览器实操、音频听感、8Bot30分钟、多种子或整体正式验收已经通过。
