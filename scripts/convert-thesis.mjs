import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import katex from "katex";

const root = path.resolve(import.meta.dirname, "..");
const bibPath = path.join(root, "main.bib");
const outputDir = path.join(root, "src/generated");
const bibliography = parseBib(fs.readFileSync(bibPath, "utf8"));
const thesisOutline = [
  { label: "Opening", chapters: [
    { slug: "introduction", source: "chapters/introduction.tex", number: "1", kind: "Chapter" },
    { slug: "history", source: "chapters/history.tex", number: "2", kind: "Chapter" }
  ] },
  { label: "Part I · Visual Document Retrieval", chapters: [
    { slug: "colpali", source: "chapters/colpali.tex", number: "3", kind: "Chapter", navTitle: "ColPali" },
    { slug: "vidorev3", source: "chapters/vidorev3.tex", number: "4", kind: "Chapter", navTitle: "ViDoRe V2 & V3" },
    { slug: "modernvbert", source: "chapters/modernvbert.tex", number: "5", kind: "Chapter", navTitle: "ModernVBERT" }
  ] },
  { label: "Part II · Contextualized Document Retrieval", chapters: [
    { slug: "conteb", source: "chapters/conteb.tex", number: "6", kind: "Chapter", navTitle: "Contextual Embeddings" },
    { slug: "croissant", source: "chapters/croissant.tex", number: "7", kind: "Chapter", navTitle: "CroissantLLM" }
  ] },
  { label: "Conclusion", chapters: [
    { slug: "conclusion", source: "chapters/conclusion.tex", number: "8", kind: "Chapter" }
  ] },
  { label: "Appendices", chapters: [
    { slug: "glossary", source: "chapters/glossary.tex", number: "A", kind: "Appendix" },
    { slug: "chapter-tfidf", source: "chapters/chapter_tfidf.tex", number: "B", kind: "Appendix", navTitle: "The Thesis in Twenty Terms" },
    { slug: "colpali-appendix", source: "chapters/colpali_appendix.tex", number: "C", kind: "Appendix" },
    { slug: "vidorev3-appendix", source: "chapters/vidorev3_appendix.tex", number: "D", kind: "Appendix", navTitle: "ViDoRe V3 Appendix" },
    { slug: "modernvbert-appendix", source: "chapters/modernvbert_appendix.tex", number: "E", kind: "Appendix", navTitle: "ModernVBERT Appendix" },
    { slug: "conteb-appendix", source: "chapters/conteb_appendix.tex", number: "F", kind: "Appendix" },
    { slug: "croissant-appendix", source: "chapters/croissant_appendix.tex", number: "G", kind: "Appendix" },
    { slug: "additional-appendix", source: "main.tex", number: "H", kind: "Appendix", title: "Additional Appendix", range: ["\\chapter{Additional Appendix}", "\\backmatter"] }
  ] },
  { label: "Back matter", chapters: [
    { slug: "acknowledgments", source: "chapters/acknowledgments.tex", kind: "Back matter", title: "Acknowledgments", pdfOnly: true }
  ] }
];
const chapterConfigs = thesisOutline.flatMap((section) => section.chapters.map((chapter) => ({ ...chapter, partLabel: section.label })));
let sourcePath;
let assetDir;
let currentSlug;
let diagnostics;
let citations;
let publishedAssets;
let sidenoteCounter = 0;
let figureCounter = 0;
let tableCounter = 0;
let localLabels = new Set();
let localReferences = new Map();
const globalReferences = buildGlobalReferenceIndex();

fs.mkdirSync(outputDir, { recursive: true });
for (const config of chapterConfigs) generateChapter(config);
generateSiteMetadata();

function generateSiteMetadata() {
  diagnostics = new Map();
  citations = new Map();
  const frontmatter = stripComments(fs.readFileSync(path.join(root, "chapters/official_frontmatter.tex"), "utf8"));
  const mainSource = stripComments(fs.readFileSync(path.join(root, "main.tex"), "utf8"));
  const abstractMarker = "\\textbf{Abstract:}";
  const abstractStart = frontmatter.indexOf(abstractMarker) + abstractMarker.length;
  const abstractEnd = frontmatter.indexOf("\\end{multicols}", abstractStart);
  const abstractSource = frontmatter.slice(abstractStart, abstractEnd).trim();
  const title = extractFirstArgument(mainSource, "title")?.value || "Document Retrieval Beyond Text Embeddings";
  const author = extractFirstArgument(mainSource, "author")?.value || "Manuel Faysse";
  const frenchTitle = frontmatter.match(/\\Large\{\\textit\{([^}]+)\}\}/)?.[1] || "";
  const keywordsLine = frontmatter.match(/\\textbf\{Keywords:\}\s*([^\n]+)/)?.[1] || "";
  const speciality = frontmatter.match(/Spécialité de doctorat\s*:\s*([^\\\n]+)/)?.[1]?.trim() || "";
  const doctoralSchool = frontmatter.match(/École doctorale[^:]*:\s*([^\\\n]+)/)?.[1]?.trim() || "";
  const referent = frontmatter.match(/Référent\s*:\s*([^\\\n]+)/)?.[1]?.trim() || "CentraleSupélec";
  const supervisionLine = frontmatter.match(/sous la direction de ([^\n]+)/)?.[1] || "";
  const supervisors = [...supervisionLine.matchAll(/\\textbf\{([^}]+)\}/g)].map((match) => cleanTex(match[1]));
  const juryBlock = frontmatter.match(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/)?.[0] || "";
  const jury = [...juryBlock.matchAll(/\\textbf\{([^}]+)\}\s*&\s*([^\\\n]+)/g)].map((match) => ({
    name: cleanTex(match[1]),
    role: cleanTex(match[2]).trim()
  }));
  const outline = thesisOutline.map((section) => ({
    label: section.label,
    chapters: section.chapters.map((chapter) => {
      const source = stripComments(readChapterSource(chapter));
      const title = chapter.title || extractFirstArgument(source, "chapter")?.value || chapter.slug;
      return {
        slug: chapter.slug,
        title: stripHtml(renderInline(title)),
        navTitle: chapter.navTitle || stripHtml(renderInline(title)),
        number: chapter.number || null,
        kind: chapter.kind,
        available: true
      };
    })
  }));
  const output = {
    title: stripHtml(renderInline(title)),
    frenchTitle: stripHtml(renderInline(frenchTitle)),
    author: stripHtml(renderInline(author)),
    institution: `Université Paris-Saclay · ${stripHtml(renderInline(referent))}`,
    speciality: stripHtml(renderInline(speciality)),
    doctoralSchool: stripHtml(renderInline(doctoralSchool)),
    researchUnit: "MICS · Mathématiques et Informatique pour la Complexité et les Systèmes",
    supervisors,
    jury,
    keywords: keywordsLine.split(",").map((keyword) => stripHtml(renderInline(keyword.trim()))).filter(Boolean),
    abstractHtml: renderInline(abstractSource.replace(/\s*\n\s*/g, " ")),
    outline
  };
  fs.writeFileSync(path.join(outputDir, "site.json"), `${JSON.stringify(output, null, 2)}\n`);
}

function generateChapter(config) {
  currentSlug = config.slug;
  sourcePath = path.join(root, config.source);
  assetDir = path.join(root, "public/generated", currentSlug);
  diagnostics = new Map();
  citations = new Map();
  publishedAssets = new Map();
  sidenoteCounter = 0;
  figureCounter = 0;
  tableCounter = 0;
  localReferences = new Map();
  fs.mkdirSync(assetDir, { recursive: true });

  let source = expandInputs(readChapterSource(config));
  source = stripComments(source);
  source = source.replace(/\\setchapterpreamble(?:\[[^\]]*\])?\{[\s\S]*?\}/g, "");
  source = stripMacroDefinitions(source);
  localLabels = new Set([
    ...[...source.matchAll(/\\label\{([^}]+)\}/g)].map((match) => match[1]),
    ...[...source.matchAll(/\\labch\{([^}]+)\}/g)].map((match) => `ch:${match[1]}`)
  ]);
  const chapterTitle = config.title || extractFirstArgument(source, "chapter")?.value || currentSlug;
  const titleHtml = renderInline(chapterTitle);
  source = removeFirstCommand(source, "chapter");

  let htmlWithoutBibliography;
  if (config.pdfOnly) {
    htmlWithoutBibliography = `<section class="pdf-only-notice"><p>Acknowledgments are available in the PDF version of this thesis.</p><a class="pdf-download" href="__BASE__Thesis.pdf" download>Download the thesis PDF <span aria-hidden="true">↓</span></a></section>`;
  } else {
    copyReferencedAssets(source);
    htmlWithoutBibliography = renderBlocks(source);
  }
  const html = `${htmlWithoutBibliography}${config.pdfOnly ? "" : renderBibliography()}`;
  const toc = collectToc(html);
  const plainText = stripHtml(html);
  const words = plainText.split(/\s+/).filter(Boolean).length;
  const firstParagraph = [...htmlWithoutBibliography.matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((match) => match[1])
    .find((paragraph) => stripHtml(paragraph).length > 80) || "";
  const output = {
    title: stripHtml(titleHtml),
    titleHtml,
    description: stripHtml(firstParagraph).slice(0, 280),
    source: config.source,
    slug: config.slug,
    partLabel: config.partLabel,
    number: config.number || null,
    kind: config.kind,
    pdfOnly: Boolean(config.pdfOnly),
    generatedAt: new Date().toISOString(),
    toc,
    stats: {
      words,
      readingMinutes: Math.max(1, Math.round(words / 220)),
      citations: citations.size,
      sidenotes: sidenoteCounter,
      figures: figureCounter,
      tables: tableCounter
    },
    diagnostics: [...diagnostics.entries()].map(([command, count]) => ({ command, count })),
    dedication: currentSlug === "introduction" ? readDedication() : null,
    html
  };

  fs.writeFileSync(path.join(outputDir, `${currentSlug}.json`), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Generated ${output.title}: ${words} words, ${citations.size} citations, ${sidenoteCounter} sidenotes, ${figureCounter} figures.`);
  if (diagnostics.size) console.log(`Unsupported commands kept as readable text: ${[...diagnostics.keys()].join(", ")}`);
}

function readChapterSource(config) {
  const input = fs.readFileSync(path.join(root, config.source), "utf8");
  if (!config.range) return input;
  const start = input.indexOf(config.range[0]);
  const end = input.indexOf(config.range[1], start + config.range[0].length);
  if (start < 0 || end < 0) throw new Error(`Could not extract ${config.slug} from ${config.source}`);
  return input.slice(start, end);
}

function buildGlobalReferenceIndex() {
  const references = new Map();
  for (const config of chapterConfigs) {
    const source = stripComments(expandInputs(readChapterSource(config)));
    const register = (label, details = {}) => {
      if (!label || references.has(label)) return;
      references.set(label, { slug: config.slug, ...details });
    };

    for (const match of source.matchAll(/\\labch\{([^}]+)\}/g)) {
      register(`ch:${match[1]}`, { type: config.kind === "Appendix" ? "Appendix" : "Chapter", number: config.number });
    }

    const counters = { figure: 0, table: 0, equation: 0 };
    const environmentPattern = /\\begin\{(figure\*?|marginfigure|promptfigure|table\*?|equation\*?|align\*?)\}/g;
    for (const match of source.matchAll(environmentPattern)) {
      const environment = match[1];
      const kind = environment.startsWith("figure") || environment === "marginfigure" || environment === "promptfigure"
        ? "figure"
        : environment.startsWith("table") ? "table" : "equation";
      counters[kind] += 1;
      if (environment === "promptfigure") {
        let cursor = match.index + match[0].length;
        while (/\s/.test(source[cursor] || "")) cursor += 1;
        if (source[cursor] === "[") cursor = readGroup(source, cursor, "[", "]").end;
        while (/\s/.test(source[cursor] || "")) cursor += 1;
        const title = source[cursor] === "{" ? readGroup(source, cursor) : null;
        cursor = title?.end || cursor;
        while (/\s/.test(source[cursor] || "")) cursor += 1;
        const label = source[cursor] === "{" ? readGroup(source, cursor) : null;
        if (label) register(label.value, { type: "Figure", number: counters.figure });
      }
      const end = source.indexOf(`\\end{${environment}}`, match.index + match[0].length);
      const body = source.slice(match.index, end < 0 ? match.index + match[0].length : end);
      const type = kind[0].toUpperCase() + kind.slice(1);
      for (const label of body.matchAll(/\\label\{([^}]+)\}/g)) {
        register(label[1], { type, number: counters[kind] });
      }
    }

    const sectionCounters = [0, 0, 0];
    const headingPattern = /\\(section|subsection|subsubsection|paragraph)\*?\{/g;
    for (const match of source.matchAll(headingPattern)) {
      const level = { section: 0, subsection: 1, subsubsection: 2, paragraph: 2 }[match[1]];
      sectionCounters[level] += 1;
      for (let deeper = level + 1; deeper < sectionCounters.length; deeper += 1) sectionCounters[deeper] = 0;
      const title = readGroup(source, match.index + match[0].length - 1);
      const nextHeading = source.slice(title.end).search(/\\(?:section|subsection|subsubsection|paragraph)\*?\{/);
      const extent = nextHeading < 0 ? source.length : title.end + nextHeading;
      const nearby = source.slice(title.end, extent);
      const label = nearby.match(/^\s*\\label\{([^}]+)\}/)?.[1];
      if (!label) continue;
      const parts = sectionCounters.slice(0, level + 1).filter((part) => part > 0);
      const number = config.number ? [config.number, ...parts].join(".") : parts.join(".");
      register(label, {
        type: match[1] === "paragraph" ? "Section" : match[1][0].toUpperCase() + match[1].slice(1),
        number
      });
    }

    for (const match of source.matchAll(/\\label\{([^}]+)\}/g)) {
      register(match[1], { type: inferReferenceType(match[1], config) });
    }
  }
  return references;
}

function inferReferenceType(label, config = null) {
  if (label.startsWith("fig:") || /:fig:/.test(label)) return "Figure";
  if (/^(?:table:|tab:)/.test(label) || /:tab:/.test(label)) return "Table";
  if (/^(?:eq:|equation:)/.test(label)) return "Equation";
  if (label.startsWith("ch:")) return config?.kind === "Appendix" ? "Appendix" : "Chapter";
  if (/^(?:appendix:|app:)/.test(label) || /:appendix:/.test(label)) return "Appendix";
  if (/^(?:subsection:|subsec:|ssec:)/.test(label)) return "Subsection";
  return "Section";
}

function readDedication() {
  const mainSource = stripComments(fs.readFileSync(path.join(root, "main.tex"), "utf8"));
  const dedication = extractFirstArgument(mainSource, "dedication")?.value;
  if (!dedication) return null;
  const [quote, attribution = ""] = dedication.split(/\\flushright\s*/);
  return {
    quoteHtml: renderInline(quote.trim()),
    attributionHtml: renderInline(attribution.trim())
  };
}

function stripComments(input) {
  return input
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] !== "%") continue;
        let backslashes = 0;
        for (let cursor = i - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) backslashes += 1;
        if (backslashes % 2 === 0) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function expandInputs(input) {
  return input.replace(/\\input\{([^}]+)\}/g, (command, requested) => {
    const relative = requested.endsWith(".tex") ? requested : `${requested}.tex`;
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(`${root}${path.sep}`) || !fs.existsSync(resolved)) return command;
    return expandInputs(fs.readFileSync(resolved, "utf8"));
  });
}

function stripMacroDefinitions(input) {
  return input
    .replace(/\\(?:renewcommand|newcommand)\s*\{?\\[A-Za-z@]+\}?\s*(?:\[[^\]]*\])?\s*\{[^\n]*\}/g, "")
    .replace(/\\def\s*\\[A-Za-z@]+\s*\{[^\n]*\}/g, "")
    .replace(/\\definecolor\{[^}]+\}\{[^}]+\}\{[^}]+\}/g, "")
    .replace(/\\renewcommand\s*\\[A-Za-z@]+\s*\{[^\n]*\}/g, "");
}

function removeFirstCommand(input, name) {
  const match = extractFirstArgument(input, name);
  if (!match) return input;
  return `${input.slice(0, match.start)}${input.slice(match.end)}`;
}

function extractFirstArgument(input, name, from = 0) {
  const marker = `\\${name}`;
  let start = input.indexOf(marker, from);
  while (start >= 0 && /[A-Za-z@]/.test(input[start + marker.length] || "")) {
    start = input.indexOf(marker, start + marker.length);
  }
  if (start < 0) return null;
  let cursor = start + marker.length;
  while (/\s/.test(input[cursor] || "")) cursor += 1;
  if (input[cursor] === "[") cursor = readGroup(input, cursor, "[", "]").end;
  while (/\s/.test(input[cursor] || "")) cursor += 1;
  if (input[cursor] !== "{") return null;
  const group = readGroup(input, cursor);
  return { start, end: group.end, value: group.value };
}

function readGroup(input, start, opener = "{", closer = "}") {
  let depth = 0;
  for (let i = start; i < input.length; i += 1) {
    if (input[i] === opener && input[i - 1] !== "\\") depth += 1;
    if (input[i] === closer && input[i - 1] !== "\\") {
      depth -= 1;
      if (depth === 0) return { value: input.slice(start + 1, i), end: i + 1 };
    }
  }
  return { value: input.slice(start + 1), end: input.length };
}

function replaceEnvironment(input, env, callback) {
  const beginPattern = new RegExp(`\\\\begin\\{${escapeRegExp(env)}\\}(?:\\[[^\\]]*\\])?`, "g");
  let output = "";
  let cursor = 0;
  let match;
  while ((match = beginPattern.exec(input))) {
    const bodyStart = beginPattern.lastIndex;
    const endMarker = `\\end{${env}}`;
    const end = input.indexOf(endMarker, bodyStart);
    if (end < 0) break;
    output += input.slice(cursor, match.index);
    output += callback(input.slice(bodyStart, end));
    cursor = end + endMarker.length;
    beginPattern.lastIndex = cursor;
  }
  return output + input.slice(cursor);
}

function replaceAnyEnvironment(input, environments, callback) {
  const names = environments.map(escapeRegExp).join("|");
  const beginPattern = new RegExp(`\\\\begin\\{(${names})\\}(?:\\[[^\\]]*\\])?`, "g");
  let output = "";
  let cursor = 0;
  let match;
  while ((match = beginPattern.exec(input))) {
    const bodyStart = beginPattern.lastIndex;
    const endMarker = `\\end{${match[1]}}`;
    const end = input.indexOf(endMarker, bodyStart);
    if (end < 0) break;
    output += input.slice(cursor, match.index);
    output += callback(input.slice(bodyStart, end), match[1]);
    cursor = end + endMarker.length;
    beginPattern.lastIndex = cursor;
  }
  return output + input.slice(cursor);
}

function makePlaceholder(html, store) {
  const key = `@@BLOCK_${store.length}@@`;
  store.push(html);
  return `\n\n${key}\n\n`;
}

function renderBlocks(input) {
  const blocks = [];
  let text = input;
  text = replaceEnvironment(text, "comment", () => "");

  for (const [env, title, kind] of [
    ["promptkaobox", "Prompt", "prompt"],
    ["completionkaobox", "Model response", "completion"],
    ["tcolorbox", "Annotation prompt", "prompt"]
  ]) {
    text = replaceEnvironment(text, env, (body) =>
      makePlaceholder(`<aside class="prompt-block ${kind}"><span class="callout-title">${title}</span>${renderBlocks(body)}</aside>`, blocks));
  }
  text = replaceEnvironment(text, "promptfigure", (body) => {
    let cursor = 0;
    while (/\s/.test(body[cursor] || "")) cursor += 1;
    const title = body[cursor] === "{" ? readGroup(body, cursor) : null;
    cursor = title?.end || cursor;
    while (/\s/.test(body[cursor] || "")) cursor += 1;
    const label = body[cursor] === "{" ? readGroup(body, cursor) : null;
    cursor = label?.end || cursor;
    return makePlaceholder(`<aside class="prompt-block"${label ? ` id="${escapeAttr(label.value)}"` : ""}><span class="callout-title">${title ? renderInline(title.value) : "Prompt"}</span>${renderBlocks(body.slice(cursor))}</aside>`, blocks);
  });
  for (const env of ["Verbatim", "lstlisting"]) {
    text = replaceEnvironment(text, env, (body) =>
      makePlaceholder(`<pre class="source-block"><code>${escapeHtml(body.trim())}</code></pre>`, blocks));
  }
  text = replaceEnvironment(text, "quote", (body) =>
    makePlaceholder(`<blockquote class="quote-block">${renderBlocks(body)}</blockquote>`, blocks));

  for (const [env, kind, title] of [
    ["sagekaobox", "sage", "Paper context"],
    ["kaobox", "", "Paper abstract"],
    ["lavenderkaobox", "lavender", ""]
  ]) {
    text = replaceEnvironment(text, env, (body) => {
      const customTitle = body.match(/frametitle\s*=\s*([^,\]]+)/)?.[1]?.trim();
      const cleaned = body.replace(/^\s*\[[^\]]*\]\s*/, "").replace(/\\flushright\b/g, "");
      const heading = customTitle || title;
      return makePlaceholder(`<aside class="callout ${kind}">${heading ? `<span class="callout-title">${escapeHtml(heading)}</span>` : ""}${renderBlocks(cleaned)}</aside>`, blocks);
    });
  }

  text = replaceAnyEnvironment(text, ["figure*", "marginfigure", "figure"], (body, env) =>
    makePlaceholder(renderFigure(body, env === "figure*", env === "marginfigure"), blocks));
  text = replaceEnvironment(text, "center", (body) =>
    /\\includegraphics\*?/.test(body) ? makePlaceholder(renderFigure(body, true), blocks) : body);
  text = replaceAnyEnvironment(text, ["table*", "table"], (body) => makePlaceholder(renderTable(body), blocks));
  for (const env of ["equation", "equation*", "align", "align*"]) {
    text = replaceEnvironment(text, env, (body) => makePlaceholder(renderEquation(body), blocks));
  }
  for (const env of ["itemize", "enumerate"]) {
    text = replaceEnvironment(text, env, (body) => {
      const tag = env === "itemize" ? "ul" : "ol";
      const items = body.split(/\\item\s*/).slice(1).map((item) => `<li>${renderInline(item.trim())}</li>`).join("");
      return makePlaceholder(`<${tag}>${items}</${tag}>`, blocks);
    });
  }

  text = text
    .replace(/\\setlength\s*\{[^}]+\}\s*\{[^}]+\}/g, "")
    .replace(/\\newcolumntype\s*\{[^}]+\}\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "")
    .replace(/\\(?:clearpage|newpage|centering|small|tiny|normalsize|normalfont|medskip|bigskip|noindent|raggedbottom|flushbottom|itshape|bfseries|ttfamily|onecolumn|space)\b/g, "")
    .replace(/\\vspace\*?\{[^}]*\}/g, "")
    .replace(/\\FloatBarrier\b/g, "")
    .replace(/\\begin\{(?:center|flushleft|flushright)\}|\\end\{(?:center|flushleft|flushright)\}/g, "");

  const headingPattern = /\\(section|subsection|subsubsection|paragraph)\*?\{/g;
  let structured = "";
  let cursor = 0;
  let heading;
  while ((heading = headingPattern.exec(text))) {
    structured += renderParagraphs(text.slice(cursor, heading.index), blocks);
    const group = readGroup(text, headingPattern.lastIndex - 1);
    const level = { section: 2, subsection: 3, subsubsection: 4, paragraph: 4 }[heading[1]];
    const headingText = renderInline(group.value);
    const id = slugify(stripHtml(headingText));
    structured += `<h${level} id="${id}">${headingText}</h${level}>`;
    cursor = group.end;
    headingPattern.lastIndex = cursor;
  }
  structured += renderParagraphs(text.slice(cursor), blocks);
  return structured.replace(/@@BLOCK_(\d+)@@/g, (_, index) => blocks[Number(index)] || "");
}

function renderParagraphs(input, blocks = []) {
  return input
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      if (/^@@BLOCK_\d+@@$/.test(paragraph)) return paragraph;
      const rendered = renderInline(paragraph.replace(/\s*\n\s*/g, " "));
      return rendered.trim() ? `<p>${rendered}</p>` : "";
    })
    .join("");
}

function renderFigure(body, wide, margin = false) {
  const images = [...body.matchAll(/\\includegraphics\*?(?:\[([^\]]*)\])?\{([^}]+)\}/g)];
  if (!images.length) return /\\begin\{(?:tabularx|tabular\*?|longtable)\}/.test(body) ? renderTable(body) : "";
  figureCounter += 1;
  const caption = extractFigureCaption(body);
  const captionText = removeOptionalCaption(caption);
  const labels = [...body.matchAll(/\\label\{([^}]+)\}/g)].map((match) => match[1]);
  const label = labels.at(-1) || `figure-${figureCounter}`;
  localReferences.set(label, { type: "Figure", number: figureCounter });
  for (const alias of labels.slice(0, -1)) localReferences.set(alias, { type: "Figure", number: figureCounter });
  const aliases = labels.slice(0, -1).map((alias) => `<span id="${escapeAttr(alias)}"></span>`).join("");
  const alt = stripHtml(renderInline(captionText)).slice(0, 240) || `Figure ${figureCounter}`;
  const media = images.map((image, index) => {
    const source = image[2].trim();
    const asset = publishedAssets.get(source) || { name: webAssetName(source), type: "image" };
    const width = inferFigureWidth(body, image);
    const imageAlt = images.length > 1 ? `${alt}, panel ${index + 1}` : alt;
    return `<img src="__BASE__generated/${currentSlug}/${escapeAttr(asset.name)}" alt="${escapeAttr(imageAlt)}" loading="lazy" style="--figure-width:${width}%">`;
  }).join("");
  return `${aliases}<figure class="chapter-figure${wide ? " wide" : ""}${margin ? " margin" : ""}" id="${escapeAttr(label)}"><div class="figure-media${images.length > 1 ? " multi" : ""}">${media}</div><figcaption><strong>Figure ${figureCounter}.</strong>${captionText ? ` ${renderInline(captionText)}` : ""}</figcaption></figure>`;
}

function extractFigureCaption(body) {
  const caption = extractFirstArgument(body, "caption");
  if (caption) return caption.value;
  const captionOf = extractFirstArgument(body, "captionof");
  if (!captionOf) return "";
  let cursor = captionOf.end;
  while (/\s/.test(body[cursor] || "")) cursor += 1;
  return body[cursor] === "{" ? readGroup(body, cursor).value : "";
}

function inferFigureWidth(body, image) {
  const prefix = body.slice(0, image.index);
  for (const environment of ["subfigure", "minipage"]) {
    const begin = prefix.lastIndexOf(`\\begin{${environment}}`);
    const end = prefix.lastIndexOf(`\\end{${environment}}`);
    if (begin > end) {
      const declaration = prefix.slice(begin).match(/\\begin\{(?:subfigure|minipage)\}(?:\[[^\]]*\])?\{\s*(\d*\.?\d+)\s*\\(?:textwidth|linewidth|columnwidth)\s*\}/);
      if (declaration) return Math.max(18, Math.min(100, Number(declaration[1]) * 100));
    }
  }
  const declared = (image[1] || "").match(/width\s*=\s*(\d*\.?\d+)\s*\\(?:textwidth|linewidth|columnwidth)/);
  return declared ? Math.max(18, Math.min(100, Number(declared[1]) * 100)) : 100;
}

function removeOptionalCaption(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[")) return trimmed;
  const group = readGroup(trimmed, 0, "[", "]");
  return trimmed.slice(group.end).trim() || group.value;
}

function renderTable(body) {
  tableCounter += 1;
  const tabular = extractTabular(body);
  const caption = extractFirstArgument(body, "caption")?.value || "";
  const labels = [...body.matchAll(/\\label\{([^}]+)\}/g)].map((match) => match[1]);
  const label = labels.at(-1) || `table-${tableCounter}`;
  localReferences.set(label, { type: "Table", number: tableCounter });
  for (const alias of labels.slice(0, -1)) localReferences.set(alias, { type: "Table", number: tableCounter });
  const aliases = labels.slice(0, -1).map((alias) => `<span id="${escapeAttr(alias)}"></span>`).join("");
  if (!tabular) return `${aliases}<div class="table-wrap" id="${escapeAttr(label)}"><p>Complex table available in the PDF edition.</p></div>`;
  const cleaned = tabular
    .replace(/\\(?:toprule|midrule|bottomrule|hline|addlinespace|c?dashline[^\n]*|cline\{[^}]+\})/g, "")
    .replace(/\\cmidrule(?:\([^)]*\))?\{[^}]+\}/g, "")
    .replace(/\\(?:cellcolor|columncolor|rowcolor)\{[^}]+\}/g, "");
  const rows = splitTableRows(cleaned).map((row) => row.trim()).filter(Boolean);
  const activeRowspans = [];
  const htmlRows = rows.map((row) => {
    const occupied = activeRowspans.map((remaining) => remaining > 0);
    for (let column = 0; column < activeRowspans.length; column += 1) {
      if (activeRowspans[column] > 0) activeRowspans[column] -= 1;
    }
    const cells = [];
    let column = 0;
    for (const rawCell of splitTopLevel(row, "&")) {
      const empty = rawCell.trim() === "";
      while (occupied[column] && !empty) column += 1;
      if (occupied[column] && empty) {
        column += 1;
        continue;
      }
      const cell = renderTableCell(rawCell);
      cells.push(cell.html);
      if (cell.rowspan > 1) {
        for (let offset = 0; offset < cell.colspan; offset += 1) {
          activeRowspans[column + offset] = Math.max(activeRowspans[column + offset] || 0, cell.rowspan - 1);
        }
      }
      column += cell.colspan;
    }
    return `<tr>${cells.join("")}</tr>`;
  }).join("");
  return `${aliases}<div class="table-wrap" id="${escapeAttr(label)}"><table><caption><strong>Table ${tableCounter}.</strong> ${renderInline(removeOptionalCaption(caption))}</caption><tbody>${htmlRows}</tbody></table></div>`;
}

function extractTabular(body) {
  const match = body.match(/\\begin\{(tabularx|tabular\*?|longtable)\}/);
  if (!match) return null;
  let cursor = match.index + match[0].length;
  const argumentCount = ["tabularx", "tabular*"].includes(match[1]) ? 2 : 1;
  for (let index = 0; index < argumentCount; index += 1) {
    while (/\s/.test(body[cursor] || "")) cursor += 1;
    if (body[cursor] !== "{") return null;
    cursor = readGroup(body, cursor).end;
  }
  const end = body.indexOf(`\\end{${match[1]}}`, cursor);
  return end < 0 ? null : body.slice(cursor, end);
}

function splitTableRows(input) {
  const rows = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < input.length - 1; index += 1) {
    if (input[index] === "{" && input[index - 1] !== "\\") depth += 1;
    else if (input[index] === "}" && input[index - 1] !== "\\") depth -= 1;
    else if (depth === 0 && input[index] === "\\" && input[index + 1] === "\\") {
      rows.push(input.slice(start, index));
      index += 1;
      if (input[index + 1] === "[") index = readGroup(input, index + 1, "[", "]").end - 1;
      start = index + 1;
    }
  }
  rows.push(input.slice(start));
  return rows;
}

function renderTableCell(rawCell) {
  let content = rawCell.trim();
  const attributes = {};
  for (const [command, attribute] of [["multicolumn", "colspan"], ["multirow", "rowspan"]]) {
    const marker = `\\${command}`;
    const start = content.indexOf(marker);
    if (start < 0) continue;
    let cursor = start + marker.length;
    while (/\s/.test(content[cursor] || "")) cursor += 1;
    if (content[cursor] === "[") cursor = readGroup(content, cursor, "[", "]").end;
    const groups = [];
    for (let index = 0; index < 3; index += 1) {
      while (/\s/.test(content[cursor] || "")) cursor += 1;
      if (content[cursor] !== "{") break;
      const group = readGroup(content, cursor);
      groups.push(group);
      cursor = group.end;
    }
    if (groups.length === 3) {
      const span = Number.parseInt(cleanTex(groups[0].value), 10);
      if (Number.isFinite(span) && span > 1) attributes[attribute] = span;
      content = `${content.slice(0, start)}${groups[2].value}${content.slice(groups[2].end)}`.trim();
    }
  }
  const attrs = Object.entries(attributes).map(([name, value]) => ` ${name}="${value}"`).join("");
  return {
    html: `<td${attrs}>${renderInline(content)}</td>`,
    colspan: attributes.colspan || 1,
    rowspan: attributes.rowspan || 1
  };
}

function renderEquation(body) {
  const label = body.match(/\\label\{([^}]+)\}/)?.[1];
  const tex = body.replace(/\\label\{[^}]+\}/g, "").trim();
  try {
    return `<div class="math-display"${label ? ` id="${escapeAttr(label)}"` : ""}>${katex.renderToString(tex, { displayMode: true, throwOnError: false, strict: "ignore" })}</div>`;
  } catch {
    return `<pre class="math-error">${escapeHtml(tex)}</pre>`;
  }
}

function renderInline(input) {
  let output = "";
  let plain = "";
  const flush = () => {
    if (!plain) return;
    output += typography(escapeHtml(plain));
    plain = "";
  };

  for (let i = 0; i < input.length;) {
    if (input.startsWith("\\(", i)) {
      const end = input.indexOf("\\)", i + 2);
      if (end > i) {
        flush();
        output += katex.renderToString(input.slice(i + 2, end).trim(), { throwOnError: false, strict: "ignore" });
        i = end + 2;
        continue;
      }
    }
    if (input.startsWith("\\[", i)) {
      const end = input.indexOf("\\]", i + 2);
      if (end > i) {
        flush();
        output += katex.renderToString(input.slice(i + 2, end).trim(), { displayMode: true, throwOnError: false, strict: "ignore" });
        i = end + 2;
        continue;
      }
    }
    if (input[i] === "$" && input[i - 1] !== "\\") {
      const end = findUnescaped(input, "$", i + 1);
      if (end > i) {
        flush();
        const tex = input.slice(i + 1, end);
        output += katex.renderToString(tex, { throwOnError: false, strict: "ignore" });
        i = end + 1;
        continue;
      }
    }
    if (input[i] !== "\\") {
      if (input[i] === "{" || input[i] === "}") { i += 1; continue; }
      plain += input[i];
      i += 1;
      continue;
    }

    flush();
    const commandMatch = input.slice(i + 1).match(/^([A-Za-z@]+\*?|.)/);
    if (!commandMatch) { i += 1; continue; }
    const command = commandMatch[1];
    let cursor = i + 1 + command.length;
    while (/\s/.test(input[cursor] || "")) cursor += 1;
    let optional = null;
    if (input[cursor] === "[") {
      optional = readGroup(input, cursor, "[", "]");
      cursor = optional.end;
      while (/\s/.test(input[cursor] || "")) cursor += 1;
    }
    const group = input[cursor] === "{" ? readGroup(input, cursor) : null;

    if (["\"", "'", "`", "^", "~", "c"].includes(command) && !group && input[cursor]) {
      output += escapeHtml(renderAccent(command, input[cursor]));
      i = cursor + 1;
      continue;
    }

    if (["textbf", "mathbf"].includes(command) && group) output += `<strong>${renderInline(group.value)}</strong>`;
    else if (["textit", "emph", "mathit"].includes(command) && group) output += `<em>${renderInline(group.value)}</em>`;
    else if (command === "texttt" && group) output += `<code>${escapeHtml(cleanTex(group.value))}</code>`;
    else if (command === "textsc" && group) output += `<span class="small-caps">${renderInline(group.value)}</span>`;
    else if (["textrm", "textnormal", "mbox"].includes(command) && group) output += renderInline(group.value);
    else if (["sidecite", "cite", "parencite", "textcite"].includes(command) && group) output += renderCitation(group.value, command === "sidecite");
    else if (command === "fullcite" && group) output += renderFullCitation(group.value);
    else if (command === "sidenote" && group) output += renderSidenote(group.value);
    else if (["autoref", "ref", "cref", "Cref"].includes(command) && group) output += renderReference(group.value, command);
    else if (command === "label" && group) output += `<span id="${escapeAttr(group.value)}"></span>`;
    else if (command === "labch" && group) output += `<span id="ch:${escapeAttr(group.value)}"></span>`;
    else if (command === "url" && group) output += `<a href="${escapeAttr(normalizeUrl(group.value))}">${escapeHtml(group.value)}</a>`;
    else if (command === "href" && group) {
      let after = group.end;
      while (/\s/.test(input[after] || "")) after += 1;
      const label = input[after] === "{" ? readGroup(input, after) : null;
      output += `<a href="${escapeAttr(normalizeUrl(group.value))}">${label ? renderInline(label.value) : escapeHtml(group.value)}</a>`;
      i = label ? label.end : group.end;
      continue;
    }
    else if (["vidore", "vidorev"].includes(command)) output += `<span class="small-caps">ViDoRe</span>${command === "vidorev" ? " V3" : ""}`;
    else if (["flagship", "flagshipbase", "flagshipembed", "biflagship", "colflagship"].includes(command)) {
      const names = {
        flagship: "ModernVBERT", flagshipbase: "ModernVBERT-base", flagshipembed: "ModernVBERT-embed",
        biflagship: "BiModernVBERT", colflagship: "ColModernVBERT"
      };
      output += `<em>${names[command]}</em>`;
    }
    else if (command === "flagshipparameters") output += "250M";
    else if (command === "natcap") output += `<em>NatCap</em>`;
    else if (command === "repo") output += `<a href="https://huggingface.co/ModernVBERT">huggingface.co/ModernVBERT</a>`;
    else if (command === "ghrepo") output += `<a href="https://github.com/illuin-tech/modernvbert">github.com/illuin-tech/modernvbert</a>`;
    else if (["shortstack", "makecell"].includes(command) && group) output += renderInline(group.value);
    else if (["rot", "rotatebox"].includes(command) && group) {
      let after = group.end;
      while (/\s/.test(input[after] || "")) after += 1;
      const content = input[after] === "{" ? readGroup(input, after) : null;
      output += content ? renderInline(content.value) : renderInline(group.value);
      i = content?.end || group.end;
      continue;
    }
    else if (command === "textsuperscript" && group) output += `<sup>${renderInline(group.value)}</sup>`;
    else if (command === "underline" && group) output += `<u>${renderInline(group.value)}</u>`;
    else if (["cmark", "xmark"].includes(command)) output += command === "cmark" ? "✓" : "×";
    else if (command === "darkgreencheck") output += "✓";
    else if (["multirow", "multicolumn"].includes(command) && group) {
      let after = group.end;
      const second = input[after] === "{" ? readGroup(input, after) : null;
      after = second?.end || after;
      const content = input[after] === "{" ? readGroup(input, after) : null;
      output += content ? renderInline(content.value) : "";
      i = content?.end || second?.end || group.end;
      continue;
    }
    else if (command === "val" && group) {
      const detail = input[group.end] === "{" ? readGroup(input, group.end) : null;
      output += `${renderInline(group.value)}${detail ? `<small class="table-delta">${renderInline(detail.value)}</small>` : ""}`;
      i = detail?.end || group.end;
      continue;
    }
    else if (["plus", "minus"].includes(command) && group) output += `<span class="table-delta ${command}">${command === "plus" ? "↑" : "↓"}${renderInline(group.value)}</span>`;
    else if (command === "comet") output += `<span class="small-caps">Comet</span>`;
    else if (["%", "&", "_", "#", "$"].includes(command)) {
      output += escapeHtml(command);
      if (cursor > i + 1 + command.length) output += " ";
    }
    else if (["{", "}"].includes(command)) output += command;
    else if (["\"", "'", "`", "^", "~", "c"].includes(command) && group) output += escapeHtml(renderAccent(command, group.value));
    else if ([",", ";", ":", "!", " "].includes(command)) output += " ";
    else if (["tiny", "small", "scriptsize", "footnotesize", "normalsize", "normalfont", "itshape", "bfseries", "ttfamily", "raggedright", "arraybackslash", "onecolumn"].includes(command)) output += "";
    else if (["color", "rowcolor"].includes(command) && group) output += "";
    else if (command === "footnote" && group) output += renderSidenote(group.value);
    else if (command === "texorpdfstring" && group) {
      let after = group.end;
      while (/\s/.test(input[after] || "")) after += 1;
      const fallback = input[after] === "{" ? readGroup(input, after) : null;
      output += renderInline(group.value);
      i = fallback?.end || group.end;
      continue;
    }
    else if (command === "hskip") {
      const dimension = input.slice(cursor).match(/^[-+]?\d*\.?\d+\s*(?:pt|pc|in|bp|cm|mm|dd|cc|sp|ex|em)/)?.[0] || "";
      i = cursor + dimension.length;
      continue;
    }
    else if (["quad", "qquad", "hspace", "vspace"].includes(command)) output += " ";
    else if (["newline", "linebreak"].includes(command) || command === "\\") output += "<br>";
    else if (command === "textcolor" && group) {
      let after = group.end;
      while (/\s/.test(input[after] || "")) after += 1;
      const content = input[after] === "{" ? readGroup(input, after) : null;
      if (content) {
        const color = group.value.trim().toLowerCase();
        const classes = ["latex-color"];
        if (/^(?:dark)?green(?:!|$)/.test(color)) classes.push("positive");
        else if (/^red(?:!|$)/.test(color)) classes.push("negative");
        else if (/^(?:navy)?blue(?:!|$)/.test(color)) classes.push("blue");
        if (/\\(?:up|down)arrow\b/.test(content.value)) classes.push("table-delta-inline");
        output += `<span class="${classes.join(" ")}">${renderInline(content.value)}</span>`;
      }
      i = content ? content.end : group.end;
      continue;
    }
    else if (group) {
      diagnostics.set(command, (diagnostics.get(command) || 0) + 1);
      output += `<span class="unsupported" title="Unsupported LaTeX command: \\${escapeAttr(command)}">${renderInline(group.value)}</span>`;
    } else {
      diagnostics.set(command, (diagnostics.get(command) || 0) + 1);
    }
    i = group?.end || optional?.end || cursor;
  }
  flush();
  return output;
}

function renderCitation(rawKeys, asSidenote) {
  const keys = rawKeys.split(",").map((key) => key.trim()).filter(Boolean);
  const labels = keys.map((key) => {
    const entry = bibliography.get(key);
    if (!citations.has(key)) citations.set(key, citations.size + 1);
    return { key, entry, label: citeLabel(entry, key, asSidenote) };
  });
  const inline = `<span class="citation">(${labels.map(({ key, label }) => `<a href="#bib-${escapeAttr(key)}">${escapeHtml(label)}</a>`).join("; ")})</span>`;
  if (!asSidenote) return inline;
  const details = labels.map(({ key, entry, label }) => `<a href="#bib-${escapeAttr(key)}"><strong>${escapeHtml(label)}</strong><span class="citation-title">${escapeHtml(cleanTex(entry?.title || key))}</span></a>`).join("<br>");
  return renderSidenote(details, true, "citation");
}

function renderFullCitation(rawKey) {
  const key = rawKey.trim();
  const entry = bibliography.get(key);
  if (!citations.has(key)) citations.set(key, citations.size + 1);
  if (!entry) return `<span>${escapeHtml(key)}</span>`;
  const authors = formatAuthors(entry.author || entry.editor || "Unknown author");
  const title = cleanTex(entry.title || key);
  const venue = cleanTex(entry.journaltitle || entry.booktitle || entry.publisher || "");
  const year = cleanTex(entry.year || entry.date || "n.d.").slice(0, 4);
  return `<span class="full-citation">${escapeHtml(authors)} (${escapeHtml(year)}). <em>${escapeHtml(title)}</em>${venue ? `. ${escapeHtml(venue)}` : ""}.</span>`;
}

function renderSidenote(content, alreadyHtml = false, kind = "note") {
  sidenoteCounter += 1;
  const number = sidenoteCounter;
  const modifier = kind === "citation" ? " sidecite" : "";
  return `<label class="sidenote-wrap${modifier}"><input class="sidenote-toggle" type="checkbox"><sup class="sidenote-number" aria-label="Open ${kind} sidenote ${number}">${number}</sup><span class="sidenote${modifier}" data-note="${number}">${alreadyHtml ? content : renderInline(content)}</span></label>`;
}

function renderReference(label, command = "autoref") {
  const known = localReferences.get(label) || globalReferences.get(label);
  const isLocal = localLabels.has(label);
  const isOnWebsite = Boolean(known?.slug);
  const href = isLocal
    ? `#${escapeAttr(label)}`
    : isOnWebsite ? `__BASE__chapters/${escapeAttr(known.slug)}/#${escapeAttr(label)}` : "__BASE__Thesis.pdf";
  const type = known?.type || inferReferenceType(label);
  const numbered = known?.number !== undefined && known?.number !== null && known.number !== "";
  const text = command === "ref"
    ? (numbered ? String(known.number) : type.toLowerCase())
    : `${type}${numbered ? ` ${known.number}` : ""}${isOnWebsite || isLocal ? "" : " in the PDF"}`;
  return `<a class="cross-ref" href="${href}">${text}</a>`;
}

function copyReferencedAssets(input) {
  const regex = /\\includegraphics\*?(?:\[([^\]]*)\])?\{([^}]+)\}/g;
  const seen = new Set();
  let match;
  while ((match = regex.exec(input))) {
    const options = match[1] || "";
    const requested = match[2].trim();
    if (seen.has(requested)) continue;
    seen.add(requested);
    const source = resolveGraphic(requested);
    if (!source) {
      console.warn(`Missing graphic: ${requested}`);
      continue;
    }
    const destination = path.join(assetDir, webAssetName(requested));
    if (path.extname(source).toLowerCase() === ".pdf") {
      try {
        if (fs.existsSync(destination)) fs.unlinkSync(destination);
        const crop = pdfCropArguments(source, options, 2400);
        execFileSync("pdftocairo", ["-png", "-singlefile", "-cropbox", "-scale-to", "2400", ...crop, source, destination.replace(/\.png$/, "")]);
        const staleFallback = destination.replace(/\.png$/, ".pdf");
        if (fs.existsSync(staleFallback)) fs.unlinkSync(staleFallback);
        publishedAssets.set(requested, { name: path.basename(destination), type: "image" });
      } catch (error) {
        throw new Error(`Could not rasterise ${requested}. Install Poppler/pdftocairo before building the website. ${error.message}`);
      }
    } else {
      fs.copyFileSync(source, destination);
      publishedAssets.set(requested, { name: path.basename(destination), type: "image" });
    }
  }
  const thesisPdf = path.join(root, "dist/Thesis.pdf");
  if (fs.existsSync(thesisPdf)) fs.copyFileSync(thesisPdf, path.join(root, "public/Thesis.pdf"));
}

function pdfCropArguments(source, options, targetSize) {
  const trim = options.match(/trim\s*=\s*\{([^}]+)\}/)?.[1];
  if (!trim) return [];
  const values = trim.trim().split(/\s+/).map(texLengthToPoints);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return [];
  const info = execFileSync("pdfinfo", [source], { encoding: "utf8" });
  const page = info.match(/Page size:\s*([\d.]+)\s+x\s+([\d.]+)\s+pts/);
  if (!page) return [];
  const width = Number(page[1]);
  const height = Number(page[2]);
  const scale = targetSize / Math.max(width, height);
  const [left, bottom, right, top] = values.map((value) => Math.round(value * scale));
  const pixelWidth = Math.round(width * scale);
  const pixelHeight = Math.round(height * scale);
  return ["-x", String(left), "-y", String(top), "-W", String(pixelWidth - left - right), "-H", String(pixelHeight - top - bottom)];
}

function texLengthToPoints(value) {
  const match = value.match(/^([-+]?\d*\.?\d+)\s*(pt|bp|cm|mm|in)?$/);
  if (!match) return Number.NaN;
  const factors = { pt: 1, bp: 72.27 / 72, cm: 72.27 / 2.54, mm: 72.27 / 25.4, in: 72.27 };
  return Number(match[1]) * factors[match[2] || "pt"];
}

function resolveGraphic(requested) {
  const direct = path.join(root, requested);
  if (fs.existsSync(direct)) return direct;
  for (const extension of [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".svg"]) {
    if (fs.existsSync(`${direct}${extension}`)) return `${direct}${extension}`;
  }
  return null;
}

function webAssetName(requested) {
  const parsed = path.parse(requested);
  const extension = parsed.ext.toLowerCase() === ".pdf" ? ".png" : (parsed.ext || ".png");
  return `${slugify(parsed.name)}${extension.toLowerCase()}`;
}

function parseBib(input) {
  const entries = new Map();
  for (let at = input.indexOf("@"); at >= 0; at = input.indexOf("@", at + 1)) {
    const header = input.slice(at).match(/^@(\w+)\s*\{\s*([^,]+),/);
    if (!header) continue;
    const open = input.indexOf("{", at);
    const group = readGroup(input, open);
    const comma = group.value.indexOf(",");
    const key = group.value.slice(0, comma).trim();
    entries.set(key, { type: header[1].toLowerCase(), key, ...parseBibFields(group.value.slice(comma + 1)) });
    at = group.end - 1;
  }
  return entries;
}

function parseBibFields(body) {
  const fields = {};
  let cursor = 0;
  while (cursor < body.length) {
    const match = body.slice(cursor).match(/(?:^|,)\s*([A-Za-z][\w-]*)\s*=\s*/);
    if (!match) break;
    cursor += match.index + match[0].length;
    const name = match[1].toLowerCase();
    if (body[cursor] === "{") {
      const group = readGroup(body, cursor);
      fields[name] = group.value.trim();
      cursor = group.end;
    } else if (body[cursor] === '"') {
      const end = findUnescaped(body, '"', cursor + 1);
      fields[name] = body.slice(cursor + 1, end).trim();
      cursor = end + 1;
    } else {
      const end = body.indexOf(",", cursor);
      fields[name] = body.slice(cursor, end < 0 ? body.length : end).trim();
      cursor = end < 0 ? body.length : end;
    }
  }
  return fields;
}

function citeLabel(entry, fallback, parenthesizeYear = false) {
  if (!entry) return fallback;
  const authors = authorNames(entry.author || entry.editor || "");
  const year = cleanTex(entry.year || entry.date || "n.d.").slice(0, 4);
  const displayedYear = parenthesizeYear ? `(${year})` : year;
  if (!authors.length) return displayedYear;
  if (authors.length === 1) return `${authors[0]} ${displayedYear}`;
  if (authors.length === 2) return `${authors[0]} & ${authors[1]} ${displayedYear}`;
  return `${authors[0]} et al. ${displayedYear}`;
}

function authorNames(raw) {
  return raw.split(/\s+and\s+/i).map((author) => {
    const clean = cleanTex(author).replace(/\*+/g, "").trim();
    if (clean.includes(",")) return clean.split(",")[0].trim();
    return clean.split(/\s+/).at(-1);
  }).filter(Boolean);
}

function formatAuthors(raw) {
  return raw.split(/\s+and\s+/i).map((author) => {
    const clean = cleanTex(author).trim();
    if (!clean.includes(",")) return clean;
    const [family, ...given] = clean.split(",").map((part) => part.trim()).filter(Boolean);
    return `${given.join(" ")} ${family}`.trim();
  }).filter(Boolean).join(", ");
}

function renderBibliography() {
  if (!citations.size) return "";
  const entries = [...citations.keys()].map((key) => {
    const entry = bibliography.get(key);
    if (!entry) return `<li id="bib-${escapeAttr(key)}"><strong>${escapeHtml(key)}</strong> — bibliography entry not found.</li>`;
    const authors = formatAuthors(entry.author || entry.editor || "Unknown author");
    const title = cleanTex(entry.title || key);
    const venue = cleanTex(entry.journaltitle || entry.booktitle || entry.publisher || "");
    const year = cleanTex(entry.year || entry.date || "n.d.").slice(0, 4);
    const link = entry.doi ? `https://doi.org/${entry.doi}` : entry.url;
    return `<li id="bib-${escapeAttr(key)}">${escapeHtml(authors)} (${escapeHtml(year)}). <span class="bib-title">${escapeHtml(title)}</span>${venue ? `. ${escapeHtml(venue)}` : ""}.${link ? ` <a href="${escapeAttr(normalizeUrl(link))}">Source ↗</a>` : ""}</li>`;
  }).join("");
  return `<details class="bibliography" id="references" data-pagefind-ignore="all"><summary data-count="${citations.size} sources"><h2>References</h2></summary><ol>${entries}</ol></details>`;
}

function collectToc(html) {
  const toc = [];
  const regex = /<h([2-4]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
  let match;
  while ((match = regex.exec(html))) toc.push({ level: Number(match[1]), id: match[2], text: stripHtml(match[3]) });
  return toc;
}

function splitTopLevel(input, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === "{" && input[i - 1] !== "\\") depth += 1;
    else if (input[i] === "}" && input[i - 1] !== "\\") depth -= 1;
    else if (input[i] === separator && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(input.slice(start));
  return parts;
}

function cleanTex(input) {
  return input
    .replace(/\\ensuremath\s*\{\s*\^\s*\{\s*\*\s*\}\s*\}/g, "*")
    .replace(/\^\s*\{\s*\*\s*\}/g, "*")
    .replace(/\{?\\(["'`^~=.uvHckbrtd])\s*(?:\{([^{}])\}|([A-Za-z]))\}?/g, (_, command, grouped, bare) => decodeLatexAccent(command, grouped || bare))
    .replace(/\\(oe|OE|ae|AE|aa|AA|o|O|l|L|ss)\b/g, (_, command) => ({
      oe: "œ", OE: "Œ", ae: "æ", AE: "Æ", aa: "å", AA: "Å",
      o: "ø", O: "Ø", l: "ł", L: "Ł", ss: "ß"
    })[command])
    .replace(/\\(?:textit|textbf|emph|textsc|texttt|textrm|textnormal|mbox)\s*/g, "")
    .replace(/[{}]/g, "")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/``|''/g, '"')
    .replace(/\\[A-Za-z]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeLatexAccent(command, value) {
  const marks = {
    "\"": "\u0308", "'": "\u0301", "`": "\u0300", "^": "\u0302",
    "~": "\u0303", "=": "\u0304", ".": "\u0307", u: "\u0306",
    v: "\u030c", H: "\u030b", c: "\u0327", k: "\u0328", b: "\u0331",
    d: "\u0323", r: "\u030a", t: "\u0361"
  };
  return `${value}${marks[command] || ""}`.normalize("NFC");
}

function renderAccent(command, value) {
  return decodeLatexAccent(command, cleanTex(value));
}

function normalizeUrl(url) {
  const clean = url.trim();
  if (/^(https?:|mailto:)/.test(clean)) return clean;
  if (clean.startsWith("www.")) return `https://${clean}`;
  return clean;
}

function findUnescaped(input, token, start) {
  for (let i = start; i < input.length; i += 1) if (input[i] === token && input[i - 1] !== "\\") return i;
  return -1;
}

function slugify(input) {
  return input.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

function typography(input) {
  return input.replace(/---/g, "—").replace(/--/g, "–").replace(/``/g, "“").replace(/''/g, "”").replace(/~/g, " ");
}

function stripHtml(input) {
  const entities = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
  return input.replace(/<[^>]*>/g, " ").replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_, entity) => entities[entity]).replace(/\s+/g, " ").replace(/\s+([:;,])/g, "$1").trim();
}

function escapeRegExp(input) { return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function escapeHtml(input) { return String(input).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function escapeAttr(input) { return escapeHtml(input).replace(/`/g, "&#96;"); }
