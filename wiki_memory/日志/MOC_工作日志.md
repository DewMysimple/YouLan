---
type: moc
status: active
kind: process
importance: high
updated: 2026-09-03
topic: work-log-index
source_logs: []
supersedes: null
---

# 工作日志 MOC

> 单一工作日志索引，按更新时间倒序。该表由记忆工具生成。

| 时间 | 类型 | 目标 | 状态 | 主题 | 日志 |
| --- | --- | --- | --- | --- | --- |
| 2026-09-03 | maintenance | 将仓库内工程记忆目录统一命名为 `wiki_memory`。 | archived | wiki-memory-directory-name | [[日志/2026-09-03-重命名工程记忆为wiki_memory.md|2026-09-03｜重命名工程记忆为 wiki_memory]] |
| 2026-09-03 | maintenance | 严格保留外部模板中的 `wiki_memory/AGENTS.md` 和 `wiki_memory/llm-wiki.md`。 | archived | wiki-memory-template-completeness | [[日志/2026-09-03-补齐wiki_memory模板文件.md|2026-09-03｜补齐 wiki_memory 模板文件]] |
| 2026-09-03 | bug | 建立 wiki_memory、固化 Git 收尾约定，并修复 OrbitControls 轴向体感。 | archived | viewer-controls-and-project-memory | [[日志/2026-09-03-构建工程记忆并修正视角控制.md|2026-09-03｜构建工程记忆并修正视角控制]] |
| 2026-09-03 | feature | 将用户提供的单网格双材质槽模型接入本地 Vite 查看器，保持两个独立材质控制及现有渲染框架。 | archived | single-mesh-material-slots | [[日志/2026-09-03-替换单网格双材质槽模型.md|2026-09-03｜替换单网格双材质槽模型]] |
| 2026-09-03 | feature | 用户要求结合 Three.js 资料搜索与代码实践，使同一种紫色随实际穿过的切片数逐级加深；过程中追加反馈：白底可见分级，HDRI 背景下不明显。 | archived | slice-color-accumulation-and-hdri-readability | [[日志/2026-09-03-实现切片颜色累积与HDRI分级显色.md|2026-09-03｜实现切片颜色累积与 HDRI 分级显色]] |
| 2026-09-03 | feature | 在现有面板增加可替换 HDRI 与可叠加基础阵列，保持单网格双材质槽和本地 Transmission 框架。 | archived | hdri-settings-and-basic-array | [[日志/2026-09-03-增加HDRI设置与基础阵列.md|2026-09-03｜增加 HDRI 设置与基础阵列]] |

## 使用方式

- 由 `python wiki_memory/工具/memory_lint.py index` 生成或刷新。
- 查询时先阅读当前状态，再按关键词定位日志。

## 入口

- [[README|幽兰工程记忆]]
- [[日志/README|工作日志说明]]
- [[当前状态/项目概览|当前项目概览]]
- [[当前状态/系统架构|当前系统架构]]
