import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  GambleGateView,
  GambleSiteView,
  FourSuitRepriseCardView,
  FourSuitRepriseSiteView,
  GravokWagerSiteView,
  LadderClimbSiteView,
  StarwayStairsSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import type { TransfigurationCandidateView } from "../../cumulus/screens/TransfigurationSiteScreen";
import {
  GRAVOK_GATE_RULES,
  GRAVOK_WAGER_MAX_RETRIES,
  gravokGateEssenceReward,
  gravokGateChanceLabel,
} from "../../data/gravok-wager";
import {
  nextTidemarkLadderClimbAttemptNumber,
  tidemarkLadderClimbAttemptCost,
  tidemarkLadderClimbAttemptRule,
} from "../../data/tidemark-ladder-climb";
import {
  nextStarwayStairsTierNumber,
  STARWAY_STAIRS_MAX_RETRIES,
  STARWAY_STAIRS_TIERS,
  starwayStairsDrawTargetLabel,
  starwayStairsEssenceReward,
} from "../../data/starway-stairs";
import {
  eligibleFourSuitRepriseTargets,
  FOUR_SUIT_REPRISE_MAX_ROUNDS,
} from "../../data/four-suit-reprise";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import { guideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type { AtlasData } from "../../types/atlas-data";
import type {
  DreamscapeNode,
  FourSuitRepriseSiteRuntime,
  FourSuitRepriseTarget,
  GambleSiteRuntime,
  GravokWagerSiteRuntime,
  JourneyState,
  SiteState,
  StarwayStairsSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
} from "../../types/journey";
import type { GravokGateId } from "../../types/gamble";
import type { EconomyData } from "../../types/economy-data";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

export const GRAVOK_WAGER_GUIDE_LINE =
  "The game's called Three Gates. Place your bet on the next card drawn!";
export const STARWAY_STAIRS_GUIDE_LINE =
  "Starway Stairs is the game. Keep betting to see how high you can go!";
export const FOUR_SUIT_REPRISE_GUIDE_LINE =
  "Four-Suit Reprise is the game. Choose one card; the suit decides what becomes of it.";

/** The next gate in display order supplies the non-selected reveal object. */
export function gravokRevealGateId(selectedGateId: GravokGateId): GravokGateId {
  const selectedIndex = GRAVOK_GATE_RULES.findIndex(
    (gate) => gate.id === selectedGateId,
  );
  return GRAVOK_GATE_RULES[(selectedIndex + 1) % GRAVOK_GATE_RULES.length].id;
}

/** Resolve the resident Dream Guide for Gamble. */
export function resolveGambleGuide(
  guides: readonly DreamGuideContent[],
  guideIdOverride?: string,
): DreamGuideContent | null {
  return guideForSiteType(guides, "Gamble", guideIdOverride);
}

/** Map the authoritative rules table and locked jackpot into three choices. */
export function buildGambleGateViews(
  economy: EconomyData["gamble"]["threeGate"],
  runtime: GravokWagerSiteRuntime | null,
  maxDreamsigns: number,
): readonly GambleGateView[] {
  return GRAVOK_GATE_RULES.map((gate) => ({
    id: gate.id,
    name: gate.name,
    targetLabel: `${gate.threshold}-A`,
    chanceLabel: gravokGateChanceLabel(gate),
    oddsNumerator: gate.oddsNumerator,
    oddsDenominator: gate.oddsDenominator,
    essenceReward: gravokGateEssenceReward(economy, gate.id),
    rewardDreamsign: gate.awardsDreamsign
      ? (runtime?.rewardDreamsign ?? null)
      : null,
    available:
      !gate.awardsDreamsign ||
      (runtime?.rewardDreamsign !== null &&
        runtime?.rewardDreamsign !== undefined &&
        maxDreamsigns > 0),
  }));
}

function commonGambleView(params: {
  sceneNode: DreamscapeNode | null;
  guide: DreamGuideContent | null;
  guideLine: string;
  randomSiteGuideLine: string | null;
}): { scene: ArtRef | null; guide: GravokWagerSiteView["guide"] } {
  const guideId = params.guide?.id ?? "gravok";
  const guideLine = params.randomSiteGuideLine ?? params.guideLine;
  return {
    scene:
      params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode),
    guide: {
      id: guideId,
      name: params.guide?.name ?? "Gravok",
      line: guideLine,
      art: artRef.dreamGuide(guideId),
    },
  };
}

function buildGravokWagerSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent | null;
  atlasData: AtlasData;
  runtime: GravokWagerSiteRuntime;
  economyData: EconomyData;
}): GravokWagerSiteView {
  const { runtime } = params;
  const result = runtime.result;
  const rewardDreamsign =
    result?.won === true && result.gateId === "jack"
      ? runtime.rewardDreamsign
      : null;
  const wonLargestPrize =
    result?.won === true &&
    result.essenceGained === Math.max(...Object.values(params.economyData.gamble.threeGate.rewards));

  return {
    gameId: "gravok-three-gate-wager",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: GRAVOK_WAGER_GUIDE_LINE,
      randomSiteGuideLine: params.site.randomSite?.materialized === true
        ? params.atlasData.randomSite.guideLine
        : null,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
    wagerCost: runtime.wagerCost,
    canAfford: params.state.essence >= runtime.wagerCost,
    canPlayAgain:
      result !== null &&
      !wonLargestPrize &&
      (runtime.roundNumber ?? 1) <= GRAVOK_WAGER_MAX_RETRIES,
    card: {
      rank: result?.card.rank ?? "A",
      suit: result?.card.suit ?? "spades",
    },
    gates: buildGambleGateViews(params.economyData.gamble.threeGate, runtime, params.state.maxDreamsigns),
    result:
      result === null
        ? null
        : {
            id: `${params.site.id}:${runtime.shuffleCommitment}:${result.gateId}:${result.card.rank}-${result.card.suit}`,
            gateId: result.gateId,
            revealGateId: gravokRevealGateId(result.gateId),
            won: result.won,
            essenceGained: result.essenceGained,
            essenceSettled: result.essenceSettled !== false,
            rewardDreamsign,
            pendingDreamsignReplacement: result.pendingDreamsignReplacement,
          },
    replacement:
      result?.pendingDreamsignReplacement === true &&
      runtime.rewardDreamsign !== null
        ? {
            pendingDreamsign: runtime.rewardDreamsign,
            currentDreamsigns: params.state.dreamsigns,
            maxDreamsigns: params.state.maxDreamsigns,
          }
        : null,
  };
}

function buildLadderClimbSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent | null;
  atlasData: AtlasData;
  runtime: TidemarkLadderClimbSiteRuntime;
  economyData: EconomyData;
}): LadderClimbSiteView {
  const { runtime } = params;
  const result = runtime.result;
  const nextAttempt = nextTidemarkLadderClimbAttemptNumber(runtime);
  const nextCost =
    nextAttempt === null
      ? null
      : tidemarkLadderClimbAttemptCost(params.economyData.gamble.ladderClimb, nextAttempt, runtime.isFarpoint);

  return {
    gameId: "tidemark-ladder-climb",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: `The game's Ladder Climb. Match or beat the target to win ${String(params.economyData.gamble.ladderClimb.winEssence)} Essence and a Dreamsign. Try again with better odds if you miss!`,
      randomSiteGuideLine: params.site.randomSite?.materialized === true
        ? params.atlasData.randomSite.guideLine
        : null,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
    essenceReward: params.economyData.gamble.ladderClimb.winEssence,
    rewardDreamsign: runtime.rewardDreamsign,
    nextDraw:
      nextAttempt === null || nextCost === null
        ? null
        : {
            attemptNumber: nextAttempt,
            targetRank: tidemarkLadderClimbAttemptRule(nextAttempt).threshold,
            cost: nextCost,
            canAfford: params.state.essence >= nextCost,
            available: params.state.maxDreamsigns > 0,
          },
    result:
      result === null
        ? null
        : {
            id: `${params.site.id}:${runtime.shuffleCommitments[result.attemptNumber - 1] ?? "unprepared"}:${String(result.attemptNumber)}`,
            attemptNumber: result.attemptNumber,
            targetRank: tidemarkLadderClimbAttemptRule(result.attemptNumber).threshold,
            card: result.card,
            won: result.won,
            resultSettled: result.resultSettled,
            terminal: result.won || result.attemptNumber === 4,
            pendingDreamsignReplacement: result.pendingDreamsignReplacement,
          },
    replacement:
      result?.pendingDreamsignReplacement === true
        ? {
            pendingDreamsign: runtime.rewardDreamsign,
            currentDreamsigns: params.state.dreamsigns,
            maxDreamsigns: params.state.maxDreamsigns,
          }
        : null,
  };
}

function buildStarwayStairsSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent | null;
  atlasData: AtlasData;
  runtime: StarwayStairsSiteRuntime;
  economyData: EconomyData;
}): StarwayStairsSiteView {
  const { runtime } = params;
  const latestResult = runtime.results[runtime.results.length - 1] ?? null;
  const currentTierNumber = nextStarwayStairsTierNumber(runtime);
  const cashOutReward =
    latestResult !== null &&
    latestResult.resultSettled &&
    !latestResult.busted &&
    latestResult.tierNumber < STARWAY_STAIRS_TIERS.length &&
    runtime.terminalReason === null
      ? starwayStairsEssenceReward(params.economyData.gamble.starwayStairs, latestResult.tierNumber)
      : null;

  return {
    gameId: "starway-stairs",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: STARWAY_STAIRS_GUIDE_LINE,
      randomSiteGuideLine: params.site.randomSite?.materialized === true
        ? params.atlasData.randomSite.guideLine
        : null,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
    wagerAmount: runtime.wagerAmount,
    canAffordWager: params.state.essence >= runtime.wagerAmount,
    canPlayAgain:
      runtime.terminalReason === "bust" &&
      runtime.roundNumber <= STARWAY_STAIRS_MAX_RETRIES,
    tiers: STARWAY_STAIRS_TIERS.map((tier) => {
      const result = runtime.results.find(
        (entry) => entry.tierNumber === tier.tierNumber,
      );
      return {
        tierNumber: tier.tierNumber,
        drawTargetLabel: starwayStairsDrawTargetLabel(tier),
        essenceReward: starwayStairsEssenceReward(params.economyData.gamble.starwayStairs, tier.tierNumber),
        state:
          result !== undefined
            ? result.busted
              ? "bust" as const
              : "safe" as const
            : currentTierNumber === tier.tierNumber
              ? "current" as const
              : "future" as const,
        card: result?.card ?? null,
      };
    }),
    currentTierNumber,
    result:
      latestResult === null
        ? null
        : {
            id: `${params.site.id}:${runtime.shuffleCommitments[latestResult.tierNumber - 1] ?? "unprepared"}:${String(latestResult.tierNumber)}`,
            tierNumber: latestResult.tierNumber,
            busted: latestResult.busted,
            resultSettled: latestResult.resultSettled,
            prizeAtRisk: starwayStairsEssenceReward(params.economyData.gamble.starwayStairs, latestResult.tierNumber),
          },
    cashOutReward,
    terminalReason: runtime.terminalReason,
    prizeAwarded: runtime.prizeAwarded,
  };
}

function buildFourSuitTransfigurationCandidate(
  target: FourSuitRepriseTarget,
): TransfigurationCandidateView {
  return {
    entryId: target.entryId,
    model: {
      cardId: target.cardSnapshot.id,
      displaySnapshot: target.cardSnapshot,
    },
    availability: "available",
    reforgedType: null,
    forms: target.transfigurationOffers.map((offer) => {
      const preview = buildTransfigurationDisplay(
        target.cardSnapshot,
        offer.type,
      );
      return {
        type: offer.type,
        description: offer.effectDescription,
        effectDetails: offer.effectDetails,
        essenceCost: 0,
        affordable: true,
        previewModel: {
          cardId: target.cardSnapshot.id,
          displaySnapshot: preview.card,
          transfiguration: preview.display,
        },
      };
    }),
  };
}

function fourSuitCardView(
  target: FourSuitRepriseTarget,
): FourSuitRepriseCardView {
  return {
    entryId: target.entryId,
    cardId: target.cardId,
    model: {
      cardId: target.cardSnapshot.id,
      displaySnapshot: target.cardSnapshot,
    },
  };
}

function buildFourSuitRepriseSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent | null;
  atlasData: AtlasData;
  runtime: FourSuitRepriseSiteRuntime;
}): FourSuitRepriseSiteView {
  const { runtime } = params;
  const latestRound = runtime.rounds[runtime.rounds.length - 1] ?? null;
  const availableTargets = eligibleFourSuitRepriseTargets({
    targets: runtime.targets,
    deck: params.state.deck,
    usedCardIds: runtime.rounds.map((round) => round.targetCardId),
  });
  const target = latestRound === null
    ? null
    : runtime.targets.find(
        (candidate) => candidate.entryId === latestRound.targetEntryId,
      ) ?? null;
  const chosenPreview =
    target === null || latestRound?.chosenTransfiguration === undefined
      ? null
      : buildTransfigurationDisplay(
          target.cardSnapshot,
          latestRound.chosenTransfiguration,
        );
  const resultTarget = target === null
    ? null
    : {
        ...fourSuitCardView(target),
        model: chosenPreview === null
          ? fourSuitCardView(target).model
          : {
              cardId: target.cardSnapshot.id,
              displaySnapshot: chosenPreview.card,
              transfiguration: chosenPreview.display,
            },
      };
  const cards = availableTargets.map(fourSuitCardView);
  const roundNumber = (
    runtime.phase === "choose"
      ? Math.min(runtime.rounds.length + 1, FOUR_SUIT_REPRISE_MAX_ROUNDS)
      : latestRound?.roundNumber ?? 1
  ) as 1 | 2 | 3;

  return {
    gameId: "four-suit-reprise",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: FOUR_SUIT_REPRISE_GUIDE_LINE,
      randomSiteGuideLine: params.site.randomSite?.materialized === true
        ? params.atlasData.randomSite.guideLine
        : null,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
    drawCost: runtime.drawCost,
    canAffordDraw: params.state.essence >= runtime.drawCost,
    roundNumber,
    maxRounds: FOUR_SUIT_REPRISE_MAX_ROUNDS,
    phase: runtime.phase,
    cards,
    result:
      latestRound === null || target === null || resultTarget === null
        ? null
        : {
            id: `${params.site.id}:${latestRound.shuffleCommitment}:${latestRound.targetEntryId}`,
            roundNumber: latestRound.roundNumber,
            card: latestRound.card,
            outcome: latestRound.outcome,
            resultRevealed: latestRound.resultRevealed,
            resultSettled: latestRound.resultSettled,
            essenceGained: latestRound.essenceGained,
            target: resultTarget,
            transfigurationCandidate:
              buildFourSuitTransfigurationCandidate(target),
            chosenTransfiguration:
              latestRound.chosenTransfiguration ?? null,
          },
    canPlayAgain:
      runtime.phase === "result" &&
      latestRound?.resultSettled === true &&
      runtime.rounds.length < FOUR_SUIT_REPRISE_MAX_ROUNDS &&
      cards.length > 0 &&
      params.state.essence >= runtime.drawCost,
  };
}

/** Build the selected Gamble game's view without exposing future outcomes. */
export function buildGambleSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent | null;
  atlasData: AtlasData;
  economyData: EconomyData;
}): GambleSiteView | null {
  const runtimeCandidate = params.state.siteRuntime[params.site.id];
  const runtime: GambleSiteRuntime | null =
    runtimeCandidate?.kind === "gamble" ? runtimeCandidate : null;
  if (runtime === null) return null;
  if (runtime.gameId === "tidemark-ladder-climb") {
    return buildLadderClimbSiteView({ ...params, runtime });
  }
  if (runtime.gameId === "starway-stairs") {
    return buildStarwayStairsSiteView({ ...params, runtime });
  }
  if (runtime.gameId === "four-suit-reprise") {
    return buildFourSuitRepriseSiteView({ ...params, runtime });
  }
  return buildGravokWagerSiteView({ ...params, runtime });
}
