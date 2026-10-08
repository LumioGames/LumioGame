# Server 整局阻塞修复

目标：消除真实包06八Bot对局第6330Tick后的 successor_reservation_invalid，随后定位首死亡附近Bot1 bad_envelope；所有修复落在所属上游，供独立审查和官方完整重包。

先依次读父仓 .spec/AGENTS.md、.spec/knowledge/README.md；所属Server工作树的入口和规范；Game账本顶部交接断点。原 gameplay_resume 已idle且被中断，没有继续拥有写域。

写域：C:/Work/LumioGames/LumioServer-101-successor-expiry（base161e377，codex/101-successor-expiry），必要的独立Runtime工作树，以及 .sdd/101-20261003-resume-server-report.md 和独立.run证据。禁止改Game玩法与Root账本。

- [ ] 核对分支、差异、旧报告与进程，保护未提交成果。当前Server工作树clean，尚无.run目录；不假定已有RED或修复。
- [ ] 检查真实 .run/product-bots/real-tour09a 的Host/DS/result证据，读取canonical公共契约。不要打印bot日志含票据的命令首行。
- [ ] 通过真实Native/Host证明 applied expire_attachment 后不能普通Entity expiry销毁Participant/继承/排名；保留真实RED、完整异常与原断言。
- [ ] 最小修复、定向与关联回归，记录源码/Native/DLL身份、total/pass/fail/skip/exit。
- [ ] 把首死亡附近 bad_envelope 沿实际数据追到所属源；不能用旧日志猜测修法。
- [ ] 冻结精确diff与源码hash；写独审所需报告和发布输入，返回简短状态。

禁止Game旁路、改契约或放宽拒绝/预算/断言；公共语义四项尚无Owner批准。不要未经Root整合做官方重包；通知Root可审查冻结即可。应用systematic-debugging/TDD。任务完成后报告测试与未执行项，不将整局验收标完成。
