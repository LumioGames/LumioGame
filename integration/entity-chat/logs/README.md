# entity-chat 收口日志目录

证据 = 服务器进程日志 + 客户端进程日志（ADR-057 第 3 条）。没有独立证据包。oracle 只读这两个目录，不读 harness 合成的 `evidence.json` / `timer-trace.json`。

## 目录名

每次收口一个目录：

```text
integration/entity-chat/logs/<YYYY-MM-DD>-<arch>-<runtime>-<server>-<client>-<game>-<nativecore>/
```

各仓字段为短 SHA（建议 8 位小写 hex），日期为收口日（UTC 日历日）。

本目录只放收口日志。oracle 单测用的最小样本是 **fixture**（见 `integration/entity-chat/fixtures/`），不是收口目录，不得放进这里冒充 live 证据。

## 一轮内部布局

```text
<dir>/
  round-1/
    server/*.ndjson
    client/*.ndjson
  round-2/
    server/*.ndjson
    client/*.ndjson
```

也接受 `round-N/server.ndjson` 与 `round-N/client.ndjson` 单文件。编码 UTF-8；行尾 CR LF 或 LF 均可（解析按行拆，oracle 自校验 sha 先把 `\r\n` 归一成 `\n`）。

## 判定

```bash
node integration/entity-chat/verify-evidence.mjs --dir integration/entity-chat/logs/<目录>
```

`compareRuns` 对 `eventOrder` 四元组 `(messageId, roomSequence, senderNetEntityId, appliedTick)` 与 `appliedTicks` 逐值逐位比较。sender 为 32-hex，或 `senderNetEntityIdInstanceId` + `senderNetEntityIdCounter` 两段 u64。

字段约定见 R-00390 交回物「五」（R-00388 / R-00389 未交回前的 ADR-057 第 3 条最小集）。
