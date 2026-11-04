"""Per-task file storage with path-traversal protection, plus CSV / XLSX / PDF writers."""
from __future__ import annotations

import csv
import io
import re
from pathlib import Path
from xml.sax.saxutils import escape

from ..util import safe_name


class FileStore:
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def dir(self, user_id: str, task_id: str) -> Path:
        p = (self.root / safe_name(user_id) / safe_name(task_id)).resolve()
        if self.root not in p.parents:
            raise PermissionError("bad path")
        p.mkdir(parents=True, exist_ok=True)
        return p

    def save(self, user_id: str, task_id: str, name: str, data: bytes) -> int:
        path = self.dir(user_id, task_id) / safe_name(name)
        path.write_bytes(data)
        return len(data)

    def path(self, user_id: str, task_id: str, name: str) -> Path | None:
        p = self.dir(user_id, task_id) / safe_name(name)
        return p if p.is_file() else None

    def remove_task(self, user_id: str, task_id: str) -> None:
        import shutil

        shutil.rmtree(self.dir(user_id, task_id), ignore_errors=True)


def to_csv(columns: list[str], rows: list[list]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(columns)
    for r in rows:
        w.writerow([_csv_safe(c) for c in r])
    return buf.getvalue().encode()


def _csv_safe(v):
    """Neutralise spreadsheet formula injection from web-sourced text."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def to_xlsx(sheets: dict[str, tuple[list[str], list[list]]]) -> bytes | None:
    try:
        from openpyxl import Workbook
    except ImportError:
        return None
    wb = Workbook()
    wb.remove(wb.active)
    for name, (cols, rows) in sheets.items():
        ws = wb.create_sheet(name[:31])
        ws.append(cols)
        for r in rows:
            ws.append([_csv_safe(c) for c in r])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


_BOLD = re.compile(r"\*\*(.+?)\*\*")
_CITE = re.compile(r"\[(E\d+)\]")


def _inline(text: str) -> str:
    t = escape(text)
    t = _BOLD.sub(r"<b>\1</b>", t)
    return _CITE.sub(r'<font color="#4d7c0f" size="8">[\1]</font>', t)


def markdown_to_pdf(md: str, title: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer

    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=10, leading=14.5, spaceAfter=6)
    h1 = ParagraphStyle("h1", parent=ss["Heading1"], fontSize=20, leading=24, spaceAfter=10)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontSize=13.5, leading=17, spaceBefore=12, spaceAfter=5)
    flow, bullets = [], []

    def flush():
        nonlocal bullets
        if bullets:
            flow.append(ListFlowable([ListItem(Paragraph(_inline(b), body)) for b in bullets], bulletType="bullet", leftIndent=14))
            bullets = []

    for line in md.splitlines():
        s = line.rstrip()
        if s.startswith("- ") or s.startswith("* "):
            bullets.append(s[2:])
            continue
        flush()
        if not s.strip():
            flow.append(Spacer(1, 3))
        elif s.startswith("# "):
            flow.append(Paragraph(_inline(s[2:]), h1))
        elif s.startswith("## ") or s.startswith("### "):
            flow.append(Paragraph(_inline(s.lstrip("#").strip()), h2))
        elif s.startswith("> "):
            flow.append(Paragraph("<i>" + _inline(s[2:]) + "</i>", body))
        else:
            flow.append(Paragraph(_inline(s), body))
    flush()
    out = io.BytesIO()
    SimpleDocTemplate(out, pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm, topMargin=20 * mm, bottomMargin=20 * mm, title=title, author="AgentX").build(flow)
    return out.getvalue()
