---
type: moc
status: active
kind: process
importance: high
updated: 2026-09-04
topic: work-log-index
source_logs: []
supersedes: null
---

# 工作日志 MOC

> 单一工作日志索引，按更新时间倒序。该表由记忆工具生成。

| 时间 | 类型 | 目标 | 状态 | 主题 | 日志 |
| --- | --- | --- | --- | --- | --- |
| 2026-09-04 | feature | - | archived | infinite-sun-depth-panel | [[日志/2026-09-04-统一纵深面板并增加无限远太阳.md|统一纵深面板并增加无限远太阳]] |
| 2026-09-04 | feature | - | archived | dream-atmosphere-sun-video | [[日志/2026-09-03-分析双视频并实现尽头迎光与动态混色.md|分析双视频并实现尽头迎光与动态混色]] |
| 2026-09-03 | maintenance | 将仓库内工程记忆目录统一命名为 `wiki_memory`。 | archived | wiki-memory-directory-name | [[日志/2026-09-03-重命名工程记忆为wiki_memory.md|2026-09-03｜重命名工程记忆为 wiki_memory]] |
| 2026-09-03 | maintenance | 严格保留外部模板中的 `wiki_memory/AGENTS.md` 和 `wiki_memory/llm-wiki.md`。 | archived | wiki-memory-template-completeness | [[日志/2026-09-03-补齐wiki_memory模板文件.md|2026-09-03｜补齐 wiki_memory 模板文件]] |
| 2026-09-03 | bug | 用户提供五张侧视图片，指出正侧面饱和度不同、顶部多出不与内胆闭合的紫条，要求判断来源并修复。 | archived | embedded-core-closed-projection | [[日志/2026-09-03-统一内胆着色并修正顶部紫色越界.md|2026-09-03｜统一内胆着色并修正顶部紫色越界]] |
| 2026-09-03 | feature | 用户提供三张侧面、顶部转角标注，要求外体和内体的四角有轻微可见的边，改善侧面缺失感，不能成为显眼线框。 | archived | specimen-soft-box-edges | [[日志/2026-09-03-添加外壳与内胆柔和轮廓.md|2026-09-03｜添加外壳与内胆柔和轮廓]] |
| 2026-09-03 | bug | 建立 wiki_memory、固化 Git 收尾约定，并修复 OrbitControls 轴向体感。 | archived | viewer-controls-and-project-memory | [[日志/2026-09-03-构建工程记忆并修正视角控制.md|2026-09-03｜构建工程记忆并修正视角控制]] |
| 2026-09-03 | feature | 替换为用户指定的 `source/Specimen_Frame_Transparent.blend`，根据 Three.js 官方资料添加自发光控制。 | archived | transparent-model-replacement-and-native-emission | [[日志/2026-09-03-替换透明模型并增加原生自发光.md|2026-09-03｜替换透明模型并增加原生自发光]] |
| 2026-09-03 | feature | 将用户提供的单网格双材质槽模型接入本地 Vite 查看器，保持两个独立材质控制及现有渲染框架。 | archived | single-mesh-material-slots | [[日志/2026-09-03-替换单网格双材质槽模型.md|2026-09-03｜替换单网格双材质槽模型]] |
| 2026-09-03 | feature | 用户要求结合 Three.js 资料搜索与代码实践，使同一种紫色随实际穿过的切片数逐级加深；过程中追加反馈：白底可见分级，HDRI 背景下不明显。 | archived | slice-color-accumulation-and-hdri-readability | [[日志/2026-09-03-实现切片颜色累积与HDRI分级显色.md|2026-09-03｜实现切片颜色累积与 HDRI 分级显色]] |
| 2026-09-03 | feature | 在现有面板增加可替换 HDRI 与可叠加基础阵列，保持单网格双材质槽和本地 Transmission 框架。 | archived | hdri-settings-and-basic-array | [[日志/2026-09-03-增加HDRI设置与基础阵列.md|2026-09-03｜增加 HDRI 设置与基础阵列]] |
| 2026-09-03 | feature | 根据 Three.js 官方资料，解决模型内部壁、透射对照、后段颜色饱和和局部光晕问题；交付调好的默认效果，替换用户指定的 Citrus Orchard EXR。 | archived | depth-presentation-shell-and-selective-bloom | [[日志/2026-09-03-修正连续外壳并交付深邃默认效果.md|2026-09-03｜修正连续外壳并交付深邃默认效果]] |
| 2026-09-03 | bug | 用户指出标本框侧面中间像镂空，没有内嵌紫色；要求解决实际显示问题。 | archived | embedded-core-side-transmission | [[日志/2026-09-03-修复侧面内嵌紫色缺失.md|2026-09-03｜修复侧面内嵌紫色缺失]] |

## 使用方式

- 由 `python wiki_memory/工具/memory_lint.py index` 生成或刷新。
- 查询时先阅读当前状态，再按关键词定位日志。

## 入口

- [[README|幽兰工程记忆]]
- [[日志/README|工作日志说明]]
- [[当前状态/项目概览|当前项目概览]]
- [[当前状态/系统架构|当前系统架构]]
