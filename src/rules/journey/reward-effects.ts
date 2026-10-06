import { mergeCardKeywordModification } from "../../card-type-change";
import { createDreamsign } from "../../data/dreamsigns";
import type { JourneyContent } from "../../data/journey-content";
import { isNightmareCardId } from "../../data/nightmare";
import type { DreamsignTemplate } from "../../types/content";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntry,
  DreamAtlas,
  JourneyState,
  SiteState,
  SiteType,
  TransfigurationType,
} from "../../types/journey";
import type { DreamsignId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import type { AtlasNodeId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { deriveEntryIdCounter } from "./deck";
import type { CardId } from "../../types/card-identity";
import type { SiteId } from "../../types/identifiers";

/** A validated, concrete journey-state mutation produced by a site reward. */
export type JourneyRewardEffect =
  | {
      kind: "add_catalog_card";
      cardUuid: CardId;
      cardNumber: number;
      transfiguration?: TransfigurationType;
    }
  | {
      kind: "add_dreamsign";
      dreamsignId: DreamsignId;
      dreamsignTemplate: DreamsignTemplate;
    }
  | {
      kind: "transfigure_deck_entry";
      entryId: DeckEntryId;
      cardUuid: CardId;
      cardNumber: number;
      transfiguration: TransfigurationType;
    }
  | {
      kind: "duplicate_deck_entry";
      entryId: DeckEntryId;
      cardUuid: CardId;
      cardNumber: number;
    }
  | {
      kind: "remove_deck_entry";
      entryId: DeckEntryId;
      cardUuid: CardId;
      cardNumber: number;
    }
  | {
      kind: "change_deck_entry_keywords";
      entryId: DeckEntryId;
      cardUuid: CardId;
      cardNumber: number;
      keywords: CardKeywordModification;
    }
  | {
      kind: "change_deck_entry_type";
      entryId: DeckEntryId;
      cardUuid: CardId;
      cardNumber: number;
      typeChange: CardTypeChange;
    }
  | {
      kind: "add_deck_entry_spark_bonus";
      entryId: DeckEntryId;
      cardUuid: CardId;
      cardNumber: number;
      amount: number;
    }
  | {
      kind: "reduce_deck_entry_energy_cost";
      entryId: DeckEntryId;
      cardUuid: CardId;
      cardNumber: number;
      amount: number;
    }
  | {
      kind: "add_essence";
      amount: number;
    }
  | {
      kind: "add_site";
      siteType: SiteType;
    }
  | {
      kind: "insert_site";
      targetNodeId: AtlasNodeId;
      insertionIndex: number;
      siblingSiteIdsBefore: readonly SiteId[];
      site: SiteState;
    }
  | {
      kind: "composite";
      children: readonly JourneyRewardEffect[];
    };

interface EntryIdAllocator {
  next(): DeckEntryId;
}

function createEntryIdAllocator(
  deck: readonly DeckEntry[],
  mintEntryId?: (deck: readonly DeckEntry[], index: number) => DeckEntryId,
): EntryIdAllocator {
  if (mintEntryId !== undefined) {
    let index = 0;
    return {
      next() {
        const id = mintEntryId(deck, index);
        index += 1;
        return id;
      },
    };
  }
  let highWater = deriveEntryIdCounter(deck);
  return {
    next() {
      highWater += 1;
      return parseDeckEntryId(`deck-${String(highWater)}`);
    },
  };
}

function validateCatalogCard(
  journeyContent: JourneyContent,
  cardUuid: CardId,
  cardNumber: number,
): boolean {
  const card = journeyContent.cardDatabase.get(cardNumber);
  return card !== undefined && card.id === cardUuid;
}

function validateDeckTarget(
  state: JourneyState,
  journeyContent: JourneyContent,
  effect: { entryId: DeckEntryId; cardUuid: CardId; cardNumber: number },
): DeckEntry | null {
  const entry = state.deck.find(
    (candidate) => candidate.entryId === effect.entryId,
  );
  if (entry === undefined || entry.cardNumber !== effect.cardNumber)
    return null;
  return validateCatalogCard(journeyContent, effect.cardUuid, effect.cardNumber)
    ? entry
    : null;
}

/**
 * Count all sites across the atlas for deterministic id derivation.
 * Using total site count (not max site-N) ensures that applying the same
 * payload twice to states with different site counts yields distinct ids.
 */
function totalSiteCount(atlas: DreamAtlas): number {
  let count = 0;
  for (const node of Object.values(atlas.nodes)) {
    count += node.sites.length;
  }
  return count;
}

/**
 * Add a fresh, unvisited site of `siteType` to the current dreamscape.
 * No-ops when there is no current dreamscape or the node cannot be found.
 *
 * Site ids derive deterministically from `(sourceId, existing total site count)`
 * so that the regenerate-validate-apply pattern produces the same id on each
 * apply invocation of the same payload at the same state, and distinct ids when
 * the state already has a different number of sites (preventing id collision on
 * repeated rewards).
 *
 * Augury site rewards delegate here for `"current"` placement so every
 * offer shape shares one implementation.
 */
function addSiteToCurrentDreamscape(
  prev: JourneyState,
  siteType: SiteType,
  sourceId: SiteType,
): JourneyState {
  const targetId = prev.currentDreamscape;
  if (targetId === null || prev.atlas.nodes[targetId] === undefined) {
    return prev;
  }
  const count = totalSiteCount(prev.atlas);
  const newSite: SiteState = {
    id: parseSiteId(`site-augury-${sourceId}-${String(count)}`),
    type: siteType,
    isEnhanced: false,
    isVisited: false,
  };
  const node = prev.atlas.nodes[targetId];
  if (node === undefined) return prev;
  return {
    ...prev,
    atlas: {
      ...prev.atlas,
      nodes: {
        ...prev.atlas.nodes,
        [targetId]: { ...node, sites: [...node.sites, newSite] },
      },
    },
  };
}

function siteRecordsEqual(left: SiteState, right: SiteState): boolean {
  const exactKeys = ["id", "isEnhanced", "isVisited", "type"];
  return (
    Object.keys(left).sort().join("|") === exactKeys.join("|") &&
    Object.keys(right).sort().join("|") === exactKeys.join("|") &&
    left.id === right.id &&
    left.type === right.type &&
    left.isEnhanced === right.isEnhanced &&
    left.isVisited === right.isVisited &&
    left.randomSite === right.randomSite &&
    left.data === right.data
  );
}

/**
 * Commit an already-prepared site at one exact atlas position. Every
 * precondition is rechecked so a stale or forged reward cannot move, replace,
 * enhance, revisit, or duplicate a site.
 */
function insertPreparedSiteInJourneyState(
  prev: JourneyState,
  input: {
    targetNodeId: AtlasNodeId;
    insertionIndex: number;
    siblingSiteIdsBefore: readonly string[];
    site: SiteState;
  },
): JourneyState | null {
  if (
    prev.currentDreamscape !== input.targetNodeId ||
    prev.atlas.currentNodeId !== input.targetNodeId ||
    !Number.isInteger(input.insertionIndex) ||
    input.insertionIndex < 0 ||
    input.site.isEnhanced ||
    input.site.isVisited ||
    input.site.randomSite !== undefined ||
    input.site.data !== undefined
  ) {
    return null;
  }
  const node = prev.atlas.nodes[input.targetNodeId];
  if (node === undefined || input.insertionIndex !== node.sites.length) {
    return null;
  }
  const actualSiblingIds = node.sites.map(({ id }) => id);
  if (
    actualSiblingIds.length !== input.siblingSiteIdsBefore.length ||
    actualSiblingIds.some(
      (siteId, index) => siteId !== input.siblingSiteIdsBefore[index],
    ) ||
    Object.values(prev.atlas.nodes).some((candidateNode) =>
      candidateNode.sites.some((site) => site.id === input.site.id),
    )
  ) {
    return null;
  }
  const insertedSite: SiteState = {
    id: input.site.id,
    type: input.site.type,
    isEnhanced: false,
    isVisited: false,
  };
  if (!siteRecordsEqual(input.site, insertedSite)) return null;
  return {
    ...prev,
    atlas: {
      ...prev.atlas,
      nodes: {
        ...prev.atlas.nodes,
        [input.targetNodeId]: {
          ...node,
          sites: [
            ...node.sites.slice(0, input.insertionIndex),
            insertedSite,
            ...node.sites.slice(input.insertionIndex),
          ],
        },
      },
    },
  };
}

function applyEffect(
  state: JourneyState,
  journeyContent: JourneyContent,
  effect: JourneyRewardEffect,
  entryIds: EntryIdAllocator,
): JourneyState | null {
  switch (effect.kind) {
    case "add_catalog_card": {
      if (
        !validateCatalogCard(journeyContent, effect.cardUuid, effect.cardNumber)
      ) {
        return null;
      }
      return {
        ...state,
        deck: [
          ...state.deck,
          {
            entryId: entryIds.next(),
            cardNumber: effect.cardNumber,
            transfiguration: effect.transfiguration ?? null,
            isBane: isNightmareCardId(effect.cardUuid),
          },
        ],
      };
    }
    case "add_dreamsign": {
      const template = journeyContent.dreamsignTemplates.find(
        (candidate) => candidate.id === effect.dreamsignId,
      );
      if (
        template === undefined ||
        template.id !== effect.dreamsignTemplate.id
      ) {
        return null;
      }
      return {
        ...state,
        dreamsigns: [...state.dreamsigns, createDreamsign(template)],
      };
    }
    case "transfigure_deck_entry": {
      if (validateDeckTarget(state, journeyContent, effect) === null)
        return null;
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === effect.entryId
            ? { ...entry, transfiguration: effect.transfiguration }
            : entry,
        ),
      };
    }
    case "duplicate_deck_entry": {
      const target = validateDeckTarget(state, journeyContent, effect);
      if (target === null) return null;
      return {
        ...state,
        deck: [
          ...state.deck,
          { ...target, entryId: entryIds.next() },
        ],
      };
    }
    case "remove_deck_entry": {
      if (validateDeckTarget(state, journeyContent, effect) === null)
        return null;
      return {
        ...state,
        deck: state.deck.filter((entry) => entry.entryId !== effect.entryId),
      };
    }
    case "change_deck_entry_keywords": {
      const target = validateDeckTarget(state, journeyContent, effect);
      if (target === null) return null;
      const keywordModification = mergeCardKeywordModification(
        target.keywordModification,
        effect.keywords,
      );
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === effect.entryId
            ? { ...entry, keywordModification }
            : entry,
        ),
      };
    }
    case "change_deck_entry_type": {
      if (validateDeckTarget(state, journeyContent, effect) === null)
        return null;
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === effect.entryId
            ? { ...entry, typeChange: effect.typeChange }
            : entry,
        ),
      };
    }
    case "add_deck_entry_spark_bonus": {
      const target = validateDeckTarget(state, journeyContent, effect);
      if (target === null || !Number.isFinite(effect.amount)) return null;
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === effect.entryId
            ? { ...entry, sparkBonus: (entry.sparkBonus ?? 0) + effect.amount }
            : entry,
        ),
      };
    }
    case "reduce_deck_entry_energy_cost": {
      const target = validateDeckTarget(state, journeyContent, effect);
      if (
        target === null ||
        !Number.isFinite(effect.amount) ||
        effect.amount <= 0
      ) {
        return null;
      }
      const keywordModification = mergeCardKeywordModification(
        target.keywordModification,
        { energyCostReduction: effect.amount },
      );
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === effect.entryId
            ? { ...entry, keywordModification }
            : entry,
        ),
      };
    }
    case "add_essence":
      return Number.isFinite(effect.amount)
        ? { ...state, essence: state.essence + effect.amount }
        : null;
    case "add_site":
      return addSiteToCurrentDreamscape(
        state,
        effect.siteType,
        effect.siteType,
      );
    case "insert_site":
      return insertPreparedSiteInJourneyState(state, effect);
    case "composite": {
      let next: JourneyState | null = state;
      for (const child of effect.children) {
        next = applyEffect(next, journeyContent, child, entryIds);
        if (next === null) return null;
      }
      return next;
    }
  }
}

/** Apply a site-neutral reward effect atomically to journey state. */
export function applyJourneyRewardEffect({
  state,
  journeyContent,
  effect,
  mintEntryId,
}: {
  state: JourneyState;
  journeyContent: JourneyContent;
  effect: JourneyRewardEffect;
  mintEntryId?: (deck: readonly DeckEntry[], index: number) => DeckEntryId;
}): JourneyState | null {
  return applyEffect(
    state,
    journeyContent,
    effect,
    createEntryIdAllocator(state.deck, mintEntryId),
  );
}
