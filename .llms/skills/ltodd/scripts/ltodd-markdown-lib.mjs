import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  BOOK_SEGMENT_PATTERN,
  DEFAULT_BUCKET,
  isUsefulAltText,
  PUBLIC_ORIGIN,
} from "./ltodd-image-publisher-lib.mjs";

const NAME_SEGMENT = BOOK_SEGMENT_PATTERN;
const CHAPTER_NAME = /^[a-z0-9]+(?:_[a-z0-9]+)*\.md$/;
const IMAGE_ORIGIN = `${PUBLIC_ORIGIN}/${DEFAULT_BUCKET}`;
const LEAKAGE_PATTERNS = [
  [/(?:^|\W)draft_records(?:_adapted)?(?:\W|$)/i, "draft-record source"],
  [/\bIDF\b/, "IDF"],
  [/\btides4\b/i, "tides4"],
  [/\bco-?op\b/i, "co-op"],
  [/\bmultiplayer\b/i, "multiplayer"],
  [/(?:^|\W)\/editor(?:\W|$)/i, "editor route"],
  [/\bReact\b/, "React"],
  [/\bDOM\b/, "DOM"],
  [/\bTypeScript\b/i, "TypeScript"],
  [/(?:^|\W)src\//, "source path"],
  [/\blocalhost\b/i, "localhost"],
];

function physicalLines(source) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
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
    if (line.includes("<!-- ltodd-image")) {
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

    const pathParts = relativePath.split("/");
    if (pathParts.length !== 2) {
      errors.push(
        diagnostic(
          relativePath,
          index + 1,
          "prototype images belong in ordinary part chapters",
        ),
      );
      continue;
    }
    const part = pathParts[0];
    const chapter = path.basename(pathParts[1], ".md");
    const prefix = `${IMAGE_ORIGIN}/ltodd/${part}/${chapter}/`;
    if (!definition.url.startsWith(prefix)) {
      errors.push(
        diagnostic(
          relativePath,
          definition.line,
          `image URL must use the chapter namespace ${prefix}`,
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
        "chapter has no scope paragraph",
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
        "place a prose scope paragraph immediately after the title",
      ),
    );
  }
}

function validateMarkdownFile(relativePath, source, errors, warnings) {
  const lines = physicalLines(source);
  const baseName = path.basename(relativePath);

  if (baseName !== "index.md" && lines.length > 500) {
    errors.push(
      diagnostic(
        relativePath,
        501,
        `chapter has ${lines.length} lines; maximum is 500`,
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
            `review possible implementation or scope leakage: ${label}`,
          ),
        );
      }
    }
  }

  const first = firstNonemptyLine(lines);
  if (first !== -1 && lines[first].trim() === "---") {
    errors.push(
      diagnostic(relativePath, first + 1, "chapter frontmatter is not allowed"),
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
        "chapter must contain exactly one level-one title",
      ),
    );
  }

  validateOpeningParagraph(relativePath, lines, errors);
  validatePublishedImages(relativePath, lines, errors);

  return { lines, title: parseTitle(lines) };
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
          section: block.section,
          title: match[1],
          target: match[2],
          scope: match[3],
        }
      : { malformed: block.body };
  });
}

function isCanonicalIndexTarget(target) {
  if (target === "glossary.md") {
    return true;
  }
  const segments = target.split("/");
  return (
    segments.length === 2 &&
    NAME_SEGMENT.test(segments[0]) &&
    CHAPTER_NAME.test(segments[1]) &&
    segments[1] !== "index.md" &&
    segments[1] !== "glossary.md"
  );
}

function validatePartSections(lines, entries, errors) {
  const headings = new Map();
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^## (.+)$/);
    if (match) {
      headings.set(match[1], index);
    }
  }

  const sectionParts = new Map();
  const partSections = new Map();
  for (const entry of entries) {
    if (!entry.target || entry.target === "glossary.md") {
      continue;
    }
    const part = entry.target.split("/")[0];
    if (!entry.section) {
      errors.push(
        `index.md:1: ${entry.target} must appear beneath a part heading`,
      );
      continue;
    }
    const parts = sectionParts.get(entry.section) ?? new Set();
    parts.add(part);
    sectionParts.set(entry.section, parts);
    const sections = partSections.get(part) ?? new Set();
    sections.add(entry.section);
    partSections.set(part, sections);
  }

  for (const [section, parts] of sectionParts) {
    if (parts.size > 1) {
      errors.push(
        `index.md:1: part heading '${section}' mixes chapter directories`,
      );
    }
    const headingIndex = headings.get(section);
    const scopeIndex = firstNonemptyLine(lines, headingIndex + 1);
    if (
      scopeIndex === -1 ||
      /^(?:#{1,6}\s|\d+\.\s)/.test(lines[scopeIndex].trim())
    ) {
      errors.push(
        `index.md:${headingIndex + 1}: add a prose scope for this part`,
      );
    }
  }
  for (const [part, sections] of partSections) {
    if (sections.size > 1) {
      errors.push(`index.md:1: ${part} chapters must share one part heading`);
    }
  }
}

function validateIndex(indexSource, chapters, errors) {
  const lines = physicalLines(indexSource);
  const howToRead = lines.findIndex(
    (line) => line.trim().toLowerCase() === "## how to read this book",
  );
  if (howToRead === -1) {
    errors.push("index.md:1: add a 'How to read this book' section");
  } else {
    const paragraph = firstNonemptyLine(lines, howToRead + 1);
    if (paragraph === -1 || /^#/.test(lines[paragraph])) {
      errors.push(
        diagnostic(
          "index.md",
          howToRead + 1,
          "add the promised book-navigation paragraph",
        ),
      );
    }
  }

  const entries = orderedIndexEntries(lines);
  const targets = new Map();
  for (const entry of entries) {
    if (entry.malformed) {
      errors.push(`index.md:1: malformed chapter entry: ${entry.malformed}`);
      continue;
    }
    if (!isCanonicalIndexTarget(entry.target)) {
      errors.push(
        `index.md:1: chapter link must use <part>/<chapter>.md: ${entry.target}`,
      );
      continue;
    }
    if (targets.has(entry.target)) {
      errors.push(`index.md:1: duplicate chapter entry for ${entry.target}`);
      continue;
    }
    targets.set(entry.target, entry);

    if (!entry.scope.startsWith("Read this chapter when ")) {
      errors.push(
        `index.md:1: ${entry.target} scope must answer 'when should I read this?'`,
      );
    }
    if (!/[.!?]$/.test(entry.scope)) {
      errors.push(`index.md:1: ${entry.target} scope must end as a sentence`);
    }
  }

  for (const [filename, chapter] of chapters) {
    const entry = targets.get(filename);
    if (!entry) {
      errors.push(`index.md:1: missing chapter entry for ${filename}`);
      continue;
    }
    if (entry.title !== chapter.title) {
      errors.push(
        `index.md:1: title for ${filename} must be '${chapter.title}'`,
      );
    }
  }

  for (const target of targets.keys()) {
    if (!chapters.has(target)) {
      errors.push(`index.md:1: chapter entry points to missing ${target}`);
    }
  }
  validatePartSections(lines, entries, errors);
}

function validateGlossary(glossarySource, errors) {
  const headings = physicalLines(glossarySource)
    .filter((line) => /^## /.test(line))
    .map((line) => line.slice(3).trim());
  const normalized = headings.map((heading) => heading.toLocaleLowerCase("en"));
  const sorted = [...normalized].sort((left, right) =>
    left.localeCompare(right, "en"),
  );

  if (new Set(normalized).size !== normalized.length) {
    errors.push("glossary.md:1: glossary terms must be unique");
  }
  if (normalized.some((heading, index) => heading !== sorted[index])) {
    errors.push("glossary.md:1: glossary terms must be alphabetical");
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
        resolvedTarget.startsWith("../") ||
        !filenames.has(resolvedTarget)
      ) {
        errors.push(`${filename}:1: broken chapter link: ${target}`);
      }
    }
  }
}

async function collectBookFiles(bookDirectory, errors) {
  let entries;
  try {
    entries = await readdir(bookDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      errors.push(`${bookDirectory}: LToDD directory does not exist`);
      return new Map();
    }
    throw error;
  }

  const files = new Map();
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!NAME_SEGMENT.test(entry.name)) {
        errors.push(`${entry.name}: use a lowercase underscore part directory`);
      }
      const partDirectory = path.join(bookDirectory, entry.name);
      const partEntries = await readdir(partDirectory, { withFileTypes: true });
      let chapterCount = 0;
      for (const partEntry of partEntries) {
        const relativePath = `${entry.name}/${partEntry.name}`;
        if (partEntry.isDirectory()) {
          errors.push(
            `${relativePath}: chapters must live exactly one directory deep`,
          );
          continue;
        }
        if (!partEntry.isFile() || !partEntry.name.endsWith(".md")) {
          errors.push(
            `${relativePath}: part directories contain Markdown only`,
          );
          continue;
        }
        if (
          !CHAPTER_NAME.test(partEntry.name) ||
          partEntry.name === "index.md" ||
          partEntry.name === "glossary.md"
        ) {
          errors.push(
            `${relativePath}: use a lowercase underscore chapter filename`,
          );
        }
        const absolutePath = path.join(partDirectory, partEntry.name);
        files.set(relativePath, {
          absolutePath,
          source: await readFile(absolutePath, "utf8"),
        });
        chapterCount += 1;
      }
      if (chapterCount === 0) {
        errors.push(`${entry.name}: part directory contains no chapters`);
      }
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      errors.push(`${entry.name}: the LToDD root contains Markdown only`);
      continue;
    }
    if (entry.name !== "index.md" && entry.name !== "glossary.md") {
      errors.push(
        `${entry.name}: ordinary chapters must live in a part directory`,
      );
    }
    const absolutePath = path.join(bookDirectory, entry.name);
    files.set(entry.name, {
      absolutePath,
      source: await readFile(absolutePath, "utf8"),
    });
  }
  return files;
}

export async function validateBook(bookDirectory) {
  const errors = [];
  const warnings = [];
  const files = await collectBookFiles(bookDirectory, errors);

  if (files.size === 0) {
    if (errors.length === 0) {
      errors.push(`${bookDirectory}: LToDD contains no Markdown files`);
    }
    return { errors, warnings, files: [] };
  }
  if (!files.has("index.md")) {
    errors.push("index.md: required book catalog is missing");
  }
  if (!files.has("glossary.md")) {
    errors.push("glossary.md: required terminology chapter is missing");
  }

  const chapters = new Map();
  for (const [filename, file] of files) {
    const result = validateMarkdownFile(
      filename,
      file.source,
      errors,
      warnings,
    );
    file.title = result.title;
    if (filename !== "index.md") {
      chapters.set(filename, file);
    }
  }

  if (files.has("index.md")) {
    validateIndex(files.get("index.md").source, chapters, errors);
  }
  if (files.has("glossary.md")) {
    validateGlossary(files.get("glossary.md").source, errors);
  }
  validateInternalLinks(files, errors);

  return {
    errors,
    warnings,
    files: [...files.values()].map((file) => file.absolutePath).sort(),
  };
}
