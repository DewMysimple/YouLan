---
type: knowledge
status: active
kind: process
importance: high
updated: 2026-09-03
topic: git-task-delivery
source_logs:
  - "[[日志/2026-09-03-构建工程记忆并修正视角控制]]"
supersedes: null
---

# Git 任务提交约定

## 俗成规定

修改完整的一次任务，就提交并推送。

## 完整任务的判定

- 用户要求的交付物已实现。
- 与风险相称的构建、测试或人工检查已完成。
- 工程记忆已同步并通过 lint。
- 工作树中本任务涉及的文件已核对，不混入无关用户修改。

## Git 收尾

1. 检查本地与 `origin` 的差异并安全同步远端。
2. 一个完整任务原则上创建一个语义明确的提交。
3. 将当前分支推送到 `origin`。
4. 若鉴权、非快进或分支保护导致失败，保留本地提交并向用户说明。
