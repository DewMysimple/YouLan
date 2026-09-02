---
type: knowledge
status: active
kind: process
importance: high
updated: 2026-09-03
topic: memory-entry
source_logs:
  - "[[日志/2026-09-03-构建工程记忆并修正视角控制]]"
supersedes: null
---

# 幽兰工程记忆

本目录保存幽兰 Three.js 模型查看器的可审计工程记忆。根目录 `AGENTS.md` 是程序性协议，代码、配置、Blender 源文件和本地 Three.js 示例仍是最终事实来源。

## 核心入口

- [[当前状态/项目概览|项目概览]]
- [[当前状态/系统架构|系统架构]]
- [[当前状态/当前约束|当前约束]]
- [[当前状态/当前待办|当前待办]]
- [[当前状态/已知问题|已知问题]]
- [[决策/README|工程决策]]
- [[知识/模块/README|模块知识]]
- [[知识/流程/README|流程知识]]
- [[知识/规范/README|工程规范]]
- [[知识/运维/README|运维知识]]
- [[日志/MOC_工作日志|工作日志 MOC]]

## 维护命令

```text
python 工程记忆/工具/memory_lint.py index
python 工程记忆/工具/memory_lint.py check
```
