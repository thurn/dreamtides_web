// Real SiteContentProvider: generates the content-coupled site runtimes
// (`OPEN_SITE`) and the shop restock (`REROLL_SHOP`) from the loaded journey
// content, drawing ALL randomness from the reducer-supplied `ctx.rng` (adapted
// to a `() => number` stream) so two clients folding the same event roll
// byte-identical offers. Every generator's `Math.random` was threaded off this
// stream (see the reward / dreamsign / shop generators).

import type { JourneyContent } from "../../data/journey-content";
import type { DraftState } from "../../types/draft";
import type {
  CardChoiceSiteRuntime,
  CardChoiceTransfigurationOffer,
  DeckEntry,
  FourSuitRepriseSiteRuntime,
  GambleSiteRuntime,
  StarwayStairsSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
  BlackjackSiteRuntime,
  RewardSiteRuntime,
  SiteRuntimeState,
  SiteState,
  JourneyState,
  RuntimeShopSlot,
} from "../../types/journey";
import type { GambleGameId } from "../../types/gamble";
import type {
  BlackjackGame,
  FourSuitRepriseGame,
  GambleGameDefinition,
  LadderClimbGame,
  StarwayStairsGame,
  ThreeGateGame,
} from "../../types/gamble-data";
import {
  STANDARD_PLAYING_CARD_DECK,
  gravokWagerCost,
} from "../../data/gravok-wager";
import { scoreTidemarkLadderClimbDreamsignCandidates } from "../../data/tidemark-ladder-climb";
import { starwayStairsWagerAmount } from "../../data/starway-stairs";
import { fourSuitRepriseDrawCost } from "../../data/four-suit-reprise";
import { blackjackWagerCost } from "../../data/blackjack";
import { gambleGame } from "../../data/gamble-data";
import { createDreamsign } from "../../data/dreamsigns";
import { generateRewardSiteData } from "../../rewards/reward-generator";
import { drawDreamsignOptions } from "../../dreamsign/dreamsign-pool";
import {
  generateShopInventory,
  replayShopDraftState,
  shopSlotsToRuntime,
} from "../../shop/shop-generator";
import {
  offeredTransfigurationForms,
  transfigurationEffectDetails,
} from "../../transfiguration/transfiguration-logic";
import { transfigurationEssenceCost } from "../../transfiguration/transfiguration-pricing";
import {
  resolveMerchantDecline,
  resolveMerchantOffer,
} from "../../journey_v2/encounter/resolveMerchantOffer";
import { generateMerchantEncounter } from "../../journey_v2/encounter/generateMerchantEncounter";
import { buildMerchantContext } from "../../journey_v2/context/buildMerchantContext";
import type { MerchantChoice } from "../../journey_v2/types";
import type { MerchantArchetypeId } from "../../journey_v2/archetypes/types";
import { mintEntryId } from "../../rules/journey/deck";
import type {
  ShopRerollResult,
  SiteContentProvider,
  SiteOpenResult,
} from "../../rules/journey/sites";
import { streamFromKeyed } from "./rng-stream";
import { readDreamsignPool } from "../../dreamsign/dreamsign-pool";
import {
  buildExplorationRuntime,
  buildLegacyExplorationRuntime,
  resolveExplorationChoice,
} from "./exploration-provider";
import {
  buildRewardSelectionContext,
  SELECTION_RULES_VERSION,
} from "../../reward-selection";
import { resolveDeckEntryCard } from "../../card-type-change";

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Coerce an optional `{ choiceId }` merchant choice from a raw payload field. */
function coerceMerchantChoice(value: unknown): MerchantChoice | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const choiceId = (value as { choiceId?: unknown }).choiceId;
  return typeof choiceId === "string" ? { choiceId } : undefined;
}

/** Whether the run's draft is a deck-fit mode (replay / fresh20). */
function isDeckFitDraft(journey: JourneyState): boolean {
  return (
    journey.draftState?.mode === "replay" ||
    journey.draftState?.mode === "fresh20"
  );
}

/**
 * The draft state a shop draws its card slots from. Deck-fit runs use a
 * transient pool rebuilt from the resolved package (their live draft state is a
 * frozen pack sequence, not a multiset); pool runs draw from the run draft
 * state directly.
 */
function shopSourceDraftState(journey: JourneyState): DraftState | null {
  return isDeckFitDraft(journey)
    ? replayShopDraftState(journey.resolvedPackage)
    : journey.draftState;
}

/** A uniform rng shuffle (no ambient `Math.random`). */
function rngShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool;
}

function transfigureShopSlots(
  slots: readonly RuntimeShopSlot[],
  content: JourneyContent,
  rng: () => number,
): RuntimeShopSlot[] {
  return slots.map((slot) => {
    if (slot.itemType !== "card") return slot;
    const card = content.cardDatabase.get(slot.cardNumber);
    if (card === undefined) return slot;
    const forms = offeredTransfigurationForms(
      content.transfigurationData,
      card,
      null,
    );
    const form = forms[Math.floor(rng() * forms.length)];
    return form === undefined ? slot : { ...slot, transfiguration: form.type };
  });
}

function gambleShuffleCommitment(rng: () => number): string {
  return Array.from({ length: 4 }, () =>
    Math.floor(rng() * 0x1_0000)
      .toString(16)
      .padStart(4, "0"),
  ).join("");
}

function gambleCommittedCard(rng: () => number) {
  return STANDARD_PLAYING_CARD_DECK[
    Math.floor(rng() * STANDARD_PLAYING_CARD_DECK.length)
  ];
}

function eligibleGambleDreamsigns(
  journey: JourneyState,
  content: JourneyContent,
) {
  const heldIds = new Set(
    journey.dreamsigns.flatMap((dreamsign) =>
      dreamsign.id === undefined ? [] : [dreamsign.id],
    ),
  );
  const { availableIds, templatesById } = readDreamsignPool(
    journey.remainingDreamsignPool,
    content.dreamsignTemplates,
  );
  const dreamsignCandidateIds = availableIds.filter((id) => !heldIds.has(id));
  const templates = dreamsignCandidateIds.flatMap((id) => {
    const template = templatesById.get(id);
    return template === undefined ? [] : [template];
  });
  return { dreamsignCandidateIds, templatesById, templates };
}

function buildGravokWagerRuntime(
  journey: JourneyState,
  site: SiteState,
  content: JourneyContent,
  game: ThreeGateGame,
  rng: () => number,
): GambleSiteRuntime {
  const shuffleCommitment = gambleShuffleCommitment(rng);
  const committedCard = gambleCommittedCard(rng);
  const { dreamsignCandidateIds, templatesById } = eligibleGambleDreamsigns(
    journey,
    content,
  );
  const selectedDreamsignId =
    dreamsignCandidateIds.length === 0
      ? null
      : dreamsignCandidateIds[Math.floor(rng() * dreamsignCandidateIds.length)];
  const selectedTemplate =
    selectedDreamsignId === null
      ? null
      : (templatesById.get(selectedDreamsignId) ?? null);

  return {
    kind: "gamble",
    gameId: "gravok-three-gate-wager",
    rulesVersion: game.rulesVersion,
    roundNumber: 1,
    isFarpoint: site.isEnhanced,
    wagerCost: gravokWagerCost(game.economy, site.isEnhanced),
    shuffleCommitment,
    committedCard,
    dreamsignCandidateIds,
    rewardDreamsign:
      selectedTemplate === null ? null : createDreamsign(selectedTemplate),
    result: null,
  };
}

function buildTidemarkLadderClimbRuntime(
  journey: JourneyState,
  site: SiteState,
  content: JourneyContent,
  game: LadderClimbGame,
  rng: () => number,
): TidemarkLadderClimbSiteRuntime | null {
  const { templates } = eligibleGambleDreamsigns(journey, content);
  if (templates.length === 0) return null;
  const commitments = Array.from({ length: 4 }, () => ({
    shuffleCommitment: gambleShuffleCommitment(rng),
    card: gambleCommittedCard(rng),
  }));
  const deckCards = journey.deck.flatMap((entry) => {
    const card = content.cardDatabase.get(entry.cardNumber);
    return card === undefined ? [] : [card];
  });
  const dreamsignCandidateScores = scoreTidemarkLadderClimbDreamsignCandidates({
    templates,
    profiles: content.dreamsignProfiles,
    deckCards,
  });
  const strongPool = dreamsignCandidateScores.slice(
    0,
    game.rules.strongPoolLimit,
  );
  const selectedCandidate =
    strongPool.length === 0
      ? undefined
      : strongPool[Math.floor(rng() * strongPool.length)];
  const selectedTemplate =
    selectedCandidate === undefined
      ? null
      : (templates.find(
          (template) => template.id === selectedCandidate.dreamsignId,
        ) ?? null);
  if (selectedTemplate === null) return null;

  return {
    kind: "gamble",
    gameId: "tidemark-ladder-climb",
    rulesVersion: game.rulesVersion,
    isFarpoint: site.isEnhanced,
    shuffleCommitments: commitments.map((entry) => entry.shuffleCommitment),
    committedCards: commitments.map((entry) => entry.card),
    dreamsignCandidateScores,
    strongPoolSize: strongPool.length,
    strongPoolCutoffScore: strongPool[strongPool.length - 1]?.score ?? null,
    rewardDreamsign: createDreamsign(selectedTemplate),
    revealedCards: [],
    cumulativeCost: 0,
    result: null,
  };
}

function buildStarwayStairsRuntime(
  site: SiteState,
  game: StarwayStairsGame,
  rng: () => number,
): StarwayStairsSiteRuntime {
  const commitments = game.rules.tiers.map(() => ({
    shuffleCommitment: gambleShuffleCommitment(rng),
    card: gambleCommittedCard(rng),
  }));
  return {
    kind: "gamble",
    gameId: "starway-stairs",
    rulesVersion: game.rulesVersion,
    roundNumber: 1,
    isFarpoint: site.isEnhanced,
    wagerAmount: starwayStairsWagerAmount(game.economy, site.isEnhanced),
    shuffleCommitments: commitments.map((entry) => entry.shuffleCommitment),
    committedCards: commitments.map((entry) => entry.card),
    results: [],
    terminalReason: null,
    prizeAwarded: 0,
  };
}

function buildFourSuitRepriseRuntime(
  journey: JourneyState,
  site: SiteState,
  content: JourneyContent,
  game: FourSuitRepriseGame,
  rng: () => number,
): FourSuitRepriseSiteRuntime | null {
  const targets = journey.deck.flatMap((entry) => {
    if (entry.isBane || entry.transfiguration !== null) return [];
    const baseCard = content.cardDatabase.get(entry.cardNumber);
    if (baseCard === undefined) return [];
    const cardSnapshot = resolveDeckEntryCard(
      content.transfigurationData,
      baseCard,
      entry,
    );
    const forms = offeredTransfigurationForms(
      content.transfigurationData,
      cardSnapshot,
      null,
    );
    if (forms.length === 0) return [];
    return [
      {
        entryId: entry.entryId,
        cardId: baseCard.id,
        cardNumber: entry.cardNumber,
        cardSnapshot,
        transfigurationOffers: forms.map((offer) => ({
          entryId: entry.entryId,
          type: offer.type,
          change: offer.change,
          effectDetails: transfigurationEffectDetails(offer, cardSnapshot),
          previewCard: offer.previewCard,
          essenceCost: 0,
        })),
      },
    ];
  });
  if (targets.length === 0) return null;

  const commitments = Array.from({ length: game.rules.maxRounds }, () => ({
    shuffleCommitment: gambleShuffleCommitment(rng),
    card: gambleCommittedCard(rng),
  }));
  return {
    kind: "gamble",
    gameId: "four-suit-reprise",
    rulesVersion: game.rulesVersion,
    isFarpoint: site.isEnhanced,
    drawCost: fourSuitRepriseDrawCost(game.economy, site.isEnhanced),
    shuffleCommitments: commitments.map((entry) => entry.shuffleCommitment),
    committedCards: commitments.map((entry) => entry.card),
    targets,
    rounds: [],
    phase: "choose",
  };
}

function buildBlackjackRuntime(
  site: SiteState,
  game: BlackjackGame,
  rng: () => number,
): BlackjackSiteRuntime {
  const economy = game.economy;
  return {
    kind: "gamble",
    gameId: "blackjack",
    rulesVersion: game.rulesVersion,
    isFarpoint: site.isEnhanced,
    wagerCost: blackjackWagerCost(economy, site.isEnhanced),
    prizeEssence: economy.prizeEssence,
    attemptNumber: 1,
    shuffleCommitment: gambleShuffleCommitment(rng),
    committedDeck: rngShuffle(STANDARD_PLAYING_CARD_DECK, rng),
    deckCursor: 0,
    playerCards: [],
    dealerCards: [],
    dealerRevealed: false,
    wagerPaid: false,
    playerDecision: null,
    outcome: null,
    resultSettled: false,
    essenceAwarded: 0,
  };
}

function buildGambleRuntime(
  journey: JourneyState,
  site: SiteState,
  content: JourneyContent,
  rng: () => number,
  requestedGameId: GambleGameId | undefined,
): GambleSiteRuntime {
  const gambleData = content.gambleData;
  if (gambleData === undefined)
    throw new Error("Journey content is missing Gamble data");
  const configuredGames = gambleData.games;
  const totalWeight = configuredGames.reduce(
    (sum, game) => sum + game.selection.weight,
    0,
  );
  const selectionRoll = rng() * totalWeight;
  let roll = selectionRoll;
  let selectedGameId = configuredGames.find(
    (game) => game.selection.fallback,
  )?.id;
  if (selectedGameId === undefined)
    throw new Error("Gamble catalog has no fallback game");
  for (const game of configuredGames) {
    roll -= game.selection.weight;
    if (roll <= 0) {
      selectedGameId = game.id;
      break;
    }
  }
  const definition = gambleGame(gambleData, requestedGameId ?? selectedGameId);
  const runtime = buildGambleRuntimeFromDefinition(
    journey,
    site,
    content,
    rng,
    definition,
  );
  return {
    ...runtime,
    selectionTrace: {
      source: requestedGameId === undefined ? "weighted" : "requested",
      requestedGameId: requestedGameId ?? null,
      selectionRoll,
      totalWeight,
      candidates: configuredGames.map((game) => ({
        gameId: game.id,
        weight: game.selection.weight,
        fallback: game.selection.fallback,
      })),
      selectedGameId: runtime.gameId,
    },
  };
}

function buildGambleRuntimeFromDefinition(
  journey: JourneyState,
  site: SiteState,
  content: JourneyContent,
  rng: () => number,
  game: GambleGameDefinition,
): GambleSiteRuntime {
  if (
    game.rules.kind === "ladderClimb" &&
    game.economy.kind === "ladderClimb"
  ) {
    const ladderRuntime = buildTidemarkLadderClimbRuntime(
      journey,
      site,
      content,
      game as LadderClimbGame,
      rng,
    );
    return (
      ladderRuntime ?? buildGambleFallbackRuntime(journey, site, content, rng)
    );
  }
  if (
    game.rules.kind === "starwayStairs" &&
    game.economy.kind === "starwayStairs"
  ) {
    return buildStarwayStairsRuntime(site, game as StarwayStairsGame, rng);
  }
  if (
    game.rules.kind === "fourSuitReprise" &&
    game.economy.kind === "fourSuitReprise"
  ) {
    const fourSuitRuntime = buildFourSuitRepriseRuntime(
      journey,
      site,
      content,
      game as FourSuitRepriseGame,
      rng,
    );
    return (
      fourSuitRuntime ?? buildGambleFallbackRuntime(journey, site, content, rng)
    );
  }
  if (game.rules.kind === "blackjack" && game.economy.kind === "blackjack") {
    return buildBlackjackRuntime(site, game as BlackjackGame, rng);
  }
  if (game.rules.kind === "threeGate" && game.economy.kind === "threeGate") {
    return buildGravokWagerRuntime(
      journey,
      site,
      content,
      game as ThreeGateGame,
      rng,
    );
  }
  throw new Error(`Mismatched Gamble catalog variants for ${game.id}`);
}

function buildGambleFallbackRuntime(
  journey: JourneyState,
  site: SiteState,
  content: JourneyContent,
  rng: () => number,
): GambleSiteRuntime {
  const gambleData = content.gambleData;
  const fallback = gambleData?.games.find((game) => game.selection.fallback);
  if (fallback === undefined)
    throw new Error("Gamble catalog has no fallback game");
  return buildGambleRuntimeFromDefinition(
    journey,
    site,
    content,
    rng,
    fallback,
  );
}

/**
 * Select up to three deck entries to surface at a card-choice site (the whole
 * deck at an enhanced site). Candidate order is a deterministic rng shuffle; a
 * transfiguration site skips entries with no eligible form.
 */
function selectCardChoiceEntryIds(
  deck: readonly DeckEntry[],
  content: JourneyContent,
  kind: "transfiguration" | "duplication",
  isEnhanced: boolean,
  rng: () => number,
): string[] {
  const ordered = isEnhanced ? [...deck] : rngShuffle(deck, rng);
  const duplicationLimits = content.sitesData.cardChoices.duplication;
  const configuredLimit =
    kind === "transfiguration"
      ? isEnhanced
        ? content.transfigurationData.site.enhancedChoiceLimit
        : content.transfigurationData.site.standardChoiceLimit
      : isEnhanced
        ? duplicationLimits.enhancedLimit
        : duplicationLimits.standardLimit;
  const limit = configuredLimit ?? Number.POSITIVE_INFINITY;
  const entryIds: string[] = [];
  for (const entry of ordered) {
    if (entryIds.length >= limit) break;
    const card = content.cardDatabase.get(entry.cardNumber);
    if (card === undefined) continue;
    if (
      kind === "transfiguration" &&
      (entry.transfiguration !== null ||
        offeredTransfigurationForms(
          content.transfigurationData,
          card,
          entry.transfiguration,
        ).length === 0)
    ) {
      continue;
    }
    entryIds.push(entry.entryId);
  }
  return entryIds;
}

/** Build a Transfiguration / Duplication card-choice runtime. */
function buildCardChoiceRuntime(
  journey: JourneyState,
  site: SiteState,
  content: JourneyContent,
  kind: "transfiguration" | "duplication",
  rng: () => number,
): CardChoiceSiteRuntime {
  const entryIds = selectCardChoiceEntryIds(
    journey.deck,
    content,
    kind,
    site.isEnhanced,
    rng,
  );

  if (kind === "duplication") {
    return {
      kind: "cardChoice",
      choiceKind: "duplication",
      entryIds,
      acceptedEntryIds: [],
    };
  }

  const deckByEntryId = new Map(
    journey.deck.map((entry) => [entry.entryId, entry]),
  );
  const transfigurationOffers: CardChoiceTransfigurationOffer[] = [];
  for (const entryId of entryIds) {
    const entry = deckByEntryId.get(entryId);
    if (entry === undefined) continue;
    const card = content.cardDatabase.get(entry.cardNumber);
    if (card === undefined) continue;
    for (const offer of offeredTransfigurationForms(
      content.transfigurationData,
      card,
      entry.transfiguration,
    )) {
      transfigurationOffers.push({
        entryId,
        type: offer.type,
        change: offer.change,
        effectDetails: transfigurationEffectDetails(offer, card),
        previewCard: offer.previewCard,
        essenceCost: transfigurationEssenceCost(
          content.transfigurationData,
          journey.seed,
          site.id,
          entryId,
          card,
          offer.type,
        ),
      });
    }
  }
  return {
    kind: "cardChoice",
    choiceKind: "transfiguration",
    entryIds,
    acceptedEntryIds: [],
    transfigurationOffers,
  };
}

export function createSiteContentProvider(
  content: JourneyContent,
): SiteContentProvider {
  const dreamsignRegenerationPoolIds = (
    journey: JourneyState,
  ): readonly string[] => journey.resolvedPackage?.dreamsignPoolIds ?? [];
  const tutorialOpeningDreamsignIds = (
    journey: JourneyState,
    site: SiteState,
  ): readonly string[] => {
    if (journey.isTutorialJourney !== true) return [];
    const openingNode = journey.atlas.nodes[journey.atlas.startingNodeId];
    const openingRevelation = openingNode?.sites.find(
      (candidate) => candidate.type === "DreamsignRevelation",
    );
    if (openingRevelation?.id !== site.id) return [];
    return journey.resolvedPackage?.openingDreamsignOfferIds ?? [];
  };

  return {
    sitesData: content.sitesData,
    economyData: content.economyData,
    gambleData: content.gambleData,
    openSite: ({
      journey,
      site,
      rng,
      gambleGameId,
      selectionRulesVersion,
    }): SiteOpenResult | null => {
      const stream = streamFromKeyed(rng);
      switch (site.type) {
        case "Augury": {
          if (selectionRulesVersion !== SELECTION_RULES_VERSION) return null;
          const merchantContext = buildMerchantContext({
            journeyState: journey,
            journeyContent: content,
            site,
          });
          const generated = generateMerchantEncounter(merchantContext);
          const selectionContext = buildRewardSelectionContext({
            journeyState: journey,
            journeyContent: content,
            site,
          });
          return {
            runtime: {
              kind: "augury",
              completed: false,
              selectionRulesVersion: SELECTION_RULES_VERSION,
              selectionContentRevision:
                selectionContext.selectionContentRevision,
              encounter: {
                ...generated,
                selectionRulesVersion: SELECTION_RULES_VERSION,
                selectionContentRevision:
                  selectionContext.selectionContentRevision,
              },
            },
          };
        }
        case "Reward": {
          const generated = generateRewardSiteData({
            economy: content.economyData.siteRewards.reward,
            dreamsignTemplates: content.dreamsignTemplates,
            remainingDreamsignPoolIds: journey.remainingDreamsignPool,
            regenerationPoolIds: dreamsignRegenerationPoolIds(journey),
            rng: stream,
          });
          const runtime: RewardSiteRuntime = {
            kind: "reward",
            reward: generated.reward,
            remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
            accepted: false,
          };
          // Keep the run pool unchanged when the essence fallback spent nothing;
          // otherwise persist the pool the reward draw consumed.
          if (generated.spentDreamsignPoolIds.length === 0) {
            return { runtime };
          }
          return {
            runtime,
            remainingDreamsignPool: generated.remainingDreamsignPoolIds,
          };
        }
        case "DreamsignRevelation": {
          const optionCount = site.isEnhanced
            ? content.economyData.siteRewards.dreamsignRevelation
                .enhancedOfferCount
            : content.economyData.siteRewards.dreamsignRevelation
                .standardOfferCount;
          const draw = drawDreamsignOptions(
            journey.remainingDreamsignPool,
            content.dreamsignTemplates,
            optionCount,
            dreamsignRegenerationPoolIds(journey),
            stream,
            tutorialOpeningDreamsignIds(journey, site),
          );
          const runtime: SiteRuntimeState = {
            kind: "dreamsignOffer",
            offeredDreamsigns: draw.offeredDreamsigns,
            remainingDreamsignPool: draw.remainingDreamsignPool,
            accepted: false,
          };
          return {
            runtime,
            remainingDreamsignPool: draw.remainingDreamsignPool,
          };
        }
        case "Shop":
        case "DreamsignMarket": {
          const isMarket = site.type === "DreamsignMarket";
          const stock = isMarket
            ? content.economyData.shop.stock.dreamsignMarket
            : site.isEnhanced
              ? content.economyData.shop.stock.specialtyShop
              : content.economyData.shop.stock.cardShop;
          const generated = generateShopInventory({
            economy: content.economyData.shop,
            cardDatabase: content.cardDatabase,
            draftState: isMarket ? null : shopSourceDraftState(journey),
            remainingDreamsignPoolIds: journey.remainingDreamsignPool,
            dreamsignTemplates: content.dreamsignTemplates,
            dreamsignRegenerationPoolIds: dreamsignRegenerationPoolIds(journey),
            cardCount: stock.cardSlots,
            dreamsignCount: stock.dreamsignSlots,
            rng: stream,
          });
          const baseSlots = shopSlotsToRuntime(generated.slots);
          const modifierIndex =
            site.type === "Shop"
              ? journey.siteOfferModifiers.findIndex(
                  (modifier) =>
                    modifier.kind === "transfigure-next-draft-or-shop",
                )
              : -1;
          const modifier =
            modifierIndex < 0
              ? undefined
              : journey.siteOfferModifiers[modifierIndex];
          const runtime: SiteRuntimeState = {
            kind: "shop",
            slots:
              modifier === undefined
                ? baseSlots
                : transfigureShopSlots(baseSlots, content, stream),
            rerollCount: 0,
            remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
            ...(modifier === undefined
              ? {}
              : {
                  transfiguredOfferSource: {
                    siteId: modifier.sourceSiteId,
                    actionId: modifier.sourceActionId,
                  },
                }),
          };
          // SEAM (Task 27): the `SiteOpenResult` seam cannot carry the spent
          // draft state (only `remainingDreamsignPool`), so a pool-mode shop's
          // draft-multiset consumption is not persisted on OPEN. Slots are still
          // drawn deterministically from the run pool. The Dreamsign pool the
          // shop drew is persisted below.
          return {
            runtime,
            remainingDreamsignPool: generated.remainingDreamsignPoolIds,
            ...(modifierIndex < 0
              ? {}
              : {
                  siteOfferModifiers: journey.siteOfferModifiers.filter(
                    (_modifier, index) => index !== modifierIndex,
                  ),
                }),
          };
        }
        case "Transfiguration":
        case "Duplication": {
          const kind =
            site.type === "Transfiguration" ? "transfiguration" : "duplication";
          const runtime = buildCardChoiceRuntime(
            journey,
            site,
            content,
            kind,
            stream,
          );
          return { runtime };
        }
        case "Gamble": {
          return {
            runtime: buildGambleRuntime(
              journey,
              site,
              content,
              stream,
              gambleGameId,
            ),
          };
        }
        case "Exploration": {
          const runtime =
            selectionRulesVersion === undefined
              ? buildLegacyExplorationRuntime(journey, site, content, stream)
              : selectionRulesVersion === SELECTION_RULES_VERSION
                ? buildExplorationRuntime(journey, site, content, stream)
                : null;
          if (runtime === null) return null;
          return {
            runtime,
          };
        }
        default:
          return null;
      }
    },

    rerollShop: ({ journey, site, rng }): ShopRerollResult | null => {
      const stream = streamFromKeyed(rng);
      const isMarket = site.type === "DreamsignMarket";
      const stock = isMarket
        ? content.economyData.shop.stock.dreamsignMarket
        : site.isEnhanced
          ? content.economyData.shop.stock.specialtyShop
          : content.economyData.shop.stock.cardShop;
      const generated = generateShopInventory({
        economy: content.economyData.shop,
        cardDatabase: content.cardDatabase,
        draftState: isMarket ? null : shopSourceDraftState(journey),
        remainingDreamsignPoolIds: journey.remainingDreamsignPool,
        dreamsignTemplates: content.dreamsignTemplates,
        dreamsignRegenerationPoolIds: dreamsignRegenerationPoolIds(journey),
        cardCount: stock.cardSlots,
        dreamsignCount: stock.dreamsignSlots,
        rng: stream,
      });
      // Task-15 trap: deck-fit runs keep the live draft state, and a card-less
      // shop hands back no draft state (`generated.draftState` is `undefined`),
      // so `?? journey.draftState` keeps the run's draft pool intact rather than
      // null-wiping it on a reroll. ALWAYS returns the resolved draft state.
      const draftState = isDeckFitDraft(journey)
        ? journey.draftState
        : (generated.draftState ?? journey.draftState);
      const currentRuntime = journey.siteRuntime[site.id];
      return {
        slots:
          currentRuntime?.kind === "shop" &&
          currentRuntime.transfiguredOfferSource !== undefined
            ? transfigureShopSlots(
                shopSlotsToRuntime(generated.slots),
                content,
                stream,
              )
            : shopSlotsToRuntime(generated.slots),
        remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
        remainingDreamsignPool: generated.remainingDreamsignPoolIds,
        draftState,
      };
    },

    // Resolve a Dream Merchant / Augury ACCEPT / DECLINE. The whole
    // resolution (encounter regeneration, offer lookup, payload application,
    // site completion) is a PURE function of `(journey, journeyContent, site,
    // request)` — no rng, no clock — so the provider `rng` is unused. Both
    // resolvers regenerate the encounter deterministically from the same journey
    // state the reducer folds against, so two clients resolve identically.
    resolveMerchant: ({
      journey,
      site,
      action,
      payload,
      seq,
    }): JourneyState | null => {
      const encounterSignature = asString(payload.encounterSignature);
      const offerId = asString(payload.offerId);
      const selectionRulesVersion = asString(payload.selectionRulesVersion);
      if (encounterSignature === null || offerId === null) return null;
      const choice = coerceMerchantChoice(payload.choice);

      if (action === "decline") {
        const result = resolveMerchantDecline({
          state: journey,
          journeyContent: content,
          site,
          request: {
            encounterSignature,
            offerId,
            ...(selectionRulesVersion === null
              ? {}
              : { selectionRulesVersion }),
            ...(choice ? { choice } : {}),
          },
        });
        return result.ok ? result.state : null;
      }

      const archetypeId = asString(payload.archetypeId);
      if (archetypeId === null) return null;
      const result = resolveMerchantOffer({
        state: journey,
        journeyContent: content,
        site,
        request: {
          encounterSignature,
          offerId,
          archetypeId: archetypeId as MerchantArchetypeId,
          ...(selectionRulesVersion === null ? {} : { selectionRulesVersion }),
          ...(choice ? { choice } : {}),
        },
        // Mint any new deck entry through the SAME seq-keyed scheme every
        // other minting reducer case uses (audit finding P3-8), instead of
        // this module's legacy standalone counter.
        mintEntryId: (deck, index) => mintEntryId(deck, seq, index),
      });
      return result.ok ? result.state : null;
    },

    resolveExploration: ({ journey, site, payload, seq }) =>
      resolveExplorationChoice({ journey, site, payload, seq, content }),
  };
}
