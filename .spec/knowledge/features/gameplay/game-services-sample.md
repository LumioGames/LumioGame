---
name: game-services-sample
description: 服务器权威 HTML 样例——纯规则插件、云进度与防重资格；接入或验证游戏服务时查
metadata:
  type: doc
  status: 实施中
---

# 服务器权威 HTML 样例

R-00833 的「林间远征」位于 [`games/game-services-sample/`](../../../../games/game-services-sample/README.md)。浏览器使用普通 HTML、ES modules 与正式 HFSM WASM，服务器使用本仓的纯 C# 规则插件。公共合同与 SDK 由 LumioGameEngine 拥有；认证、状态提交、账本、绑定与榜单由 LumioPlatform 拥有；TLS 与规则宿主生命周期由 LumioServer 拥有。

玩家只能提交开始、领取补给和选择路线的意图。初始状态、三份一次性补给、固定服务器随机机会和挑战成绩由可信规则裁决，最终由平台事务提交。游客与账号使用同一规则；绑定保留奖励、消耗和榜单事件的不可回滚历史。离线试玩只持有页面临时状态，联网后读取正式云状态。

`Gameplay` 使用根 `GameRulePluginProject` 生产 profile，并进入根 solution；不使用双目标 Gameplay 或测试 profile。公开仓 CI 验证生产构建、profile 守卫与纯 HTML 客户端测试。依赖真实 Server 的规则目录测试、TLS/Native 探针及 PostgreSQL/浏览器组合由具备私有源码与正式产物的集成环境运行；缺失必需材料应失败，不记为通过。

完整接入、独立验证、规则与静态包发布、攻击考卷入口见样例 README。HTTP 夹具浏览器探针的证据只覆盖 SDK 接入，不能替代真实平台事务或部署验收。正式 SDK 静态发布包与私有规则制品分开，游戏包不得包含完整服务器状态、随机材料、证书或 Key。
