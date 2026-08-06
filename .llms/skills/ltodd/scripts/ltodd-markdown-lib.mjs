import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const CHAPTER_NAME = /^[a-z0-9]+(?:_[a-z0-9]+)*\.md$/;
const IMAGE_FIELDS = [
  "Purpose",
  "State",
  "Framing",
  "Details",
  "Alt text",
  "Caption",
];
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

function validateImageBriefs(relativePath, lines, errors) {
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== "<!-- ltodd-image") {
      continue;
    }

    const startLine = index + 1;
    const body = [];
    index += 1;
    while (index < lines.length && lines[index].trim() !== "-->") {
      body.push(lines[index].trim());
      index += 1;
    }

    if (index === lines.length) {
      errors.push(
        diagnostic(relativePath, startLine, "image brief is missing '-->'"),
      );
      break;
    }

    if (body.length !== IMAGE_FIELDS.length) {
      errors.push(
        diagnostic(
          relativePath,
          startLine,
          `image brief must contain ${IMAGE_FIELDS.length} fields in order`,
        ),
      );
      continue;
    }

    for (
      let fieldIndex = 0;
      fieldIndex < IMAGE_FIELDS.length;
      fieldIndex += 1
    ) {
      const field = IMAGE_FIELDS[fieldIndex];
      const value = body[fieldIndex];
      if (!value.startsWith(`${field}: `) || value === `${field}: `) {
        errors.push(
          diagnostic(
            relativePath,
            startLine + fieldIndex + 1,
            `expected non-empty '${field}:' image field`,
          ),
        );
      }
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
  validateImageBriefs(relativePath, lines, errors);

  return { lines, title: parseTitle(lines) };
}

function orderedIndexEntries(lines) {
  const blocks = [];
  let current;

  for (const line of lines) {
    const start = line.match(/^\d+\.\s+(.+)$/);
    if (start) {
      current = start[1];
      blocks.push(current);
      continue;
    }
    if (current && /^\s{2,}\S/.test(line)) {
      current = `${current} ${line.trim()}`;
      blocks[blocks.length - 1] = current;
      continue;
    }
    if (line.trim()) {
      current = undefined;
    }
  }

  return blocks.map((block) => {
    const match = block.match(/^\[([^\]]+)\]\(([^)]+\.md)\)\s+—\s+(.+)$/);
    return match
      ? { title: match[1], target: match[2], scope: match[3] }
      : { malformed: block };
  });
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
    if (
      path.basename(entry.target) !== entry.target ||
      !CHAPTER_NAME.test(entry.target)
    ) {
      errors.push(
        `index.md:1: chapter link must be a flat underscore filename: ${entry.target}`,
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
      if (path.basename(target) !== target || !filenames.has(target)) {
        errors.push(
          `${filename}:1: broken or non-flat chapter link: ${target}`,
        );
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
      errors.push(`${entry.name}: nested directories are not allowed in LToDD`);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      errors.push(
        `${entry.name}: only flat Markdown files are allowed in LToDD`,
      );
      continue;
    }
    if (!CHAPTER_NAME.test(entry.name)) {
      errors.push(
        `${entry.name}: use a lowercase underscore Markdown filename`,
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
