# 101 浏览器握手额度修复

实际 RED：官方完整包06 / 同 seed101 skills-off / 同已批准选定客户端配置，真实浏览器两次选择泡泡鸭开始均 `failed`、`MONO_WASM WebSocket error`；DS同时7个Bot正常提交Tick。`browser-entry-failed01`保留首截图和日志。

根因证据：Game `.run/browser-selected-config/resume-20261003/browser-upgrade-size-probe.ndjson` 的真实客户端连接经无修改TCP透传至同DS；只记录长度与header名字，不存凭据、cookie或原始请求。actual header=1059bytes、credential=387bytes。原DS config `unauthenticated_quota_bytes=1024`；Server `Network/src/wire.rs` AdmissionQuotaStream在HTTP解析/验票前超限直接断开，故没有该连接admit日志。独立无凭据浏览器DS请求则真实到达并写`upgrade_credential_missing`，同源WebSocket收到ping，排除浏览器完全不能连接。

实现范围只改Game authored `Server/Config/Startup/server.json`的一项既有可配置额度为32768bytes。官方Browser factory允许最多16384byte opaque credential，留出同样有界HTTP header空间。1024 sockets的准入前总byte ceiling由1MiB升为32MiB；32次/秒限流、5000ms握手超时、既有验票/身份/协议规则保持原值。此字段是Server公开可配置容量，不改公共契约或验票。

验证：独立新startup模板继承实际32KiB值，冻结server gameplay和browser publish不变；同官方包06、Platform18085、选定seed101/skills-off配置，真实浏览器选择角色并开始，保存页面、控制台、DS admit和真实首帧。此前输入目录错误player06b/06c为BLOCKED_ENV exit2，日志保留，不计业务RED或运行。成功入局仍不等于整局/下一局/最终交付。
