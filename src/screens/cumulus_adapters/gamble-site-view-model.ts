import type { ArtRef } from "../../cumulus/primitives/art";
import type {
  GambleGateView,
  GambleSiteView,
  FourSuitRepriseCardView,
  FourSuitRepriseSiteView,
  GravokWagerSiteView,
  LadderClimbSiteView,
  StarwayStairsSiteView,
  BlackjackSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import type { TransfigurationCandidateView } from "../../cumulus/screens/TransfigurationSiteScreen";
import {
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
  starwayStairsDrawTargetLabel,
  starwayStairsEssenceReward,
} from "../../data/starway-stairs";
import { eligibleFourSuitRepriseTargets } from "../../data/four-suit-reprise";
import {
  BLACKJACK_MAX_ATTEMPTS,
  blackjackEssenceAward,
  blackjackHandTotal,
} from "../../data/blackjack";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import { requireGuideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type { SitesData } from "../../types/sites-data";
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
  BlackjackSiteRuntime,
} from "../../types/journey";
import type { GravokGateId } from "../../types/gamble";
import type { EconomyData } from "../../types/economy-data";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { projectGuideView } from "./guide-view-model";

/** The next gate in display order supplies the non-selected reveal object. */
export function gravokRevealGateId(
  rules: SitesData["gamble"]["threeGate"],
  selectedGateId: GravokGateId,
): GravokGateId {
  const selectedIndex = rules.gates.findIndex(
    (gate) => gate.id === selectedGateId,
  );
  return rules.gates[(selectedIndex + 1) % rules.gates.length].id;
}

/** Resolve the resident Dream Guide for Gamble. */
export function resolveGambleGuide(
  guides: readonly DreamGuideContent[],
  guideIdOverride?: string,
): DreamGuideContent {
  return requireGuideForSiteType(guides, "Gamble", guideIdOverride);
}

/** Map the authoritative rules table and locked jackpot into three choices. */
export function buildGambleGateViews(
  economy: EconomyData["gamble"]["threeGate"],
  rules: SitesData["gamble"]["threeGate"],
  runtime: GravokWagerSiteRuntime | null,
  maxDreamsigns: number,
): readonly GambleGateView[] {
  return rules.gates.map((gate) => ({
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
  guide: DreamGuideContent;
  guideLine: string;
}): { scene: ArtRef | null; guide: GravokWagerSiteView["guide"] } {
  return {
    scene:
      params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode),
    guide: projectGuideView(params.guide, params.guideLine),
  };
}

function buildGravokWagerSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent;
  guideLine: string;
  sitesData: SitesData;
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
    result.essenceGained ===
      Math.max(...Object.values(params.economyData.gamble.threeGate.rewards));

  return {
    gameId: "gravok-three-gate-wager",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: params.guideLine,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
    wagerCost: runtime.wagerCost,
    canAfford: params.state.essence >= runtime.wagerCost,
    canPlayAgain:
      result !== null &&
      !wonLargestPrize &&
      (runtime.roundNumber ?? 1) <=
        params.sitesData.gamble.threeGate.maxRetries,
    card: {
      rank: result?.card.rank ?? "A",
      suit: result?.card.suit ?? "spades",
    },
    gates: buildGambleGateViews(
      params.economyData.gamble.threeGate,
      params.sitesData.gamble.threeGate,
      runtime,
      params.state.maxDreamsigns,
    ),
    result:
      result === null
        ? null
        : {
            id: `${params.site.id}:${runtime.shuffleCommitment}:${result.gateId}:${result.card.rank}-${result.card.suit}`,
            gateId: result.gateId,
            revealGateId: gravokRevealGateId(
              params.sitesData.gamble.threeGate,
              result.gateId,
            ),
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
  guide: DreamGuideContent;
  guideLine: string;
  sitesData: SitesData;
  runtime: TidemarkLadderClimbSiteRuntime;
  economyData: EconomyData;
}): LadderClimbSiteView {
  const { runtime } = params;
  const result = runtime.result;
  const nextAttempt = nextTidemarkLadderClimbAttemptNumber(
    params.sitesData.gamble.ladderClimb,
    runtime,
  );
  const nextCost =
    nextAttempt === null
      ? null
      : tidemarkLadderClimbAttemptCost(
          params.economyData.gamble.ladderClimb,
          nextAttempt,
          runtime.isFarpoint,
        );

  return {
    gameId: "tidemark-ladder-climb",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: params.guideLine,
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
            targetRank: tidemarkLadderClimbAttemptRule(
              params.sitesData.gamble.ladderClimb,
              nextAttempt,
            ).threshold,
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
            targetRank: tidemarkLadderClimbAttemptRule(
              params.sitesData.gamble.ladderClimb,
              result.attemptNumber,
            ).threshold,
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
  guide: DreamGuideContent;
  guideLine: string;
  sitesData: SitesData;
  runtime: StarwayStairsSiteRuntime;
  economyData: EconomyData;
}): StarwayStairsSiteView {
  const { runtime } = params;
  const latestResult = runtime.results[runtime.results.length - 1] ?? null;
  const currentTierNumber = nextStarwayStairsTierNumber(
    params.sitesData.gamble.starwayStairs,
    runtime,
  );
  const cashOutReward =
    latestResult !== null &&
    latestResult.resultSettled &&
    !latestResult.busted &&
    latestResult.tierNumber <
      params.sitesData.gamble.starwayStairs.tiers.length &&
    runtime.terminalReason === null
      ? starwayStairsEssenceReward(
          params.economyData.gamble.starwayStairs,
          latestResult.tierNumber,
        )
      : null;

  return {
    gameId: "starway-stairs",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: params.guideLine,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
    wagerAmount: runtime.wagerAmount,
    canAffordWager: params.state.essence >= runtime.wagerAmount,
    canPlayAgain:
      runtime.terminalReason === "bust" &&
      runtime.roundNumber <= params.sitesData.gamble.starwayStairs.maxRetries,
    tiers: params.sitesData.gamble.starwayStairs.tiers.map((tier) => {
      const result = runtime.results.find(
        (entry) => entry.tierNumber === tier.tier,
      );
      return {
        tierNumber: tier.tier,
        drawTargetLabel: starwayStairsDrawTargetLabel(tier),
        essenceReward: starwayStairsEssenceReward(
          params.economyData.gamble.starwayStairs,
          tier.tier,
        ),
        state:
          result !== undefined
            ? result.busted
              ? ("bust" as const)
              : ("safe" as const)
            : currentTierNumber === tier.tier
              ? ("current" as const)
              : ("future" as const),
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
            prizeAtRisk: starwayStairsEssenceReward(
              params.economyData.gamble.starwayStairs,
              latestResult.tierNumber,
            ),
          },
    cashOutReward,
    terminalReason: runtime.terminalReason,
    prizeAwarded: runtime.prizeAwarded,
  };
}

function buildBlackjackSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent;
  guideLine: string;
  runtime: BlackjackSiteRuntime;
  economyData: EconomyData;
}): BlackjackSiteView {
  const { runtime } = params;
  const playerTotal = runtime.playerCards.length === 0
    ? null
    : blackjackHandTotal(runtime.playerCards);
  const visibleDealerCards = runtime.dealerRevealed
    ? runtime.dealerCards
    : runtime.dealerCards.slice(0, 1);
  const dealerTotal = visibleDealerCards.length === 0
    ? null
    : blackjackHandTotal(visibleDealerCards);
  const essenceAwarded = runtime.outcome === null
    ? 0
    : blackjackEssenceAward(
        runtime.wagerCost,
        runtime.prizeEssence,
        runtime.outcome,
      );
  return {
    gameId: "blackjack",
    siteId: params.site.id,
    handId: runtime.shuffleCommitment,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: params.guideLine,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
    wagerCost: runtime.wagerCost,
    prizeEssence: runtime.prizeEssence,
    attemptNumber: runtime.attemptNumber,
    maxAttempts: BLACKJACK_MAX_ATTEMPTS,
    canAffordWager: params.state.essence >= runtime.wagerCost,
    playerCards: runtime.playerCards,
    playerTotal,
    dealerCards: runtime.dealerCards,
    dealerTotal,
    dealerRevealed: runtime.dealerRevealed,
    outcome: runtime.outcome,
    essenceAwarded,
    resultSettled: runtime.resultSettled,
    resultId:
      runtime.outcome === null
        ? null
        : `${params.site.id}:${runtime.shuffleCommitment}:${runtime.outcome}:${String(runtime.deckCursor)}`,
    canPlayAgain:
      (runtime.outcome === "push" ||
        (runtime.outcome === "dealer-win" &&
          runtime.attemptNumber < BLACKJACK_MAX_ATTEMPTS)) &&
      runtime.resultSettled &&
      params.state.essence >= runtime.wagerCost,
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
        change: offer.change,
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
  guide: DreamGuideContent;
  guideLine: string;
  sitesData: SitesData;
  economyData: EconomyData;
  runtime: FourSuitRepriseSiteRuntime;
}): FourSuitRepriseSiteView {
  const { runtime } = params;
  const latestRound = runtime.rounds[runtime.rounds.length - 1] ?? null;
  const availableTargets = eligibleFourSuitRepriseTargets({
    targets: runtime.targets,
    deck: params.state.deck,
    usedCardIds: runtime.rounds.map((round) => round.targetCardId),
  });
  const target =
    latestRound === null
      ? null
      : (runtime.targets.find(
          (candidate) => candidate.entryId === latestRound.targetEntryId,
        ) ?? null);
  const chosenPreview =
    target === null || latestRound?.chosenTransfiguration === undefined
      ? null
      : buildTransfigurationDisplay(
          target.cardSnapshot,
          latestRound.chosenTransfiguration,
        );
  const resultTarget =
    target === null
      ? null
      : {
          ...fourSuitCardView(target),
          model:
            chosenPreview === null
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
      ? Math.min(
          runtime.rounds.length + 1,
          params.sitesData.gamble.fourSuitReprise.maxRounds,
        )
      : (latestRound?.roundNumber ?? 1)
  ) as 1 | 2 | 3;

  return {
    gameId: "four-suit-reprise",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: params.guideLine,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
    drawCost: runtime.drawCost,
    canAffordDraw: params.state.essence >= runtime.drawCost,
    roundNumber,
    maxRounds: params.sitesData.gamble.fourSuitReprise.maxRounds,
    essenceReward: params.economyData.gamble.fourSuitReprise.essenceReward,
    outcomes: params.sitesData.gamble.fourSuitReprise.outcomes,
    phase: runtime.phase,
    cards,
    result:
      runtime.phase !== "result" ||
      latestRound === null ||
      target === null ||
      resultTarget === null
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
            chosenTransfiguration: latestRound.chosenTransfiguration ?? null,
          },
    canPlayAgain:
      runtime.phase === "result" &&
      latestRound?.resultSettled === true &&
      runtime.rounds.length <
        params.sitesData.gamble.fourSuitReprise.maxRounds &&
      cards.length > 0 &&
      params.state.essence >= runtime.drawCost,
  };
}

/** Build the selected Gamble game's view without exposing future outcomes. */
export function buildGambleSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent;
  guideLine: string;
  sitesData: SitesData;
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
  if (runtime.gameId === "blackjack") {
    return buildBlackjackSiteView({ ...params, runtime });
  }
  return buildGravokWagerSiteView({ ...params, runtime });
}
