import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist-web");
const configuredBase = normalizeBase(process.env.BASE_PATH || "/");
const htmlFiles = walk(output).filter((file) => file.endsWith(".html"));
const errors = [];

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const idList = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const ids = new Set(idList);
  for (const id of ids) {
    if (idList.filter((candidate) => candidate === id).length > 1) errors.push(`${relative(file)}: duplicate id #${id}`);
  }
  for (const [pattern, message] of [
    [/<span class="unsupported"/, "contains unsupported LaTeX output"],
    [/<(?:object|embed|iframe)\b[^>]*\.pdf/i, "contains an embedded PDF viewer"],
    [/<img\b[^>]*\.pdf/i, "uses a PDF as an image"],
    [/Complex table available in the PDF edition/, "contains an unrendered table"],
    [/bibliography entry not found/, "contains a missing bibliography entry"]
  ]) {
    if (pattern.test(html)) errors.push(`${relative(file)}: ${message}`);
  }
  for (const image of html.matchAll(/<img\b([^>]*)>/g)) {
    if (!/\salt="[^"]*"/.test(image[1])) errors.push(`${relative(file)}: image is missing alt text`);
  }
  for (const match of html.matchAll(/\s(?:href|src|data)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|data:|javascript:)/.test(target)) continue;
    if (target.startsWith("#")) {
      const id = decodeURIComponent(target.slice(1));
      if (id && !ids.has(id)) errors.push(`${relative(file)}: missing anchor ${target}`);
      continue;
    }
    const [pathname] = target.split("#");
    const deployPath = pathname.startsWith(configuredBase)
      ? pathname.slice(configuredBase.length)
      : pathname;
    const relativeTarget = pathname.startsWith("/")
      ? path.join(output, deployPath)
      : path.resolve(path.dirname(file), pathname);
    const candidates = [relativeTarget, path.join(relativeTarget, "index.html")];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) {
      errors.push(`${relative(file)}: missing local target ${target}`);
    }
  }
}

if (errors.length) {
  console.error(`Site validation failed with ${errors.length} issue(s):`);
  for (const error of errors.slice(0, 50)) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${htmlFiles.length} HTML pages: local links, anchors, and assets resolve.`);
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(location) : [location];
  });
}

function relative(file) {
  return path.relative(root, file);
}

function normalizeBase(value) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash === "/" ? "/" : `${withLeadingSlash.replace(/\/+$/, "")}/`;
}
