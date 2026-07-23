/** Named inline colors supported by authored tutorial instructions. */
export type TutorialInstructionHighlightColor = "yellow";

/** One continuous run of tutorial instruction copy. */
export interface TutorialInstructionSpan {
  readonly text: string;
  readonly highlight?: TutorialInstructionHighlightColor;
}

/** One paragraph of parsed tutorial instruction copy. */
export interface TutorialInstructionParagraph {
  readonly spans: readonly TutorialInstructionSpan[];
}

const KNOWN_TAG_PATTERN = /\[\/?yellow\]/gu;
const MARKUP_LIKE_TAG_PATTERN = /\[\/?[A-Za-z][A-Za-z0-9-]*\]/gu;

function parseParagraph(
  paragraph: string,
  paragraphIndex: number,
): TutorialInstructionParagraph {
  const unsupportedTag = paragraph
    .match(MARKUP_LIKE_TAG_PATTERN)
    ?.find((tag) => tag !== "[yellow]" && tag !== "[/yellow]");
  if (unsupportedTag !== undefined) {
    throw new Error(
      `Tutorial instruction paragraph ${String(paragraphIndex + 1)} uses unsupported highlight tag ${JSON.stringify(unsupportedTag)}.`,
    );
  }

  const spans: TutorialInstructionSpan[] = [];
  let cursor = 0;
  let highlighted = false;
  let highlightedTextStart = -1;

  for (const match of paragraph.matchAll(KNOWN_TAG_PATTERN)) {
    const tag = match[0];
    const index = match.index;
    if (index === undefined) continue;

    if (tag === "[yellow]") {
      if (highlighted) {
        throw new Error(
          `Tutorial instruction paragraph ${String(paragraphIndex + 1)} cannot nest yellow highlights.`,
        );
      }
      if (index > cursor) spans.push({ text: paragraph.slice(cursor, index) });
      highlighted = true;
      highlightedTextStart = index + tag.length;
      cursor = highlightedTextStart;
      continue;
    }

    if (!highlighted) {
      throw new Error(
        `Tutorial instruction paragraph ${String(paragraphIndex + 1)} has a closing yellow tag without an opening tag.`,
      );
    }
    if (index === highlightedTextStart) {
      throw new Error(
        `Tutorial instruction paragraph ${String(paragraphIndex + 1)} has an empty yellow highlight.`,
      );
    }
    spans.push({
      text: paragraph.slice(cursor, index),
      highlight: "yellow",
    });
    highlighted = false;
    highlightedTextStart = -1;
    cursor = index + tag.length;
  }

  if (highlighted) {
    throw new Error(
      `Tutorial instruction paragraph ${String(paragraphIndex + 1)} has an unclosed yellow highlight.`,
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
 * tutorial's yellow inline emphasis to exactly the enclosed copy.
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
  return source.replace(/\[\/?yellow\]/gu, "");
}
