# 0002 · 组件声明生成只由发布 SDK 执行

- 日期:2026-09-27
- 状态:生效

## 背景

101 的组件、实体、输入与属性需要两端一致的声明。父仓原有源码构建方式会引用同级 Runtime；独立游戏工作区按仓根 ADR 0045 必须隔离这条路径。

## 决策

1. 游戏自带 Directory.Build.props/targets、Directory.Packages.props、NuGet.config 和 global.json，阻止继承父仓构建设置。
2. Gameplay 的声明生成由 `Engine/sdk/` 内 Lumio.Engine.SDK 的 props/targets 驱动。server/client 分端生成到 `Gameplay/generated/`；生成的注册与序列化代码随源提交，不能手改。
3. 必需的生成器分析器配置沿 SDK 包定义，不引入同级 Runtime 生成器或复制引擎生成实现。
4. Client/Bots 构建引用客户端 Gameplay 产物，DS 加载服务端产物。两者分别编译并验证，不混拷 DLL。

## 后果

新字段先修改源声明再构建两端。SDK 缺失即失败；底层生成缺口交上游修复并现编完整发布布局。第一轮接口冻结须记录源声明与生成输出身份。
