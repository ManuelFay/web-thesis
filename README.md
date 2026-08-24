# Document Retrieval Beyond Text Embeddings

Source repository for Manuel Faysse's doctoral thesis, **Document Retrieval
Beyond Text Embeddings**, prepared at Université Paris-Saclay.

The thesis studies modern information retrieval, with an emphasis on visual
document retrieval, contextual document representations, language models, and
agentic search. The document is written in LaTeX and uses a locally modified
version of the [`kaobook`](https://github.com/fmarotta/kaobook) class.

The repository was originally forked from the `kaobook` project. Information
about the template, its upstream authors, and the inherited class files has
been moved to [`docs/KAOBOOK.md`](docs/KAOBOOK.md).

## Compile with Docker

Docker is the recommended build method. It provides the complete TeX Live
environment used by the project and avoids requiring a local LaTeX
installation.

From the repository root, run:

```bash
mkdir -p dist
DOCKER_BUILDKIT=1 docker build \
  --output type=local,dest=dist \
  .
```

The compiled thesis will be written to:

```text
dist/Thesis.pdf
```

The first build downloads and installs `texlive-full`, so it can take some
time and requires several gigabytes of disk space. Docker will cache these
layers for subsequent builds.

To force a clean rebuild:

```bash
DOCKER_BUILDKIT=1 docker build \
  --no-cache \
  --output type=local,dest=dist \
  .
```

The Docker build runs:

```bash
latexmk -pdf -interaction=nonstopmode -halt-on-error -outdir=build main.tex
```

`latexmk` automatically performs the additional LaTeX and Biber passes needed
to resolve the bibliography, references, table of contents, and lists of
figures and tables.

## Local Compilation

A local build requires a sufficiently complete TeX Live installation,
including `latexmk` and `biber`. The project currently targets PDFLaTeX.

```bash
mkdir -p build/chapters
latexmk -pdf -interaction=nonstopmode -halt-on-error -outdir=build main.tex
```

The result is `build/main.pdf`.

To remove generated files:

```bash
latexmk -C -outdir=build main.tex
```

The root-level `compileall.sh` is an older manual compilation helper. The
Docker/`latexmk` workflow above is the canonical build path.

## Repository Structure

```text
.
├── main.tex                 # Thesis entry point and chapter selection
├── main.bib                 # Bibliography database
├── chapters/                # Thesis chapters and appendices
├── images/                  # Figures, grouped by thesis contribution
├── tables/                  # Reusable LaTeX table fragments
├── Dockerfile               # Reproducible TeX Live build
├── .github/workflows/       # Continuous-integration PDF build
├── scripts/                 # Bibliography maintenance utilities
├── kaobook.cls              # Locally included kaobook document class
├── kao.sty                  # Shared kaobook definitions
├── kaobiblio.sty            # Bibliography and citation styling
├── kaorefs.sty              # Cross-reference commands
├── kaotheorems.sty          # Theorem styling
└── docs/KAOBOOK.md          # Template attribution and upstream information
```

### Thesis Sources

`main.tex` defines the document metadata, loads the packages and bibliography,
and controls which chapters are compiled. The primary prose and research
chapters live in `chapters/`.

The current draft directly includes:

- `chapters/introduction.tex`
- `chapters/history.tex`
- `chapters/conclusion.tex`

The research chapters and appendices are also present in `chapters/`, including
the sources for ColPali, ViDoRe, ModernVBERT, contextual embeddings, and
CroissantLLM. Their `\include{...}` lines in `main.tex` can be uncommented when
they should be part of the compiled document.

When enabling a chapter, use a path relative to the repository root:

```latex
\include{chapters/colpali}
```

### Bibliography

All references are stored in `main.bib` and loaded from `main.tex` through
`biblatex`/Biber. Citation commands include `\cite`, `\sidecite`, and
`\fullcite`.

Bibliography maintenance scripts are available in `scripts/`:

- `scripts/dedup_bib.py`
- `scripts/find_potential_duplicates.py`

`history_citation_verification.md` tracks manual verification work for
citations used in the history chapter.

### Figures and Tables

Figures are stored under `images/`, generally grouped by chapter or project.
Reusable table fragments are stored under `tables/` and included from chapter
sources with `\input{...}`.

## Continuous Integration and Deployment

Pushes to `main` trigger `.github/workflows/compile.yaml`. The workflow compiles
the thesis PDF, builds and validates the Astro website and Pagefind index,
embeds the freshly compiled PDF in the website, and deploys `dist-web/` to
GitHub Pages. It can also be started manually from the Actions tab. The PDF at
`https://manuelfay.github.io/web-thesis/Thesis.pdf` is replaced by each
successful deployment, so only the latest published version is retained.

For push-triggered builds, the workflow fingerprints the tracked LaTeX,
bibliography, class, style, table, and image sources. When that fingerprint
matches the version published on GitHub Pages, it reuses the published PDF and
skips installing TeX Live and recompiling the thesis. A missing or different
fingerprint falls back to a full PDF build. Manually dispatched workflows always
compile the PDF, which provides an explicit way to force a fresh build.

The project-site URL is:

```text
https://manuelfay.github.io/web-thesis/
```

Before the first deployment, open the repository's **Settings → Pages** and set
**Build and deployment → Source** to **GitHub Actions**. No `gh-pages` branch is
used; GitHub's Pages artifact and deployment actions publish the generated site
directly.

## Website Prototype

An experimental reading website is generated directly from the thesis sources.
Its landing page presents the official abstract, thesis metadata, jury, and a
complete table of contents. The web edition includes every chapter enabled in
`main.tex`, the glossary, all included research appendices, the additional
appendix, and acknowledgments. It supports responsive sidenotes, citations from
`main.bib`, figures, equations, prompt and code blocks, callout boxes, tables,
and cross-references. The LaTeX files remain the source of truth; generated
chapter data, landing-page metadata, navigation, and web assets are not edited
by hand.

The website requires Node.js 22.12 or newer, plus `pdftocairo` and `pdfinfo`
(from Poppler) for converting and cropping PDF figures into browser-friendly
PNG files. PDF figures are embedded as images rather than browser PDF viewers.

```bash
npm install
npm run dev
```

`npm run dev` creates the complete static build, including search, and opens a
local production preview. For faster layout work with hot reloading, use
`npm run dev:live`; the Pagefind search index is not available in that mode.

Create and validate a production build, including the static full-thesis search index, with:

```bash
npm run check
```

The static output is written to `dist-web/`. The build copies `dist/Thesis.pdf`
into the website when the compiled thesis is available. Search is generated by
Pagefind after Astro renders the pages and is available in production builds
and previews. Set `BASE_PATH` when
building for a GitHub project page, for example:

```bash
BASE_PATH=/web-thesis npm run build
```

The validator also understands the repository base path:

```bash
BASE_PATH=/web-thesis npm run check
```

The conversion logic lives in `scripts/convert-thesis.mjs`. Unsupported LaTeX
commands are surfaced in its build diagnostics so that support can be expanded
chapter by chapter without silently losing content.

## Template and Licensing

The document layout is based on the `kaobook` class by Federico Marotta, itself
inspired by the doctoral thesis of Ken Arroyo Ohori and by Tufte-LaTeX.
Detailed attribution and upstream documentation links are provided in
[`docs/KAOBOOK.md`](docs/KAOBOOK.md).

The inherited `kaobook` class and style files retain their upstream licensing
terms. See [`MANIFEST.md`](MANIFEST.md) for those details. No separate license
for the thesis content is declared by this README.
