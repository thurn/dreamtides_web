import { generateInitialAtlas } from "../atlas/atlas-generator";
import { toQuestDreamcaller } from "../data/dreamcaller-selection";
import type { QuestContent } from "../data/quest-content";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import {
  createInitialDraftState,
  processPlayerPick,
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

export function nextDeckEntryId(deck: readonly DeckEntry[]): string {
  return `deck-${String(deriveEntryIdCounter(deck) + 1)}`;
}

export function changeQuestEssence(
  prev: QuestState,
  delta: number,
): QuestState {
  return {
    ...prev,
    essence: prev.essence + delta,
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
  processPlayerPick(cardNumber, draftState, cardDatabase);

  return addCardToQuestState({ ...prev, draftState }, cardNumber, false);
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

export function completeQuestSite(
  prev: QuestState,
  siteId: string,
): QuestState {
  if (prev.visitedSites.includes(siteId)) {
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
