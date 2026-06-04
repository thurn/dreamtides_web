// Quest state → journey context translation.
//
// Together with `content-bridge.ts` and `seed.ts`, this module is the only
// place under `src/journeys/` that may import from `src/types/`. Everything
// downstream (the generation pipeline, shape plugins, predicate resolvers,
// validators) consumes the `JourneyContext` this builder returns.

import { sha256 } from "js-sha256";

import { applyCardKeywordModification } from "../../card-type-change";
import type { ContentBundle } from "../content/types";
import type {
  JourneyContext,
  ProjectedDeckEntryTransfiguration,
  QuestStateProjection,
} from "../journey/context";
import { EFFECT_CATALOG_VERSION } from "../journey/effects";
import { MANIFEST_CONTRACT_VERSION, MANIFEST_SCHEMA_VERSION } from "../journey/manifest";
import { stableStringify } from "../util/stableJson";
import { journeySeedForSite } from "./seed";
import type { DeckEntry, QuestState, SiteState } from "../../types/quest";

/**
 * Project the quest-prototype deck into the journey's `deck.entries` shape.
 * Each deck entry surfaces as a `{ cardId, copies, entryIds }` row where
 * `cardId` is the card's prototype id resolved from `cardNumber` via the
 * supplied lookup. Multiple deck entries that share a `cardNumber` collapse
 * into a single entry whose `copies` is the count, while `entryIds` and
 * `entryTransfigurations` preserve the concrete deck rows used by apply-time
 * mutations.
 */
function projectDeck(
  deck: readonly DeckEntry[],
  cardIdByNumber: ReadonlyMap<number, string>,
  cardIdByEntryId: ReadonlyMap<string, string> = new Map(),
): QuestStateProjection["deck"]["entries"] {
  const entriesById = new Map<
    string,
    {
      copies: number;
      entryIds: string[];
      entryTransfigurations: ProjectedDeckEntryTransfiguration[];
    }
  >();

  for (const entry of deck) {
    const cardId = cardIdByEntryId.get(entry.entryId) ?? cardIdByNumber.get(entry.cardNumber);
    if (cardId === undefined) {
      // Orphan: deck entry references a cardNumber missing from the content
      // bundle. Skip it so generation can continue against a partial catalog
      // (e.g. mid-migration card-database mismatches). Warn so a developer
      // grepping the logs can find the source row.
      console.warn(
        `[journeys/adapter] Deck entry references unknown cardNumber=${entry.cardNumber}; skipping`,
      );
      continue;
    }
    const existing = entriesById.get(cardId) ?? {
      copies: 0,
      entryIds: [],
      entryTransfigurations: [],
    };
    existing.copies += 1;
    existing.entryIds.push(entry.entryId);
    existing.entryTransfigurations.push(entry.transfiguration ?? null);
    entriesById.set(cardId, existing);
  }

  return Array.from(entriesById, ([cardId, entry]) => ({
    cardId,
    copies: entry.copies,
    entryIds: entry.entryIds,
    entryTransfigurations: entry.entryTransfigurations,
  }));
}

function modifiedCardId(baseCardId: string, entryId: string): string {
  return `${baseCardId}::deck-entry:${entryId}:card-modification`;
}

function rawString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function applyDeckEntryModificationToJourneyCard(
  card: ContentBundle["cards"][number],
  entry: DeckEntry,
): ContentBundle["cards"][number] {
  const typeChange = entry.typeChange;
  const keywordModification = entry.keywordModification;
  const hasFastModification = keywordModification?.fast === true;
  const hasReclaimModification =
    keywordModification?.reclaim !== undefined && keywordModification.reclaim > 0;
  if (typeChange == null && !hasFastModification && !hasReclaimModification) {
    return card;
  }
  const id = modifiedCardId(card.id, entry.entryId);
  const cardType = typeChange?.cardType ?? card.cardType;
  const subtype = typeChange?.subtype ?? card.raw.subtype;
  const isFast = hasFastModification ? true : card.raw["is-fast"];
  const renderedText = applyCardKeywordModification(
    {
      isFast: card.raw["is-fast"] === true || card.raw.isFast === true,
      renderedText: rawString(card.raw["rendered-text"] ?? card.raw.renderedText),
    },
    keywordModification,
  ).renderedText;
  return {
    ...card,
    id,
    cardType,
    raw: {
      ...card.raw,
      id,
      "card-type": cardType,
      cardType,
      subtype,
      "rendered-text": renderedText,
      renderedText,
      "is-fast": isFast,
      isFast,
    },
  };
}

/**
 * Project bane-flagged deck entries to the journey's `banes` projection.
 * The `baneName` carried on each row is the card's display name, looked up
 * via `cardNumber` so the projection survives a card-database mismatch
 * without crashing - the bane is simply skipped when no matching card
 * exists.
 */
function projectBanes(
  deck: readonly DeckEntry[],
  cardNameByNumber: ReadonlyMap<number, string>,
): { readonly baneName: string }[] {
  return deck
    .filter((entry) => entry.isBane)
    .map((entry) => {
      const name = cardNameByNumber.get(entry.cardNumber);
      if (name === undefined) {
        // Orphan: bane-flagged entry references a cardNumber missing from the
        // content bundle. Mirror `projectDeck`'s graceful-degradation
        // behaviour and warn so the orphan is greppable.
        console.warn(
          `[journeys/adapter] Bane deck entry references unknown cardNumber=${entry.cardNumber}; skipping`,
        );
        return null;
      }
      return { baneName: name };
    })
    .filter((value): value is { baneName: string } => value !== null);
}

/**
 * Project `state.resolvedPackage.draftPoolCopiesByCard` to the journey's
 * `draftPool` shape. The CLI keeps draft pools as `{ cardId, copies }`
 * rows; preserving the same shape means downstream predicate resolvers can
 * iterate the projection without a special case.
 */
function projectDraftPool(
  copiesByCard: Record<string, number>,
): { readonly cardId: string; readonly copies: number }[] {
  return Object.entries(copiesByCard).map(([cardId, copies]) => ({ cardId, copies }));
}

/**
 * Compute the deck summary the journey side reads. The fields are
 * pre-aggregated here so shape plugins do not need to scan the deck during
 * generation.
 */
function summarizeDeck(
  entries: readonly { readonly cardId: string; readonly copies: number }[],
  starterCardIds: ReadonlySet<string>,
): QuestStateProjection["deck"]["summary"] {
  const totalCards = entries.reduce((total, entry) => total + entry.copies, 0);
  const starterCards = entries
    .filter((entry) => starterCardIds.has(entry.cardId))
    .reduce((total, entry) => total + entry.copies, 0);

  return {
    totalCards,
    starterCards,
    uniqueCards: entries.length,
  };
}

/**
 * Compute a stable content version that changes whenever the content
 * fingerprint changes. The hash takes the journey side's catalog version
 * constants together with a stable serialisation of the catalog contents.
 * Quest content changes invalidate cached manifests through this fingerprint.
 */
function computeContentVersion(content: ContentBundle): string {
  const fingerprint = stableStringify({
    effectCatalog: EFFECT_CATALOG_VERSION,
    manifestSchema: MANIFEST_SCHEMA_VERSION,
    manifestContract: MANIFEST_CONTRACT_VERSION,
    cards: content.cards.map((card) => ({
      id: card.id,
      name: card.name,
      cardNumber: card.cardNumber,
      cardType: card.cardType,
      energyCost: card.energyCost,
      spark: card.spark,
      rarity: card.rarity,
      tides: card.tides,
    })),
    dreamcallers: content.dreamcallers.map((dreamcaller) => ({
      id: dreamcaller.id,
      name: dreamcaller.name,
      mandatoryTides: dreamcaller.mandatoryTides,
      optionalTides: dreamcaller.optionalTides,
    })),
    dreamsigns: content.dreamsigns.map((dreamsign) => ({
      id: dreamsign.id,
      name: dreamsign.name,
      kind: dreamsign.kind,
      tides: dreamsign.tides,
    })),
  });
  return `content:${sha256(fingerprint).slice(0, 16)}`;
}

/**
 * Build a `JourneyContext` from live quest state, the prebuilt journey
 * content bundle, and the site the journey is rooted at.
 *
 * The function is pure: callers may memoize the result against
 * `(questState, content, site)` and trust that two calls with identical
 * inputs yield identical output.
 */
export function buildJourneyContext(
  questState: QuestState,
  content: ContentBundle,
  site: SiteState,
): JourneyContext {
  const cardIdByNumber = new Map<number, string>();
  const cardNameByNumber = new Map<number, string>();
  const cardsByNumber = new Map<number, ContentBundle["cards"][number]>();
  const cardIdByEntryId = new Map<string, string>();
  const starterCardIds = new Set<string>();
  const effectiveCards = [...content.cards];

  for (const card of content.cards) {
    cardIdByNumber.set(card.cardNumber, card.id);
    cardNameByNumber.set(card.cardNumber, card.name);
    cardsByNumber.set(card.cardNumber, card);
    if (card.rarity === "Starter") {
      starterCardIds.add(card.id);
    }
  }

  for (const entry of questState.deck) {
    if (
      entry.typeChange == null
      && entry.keywordModification?.fast !== true
      && (entry.keywordModification?.reclaim === undefined
        || entry.keywordModification.reclaim <= 0)
    ) {
      continue;
    }
    const card = cardsByNumber.get(entry.cardNumber);
    if (card === undefined) {
      continue;
    }
    const changedCard = applyDeckEntryModificationToJourneyCard(card, entry);
    cardIdByEntryId.set(entry.entryId, changedCard.id);
    effectiveCards.push(changedCard);
    if (card.rarity === "Starter") {
      starterCardIds.add(changedCard.id);
    }
  }

  const effectiveContent: ContentBundle = {
    ...content,
    cards: effectiveCards,
  };

  const deckEntries = projectDeck(questState.deck, cardIdByNumber, cardIdByEntryId);
  const banes = projectBanes(questState.deck, cardNameByNumber);
  const draftPool = projectDraftPool(
    questState.resolvedPackage?.draftPoolCopiesByCard ?? {},
  );
  const activeDreamsigns = questState.dreamsigns.map((dreamsign) => ({
    dreamsignId: dreamsign.id ?? dreamsign.name,
  }));

  const projection: QuestStateProjection = {
    seed: journeySeedForSite(site, questState),
    resources: {
      essence: questState.essence,
      maxEssence: questState.essenceCap,
      omens: questState.omens,
      // Spec specified `dreamscape: state.currentDreamscape?.number ?? 0`, but
      // the prototype types `currentDreamscape` as `string | null` (a node id).
      // `completionLevel` is the prototype's equivalent numeric dreamscape
      // counter, so it fills the same role for downstream resolvers.
      dreamscape: questState.completionLevel,
    },
    deck: {
      entries: deckEntries,
      summary: summarizeDeck(deckEntries, starterCardIds),
    },
    draftPool,
    activeDreamsigns,
    dreamsignPoolIds: [...questState.remainingDreamsignPool],
    banes,
    // Empty-string sentinel when no dreamcaller is set: catalog dreamcaller
    // ids are non-empty in practice, so `id === ""` cannot accidentally match
    // a real dreamcaller in `effects.ts`'s `dreamcallerMatches` filter.
    dreamcaller: { id: questState.dreamcaller?.id ?? "" },
  };

  return {
    state: { quest: projection },
    content: effectiveContent,
    contentVersion: computeContentVersion(effectiveContent),
  };
}
