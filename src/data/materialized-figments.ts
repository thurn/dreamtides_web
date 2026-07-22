import {
  figmentCatalogEntries,
  type FigmentCatalogEntry,
} from "../battle/state/figment-catalog";
import { asCardId, asCardName } from "../types/card-identity";
import type { FrozenCardData } from "../types/cards";

/** A figment card explicitly named by a materialize instruction. */
export interface MaterializedFigmentPreview {
  /** Stable authored figment UUID and complete display snapshot. */
  readonly card: FrozenCardData;
  /** Whether this named figment needs the optional title bar. */
  readonly titleBar: boolean;
}

const MATERIALIZED_FIGMENT_PATTERN =
  /\bmaterialize\b([^.!?\n:]*?)\bfigments?\b/giu;

function hasDelimitedPhrase(value: string, phrase: string): boolean {
  let fromIndex = 0;
  while (fromIndex <= value.length - phrase.length) {
    const index = value.indexOf(phrase, fromIndex);
    if (index < 0) return false;
    const before = index === 0 ? "" : value[index - 1] ?? "";
    const after = value[index + phrase.length] ?? "";
    const beforeDelimited = before === "" || !/[\p{L}\p{N}]/u.test(before);
    const afterDelimited = after === "" || !/[\p{L}\p{N}]/u.test(after);
    if (beforeDelimited && afterDelimited) return true;
    fromIndex = index + phrase.length;
  }
  return false;
}

function referencedEntry(
  descriptor: string,
  entries: readonly FigmentCatalogEntry[],
): FigmentCatalogEntry | undefined {
  const normalized = descriptor.toLocaleLowerCase();
  const matches: Array<{
    readonly entry: FigmentCatalogEntry;
    readonly authoredName: boolean;
    readonly length: number;
  }> = [];
  for (const entry of entries) {
    const candidates = [
      ...(entry.name === undefined
        ? []
        : [{ value: entry.name, authoredName: true }]),
      { value: entry.subtype, authoredName: false },
    ];
    for (const candidate of candidates) {
      const phrase = candidate.value.trim().toLocaleLowerCase();
      if (phrase !== "" && hasDelimitedPhrase(normalized, phrase)) {
        matches.push({
          entry,
          authoredName: candidate.authoredName,
          length: phrase.length,
        });
      }
    }
  }
  matches.sort(
    (left, right) =>
      Number(right.authoredName) - Number(left.authoredName) ||
      right.length - left.length,
  );
  return matches[0]?.entry;
}

function needsTitleBar(entry: FigmentCatalogEntry): boolean {
  const name = entry.name?.replace(/\s*Figment$/iu, "").trim().toLowerCase() ?? "";
  return name !== "" && name !== entry.subtype.trim().toLowerCase();
}

function previewFor(
  entry: FigmentCatalogEntry,
  cardNumber: number,
): MaterializedFigmentPreview {
  const name = entry.name?.trim() || entry.subtype.trim();
  return Object.freeze({
    card: Object.freeze({
      id: asCardId(entry.id),
      name: asCardName(name),
      cardNumber,
      cardType: "Character",
      subtype: entry.subtype,
      isStarter: false,
      energyCost: 0,
      spark: entry.baseSpark,
      isFast: false,
      renderedText: entry.renderedText ?? "",
      imageNumber: entry.imageNumber ?? 0,
      artOwned: entry.artOwned ?? false,
      ...(entry.art === undefined ? {} : { art: entry.art }),
    }),
    titleBar: needsTitleBar(entry),
  });
}

/**
 * Extract the distinct authored figment cards explicitly produced by rules
 * text, in reading order. Generic references such as “materialize a figment”
 * and uses of “non-figment” do not resolve to a card.
 */
export function extractMaterializedFigmentPreviews(
  text: string,
): readonly MaterializedFigmentPreview[] {
  const entries = figmentCatalogEntries();
  const indexById = new Map(entries.map((entry, index) => [entry.id, index]));
  const seen = new Set<string>();
  const previews: MaterializedFigmentPreview[] = [];
  for (const match of text.matchAll(MATERIALIZED_FIGMENT_PATTERN)) {
    const entry = referencedEntry(match[1] ?? "", entries);
    if (entry === undefined || seen.has(entry.id)) continue;
    seen.add(entry.id);
    previews.push(previewFor(entry, (indexById.get(entry.id) ?? 0) + 1));
  }
  return Object.freeze(previews);
}
