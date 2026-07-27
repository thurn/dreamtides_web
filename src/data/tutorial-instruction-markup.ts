/** Named inline colors supported by authored tutorial instructions. */
export type TutorialInstructionHighlightColor = "purple" | "yellow";

/** One continuous run of tutorial instruction copy. */
export interface TutorialInstructionSpan {
  readonly text: string;
  readonly highlight?: TutorialInstructionHighlightColor;
}

/** One paragraph of parsed tutorial instruction copy. */
export interface TutorialInstructionParagraph {
  readonly spans: readonly TutorialInstructionSpan[];
}

const KNOWN_TAG_PATTERN = /\[\/?(?:purple|yellow)\]/gu;
const MARKUP_LIKE_TAG_PATTERN = /\[\/?[A-Za-z][A-Za-z0-9-]*\]/gu;
const SUPPORTED_TAGS = new Set([
  "[purple]",
  "[/purple]",
  "[yellow]",
  "[/yellow]",
]);

function parseParagraph(
  paragraph: string,
  paragraphIndex: number,
): TutorialInstructionParagraph {
  const unsupportedTag = paragraph
    .match(MARKUP_LIKE_TAG_PATTERN)
    ?.find((tag) => !SUPPORTED_TAGS.has(tag));
  if (unsupportedTag !== undefined) {
    throw new Error(
      `Tutorial instruction paragraph ${String(paragraphIndex + 1)} uses unsupported highlight tag ${JSON.stringify(unsupportedTag)}.`,
    );
  }

  const spans: TutorialInstructionSpan[] = [];
  let cursor = 0;
  let highlight: TutorialInstructionHighlightColor | null = null;
  let highlightedTextStart = -1;

  for (const match of paragraph.matchAll(KNOWN_TAG_PATTERN)) {
    const tag = match[0];
    const index = match.index;
    if (index === undefined) continue;
    const tagColor: TutorialInstructionHighlightColor = tag.includes("purple")
      ? "purple"
      : "yellow";
    const isClosingTag =
      tag.startsWith("[/") || (tagColor === "purple" && highlight === "purple");

    if (!isClosingTag) {
      if (highlight !== null) {
        throw new Error(
          `Tutorial instruction paragraph ${String(paragraphIndex + 1)} cannot nest ${tagColor} highlights inside ${highlight} highlights.`,
        );
      }
      if (index > cursor) spans.push({ text: paragraph.slice(cursor, index) });
      highlight = tagColor;
      highlightedTextStart = index + tag.length;
      cursor = highlightedTextStart;
      continue;
    }

    if (highlight !== tagColor) {
      throw new Error(
        `Tutorial instruction paragraph ${String(paragraphIndex + 1)} has a closing ${tagColor} tag without an opening tag.`,
      );
    }
    if (index === highlightedTextStart) {
      throw new Error(
        `Tutorial instruction paragraph ${String(paragraphIndex + 1)} has an empty ${tagColor} highlight.`,
      );
    }
    spans.push({
      text: paragraph.slice(cursor, index),
      highlight: tagColor,
    });
    highlight = null;
    highlightedTextStart = -1;
    cursor = index + tag.length;
  }

  if (highlight !== null) {
    throw new Error(
      `Tutorial instruction paragraph ${String(paragraphIndex + 1)} has an unclosed ${highlight} highlight.`,
    );
  }
  if (cursor < paragraph.length) {
    spans.push({ text: paragraph.slice(cursor) });
  }
  return { spans };
}

/**
 * Parse authored tutorial instruction markup.
 *
 * Blank lines separate paragraphs. `[yellow]copy[/yellow]` applies the
 * tutorial's yellow inline emphasis, while `[purple]copy[purple]` uses the
 * event-frame purple.
 */
export function parseTutorialInstructionMarkup(
  source: string,
): readonly TutorialInstructionParagraph[] {
  return source
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map(parseParagraph);
}

/** Return the player-visible copy with highlight tags removed. */
export function tutorialInstructionPlainText(source: string): string {
  return source.replace(KNOWN_TAG_PATTERN, "");
}
