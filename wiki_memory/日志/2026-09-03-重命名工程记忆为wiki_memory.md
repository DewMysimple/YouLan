---
type: log
status: archived
kind: maintenance
importance: medium
updated: 2026-09-03
topic: wiki-memory-directory-name
source_logs:
  - "[[日志/2026-09-03-构建工程记忆并修正视角控制]]"
supersedes: null
---

# 2026-09-03｜重命名工程记忆为 wiki_memory

- 时间：2026-09-03（北京时间）
- 类型：`maintenance`
- 状态：完成
- 目标：将仓库内工程记忆目录统一命名为 `wiki_memory`。
- 日志索引：[[日志/MOC_工作日志|工作日志 MOC]]

## 已确认的决策

- 用户指定记忆目录名称使用 ASCII `wiki_memory`。
- 目录内部的当前状态、决策、知识、日志、模板和工具结构保持不变。

## 检查与操作

- 将原记忆目录下 23 个文件迁移到 `wiki_memory/`。
- 更新根级 `AGENTS.md`、记忆 README、lint 工具、项目概览和日志索引中的目录路径。
- 确认旧目录为空并移除，保留 Git 可追踪的完整重命名历史。

## 文件变更

- 原记忆目录 → `wiki_memory/`。
- 旧日志和本次日志均保留，未删除历史内容。

## 测试与验证

- `python wiki_memory/工具/memory_lint.py index` 成功刷新索引。
- `python wiki_memory/工具/memory_lint.py check` 通过。
- `npm run build` 通过。
- 检索代码和操作入口，未发现旧目录路径引用。

## 待确认长期记忆

- 无；目录命名由用户直接指定，已作为当前项目约定执行。

## 问题、结果与下一步

- 结果：目录和全部引用已统一为 `wiki_memory`。
- 遗留问题：暂无。
- 下一步：按完整任务提交并推送约定交付本次变更。
