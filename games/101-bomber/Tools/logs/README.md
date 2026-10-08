# 运行证据

启动器默认使用游戏根 `.run/launch-*/`；显式指定 evidence 目录时使用该目录。每次运行新建目录，保留脱敏 DS/Bot 日志、发布/配置/底图身份与真实结果。

`verify-evidence.mjs --dir <目录>` 校验新 Bomber 两轮文件接口；只返回接口结果，不授予规则或确定性验收通过。具体 schema 见 [Tools README](../README.md)。进程清理日志不构成通过证据，密码与 admission ticket 不得入库。
