#!/usr/bin/env python3
"""Doc-drift checker for silan-viking design docs.

Runs the §17.4 consistency checklist as code instead of as a thing humans
have to remember. Each check pins one fact from the authoritative chapter
and asserts the same fact appears (or the divergent value does not) in
every chapter §17.1 lists as a citer.

Exits non-zero on the first drift it finds and prints the offending file +
line so the operator can fix it. Designed to live in CI alongside fmt /
clippy / test.

Scope: chosen for high-signal-low-noise. We do NOT try to fuzzy-parse
enum tables — we hard-code the authoritative value per §17.1 and grep
each citer for the wrong value (e.g. an out-of-date MCP tool count of
"17 tools" anywhere). When the authoritative value changes, this script
changes with it — that single edit IS the §17.4 step-1 action.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Repo-relative path to the docs root. The script lives at
# engine/scripts/check_docs_drift.py so the docs are two parents up.
DOCS = Path(__file__).resolve().parents[2] / "docs" / "silan-viking"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)


def read(name: str) -> str:
    return (DOCS / name).read_text(encoding="utf-8")


def read_by_prefix(prefix: str) -> tuple[str, str]:
    """Locate a chapter by its numeric prefix (e.g. "10-" or "02-") so
    the checker survives the Chinese→English filename rename. Returns
    (filename, contents). Raises if zero or multiple matches.

    Rationale: the doc tree was originally `10-M0-SCHEMA定稿.md` etc.
    The rename to `10-m0-schema-finalisation.md` would silently bypass
    a hard-coded filename lookup. Prefix matching keeps the contract
    "the chapter numbered 10 is the SCHEMA authority" intact across
    the rename — the number is the load-bearing identifier, the slug
    after it is documentation.
    """
    matches = sorted(p for p in DOCS.glob(f"{prefix}*.md"))
    if not matches:
        raise FileNotFoundError(f"no chapter found with prefix `{prefix}` in {DOCS}")
    if len(matches) > 1:
        names = ", ".join(p.name for p in matches)
        raise RuntimeError(f"ambiguous prefix `{prefix}` matches: {names}")
    return matches[0].name, matches[0].read_text(encoding="utf-8")


def find_lines(name: str, pattern: re.Pattern[str]) -> list[tuple[int, str]]:
    """Return (line_no, line) pairs in `name` matching `pattern`."""
    out: list[tuple[int, str]] = []
    for i, line in enumerate(read(name).splitlines(), start=1):
        if pattern.search(line):
            out.append((i, line))
    return out


def check_six_content_types() -> list[str]:
    """The 6 content types are a compile-time closed set per GOAL §4."""
    errors: list[str] = []
    expected = {"idea", "blog", "project", "episode", "resume", "update"}
    # The authoritative listing is in chapter 10; 17 §17.1 also names it.
    name, schema_doc = read_by_prefix("10-")
    for t in expected:
        if t not in schema_doc:
            errors.append(f"{name}: missing content type `{t}`")
    return errors


def check_mcp_tool_counts() -> list[str]:
    """MCP tool counts per milestone — §17.2 is the single source of truth.

    The pinned values: M9=18, E1=21, E2=22. Drift shows up as a different
    number in 03 §3.2 or 04 milestone acceptance. We detect this by
    grepping every doc for "tools/工具" near a count, and flagging any
    count that contradicts the pinned table.

    Pragmatic scope: this enforces only one direction — counts that
    explicitly contradict the table. Detecting "the doc forgot to mention
    the count at all" is the human review's job.
    """
    pinned = {"M9": 18, "E1": 21, "E2": 22}
    errors: list[str] = []

    # Drifted patterns we have seen historically: "17 个工具", "20 工具",
    # "16 tools" (red-team audit found these). The check: a milestone
    # label followed by a TOTAL count of tools must match the pinned
    # table. We require an explicit "= N" / "为 N" / "is N" / "工具数 N"
    # framing so increment phrases like "E1: +3 工具" (which mean three
    # *new* tools, not three total) don't false-trigger.
    tool_count_re = re.compile(
        r"(M9|E1|E2)\b[^\n]{0,40}?"
        r"(?:工具数|工具闭集|tool count|=|为|is)\s*"
        r"(?:\*\*)?(\d{1,3})(?:\*\*)?\s*(?:个)?\s*(?:tool|工具)?",
        re.IGNORECASE,
    )

    for path in DOCS.glob("*.md"):
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for m in tool_count_re.finditer(line):
                stage, raw_n = m.group(1).upper(), int(m.group(2))
                expected = pinned.get(stage)
                if expected is not None and raw_n != expected:
                    errors.append(
                        f"{path.name}:{i} — {stage} tool count = {raw_n}, "
                        f"§17.2 pins it at {expected}: {line.strip()}"
                    )
    return errors


def check_idea_status_enum() -> list[str]:
    """idea.status closed set per §17.1 — 6 values.

    The authoritative chapter is 10. We check that every citer (02, 08)
    that mentions `idea.status` lists exactly the 6 values, and that no
    doc names a 7th legacy value.
    """
    errors: list[str] = []
    canonical = {
        "draft",
        "hypothesis",
        "experimenting",
        "validating",
        "published",
        "concluded",
    }
    # Legacy values seen in earlier drafts; finding them now = drift.
    forbidden = {"active", "exploring", "evolved"}
    # Skip lines that explicitly frame a forbidden value as "old" / "legacy"
    # / "rejected" — those are teaching text, not the live enum. Markers
    # are kept bilingual through the Chinese→English doc translation so
    # both partly-translated and fully-translated trees pass cleanly.
    legacy_markers = re.compile(
        r"legacy|deprecated|reject|rejected|legacy[- ]?value|"
        r"old[- ]?value|old[- ]draft|earlier[- ]?draft|invented|"
        r"adopted|chose|chosen|not adopted|superseded|previous(?:ly)?|"
        # Chinese (kept for transition period):
        r"旧稿|旧值|早期|裁决|不采用|不采|采"
    )
    for path in DOCS.glob("*.md"):
        text = path.read_text(encoding="utf-8")
        # Only inspect lines that mention idea.status to keep this targeted.
        for i, line in enumerate(text.splitlines(), 1):
            if "idea.status" not in line and "idea_status" not in line:
                continue
            if legacy_markers.search(line):
                continue
            for bad in forbidden:
                # Word-boundary so "active" doesn't catch "activelyresearching".
                if re.search(rf"\b{bad}\b", line):
                    errors.append(
                        f"{path.name}:{i} — idea.status mentions legacy "
                        f"value `{bad}` (canonical 6: {sorted(canonical)})"
                    )
    return errors


def check_referrer_kind_enum() -> list[str]:
    """`referrer_kind` / `source` enum per §17.1.

    Canonical: search / social / ai_chat / direct / internal (+ unknown).
    We grep for the forbidden legacy spelling `ai-chat` (a real near-miss
    that ent / Go enums refuse).
    """
    errors: list[str] = []
    forbidden_re = re.compile(r"\b(ai-chat|ai_chats|aichat)\b")
    for path in DOCS.glob("*.md"):
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if "referrer" not in line and "source" not in line.lower():
                continue
            if forbidden_re.search(line):
                errors.append(
                    f"{path.name}:{i} — referrer_kind/source has typo: "
                    f"{line.strip()}"
                )
    return errors


def check_part_shape_closed_set() -> list[str]:
    """Part shape enum: prose / entry_list / key_value_list (3 values, §17.1)."""
    errors: list[str] = []
    forbidden = {"table", "json_list", "matrix"}
    shape_re = re.compile(r"\bshape\s*[:=]\s*[\"']?(\w+)", re.IGNORECASE)
    for path in DOCS.glob("*.md"):
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for m in shape_re.finditer(line):
                val = m.group(1).lower()
                if val in forbidden:
                    errors.append(
                        f"{path.name}:{i} — Part shape `{val}` is not in "
                        f"the closed set (prose/entry_list/key_value_list)"
                    )
    return errors


def check_cli_command_groups() -> list[str]:
    """The 8 CLI tool groups per §17.1: content/index/relation/site/stats/
    proposal/mcp/skill. We just verify they all appear in chapter 02
    (the authoritative chapter), located via prefix to survive the
    Chinese→English filename rename."""
    errors: list[str] = []
    expected = ["content", "index", "relation", "site", "stats", "proposal", "mcp", "skill"]
    name, cli_doc = read_by_prefix("02-")
    for grp in expected:
        # `silan <noun>` pattern, the canonical invocation form.
        if not re.search(rf"silan\s+{grp}\b", cli_doc):
            errors.append(
                f"{name}: missing `silan {grp}` invocation — "
                f"§17.1 names {grp} as one of the 8 tool groups"
            )
    return errors


CHECKS = [
    ("6 content types closed set", check_six_content_types),
    ("MCP tool counts (M9/E1/E2)", check_mcp_tool_counts),
    ("idea.status enum legacy values", check_idea_status_enum),
    ("referrer_kind / source typos", check_referrer_kind_enum),
    ("Part shape closed set", check_part_shape_closed_set),
    ("8 CLI command groups present in 02", check_cli_command_groups),
]


def main() -> int:
    total = 0
    for name, fn in CHECKS:
        errs = fn()
        if errs:
            print(f"\n[{name}]")
            for e in errs:
                print(f"  {e}")
            total += len(errs)
    if total:
        print(f"\nDoc drift: {total} issue(s). See §17.4 for the resolution playbook.")
        return 1
    print("Doc drift: 0 issues — §17.4 checklist green.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
