import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_BUCKET,
  ESSAY_SEGMENT_PATTERN,
  isUsefulAltText,
  PUBLIC_ORIGIN,
} from "./dda-image-publisher-lib.mjs";

const ESSAY_FILENAME = /^[a-z0-9]+(?:_[a-z0-9]+)*\.md$/;
const IMAGE_ORIGIN = `${PUBLIC_ORIGIN}/${DEFAULT_BUCKET}`;
export const ESSAY_CHARACTER_LIMIT = 40_000;
export const ESSAY_CHARACTER_REFERENCE = 20_000;

const LEAKAGE_PATTERNS = [
  [/(?:^|\W)draft_records(?:_adapted)?(?:\W|$)/i, "draft-record source"],
  [/\bIDF\b/, "IDF"],
  [/\btides4\b/i, "tides4"],
  [/(?:^|\W)\/editor(?:\W|$)/i, "editor route"],
  [/\bReact\b/, "React"],
  [/\bDOM\b/, "DOM"],
  [/\bCSS\b/, "CSS"],
  [/\bbrowser\b/i, "browser-specific behavior"],
  [/\blocalStorage\b/, "browser storage"],
  [/\bTypeScript\b/i, "TypeScript"],
  [/\b(?:reloaded?|reloading|reloads)\b/i, "platform reload behavior"],
  [/\bfold\b/i, "state-fold architecture"],
  [/\bserializ(?:e|es|ed|ing|able|ation)\b/i, "serialization strategy"],
  [/(?:^|\W)src\//, "source path"],
  [/\blocalhost\b/i, "localhost"],
];

const EDITORIAL_PATTERNS = [
  [
    /—[^—\n]{1,160}—/,
    "use parentheses, commas, or sentences instead of an em-dash parenthetical",
  ],
  [
    /\b(?:the|these) (?:remaining|following) sections?\b/i,
    "replace vague section roadmap prose with a concrete dependency",
  ],
  [
    /\bthis section (?:covers|defines|describes|explains|explores)\b/i,
    "replace section metadiscourse with the subject itself",
  ],
];

function physicalLines(source) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

export function countUnicodeCharacters(source) {
  return [...source.replaceAll("\r\n", "\n")].length;
}

function diagnostic(relativePath, line, message) {
  return `${relativePath}:${line}: ${message}`;
}

function isPermittedLongUrl(line) {
  const trimmed = line.trim();
  return /^(?:\[[^\]]+\]:\s*)?https?:\/\/\S+$/.test(trimmed);
}

function firstNonemptyLine(lines, start = 0) {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      return index;
    }
  }
  return -1;
}

function parseTitle(lines) {
  const first = firstNonemptyLine(lines);
  if (first === -1) {
    return undefined;
  }
  return lines[first].match(/^# (.+)$/)?.[1];
}

function validatePublishedImages(relativePath, lines, errors) {
  const definitions = new Map();
  for (const [index, line] of lines.entries()) {
    const definition = line.match(/^\[([^\]]+)\]:(?:\s+(\S+))?$/);
    if (definition) {
      const continuation = lines[index + 1]?.match(/^\s+(https?:\/\/\S+)$/);
      const url = definition[2] ?? continuation?.[1];
      if (url) {
        definitions.set(definition[1], {
          line: definition[2] ? index + 1 : index + 2,
          url,
        });
      }
    }
    if (line.includes("<!-- dda-image")) {
      errors.push(
        diagnostic(
          relativePath,
          index + 1,
          "image-plan comments are not allowed; publish a live prototype image",
        ),
      );
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.includes("![")) {
      continue;
    }
    if (relativePath === "index.md") {
      errors.push(
        diagnostic(
          relativePath,
          index + 1,
          "the flat index must not contain images",
        ),
      );
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\[([^\]]+)\]$/);
    if (!image) {
      errors.push(
        diagnostic(
          relativePath,
          index + 1,
          "use one reference-style published image on its own line",
        ),
      );
      continue;
    }

    const [, altText, reference] = image;
    if (!isUsefulAltText(altText)) {
      errors.push(
        diagnostic(
          relativePath,
          index + 1,
          "image alt text must describe visible evidence in 10-59 characters",
        ),
      );
    }

    const captionIndex = firstNonemptyLine(lines, index + 1);
    if (
      captionIndex === -1 ||
      !/^(?:\*\S(?:.*\S)?\*|_\S(?:.*\S)?_)$/.test(lines[captionIndex].trim())
    ) {
      errors.push(
        diagnostic(
          relativePath,
          index + 1,
          "place one concise italic caption immediately after the image",
        ),
      );
    }

    const definition = definitions.get(reference);
    if (!definition) {
      errors.push(
        diagnostic(
          relativePath,
          index + 1,
          `image reference '${reference}' has no URL definition`,
        ),
      );
      continue;
    }

    const essay = path.basename(relativePath, ".md");
    const prefix = `${IMAGE_ORIGIN}/dda/${essay}/`;
    if (!definition.url.startsWith(prefix)) {
      errors.push(
        diagnostic(
          relativePath,
          definition.line,
          `image URL must use the essay namespace ${prefix}`,
        ),
      );
      continue;
    }

    const objectName = definition.url.slice(prefix.length);
    const objectMatch = objectName.match(
      /^[a-z0-9]+(?:-[a-z0-9]+)*-([0-9a-f]{12})\.(?:png|jpg|webp)$/,
    );
    if (!objectMatch) {
      errors.push(
        diagnostic(
          relativePath,
          definition.line,
          "image URL must use a content-addressed publisher filename",
        ),
      );
      continue;
    }
    if (reference !== `img-${objectMatch[1]}`) {
      errors.push(
        diagnostic(
          relativePath,
          index + 1,
          "image reference label must match the published content hash",
        ),
      );
    }
  }
}

function validateOpeningParagraph(relativePath, lines, errors) {
  const titleIndex = lines.findIndex((line) => /^# /.test(line));
  if (titleIndex === -1) {
    return;
  }
  const openingIndex = firstNonemptyLine(lines, titleIndex + 1);
  if (openingIndex === -1) {
    errors.push(
      diagnostic(
        relativePath,
        titleIndex + 1,
        "document has no opening paragraph",
      ),
    );
    return;
  }
  if (
    /^(?:#{1,6}\s|[-*+]\s|\d+\.\s|>|<!--|```|~~~)/.test(
      lines[openingIndex].trim(),
    )
  ) {
    errors.push(
      diagnostic(
        relativePath,
        openingIndex + 1,
        "place a prose opening immediately after the title",
      ),
    );
  }
}

function validateMarkdownFile(relativePath, source, errors, warnings) {
  const lines = physicalLines(source);
  const isEssay = relativePath !== "index.md";
  const characterCount = countUnicodeCharacters(source);

  if (isEssay && characterCount > ESSAY_CHARACTER_LIMIT) {
    errors.push(
      diagnostic(
        relativePath,
        1,
        `essay has ${characterCount.toLocaleString("en-US")} Unicode code points; maximum is ${ESSAY_CHARACTER_LIMIT.toLocaleString("en-US")}`,
      ),
    );
  }

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if ([...line].length > 80 && !isPermittedLongUrl(line)) {
      errors.push(
        diagnostic(relativePath, lineNumber, "line exceeds 80 columns"),
      );
    }
    if (/^\s*(?:```|~~~)/.test(line)) {
      errors.push(
        diagnostic(relativePath, lineNumber, "fenced code is not allowed"),
      );
    }
    if (/\b(?:TODO|TBD|FIXME)\b|\?\?\?/.test(line)) {
      errors.push(
        diagnostic(
          relativePath,
          lineNumber,
          "unresolved placeholder is not allowed",
        ),
      );
    }
    for (const [pattern, label] of LEAKAGE_PATTERNS) {
      if (pattern.test(line)) {
        warnings.push(
          diagnostic(
            relativePath,
            lineNumber,
            `review possible implementation leakage: ${label}`,
          ),
        );
      }
    }
    for (const [pattern, message] of EDITORIAL_PATTERNS) {
      if (pattern.test(line)) {
        warnings.push(diagnostic(relativePath, lineNumber, message));
      }
    }
  }

  const first = firstNonemptyLine(lines);
  if (first !== -1 && lines[first].trim() === "---") {
    errors.push(
      diagnostic(
        relativePath,
        first + 1,
        "document frontmatter is not allowed",
      ),
    );
  }

  const levelOneHeadings = lines.filter((line) => /^# /.test(line));
  if (!parseTitle(lines)) {
    errors.push(
      diagnostic(relativePath, 1, "first content must be a level-one title"),
    );
  } else if (levelOneHeadings.length !== 1) {
    errors.push(
      diagnostic(
        relativePath,
        1,
        "document must contain exactly one level-one title",
      ),
    );
  }

  validateOpeningParagraph(relativePath, lines, errors);
  validatePublishedImages(relativePath, lines, errors);
  return { title: parseTitle(lines) };
}

function orderedIndexEntries(lines) {
  const blocks = [];
  let current;
  let section;

  for (const line of lines) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      section = heading[1];
      current = undefined;
      continue;
    }
    const start = line.match(/^\d+\.\s+(.+)$/);
    if (start) {
      current = { body: start[1], section };
      blocks.push(current);
      continue;
    }
    if (current && /^\s{2,}\S/.test(line)) {
      current.body = `${current.body} ${line.trim()}`;
      continue;
    }
    if (line.trim()) {
      current = undefined;
    }
  }

  return blocks.map((block) => {
    const match = block.body.match(/^\[([^\]]+)\]\(([^)]+\.md)\)\s+—\s+(.+)$/);
    return match
      ? {
          scope: match[3],
          section: block.section,
          target: match[2],
          title: match[1],
        }
      : { malformed: block.body, section: block.section };
  });
}

function validateIndex(indexSource, essays, errors) {
  const lines = physicalLines(indexSource);
  const levelTwoHeadings = lines
    .filter((line) => /^## /.test(line))
    .map((line) => line.slice(3).trim());
  if (
    levelTwoHeadings.length !== 1 ||
    levelTwoHeadings[0].toLocaleLowerCase("en") !== "essays"
  ) {
    errors.push("index.md:1: use one flat '## Essays' section");
  }

  const entries = orderedIndexEntries(lines);
  const targets = new Map();
  for (const entry of entries) {
    if (entry.section !== "Essays") {
      errors.push(
        "index.md:1: every numbered entry must appear under '## Essays'",
      );
    }
    if (entry.malformed) {
      errors.push(`index.md:1: malformed essay entry: ${entry.malformed}`);
      continue;
    }
    if (
      !ESSAY_FILENAME.test(entry.target) ||
      entry.target === "index.md" ||
      entry.target.includes("/")
    ) {
      errors.push(
        `index.md:1: essay link must use a root lowercase underscore filename: ${entry.target}`,
      );
      continue;
    }
    if (targets.has(entry.target)) {
      errors.push(`index.md:1: duplicate essay entry for ${entry.target}`);
      continue;
    }
    targets.set(entry.target, entry);

    if (!entry.scope.startsWith("Read this essay when ")) {
      errors.push(
        `index.md:1: ${entry.target} scope must answer 'when should I read this essay?'`,
      );
    }
    if (!/[.!?]$/.test(entry.scope)) {
      errors.push(`index.md:1: ${entry.target} scope must end as a sentence`);
    }
  }

  for (const [filename, essay] of essays) {
    const entry = targets.get(filename);
    if (!entry) {
      errors.push(`index.md:1: missing essay entry for ${filename}`);
      continue;
    }
    if (entry.title !== essay.title) {
      errors.push(`index.md:1: title for ${filename} must be '${essay.title}'`);
    }
  }
  for (const target of targets.keys()) {
    if (!essays.has(target)) {
      errors.push(`index.md:1: essay entry points to missing ${target}`);
    }
  }
}

function validateInternalLinks(files, errors) {
  const filenames = new Set(files.keys());
  const linkPattern = /\[[^\]]+\]\(([^)#?]+\.md)(?:#[^)]+)?\)/g;

  for (const [filename, file] of files) {
    for (const match of file.source.matchAll(linkPattern)) {
      const target = match[1];
      if (/^[a-z]+:\/\//i.test(target)) {
        continue;
      }
      const resolvedTarget = path.posix.normalize(
        path.posix.join(path.posix.dirname(filename), target),
      );
      if (
        path.posix.isAbsolute(target) ||
        resolvedTarget.includes("/") ||
        !filenames.has(resolvedTarget)
      ) {
        errors.push(`${filename}:1: broken or non-flat essay link: ${target}`);
      }
    }
  }
}

async function collectAnthologyFiles(anthologyDirectory, errors) {
  let entries;
  try {
    entries = await readdir(anthologyDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      errors.push(`${anthologyDirectory}: DDA directory does not exist`);
      return new Map();
    }
    throw error;
  }

  const files = new Map();
  for (const entry of entries) {
    if (entry.isDirectory()) {
      errors.push(`${entry.name}: DDA is flat; subdirectories are not allowed`);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      errors.push(`${entry.name}: the DDA root contains Markdown only`);
      continue;
    }
    if (
      entry.name !== "index.md" &&
      (!ESSAY_FILENAME.test(entry.name) ||
        !ESSAY_SEGMENT_PATTERN.test(path.basename(entry.name, ".md")))
    ) {
      errors.push(`${entry.name}: use a lowercase underscore essay filename`);
    }
    const absolutePath = path.join(anthologyDirectory, entry.name);
    files.set(entry.name, {
      absolutePath,
      source: await readFile(absolutePath, "utf8"),
    });
  }
  return files;
}

export async function validateAnthology(anthologyDirectory) {
  const errors = [];
  const warnings = [];
  const files = await collectAnthologyFiles(anthologyDirectory, errors);

  if (files.size === 0) {
    if (errors.length === 0) {
      errors.push(`${anthologyDirectory}: DDA contains no Markdown files`);
    }
    return { errors, warnings, files: [] };
  }
  if (!files.has("index.md")) {
    errors.push("index.md: required flat essay catalog is missing");
  }

  const essays = new Map();
  for (const [filename, file] of files) {
    const result = validateMarkdownFile(
      filename,
      file.source,
      errors,
      warnings,
    );
    file.title = result.title;
    if (filename !== "index.md") {
      essays.set(filename, file);
    }
  }

  if (files.has("index.md")) {
    validateIndex(files.get("index.md").source, essays, errors);
  }
  validateInternalLinks(files, errors);

  return {
    errors,
    warnings,
    files: [...files.values()].map((file) => file.absolutePath).sort(),
  };
}
