# 101 Resume10 Root 独立合入与验证

限定结论：强宝箱、下一局地图恢复、精确生产预算和历史账本分卷已合入Root并通过独立验证。不是完整Platform/DS对局交付。

## 输入与保护

作者冻结proof SHA256 `9d2ba5e6437bc5018892ab4579c18b147a32c0f62e00a6ecbf14ff0e1360e5ea`，补丁 `8f4523e91de3ef9600a98d99d573a00acc47999955bc1ed6baf6ca428329e134`。Root对470路径逐项核验前后SHA，464路径精确应用，六处保留Root已存在的真实SDK/测试输入修复：ObjectBudgetTests、release-version测试、schema-identities测试、schema-growth测试、schema reader和CLI报告。未改UI、引擎子模块、其他人的文件或发布选择。

可恢复备份、三方输入、冲突原文、合入结果：`games/101-bomber/.run/resume10-root-integration/{before,merge,proposed,manifest.json}`。所有后续路径均相对此目录。

## 源码审查

- 强宝箱由正式圈预告生产，持久stage issued/unavailable记忆约束每阶段一次；位置来自Native稀疏绑定，Original成功才结算发行。三次独立family计数饱和后拒绝不退款/双发，母子共享family，同链不同炸弹分别计数。
- 下一局清理允许强箱占据被缩圈清掉的原硬柱坐标：先实际Dig/解绑、确认Original，再恢复原底图。既有恢复验证同步检查确切旧块、位置和绑定，不忽略外来绑定。
- 奖励严格对应kernel §4：四固定奖励、C开额外等权特殊弹、独立200‰金心；精确最大产出6，对所有可运行legacy配置重算容量703。未把M2/23/27声明当成已支持。
- v9账本按页认证读取，8MiB输入门和独立8MiB紧凑索引门不变；原4490退休行完整保留，新增634旧active行。历史Git页面从同一确切commit取blob，不借工作区或HEAD修复；缺页、重复、外部路径、变动与预算耗尽保持拒绝。

## Root 实际验证

为避免混入旧Runtime，Root用Engine ad810的官方 `defaultBuilders.replica + defaultBuilders.web`，固定Runtime855dab29、Client786aa3e、Voxel2ba61e、NativeCorec93b5c，配官方SDK189b3f包，生成并验证独立browser candidate。SDK包及所有web文件有散列清单。这仍是内部验证候选，不是最终完整release。WASM构建exit0但报告13条既存check-cfg警告，最终上游检查需处理，未记录成零警告。

- Server、Client、Browser gameplay分别独立还原、锁定还原及Release构建：全部exit0，构建各0警告/0错误，`{restore,locked,build}-{server,client,browser}-02.*`。
- 完整Gameplay：**690通过、0失败、0跳过、exit0，2m39.523s**，`gameplay-full-02.log/.exit`。真实Native为SDK原包SHA `3df785ddbf7e4b9486c4f90c5a10f3a3eb88acb40f6ae93be478dec22313c3d9`，build818412fc67ad37f15739daa67d35f574；客户端测试使用本次同SDK Release_client产物。
- 完整Tools：**406通过、0失败、0取消、0跳过、exit0，140.301s**，`tools-all-02.log/.exit`。独立历史fixture路径与SDK物理输入显式指定，不落到旧Engine43。
- 官方生成两端共**98文件**：作者冻结、Root合入后、再次生成三者逐字节一致，`generation-consistency.json`及`generate-{server,client}.log`。

保留的准备失败：Tools01前应用脚本误用了重复工作区路径，导致根本未合入，随后旧源码对SDK08的三项文件入口失败（317项314通过3失败）；不计为Resume10功能RED。修正路径、完成精确合入后才运行Tools02。首轮锁定还原漏传RestorePackagesWithLockFile得到NU1005；补齐同一私有锁设置及Release配置后02通过，未改断言。确切执行脚本为`build-and-test.ps1`，首版保留`build-and-test-01.ps1`。

仍待整体验收：同版本正式Host/DS/Platform/浏览器完整局与下一局、30分钟、多种子回放、五角色与技能/炸弹全矩阵、视觉音效和最终独立审查。周期事实及M2公共契约问题仍保留，不能以本结果替代。
