import { generateInitialAtlas } from "../atlas/atlas-generator";
import { toQuestDreamcaller } from "../data/dreamcaller-selection";
import type { QuestContent } from "../data/quest-content";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import {
  createInitialDraftState,
  processPlayerPickWithoutLogging,
} from "../draft/draft-engine";
import type { CardData } from "../types/cards";
import type { DreamcallerContent } from "../types/content";
import type {
  DeckEntry,
  DreamAtlas,
  QuestState,
  Screen,
} from "../types/quest";
import { deriveEntryIdCounter } from "./deck-entry-ids";

export interface PreparedDraftPick {
  expected: {
    siteId: string;
    cardNumber: number;
    pickNumber: number;
    currentOffer: number[];
    deck: DeckEntry[];
  };
  next: {
    deck: DeckEntry[];
    draftState: QuestState["draftState"];
  };
}

export function nextDeckEntryId(deck: readonly DeckEntry[]): string {
  return `deck-${String(deriveEntryIdCounter(deck) + 1)}`;
}

/**
 * Clamps an essence amount to `[0, cap]`. Essence gained above the run's
 * essence cap is lost; essence never drops below zero.
 */
export function clampEssence(value: number, cap: number): number {
  return Math.max(0, Math.min(value, cap));
}

export function changeQuestEssence(
  prev: QuestState,
  delta: number,
): QuestState {
  return {
    ...prev,
    essence: clampEssence(prev.essence + delta, prev.essenceCap),
  };
}

export function addCardToQuestState(
  prev: QuestState,
  cardNumber: number,
  isBane: boolean,
): QuestState {
  return {
    ...prev,
    deck: [
      ...prev.deck,
      {
        entryId: nextDeckEntryId(prev.deck),
        cardNumber,
        transfiguration: null,
        isBane,
      },
    ],
  };
}

export function pickDraftCardInQuestState({
  prev,
  siteId,
  cardNumber,
  cardDatabase,
}: {
  prev: QuestState;
  siteId: string;
  cardNumber: number;
  cardDatabase: Map<number, CardData>;
}): QuestState {
  if (prev.draftState === null) {
    throw new Error("Draft state is unavailable.");
  }

  if (prev.draftState.activeSiteId !== siteId) {
    throw new Error(`Draft site ${siteId} is not active.`);
  }

  const draftState = structuredClone(prev.draftState);
  processPlayerPickWithoutLogging(cardNumber, draftState, cardDatabase);

  return addCardToQuestState({ ...prev, draftState }, cardNumber, false);
}

export function prepareDraftCardPickInQuestState({
  prev,
  siteId,
  cardNumber,
  cardDatabase,
}: {
  prev: QuestState;
  siteId: string;
  cardNumber: number;
  cardDatabase: Map<number, CardData>;
}): PreparedDraftPick {
  if (prev.draftState === null) {
    throw new Error("Draft state is unavailable.");
  }

  const expected = {
    siteId,
    cardNumber,
    pickNumber: prev.draftState.pickNumber,
    currentOffer: [...prev.draftState.currentOffer],
    deck: structuredClone(prev.deck),
  };
  const next = pickDraftCardInQuestState({
    prev,
    siteId,
    cardNumber,
    cardDatabase,
  });

  return {
    expected,
    next: {
      deck: next.deck,
      draftState: next.draftState,
    },
  };
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]))
  );
}

function deckEntriesEqual(
  left: readonly DeckEntry[],
  right: readonly DeckEntry[],
): boolean {
  return (
    left.length === right.length
    && left.every((entry, index) => {
      const other = right[index];
      return (
        other !== undefined
        && entry.entryId === other.entryId
        && entry.cardNumber === other.cardNumber
        && entry.transfiguration === other.transfiguration
        && entry.isBane === other.isBane
      );
    })
  );
}

export function commitPreparedDraftCardPickInQuestState({
  prev,
  prepared,
}: {
  prev: QuestState;
  prepared: PreparedDraftPick;
}): QuestState | null {
  const draftState = prev.draftState;
  if (draftState === null) {
    return null;
  }

  if (
    draftState.activeSiteId !== prepared.expected.siteId
    || draftState.pickNumber !== prepared.expected.pickNumber
    || !arraysEqual(draftState.currentOffer, prepared.expected.currentOffer)
    || !draftState.currentOffer.includes(prepared.expected.cardNumber)
    || !deckEntriesEqual(prev.deck, prepared.expected.deck)
  ) {
    return null;
  }

  return {
    ...prev,
    deck: prepared.next.deck,
    draftState: prepared.next.draftState,
  };
}

export function setQuestScreen(
  prev: QuestState,
  screen: Screen,
): QuestState {
  return {
    ...prev,
    screen,
    activeSiteId: screen.type === "site" ? screen.siteId : null,
  };
}

export function updateQuestAtlas(
  prev: QuestState,
  atlas: DreamAtlas,
): QuestState {
  return {
    ...prev,
    atlas,
  };
}

/**
 * Returns whether the given site is a legal visit target for the current
 * quest state. Enforces the design-document site rules at the state layer
 * (not just the UI):
 *
 * - The site must exist and belong to the current dreamscape.
 * - Each site can be visited exactly once.
 * - The Battle site must be visited last: every non-Battle site in the same
 *   dreamscape must already be visited.
 */
export function canVisitSite(prev: QuestState, siteId: string): boolean {
  for (const node of Object.values(prev.atlas.nodes)) {
    const site = node.sites.find((candidate) => candidate.id === siteId);
    if (site === undefined) {
      continue;
    }
    if (site.isVisited || prev.visitedSites.includes(siteId)) {
      return false;
    }
    if (
      prev.currentDreamscape !== null &&
      node.id !== prev.currentDreamscape
    ) {
      return false;
    }
    if (site.type === "Battle") {
      return node.sites.every(
        (candidate) =>
          candidate.type === "Battle" ||
          candidate.isVisited ||
          prev.visitedSites.includes(candidate.id),
      );
    }
    return true;
  }
  return false;
}

export function completeQuestSite(
  prev: QuestState,
  siteId: string,
): QuestState {
  if (!canVisitSite(prev, siteId)) {
    return prev;
  }

  const updatedNodes = { ...prev.atlas.nodes };
  for (const [nodeId, node] of Object.entries(updatedNodes)) {
    const siteIndex = node.sites.findIndex((site) => site.id === siteId);
    if (siteIndex === -1) {
      continue;
    }

    updatedNodes[nodeId] = {
      ...node,
      sites: node.sites.map((site, index) =>
        index === siteIndex ? { ...site, isVisited: true } : site,
      ),
    };
    break;
  }

  return {
    ...prev,
    visitedSites: [...prev.visitedSites, siteId],
    atlas: {
      ...prev.atlas,
      nodes: updatedNodes,
    },
  };
}

export function startQuestFromDreamcaller({
  prev,
  dreamcaller,
  questContent,
}: {
  prev: QuestState;
  dreamcaller: DreamcallerContent;
  questContent: QuestContent;
}): QuestState {
  const resolvedPackage = questContent.resolvedPackagesByDreamcallerId.get(
    dreamcaller.id,
  );

  if (resolvedPackage === undefined) {
    throw new Error(`Missing resolved package for ${dreamcaller.id}`);
  }

  const deck = [...prev.deck];
  for (const cardNumber of STARTER_CARD_NUMBERS) {
    if (deck.some((entry) => entry.cardNumber === cardNumber)) {
      continue;
    }

    deck.push({
      entryId: nextDeckEntryId(deck),
      cardNumber,
      transfiguration: null,
      isBane: false,
    });
  }

  const playerHasBanes =
    deck.some((entry) => entry.isBane) ||
    prev.dreamsigns.some((dreamsign) => dreamsign.isBane);
  const atlas = generateInitialAtlas(
    prev.completionLevel,
    { playerHasBanes },
    { logEvents: false },
  );
  const firstNode = Object.values(atlas.nodes).find(
    (node) => node.status === "available",
  );

  return {
    ...prev,
    essence: dreamcaller.startingEssence,
    deck,
    dreamcaller: toQuestDreamcaller(dreamcaller),
    resolvedPackage,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
    draftState: createInitialDraftState(
      questContent.cardDatabase,
      resolvedPackage,
    ),
    atlas,
    currentDreamscape: firstNode?.id ?? null,
    visitedSites: firstNode === undefined ? prev.visitedSites : [],
    screen: firstNode === undefined ? { type: "atlas" } : { type: "dreamscape" },
    activeSiteId: null,
  };
}
