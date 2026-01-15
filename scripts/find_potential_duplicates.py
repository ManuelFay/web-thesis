#!/usr/bin/env python3
"""List potential duplicate BibTeX entries based on title+author similarity.

Usage:
  scripts/find_potential_duplicates.py main.bib
"""
from __future__ import annotations

import difflib
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

ENTRY_START = re.compile(r"@(?P<type>\w+)\s*([({])", re.MULTILINE)


@dataclass
class Entry:
    key: str
    fields: Dict[str, str]


def split_top_level(text: str) -> List[str]:
    parts: List[str] = []
    buf: List[str] = []
    depth = 0
    in_quotes = False
    escape = False
    for char in text:
        if escape:
            buf.append(char)
            escape = False
            continue
        if char == "\\":
            buf.append(char)
            escape = True
            continue
        if char == '"':
            in_quotes = not in_quotes
        elif not in_quotes:
            if char in "({":
                depth += 1
            elif char in ")}":
                depth = max(depth - 1, 0)
            elif char == "," and depth == 0:
                parts.append("".join(buf))
                buf = []
                continue
        buf.append(char)
    if buf:
        parts.append("".join(buf))
    return parts


def parse_fields(block: str) -> Dict[str, str]:
    fields: Dict[str, str] = {}
    for part in split_top_level(block):
        if "=" not in part:
            continue
        name, value = part.split("=", 1)
        name = name.strip().lower()
        value = value.strip().rstrip(",")
        fields[name] = value
    return fields


def find_entries(text: str) -> List[Entry]:
    entries: List[Entry] = []
    for match in ENTRY_START.finditer(text):
        open_brace = match.group(2)
        close_brace = ")" if open_brace == "(" else "}"
        idx = match.end()
        depth = 1
        while idx < len(text) and depth > 0:
            if text[idx] == open_brace:
                depth += 1
            elif text[idx] == close_brace:
                depth -= 1
            idx += 1
        raw = text[match.start() : idx]
        body = raw[raw.find(open_brace) + 1 : -1]
        if "," not in body:
            continue
        key, rest = body.split(",", 1)
        fields = parse_fields(rest)
        entries.append(Entry(key=key.strip(), fields=fields))
    return entries


def normalize(value: str) -> str:
    value = value.strip().strip("{},\"")
    value = re.sub(r"\s+", " ", value)
    return value.lower()


def build_candidates(entries: Iterable[Entry], threshold: float) -> List[Tuple[str, str, float]]:
    items = list(entries)
    pairs: List[Tuple[str, str, float]] = []

    for i, left in enumerate(items):
        left_title = normalize(left.fields.get("title", ""))
        left_author = normalize(left.fields.get("author", ""))
        if not left_title or not left_author:
            continue
        left_text = f"{left_title} {left_author}"
        for right in items[i + 1 :]:
            right_title = normalize(right.fields.get("title", ""))
            right_author = normalize(right.fields.get("author", ""))
            if not right_title or not right_author:
                continue
            if left_title[:12] != right_title[:12]:
                continue
            right_text = f"{right_title} {right_author}"
            ratio = difflib.SequenceMatcher(None, left_text, right_text).ratio()
            if ratio >= threshold:
                pairs.append((left.key, right.key, ratio))
    return sorted(pairs, key=lambda item: -item[2])


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: scripts/find_potential_duplicates.py <bibfile>")
        return 1

    path = Path(sys.argv[1])
    entries = find_entries(path.read_text(encoding="utf-8"))
    pairs = build_candidates(entries, threshold=0.88)

    if not pairs:
        print("No potential duplicate pairs found.")
        return 0

    print("Potential duplicate pairs (title+author similarity >= 0.88):")
    for left, right, ratio in pairs:
        print(f"{left} <-> {right} ({ratio:.2f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
