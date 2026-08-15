import type { PoolVariant } from "../../draft/pool/types";
import type { CardData } from "../../types/cards";
import type { CardId } from "../../types/card-identity";
import type {
  ResolvedDreamAvatarPackage,
  Tides4ProvenanceSummary,
} from "../../types/content";
import { serializeCardNumber, type DraftState } from "../../types/draft";
import type { CardChoiceGridCardView as CardGalleryCardView } from "../../cumulus/components/card/CardChoiceGrid";
import type {
  PoolViewerCostFilter,
  PoolViewerDisclosureView,
  PoolViewerFilterView,
  PoolViewerSortId,
  PoolViewerSourceId,
  PoolViewerTitleKind,
  PoolViewerView,
} from "../../cumulus/screens/PoolViewerScreen";
import { txa } from "@trox/runtime";
import { localizedSourceText } from "../../runtime/localization/runtime";
import type { DeckEntryId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";

export const DEFAULT_POOL_VIEWER_FILTERS: PoolViewerFilterView = {
  query: "",
  sort: "name",
  direction: "asc",
  type: "all",
  subtype: "",
  cost: "all",
};

interface PoolEntry {
  entryId: DeckEntryId;
  card: CardData;
  copies: number | null;
}

export interface BuildPoolViewerViewInput {
  cardDatabase: ReadonlyMap<number, CardData>;
  draftState: DraftState | null;
  resolvedPackage: ResolvedDreamAvatarPackage | null;
  poolVariant: PoolVariant | null;
  tides4Provenance: Tides4ProvenanceSummary | null;
  source: PoolViewerSourceId;
  filters: PoolViewerFilterView;
  title: PoolViewerTitleKind;
  frame: "fullScreen" | "floating";
}

/** External state/effect inputs for the thin shared PoolViewer adapter. */
export interface PoolViewerAdapterInput {
  cardDatabase: ReadonlyMap<number, CardData>;
  draftState: DraftState | null;
  isOpen: boolean;
  onClose: () => void;
  onPoolCardDragEnd?: () => void;
  onPoolCardDragStart?: (card: CardData) => void;
  poolVariant?: PoolVariant | null;
  resolvedPackage?: ResolvedDreamAvatarPackage | null;
  tides4Provenance?: Tides4ProvenanceSummary | null;
  title?: PoolViewerTitleKind;
  variant?: "overlay" | "floating";
}

/** Maps complete domain inputs into deterministic screen data with UUID-based identity. */
export function buildPoolViewerView(
  input: BuildPoolViewerViewInput,
): PoolViewerView {
  const byId = cardsById(input.cardDatabase);
  const sources = sourceOptions(input.resolvedPackage, input.tides4Provenance);
  const source = sources.includes(input.source)
    ? input.source
    : (sources[0] ?? "run");
  const entries = entriesFor(source, input, byId);
  const filtered = filterEntries(entries, input.filters);
  const cards = filtered.map((entry) => cardView(entry));
  const disclosures = buildDisclosures(
    input.tides4Provenance,
    input.poolVariant,
  );
  return {
    title: input.title,
    frame: input.frame,
    source,
    sourceOptions: sources,
    filters: input.filters,
    cards,
    totalCount: entries.length,
    visibleCount: cards.length,
    sortOptions: ["name", "cardNumber", "cost", "type", "subtype", "spark"],
    subtypeOptions: subtypeOptions(entries),
    disclosures,
  };
}

function cardsById(
  database: ReadonlyMap<number, CardData>,
): ReadonlyMap<CardId, CardData> {
  return new Map([...database.values()].map((card) => [card.id, card]));
}

function sourceOptions(
  pkg: ResolvedDreamAvatarPackage | null,
  tides: Tides4ProvenanceSummary | null,
) {
  const ids: PoolViewerSourceId[] = [
    "run",
    ...(tides?.tides.length ? ["tides" as const] : []),
    "catalog",
  ];
  if ((pkg?.dreamAvatar.signatureCardIds?.length ?? 0) > 0)
    ids.push("signature");
  return ids;
}

function entriesFor(
  source: PoolViewerSourceId,
  input: BuildPoolViewerViewInput,
  byId: ReadonlyMap<CardId, CardData>,
): PoolEntry[] {
  if (source === "catalog")
    return [...input.cardDatabase.values()].map((card) =>
      entry("catalog", card, null),
    );
  if (source === "run")
    return input.draftState === null
      ? []
      : Object.entries(input.draftState.remainingCopiesByCard).flatMap(
          ([number, copies]) => {
            const card = input.cardDatabase.get(Number(number));
            return card === undefined || copies <= 0
              ? []
              : [entry("run", card, copies)];
          },
        );
  if (source === "signature")
    return (input.resolvedPackage?.dreamAvatar.signatureCardIds ?? []).flatMap(
      (id, index) => {
        const card = byId.get(id);
        return card === undefined
          ? []
          : [
              {
                ...entry("signature", card, null),
                entryId: parseDeckEntryId(`signature:${String(index)}:${card.id}`),
              },
            ];
      },
    );
  if (source === "tides")
    return tideEntries(input.tides4Provenance, input.cardDatabase);
  return [];
}

function entry(
  source: PoolViewerSourceId,
  card: CardData,
  copies: number | null,
): PoolEntry {
  return { entryId: parseDeckEntryId(`${source}:${card.id}`), card, copies };
}

function tideEntries(
  provenance: Tides4ProvenanceSummary | null,
  database: ReadonlyMap<number, CardData>,
): PoolEntry[] {
  if (provenance === null) return [];
  return provenance.tides.flatMap((tide) =>
    tide.cardNumbers.flatMap((number, index) => {
      const card = database.get(number);
      const copies =
        provenance.cardProvenanceByNumber[serializeCardNumber(number)]?.copies ??
        null;
      return card === undefined
        ? []
        : [
            {
              ...entry("tides", card, copies),
              entryId: parseDeckEntryId(
                `tides:${tide.id}:${String(index)}:${card.id}`,
              ),
            },
          ];
    }),
  );
}

function filterEntries(
  entries: readonly PoolEntry[],
  filters: PoolViewerFilterView,
): PoolEntry[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      const card = entry.card;
      return (
        (query === "" ||
          card.name.toLocaleLowerCase().includes(query) ||
          card.renderedText.toLocaleLowerCase().includes(query)) &&
        (filters.type === "all" ||
          card.cardType.toLocaleLowerCase() === filters.type) &&
        (filters.subtype === "" || card.subtype === filters.subtype) &&
        matchesCost(card.energyCost, filters.cost)
      );
    })
    .sort(
      (a, b) =>
        compareEntry(
          a.entry.card,
          b.entry.card,
          filters.sort,
          filters.direction,
        ) || a.index - b.index,
    )
    .map(({ entry }) => entry);
}

function matchesCost(
  cost: number | null,
  filter: PoolViewerCostFilter,
): boolean {
  return (
    filter === "all" ||
    (filter === "x"
      ? cost === null
      : filter === "5plus"
        ? cost !== null && cost >= 5
        : cost === Number(filter))
  );
}
function compareEntry(
  left: CardData,
  right: CardData,
  sort: PoolViewerSortId,
  direction: PoolViewerFilterView["direction"],
): number {
  const value = (card: CardData): string | number =>
    sort === "cardNumber"
      ? card.cardNumber
      : sort === "cost"
        ? (card.energyCost ?? Number.POSITIVE_INFINITY)
        : sort === "type"
          ? card.cardType
          : sort === "subtype"
            ? card.subtype
            : sort === "spark"
              ? (card.spark ?? Number.POSITIVE_INFINITY)
              : card.name;
  const a = value(left);
  const b = value(right);
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, {
          numeric: true,
          sensitivity: "base",
        });
  return direction === "asc" ? result : -result;
}

function cardView(entry: PoolEntry): CardGalleryCardView {
  return {
    entryId: entry.entryId,
    model: { cardId: entry.card.id, displaySnapshot: entry.card },
    caption:
      entry.copies === null
        ? undefined
        : {
            kind: "text",
            message: txa(
              "×{copies}",
              { copies: entry.copies },
              "[pool-viewer] Compact Pool Viewer caption showing how many copies of one card are present. copies is a positive whole-number count.",
            ),
          },
    testId: `pool-card-${entry.entryId}`,
  };
}
function subtypeOptions(entries: readonly PoolEntry[]) {
  return [
    ...new Set(
      entries
        .filter(
          ({ card }) =>
            card.cardType === "Character" &&
            card.subtype.trim() !== "" &&
            card.subtype !== "*",
        )
        .map(({ card }) => card.subtype),
    ),
  ]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((value) => ({ value, label: localizedSourceText(value) }));
}

function buildDisclosures(
  tides: Tides4ProvenanceSummary | null,
  variant: PoolVariant | null,
) {
  const rows: PoolViewerDisclosureView[] = [];
  if (tides !== null)
    rows.push({
      id: "tides",
      tideCount: tides.tides.length,
      dealSize: tides.dealSize,
      copyCap: tides.cap,
      facetDrawnCount: tides.facetDrawnCount,
      facetAvailableCount: tides.facetAvailableCount,
    });
  if (tides === null && variant !== null)
    rows.push({ id: "algorithm", variant });
  return rows;
}
