#!/usr/bin/env python3
"""Detect and remove duplicate BibTeX entries.

Usage:
  scripts/dedup_bib.py main.bib

The script removes exact duplicates (same key or identical content) and
reports near-duplicate candidates for manual review.
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
    entry_type: str
    key: str
    fields: Dict[str, str]
    raw: str
    start: int
    end: int


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
        entry_type = match.group("type")
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
        entries.append(
            Entry(
                entry_type=entry_type,
                key=key.strip(),
                fields=fields,
                raw=raw,
                start=match.start(),
                end=idx,
            )
        )
    return entries


def normalize_value(value: str) -> str:
    value = value.strip().strip("{},\"")
    value = re.sub(r"\s+", " ", value)
    return value.lower()


def canonical(entry: Entry) -> Tuple[str, Tuple[Tuple[str, str], ...]]:
    items = tuple(sorted((k, normalize_value(v)) for k, v in entry.fields.items()))
    return (entry.entry_type.lower(), items)


def build_near_duplicate_candidates(entries: Iterable[Entry]) -> List[Tuple[str, str, float]]:
    items = list(entries)
    results: List[Tuple[str, str, float]] = []

    buckets: Dict[Tuple[str, str], List[Entry]] = {}
    for entry in items:
        title = normalize_value(entry.fields.get("title", ""))
        year = normalize_value(entry.fields.get("year", ""))
        if not title:
            continue
        bucket_key = (year, title[:20])
        buckets.setdefault(bucket_key, []).append(entry)

    for bucket_entries in buckets.values():
        if len(bucket_entries) < 2:
            continue
        for i, left in enumerate(bucket_entries):
            left_text = " ".join(
                filter(
                    None,
                    [
                        normalize_value(left.fields.get("title", "")),
                        normalize_value(left.fields.get("author", "")),
                        normalize_value(left.fields.get("year", "")),
                    ],
                )
            )
            for right in bucket_entries[i + 1 :]:
                right_text = " ".join(
                    filter(
                        None,
                        [
                            normalize_value(right.fields.get("title", "")),
                            normalize_value(right.fields.get("author", "")),
                            normalize_value(right.fields.get("year", "")),
                        ],
                    )
                )
                if not left_text or not right_text:
                    continue
                ratio = difflib.SequenceMatcher(None, left_text, right_text).ratio()
                if ratio >= 0.9:
                    results.append((left.key, right.key, ratio))
    return results


def remove_duplicates(text: str, entries: List[Entry]) -> Tuple[str, List[Entry], List[str]]:
    key_seen: Dict[str, Entry] = {}
    content_seen: Dict[Tuple[str, Tuple[Tuple[str, str], ...]], Entry] = {}
    removed_keys: List[str] = []
    kept_entries: List[Entry] = []

    for entry in entries:
        if entry.key in key_seen:
            removed_keys.append(entry.key)
            continue
        signature = canonical(entry)
        if signature in content_seen:
            removed_keys.append(entry.key)
            continue
        key_seen[entry.key] = entry
        content_seen[signature] = entry
        kept_entries.append(entry)

    kept_ids = {id(entry) for entry in kept_entries}
    output_parts: List[str] = []
    cursor = 0
    for entry in entries:
        output_parts.append(text[cursor:entry.start])
        if id(entry) in kept_ids:
            output_parts.append(text[entry.start:entry.end])
        cursor = entry.end
    output_parts.append(text[cursor:])

    return "".join(output_parts), kept_entries, removed_keys


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: scripts/dedup_bib.py <bibfile>")
        return 1

    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    entries = find_entries(text)
    updated_text, kept_entries, removed_keys = remove_duplicates(text, entries)

    if removed_keys:
        path.write_text(updated_text, encoding="utf-8")
        print("Removed duplicate entries:")
        for key in removed_keys:
            print(f"  - {key}")
    else:
        print("No duplicate entries found.")

    near_dupes = build_near_duplicate_candidates(kept_entries)
    if near_dupes:
        print("\nNear-duplicate candidates (review manually):")
        for left, right, ratio in sorted(near_dupes, key=lambda item: -item[2]):
            print(f"  - {left} <-> {right} (similarity {ratio:.2f})")
    else:
        print("\nNo near-duplicate candidates found.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
