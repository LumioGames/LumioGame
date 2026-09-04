# config

> **状态**：骨架（G-0 占位，无业务代码）

## 负责

炸弹人 Stage 0a 的 Config Schema、首轮默认值与 A/B 变体源配表（design.md §7.1/§9.2/§10/§12/§16）；由 G-5 落地。

## 不负责

不做 Content/Scenario/Migration；不做跨产品通用配置层（那是引擎侧 Config Port，见 `docs/specs/engineering/module-scaffolding-design.md` §4.1）。

## 状态所有权

服务器权威消费源配表编译出的 typed snapshot；本模块只产出 Schema + 源配表 + 加载器，不持有运行期状态。

## 依赖方向

只依赖 `System.*`；Stage 0a 不引用 Runtime Config Port（骨架阶段，实现由 G-5 定）。
