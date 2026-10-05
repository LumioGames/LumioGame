# 0001 · 玩法数值由源表生成并在启动时绑定

- 日期:2026-09-27
- 状态:生效

## 背景

101 按仓根开工提示词消费 LumioSample 的配表链路。引擎发布物已有 Runtime 配置装载入口；游戏必须把数值来源、双端投影和只读 Reader 对齐，避免帧内读文件或手写第二套配置模型。

## 决策

1. `Gameplay/Tables/{schemas,tables,registry,profiles}` 是玩法数值来源；每项有单位与设计出处。作者工具调用 LumioConfig，生成 `Client/Config/Tables`（C）和 `Server/Config/Tables`（S+V）的 `split-export/1` 投影及只读 Reader。
2. `BomberConfigBinding` 经引擎装载并绑定世界配置；业务帧读取 `World.GameplayConfig`。绑定校验六属性、速度档和世界声明的 Tick 频率，不在帧内访问文件或重新装表。
3. server.json 的 `config_dir` 与 Bot 的配置参数分别指向对应端投影。变体通过 profile 生成，不修改生成 Reader 或导出 JSON。
4. 作者期 LumioConfig 入口沿 Sample；它不构成游戏对 Runtime 同级源码的依赖。运行只消费已生成资产与 Engine 发布物。

## 后果

调数值需要重生投影并重新启动世界。启动失败和表不一致必须明确报错，不能退回源码默认值。配置生成证据与底图、发布物身份一同进入验收记录。
