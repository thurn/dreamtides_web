import { finishTypeRemapAcquisition, validTypeRemapScreen, validTypeRemapBattleBinding } from "./journey-type-remap";
import { prepareStarterAcquisition, finishStarterAcquisition } from "./journey-starter-acquisition";
import { validJourneyDuplicationScreen } from "./journey-duplication";
import type { ReducerLogRecord } from "../../eventlog/types";
import { parseBattleId, dreamsignIdFromUnknown, siteIdFromUnknown, type DreamsignId, type SiteId } from "../../types/identifiers";
import type { AfterBattleJourneyChoice, JourneyDreamsignCopyChoice, JourneyDreamsignGain, JourneyOnGainEffect, JourneyState, JourneySuspendedBattle, JourneyTransfigurationOccurrence, Screen } from "../../types/journey";
import type { BattleFoldState } from "../battle/fold";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";
import { afterBattleChoice, appendAfterBattleSource, advanceAfterBattle, validAfterBattleChoice } from "./journey-after-battle";
import { journeyTransfigurationCard, journeyTransfigurationOccurrences, validJourneyTransfigurationScreen } from "./journey-transfiguration";
import { prepareAfterBattleDreamsignOffer, findSite } from "./sites";
import { validJourneyPurgeScreen } from "./journey-purge";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { getDeckContentProvider, mintEntryId } from "./deck";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const index = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const battleId = (value: unknown) => { if (typeof value !== "string") return null; try { return parseBattleId(value); } catch { return null; } };
const effectLog = (source: JourneyDreamsignGain, fields: Record<string, unknown>): ReducerLogRecord => ({ event: "journey_modifier_applied", fields: { dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, hook: "on_dreamsign_gain", ...fields } });


/** The concrete acquisition stage precedes the existing card-observer waves. */
export function prepareJourneyOnGain(input: { before: JourneyState; journey: JourneyState; gains: readonly JourneyDreamsignGain[]; lookup: JourneyModifierRegistry["lookup"]; seq: number; random: () => { value: number; drawIndex: number }; siteId: SiteId | null;
  excludeAcquisitionAdditions: (previous: JourneyState, tentative: JourneyState) => { journey: JourneyState; logRecords: readonly ReducerLogRecord[] } }) {
  let journey = input.journey;
  const starterSources: import("../../types/journey").JourneyStarterPurgeSource[] = [];
  const transfigurations: JourneyTransfigurationOccurrence[] = [], copySources: JourneyDreamsignGain[] = [], typeRemapSources: JourneyDreamsignGain[] = [], logRecords: ReducerLogRecord[] = [];
  const attemptedEntries: import("../../types/journey").DeckEntry[] = [];
  for (const source of input.gains) {
    if (journey.dreamsigns[source.heldIndex]?.id !== source.dreamsignId) throw new Error("Acquired Dreamsign physical slot changed.");
    const effect = input.lookup(source.dreamsignId)?.journeyOnGain;
    if (effect?.kind === "typeRemapOnGain") {
      typeRemapSources.push(source);
      logRecords.push(effectLog(source, { permissionSeq: input.seq, choicePrepared: true }));
    }
    if (effect?.kind === "addNightmaresOnGain") {
      const cardNumber = getDeckContentProvider()?.resolveCardNumber(NIGHTMARE_CARD_ID);
      if (cardNumber === undefined || cardNumber === null) throw new Error("Acquired Nightmare content is unavailable.");
      const previous = journey, added: import("../../types/journey").DeckEntry[] = [];
      for (let n = 0; n < effect.count; n++) {
        const entry = { entryId: mintEntryId([...journey.deck, ...attemptedEntries], input.seq, n), cardNumber, transfiguration: null, isBane: true };
        added.push(entry);
        attemptedEntries.push(entry);
      }
      const excluded = input.excludeAcquisitionAdditions(previous, { ...journey, deck: [...journey.deck, ...added] });
      journey = excluded.journey;
      const present = new Set(journey.deck.map((entry) => entry.entryId));
      const gainedEntryIds = added.filter((entry) => present.has(entry.entryId)).map((entry) => entry.entryId);
      logRecords.push(effectLog(source, { siteId: input.siteId, permissionSeq: input.seq, cardId: NIGHTMARE_CARD_ID,
        attemptedEntryIds: added.map((entry) => entry.entryId), gainedEntryIds,
        before: { deckSize: previous.deck.length }, after: { deckSize: journey.deck.length, attempted: added.length,
          gained: gainedEntryIds.length, prevented: added.length - gainedEntryIds.length } }), ...excluded.logRecords);
    }
    if (effect?.kind === "purgeStarterOnGain" || effect?.kind === "perfectStarterOnGain") {
      const previous = journey, prepared = prepareStarterAcquisition(journey, source, effect, input.seq, input.siteId);
      journey = prepared.journey;
      if (prepared.permission !== null) starterSources.push(prepared.permission);
      transfigurations.push(...journeyTransfigurationOccurrences(previous, journey));
      logRecords.push(prepared.log);
    }
    if (effect?.kind === "copyOwnedDreamsignOnGain") {
      if (journey.dreamsigns.length > 1) copySources.push(source);
      logRecords.push(effectLog(source, { permissionSeq: input.seq, targetCount: journey.dreamsigns.length - 1, choicePrepared: journey.dreamsigns.length > 1 }));
    }
    if (effect?.kind !== "randomTransfigurationOnGain") continue;
    const eligible = journey.deck.filter((entry) => entry.transfiguration === null).map((entry) => {
      const card = journeyTransfigurationCard(entry);
      if (card === null) throw new Error("Journey acquisition transfiguration content is unavailable.");
      return { entry, card };
    }).filter(({ card }) => card.forms.length > 0);
    const requested = Math.floor(journey.deck.length * effect.numerator / effect.denominator), count = Math.min(requested, eligible.length);
    const pool = [...eligible], selections = [];
    for (let n = 0; n < count; n++) {
      const targetDraw = input.random(), selected = pool.splice(Math.floor(targetDraw.value * pool.length), 1)[0];
      const formDraw = input.random(), type = selected.card.forms[Math.floor(formDraw.value * selected.card.forms.length)];
      selections.push({ entryId: selected.entry.entryId, cardId: selected.card.cardId, type, applicableForms: selected.card.forms, targetDrawIndex: targetDraw.drawIndex, formDrawIndex: formDraw.drawIndex });
    }
    const byId = new Map(selections.map((selection) => [selection.entryId, selection.type]));
    const previous = journey;
    journey = { ...journey, deck: journey.deck.map((entry) => byId.has(entry.entryId) ? { ...entry, transfiguration: byId.get(entry.entryId)! } : entry) };
    transfigurations.push(...journeyTransfigurationOccurrences(previous, journey));
    logRecords.push(effectLog(source, { siteId: input.siteId, permissionSeq: input.seq, before: { deckSize: previous.deck.length, eligible: eligible.length }, after: { requested, transformed: count }, eligibleEntryIds: eligible.map(({ entry }) => entry.entryId), transformations: selections }));
  }
  return { journey, transfigurations, copySources, starterSources, typeRemapSources, logRecords };
}

/** Delay the copy screen until every ordinary observer has earned its continuation. */
export function finishJourneyOnGain(journey: JourneyState, sources: readonly JourneyDreamsignGain[], seq: number, suspendedBattle: JourneySuspendedBattle | null): JourneyState {
  if (sources.length === 0) return journey;
  let continuation: JourneyDreamsignCopyChoice["continuation"];
  if (journey.screen.type === "journeyDreamsign") {
    if (journey.screen.choice.kind === "copy" || journey.screen.choice.kind === "typeRemap") throw new Error("Nested Dreamsign copy permission.");
    continuation = { type: "journeyDreamsign", choice: journey.screen.choice };
  } else continuation = journey.screen;
  const choice: JourneyDreamsignCopyChoice = { kind: "copy", sources, index: 0, permissionSeq: seq, heldIds: journey.dreamsigns.map((sign) => sign.id), continuation, suspendedBattle };
  return { ...journey, screen: { type: "journeyDreamsign", choice } };
}

export function finishJourneyAcquisition(journey: JourneyState, copySources: readonly JourneyDreamsignGain[], starterSources: readonly import("../../types/journey").JourneyStarterPurgeSource[], typeRemapSources: readonly JourneyDreamsignGain[], seq: number, binding: JourneySuspendedBattle | null): JourneyState {
  return finishTypeRemapAcquisition(finishStarterAcquisition(finishJourneyOnGain(journey, copySources, seq, binding), starterSources, seq, binding), typeRemapSources, seq, binding);
}

export function journeyOnGain(dreamsignId: DreamsignId, descriptor: JourneyOnGainEffect): JourneyModifierDefinition {
  if (descriptor.kind === "addNightmaresOnGain" ? !index(descriptor.count) || descriptor.count < 1 : descriptor.kind === "afterBattleDreamsignChoice" ? !index(descriptor.offerCount) || descriptor.offerCount < 1 : descriptor.kind === "randomTransfigurationOnGain" ? !index(descriptor.numerator) || !index(descriptor.denominator) || descriptor.denominator < 1 || descriptor.numerator > descriptor.denominator : descriptor.kind === "purgeStarterOnGain" ? !index(descriptor.maxCount) || descriptor.maxCount < 1 : descriptor.kind === "perfectStarterOnGain" ? descriptor.transfiguration !== "Perfected" : descriptor.kind !== "copyOwnedDreamsignOnGain" && descriptor.kind !== "typeRemapOnGain") throw new RangeError("Invalid journeyOnGain descriptor.");
  const effect = Object.freeze({ ...descriptor });
  return { dreamsignId, journeyOnGain: effect, afterJourneyEvent({ before, journey, eventType, heldIndex, siteId, seq, random }) {
    if (effect.kind !== "afterBattleDreamsignChoice" || eventType !== "END_BATTLE" || siteId === null || before.screen.type !== "site" || before.screen.siteId !== siteId || findSite(before, siteId)?.type !== "Battle") return null;
    const drawIndices: number[] = [];
    const offer = prepareAfterBattleDreamsignOffer(journey, effect.offerCount, () => { const draw = random(); drawIndices.push(draw.drawIndex); return draw.value; });
    if (offer === null) throw new Error("Earned Dreamsign offer content is unavailable.");
    const next = appendAfterBattleSource({ ...journey, remainingDreamsignPool: [...offer.remainingDreamsignPool] }, siteId, { kind: "dreamsign", dreamsignId, heldIndex, earnedSeq: seq, offerCount: effect.offerCount, offeredDreamsigns: offer.offeredDreamsigns, remainingPoolIds: offer.remainingDreamsignPool });
    if (next === null) throw new Error("Earned Dreamsign continuation is unavailable.");
    return { journey: next, before: { permissions: afterBattleChoice(journey.screen)?.sources.length ?? 0 }, after: { permissions: afterBattleChoice(next.screen)!.sources.length, offered: offer.offeredDreamsigns.length }, target: { siteIds: [siteId], offeredDreamsignIds: offer.offeredDreamsigns.map((sign) => sign.id), drawIndices } };
  } };
}

export function validJourneyDreamsignScreen(screen: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (!record(screen) || screen.type !== "journeyDreamsign" || !record(screen.choice)) return false;
  const choice = screen.choice;
  if (choice.kind === "typeRemap") return validTypeRemapScreen(screen, journey, registry);
  if (choice.kind === "afterBattle") return validAfterBattleChoice(choice, journey, registry) && (choice.sources as AfterBattleJourneyChoice["sources"])[choice.index as number].kind === "dreamsign";
  if (choice.kind !== "copy" || journey.dreamsigns.length < 2 || !Array.isArray(choice.sources) || choice.sources.length === 0 || !index(choice.index) || choice.index >= choice.sources.length || !index(choice.permissionSeq) || !Array.isArray(choice.heldIds) || choice.heldIds.length !== journey.dreamsigns.length || choice.heldIds.some((id, i) => id !== journey.dreamsigns[i].id) || !record(choice.continuation)) return false;
  const seen = new Set<number>();
  let previousSlot = -1;
  for (const [n, source] of choice.sources.entries()) {
    if (!record(source) || !index(source.heldIndex) || source.heldIndex >= journey.dreamsigns.length || source.heldIndex <= previousSlot || seen.has(source.heldIndex)) return false;
    seen.add(source.heldIndex); previousSlot = source.heldIndex; const id = dreamsignIdFromUnknown(source.dreamsignId);
    if (id === null || registry.lookup(id)?.journeyOnGain?.kind !== "copyOwnedDreamsignOnGain" || (n >= choice.index && journey.dreamsigns[source.heldIndex]?.id !== id)) return false;
  }
  const continuation = choice.continuation;
  if (continuation.type === "journeyDreamsign") {
    if (!record(continuation.choice) || continuation.choice.kind !== "afterBattle" || !validAfterBattleChoice(continuation.choice, journey, registry)) return false;
    const current = (continuation.choice as unknown as AfterBattleJourneyChoice).sources[(continuation.choice as unknown as AfterBattleJourneyChoice).index];
    if (current.kind !== "dreamsign") return false;
  } else if (continuation.type === "journeyPurge") {
    if (!validJourneyPurgeScreen(continuation, journey, registry)) return false;
  } else if (continuation.type === "journeyDuplication") {
    if (!validJourneyDuplicationScreen(continuation, journey, registry)) return false;
  } else if (continuation.type === "journeyTransfiguration") {
    if (!validJourneyTransfigurationScreen(continuation, journey, registry)) return false;
  } else if (continuation.type === "site" ? siteIdFromUnknown(continuation.siteId) === null : !["journeyStart", "atlas", "dreamscape", "journeyComplete", "journeyFailed", "journeyPurge", "journeyTransfiguration"].includes(String(continuation.type))) return false;
  if (continuation.type === "site" && (findSite(journey, siteIdFromUnknown(continuation.siteId)!) === undefined || journey.currentDreamscape === null || !journey.atlas.nodes[journey.currentDreamscape]?.sites.some((site) => site.id === continuation.siteId))) return false;
  return choice.suspendedBattle === null || record(choice.suspendedBattle) && battleId(choice.suspendedBattle.battleId) !== null && (choice.suspendedBattle.mode === "journey" || choice.suspendedBattle.mode === "tutorial");
}

export function validDreamsignBattleBinding(journey: JourneyState, battle: BattleFoldState | null): boolean {
  if (journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "typeRemap") return validTypeRemapBattleBinding(journey, battle);
  if (journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "copy") return battle === null;
  const choice = journey.screen.choice, binding = choice.suspendedBattle;
  if (binding === null) return battle === null;
  if (battle === null || battle.init.battleId !== binding.battleId || battle.mode.kind !== binding.mode) return false;
  return binding.mode !== "journey" || choice.continuation.type === "site" && choice.continuation.siteId === battle.init.siteId && journey.currentDreamscape === battle.init.nodeId && journey.completionLevel === battle.init.completionLevelAtStart;
}

export function validDreamsignCopyIntent(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null, registry: JourneyModifierRegistry): boolean {
  if (journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "copy" || !validJourneyDreamsignScreen(journey.screen, journey, registry) || !validDreamsignBattleBinding(journey, battle)) return false;
  const choice = journey.screen.choice, source = choice.sources[choice.index];
  const expected = dreamsignIdFromUnknown(payload.expectedTargetDreamsignId);
  const target = index(payload.targetHeldIndex) ? journey.dreamsigns[payload.targetHeldIndex] : undefined;
  return expected !== null && target !== undefined && payload.sourceDreamsignId === source.dreamsignId && payload.heldIndex === source.heldIndex && payload.choiceIndex === choice.index && payload.permissionSeq === choice.permissionSeq && index(payload.targetHeldIndex) && payload.targetHeldIndex !== source.heldIndex && target.id === expected;
}

export function resolveDreamsignCopy(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null, registry: JourneyModifierRegistry): JourneyState | null {
  if (!validDreamsignCopyIntent(journey, payload, battle, registry) || journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "copy") return null;
  const choice = journey.screen.choice, source = choice.sources[choice.index], target = journey.dreamsigns[payload.targetHeldIndex as number];
  const dreamsigns = journey.dreamsigns.map((sign, i) => i === source.heldIndex ? { ...target } : sign);
  const screen: Screen = choice.index + 1 === choice.sources.length ? choice.continuation : { type: "journeyDreamsign", choice: { ...choice, index: choice.index + 1, heldIds: dreamsigns.map((sign) => sign.id) } };
  return { ...journey, dreamsigns, screen };
}

export function resolveAfterBattleDreamsign(journey: JourneyState, payload: Record<string, unknown>, registry: JourneyModifierRegistry): JourneyState | null {
  if (journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "afterBattle" || !validJourneyDreamsignScreen(journey.screen, journey, registry)) return null;
  const choice = journey.screen.choice, source = choice.sources[choice.index];
  if (source.kind !== "dreamsign" || payload.siteId !== choice.siteId || payload.dreamsignId !== source.dreamsignId || payload.heldIndex !== source.heldIndex || payload.choiceIndex !== choice.index || payload.earnedSeq !== source.earnedSeq) return null;
  if (payload.offeredDreamsignId === null) return source.offeredDreamsigns.length === 0 || journey.dreamsigns.length >= journey.maxDreamsigns ? advanceAfterBattle(journey, choice) : null;
  const incoming = source.offeredDreamsigns.find((sign) => sign.id === payload.offeredDreamsignId);
  if (incoming === undefined || payload.purgeIndex !== undefined && (!index(payload.purgeIndex) || journey.dreamsigns[payload.purgeIndex] === undefined) || payload.purgeIndex === undefined && journey.dreamsigns.length >= journey.maxDreamsigns) return null;
  const dreamsigns = payload.purgeIndex === undefined ? [...journey.dreamsigns, incoming] : journey.dreamsigns.map((sign, i) => i === payload.purgeIndex ? incoming : sign);
  return advanceAfterBattle({ ...journey, dreamsigns }, choice);
}
