# Schema v12 与特殊炸弹接续

目标：收口被中断的Schema v12迁移，继续真实Remote、Fire、Split及综合容量交付。

先读父仓/101 AGENTS与导航、测试/架构规范，.sdd/101-20261003-special-bombs-execution.md 与Game账本顶部。原capacity_resume已idle且中断；实际最新源码优先。

写域：Game schema及生成身份历史、Tools schema工具、炸弹Ability/状态/特殊形态与专项测试；.sdd/101-20261003-resume-capacity-report.md、独立.run。Root拥有M2生产者与地形；Client代理拥有浏览器与上游完整打包。共享BombSystem和配置Loader修改前必须报具体文件与段落，协调写入，生成窗口须通知Root。

- [ ] 核对v12实际未提交成果、schema报告/冻结。旧Pascal墓碑、全部27页与所有历史必须原样保留；固定8MiB不能提高。
- [ ] 完成生成一致性、完整历史/负例/CLI回归及精确冻结，先通知Root。
- [ ] Remote显式配置准入已允许但默认disabled。真实GAS输入6/7：短按/长按、引爆、8000ms超时、换槽、取消、缺Held、死亡重生、旧Life/Match、外来炸弹与库存。
- [ ] 完成Fire和Split的批准规则与Native/HFSM/Effect真实RED→GREEN；先读design与ADR0047/0048，不自行改玩法。
- [ ] 普通total capacity冻结原包04，不能说成06；继续Split预留子弹、桶与狂暴综合生产者容量，与Root协调公开接口。
- [ ] 不解除M2/Fire/Split正式守卫直到实现和容量证明完整；生成物只能官方生成。

消费包06并为新构建使用独立缓存/锁/输出，manifest 8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4。只读旧.run证据，不覆盖日志。禁止reset/clean/一概暂存。应用TDD与systematic-debugging；独审由Root安排，不作全局完成声明。
