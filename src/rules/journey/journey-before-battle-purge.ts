import type { EventContext } from "../../eventlog/types";
import { eventRng } from "../../eventlog/rng";
import { atlasNodeIdFromUnknown, deckEntryIdFromUnknown, dreamsignIdFromUnknown, parseJourneyId, siteIdFromUnknown } from "../../types/identifiers";
import { journeySeedFromUnknown } from "../../types/journey-seed";
import type { BeforeBattleJourneyPurgeChoice, JourneyPurgeTransition, JourneyState } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { beginBattleWithCommits, validJourneyBattleStart } from "../battle/journey-battle";
import type { JourneyModifierRegistry } from "./modifier-registry";
import { canVisitSite, findSite } from "./sites";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const index = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const fields = ["kind", "siteId", "dreamsignId", "heldIndex", "minimumDeckSize", "earnedSeq", "seed", "seedOverride", "timestamp", "nodeId", "completionLevel", "continuation"];

/** Intrinsic saved data, independent of catalog registration and current source holdings. */
function validBeforeBattlePurgeData(value: unknown, journey: unknown): value is BeforeBattleJourneyPurgeChoice {
  if (!record(value) || value.kind !== "beforeBattle" || Object.keys(value).length !== fields.length || Object.keys(value).some((key) => !fields.includes(key)) ||
    siteIdFromUnknown(value.siteId) === null || dreamsignIdFromUnknown(value.dreamsignId) === null || !index(value.heldIndex) || !index(value.minimumDeckSize) || !index(value.earnedSeq) ||
    journeySeedFromUnknown(value.seed) === null || !(value.seedOverride === null || index(value.seedOverride)) || typeof value.timestamp !== "string" || value.timestamp.length === 0 ||
    !(value.nodeId === null || atlasNodeIdFromUnknown(value.nodeId) !== null) || !index(value.completionLevel) || !record(value.continuation) ||
    Object.keys(value.continuation).length !== 2 || value.continuation.type !== "site" || value.continuation.siteId !== value.siteId || !record(journey) ||
    journey.seed !== value.seed || journey.currentDreamscape !== value.nodeId || journey.completionLevel !== value.completionLevel ||
    !record(journey.atlas) || !record(journey.atlas.nodes) || !Array.isArray(journey.atlas.layers) ||
    Object.values(journey.atlas.nodes).some((node) => !record(node) || !Array.isArray(node.sites))) return false;
  if (journey.runId !== null) { try { parseJourneyId(journey.runId); } catch { return false; } }
  const nodeId = atlasNodeIdFromUnknown(value.nodeId);
  const node = nodeId === null ? undefined : journey.atlas.nodes[nodeId];
  if (!record(node) || !Array.isArray(node.sites) || !node.sites.some((site: unknown) => record(site) && site.id === value.siteId)) return false;
  const projected = { ...journey, screen: value.continuation } as unknown as JourneyState;
  return findSite(projected, value.siteId as BeforeBattleJourneyPurgeChoice["siteId"])?.type === "Battle" &&
    canVisitSite(projected, value.siteId as BeforeBattleJourneyPurgeChoice["siteId"]);
}

/** Live LOAD and resolution additionally bind the exact registered descriptor. */
export function validBeforeBattlePurgeChoice(value: unknown, journey: JourneyState, registry: JourneyModifierRegistry): value is BeforeBattleJourneyPurgeChoice {
  if (!validBeforeBattlePurgeData(value, journey)) return false;
  const effect = registry.lookup(value.dreamsignId)?.journeyPurge;
  return effect?.kind === "beforeBattlePurge" && effect.minimumDeckSize === value.minimumDeckSize;
}

/** The only existing acquisition owners that can wrap this earned continuation. */
function savedChoice(journey: Record<string, unknown>): unknown {
  let screen = journey.screen;
  if (record(screen) && screen.type === "journeyStarterPurge" && record(screen.choice)) screen = screen.choice.continuation;
  if (record(screen) && screen.type === "journeyDreamsign" && record(screen.choice) && screen.choice.kind === "copy") screen = screen.choice.continuation;
  return record(screen) && screen.type === "journeyPurge" && record(screen.choice) && screen.choice.kind === "beforeBattle" ? screen.choice : null;
}

/** Actual checkpoint boundary: intrinsic data and battle-null ownership, including wrappers. */
export function assertBeforeBattlePurgeCheckpoint(state: unknown): void {
  if (!record(state) || !record(state.journey)) return;
  const choice = savedChoice(state.journey);
  if (choice !== null && (!validBeforeBattlePurgeData(choice, state.journey) || state.battle !== null)) throw new Error("Invalid saved before-battle purge permission");
}

/** One union of legal removals, attributed to the first physical source at the lowest floor. */
export function prepareBeforeBattlePurge(state: FoldState, payload: Record<string, unknown>, ctx: EventContext, registry: JourneyModifierRegistry): FoldState | null {
  const intent = validJourneyBattleStart(state, payload);
  if (intent === null) return null;
  let source: { dreamsignId: BeforeBattleJourneyPurgeChoice["dreamsignId"]; heldIndex: number; minimumDeckSize: number } | null = null;
  for (const [heldIndex, sign] of state.journey.dreamsigns.entries()) {
    const effect = registry.lookup(sign.id)?.journeyPurge;
    if (effect?.kind === "beforeBattlePurge" && state.journey.deck.length > effect.minimumDeckSize && (source === null || effect.minimumDeckSize < source.minimumDeckSize)) {
      source = { dreamsignId: sign.id, heldIndex, minimumDeckSize: effect.minimumDeckSize };
    }
  }
  if (source === null) return null;
  const choice: BeforeBattleJourneyPurgeChoice = { kind: "beforeBattle", ...source, siteId: intent.siteId, earnedSeq: ctx.seq,
    seed: state.journey.seed, seedOverride: intent.seedOverride, timestamp: ctx.timestamp, nodeId: state.journey.currentDreamscape,
    completionLevel: state.journey.completionLevel, continuation: { type: "site", siteId: intent.siteId } };
  return { ...state, journey: { ...state.journey, screen: { type: "journeyPurge", choice } } };
}

/** Resolve concrete removals only; the host still owes prohibition, observers and final start. */
export function resolveBeforeBattlePurge(journey: JourneyState, payload: Record<string, unknown>, registry: JourneyModifierRegistry): JourneyPurgeTransition | null {
  if (journey.screen.type !== "journeyPurge" || !validBeforeBattlePurgeChoice(journey.screen.choice, journey, registry)) return null;
  const choice = journey.screen.choice;
  if (payload.siteId !== choice.siteId || payload.dreamsignId !== choice.dreamsignId || payload.heldIndex !== choice.heldIndex || payload.choiceIndex !== 0 || payload.earnedSeq !== choice.earnedSeq || !Array.isArray(payload.entryIds)) return null;
  const ids = payload.entryIds.map(deckEntryIdFromUnknown);
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length || ids.length > 0 && journey.deck.length - ids.length < choice.minimumDeckSize) return null;
  const selected = new Set(ids), removed = journey.deck.filter((entry) => selected.has(entry.entryId));
  if (removed.length !== ids.length) return null;
  return { journey: { ...journey, deck: journey.deck.filter((entry) => !selected.has(entry.entryId)), screen: choice.continuation }, purges: removed.map(({ entryId }) => ({ entryId })) };
}

/** Final ordinary construction uses the drained journey and original provider context. */
export function finishBeforeBattlePurge(state: FoldState, choice: BeforeBattleJourneyPurgeChoice, ctx: EventContext) {
  if (choice.earnedSeq >= ctx.seq || !validBeforeBattlePurgeData(choice, state.journey) || state.journey.screen.type !== "site" || state.journey.screen.siteId !== choice.siteId) return null;
  return beginBattleWithCommits(state, { siteId: choice.siteId, seedOverride: choice.seedOverride },
    { ...ctx, seq: choice.earnedSeq, timestamp: choice.timestamp, rng: eventRng(choice.seed, choice.earnedSeq) }, ctx.seq);
}
