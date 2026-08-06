import type { DraftRecord } from "../../data/cards-v2-database";
import { seedProvenanceVariantCopy } from "../../draft/pool/seed-provenance-copy";
import type { PoolVariant } from "../../draft/pool/types";
import type { CardData } from "../../types/cards";
import type { ResolvedDreamAvatarPackage, SeedProvenanceSummary, Tides4ProvenanceSummary } from "../../types/content";
import type { DraftState } from "../../types/draft";
import type { CardChoiceGridCardView as CardGalleryCardView } from "../../cumulus/components/card/CardChoiceGrid";
import type { PoolViewerCostFilter, PoolViewerDisclosureView, PoolViewerFilterView, PoolViewerReplayRowView, PoolViewerSourceId, PoolViewerView } from "../../cumulus/screens/PoolViewerScreen";

export const DEFAULT_POOL_VIEWER_FILTERS: PoolViewerFilterView = {
  query: "",
  sort: "name",
  direction: "asc",
  type: "all",
  subtype: "",
  cost: "all",
};

interface PoolEntry {
  entryId: string;
  card: CardData;
  copies: number | null;
}

export interface BuildPoolViewerViewInput {
  cardDatabase: ReadonlyMap<number, CardData>;
  draftState: DraftState | null;
  resolvedPackage: ResolvedDreamAvatarPackage | null;
  replayRecord: DraftRecord | null;
  poolVariant: PoolVariant | null;
  seedProvenance: SeedProvenanceSummary | null;
  tides4Provenance: Tides4ProvenanceSummary | null;
  source: PoolViewerSourceId;
  filters: PoolViewerFilterView;
  title: string;
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
  replayRecord?: DraftRecord | null;
  resolvedPackage?: ResolvedDreamAvatarPackage | null;
  seedProvenance?: SeedProvenanceSummary | null;
  tides4Provenance?: Tides4ProvenanceSummary | null;
  title?: string;
  variant?: "overlay" | "floating";
}

const SOURCE_LABELS: Record<PoolViewerSourceId, string> = {
  run: "Run Pool", tides: "Tide Decks", catalog: "All Cards", idf3: "IDF3 Decklist", signature: "Signature Cards", deck: "Record Deck", history: "Pick History",
};

const EMPTY_LABELS: Record<PoolViewerSourceId, string> = {
  run: "No run pool cards are available.", tides: "This run was not built from tide decks.", catalog: "No cards match the current filters.", idf3: "No IDF3 starting decklist is available for this run.", signature: "This avatar has no signature cards.", deck: "The replay record has no resolvable deck cards.", history: "The replay record has no pick history.",
};

/** Maps complete domain inputs into deterministic screen data with UUID-based identity. */
export function buildPoolViewerView(input: BuildPoolViewerViewInput): PoolViewerView {
  const byId = cardsById(input.cardDatabase);
  const isReplay = input.draftState?.mode === "replay" && input.replayRecord !== null;
  const sources = sourceOptions(isReplay, input.resolvedPackage, input.tides4Provenance);
  const source = sources.some((option) => option.id === input.source) ? input.source : sources[0]?.id ?? "run";
  const entries = entriesFor(source, input, byId);
  const filtered = filterEntries(entries, input.filters);
  const cards = filtered.map((entry) => cardView(entry));
  const replayRows = source === "history" && input.replayRecord !== null ? buildReplayRows(input.replayRecord, byId) : [];
  const disclosures = buildDisclosures(input.seedProvenance, input.tides4Provenance, input.replayRecord, source, input.poolVariant, isReplay);
  return {
    title: input.title,
    frame: input.frame,
    source,
    sourceOptions: sources,
    filters: input.filters,
    cards,
    totalCount: source === "history" ? replayRows.length : entries.length,
    visibleCount: source === "history" ? replayRows.length : cards.length,
    emptyLabel: EMPTY_LABELS[source],
    sortOptions: [
      { value: "name", label: "Name" }, { value: "cardNumber", label: "Number" }, { value: "cost", label: "Cost" }, { value: "type", label: "Type" }, { value: "subtype", label: "Subtype" }, { value: "spark", label: "Spark" },
    ],
    subtypeOptions: subtypeOptions(entries),
    disclosures,
    replayRows,
    error: null,
  };
}

function cardsById(database: ReadonlyMap<number, CardData>): ReadonlyMap<string, CardData> {
  return new Map([...database.values()].map((card) => [card.id.toLowerCase(), card]));
}

function sourceOptions(isReplay: boolean, pkg: ResolvedDreamAvatarPackage | null, tides: Tides4ProvenanceSummary | null) {
  const ids: PoolViewerSourceId[] = isReplay ? ["deck", "history", "catalog"] : ["run", ...(tides?.tides.length ? ["tides" as const] : []), "catalog"];
  if (!isReplay && (pkg?.starterDecklistCardNumbers?.length ?? 0) > 0) ids.push("idf3");
  if ((pkg?.dreamAvatar.signatureCardIds?.length ?? 0) > 0) ids.push("signature");
  return ids.map((id) => ({ id, label: SOURCE_LABELS[id] }));
}

function entriesFor(source: PoolViewerSourceId, input: BuildPoolViewerViewInput, byId: ReadonlyMap<string, CardData>): PoolEntry[] {
  if (source === "catalog") return [...input.cardDatabase.values()].map((card) => entry("catalog", card, null));
  if (source === "run") return input.draftState?.mode === "pool" ? Object.entries(input.draftState.remainingCopiesByCard).flatMap(([number, copies]) => {
    const card = input.cardDatabase.get(Number(number));
    return card === undefined || copies <= 0 ? [] : [entry("run", card, copies)];
  }) : [];
  if (source === "idf3") return (input.resolvedPackage?.starterDecklistCardNumbers ?? []).flatMap((number, index) => {
    const card = input.cardDatabase.get(number); return card === undefined ? [] : [{ ...entry("idf3", card, null), entryId: `idf3:${String(index)}:${card.id}` }];
  });
  if (source === "signature") return (input.resolvedPackage?.dreamAvatar.signatureCardIds ?? []).flatMap((id, index) => {
    const card = byId.get(id.toLowerCase()); return card === undefined ? [] : [{ ...entry("signature", card, null), entryId: `signature:${String(index)}:${card.id}` }];
  });
  if (source === "deck") return deckEntries(input.replayRecord?.mainboardIds ?? [], byId);
  if (source === "tides") return tideEntries(input.tides4Provenance, input.cardDatabase);
  return [];
}

function entry(source: string, card: CardData, copies: number | null): PoolEntry { return { entryId: `${source}:${card.id}`, card, copies }; }

function deckEntries(ids: readonly string[], byId: ReadonlyMap<string, CardData>): PoolEntry[] {
  const occurrences = new Map<string, { card: CardData; count: number; index: number }>();
  ids.forEach((id, index) => { const card = byId.get(id.toLowerCase()); if (card !== undefined) { const current = occurrences.get(card.id); occurrences.set(card.id, current === undefined ? { card, count: 1, index } : { ...current, count: current.count + 1 }); } });
  return [...occurrences.values()].sort((a, b) => a.index - b.index).map(({ card, count }) => entry("deck", card, count));
}

function tideEntries(provenance: Tides4ProvenanceSummary | null, database: ReadonlyMap<number, CardData>): PoolEntry[] {
  if (provenance === null) return [];
  return provenance.tides.flatMap((tide) => tide.cardNumbers.flatMap((number, index) => { const card = database.get(number); const copies = provenance.cardProvenanceByNumber[String(number)]?.copies ?? null; return card === undefined ? [] : [{ ...entry("tides", card, copies), entryId: `tides:${tide.id}:${String(index)}:${card.id}` }]; }));
}

function filterEntries(entries: readonly PoolEntry[], filters: PoolViewerFilterView): PoolEntry[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => {
    const card = entry.card;
    return (query === "" || card.name.toLocaleLowerCase().includes(query) || card.renderedText.toLocaleLowerCase().includes(query)) &&
      (filters.type === "all" || card.cardType.toLocaleLowerCase() === filters.type) &&
      (filters.subtype === "" || card.subtype === filters.subtype) && matchesCost(card.energyCost, filters.cost);
  }).sort((a, b) => compareEntry(a.entry.card, b.entry.card, filters.sort, filters.direction) || a.index - b.index).map(({ entry }) => entry);
}

function matchesCost(cost: number | null, filter: PoolViewerCostFilter): boolean { return filter === "all" || (filter === "x" ? cost === null : filter === "5plus" ? cost !== null && cost >= 5 : cost === Number(filter)); }
function compareEntry(left: CardData, right: CardData, sort: string, direction: PoolViewerFilterView["direction"]): number {
  const value = (card: CardData): string | number => sort === "cardNumber" ? card.cardNumber : sort === "cost" ? card.energyCost ?? Number.POSITIVE_INFINITY : sort === "type" ? card.cardType : sort === "subtype" ? card.subtype : sort === "spark" ? card.spark ?? Number.POSITIVE_INFINITY : card.name;
  const a = value(left); const b = value(right); const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

function cardView(entry: PoolEntry): CardGalleryCardView { return { entryId: entry.entryId, model: { cardId: entry.card.id, displaySnapshot: entry.card }, caption: entry.copies === null ? undefined : { kind: "text", text: `×${String(entry.copies)}` }, testId: `pool-card-${entry.entryId}` }; }
function subtypeOptions(entries: readonly PoolEntry[]) { return [...new Set(entries.filter(({ card }) => card.cardType === "Character" && card.subtype.trim() !== "").map(({ card }) => card.subtype))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value, label: value })); }

function buildReplayRows(record: DraftRecord, byId: ReadonlyMap<string, CardData>): PoolViewerReplayRowView[] {
  return record.packs.map((pack, pickIndex) => {
    const ids = record.packIds[pickIndex] ?? []; const picked = new Set((record.pickIds[pickIndex] ?? []).map((id) => id.toLowerCase()));
    const labels = (record.pickIds[pickIndex] ?? []).map((id, index) => byId.get(id.toLowerCase())?.name ?? record.picks[pickIndex]?.[index] ?? id);
    return { entryId: `replay:${record.id}:pick:${String(pickIndex + 1)}`, title: `Pick ${String(pickIndex + 1)}`, summary: labels.length > 0 ? `Chose ${labels.join(", ")}` : "No pick recorded", cards: pack.map((fallbackLabel, cardIndex) => { const id = ids[cardIndex]; const card = id === undefined ? undefined : byId.get(id.toLowerCase()); return { entryId: `replay:${record.id}:pick:${String(pickIndex + 1)}:card:${String(cardIndex)}`, label: card?.name ?? fallbackLabel, picked: id !== undefined && picked.has(id.toLowerCase()), cardId: card?.id ?? null }; }) };
  });
}

function buildDisclosures(seed: SeedProvenanceSummary | null, tides: Tides4ProvenanceSummary | null, record: DraftRecord | null, source: PoolViewerSourceId, variant: PoolVariant | null, replay: boolean) {
  const rows: PoolViewerDisclosureView[] = [];
  if (seed !== null) rows.push({ id: "seed", title: "Pool construction", summary: `algo: ${seed.variant}`, body: `Seed card ${seed.seedCardName}; ${String(seed.totalCopies)} copies across ${String(seed.distinctCardCount)} cards. ${seedProvenanceVariantCopy(seed.variant).poolViewerAffinityBasis}` });
  if (tides !== null) rows.push({ id: "tides", title: "Tide provenance", summary: `${String(tides.tides.length)} tides`, body: `Built to ${String(tides.dealSize)} cards at a ${String(tides.cap)}-copy cap; ${String(tides.facetDrawnCount)} of ${String(tides.facetAvailableCount)} theme tides were drawn.` });
  if (source === "deck" && record !== null) rows.push({ id: "record", title: "Replay record", summary: record.id, body: `Record deck loaded from ${record.sourceFile}.` });
  if (seed === null && tides === null && !replay && variant !== null) rows.push({ id: "algorithm", title: "Pool construction", summary: `algo: ${variant}`, body: "The active run pool is shown with its remaining copies." });
  return rows;
}
