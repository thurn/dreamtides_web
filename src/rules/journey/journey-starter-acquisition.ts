import type { ReducerLogRecord } from "../../eventlog/types";
import { cardIdFromUnknown } from "../../types/card-identity";
import { deckEntryIdFromUnknown, dreamsignIdFromUnknown, parseBattleId, siteIdFromUnknown, type SiteId } from "../../types/identifiers";
import type { JourneyDreamsignGain, JourneyOnGainEffect, JourneyPurgeTransition, JourneyStarterPurgeSource, JourneyState, JourneySuspendedBattle, Screen } from "../../types/journey";
import type { BattleFoldState } from "../battle/fold";
import type { JourneyModifierRegistry } from "./modifier-registry";
import { journeyTransfigurationCard } from "./journey-transfiguration";
import { validJourneyDreamsignScreen } from "./journey-on-gain";
import { validJourneyPurgeScreen } from "./journey-purge";
import { validJourneyTransfigurationScreen } from "./journey-transfiguration";
import { validJourneyDuplicationScreen } from "./journey-duplication";
import { findSite } from "./sites";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const index = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Canonical starter metadata is resolved before any acquisition change commits. */
export function prepareStarterAcquisition(journey: JourneyState, source: JourneyDreamsignGain,
  effect: Extract<JourneyOnGainEffect, { kind: "purgeStarterOnGain" | "perfectStarterOnGain" }>, seq: number, siteId: SiteId | null) {
  const starters = journey.deck.flatMap((entry) => {
    const card = journeyTransfigurationCard(entry);
    if (card === null) throw new Error("Starter acquisition content is unavailable.");
    return card.starter === true ? [{ entry, card }] : [];
  });
  const entries = starters.map(({ entry, card }) => ({ entryId: entry.entryId, cardId: card.cardId }));
  const selected = effect.kind === "perfectStarterOnGain" ? starters.filter(({ entry, card }) => entry.transfiguration === null && card.perfectedEligible === true) : [];
  const ids = new Set(selected.map(({ entry }) => entry.entryId));
  const next = selected.length === 0 ? journey : { ...journey, deck: journey.deck.map((entry) => ids.has(entry.entryId) ? { ...entry, transfiguration: effect.kind === "perfectStarterOnGain" ? effect.transfiguration : entry.transfiguration } : entry) };
  const permission: JourneyStarterPurgeSource | null = effect.kind === "purgeStarterOnGain" ? { ...source, maxCount: effect.maxCount, entries } : null;
  const log: ReducerLogRecord = { event: "journey_modifier_applied", fields: { ...source, hook: "on_dreamsign_gain", siteId, permissionSeq: seq,
    starterEntries: entries, transformations: selected.map(({ entry, card }) => ({ entryId: entry.entryId, cardId: card.cardId, type: "Perfected" })),
    ...(permission === null ? {} : { maxCount: permission.maxCount }),
    before: { deckSize: journey.deck.length, starters: starters.length }, after: { transformed: selected.length, permission: permission === null ? 0 : 1 } } };
  return { journey: next, permission, log };
}

/** Acquisition permissions wrap the already earned route and any mandatory copy choice. */
export function finishStarterAcquisition(journey: JourneyState, sources: readonly JourneyStarterPurgeSource[], seq: number, suspendedBattle: JourneySuspendedBattle | null): JourneyState {
  if (sources.length === 0) return journey;
  if (journey.screen.type === "journeyStarterPurge") throw new Error("Nested starter acquisition permission.");
  return { ...journey, screen: { type: "journeyStarterPurge", choice: { kind: "starterPurge", sources, index: 0, permissionSeq: seq, continuation: journey.screen, suspendedBattle } } };
}

export function validStarterPurgeScreen(screen: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (!record(screen) || screen.type !== "journeyStarterPurge" || !record(screen.choice)) return false;
  const choice = screen.choice;
  if (choice.kind !== "starterPurge" || !Array.isArray(choice.sources) || choice.sources.length === 0 || !index(choice.index) || choice.index >= choice.sources.length || !index(choice.permissionSeq) || !record(choice.continuation)) return false;
  let previous = -1;
  for (const source of choice.sources) {
    if (!record(source) || !index(source.heldIndex) || source.heldIndex <= previous || !Array.isArray(source.entries)) return false;
    previous = source.heldIndex;
    const id = dreamsignIdFromUnknown(source.dreamsignId), effect = id === null ? undefined : registry.lookup(id)?.journeyOnGain;
    if (effect?.kind !== "purgeStarterOnGain" || effect.maxCount !== source.maxCount) return false;
    const seen = new Set();
    for (const entry of source.entries) {
      if (!record(entry) || deckEntryIdFromUnknown(entry.entryId) === null || cardIdFromUnknown(entry.cardId) === null || seen.has(entry.entryId)) return false;
      seen.add(entry.entryId);
    }
  }
  const continuation = choice.continuation, projected = { ...journey, screen: continuation as unknown as Screen };
  if (continuation.type === "journeyDreamsign") { if (!validJourneyDreamsignScreen(continuation, projected, registry)) return false; }
  else if (continuation.type === "journeyPurge") { if (!validJourneyPurgeScreen(continuation, projected, registry)) return false; }
  else if (continuation.type === "journeyTransfiguration") { if (!validJourneyTransfigurationScreen(continuation, projected, registry)) return false; }
  else if (continuation.type === "journeyDuplication") { if (!validJourneyDuplicationScreen(continuation, projected, registry)) return false; }
  else if (continuation.type === "site") { if (siteIdFromUnknown(continuation.siteId) === null || findSite(journey, siteIdFromUnknown(continuation.siteId)!) === undefined) return false; }
  else if (!["journeyStart", "atlas", "dreamscape", "journeyComplete", "journeyFailed"].includes(String(continuation.type))) return false;
  const binding = choice.suspendedBattle;
  if (binding === null) return true;
  if (!record(binding) || (binding.mode !== "journey" && binding.mode !== "tutorial") || typeof binding.battleId !== "string") return false;
  try { parseBattleId(binding.battleId); } catch { return false; }
  if (continuation.type === "journeyDreamsign" && record(continuation.choice) && continuation.choice.kind === "copy") return record(continuation.choice.suspendedBattle) && continuation.choice.suspendedBattle.battleId === binding.battleId && continuation.choice.suspendedBattle.mode === binding.mode;
  return binding.mode === "tutorial" || continuation.type === "site";
}
export function validStarterBattleBinding(journey: JourneyState, battle: BattleFoldState | null): boolean {
  if (journey.screen.type !== "journeyStarterPurge") return false;
  const { suspendedBattle: binding, continuation } = journey.screen.choice;
  if (binding === null) return battle === null;
  if (battle === null || battle.init.battleId !== binding.battleId || battle.mode.kind !== binding.mode) return false;
  const screen = continuation.type === "journeyDreamsign" && continuation.choice.kind === "copy" ? continuation.choice.continuation : continuation;
  return binding.mode === "tutorial" || screen.type === "site" && screen.siteId === battle.init.siteId && journey.currentDreamscape === battle.init.nodeId && journey.completionLevel === battle.init.completionLevelAtStart;
}
export function validStarterPurgeIntent(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null, registry: JourneyModifierRegistry): boolean {
  if (journey.screen.type !== "journeyStarterPurge" || !validStarterPurgeScreen(journey.screen, journey, registry) || !validStarterBattleBinding(journey, battle)) return false;
  const choice = journey.screen.choice, source = choice.sources[choice.index];
  if (payload.dreamsignId !== source.dreamsignId || payload.heldIndex !== source.heldIndex || payload.choiceIndex !== choice.index || payload.permissionSeq !== choice.permissionSeq || !Array.isArray(payload.entryIds) || payload.entryIds.length > source.maxCount) return false;
  const ids = payload.entryIds.map(deckEntryIdFromUnknown);
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return false;
  return ids.every((id) => {
    const entry = journey.deck.find((entry) => entry.entryId === id), earned = source.entries.find((entry) => entry.entryId === id);
    if (entry === undefined || earned === undefined) return false;
    const card = journeyTransfigurationCard(entry);
    return card?.starter === true && card.cardId === earned.cardId;
  });
}
export function resolveStarterPurge(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null, registry: JourneyModifierRegistry): JourneyPurgeTransition | null {
  if (!validStarterPurgeIntent(journey, payload, battle, registry) || journey.screen.type !== "journeyStarterPurge") return null;
  const ids = new Set(payload.entryIds as import("../../types/identifiers").DeckEntryId[]), choice = journey.screen.choice;
  const removed = choice.sources[choice.index].entries.filter((entry) => ids.has(entry.entryId));
  const screen: Screen = choice.index + 1 === choice.sources.length ? choice.continuation : { type: "journeyStarterPurge", choice: { ...choice, index: choice.index + 1 } };
  return { journey: { ...journey, deck: journey.deck.filter((entry) => !ids.has(entry.entryId)), screen }, purges: removed };
}
