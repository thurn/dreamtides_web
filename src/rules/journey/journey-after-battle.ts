import type { AfterBattleJourneyChoice, AfterBattleDuplicationSource, AfterBattleDreamsignSource, AfterBattlePurgeSource, AfterBattleTransfigurationSource, JourneyState, Screen } from "../../types/journey";
import { dreamsignIdFromUnknown, siteIdFromUnknown } from "../../types/identifiers";
import type { JourneyModifierRegistry } from "./modifier-registry";
import { findSite } from "./sites";

type ClassifiedSource =
  | { readonly kind: "purge"; readonly source: AfterBattlePurgeSource }
  | { readonly kind: "transfiguration"; readonly source: AfterBattleTransfigurationSource }
  | { readonly kind: "dreamsign"; readonly source: AfterBattleDreamsignSource }
  | { readonly kind: "duplication"; readonly source: AfterBattleDuplicationSource };

/** Ephemeral selected-source proof; the original permission remains the saved value. */
export type ActiveAfterBattle = ClassifiedSource & Readonly<Pick<AfterBattleJourneyChoice, "index" | "siteId" | "returnTo">> & {
  readonly choice: AfterBattleJourneyChoice;
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const index = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Decode source structure once, retaining the original object and legacy purge tag. */
function classifyAfterBattleSource(value: unknown): ClassifiedSource | null {
  if (!record(value) || !index(value.heldIndex) || dreamsignIdFromUnknown(value.dreamsignId) === null) return null;
  // This private decode boundary checks each arm before returning its original object.
  const source = value as unknown as AfterBattleJourneyChoice["sources"][number];
  switch (source.kind) {
    case "dreamsign": {
      if (!index(source.earnedSeq) || !index(source.offerCount) || !Array.isArray(source.offeredDreamsigns) || source.offeredDreamsigns.length > source.offerCount || !Array.isArray(source.remainingPoolIds)) return null;
      const offered = source.offeredDreamsigns.map((sign) => record(sign) && dreamsignIdFromUnknown(sign.id) !== null && typeof sign.name === "string" && typeof sign.effectDescription === "string" && (sign.imageName === undefined || typeof sign.imageName === "string") && (sign.imageAlt === undefined || typeof sign.imageAlt === "string") ? dreamsignIdFromUnknown(sign.id) : null);
      const remaining = source.remainingPoolIds.map(dreamsignIdFromUnknown);
      if (offered.some((id) => id === null) || new Set(offered).size !== offered.length || remaining.some((id) => id === null || offered.includes(id)) || new Set(remaining).size !== remaining.length) return null;
      return { kind: "dreamsign", source };
    }
    case "duplication": return index(source.earnedSeq) ? { kind: "duplication", source } : null;
    case "transfiguration": return index(source.maxCount) && source.maxCount >= 1 ? { kind: "transfiguration", source } : null;
    case "purge":
    case undefined: return index(source.maxCount) && source.maxCount >= 1 ? { kind: "purge", source } : null;
    default: return null;
  }
}

function cursorFor(choice: AfterBattleJourneyChoice, selected: ClassifiedSource): ActiveAfterBattle {
  return { ...selected, choice, index: choice.index, siteId: choice.siteId, returnTo: choice.returnTo };
}

/** Typed projection checks the selected source structure, without catalog or route admission. */
export function projectAfterBattleCursor(choice: AfterBattleJourneyChoice): ActiveAfterBattle | null {
  if (!index(choice.index)) return null;
  const selected = classifyAfterBattleSource(choice.sources[choice.index]);
  return selected === null ? null : cursorFor(choice, selected);
}

export function afterBattleChoice(screen: Screen): AfterBattleJourneyChoice | null {
  if (screen.type === "journeyDuplication") return screen.choice;
  if (screen.type === "journeyTransfiguration") return screen.choice;
  if (screen.type === "journeyDreamsign" && screen.choice.kind === "afterBattle") return screen.choice;
  return screen.type === "journeyPurge" && screen.choice.kind === "afterBattle" ? screen.choice : null;
}

/** Four concrete earned purposes share the battle's original terminal route. */
export function afterBattleScreen(cursor: ActiveAfterBattle): Screen {
  const choice = cursor.choice;
  switch (cursor.kind) {
    case "purge": return { type: "journeyPurge", choice };
    case "transfiguration": return { type: "journeyTransfiguration", choice };
    case "dreamsign": return { type: "journeyDreamsign", choice };
    case "duplication": return { type: "journeyDuplication", choice };
  }
}

export function appendAfterBattleSource(journey: JourneyState, siteId: AfterBattleJourneyChoice["siteId"],
  source: AfterBattlePurgeSource | AfterBattleTransfigurationSource | AfterBattleDreamsignSource | AfterBattleDuplicationSource): JourneyState | null {
  const previous = afterBattleChoice(journey.screen);
  if (previous === null && journey.screen.type !== "atlas" && journey.screen.type !== "journeyComplete" && journey.screen.type !== "journeyFailed") return null;
  const returnTo = previous?.returnTo ?? journey.screen.type as AfterBattleJourneyChoice["returnTo"];
  const choice: AfterBattleJourneyChoice = { kind: "afterBattle", siteId, sources: [...(previous?.sources ?? []), source], index: 0, returnTo };
  const cursor = projectAfterBattleCursor(choice);
  return cursor === null ? null : { ...journey, screen: afterBattleScreen(cursor) };
}

export function advanceAfterBattle(journey: JourneyState, cursor: ActiveAfterBattle): JourneyState {
  if (cursor.index + 1 === cursor.choice.sources.length) return { ...journey, screen: { type: cursor.returnTo } };
  const next = projectAfterBattleCursor({ ...cursor.choice, index: cursor.index + 1 });
  if (next === null) throw new Error("Earned after-battle continuation is unavailable.");
  return { ...journey, screen: afterBattleScreen(next) };
}

/** Validate the complete saved permission independently of current holdings. */
export function validatedAfterBattleCursor(value: unknown, journey: JourneyState, registry: JourneyModifierRegistry): ActiveAfterBattle | null {
  if (!record(value) || value.kind !== "afterBattle" || siteIdFromUnknown(value.siteId) === null ||
    !Array.isArray(value.sources) || value.sources.length === 0 || !index(value.index) || value.index >= value.sources.length ||
    !record(journey.atlas) || !record(journey.atlas.nodes) || !Array.isArray(journey.atlas.layers) ||
    Object.values(journey.atlas.nodes).some((node) => !record(node) || !Array.isArray(node.sites))) return null;
  const site = findSite(journey, siteIdFromUnknown(value.siteId)!);
  if (site?.type !== "Battle") return null;
  let previous = -1, selected: ClassifiedSource | null = null;
  for (const [sourceIndex, raw] of value.sources.entries()) {
    const classified = classifyAfterBattleSource(raw);
    if (classified === null || classified.source.heldIndex <= previous) return null;
    const definition = registry.lookup(dreamsignIdFromUnknown(classified.source.dreamsignId)!);
    switch (classified.kind) {
      case "dreamsign": {
        const effect = definition?.journeyOnGain;
        if (effect?.kind !== "afterBattleDreamsignChoice" || effect.offerCount !== classified.source.offerCount) return null;
        break;
      }
      case "duplication": if (definition?.journeyDuplication?.kind !== "afterBattleDuplication") return null; break;
      case "transfiguration": {
        const effect = definition?.journeyTransfiguration;
        if (effect?.kind !== "afterBattleTransfiguration" || effect.maxCount !== classified.source.maxCount) return null;
        break;
      }
      case "purge": {
        const effect = definition?.journeyPurge;
        if (effect?.kind !== "afterBattlePurge" || effect.maxCount !== classified.source.maxCount) return null;
        break;
      }
    }
    previous = classified.source.heldIndex;
    if (sourceIndex === value.index) selected = classified;
  }
  if (value.returnTo === "journeyFailed") {
    const summary: unknown = journey.failureSummary;
    if (!(record(summary) && summary.siteId === value.siteId && (summary.result === "defeat" || summary.result === "draw") &&
      index(summary.turnNumber) && typeof summary.playerScore === "number" && Number.isFinite(summary.playerScore) &&
      typeof summary.enemyScore === "number" && Number.isFinite(summary.enemyScore) &&
      (summary.reason === "score_target_reached" || summary.reason === "win_condition_met" || summary.reason === "turn_limit_reached" || summary.reason === "unbreakable_loop") &&
      summary.nodeIdOrNone === journey.currentDreamscape)) return null;
  } else {
    if (journey.currentDreamscape !== null || !site.isVisited) return null;
    if (!(value.returnTo === "atlas" ? journey.completionLevel < journey.atlas.layers.length :
      value.returnTo === "journeyComplete" && journey.completionLevel === journey.atlas.layers.length)) return null;
  }
  // All persisted fields and every source have passed their original admission checks.
  return selected === null ? null : cursorFor(value as unknown as AfterBattleJourneyChoice, selected);
}

/** Compatibility for saved-state and nested-continuation consumers. */
export function validAfterBattleChoice(value: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  return validatedAfterBattleCursor(value, journey, registry) !== null;
}
