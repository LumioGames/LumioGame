# 完整14消费与 schema16 包引用独立复审

裁决：`ACCEPT_EXACT_SCHEMA16_COMPLETE14_PACKAGE_ENVELOPE_WITH_ACTUAL_CONSUMER_IDENTITY_BROWSER_PENDING`。允许 Root 对精确候选模块和包络执行CAS迁移，保留真实体验、Platform签名与正式交付门；本复审没有修改共享模块、pins、ledger或源码，没有构建、输入、浏览器或服务操作。

独立2222项检查通过。候选目录 `.run/candidate14-production-identity-audit-01/package-interface-01`：before module SHA `bc8030a8ba736908e857fff3869d520c3ccd1e6e3dcca02afddedb8745c65991`，candidate module SHA `11fa0f860f8e008c7c83558b5e5bd9a62374b406631d012b580a1f2f4613fa0d`，envelope SHA `41bb0b139e62457a25bc3cb8e62c579b185295947b05fbf1918ae5f5a9e1f909`。JSON逐叶差异精确为 manifest SHA、SDK SHA、LumioClient commit 与 reviewEvidence 四个值；整份模块将候选review常量反拼成原常量后逐byte等于before，包括常量外的逻辑、声明、闭集合及所有guards。68author/52GEN全结构不变，当前真实120文件SHA逐项匹配。V15 SHA `70cc863748a3ba9bf91095208f3ccbba2b1bb80269293bbedb96f79f9dcba44f`，ledger SHA `477baf7f0b4908c2a75d22ac3ca96520e837a940d7440c6d1542a9e6f2341bb8`，开始和结束均不变。

实际完整14 manifest SHA `65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9`，SDK SHA `d7c97107620696669d8657e590d19d085cc2112243783ce48ac2d912bbdb21d0`，Client commit `862f3ed231bdd0d8b9f9e953291222b2e07a67f7`。重新读取完整305 payload逐byte/SHA匹配，磁盘306文件只有manifest额外，无未知文件；8所属仓HEAD与输入commit一致且clean。实际4个Gameplay/Bots/Browser恢复SDK的archive SHA512与assets条目一致，属于完整14，四步build/publish记录真实raw0且原log SHA匹配。

实际5组Gameplay/Bots/Host DLL/PDB GUID重新绑定，612个PDB document全部重读源SHA；610 current physical source与2 actual embedded source分别与原checksum及冻结source相符。22个WebCIL重新读取实际PE metadata，来源DLL byte相等且 metadata SHA/完整span/wasm偏移一致。835 ordinary publish路径、全部字节及冻结副本相符，main SHA `3844b096b3200ce8031d33ffdc837cd1d00f377e7b60e1f046213d054d650a99` 与共享独审过的一行UI修复相同；test SHA `a085e6f3c341104dade81fdd404ed650bb6d5d51a7e208699cb341c6a45a8551`。main/test不在既有120 source/GEN闭集合内，本审查没有新增虚构pin，它们仍由精确独立UI复审及实际835发布消费资格覆盖。

新独立BCL `System.Reflection.Metadata/PEReader` 读取112份不同物理PE，未加载程序集或构建；actual assembly name/version/Lumio references逐项与消费证据匹配并重新计算闭包。仅单独Bots plugin目录仍有5个缺ref，与项目单插件输出约定一致，保留该扫描事实；正式28 Host图加新Game和scenario实际30程序集静态闭包0错配。这是原resolver配方的静态身份验证，不声称执行时Default ALC枚举已测。

原共享默认V16在实际14字节上继续 `v16_package_bytes` 拒绝，消费证据准确记录manifest/SDK/Client三项漂移；未冒称原CLI已通过。仅显式传入本候选包络时，122真实输入通过；逐122 byte mutation全拒绝、extra author member拒绝，未写共享或开门。reviewEvidence完整保留之前链并精确追加现有完整14独审、真实14消费身份和一行UI独审三个引用，实际引用文件SHA全部核对。包引用门通过后仍须单独迁ledger、部署签名与浏览器体验回归，不是联机验收。

证据目录 `.run/candidate14-package-interface-independent-review-01`，`review.mjs`、`read-actual-pe.ps1`、`pe-input-paths.json`、`actual-pe.json`、`pe-read.log/result.json`、`result.json`。result SHA `035189a599b17174c815f25b55636df136f558608c356ec2d3372224febdb9a7`，verdict与2222项检查名、四叶差异和资格边界全保留。
