# 0003 · 引擎只从子模块 Engine/ 的完整发布布局读取

- 日期:2026-09-27
- 状态:生效

## 背景

架构仓 ADR-123 定义 LumioEngineRelease 完整发布物。101 从第一轮起按 Sample 的发布消费方式建立工作区，当前钉 v0.0.1；父仓旧 Bomber 壳的同级 Runtime 编译链随迁移退出本游戏。

## 决策

1. `Lumio.Engine.SDK` 只从 `Engine/sdk/` 解析，版本读 `Engine/manifest.json#version`；`NuGet.config` 限定包来源，SDK解析核对发布物。没有 sibling、global-packages 或 nuget.org 的第二条引擎来源。子模块声明在父仓；初始化从父仓执行 `git submodule update --init --depth 1 games/101-bomber/Engine`。
2. 启动器、旁观页、Bot 场景、Host 用例与压测工具的引擎一半全部取自 `Engine/`（`server/<rid>/`、`bot/<rid>/`、`web/`、`tools/`、`platform/`），指向散落产物的环境变量删除；解析集中在 `Tools/engine-release.mjs` 与 `Server/Tests/EngineRelease.cs`。
3. 生成器与分析器配置由 SDK 包提供，具体边界见 [0002](0002-generated-declarations-owned-by-sdk.md)。
4. 升级引擎只经 `Tools/update-engine.mjs <版本>`：新版自带的 `verify-release.mjs` 通过才切指针。

## 后果

克隆后按 README 安装工具、初始化子模块并验证运行环境。上游改动合入后，用架构仓 `pack-release --from-main` 填 `Engine/` 的同一完整布局再验证；不能混拷 DLL 或单独切换 Runtime 来源。临时发布物不作为普通源码提交，新对外 tag 按用户授权边界另行确认。
