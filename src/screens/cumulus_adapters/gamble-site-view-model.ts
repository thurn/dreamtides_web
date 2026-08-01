import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  GambleGateView,
  GambleSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import {
  GRAVOK_GATE_RULES,
  GRAVOK_WAGER_COST,
  gravokGateChanceLabel,
} from "../../data/gravok-wager";
import { guideForSiteType } from "../../data/dreamscapes";
import type { DreamGuideContent } from "../../types/content";
import type {
  DreamscapeNode,
  GambleSiteRuntime,
  JourneyState,
  SiteState,
} from "../../types/journey";
import type { GravokGateId } from "../../types/gamble";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

export const GRAVOK_WAGER_GUIDE_LINE =
  "The game's called Three Gates. Place your bet on the next card drawn!";

/** The next gate in display order supplies the non-selected reveal object. */
export function gravokRevealGateId(selectedGateId: GravokGateId): GravokGateId {
  const selectedIndex = GRAVOK_GATE_RULES.findIndex(
    (gate) => gate.id === selectedGateId,
  );
  return GRAVOK_GATE_RULES[
    (selectedIndex + 1) % GRAVOK_GATE_RULES.length
  ].id;
}

/** Resolve the resident Dream Guide for Gamble. */
export function resolveGambleGuide(
  guides: readonly DreamGuideContent[],
): DreamGuideContent | null {
  return guideForSiteType(guides, "Gamble");
}

/** Map the authoritative rules table and locked jackpot into three choices. */
export function buildGambleGateViews(
  runtime: GambleSiteRuntime | null,
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
      ? runtime?.rewardDreamsign ?? null
      : null,
    available:
      !gate.awardsDreamsign ||
      (runtime?.rewardDreamsign !== null &&
        runtime?.rewardDreamsign !== undefined &&
        maxDreamsigns > 0),
  }));
}

/** Build the complete view for Gravok's Three-Gate Wager. */
export function buildGambleSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent | null;
}): GambleSiteView {
  const runtimeCandidate = params.state.siteRuntime[params.site.id];
  const runtime =
    runtimeCandidate?.kind === "gamble" ? runtimeCandidate : null;
  const guideId = params.guide?.id ?? "gravok";
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  const result = runtime?.result ?? null;
  const rewardDreamsign =
    result?.won === true && result.gateId === "jack"
      ? runtime?.rewardDreamsign ?? null
      : null;

  return {
    siteId: params.site.id,
    scene,
    isFarpoint: runtime?.isFarpoint ?? params.site.isEnhanced,
    runtimeReady: runtime !== null,
    wagerCost:
      runtime?.wagerCost ?? (params.site.isEnhanced ? 0 : GRAVOK_WAGER_COST),
    canAfford:
      params.state.essence >=
      (runtime?.wagerCost ??
        (params.site.isEnhanced ? 0 : GRAVOK_WAGER_COST)),
    card: {
      rank: result?.card.rank ?? "A",
      suit: result?.card.suit ?? "spades",
    },
    gates: buildGambleGateViews(runtime, params.state.maxDreamsigns),
    guide: {
      id: guideId,
      name: params.guide?.name ?? "Gravok",
      line: GRAVOK_WAGER_GUIDE_LINE,
      art: artRef.dreamGuide(guideId),
    },
    result:
      result === null
        ? null
        : {
            id: `${params.site.id}:${result.gateId}:${result.card.rank}-${result.card.suit}`,
            gateId: result.gateId,
            revealGateId: gravokRevealGateId(result.gateId),
            won: result.won,
            essenceGained: result.essenceGained,
            essenceSettled: result.essenceSettled !== false,
            rewardDreamsign,
            pendingDreamsignReplacement:
              result.pendingDreamsignReplacement,
          },
    replacement:
      result?.pendingDreamsignReplacement === true &&
      runtime?.rewardDreamsign !== null &&
      runtime?.rewardDreamsign !== undefined
        ? {
            pendingDreamsign: runtime.rewardDreamsign,
            currentDreamsigns: params.state.dreamsigns,
            maxDreamsigns: params.state.maxDreamsigns,
          }
        : null,
  };
}
