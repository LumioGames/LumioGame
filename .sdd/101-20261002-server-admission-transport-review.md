# Server admission transport 独立短审

结论：**限定五文件 PASS**，未发现本轮阻断项。没有编辑或构建 Server；读冻结副本并逐个核对当前源仍等于 manifest 后，复制现有测试 exe 独立实际执行。

范围是 `C:/Work/LumioGames/LumioServer-101-composition/.run/101-server-composition/admission-transport-review-01/source` 中 Platform publication_budget、Engine admission_window、admission_publication、clr、clr/admission_arena 五文件。manifest SHA256 `7eb4e3eb0b5af66e504e1b0e85cda07d815b57b66fa3aa1a52cf65235792b3a1`，各文件精确SHA在该 manifest 与独立 proof 中。

- grant先通过同process/connection的预扣window检查，把整个Acquire请求完整写入既有buffer，再原子try_issue；超出长度/序列化失败不发grant，request_written清零，不能派发部分请求。已issue的window马上pin住原bytes，后续覆盖被拒；未知传输或非法UTF8/越界response仍保留原window与预算，重试使用同一请求。竞争window无法再消费同一grant，恢复后的parked owner也不能再次issue。
- window在分配前checked预扣 `2*(request+response)`，覆盖Rust request/response Vec与CLR入口现有请求/响应byte[]；Drop字段顺序先释放实际Vec再退credit。process与connection路径一致，只有足够Rust一份预算会在分配前被拒。本审查没有把这项称为JSON DOM、DTO或全部managed内存上界闭合；源码明确排除那些对象。
- shutdown先把booted设false，但Closing/WorldClosed且原admission budget仍存在时保留原CLR服务口。它不调用ensure_booted，不创建新World；ensure_booted对非Open一律拒绝。原arena/control未知reply先完成，admission_arena_call或awaiting_reply mutation仍在时拒绝插入其它服务调用。Released后服务口拒绝，释放证据仍由原managed registry/Native owner决定。

独立证据：`C:/Work/LumioGames/probe/bomber-terrain-growth-credit-corrective/games/101-bomber/.artifacts/resume-20261002/server-admission-transport-review-01/proof.json`。冻结exe直接执行 admission_window 6/6、admission_publication 13/13、admission_arena 16/16，均0失败、0ignored、exit0；另独立执行Platform publication_budget全类14/14，同样0失败/ignored/exit0（合计49/49）。涵盖失败写入不耗grant、同请求重试/跨owner拒绝、纯managed旧债、关闭后服务继续/最终拒绝、原未知reply优先、关闭后不重启。

Root原全量日志只读核对：closed-debt-port-full-02 Platform50过、Engine315过/1既有realCLR专跑ignore，exit0；closed-debt-port-clippy-01 exit0。独立本轮是Rust窗口/协议/故障注入测试，不能替代真实CLR/Host/Platform全链验收，也未重新认证五文件外的整个组合。
