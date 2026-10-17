import { isTypeRemap } from "../../engine/dsl/type-remap";
import type { CardSubtype } from "../../types/card-identity";
import { dreamsignIdFromUnknown, parseBattleId, siteIdFromUnknown } from "../../types/identifiers";
import type { FoldState } from "../fold-state";
import { journeyBattleOf, type BattleFoldState } from "../battle/fold";
import type { JourneyDreamsignGain, JourneyDreamsignTypeRemapChoice, JourneyState, JourneySuspendedBattle, Screen } from "../../types/journey";
import type { JourneyModifierRegistry } from "./modifier-registry";
import { validJourneyDreamsignScreen } from "./journey-on-gain";
import { validStarterPurgeScreen } from "./journey-starter-acquisition";
import { validJourneyDuplicationScreen } from "./journey-duplication";
import { validJourneyTransfigurationScreen } from "./journey-transfiguration";
import { validJourneyPurgeScreen } from "./journey-purge";
import { findSite } from "./sites";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const index = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
let types: readonly CardSubtype[] = [];

/** The same catalog vocabulary the engine's existing character-type picker uses. */
export function registerJourneyTypeRemapProvider(value: readonly CardSubtype[] | null): void {
  if (value !== null && (value.some(type => !isTypeRemap(type)) || new Set(value).size !== value.length)) throw new Error("Invalid journey type-remap vocabulary");
  types = Object.freeze([...(value ?? [])]);
}
export function journeyTypeRemapTypes(): readonly CardSubtype[] { return types; }

/** Earned sources wrap the completed acquisition route, after ordinary observers. */
export function finishTypeRemapAcquisition(journey: JourneyState, sources: readonly JourneyDreamsignGain[], seq: number, suspendedBattle: JourneySuspendedBattle | null): JourneyState {
  if (sources.length === 0) return journey;
  if (types.length === 0) throw new Error("Journey type-remap vocabulary is unavailable");
  let continuation: JourneyDreamsignTypeRemapChoice["continuation"];
  if (journey.screen.type === "journeyDreamsign") {
    if (journey.screen.choice.kind === "typeRemap" || journey.screen.choice.kind === "subtype") throw new Error("Nested journey type-remap choice");
    continuation = { type: "journeyDreamsign", choice: journey.screen.choice };
  } else continuation = journey.screen;
  return { ...journey, screen: { type: "journeyDreamsign", choice: { kind: "typeRemap", sources: sources.map(source => ({ ...source })), index: 0, permissionSeq: seq, continuation, suspendedBattle } } };
}

/** Only the C12 wrapper is projected here; existing continuations keep their validators. */
export function typeRemapContinuation(journey: JourneyState): JourneyState {
  return journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "typeRemap"
    ? { ...journey, screen: journey.screen.choice.continuation } : journey;
}

export function validTypeRemapScreen(screen: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (!record(screen) || screen.type !== "journeyDreamsign" || !record(screen.choice)) return false;
  const choice = screen.choice;
  if (choice.kind !== "typeRemap" || !Array.isArray(choice.sources) || choice.sources.length === 0 || !index(choice.index) || choice.index >= choice.sources.length || !index(choice.permissionSeq) || !record(choice.continuation)) return false;
  let previous = -1;
  for (const source of choice.sources) {
    if (!record(source) || !index(source.heldIndex) || source.heldIndex <= previous) return false;
    previous = source.heldIndex;
    const id = dreamsignIdFromUnknown(source.dreamsignId);
    if (id === null || registry.lookup(id)?.journeyOnGain?.kind !== "typeRemapOnGain") return false;
  }
  const continuation = choice.continuation;
  // The earned layout is finite: optional starter, mandatory copy, then the earned route.
  let tail = continuation;
  if (tail.type === "journeyStarterPurge") {
    if (!record(tail.choice) || !record(tail.choice.continuation)) return false;
    tail = tail.choice.continuation;
  }
  if (tail.type === "journeyDreamsign" && record(tail.choice) && (tail.choice.kind === "copy" || tail.choice.kind === "openingHand")) {
    if (!record(tail.choice.continuation)) return false;
    tail = tail.choice.continuation;
  }
  if (tail.type === "journeyStarterPurge" || tail.type === "journeyDreamsign" && (!record(tail.choice) || tail.choice.kind !== "afterBattle")) return false;
  if (tail.type === "site" && (journey.currentDreamscape === null || !journey.atlas.nodes[journey.currentDreamscape]?.sites.some(site => site.id === tail.siteId))) return false;
  const projected = { ...journey, screen: continuation as unknown as Screen };
  if (continuation.type === "journeyDreamsign") {
    if (!record(continuation.choice) || !["copy", "openingHand", "afterBattle"].includes(String(continuation.choice.kind)) || !validJourneyDreamsignScreen(continuation, projected, registry)) return false;
  } else if (continuation.type === "journeyStarterPurge") {
    if (!validStarterPurgeScreen(continuation, projected, registry)) return false;
  } else if (continuation.type === "journeyPurge") {
    if (!validJourneyPurgeScreen(continuation, projected, registry)) return false;
  } else if (continuation.type === "journeyTransfiguration") {
    if (!validJourneyTransfigurationScreen(continuation, projected, registry)) return false;
  } else if (continuation.type === "journeyDuplication") {
    if (!validJourneyDuplicationScreen(continuation, projected, registry)) return false;
  } else if (continuation.type === "site") {
    if (siteIdFromUnknown(continuation.siteId) === null || findSite(journey, siteIdFromUnknown(continuation.siteId)!) === undefined || journey.currentDreamscape === null || !journey.atlas.nodes[journey.currentDreamscape]?.sites.some(site => site.id === continuation.siteId)) return false;
  } else if (!["journeyStart", "atlas", "dreamscape", "journeyComplete", "journeyFailed"].includes(String(continuation.type))) return false;
  const binding = choice.suspendedBattle;
  for (const nested of [continuation, continuation.type === "journeyStarterPurge" && record(continuation.choice) ? continuation.choice.continuation : null]) {
    if (record(nested) && record(nested.choice) && "suspendedBattle" in nested.choice) {
      const own = nested.choice.suspendedBattle;
      if (binding === null ? own !== null : !record(binding) || !record(own) || own.battleId !== binding.battleId || own.mode !== binding.mode) return false;
    }
  }
  if (binding === null) return true;
  if (!record(binding) || typeof binding.battleId !== "string" || (binding.mode !== "journey" && binding.mode !== "tutorial")) return false;
  try { parseBattleId(binding.battleId); } catch { return false; }
  return true;
}

export function validTypeRemapBattleBinding(journey: JourneyState, battle: BattleFoldState | null): boolean {
  if (journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "typeRemap") return false;
  const binding = journey.screen.choice.suspendedBattle;
  if (binding === null) return battle === null;
  if (battle === null || battle.init.battleId !== binding.battleId || battle.mode.kind !== binding.mode) return false;
  let screen: Screen = journey.screen.choice.continuation;
  if (screen.type === "journeyStarterPurge") screen = screen.choice.continuation;
  if (screen.type === "journeyDreamsign" && (screen.choice.kind === "copy" || screen.choice.kind === "openingHand")) screen = screen.choice.continuation;
  const init = journeyBattleOf(battle)?.init;
  return binding.mode === "tutorial" || init !== undefined && screen.type === "site" && screen.siteId === init.siteId && journey.currentDreamscape === init.nodeId && journey.completionLevel === init.completionLevelAtStart;
}

export function validTypeRemapIntent(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null, registry: JourneyModifierRegistry): boolean {
  if (journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "typeRemap" || !validTypeRemapScreen(journey.screen, journey, registry) || !validTypeRemapBattleBinding(journey, battle)) return false;
  const choice = journey.screen.choice, source = choice.sources[choice.index];
  return payload.sourceDreamsignId === source.dreamsignId && payload.heldIndex === source.heldIndex && payload.choiceIndex === choice.index && payload.permissionSeq === choice.permissionSeq && types.some(type => type === payload.chosenSubtype);
}
export function resolveTypeRemap(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null, registry: JourneyModifierRegistry): JourneyState | null {
  if (!validTypeRemapIntent(journey, payload, battle, registry) || journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "typeRemap") return null;
  const choice = journey.screen.choice;
  return { ...journey, typeRemap: payload.chosenSubtype as CardSubtype, screen: choice.index + 1 === choice.sources.length ? choice.continuation : { type: "journeyDreamsign", choice: { ...choice, index: choice.index + 1 } } };
}

/** The optional scalar and pending purpose are validated at both saved-state ingress points. */
export function validJourneyTypeRemap(journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  return (journey.typeRemap === undefined || types.includes(journey.typeRemap)) &&
    (!(journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "typeRemap") || validTypeRemapScreen(journey.screen, journey, registry));
}
export function assertJourneyTypeRemapCheckpoint(value: unknown, registry: JourneyModifierRegistry): void {
  if (!record(value) || !record(value.journey)) return;
  const raw = value.journey;
  const pending = record(raw.screen) && raw.screen.type === "journeyDreamsign" && record(raw.screen.choice) && raw.screen.choice.kind === "typeRemap";
  if (raw.typeRemap === undefined && !pending) return;
  const state = value as unknown as FoldState;
  if (!record(raw.screen) || !validJourneyTypeRemap(state.journey, registry) || pending && (!validTypeRemapBattleBinding(state.journey, state.battle) ||
    state.journey.screen.type === "journeyDreamsign" && state.journey.screen.choice.kind === "typeRemap" && state.journey.screen.choice.suspendedBattle?.mode === "tutorial" && (state.frontDoor?.phase !== "tutorial" || state.battle?.mode.kind !== "tutorial" || state.frontDoor.tutorial?.runId !== state.battle.mode.tutorialRunId))) throw new Error("Journey type-remap checkpoint requires valid choice and battle provenance");
}
