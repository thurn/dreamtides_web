import { advanceJourneyAcquisition, journeyAcquisitionKind, journeyOpeningHandEntries, validJourneyAcquisitionScreen, validJourneyAcquisitionBattleBinding } from "./journey-battle-init";
import { prepareJourneySubtypeChoice, validJourneySubtypeScreen, validJourneySubtypeBattleBinding } from "./journey-subtype";
import { finishTypeRemapAcquisition, validTypeRemapScreen, validTypeRemapBattleBinding } from "./journey-type-remap";
import { prepareStarterAcquisition, finishStarterAcquisition } from "./journey-starter-acquisition";
import type { ReducerLogRecord } from "../../eventlog/types";
import { dreamsignIdFromUnknown, type DreamsignId, type SiteId } from "../../types/identifiers";
import type { AfterBattleJourneyChoice, JourneyDreamsignCopyChoice, JourneyDreamsignGain, JourneyOpeningHandAcquisition, JourneyOnGainEffect, JourneyState, JourneySuspendedBattle, JourneyTransfigurationOccurrence } from "../../types/journey";
import type { BattleFoldState } from "../battle/fold";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";
import { afterBattleChoice, appendAfterBattleSource, advanceAfterBattle, validAfterBattleChoice } from "./journey-after-battle";
import { journeyTransfigurationCard, journeyTransfigurationOccurrences } from "./journey-transfiguration";
import { prepareAfterBattleDreamsignOffer, findSite } from "./sites";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { getDeckContentProvider, mintEntryId } from "./deck";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const index = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const effectLog = (source: JourneyDreamsignGain, fields: Record<string, unknown>): ReducerLogRecord => ({ event: "journey_modifier_applied", fields: { dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, hook: "on_dreamsign_gain", ...fields } });


/** The concrete acquisition stage precedes the existing card-observer waves. */
export function prepareJourneyOnGain(input: { operationCausalSeq?: number; operationEventSeq?: number; operationOrdinalStart?: number; reservedEntries?: readonly import("../../types/journey").DeckEntry[]; resume?: import("../../types/journey").JourneySubtypeResume; beforeContext: import("../../types/journey").JourneyModifierBefore; eventType: import("../events").GameplayEventType; observerSources: readonly JourneyDreamsignGain[]; battleBinding: JourneySuspendedBattle | null; purges: readonly import("../../types/journey").JourneyPurgeOccurrence[]; domainTransfigurations: readonly JourneyTransfigurationOccurrence[]; journey: JourneyState; gains: readonly JourneyDreamsignGain[]; lookup: JourneyModifierRegistry["lookup"]; seq: number; random: () => { value: number; drawIndex: number }; siteId: SiteId | null;
  excludeAcquisitionAdditions: (previous: JourneyState, tentative: JourneyState) => { journey: JourneyState; logRecords: readonly ReducerLogRecord[] } }) {
  let journey = input.journey;
  const starterSources = [...(input.resume?.starterSources ?? [])];
  const openingHandAcquisitions: JourneyOpeningHandAcquisition[] = [...(input.resume?.openingHandAcquisitions ?? [])];
  const transfigurations = [...(input.resume?.transfigurations ?? input.domainTransfigurations)], copySources = [...(input.resume?.copySources ?? [])], typeRemapSources: JourneyDreamsignGain[] = [], logRecords: ReducerLogRecord[] = [];
  let operationOrdinal = input.operationOrdinalStart ?? 0;
  const collect = (previous: JourneyState, orderedEntryIds?: readonly import("../../types/identifiers").DeckEntryId[]) => {
    const occurrences = journeyTransfigurationOccurrences(previous, journey, { eventSeq: input.operationEventSeq ?? input.seq, ...(input.operationCausalSeq === undefined ? {} : { causalSeq: input.operationCausalSeq }), ordinalStart: operationOrdinal, ...(orderedEntryIds === undefined ? {} : { orderedEntryIds }) });
    operationOrdinal += occurrences.length;
    transfigurations.push(...occurrences);
  };
  const attemptedEntries = [...(input.reservedEntries ?? input.resume?.attemptedEntries ?? [])];
  const mixed = input.resume !== undefined || input.gains.some(source => input.lookup(source.dreamsignId)?.journeyOnGain?.kind === "deckSubtypeOnGain");
  for (let sourceIndex = input.resume?.sourceIndex ?? 0; sourceIndex < input.gains.length; sourceIndex++) {
    const source = input.gains[sourceIndex];
    if (input.resume === undefined && journey.dreamsigns[source.heldIndex]?.id !== source.dreamsignId) throw new Error("Acquired Dreamsign physical slot changed.");
    const effect = input.lookup(source.dreamsignId)?.journeyOnGain;
    if (mixed && (effect?.kind === "deckSubtypeOnGain" || effect?.kind === "typeRemapOnGain")) {
      const resume = { before: input.beforeContext, eventType: input.eventType, siteId: input.siteId, sources: input.gains, sourceIndex, observerSources: input.observerSources, copySources, openingHandAcquisitions, starterSources, transfigurations, attemptedEntries, purges: input.purges };
      journey = prepareJourneySubtypeChoice(journey, resume, input.seq, input.battleBinding, effect.kind === "deckSubtypeOnGain" ? "deckSubtype" : "typeRemap");
      logRecords.push(effectLog(source, { permissionSeq: input.seq, choicePrepared: true, sourceIndex, purpose: effect.kind, cohort: journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "subtype" ? journey.screen.choice.current : null }));
      return { journey, transfigurations, copySources, openingHandAcquisitions, starterSources, typeRemapSources, logRecords, paused: true };
    }
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
      collect(previous);
      logRecords.push(prepared.log);
    }
    if (effect?.kind === "chooseOpeningHandEventOnGain") {
      const eligible = journeyOpeningHandEntries(journey.deck, journeyTransfigurationCard);
      if (eligible === null) throw new Error("Opening-hand acquisition content is unavailable.");
      const eligibleEntries = eligible.map(({ entry, cardId }) => ({ entryId: entry.entryId, cardId }));
      const outcome = eligibleEntries.length === 0 ? "limited" : "prepared";
      openingHandAcquisitions.push({ ...source, deckAtAcquisition: structuredClone(journey.deck), outcome, eligibleEntries });
      logRecords.push(effectLog(source, { siteId: input.siteId, permissionSeq: input.seq,
        eligibleEntries, outcome, choicePrepared: outcome === "prepared" }));
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
    collect(previous, selections.map(selection => selection.entryId));
    logRecords.push(effectLog(source, { siteId: input.siteId, permissionSeq: input.seq, before: { deckSize: previous.deck.length, eligible: eligible.length }, after: { requested, transformed: count }, eligibleEntryIds: eligible.map(({ entry }) => entry.entryId), transformations: selections }));
  }
  return { journey, transfigurations, copySources, openingHandAcquisitions, starterSources, typeRemapSources, logRecords, paused: false };
}

/** Delay the copy screen until every ordinary observer has earned its continuation. */
export function finishJourneyOnGain(journey: JourneyState, sources: readonly JourneyDreamsignGain[], seq: number, suspendedBattle: JourneySuspendedBattle | null, lookup: JourneyModifierRegistry["lookup"]): JourneyState {
  if (sources.length === 0) return journey;
  let continuation: JourneyDreamsignCopyChoice["continuation"];
  if (journey.screen.type === "journeyDreamsign") {
    if (journey.screen.choice.kind === "copy" || journey.screen.choice.kind === "openingHand" || journey.screen.choice.kind === "typeRemap" || journey.screen.choice.kind === "subtype") throw new Error("Nested Dreamsign copy permission.");
    continuation = { type: "journeyDreamsign", choice: journey.screen.choice };
  } else continuation = journey.screen;
  const kind = journeyAcquisitionKind(sources[0], lookup);
  if (kind === null) throw new Error("Journey acquisition role is unavailable.");
  const choice: JourneyDreamsignCopyChoice = { kind, sources, index: 0, permissionSeq: seq, heldIds: journey.dreamsigns.map((sign) => sign.id), continuation, suspendedBattle };
  return { ...journey, screen: { type: "journeyDreamsign", choice } };
}

export function finishJourneyAcquisition(journey: JourneyState, copySources: readonly JourneyDreamsignGain[], starterSources: readonly import("../../types/journey").JourneyStarterPurgeSource[], typeRemapSources: readonly JourneyDreamsignGain[], seq: number, binding: JourneySuspendedBattle | null, openingHandAcquisitions: readonly JourneyOpeningHandAcquisition[], lookup: JourneyModifierRegistry["lookup"]): JourneyState {
  const openingSources = openingHandAcquisitions.filter(receipt => receipt.outcome === "prepared")
    .map(({ dreamsignId, heldIndex }) => ({ dreamsignId, heldIndex }));
  const sources = [...copySources, ...openingSources].sort((a, b) => a.heldIndex - b.heldIndex);
  return finishTypeRemapAcquisition(finishStarterAcquisition(finishJourneyOnGain(journey, sources, seq, binding, lookup), starterSources, seq, binding), typeRemapSources, seq, binding);
}

const canonicalCallbacks = new WeakMap<JourneyModifierDefinition["afterJourneyEvent"], { readonly id: DreamsignId; readonly effect: JourneyModifierDefinition["journeyOnGain"] }>();
function remember(definition: JourneyModifierDefinition): JourneyModifierDefinition {
  canonicalCallbacks.set(definition.afterJourneyEvent, { id: definition.dreamsignId, effect: definition.journeyOnGain });
  return definition;
}
export function canonicalJourneyOnGain(definition: JourneyModifierDefinition): boolean {
  if (Object.values(Object.getOwnPropertyDescriptors(definition)).some(field => !("value" in field))) return false;
  const origin = canonicalCallbacks.get(definition.afterJourneyEvent);
  return origin !== undefined && Object.getOwnPropertyDescriptor(definition, "dreamsignId")?.value === origin.id && Object.getOwnPropertyDescriptor(definition, "journeyOnGain")?.value === origin.effect && Object.keys(definition).every(key => ["dreamsignId", "journeyOnGain", "afterJourneyEvent"].includes(key));
}
export function journeyOnGain(dreamsignId: DreamsignId, descriptor: JourneyOnGainEffect): JourneyModifierDefinition {
  if (descriptor.kind === "addNightmaresOnGain" ? !index(descriptor.count) || descriptor.count < 1 : descriptor.kind === "afterBattleDreamsignChoice" ? !index(descriptor.offerCount) || descriptor.offerCount < 1 : descriptor.kind === "randomTransfigurationOnGain" ? !index(descriptor.numerator) || !index(descriptor.denominator) || descriptor.denominator < 1 || descriptor.numerator > descriptor.denominator : descriptor.kind === "purgeStarterOnGain" ? !index(descriptor.maxCount) || descriptor.maxCount < 1 : descriptor.kind === "perfectStarterOnGain" ? descriptor.transfiguration !== "Perfected" : descriptor.kind !== "chooseOpeningHandEventOnGain" && descriptor.kind !== "copyOwnedDreamsignOnGain" && descriptor.kind !== "typeRemapOnGain" && descriptor.kind !== "deckSubtypeOnGain") throw new RangeError("Invalid journeyOnGain descriptor.");
  const effect = Object.freeze({ ...descriptor });
  return remember({ dreamsignId, journeyOnGain: effect, afterJourneyEvent({ before, journey, eventType, heldIndex, siteId, seq, random }) {
    if (effect.kind !== "afterBattleDreamsignChoice" || eventType !== "END_BATTLE" || siteId === null || before.screen.type !== "site" || before.screen.siteId !== siteId || findSite(before, siteId)?.type !== "Battle") return null;
    const drawIndices: number[] = [];
    const offer = prepareAfterBattleDreamsignOffer(journey, effect.offerCount, () => { const draw = random(); drawIndices.push(draw.drawIndex); return draw.value; });
    if (offer === null) throw new Error("Earned Dreamsign offer content is unavailable.");
    const next = appendAfterBattleSource({ ...journey, remainingDreamsignPool: [...offer.remainingDreamsignPool] }, siteId, { kind: "dreamsign", dreamsignId, heldIndex, earnedSeq: seq, offerCount: effect.offerCount, offeredDreamsigns: offer.offeredDreamsigns, remainingPoolIds: offer.remainingDreamsignPool });
    if (next === null) throw new Error("Earned Dreamsign continuation is unavailable.");
    return { journey: next, before: { permissions: afterBattleChoice(journey.screen)?.sources.length ?? 0 }, after: { permissions: afterBattleChoice(next.screen)!.sources.length, offered: offer.offeredDreamsigns.length }, target: { siteIds: [siteId], offeredDreamsignIds: offer.offeredDreamsigns.map((sign) => sign.id), drawIndices } };
  } });
}

export function validJourneyDreamsignScreen(screen: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (!record(screen) || screen.type !== "journeyDreamsign" || !record(screen.choice)) return false;
  const choice = screen.choice;
  if (choice.kind === "subtype") return validJourneySubtypeScreen(screen, journey, registry);
  if (choice.kind === "typeRemap") return validTypeRemapScreen(screen, journey, registry);
  if (choice.kind === "afterBattle") return validAfterBattleChoice(choice, journey, registry) && (choice.sources as AfterBattleJourneyChoice["sources"])[choice.index as number].kind === "dreamsign";
  return validJourneyAcquisitionScreen(screen, journey, registry);
}

export function validDreamsignBattleBinding(journey: JourneyState, battle: BattleFoldState | null): boolean {
  if (journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "subtype") return validJourneySubtypeBattleBinding(journey, battle);
  if (journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "typeRemap") return validTypeRemapBattleBinding(journey, battle);
  return validJourneyAcquisitionBattleBinding(journey, battle);
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
  return advanceJourneyAcquisition({ ...journey, dreamsigns }, choice, id => registry.lookup(id));
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
