#!/usr/bin/env python3
"""Compute chapter-level TF-IDF terms and render them as LaTeX."""

from __future__ import annotations

import argparse
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path


CHAPTERS = [
    ("Introduction", "chapters/introduction.tex"),
    ("A Brief History of Information Retrieval", "chapters/history.tex"),
    ("ColPali", "chapters/colpali.tex"),
    ("ViDoRe Benchmarks: V2 & V3", "chapters/vidorev3.tex"),
    ("ModernVBERT", "chapters/modernvbert.tex"),
    ("Contextual Document Embeddings", "chapters/conteb.tex"),
    ("CroissantLLM", "chapters/croissant.tex"),
    ("Personal Perspectives on Search", "chapters/conclusion.tex"),
]

# Kept in the script so the computation has no external data dependency.
STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an",
    "and", "any", "are", "aren", "as", "at", "be", "because", "been",
    "before", "being", "below", "between", "both", "but", "by", "can",
    "cannot", "could", "couldn", "d", "did", "didn", "do", "does", "doesn",
    "doing", "don", "down", "during", "each", "few", "for", "from", "further",
    "had", "hadn", "has", "hasn", "have", "haven", "having", "he", "her",
    "here", "hers", "herself", "him", "himself", "his", "how", "i", "if",
    "in", "into", "is", "isn", "it", "its", "itself", "just", "ll", "m",
    "ma", "me", "might", "more", "most", "mustn", "my", "myself", "needn",
    "no", "nor", "not", "now", "o", "of", "off", "on", "once", "only",
    "or", "other", "our", "ours", "ourselves", "out", "over", "own", "re",
    "s", "same", "shan", "she", "should", "shouldn", "so", "some", "such",
    "t", "than", "that", "the", "their", "theirs", "them", "themselves",
    "then", "there", "these", "they", "this", "those", "through", "to",
    "too", "under", "until", "up", "ve", "very", "was", "wasn", "we",
    "were", "weren", "what", "when", "where", "which", "while", "who",
    "whom", "why", "will", "with", "won", "would", "wouldn", "y", "you",
    "your", "yours", "yourself", "yourselves",
    # Frequent prose and LaTeX scaffolding that is not chapter-specific content.
    "al", "also", "et", "fig", "figure", "figures", "section", "sections",
    "table", "tables", "chapter", "chapters", "appendix", "using", "used",
    "black", "blue", "color", "green", "grey", "orange", "purple", "red",
    "white", "yellow",
}

DROP_WITH_ARGUMENT = (
    "cite|sidecite|parencite|textcite|autocite|ref|autoref|cref|Cref|label|"
    "url|href|includegraphics|input|include|bibliography"
)


def strip_latex(source: str) -> str:
    """Remove non-prose LaTeX while retaining text inside formatting commands."""
    source = re.sub(r"(?<!\\)%.*", " ", source)
    source = re.sub(
        rf"\\(?:{DROP_WITH_ARGUMENT})(?:\[[^\]]*\])?\{{[^{{}}]*\}}"
        r"(?:\{[^{}]*\})?",
        " ",
        source,
        flags=re.IGNORECASE,
    )
    source = re.sub(
        r"\\begin\{(?:equation\*?|align\*?|gather\*?|multline\*?|tikzpicture)\}"
        r".*?"
        r"\\end\{(?:equation\*?|align\*?|gather\*?|multline\*?|tikzpicture)\}",
        " ",
        source,
        flags=re.DOTALL,
    )
    source = re.sub(r"\$\$.*?\$\$|\\\[.*?\\\]|\$.*?\$", " ", source, flags=re.DOTALL)
    source = re.sub(r"\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?", " ", source)
    source = source.replace("{", " ").replace("}", " ").replace("~", " ")
    return source


def tokenize(source: str) -> list[str]:
    source = strip_latex(source)
    source = unicodedata.normalize("NFKD", source)
    source = "".join(char for char in source if not unicodedata.combining(char))
    terms = re.findall(r"[A-Za-z][A-Za-z'-]{2,}", source.lower())
    return [
        term.strip("'-")
        for term in terms
        if term.strip("'-") not in STOPWORDS and len(term.strip("'-")) >= 3
    ]


def latex_escape(text: str) -> str:
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in text)


def compute_rankings(root: Path, top_k: int) -> list[tuple[str, list[tuple[str, float]]]]:
    documents: list[list[str]] = []
    for _, relative_path in CHAPTERS:
        source = (root / relative_path).read_text(encoding="utf-8")
        documents.append(tokenize(source))

    counts = [Counter(document) for document in documents]
    document_frequency = Counter(
        term for count in counts for term in count
    )
    number_of_documents = len(documents)

    rankings = []
    for (title, _), document, count in zip(CHAPTERS, documents, counts):
        total_terms = len(document)
        scores = {
            term: (frequency / total_terms)
            * (math.log((1 + number_of_documents) / (1 + document_frequency[term])) + 1)
            for term, frequency in count.items()
        }
        top_terms = sorted(scores.items(), key=lambda item: (-item[1], item[0]))[:top_k]
        rankings.append((title, top_terms))
    return rankings


def render_latex(rankings: list[tuple[str, list[tuple[str, float]]]]) -> str:
    lines = [
        "% Generated by scripts/chapter_tfidf.py; do not edit manually.",
        "",
    ]
    for title, terms in rankings:
        formatted_terms = ", ".join(
            rf"\texttt{{{latex_escape(term)}}}" for term, _ in terms
        )
        lines.extend(
            [
                rf"\section{{{latex_escape(title)}}}",
                formatted_terms + ".",
                "",
            ]
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--top-k", type=int, default=20)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tables/chapter_tfidf_terms.tex"),
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    rankings = compute_rankings(root, args.top_k)
    output = args.output if args.output.is_absolute() else root / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_latex(rankings), encoding="utf-8")

    for title, terms in rankings:
        print(f"{title}: {', '.join(term for term, _ in terms)}")


if __name__ == "__main__":
    main()
