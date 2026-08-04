import { generateInitialAtlas } from "../atlas/atlas-generator";
import { toJourneyDreamAvatar } from "../data/dream-avatar-selection";
import {
  buildDreamAvatarPackage,
  buildReplayDraftState,
} from "../data/journey-content";
import type { JourneyContent } from "../data/journey-content";
import { buildIdIndex } from "../data/cards-v2-database";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import {
  DEFAULT_DRAFT_CONFIG,
  createInitialDraftState,
  createInitialFresh20DraftState,
  processPlayerPickWithoutLogging,
} from "../draft/draft-engine";
import { replayDepsFor } from "../draft/replay/replay-deps";
import { fresh20DepsFor } from "../draft/fresh20/fresh20-deps";
import { FRESH20_DEFAULT_PACK_SIZE } from "../draft/fresh20/fresh20-offer";
import type { FitModel } from "../draft/replay/fit-model";
import type { CardData } from "../types/cards";
import type {
  DreamAvatarContent,
  ResolvedDreamAvatarPackage,
} from "../types/content";
import type {
  DeckEntry,
  DreamAtlas,
  JourneyState,
  Screen,
  SiteState,
  SiteType,
} from "../types/journey";
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
    draftState: JourneyState["draftState"];
  };
}

export function nextDeckEntryId(deck: readonly DeckEntry[]): string {
  return `deck-${String(deriveEntryIdCounter(deck) + 1)}`;
}

/** Clamp an essence amount to zero or greater. */
export function clampEssence(value: number): number {
  return Math.max(0, value);
}

export function changeJourneyEssence(
  prev: JourneyState,
  delta: number,
): JourneyState {
  return {
    ...prev,
    essence: clampEssence(prev.essence + delta),
  };
}

export function addCardToJourneyState(
  prev: JourneyState,
  cardNumber: number,
  isBane: boolean,
): JourneyState {
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

export function pickDraftCardInJourneyState({
  prev,
  siteId,
  cardNumber,
  cardDatabase,
  fitModel,
  affiliationWeights,
}: {
  prev: JourneyState;
  siteId: string;
  cardNumber: number;
  cardDatabase: Map<number, CardData>;
  /**
   * Live deck-fit model, only present in replay mode. When set, the NEXT
   * offer is ranked against the deck *after* this pick (see below).
   */
  fitModel?: FitModel;
  /**
   * Affiliation reweighting (`cardNumber -> multiplier`) for the dreamscape this
   * draft site sits in, threaded into the NEXT pool-mode offer so the whole site
   * visit stays biased toward the affiliation. Absent in a neutral dreamscape.
   */
  affiliationWeights?: ReadonlyMap<number, number>;
}): JourneyState {
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
  const withCard = addCardToJourneyState(prev, cardNumber, false);
  const draftState = structuredClone(prev.draftState);
  const offerDeps =
    draftState.mode === "replay"
      ? replayDepsFor(withCard.deck, fitModel)
      : draftState.mode === "fresh20"
        ? fresh20DepsFor(withCard.deck, fitModel, cardDatabase)
        : undefined;
  processPlayerPickWithoutLogging(
    cardNumber,
    draftState,
    cardDatabase,
    affiliationWeights === undefined
      ? undefined
      : { ...DEFAULT_DRAFT_CONFIG, affiliationWeights },
    offerDeps,
    // Explicit randomness source: this legacy pick path advances the draft
    // outside the pure journey reducer, so it keeps its `Math.random` draw. The
    // event-sourced path (`src/rules/journey/draft.ts`) drives the same engine
    // from `ctx.rng` for determinism.
    Math.random,
  );

  return { ...withCard, draftState };
}

export function prepareDraftCardPickInJourneyState({
  prev,
  siteId,
  cardNumber,
  cardDatabase,
  fitModel,
  affiliationWeights,
}: {
  prev: JourneyState;
  siteId: string;
  cardNumber: number;
  cardDatabase: Map<number, CardData>;
  /** Live deck-fit model, only present in replay mode. Passed straight through. */
  fitModel?: FitModel;
  /**
   * Affiliation reweighting for the current dreamscape, threaded into the NEXT
   * offer so a multi-pick draft visit stays biased. Absent in a neutral dreamscape.
   */
  affiliationWeights?: ReadonlyMap<number, number>;
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
  const next = pickDraftCardInJourneyState({
    prev,
    siteId,
    cardNumber,
    cardDatabase,
    fitModel,
    affiliationWeights,
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
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  );
}

function deckEntriesEqual(
  left: readonly DeckEntry[],
  right: readonly DeckEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        entry.entryId === other.entryId &&
        entry.cardNumber === other.cardNumber &&
        entry.transfiguration === other.transfiguration &&
        entry.isBane === other.isBane
      );
    })
  );
}

export function commitPreparedDraftCardPickInJourneyState({
  prev,
  prepared,
}: {
  prev: JourneyState;
  prepared: PreparedDraftPick;
}): JourneyState | null {
  const draftState = prev.draftState;
  if (draftState === null) {
    return null;
  }

  if (
    draftState.activeSiteId !== prepared.expected.siteId ||
    draftState.pickNumber !== prepared.expected.pickNumber ||
    !arraysEqual(draftState.currentOffer, prepared.expected.currentOffer) ||
    !draftState.currentOffer.includes(prepared.expected.cardNumber) ||
    !deckEntriesEqual(prev.deck, prepared.expected.deck)
  ) {
    return null;
  }

  return {
    ...prev,
    deck: prepared.next.deck,
    draftState: prepared.next.draftState,
  };
}

export function setJourneyScreen(prev: JourneyState, screen: Screen): JourneyState {
  return {
    ...prev,
    screen,
    activeSiteId: screen.type === "site" ? screen.siteId : null,
  };
}

export function updateJourneyAtlas(
  prev: JourneyState,
  atlas: DreamAtlas,
): JourneyState {
  return {
    ...prev,
    atlas,
  };
}

/**
 * Returns whether the given site is a legal visit target for the current
 * journey state. Enforces the design-document site rules at the state layer
 * (not just the UI):
 *
 * - The site must exist and belong to the current dreamscape.
 * - Each site can be visited exactly once.
 * - The Battle site must be visited last: every non-Battle site in the same
 *   dreamscape must already be visited.
 */
export function canVisitSite(prev: JourneyState, siteId: string): boolean {
  for (const node of Object.values(prev.atlas.nodes)) {
    const site = node.sites.find((candidate) => candidate.id === siteId);
    if (site === undefined) {
      continue;
    }
    if (site.isVisited || prev.visitedSites.includes(siteId)) {
      return false;
    }
    if (prev.currentDreamscape !== null && node.id !== prev.currentDreamscape) {
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

export function completeJourneySite(
  prev: JourneyState,
  siteId: string,
): JourneyState {
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
export function addSiteToCurrentDreamscape(
  prev: JourneyState,
  siteType: SiteType,
  sourceId: string,
): JourneyState {
  const targetId = prev.currentDreamscape;
  if (targetId === null || prev.atlas.nodes[targetId] === undefined) {
    return prev;
  }
  const count = totalSiteCount(prev.atlas);
  const newSite: SiteState = {
    id: `site-merchant-${sourceId}-${String(count)}`,
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

/**
 * Generate a fresh per-journey seed. Uses `crypto.randomUUID()` when available
 * (modern browsers, Node 19+, jsdom). Falls back to a `Math.random()`-derived
 * hex string for the rare environment without `crypto.randomUUID`. The exact
 * source does not matter for correctness — only that the value varies across
 * fresh journeys in the same browser session so the journey adapter cannot
 * collide two distinct journeys onto the same shape and dream art for a given
 * atlas site.
 */
export function generateJourneySeed(): string {
  const cryptoCandidate: { randomUUID?: () => string } | undefined =
    typeof crypto === "undefined"
      ? undefined
      : (crypto);
  if (cryptoCandidate?.randomUUID !== undefined) {
    return cryptoCandidate.randomUUID();
  }
  const part = () =>
    Math.floor(Math.random() * 0x1_0000_0000)
      .toString(16)
      .padStart(8, "0");
  return `${part()}${part()}${part()}${part()}`;
}

export function startJourneyFromDreamAvatar({
  prev,
  dreamAvatar,
  journeyContent,
  seedOverride,
  atlasRng,
  resolvedPackageOverride,
  isTutorialJourney = false,
}: {
  prev: JourneyState;
  dreamAvatar: DreamAvatarContent;
  journeyContent: JourneyContent;
  /**
   * Optional caller-supplied per-journey seed. The multiplayer provider passes
   * a seed generated once outside the RTDB transaction updater so retries
   * reuse the same value rather than minting a new one each attempt. When
   * omitted, a fresh seed is generated via {@link generateJourneySeed}.
   */
  seedOverride?: string;
  /**
   * Optional deterministic `[0, 1)` random source for atlas generation. The
   * coop event-sourcing lifecycle provider passes a stream seeded from the run
   * seed so two clients folding the same `START_JOURNEY` build a byte-identical
   * atlas. Omitted by the legacy/UI path, which lets the atlas generator draw
   * from `Math.random` (the sanctioned interim).
   */
  atlasRng?: () => number;
  /** Authored package for flows such as the tutorial journey handoff. */
  resolvedPackageOverride?: ResolvedDreamAvatarPackage;
  /** Marks the assembled run as the authored tutorial journey. */
  isTutorialJourney?: boolean;
}): JourneyState {
  const seed = seedOverride ?? generateJourneySeed();
  const poolContext = journeyContent.poolContext;
  if (poolContext === undefined) {
    throw new Error(
      "startJourneyFromDreamAvatar: journeyContent.poolContext is required",
    );
  }
  const resolvedPackage =
    resolvedPackageOverride ??
    buildDreamAvatarPackage(dreamAvatar, poolContext, seed);

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

  const openingDreamsignIds = new Set(
    (resolvedPackage.openingDreamsignOfferIds ?? []).map((id) =>
      id.toLocaleLowerCase(),
    ),
  );
  const atlasDreamsignPoolIds = resolvedPackage.dreamsignPoolIds.filter(
    (id) => !openingDreamsignIds.has(id.toLocaleLowerCase()),
  );
  const atlas = generateInitialAtlas(
    prev.completionLevel,
    {},
    {
      dreamscapes: journeyContent.dreamscapes,
      atlasConfig: journeyContent.atlasConfig,
      dreamsignPoolIds: atlasDreamsignPoolIds,
      apollyonIncarnations: journeyContent.apollyonIncarnations,
    },
    { logEvents: false, ...(atlasRng === undefined ? {} : { rng: atlasRng }) },
  );
  const firstNode = atlas.nodes[atlas.startingNodeId];
  // Known dreamsigns placed on the atlas are drawn from (and removed from) the
  // run dreamsign pool at generation time, so exclude them from the remaining
  // pool offered by sites later in the run.
  const knownDreamsignIds = new Set(
    atlas.knownDreamsignCarrierIds
      .map((id) => atlas.nodes[id]?.knownDreamsignId)
      .filter((id): id is string => id !== null && id !== undefined),
  );
  const remainingDreamsignPool = resolvedPackage.dreamsignPoolIds.filter(
    (id) => !knownDreamsignIds.has(id),
  );

  // In replay mode the draft state is a frozen real-pack sequence chosen from
  // the bundled record corpus; fresh20 mode rolls fresh random packs each pick;
  // pool mode draws offers from the generated run multiset. The resolved package
  // is still built normally in every mode — it provides signatures, the
  // dreamsign pool, the starter decklist, and the shop pool (which the deck-fit
  // modes' shops draw from). The deck-fit modes both require a fit model; when
  // the record corpus failed to load they fall back to the pool draft.
  const useReplayDraft =
    journeyContent.draftMode === "replay" &&
    journeyContent.draftRecords !== undefined &&
    journeyContent.draftRecords.length > 0;
  const useFresh20Draft =
    journeyContent.draftMode === "fresh20" && journeyContent.fitModel !== undefined;
  const draftState = useReplayDraft
    ? buildReplayDraftState(
        dreamAvatar,
        // The replay state resolves record pack ids and the DreamAvatar's
        // signature card ids against a lowercased-id index, matching the
        // id-keyed fit model.
        buildIdIndex(journeyContent.cardDatabase),
        seed,
        journeyContent.draftRecords ?? [],
        journeyContent.fitModel,
      )
    : useFresh20Draft
      ? createInitialFresh20DraftState({
          packSize: journeyContent.fresh20PackSize ?? FRESH20_DEFAULT_PACK_SIZE,
        })
      : createInitialDraftState(journeyContent.cardDatabase, resolvedPackage);

  return {
    ...prev,
    seed,
    isTutorialJourney,
    essence: dreamAvatar.startingEssence,
    deck,
    dreamAvatar: toJourneyDreamAvatar(dreamAvatar),
    resolvedPackage,
    remainingDreamsignPool,
    draftState,
    atlas,
    currentDreamscape: firstNode.id,
    visitedSites: [],
    screen: { type: "dreamscape" },
    activeSiteId: null,
  };
}
