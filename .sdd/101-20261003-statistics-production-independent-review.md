# 正式统计生产窄独审

结论：本次六文件生产增量 SPEC/QUALITY 限定通过。作者 Root，审查者 capacity_resume；审查者没有实现该统计生产，仅在共享构建输出上独立执行六例。范围为 BomberStatisticsBusiness.Server.cs、BombSystem.Server.cs 的 Advance 调用、BomberHealthBusiness.Server.cs 成功拾取、BomberEffectBusiness.Server.cs 实际致死、PickupAbility.Server.cs 技能拾取，以及 BomberStatisticsProductionTests.cs。

实际成功的 Effect 回执才累加 Pickups；失败释放 claim 不计数，真实特殊技能替换路径复用既有 RecordPickup，只计实际接受一次。致死只认完整 reservation 匹配且 Before>0/After==0 的真实事实，自杀不计杀敌；CommitContact 后重复消费不能再次计数。统计入口限定当局 live Participant，跨局来源不能给新局记账。PeakHats 取实际成长/生存状态最大值并持久化。

帽王依据 design §9.3：帽数>=1的有效当前生命，验证 Participant.CurrentLife、代际、正基础生命；并列保留现任，非现任候选顺序以完整 NetEntityId 比较确定。只在 Running/FinalCircle 更新和计时，Warmup/Podium不累计。帽王变动沿真实 journal 发布，不在表现层推断或写第二份状态。

独立执行 `games/101-bomber/.run/statistics-production/artifacts/bin/Lumio.Bomber.Gameplay.Tests/release/Lumio.Bomber.Gameplay.Tests.dll --filter-class '*BomberStatisticsProductionTests' --minimum-expected-tests 6`：6/6、零失败/跳过、exit0，真实官方 Native 随选择发布物载入。证据 `games/101-bomber/.run/chest-journal/statistics-review-01.log/.exit`。这是 Root build-green-04（0 warning/error）的实物，不是独立重建；该 DLL SHA 同目录 `chest-green-01.dll-sha`。

本审查不把六例算作全游戏或新SDK总体通过；仅覆盖当前已生产的健康/技能拾取与炸弹致死，以及既有 Tick 消费时序。后续新增火焰、中毒、狂暴等来源也必须接同一成功事实入口。Root 正在集成 durable 结果和高光，这不在本次范围。
