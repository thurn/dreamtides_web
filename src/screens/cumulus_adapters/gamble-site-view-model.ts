import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  GambleGateView,
  GambleSiteView,
  GravokWagerSiteView,
  LadderClimbSiteView,
  StarwayStairsSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import {
  GRAVOK_GATE_RULES,
  GRAVOK_WAGER_MAX_RETRIES,
  gravokGateChanceLabel,
} from "../../data/gravok-wager";
import {
  nextTidemarkLadderClimbAttemptNumber,
  tidemarkLadderClimbAttemptCost,
  tidemarkLadderClimbAttemptRule,
} from "../../data/tidemark-ladder-climb";
import {
  nextStarwayStairsTierNumber,
  STARWAY_STAIRS_TIERS,
  starwayStairsBustRangeLabel,
  starwayStairsTierRule,
} from "../../data/starway-stairs";
import { guideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type {
  DreamscapeNode,
  GambleSiteRuntime,
  GravokWagerSiteRuntime,
  JourneyState,
  SiteState,
  StarwayStairsSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
} from "../../types/journey";
import type { GravokGateId } from "../../types/gamble";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

export const GRAVOK_WAGER_GUIDE_LINE =
  "The game's called Three Gates. Place your bet on the next card drawn!";
export const TIDEMARK_LADDER_CLIMB_GUIDE_LINE =
  "The game's Ladder Climb. Match or beat the target to win a Dreamsign. Try again with better odds if you miss!";
export const STARWAY_STAIRS_GUIDE_LINE =
  "Starway Stairs is the game. Keep betting to see how high you can go!";

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
    essenceReward: gate.essenceReward,
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
}): { scene: ArtRef | null; guide: GravokWagerSiteView["guide"] } {
  const guideId = params.guide?.id ?? "gravok";
  const guideLine =
    params.guide?.id === "maddox"
      ? (params.guide.dialog[0] ?? "Let’s see where this road takes us.")
      : params.guideLine;
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
  runtime: GravokWagerSiteRuntime;
}): GravokWagerSiteView {
  const { runtime } = params;
  const result = runtime.result;
  const rewardDreamsign =
    result?.won === true && result.gateId === "jack"
      ? runtime.rewardDreamsign
      : null;

  return {
    gameId: "gravok-three-gate-wager",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: GRAVOK_WAGER_GUIDE_LINE,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
    wagerCost: runtime.wagerCost,
    canAfford: params.state.essence >= runtime.wagerCost,
    canPlayAgain: (runtime.roundNumber ?? 1) <= GRAVOK_WAGER_MAX_RETRIES,
    card: {
      rank: result?.card.rank ?? "A",
      suit: result?.card.suit ?? "spades",
    },
    gates: buildGambleGateViews(runtime, params.state.maxDreamsigns),
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
  runtime: TidemarkLadderClimbSiteRuntime;
}): LadderClimbSiteView {
  const { runtime } = params;
  const result = runtime.result;
  const nextAttempt = nextTidemarkLadderClimbAttemptNumber(runtime);
  const nextCost =
    nextAttempt === null
      ? null
      : tidemarkLadderClimbAttemptCost(nextAttempt, runtime.isFarpoint);

  return {
    gameId: "tidemark-ladder-climb",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: TIDEMARK_LADDER_CLIMB_GUIDE_LINE,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
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
  runtime: StarwayStairsSiteRuntime;
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
      ? starwayStairsTierRule(latestResult.tierNumber).essenceReward
      : null;

  return {
    gameId: "starway-stairs",
    siteId: params.site.id,
    ...commonGambleView({
      sceneNode: params.sceneNode,
      guide: params.guide,
      guideLine: STARWAY_STAIRS_GUIDE_LINE,
    }),
    isFarpoint: runtime.isFarpoint,
    runtimeReady: true,
    entryCost: runtime.entryCost,
    canAffordEntry: params.state.essence >= runtime.entryCost,
    tiers: STARWAY_STAIRS_TIERS.map((tier) => {
      const result = runtime.results.find(
        (entry) => entry.tierNumber === tier.tierNumber,
      );
      return {
        tierNumber: tier.tierNumber,
        bustRangeLabel: starwayStairsBustRangeLabel(tier),
        essenceReward: tier.essenceReward,
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
            prizeAtRisk: starwayStairsTierRule(latestResult.tierNumber)
              .essenceReward,
          },
    cashOutReward,
    terminalReason: runtime.terminalReason,
    prizeAwarded: runtime.prizeAwarded,
  };
}

/** Build the selected Gamble game's view without exposing future outcomes. */
export function buildGambleSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent | null;
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
  return buildGravokWagerSiteView({ ...params, runtime });
}
