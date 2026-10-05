# 初始有限 Effect 投影容量独立审查

结论：限定修复范围 SPEC / QUALITY PASS；真实 Game WS 回接仍待新正式组合验证。

对象：Runtime `cdd5b70eb8cd6608a82b0f76c583a9f681d13cd9`，父提交 `94366316`，仅 AdmissionCreationPreparation 与 AdmissionEffectProjectionTests 两文件。逐文件 SHA 与作者 freeze-cdd5b70.json 完全一致。

审查确认：原准入创建在未绑定组件时捕获字段，而 Effect 的 World 局部容量此前只在绑定阶段配置。修复在捕获前调用已有 IEffectProjectionValidation.ConfigureProjection，每个实际投影预付 512 字节空容器元数据；未提前 Bind、分配实体 ID 或启动生命周期。当前唯一实现是 EffectComponent，其空 SyncList 不按容量分配行内容。后续正式绑定配置幂等。

Root 独立运行作者冻结 DLL，四种真实 Native 准入 profile × 两种容量（3、15），8 / 8 成功，0 失败、0 跳过、退出 0。覆盖 Acquire / Reserve / Validate / Commit / Read / ACK / Settlement、准入前计数器与 pending 不变、初始 full 的容量与实际绑定组件一致、正式容器解码接受。独立证据位于 Runtime-101-admission-effect-projection/.run/admission-effect-projection/root-native-review-01.log 和同名 json，后者记录源码、DLL 和 Native 来源。

作者全 Runtime 2930 / 2930、全 TFM 构建零警告错误、生成一致性 127 文件零漂移属于作者证据，未冒充 Root 重跑。全测后仅官方 formatter 规范化测试行尾，随后全 TFM 重建并重跑受影响 8 项。formatter 的既有 workspace-loading 警告保留。

本结论不覆盖正式 Game 首帧、多人整局、稳定性、浏览器表现或最终交付验收。
