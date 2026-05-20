import type { PackageTideId } from "../types/content";
import tidesMarkdown from "../../docs/tides/tides.md?raw";

export interface TideDocumentation {
  id: PackageTideId;
  markdown: string;
  blocks: TideDocumentationBlock[];
}

export type TideDocumentationBlock =
  | {
      kind: "heading";
      text: string;
    }
  | {
      kind: "paragraph";
      text: string;
    }
  | {
      kind: "list";
      items: string[];
    };

const TIDE_SECTION_HEADING = /^###\s+`([^`]+)`\s*$/u;
const HIGHER_LEVEL_HEADING = /^##\s+/u;

const TIDE_DOCUMENTATION = parseTideDocumentation(tidesMarkdown);

export function getTideDocumentation(
  tideId: PackageTideId,
): TideDocumentation | null {
  return TIDE_DOCUMENTATION.get(tideId) ?? null;
}

export function hasTideDocumentation(tideId: PackageTideId): boolean {
  return TIDE_DOCUMENTATION.has(tideId);
}

export function parseTideDocumentation(
  markdown: string,
): ReadonlyMap<PackageTideId, TideDocumentation> {
  const sections = new Map<PackageTideId, TideDocumentation>();
  const lines = markdown.split(/\r?\n/u);
  let currentId: PackageTideId | null = null;
  let currentLines: string[] = [];

  function flush() {
    if (currentId === null) {
      return;
    }

    sections.set(currentId, {
      id: currentId,
      markdown: [`### \`${currentId}\``, ...currentLines].join("\n").trim(),
      blocks: [
        { kind: "heading", text: `\`${currentId}\`` },
        ...parseBlocks(currentLines),
      ],
    });
    currentId = null;
    currentLines = [];
  }

  for (const line of lines) {
    const sectionHeading = TIDE_SECTION_HEADING.exec(line);
    if (sectionHeading !== null) {
      flush();
      currentId = sectionHeading[1] ?? null;
      currentLines = [];
      continue;
    }

    if (currentId !== null && HIGHER_LEVEL_HEADING.test(line)) {
      flush();
      continue;
    }

    if (currentId !== null) {
      currentLines.push(line);
    }
  }

  flush();
  return sections;
}

function parseBlocks(lines: readonly string[]): TideDocumentationBlock[] {
  const blocks: TideDocumentationBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      kind: "paragraph",
      text: paragraphLines.join(" "),
    });
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({
      kind: "list",
      items: listItems,
    });
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2).trim());
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}
