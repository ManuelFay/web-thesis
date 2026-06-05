# kaobook Template Notes

This thesis uses a locally included and modified version of the
[`kaobook`](https://github.com/fmarotta/kaobook) LaTeX class. The repository
was originally created from the upstream template but is now maintained as the
source repository for Manuel Faysse's doctoral thesis.

## Attribution

`kaobook` was created by
[Federico Marotta](https://github.com/fmarotta/kaobook) and is based on the
work of [Ken Arroyo Ohori](https://3d.bk.tudelft.nl/ken/en/) for his doctoral
thesis. The layout is described in Ken Arroyo Ohori's article on
[a 1.5-column thesis layout](https://3d.bk.tudelft.nl/ken/en/2016/04/17/a-1.5-column-layout-in-latex.html).

The [Tufte-LaTeX class](https://github.com/Tufte-LaTeX/tufte-latex) was also a
source of ideas. The original template acknowledges
[Vel](https://www.vel.nz/) and the
[`kaobook` contributors](https://github.com/fmarotta/kaobook/graphs/contributors).

## Template Features Used by the Thesis

- A wide outer margin for citations, notes, captions, figures, and tables.
- Chapter-level margin tables of contents.
- KOMA-Script-based book layout and chapter styling.
- Margin citations through `\sidecite`.
- Custom bibliography and cross-reference commands.
- Flexible full-width and margin page layouts.

The relevant inherited files in this repository are:

```text
kaobook.cls
kao.sty
kaobiblio.sty
kaorefs.sty
kaotheorems.sty
```

These files are kept in the repository root so that `main.tex` can load the
class without installing it into a system-wide TeX tree.

## Upstream Documentation

- [`kaobook` GitHub repository](https://github.com/fmarotta/kaobook)
- [`kaobook` on LaTeX Templates](https://www.latextemplates.com/template/kaobook)
- [KOMA-Script](https://www.ctan.org/pkg/koma-script)
- [Tufte-LaTeX](https://github.com/Tufte-LaTeX/tufte-latex)

The upstream project contains examples and general instructions for creating
new books with the class. Those instructions are not reproduced in the main
README because this repository is a specific thesis project rather than a
general-purpose template distribution.

## Updating the Class

Updating directly from upstream should be done cautiously because the local
class and style files may contain thesis-specific modifications. Review and
merge upstream changes file by file rather than replacing the local files
wholesale.

The main files to compare with upstream are:

1. `kaobook.cls`
2. `kao.sty`
3. `kaobiblio.sty`
4. `kaorefs.sty`
5. `kaotheorems.sty`

## Licensing

The inherited class and style files are distributed under the terms documented
in [`MANIFEST.md`](../MANIFEST.md), including the LaTeX Project Public License
terms that apply to the `kaobook` class.

These template licensing notes do not establish a license for the thesis text,
figures, datasets, or other research content in this repository.
