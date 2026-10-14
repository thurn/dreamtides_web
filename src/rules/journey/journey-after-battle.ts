import type { AfterBattleJourneyChoice, AfterBattleDreamsignSource, AfterBattlePurgeSource, AfterBattleTransfigurationSource, JourneyState, Screen } from "../../types/journey";
import { dreamsignIdFromUnknown, siteIdFromUnknown } from "../../types/identifiers";
import type { JourneyModifierRegistry } from "./modifier-registry";
import { findSite } from "./sites";

export function afterBattleChoice(screen: Screen): AfterBattleJourneyChoice | null {
  if (screen.type === "journeyTransfiguration") return screen.choice;
  if (screen.type === "journeyDreamsign" && screen.choice.kind === "afterBattle") return screen.choice;
  return screen.type === "journeyPurge" && screen.choice.kind === "afterBattle" ? screen.choice : null;
}

/** Three concrete earned purposes share the battle's original terminal route. */
export function afterBattleScreen(choice: AfterBattleJourneyChoice): Screen {
  return choice.sources[choice.index]?.kind === "dreamsign" ? { type: "journeyDreamsign", choice } : choice.sources[choice.index]?.kind === "transfiguration"
    ? { type: "journeyTransfiguration", choice } : { type: "journeyPurge", choice };
}

export function appendAfterBattleSource(journey: JourneyState, siteId: AfterBattleJourneyChoice["siteId"],
  source: AfterBattlePurgeSource | AfterBattleTransfigurationSource | AfterBattleDreamsignSource): JourneyState | null {
  const previous = afterBattleChoice(journey.screen);
  if (previous === null && journey.screen.type !== "atlas" && journey.screen.type !== "journeyComplete" && journey.screen.type !== "journeyFailed") return null;
  const returnTo = previous?.returnTo ?? journey.screen.type as AfterBattleJourneyChoice["returnTo"];
  const choice: AfterBattleJourneyChoice = { kind: "afterBattle", siteId, sources: [...(previous?.sources ?? []), source], index: 0, returnTo };
  return { ...journey, screen: afterBattleScreen(choice) };
}

export function advanceAfterBattle(journey: JourneyState, choice: AfterBattleJourneyChoice): JourneyState {
  return { ...journey, screen: choice.index + 1 < choice.sources.length
    ? afterBattleScreen({ ...choice, index: choice.index + 1 }) : { type: choice.returnTo } };
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const index = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Validate the saved three-kind permission independently of current holdings. */
export function validAfterBattleChoice(value: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (!record(value) || value.kind !== "afterBattle" || siteIdFromUnknown(value.siteId) === null ||
    !Array.isArray(value.sources) || value.sources.length === 0 || !index(value.index) || value.index >= value.sources.length ||
    !record(journey.atlas) || !record(journey.atlas.nodes) || !Array.isArray(journey.atlas.layers) ||
    Object.values(journey.atlas.nodes).some((node) => !record(node) || !Array.isArray(node.sites))) return false;
  const site = findSite(journey, siteIdFromUnknown(value.siteId)!);
  if (site?.type !== "Battle") return false;
  let previous = -1;
  for (const source of value.sources) {
    if (!record(source) || !index(source.heldIndex) || source.heldIndex <= previous) return false;
    const id = dreamsignIdFromUnknown(source.dreamsignId);
    if (id === null) return false;
    const definition = registry.lookup(id);
    if (source.kind === "dreamsign") {
      const effect = definition?.journeyOnGain;
      if (effect?.kind !== "afterBattleDreamsignChoice" || !index(source.earnedSeq) || source.offerCount !== effect.offerCount || !Array.isArray(source.offeredDreamsigns) || source.offeredDreamsigns.length > effect.offerCount || !Array.isArray(source.remainingPoolIds)) return false;
      const offered = source.offeredDreamsigns.map((sign) => record(sign) && dreamsignIdFromUnknown(sign.id) !== null && typeof sign.name === "string" && typeof sign.effectDescription === "string" && (sign.imageName === undefined || typeof sign.imageName === "string") && (sign.imageAlt === undefined || typeof sign.imageAlt === "string") ? dreamsignIdFromUnknown(sign.id) : null);
      const remaining = source.remainingPoolIds.map(dreamsignIdFromUnknown);
      if (offered.some((id) => id === null) || new Set(offered).size !== offered.length || remaining.some((id) => id === null || offered.includes(id)) || new Set(remaining).size !== remaining.length) return false;
    } else if (!index(source.maxCount) || source.maxCount < 1) return false;
    else if (source.kind === "transfiguration") {
      const effect = definition?.journeyTransfiguration;
      if (effect?.kind !== "afterBattleTransfiguration" || effect.maxCount !== source.maxCount) return false;
    } else {
      const effect = definition?.journeyPurge;
      if (source.kind !== undefined && source.kind !== "purge" || effect?.kind !== "afterBattlePurge" || effect.maxCount !== source.maxCount) return false;
    }
    previous = source.heldIndex;
  }
  if (value.returnTo === "journeyFailed") {
    const summary: unknown = journey.failureSummary;
    return record(summary) && summary.siteId === value.siteId && (summary.result === "defeat" || summary.result === "draw") &&
      index(summary.turnNumber) && typeof summary.playerScore === "number" && Number.isFinite(summary.playerScore) &&
      typeof summary.enemyScore === "number" && Number.isFinite(summary.enemyScore) &&
      (summary.reason === "score_target_reached" || summary.reason === "win_condition_met" || summary.reason === "turn_limit_reached" || summary.reason === "unbreakable_loop") &&
      summary.nodeIdOrNone === journey.currentDreamscape;
  }
  if (journey.currentDreamscape !== null || !site.isVisited) return false;
  return value.returnTo === "atlas" ? journey.completionLevel < journey.atlas.layers.length :
    value.returnTo === "journeyComplete" && journey.completionLevel === journey.atlas.layers.length;
}
