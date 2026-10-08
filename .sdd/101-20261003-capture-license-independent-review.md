# Capture 许可证跨平台检出独立审查

本窄修通过。Engine提交`8bfe3650f0fee5786bde50ae38e7b4322e343406`只新增路径级`-text`属性和真实检出回归；原许可证blob、供应来源与manifest固定SHA均不变。

Root核对freeze列出的5个实际文件SHA，全部匹配；独立执行测试 **1/1、零失败/跳过、exit0**。测试在临时Git库强制`core.autocrlf=true`和`core.eol=crlf`，从原blob提交，再删除工作副本并真实checkout，逐许可证核对固定SHA；它覆盖Windows自动换行导致原pack失败的触发条件。临时目录在系统临时根下校验后清理。

证据：Engine工作树`.run/101-capture-license/root-source-audit.json`及`root-checkout-01.log/.exit`。作者9项Capture真实Native与生成一致性证据保留，独立审查不将它们替代完整发布包通过；fullpack仍需使用该修复后的实际源码重跑。
