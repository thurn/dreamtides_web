import { generateInitialAtlas } from "../atlas/atlas-generator";
import { toQuestDreamcaller } from "../data/dreamcaller-selection";
import { buildDreamcallerPackage, buildReplayDraftState } from "../data/quest-content";
import type { QuestContent } from "../data/quest-content";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import {
  createInitialDraftState,
  processPlayerPickWithoutLogging,
} from "../draft/draft-engine";
import { replayDepsFor } from "../draft/replay/replay-deps";
import type { FitModel } from "../draft/replay/fit-model";
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
  fitModel,
}: {
  prev: QuestState;
  siteId: string;
  cardNumber: number;
  cardDatabase: Map<number, CardData>;
  /**
   * Live deck-fit model, only present in replay mode. When set, the NEXT
   * offer is ranked against the deck *after* this pick (see below).
   */
  fitModel?: FitModel;
}): QuestState {
  if (prev.draftState === null) {
    throw new Error("Draft state is unavailable.");
  }

  if (prev.draftState.activeSiteId !== siteId) {
    throw new Error(`Draft site ${siteId} is not active.`);
  }

  // Append the picked card FIRST so the replay deck-fit ranking for the NEXT
  // offer reflects the deck *including* the just-picked card. For pool mode
  // the offer never reads the deck, so this reordering is observationally
  // identical to advancing the draft state first. The engine's offer-
  // membership check still validates `cardNumber` against the PRE-pick
  // `currentOffer` (unchanged), so the reorder is safe.
  const withCard = addCardToQuestState(prev, cardNumber, false);
  const draftState = structuredClone(prev.draftState);
  const replayDeps =
    draftState.mode === "replay"
      ? replayDepsFor(withCard.deck, fitModel)
      : undefined;
  processPlayerPickWithoutLogging(
    cardNumber,
    draftState,
    cardDatabase,
    undefined,
    replayDeps,
  );

  return { ...withCard, draftState };
}

export function prepareDraftCardPickInQuestState({
  prev,
  siteId,
  cardNumber,
  cardDatabase,
  fitModel,
}: {
  prev: QuestState;
  siteId: string;
  cardNumber: number;
  cardDatabase: Map<number, CardData>;
  /** Live deck-fit model, only present in replay mode. Passed straight through. */
  fitModel?: FitModel;
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
    fitModel,
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

/**
 * Generate a fresh per-quest seed. Uses `crypto.randomUUID()` when available
 * (modern browsers, Node 19+, jsdom). Falls back to a `Math.random()`-derived
 * hex string for the rare environment without `crypto.randomUUID`. The exact
 * source does not matter for correctness — only that the value varies across
 * fresh quests in the same browser session so the journey adapter cannot
 * collide two distinct quests onto the same shape and dream art for a given
 * atlas site.
 */
export function generateQuestSeed(): string {
  const cryptoCandidate: { randomUUID?: () => string } | undefined =
    typeof crypto === "undefined"
      ? undefined
      : (crypto as { randomUUID?: () => string });
  if (cryptoCandidate?.randomUUID !== undefined) {
    return cryptoCandidate.randomUUID();
  }
  const part = () =>
    Math.floor(Math.random() * 0x1_0000_0000)
      .toString(16)
      .padStart(8, "0");
  return `${part()}${part()}${part()}${part()}`;
}

export function startQuestFromDreamcaller({
  prev,
  dreamcaller,
  questContent,
  seedOverride,
}: {
  prev: QuestState;
  dreamcaller: DreamcallerContent;
  questContent: QuestContent;
  /**
   * Optional caller-supplied per-quest seed. The multiplayer provider passes
   * a seed generated once outside the RTDB transaction updater so retries
   * reuse the same value rather than minting a new one each attempt. When
   * omitted, a fresh seed is generated via {@link generateQuestSeed}.
   */
  seedOverride?: string;
}): QuestState {
  const seed = seedOverride ?? generateQuestSeed();
  const poolContext = questContent.poolContext;
  if (poolContext === undefined) {
    throw new Error(
      "startQuestFromDreamcaller: questContent.poolContext is required",
    );
  }
  const resolvedPackage = buildDreamcallerPackage(dreamcaller, poolContext, seed);

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

  // In replay mode the draft state is a frozen real-pack sequence chosen from
  // the bundled record corpus; pool mode draws offers from the generated run
  // multiset. The resolved package is still built normally in both modes — it
  // provides signatures, the dreamsign pool, the starter decklist, and the
  // shop pool (which replay shops draw from).
  const useReplayDraft =
    questContent.draftMode === "replay"
    && questContent.draftRecords !== undefined
    && questContent.draftRecords.length > 0;
  const draftState = useReplayDraft
    ? buildReplayDraftState(
        dreamcaller,
        poolContext.nameIndex,
        seed,
        questContent.draftRecords ?? [],
        questContent.fitModel,
      )
    : createInitialDraftState(questContent.cardDatabase, resolvedPackage);

  return {
    ...prev,
    seed,
    essence: dreamcaller.startingEssence,
    deck,
    dreamcaller: toQuestDreamcaller(dreamcaller),
    resolvedPackage,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
    draftState,
    atlas,
    currentDreamscape: firstNode?.id ?? null,
    visitedSites: firstNode === undefined ? prev.visitedSites : [],
    screen: firstNode === undefined ? { type: "atlas" } : { type: "dreamscape" },
    activeSiteId: null,
  };
}
