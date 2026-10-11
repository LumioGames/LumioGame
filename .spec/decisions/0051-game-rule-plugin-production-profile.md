# 0051 · 服务器规则插件使用独立 net10.0 生产构建配置

- 日期：2026-10-11
- 状态：生效
- 依据：R-00833 的已批准服务器权威样例与公开 `lumio.game-services.v1` rulePlugin.managed.targetFramework。

## 背景

普通 Gameplay 库的 `GameProductionProject` 面向 net10.0 和 netstandard2.1。新规则插件直接实现 Engine 唯一 `IGameRulePlugin`，该正式合同仅面向 net10.0。将插件伪装成测试工程或另外复制一份兼容合同都会破坏职责和生产检查。

## 决策

增加专用 `GameRulePluginProject=true`，目标仅为 net10.0，继续启用 C# 14、文档生成、生产分析器和警告即错误。项目在 SDK props 导入前声明此标识，让仓根唯一配置生效；不能与 Gameplay 或测试配置组合，不能引用测试包或设置 IsTestProject。

仓根 `Directory.Build.props` 和 `Directory.Build.targets` 是唯一配置及守卫。`eng/game-rule-plugin-profile.test.mjs` 用真实 MSBuild 求值和 ValidateGameBuildProfile 验证合法配置、组合配置、目标、测试包和语言反例。普通 Gameplay 的双目标规则保持原职责。

## 后果

插件依然只消费实际生产 Contracts，不引用 Engine 的测试、夹具或样例。规则宿主及 Native 生命周期由 Server 拥有；插件不形成第二 Host，也不取得正式数据库提交权。样例的真实 Native 集成测试单独接入可信构建环境，不增加 Native 豁免。
