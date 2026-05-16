// Quest state → journey context translation.
//
// Together with `content-bridge.ts` and `seed.ts`, this module is the only
// place under `src/journeys/` that may import from `src/types/`. Everything
// downstream (the generation pipeline, shape plugins, predicate resolvers,
// validators) consumes the `JourneyContext` this builder returns.

import { sha256 } from "js-sha256";

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
    const cardId = cardIdByNumber.get(entry.cardNumber);
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
  const starterCardIds = new Set<string>();

  for (const card of content.cards) {
    cardIdByNumber.set(card.cardNumber, card.id);
    cardNameByNumber.set(card.cardNumber, card.name);
    if (card.rarity === "Starter") {
      starterCardIds.add(card.id);
    }
  }

  const deckEntries = projectDeck(questState.deck, cardIdByNumber);
  const banes = projectBanes(questState.deck, cardNameByNumber);
  const draftPool = projectDraftPool(
    questState.resolvedPackage?.draftPoolCopiesByCard ?? {},
  );
  const selectedTides = questState.resolvedPackage?.selectedTides ?? [];
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
    selectedTides: [...selectedTides],
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
    content,
    contentVersion: computeContentVersion(content),
  };
}
