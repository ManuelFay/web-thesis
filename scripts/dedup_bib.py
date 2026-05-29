#!/usr/bin/env python3
"""Find and optionally merge duplicate BibTeX entries.

The script detects exact and fuzzy duplicate records, chooses the richest entry
to keep, rewrites LaTeX citation keys to the kept key, and removes redundant
BibTeX entries when run with --apply.

Usage:
  scripts/dedup_bib.py main.bib
  scripts/dedup_bib.py --apply main.bib --tex-root .
"""
from __future__ import annotations

import argparse
import difflib
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple


ENTRY_START = re.compile(r"@(?P<type>\w+)\s*([({])", re.MULTILINE)
CITE_COMMAND = re.compile(r"\\[A-Za-z]*cite[A-Za-z]*\*?(?:\s*\[[^\]]*\])*\s*\{([^{}]+)\}")
LATEX_ACCENTS = [
    (re.compile(r"\\['`^\"~=.uvH]\s*\{?([A-Za-z])\}?"), r"\1"),
    (re.compile(r"\\[cC]\s*\{?([A-Za-z])\}?"), r"\1"),
    (re.compile(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?"), r" \1 "),
]
WORD = re.compile(r"[a-z0-9]+")
ARXIV_ID = re.compile(r"(?:arxiv[:/ ]*|abs/)(\d{4}\.\d{4,5})(?:v\d+)?", re.IGNORECASE)


@dataclass(frozen=True)
class Entry:
    entry_type: str
    key: str
    fields: Dict[str, str]
    raw: str
    start: int
    end: int
    index: int


class UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))

    def find(self, item: int) -> int:
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, left: int, right: int) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root


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
        fields[name.strip().lower()] = value.strip().rstrip(",")
    return fields


def find_entries(text: str) -> List[Entry]:
    entries: List[Entry] = []
    for index, match in enumerate(ENTRY_START.finditer(text)):
        entry_type = match.group("type")
        open_brace = match.group(2)
        close_brace = ")" if open_brace == "(" else "}"
        idx = match.end()
        depth = 1
        in_quotes = False
        escape = False
        while idx < len(text) and depth > 0:
            char = text[idx]
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_quotes = not in_quotes
            elif not in_quotes:
                if char == open_brace:
                    depth += 1
                elif char == close_brace:
                    depth -= 1
            idx += 1
        raw = text[match.start() : idx]
        body = raw[raw.find(open_brace) + 1 : -1]
        if "," not in body:
            continue
        key, rest = body.split(",", 1)
        entries.append(
            Entry(
                entry_type=entry_type,
                key=key.strip(),
                fields=parse_fields(rest),
                raw=raw,
                start=match.start(),
                end=idx,
                index=index,
            )
        )
    return entries


def strip_bib_value(value: str) -> str:
    value = value.strip().strip(",")
    while len(value) >= 2 and ((value[0], value[-1]) in [("{", "}"), ('"', '"')]):
        value = value[1:-1].strip()
    return value


def normalize_text(value: str) -> str:
    value = strip_bib_value(value)
    for pattern, repl in LATEX_ACCENTS:
        value = pattern.sub(repl, value)
    value = value.replace("{", "").replace("}", "")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(WORD.findall(value.lower()))


def token_set(value: str) -> set[str]:
    return set(normalize_text(value).split())


def title(entry: Entry) -> str:
    return normalize_text(entry.fields.get("title", ""))


def year(entry: Entry) -> str:
    return normalize_text(entry.fields.get("year", ""))


def author_last_names(entry: Entry) -> set[str]:
    raw = entry.fields.get("author") or entry.fields.get("editor") or ""
    names = re.split(r"\s+and\s+", strip_bib_value(raw), flags=re.IGNORECASE)
    last_names: set[str] = set()
    for name in names:
        normalized = normalize_text(name)
        if not normalized:
            continue
        pieces = normalized.split()
        if "," in name:
            last_names.add(pieces[0])
        else:
            last_names.add(pieces[-1])
    return last_names


def doi(entry: Entry) -> str:
    return normalize_text(entry.fields.get("doi", "")).replace(" ", "")


def arxiv_id(entry: Entry) -> str:
    candidates = [
        strip_bib_value(entry.fields.get("eprint", "")),
        strip_bib_value(entry.fields.get("url", "")),
        strip_bib_value(entry.fields.get("doi", "")),
        strip_bib_value(entry.fields.get("journal", "")),
    ]
    for candidate in candidates:
        match = ARXIV_ID.search(candidate)
        if match:
            return match.group(1)
    return ""


def title_similarity(left: Entry, right: Entry) -> float:
    return difflib.SequenceMatcher(None, title(left), title(right)).ratio()


def author_overlap(left: Entry, right: Entry) -> float:
    left_authors = author_last_names(left)
    right_authors = author_last_names(right)
    if not left_authors or not right_authors:
        return 0.0
    return len(left_authors & right_authors) / min(len(left_authors), len(right_authors))


def duplicate_reason(left: Entry, right: Entry, threshold: float) -> str | None:
    if left.key == right.key:
        return "same key"
    left_doi = doi(left)
    right_doi = doi(right)
    if left_doi and left_doi == right_doi:
        return f"same DOI {left_doi}"
    left_arxiv = arxiv_id(left)
    right_arxiv = arxiv_id(right)
    if (
        left_arxiv
        and left_arxiv == right_arxiv
        and (title_similarity(left, right) >= 0.75 or author_overlap(left, right) >= 0.5)
    ):
        return f"same arXiv ID {left_arxiv}"

    left_title = title(left)
    right_title = title(right)
    if not left_title or not right_title:
        return None
    left_year = year(left)
    right_year = year(right)
    same_year = bool(left_year and right_year and left_year == right_year)
    similar_title = title_similarity(left, right)
    overlap = author_overlap(left, right)
    if same_year and similar_title >= threshold and overlap >= 0.5:
        return f"title {similar_title:.2f}, author overlap {overlap:.2f}, year {left_year}"

    left_tokens = token_set(left.fields.get("title", ""))
    right_tokens = token_set(right.fields.get("title", ""))
    if same_year and left_tokens and right_tokens:
        jaccard = len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
        if jaccard >= 0.9 and overlap >= 0.5:
            return f"title tokens {jaccard:.2f}, author overlap {overlap:.2f}, year {left_year}"
    return None


def field_score(entry: Entry) -> int:
    score = len(entry.fields)
    journal = normalize_text(entry.fields.get("journal", ""))
    for field, weight in {
        "doi": 10,
        "booktitle": 8,
        "eprint": 8,
        "archiveprefix": 2,
        "primaryclass": 1,
        "journal": 0 if "arxiv preprint" in journal else 7,
        "publisher": 5,
        "pages": 4,
        "url": 3,
        "abstract": 2,
        "urldate": 2,
    }.items():
        if entry.fields.get(field):
            score += weight
    type_bonus = {"inproceedings": 12, "article": 5, "incollection": 4, "misc": 0}.get(
        entry.entry_type.lower(), 1
    )
    if entry.entry_type.lower() == "article" and "arxiv preprint" in journal:
        type_bonus = 0
    score += type_bonus
    return score


def choose_keeper(cluster: Sequence[Entry], citation_counts: Dict[str, int]) -> Entry:
    return max(
        cluster,
        key=lambda entry: (
            field_score(entry),
            citation_counts.get(entry.key, 0),
            -entry.index,
        ),
    )


def build_clusters(entries: Sequence[Entry], threshold: float) -> Tuple[List[List[Entry]], Dict[Tuple[str, str], str]]:
    uf = UnionFind(len(entries))
    reasons: Dict[Tuple[str, str], str] = {}

    buckets: Dict[Tuple[str, str], set[int]] = {}
    for i, entry in enumerate(entries):
        buckets.setdefault(("key", entry.key), set()).add(i)

        entry_doi = doi(entry)
        if entry_doi:
            buckets.setdefault(("doi", entry_doi), set()).add(i)

        entry_arxiv = arxiv_id(entry)
        if entry_arxiv:
            buckets.setdefault(("arxiv", entry_arxiv), set()).add(i)

        entry_title = title(entry)
        entry_year = year(entry)
        if entry_title:
            buckets.setdefault(("title-year", f"{entry_year}:{entry_title}"), set()).add(i)
            buckets.setdefault(("prefix-year", f"{entry_year}:{entry_title[:24]}"), set()).add(i)
            words = entry_title.split()
            if words:
                buckets.setdefault(("first-word-year", f"{entry_year}:{words[0]}"), set()).add(i)

    candidate_pairs: set[Tuple[int, int]] = set()
    for bucket in buckets.values():
        if len(bucket) < 2:
            continue
        ordered = sorted(bucket)
        for pos, i in enumerate(ordered):
            for j in ordered[pos + 1 :]:
                candidate_pairs.add((i, j))

    for i, j in sorted(candidate_pairs):
        left = entries[i]
        right = entries[j]
        reason = duplicate_reason(left, right, threshold)
        if reason:
            uf.union(i, j)
            reasons[(left.key, right.key)] = reason

    by_root: Dict[int, List[Entry]] = {}
    for i, entry in enumerate(entries):
        by_root.setdefault(uf.find(i), []).append(entry)
    return [cluster for cluster in by_root.values() if len(cluster) > 1], reasons


def tex_files(root: Path) -> List[Path]:
    ignored = {".git", "build", "venv"}
    return [
        path
        for path in root.rglob("*.tex")
        if not any(part in ignored for part in path.parts)
    ]


def citation_counts(paths: Iterable[Path]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for path in paths:
        text = path.read_text(encoding="utf-8")
        for match in CITE_COMMAND.finditer(text):
            for key in match.group(1).split(","):
                key = key.strip()
                if key:
                    counts[key] = counts.get(key, 0) + 1
    return counts


def rewrite_citations(text: str, replacements: Dict[str, str]) -> Tuple[str, int]:
    changes = 0

    def replace_match(match: re.Match[str]) -> str:
        nonlocal changes
        keys = [key.strip() for key in match.group(1).split(",")]
        updated = [replacements.get(key, key) for key in keys]
        if updated != keys:
            changes += sum(1 for before, after in zip(keys, updated) if before != after)
        return match.group(0)[: match.start(1) - match.start(0)] + ", ".join(updated) + match.group(0)[match.end(1) - match.start(0) :]

    return CITE_COMMAND.sub(replace_match, text), changes


def remove_entries(text: str, entries: Sequence[Entry], remove_keys: set[str]) -> str:
    output: List[str] = []
    cursor = 0
    for entry in entries:
        output.append(text[cursor:entry.start])
        if entry.key not in remove_keys:
            output.append(text[entry.start:entry.end])
        cursor = entry.end
    output.append(text[cursor:])
    return "".join(output)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bibfile", type=Path)
    parser.add_argument("--tex-root", type=Path, default=Path("."))
    parser.add_argument("--threshold", type=float, default=0.93)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    bib_text = args.bibfile.read_text(encoding="utf-8")
    entries = find_entries(bib_text)
    tex_paths = tex_files(args.tex_root)
    counts = citation_counts(tex_paths)
    clusters, reasons = build_clusters(entries, args.threshold)

    if not clusters:
        print("No duplicate or fuzzy-duplicate clusters found.")
        return 0

    replacements: Dict[str, str] = {}
    remove_keys: set[str] = set()
    print("Duplicate clusters:")
    for cluster in clusters:
        keeper = choose_keeper(cluster, counts)
        print(f"- keep {keeper.key} ({keeper.entry_type}, score {field_score(keeper)})")
        for entry in sorted(cluster, key=lambda item: item.index):
            marker = "keep" if entry.key == keeper.key else "drop"
            print(
                f"    {marker:4} {entry.key:45} "
                f"{entry.entry_type:14} year={year(entry) or '?'} "
                f"cites={counts.get(entry.key, 0)} title={title(entry)[:80]}"
            )
        for left in cluster:
            for right in cluster:
                if left.index < right.index:
                    reason = reasons.get((left.key, right.key))
                    if reason:
                        print(f"      reason: {left.key} <-> {right.key}: {reason}")
        for entry in cluster:
            if entry.key != keeper.key:
                replacements[entry.key] = keeper.key
                remove_keys.add(entry.key)

    print(f"\nPlanned removals: {len(remove_keys)}")
    print(f"Planned citation replacements: {len(replacements)}")

    if not args.apply:
        print("\nDry run only. Re-run with --apply to edit files.")
        return 0

    args.bibfile.write_text(remove_entries(bib_text, entries, remove_keys), encoding="utf-8")

    changed_files = 0
    changed_cites = 0
    for path in tex_paths:
        text = path.read_text(encoding="utf-8")
        updated, changes = rewrite_citations(text, replacements)
        if changes:
            path.write_text(updated, encoding="utf-8")
            changed_files += 1
            changed_cites += changes

    print(f"\nRemoved {len(remove_keys)} entries from {args.bibfile}.")
    print(f"Rewrote {changed_cites} citations across {changed_files} .tex files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
