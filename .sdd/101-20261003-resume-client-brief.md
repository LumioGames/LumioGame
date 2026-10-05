# 浏览器选定配置与完整发布接续

目标：收口浏览器选定配置，实际页面验证选角/表现/Client World共用已验证不可变配置，准备下一官方完整包流程。

先读父仓/101入口和规范、Game账本顶部、.sdd/101-20261002-client-composition-report.md、已有浏览器选定配置计划与.run/browser-selected-config；原client_composition已idle且中断，无活动游戏进程。

写域：Client/Presentation、Client/UI/Spectator、Client/Architecture选定配置，Tools/client-config-host及相关测试，私有完整发布编排；.sdd/101-20261003-resume-client-report.md。Root拥有launcher和M2/地形；capacity拥有Schema/生成。不要同时生成或改他人写域。

- [ ] 读取最新Native-full01/02、publish证据，准确记录失败与未执行，检查未交回源码。
- [ ] 审核选定配置加载前不准入、加载失败/关闭、原始bytes固定、选角/表现/World一致；真实浏览器操作验证。
- [ ] 检查Platform18085实际健康及镜像；/health返回网页不是健康证明。docker命令不在PATH，可查既有脚本路径。不要影响18081/18082/18084服务。
- [ ] 新账号前缀启动独立player06/seed101；启动前核对进程；安全URL交Root浏览器或自行按computer-use技能验证。保存截图/控制台/网络证据，不输出票据。
- [ ] 完成配置接线精确冻结与独审材料。
- [ ] 准备官方下一完整包：Server successor修复在独审完成前不得消费；保留包06与独立NuGet缓存/锁/输出，按manifest/SDK hash识别同version不同字节。Root发整合授权后才重包。

完整目标仍含五角色/效果/音效/响应式实机对照最新批准原型，当前配置检查不能冒充整局通过。禁止覆盖既有成果、原型模拟、本地规则或生成物手改。公共四项裁定仍待查批准。应用TDD/systematic-debugging并回报源码身份、测试total/pass/fail/skip/exit及未执行项。
