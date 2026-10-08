# 冻结 v14 suite adapter · Root 非作者窄审

2026-10-03。精确 manifest `7304c1abf4d07c598f0a321f33f30b92ab4753d5e267b54a576904c0da453f8a`、helper `40991c9215d970dbcfd3dc3465baeab9deea35807ec8056fde9c262d21694655` 静态接受，限已识别的旧 release 测试派发。构建、13 个保护例、两个实际子进程及正式 portable 安装均 UNRUN。

Root 阅读了完整 helper、两份原 Fact、13 个路径/完整计数保护用例及作者正反补丁证据。两旧文件仅增加入口派发；删去该插入块逐字节还原原件，28 个原断言、所有原 body 和 cap5 数值保留。当前 Game 与旧 reader hash 不同，测试必须真正运行冻结旧源对应的完整旧 Tests；这不是把 cap5 断言更新到52，也不替换主执行器 DLL。旧 Tests 不含 adapter，因此不会递归；已白名单的两类各只有一个原 Fact，wildcard 选择仍必须达到实际 total1/pass1/fail0/skip0/raw0。

helper 验证全部3688 frozen inputs、manifest、113 个 executor 文件的精确集合和原 World/metadata/31 exports。每次复制完整冻结输入到新 GUID 工作副本；原 archive 和副本旧输入前后再次校验，新增 capture 仅在副本中。绝对落点和相对路径分别验证，不接受路径逃逸或链接。明确保留 compatible reader61ffd 与 original capture78b1 的不同身份，不声称后者已找回。

Config 必须是 clean a991a517，tracked 全部输入有前后围栏；Python exe/hash 与3.11.9另验。实际 dotnet/git 路径与哈希记录并校验，子进程使用隔离环境、公共运行入口与新日志，完整计数和退出码任一缺失或冲突均失败。180秒超时会结束实际子进程并留下失败，而非跳过或构造成功。墙钟只用于测试超时/取证。Root 后续实际运行须再次确认复制路径下 RepoRoot 解析、旧 Native 绑定和所有外部依赖。

接受源码进入正式构建与实测。当前 v15 容量/破坏性 restore/paired 场景必须由独立新用例验证，本 adapter 只计作历史旧 release 执行。正式 fixture ZIP/cache/CI 安装还未完成，缺依赖明确失败；不能把本地 .run 档案视作跨机器交付完毕。生产发布证据落 `.run/frozen-v14-suite-root-publication-01/`，不得据本审查宣布正式版交付。
