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
import { localizedTransfigurationPresentation } from "../../cumulus/components/controls/transfiguration-presentation";
import { txa, type LocalizedString } from "@trox/runtime";
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
  blackjackEssenceAward,
  blackjackHandTotal,
} from "../../data/blackjack";
import { gambleGameByRulesKind } from "../../data/gamble-data";
import { transfigurationForm } from "../../data/transfiguration-data";
import {
  buildTransfigurationDisplay,
  describeTransfiguration,
} from "../../transfiguration/transfiguration-logic";
import { requireGuideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type {
  BlackjackGame,
  FourSuitRepriseGame,
  GambleData,
  LadderClimbGame,
  StarwayStairsGame,
  ThreeGateGame,
} from "../../types/gamble-data";
import type { TransfigurationData } from "../../types/transfiguration-data";
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
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { projectGuideView } from "./guide-view-model";
import { localizedDreamsign } from "../../cumulus/components/hud/localized-dreamsign";

/** The next gate in display order supplies the non-selected reveal object. */
export function gravokRevealGateId(
  rules: ThreeGateGame["rules"],
  selectedGateId: GravokGateId,
): GravokGateId {
  const selectedIndex = rules.gates.findIndex(
    (gate) => gate.gate === selectedGateId,
  );
  return rules.gates[(selectedIndex + 1) % rules.gates.length].gate;
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
  game: ThreeGateGame,
  runtime: GravokWagerSiteRuntime | null,
  maxDreamsigns: number,
): readonly GambleGateView[] {
  return game.rules.gates.map((gate) => ({
    id: gate.gate,
    targetLabel: txa(
      "{minimum_rank}-A",
      { minimum_rank: gate.threshold },
      "Compact inclusive winning-rank notation on a Gamble prize card. minimum_rank is the lowest standard playing-card rank that wins; A is the ace at the top of the range.",
    ),
    chanceLabel: txa(
      "{chance_percent}%",
      {
        chance_percent: Number.parseFloat(
          gravokGateChanceLabel(game, gate).replace("%", ""),
        ),
      },
      "Exact winning probability for one wager gate. chance_percent is the percentage from zero through one hundred, rounded to two decimal places before display.",
    ),
    oddsNumerator: gate.winningCardCount,
    oddsDenominator: game.rules.standardDeckSize,
    essenceReward: gravokGateEssenceReward(game.economy, gate.gate),
    rewardDreamsign:
      gate.awardsDreamsign && runtime?.rewardDreamsign != null
        ? localizedDreamsign(runtime.rewardDreamsign, "Gamble gate reward")
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
  guideLine: LocalizedString;
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
  guideLine: LocalizedString;
  game: ThreeGateGame;
  runtime: GravokWagerSiteRuntime;
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
      Math.max(...params.game.economy.rewards.map((reward) => reward.essence));

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
      (runtime.roundNumber ?? 1) <= params.game.rules.maxRetries,
    card: {
      rank: result?.card.rank ?? "A",
      suit: result?.card.suit ?? "spades",
    },
    gates: buildGambleGateViews(
      params.game,
      runtime,
      params.state.maxDreamsigns,
    ),
    result:
      result === null
        ? null
        : {
            id: `${params.site.id}:${runtime.shuffleCommitment}:${result.gateId}:${result.card.rank}-${result.card.suit}`,
            gateId: result.gateId,
            revealGateId: gravokRevealGateId(params.game.rules, result.gateId),
            won: result.won,
            essenceGained: result.essenceGained,
            essenceSettled: result.essenceSettled !== false,
            rewardDreamsign:
              rewardDreamsign === null
                ? null
                : localizedDreamsign(rewardDreamsign, "Gamble result reward"),
            pendingDreamsignReplacement: result.pendingDreamsignReplacement,
          },
    replacement:
      result?.pendingDreamsignReplacement === true &&
      runtime.rewardDreamsign !== null
        ? {
            pendingDreamsign: localizedDreamsign(
              runtime.rewardDreamsign,
              "Gamble pending reward",
            ),
            currentDreamsigns: params.state.dreamsigns.map((dreamsign) =>
              localizedDreamsign(dreamsign, "Gamble held collection"),
            ),
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
  guideLine: LocalizedString;
  game: LadderClimbGame;
  runtime: TidemarkLadderClimbSiteRuntime;
}): LadderClimbSiteView {
  const { runtime } = params;
  const result = runtime.result;
  const nextAttempt = nextTidemarkLadderClimbAttemptNumber(
    params.game.rules,
    runtime,
  );
  const nextCost =
    nextAttempt === null
      ? null
      : tidemarkLadderClimbAttemptCost(
          params.game.economy,
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
    essenceReward: params.game.economy.winEssence,
    rewardDreamsign: localizedDreamsign(
      runtime.rewardDreamsign,
      "Ladder Climb reward",
    ),
    nextDraw:
      nextAttempt === null || nextCost === null
        ? null
        : {
            attemptNumber: nextAttempt,
            targetRank: tidemarkLadderClimbAttemptRule(
              params.game.rules,
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
              params.game.rules,
              result.attemptNumber,
            ).threshold,
            card: result.card,
            won: result.won,
            resultSettled: result.resultSettled,
            terminal:
              result.won ||
              result.attemptNumber === params.game.rules.attempts.length,
            pendingDreamsignReplacement: result.pendingDreamsignReplacement,
          },
    replacement:
      result?.pendingDreamsignReplacement === true
        ? {
            pendingDreamsign: localizedDreamsign(
              runtime.rewardDreamsign,
              "Ladder Climb pending reward",
            ),
            currentDreamsigns: params.state.dreamsigns.map((dreamsign) =>
              localizedDreamsign(dreamsign, "Gamble held collection"),
            ),
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
  guideLine: LocalizedString;
  game: StarwayStairsGame;
  runtime: StarwayStairsSiteRuntime;
}): StarwayStairsSiteView {
  const { runtime } = params;
  const latestResult = runtime.results[runtime.results.length - 1] ?? null;
  const currentTierNumber = nextStarwayStairsTierNumber(
    params.game.rules,
    runtime,
  );
  const cashOutReward =
    latestResult !== null &&
    latestResult.resultSettled &&
    !latestResult.busted &&
    latestResult.tierNumber < params.game.rules.tiers.length &&
    runtime.terminalReason === null
      ? starwayStairsEssenceReward(params.game.economy, latestResult.tierNumber)
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
      runtime.roundNumber <= params.game.rules.maxRetries,
    tiers: params.game.rules.tiers.map((tier) => {
      const result = runtime.results.find(
        (entry) => entry.tierNumber === tier.tier,
      );
      return {
        tierNumber: tier.tier,
        drawTargetLabel: txa(
          "{winning_range}",
          { winning_range: starwayStairsDrawTargetLabel(tier) },
          "Compact inclusive winning-rank notation on a Starway prize card. winning_range contains two standard playing-card ranks separated by a hyphen.",
        ),
        essenceReward: starwayStairsEssenceReward(
          params.game.economy,
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
              params.game.economy,
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
  guideLine: LocalizedString;
  runtime: BlackjackSiteRuntime;
  game: BlackjackGame;
}): BlackjackSiteView {
  const { runtime } = params;
  const playerTotal =
    runtime.playerCards.length === 0
      ? null
      : blackjackHandTotal(runtime.playerCards, params.game.rules.target);
  const visibleDealerCards = runtime.dealerRevealed
    ? runtime.dealerCards
    : runtime.dealerCards.slice(0, 1);
  const dealerTotal =
    visibleDealerCards.length === 0
      ? null
      : blackjackHandTotal(visibleDealerCards, params.game.rules.target);
  const essenceAwarded =
    runtime.outcome === null
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
    maxAttempts: params.game.rules.maxAttempts,
    target: params.game.rules.target,
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
          runtime.attemptNumber < params.game.rules.maxAttempts)) &&
      runtime.resultSettled &&
      params.state.essence >= runtime.wagerCost,
  };
}

function buildFourSuitTransfigurationCandidate(
  transfigurationData: TransfigurationData,
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
        transfigurationData,
        target.cardSnapshot,
        offer.type,
      );
      return {
        type: offer.type,
        presentation: localizedTransfigurationPresentation(
          transfigurationForm(transfigurationData, offer.type),
        ),
        change:
          offer.change ??
          describeTransfiguration(
            transfigurationData,
            target.cardSnapshot,
            offer.type,
          ),
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
  guideLine: LocalizedString;
  game: FourSuitRepriseGame;
  runtime: FourSuitRepriseSiteRuntime;
  transfigurationData: TransfigurationData;
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
          params.transfigurationData,
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
      ? Math.min(runtime.rounds.length + 1, params.game.rules.maxRounds)
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
    maxRounds: params.game.rules.maxRounds,
    essenceReward: params.game.economy.essenceReward,
    outcomes: params.game.rules.outcomes,
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
            transfigurationCandidate: buildFourSuitTransfigurationCandidate(
              params.transfigurationData,
              target,
            ),
            chosenTransfiguration: latestRound.chosenTransfiguration ?? null,
          },
    canPlayAgain:
      runtime.phase === "result" &&
      latestRound?.resultSettled === true &&
      runtime.rounds.length < params.game.rules.maxRounds &&
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
  guideLine: LocalizedString;
  gambleData: GambleData;
  transfigurationData: TransfigurationData;
}): GambleSiteView | null {
  const runtimeCandidate = params.state.siteRuntime[params.site.id];
  const runtime: GambleSiteRuntime | null =
    runtimeCandidate?.kind === "gamble" ? runtimeCandidate : null;
  if (runtime === null) return null;
  if (runtime.gameId === "tidemark-ladder-climb") {
    return buildLadderClimbSiteView({
      ...params,
      runtime,
      game: gambleGameByRulesKind(params.gambleData, "ladderClimb"),
    });
  }
  if (runtime.gameId === "starway-stairs") {
    return buildStarwayStairsSiteView({
      ...params,
      runtime,
      game: gambleGameByRulesKind(params.gambleData, "starwayStairs"),
    });
  }
  if (runtime.gameId === "four-suit-reprise") {
    return buildFourSuitRepriseSiteView({
      ...params,
      runtime,
      game: gambleGameByRulesKind(params.gambleData, "fourSuitReprise"),
    });
  }
  if (runtime.gameId === "blackjack") {
    return buildBlackjackSiteView({
      ...params,
      runtime,
      game: gambleGameByRulesKind(params.gambleData, "blackjack"),
    });
  }
  return buildGravokWagerSiteView({
    ...params,
    runtime,
    game: gambleGameByRulesKind(params.gambleData, "threeGate"),
  });
}
