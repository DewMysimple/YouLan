#!/usr/bin/env python3
"""检查 wiki_memory Markdown，并重建单一工作日志索引。"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable


ALLOWED_TYPES = {"state", "decision", "knowledge", "log", "moc"}
ALLOWED_STATUSES = {"active", "proposed", "deprecated", "superseded", "archived"}
ALLOWED_KINDS = {
    "feature",
    "ui",
    "bug",
    "discussion",
    "test",
    "maintenance",
    "architecture",
    "process",
    "module",
    "operations",
}
REQUIRED_FIELDS = {"type", "status", "kind", "importance", "updated", "topic"}
MANAGED_DIRS = {"当前状态", "决策", "知识", "日志"}
INDEX_PATH = Path("日志") / "MOC_工作日志.md"


@dataclass
class Page:
    path: Path
    fields: dict[str, object] = field(default_factory=dict)
    body: str = ""

    @property
    def rel(self) -> str:
        return self.path.as_posix()

    @property
    def page_type(self) -> str:
        return str(self.fields.get("type", ""))

    @property
    def status(self) -> str:
        return str(self.fields.get("status", ""))

    @property
    def topic(self) -> str:
        return str(self.fields.get("topic", "")).strip()


def is_managed(path: Path) -> bool:
    return bool(path.parts) and path.parts[0] in MANAGED_DIRS


def is_context_source(path: Path) -> bool:
    return is_managed(path) or (
        len(path.parts) == 1 and path.name in {"README.md", "AGENTS.md", "llm-wiki.md"}
    )


def parse_scalar(raw: str) -> object:
    value = raw.strip()
    if not value:
        return ""
    if value in {"null", "Null", "NULL", "~"}:
        return None
    if (value.startswith('"') and value.endswith('"')) or (
        value.startswith("'") and value.endswith("'")
    ):
        return value[1:-1]
    if value.startswith("[") and value.endswith("]"):
        return [str(parse_scalar(item)) for item in value[1:-1].split(",") if item.strip()]
    return value


def parse_frontmatter(text: str) -> tuple[dict[str, object], str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text

    end = next((index for index in range(1, len(lines)) if lines[index].strip() == "---"), None)
    if end is None:
        return {}, text

    fields: dict[str, object] = {}
    current_list: str | None = None
    for line in lines[1:end]:
        if re.match(r"^\s*-\s+", line) and current_list:
            item = re.sub(r"^\s*-\s+", "", line)
            existing = fields.setdefault(current_list, [])
            if isinstance(existing, list):
                existing.append(parse_scalar(item))
            continue

        match = re.match(r"^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$", line)
        if not match:
            continue
        key, raw = match.groups()
        if raw.strip():
            fields[key] = parse_scalar(raw)
            current_list = None
        else:
            fields[key] = []
            current_list = key

    return fields, "\n".join(lines[end + 1 :])


def load_pages(root: Path) -> list[Page]:
    pages: list[Page] = []
    for path in sorted(root.rglob("*.md")):
        relative = path.relative_to(root)
        if is_context_source(relative):
            fields, body = parse_frontmatter(path.read_text(encoding="utf-8"))
            pages.append(Page(relative, fields, body))
    return pages


def links_in(text: str) -> Iterable[str]:
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"`[^`\n]*`", "", text)
    for match in re.finditer(r"\[\[([^\]]+)\]\]", text):
        target = match.group(1).split("|", 1)[0].strip()
        if target and not target.startswith("http") and not target.endswith("/"):
            yield target.split("#", 1)[0].replace("\\", "/")

    for match in re.finditer(r"\[[^\]]*\]\(([^)]+)\)", text):
        target = match.group(1).strip().strip("<>")
        if target and not re.match(r"^(?:https?|mailto):", target) and not target.endswith("/"):
            yield target.split("#", 1)[0].replace("\\", "/")


def resolve_link(source: Path, target: str) -> Path:
    candidate = Path(target)
    if not target.endswith(".md"):
        candidate = candidate.with_suffix(".md")
    if target.startswith(("当前状态/", "决策/", "知识/", "日志/", "模板/")):
        return candidate
    if target.startswith(("./", "../")):
        return source.parent / candidate
    return candidate


def display_title(page: Page) -> str:
    for line in page.body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return page.path.stem


def validate_pages(pages: list[Page]) -> list[str]:
    errors: list[str] = []
    page_by_path = {page.rel: page for page in pages}

    for page in pages:
        if is_managed(page.path):
            missing = sorted(REQUIRED_FIELDS - page.fields.keys())
            if missing:
                errors.append(f"{page.rel}: missing frontmatter fields: {', '.join(missing)}")

        if page.page_type and page.page_type not in ALLOWED_TYPES:
            errors.append(f"{page.rel}: invalid type '{page.page_type}'")
        if page.status and page.status not in ALLOWED_STATUSES:
            errors.append(f"{page.rel}: invalid status '{page.status}'")
        kind = str(page.fields.get("kind", ""))
        if kind and kind not in ALLOWED_KINDS:
            errors.append(f"{page.rel}: invalid kind '{kind}'")

        for target in links_in(page.body):
            normalized = resolve_link(page.path, target).as_posix().lstrip("./")
            if normalized not in page_by_path and normalized != "README.md":
                errors.append(f"{page.rel}: broken link '{target}'")

    active_topics: dict[tuple[str, str], list[str]] = {}
    for page in pages:
        if page.status == "active" and page.topic and page.page_type in {"state", "decision"}:
            active_topics.setdefault((page.page_type, page.topic), []).append(page.rel)
    for (page_type, topic), paths in active_topics.items():
        if len(paths) > 1:
            errors.append(f"multiple active {page_type} pages for topic '{topic}': {', '.join(paths)}")

    all_text = "\n".join(page.body for page in pages)
    for page in pages:
        if page.page_type == "log" and page.path.name not in {"README.md", "MOC_工作日志.md"}:
            if f"日志/{page.path.name}" not in all_text:
                errors.append(f"{page.rel}: not referenced by the log MOC or another page")

    incoming = {page.rel: 0 for page in pages}
    for page in pages:
        for target in links_in(page.body):
            normalized = resolve_link(page.path, target).as_posix().lstrip("./")
            if normalized in incoming and normalized != page.rel:
                incoming[normalized] += 1
    for page in pages:
        if page.page_type in {"state", "decision", "knowledge", "log"} and incoming[page.rel] == 0:
            errors.append(f"orphan page: {page.rel}")

    return errors


def index_logs(root: Path, pages: list[Page]) -> Path:
    logs = sorted(
        [page for page in pages if page.page_type == "log" and page.path.parts[0] == "日志"],
        key=lambda page: (str(page.fields.get("updated", "")), page.rel),
        reverse=True,
    )
    latest = max((str(page.fields.get("updated", "")) for page in logs), default="2026-09-03")
    lines = [
        "---",
        "type: moc",
        "status: active",
        "kind: process",
        "importance: high",
        f"updated: {latest}",
        "topic: work-log-index",
        "source_logs: []",
        "supersedes: null",
        "---",
        "",
        "# 工作日志 MOC",
        "",
        "> 单一工作日志索引，按更新时间倒序。该表由记忆工具生成。",
        "",
        "| 时间 | 类型 | 目标 | 状态 | 主题 | 日志 |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    if not logs:
        lines.append("| - | - | 暂无记录 | - | - | - |")
    else:
        for page in logs:
            goal = "-"
            for line in page.body.splitlines():
                if re.match(r"^[-*] (目标|本轮目标)：", line):
                    goal = line.split("：", 1)[1].strip().replace("|", "\\|")
                    break
            title = display_title(page).replace("|", "\\|")
            link = f"[[日志/{page.path.name}|{title}]]"
            lines.append(
                f"| {page.fields.get('updated', '-')} | {page.fields.get('kind', '-')} | "
                f"{goal} | {page.status or '-'} | {page.topic or '-'} | {link} |"
            )

    lines.extend(
        [
            "",
            "## 使用方式",
            "",
            "- 由 `python wiki_memory/工具/memory_lint.py index` 生成或刷新。",
            "- 查询时先阅读当前状态，再按关键词定位日志。",
            "",
            "## 入口",
            "",
            "- [[README|幽兰工程记忆]]",
            "- [[日志/README|工作日志说明]]",
            "- [[当前状态/项目概览|当前项目概览]]",
            "- [[当前状态/系统架构|当前系统架构]]",
            "",
        ]
    )
    output = root / INDEX_PATH
    output.write_text("\n".join(lines), encoding="utf-8")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "index"))
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()

    pages = load_pages(root)
    if args.command == "index":
        print(f"已生成日志索引：{index_logs(root, pages)}")
        return 0

    errors = validate_pages(pages)
    if errors:
        print(f"发现 {len(errors)} 个问题：")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"记忆体检通过：检查 {len(pages)} 个 Markdown 页面。")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
