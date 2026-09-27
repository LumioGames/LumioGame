# LumioGame

<!-- lumio-community:start -->
<div align="center">
<table>
<tr>
<td align="center" width="50%" valign="top">
<a href="https://qm.qq.com/q/PGkXh4tCyQ"><img src="https://raw.githubusercontent.com/LumioGames/.github/main/profile/assets/qr-qq.svg" width="170" alt="QQ 交流群 972220164"></a><br>
<a href="https://qm.qq.com/q/PGkXh4tCyQ"><img src="https://img.shields.io/badge/QQ%20%E4%BA%A4%E6%B5%81%E7%BE%A4-972220164-6171F0?style=for-the-badge&logo=tencentqq&logoColor=white" alt="QQ 交流群 972220164"></a><br>
<sub>什么都能聊</sub>
</td>
<td align="center" width="50%" valign="top">
<a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=b24vf257-5a2b-41ce-935e-bc4ce19dc396"><img src="https://raw.githubusercontent.com/LumioGames/.github/main/profile/assets/qr-game.svg" width="170" alt="LumioGame 开发者社区"></a><br>
<a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=b24vf257-5a2b-41ce-935e-bc4ce19dc396"><img src="https://img.shields.io/badge/%E9%A3%9E%E4%B9%A6%E7%BE%A4-LumioGame%20%E5%BC%80%E5%8F%91%E8%80%85%E7%A4%BE%E5%8C%BA-FFB86B?style=for-the-badge&logoColor=1E2A3A" alt="LumioGame 开发者社区"></a><br>
<sub>飞书话题群 · 玩法、内容、发布</sub>
</td>
</tr>
</table>
<sub>先进群再看代码。其它群和整体介绍见 <a href="https://github.com/LumioGames">LumioGames 主页</a>。</sub>
</div>
<!-- lumio-community:end -->

## 我是什么

Lumio 游戏产品与玩法内容仓，也提供各仓导航和开发检出工具。游戏规则、配置和表现属于游戏；SDK、网络、Runtime 与 Native 实现属于引擎。

## 怎么跑

外部开发从 [LumioSample](https://github.com/LumioGames/LumioSample) 开始：引擎通过只读 `Engine/` 子模块取自 LumioEngineRelease 的正式 tag，SDK 包是其中一部分（ADR-123）。

本仓仍有使用源码依赖的引擎开发与回归工程；按[测试规范](.spec/knowledge/standards/testing.md)准备同级 Runtime、Engine 和 Native，再运行：

```sh
dotnet build LumioGame.sln
dotnet test LumioGame.sln --no-build
```

需要整套源码时运行 `node clone-all.mjs`，权限与参数见脚本帮助。

## 从哪读

- [知识导航](.spec/knowledge/README.md)、[玩法与美术资料](docs/specs/)、[仓库边界](.spec/knowledge/standards/repository-architecture.md)。
- [LumioSample](https://github.com/LumioGames/LumioSample)、[引擎发布物](https://github.com/LumioGames/LumioEngineRelease)。
- 本仓代码的许可见 [LICENSE](LICENSE)；引擎发布物使用其自己的 BUSL-1.1 许可。
- [Lumio-DevKit 帮助手册](https://github.com/LumioGames/Lumio-DevKit)：面向游戏开发者的使用说明与排障入口。
