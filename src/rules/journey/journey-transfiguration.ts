import { isDeckEntryTransfigurationRecord, type TransfigurationRecordResult } from "../../transfiguration/deck-entry-transfigurations";
import type { EventContext } from "../../eventlog/types";
import { cardIdFromUnknown, cardSubtypeFromUnknown, type CardId } from "../../types/card-identity";
import type { CardType } from "../../types/cards";
import { deckEntryIdFromUnknown, cardTypeChangePredicateIdFromUnknown, type DeckEntryId, type DreamsignId } from "../../types/identifiers";
import type { DeckEntry, JourneyState, JourneyTransfigurationEffect, JourneyTransfigurationOccurrence, JourneyOperationCause, TransfigurationType } from "../../types/journey";
import { mintEntryId } from "./deck";
import { afterBattleChoice, appendAfterBattleSource, advanceAfterBattle, validatedAfterBattleCursor } from "./journey-after-battle";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";
import { findSite } from "./sites";
import { journeyLoopTransfiguration as createJourneyLoopTransfiguration } from "./journey-mandatory-loop";

export interface JourneyTransfigurationProvider {
  validateRecord?(entry: Readonly<DeckEntry>): boolean;
  apply?(entry: Readonly<DeckEntry>, form: TransfigurationType): TransfigurationRecordResult<DeckEntry>;
  resolve(entry: Readonly<DeckEntry>): { readonly cardId: CardId; readonly cardType: CardType; readonly subtype: import("../../types/card-identity").CardSubtype; readonly forms: readonly TransfigurationType[]; readonly applicableForms?: readonly TransfigurationType[]; readonly starter?: boolean; readonly perfectedEligible?: boolean } | null;
}
let provider: JourneyTransfigurationProvider | null = null;
export function registerJourneyTransfigurationProvider(value: JourneyTransfigurationProvider | null): void { provider = value; }
/** Identity only, for agreement with the currently consumed executor. */
export function currentJourneyTransfigurationProvider(): JourneyTransfigurationProvider | null { return provider; }

export function journeyTransfigurationCard(entry: Readonly<DeckEntry>) { return provider?.resolve(entry) ?? null; }

export interface JourneyTransfigurationCollectionContext {
  readonly eventSeq: number;
  readonly causalSeq?: number;
  readonly ordinalStart: number;
  readonly orderedEntryIds?: readonly DeckEntryId[];
  readonly parentCause?: JourneyOperationCause;
}
const formNames: readonly TransfigurationType[] = ["Empowered", "Amplified", "Kindled", "Inspired", "Enduring", "Hastened", "Resonant", "Attuned", "Perfected"];
const safeOrdinal = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function validCause(value: unknown): value is JourneyOperationCause {
  return record(value) && Object.keys(value).length === ("causalSeq" in value ? 6 : 5) && (!("causalSeq" in value) || safeOrdinal(value.causalSeq) && Number(value.causalSeq) > Number(value.eventSeq)) && safeOrdinal(value.eventSeq) && value.eventSeq > 0 && safeOrdinal(value.ordinal) && safeOrdinal(value.applicationIndex) && deckEntryIdFromUnknown(value.entryId) !== null && cardIdFromUnknown(value.cardId) !== null;
}
/** Continue retained causal work without changing its actual event-log attribution. */
export function journeyTransfigurationOperationOrder(causes: readonly JourneyOperationCause[], eventSeq: number, permissionSeq = eventSeq): { readonly causalSeq: number; readonly ordinalStart: number } {
  if (!safeOrdinal(eventSeq) || eventSeq === 0 || !safeOrdinal(permissionSeq) || causes.some(cause => !validCause(cause))) throw new RangeError("Invalid transfiguration operation clock");
  const causalSeq = causes.reduce((clock, cause) => Math.max(clock, cause.causalSeq ?? cause.eventSeq), Math.max(eventSeq, permissionSeq));
  const ordinalStart = causes.reduce((ordinal, cause) => (cause.causalSeq ?? cause.eventSeq) === causalSeq ? Math.max(ordinal, cause.ordinal + 1) : ordinal, 0);
  if (!safeOrdinal(causalSeq) || !safeOrdinal(ordinalStart)) throw new RangeError("Transfiguration operation ordinal overflow");
  return { causalSeq, ordinalStart };
}
function historicalEntry(value: unknown): value is DeckEntry {
  if (!record(value) || deckEntryIdFromUnknown(value.entryId) === null || !safeOrdinal(value.cardNumber) || typeof value.isBane !== "boolean" || !(value.transfiguration === null || formNames.some(form => form === value.transfiguration)) || !validJourneyTransfigurationRecord(value)) return false;
  if (value.sparkBonus !== undefined && (typeof value.sparkBonus !== "number" || !Number.isFinite(value.sparkBonus))) return false;
  if (value.statOverride !== undefined && (!record(value.statOverride) || Object.entries(value.statOverride).some(([key, field]) => !["energyCost", "spark"].includes(key) || typeof field !== "number" || !Number.isFinite(field)))) return false;
  if (value.keywordModification != null && (!record(value.keywordModification) || Object.entries(value.keywordModification).some(([key, field]) => key === "fast" ? typeof field !== "boolean" : !["energyCostReduction", "reclaim", "setReclaim"].includes(key) || typeof field !== "number" || !Number.isFinite(field)))) return false;
  const change = value.typeChange;
  return change == null || record(change) && cardTypeChangePredicateIdFromUnknown(change.predicateId) !== null && ["Character", "Event"].includes(String(change.cardType)) && cardSubtypeFromUnknown(change.subtype) !== null && typeof change.label === "string";
}
function detachedEntry(entry: Readonly<DeckEntry>): Readonly<DeckEntry> {
  const freeze = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  };
  const copy = structuredClone(entry); freeze(copy); return copy;
}
function equalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => equalValue(value, right[index]));
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && equalValue(left[key], right[key]));
}
function applicationCount(entry: Readonly<DeckEntry>): number { return entry.transfigurationApplications?.length ?? (entry.transfiguration === null ? 0 : 1); }
/** Own optional provenance is coherent; legacy ordinary resolution needs no proof capability. */
export function validJourneyTransfigurationOperation(value: unknown): boolean {
  if (!record(value)) return false;
  if (!("operation" in value)) return true;
  const operation = value.operation;
  if (!record(operation) || Object.keys(operation).some(key => !["cause", "beforeEntry", "parentCause"].includes(key)) || !validCause(operation.cause) || !historicalEntry(operation.beforeEntry) || !historicalEntry(value.entry) || cardIdFromUnknown(value.cardId) === null) return false;
  const before = operation.beforeEntry, after = value.entry, cause = operation.cause;
  if (before.entryId !== after.entryId || before.cardNumber !== after.cardNumber || cause.entryId !== after.entryId || cause.cardId !== value.cardId || cause.applicationIndex !== applicationCount(after) - 1 || applicationCount(after) !== applicationCount(before) + 1) return false;
  if (operation.parentCause !== undefined) {
    const parent = operation.parentCause;
    if (!validCause(parent) || parent.entryId !== cause.entryId || parent.cardId !== cause.cardId || parent.applicationIndex >= applicationCount(before) || (parent.causalSeq ?? parent.eventSeq) > (cause.causalSeq ?? cause.eventSeq) || (parent.causalSeq ?? parent.eventSeq) === (cause.causalSeq ?? cause.eventSeq) && parent.ordinal >= cause.ordinal) return false;
  }
  try {
    const resolved = provider?.resolve(after);
    if (resolved?.cardId !== cause.cardId || resolved.cardType !== value.cardType) return false;
    if (after.transfigurationApplications === undefined) return before.transfiguration === null && after.transfiguration !== null && equalValue({ ...before, transfiguration: after.transfiguration }, after);
    const form = after.transfigurationApplications[after.transfigurationApplications.length - 1].form;
    const appended = provider?.apply?.(before, form);
    return appended?.ok === true && equalValue(appended.value, after);
  } catch { return false; }
}

/** Only successful original-entry applications provide detached occasions. */
export function journeyTransfigurationOccurrences(before: Readonly<Pick<JourneyState, "deck">>, after: Readonly<Pick<JourneyState, "deck">>, context?: JourneyTransfigurationCollectionContext): readonly JourneyTransfigurationOccurrence[] {
  if (context !== undefined && (!safeOrdinal(context.eventSeq) || context.eventSeq === 0 || !safeOrdinal(context.ordinalStart) || "causalSeq" in context && (!safeOrdinal(context.causalSeq) || Number(context.causalSeq) <= context.eventSeq))) throw new RangeError("Invalid transfiguration operation clock");
  const original = new Map(before.deck.map(entry => [entry.entryId, entry]));
  const changed = after.deck.filter(entry => {
    const old = original.get(entry.entryId);
    return old !== undefined && (old.transfiguration === null && entry.transfiguration !== null || entry.transfigurationApplications !== undefined && !equalValue(entry.transfigurationApplications, old.transfigurationApplications));
  });
  const ordered = context?.orderedEntryIds;
  if (ordered !== undefined && (ordered.length !== changed.length || new Set(ordered).size !== ordered.length || ordered.some(id => !changed.some(entry => entry.entryId === id)))) throw new Error("Incomplete transfiguration operation order");
  const entries = ordered === undefined ? changed : ordered.map(id => changed.find(entry => entry.entryId === id)!);
  return entries.map((entry, index) => {
    if (provider === null) throw new Error("Journey transfiguration content is unavailable.");
    const resolved = provider.resolve(entry);
    if (resolved === null) throw new Error("Transfigured journey card is unknown.");
    const ordinal = (context?.ordinalStart ?? 0) + index;
    if (!Number.isSafeInteger(ordinal)) throw new RangeError("Transfiguration operation ordinal overflow");
    const occurrence: JourneyTransfigurationOccurrence = { entry: detachedEntry(entry), cardId: resolved.cardId, cardType: resolved.cardType,
      ...(context === undefined ? {} : { operation: Object.freeze({ cause: Object.freeze({ eventSeq: context.eventSeq, ...(context.causalSeq === undefined ? {} : { causalSeq: context.causalSeq }), ordinal, entryId: entry.entryId, cardId: resolved.cardId, applicationIndex: applicationCount(entry) - 1 }), beforeEntry: detachedEntry(original.get(entry.entryId)!), ...(context.parentCause === undefined ? {} : { parentCause: Object.freeze({ ...context.parentCause }) }) }) }) };
    if (!validJourneyTransfigurationOperation(occurrence)) throw new Error("Invalid transfiguration operation provenance");
    return Object.freeze(occurrence);
  });
}

const factorySpecs = new WeakMap<JourneyModifierDefinition["afterJourneyEvent"], { dreamsignId: DreamsignId; effect: NonNullable<JourneyModifierDefinition["journeyTransfiguration"]> }>();
/** Validate the complete definition around the exact factory-owned callback. */
export function canonicalJourneyTransfiguration(definition: JourneyModifierDefinition): boolean {
  if (Object.values(Object.getOwnPropertyDescriptors(definition)).some(field => !("value" in field))) return false;
  const spec = factorySpecs.get(definition.afterJourneyEvent);
  const valid = spec !== undefined && Object.getOwnPropertyDescriptor(definition, "dreamsignId")?.value === spec.dreamsignId && Object.getOwnPropertyDescriptor(definition, "journeyTransfiguration")?.value === spec.effect && Object.keys(definition).every(key => ["dreamsignId", "journeyTransfiguration", "afterJourneyEvent"].includes(key));
  if (spec?.effect.kind === "additionalRandomTransfiguration" && !valid) throw new RangeError("Incompatible additional journey definition");
  return valid;
}
export function journeyTransfiguration(dreamsignId: DreamsignId, descriptor: JourneyTransfigurationEffect): JourneyModifierDefinition {
  if (descriptor.kind !== "additionalRandomTransfiguration" && descriptor.kind !== "copyTransfiguredEvent" && (descriptor.kind !== "afterBattleTransfiguration" ||
    !Number.isSafeInteger(descriptor.maxCount) || descriptor.maxCount < 1)) throw new RangeError("Invalid journeyTransfiguration descriptor.");
  const effect = Object.freeze({ ...descriptor });
  const definition: JourneyModifierDefinition = { dreamsignId, journeyTransfiguration: effect,
    afterJourneyEvent({ before, journey, eventType, heldIndex, siteId, seq, transfigurations, reservedEntries = [] }): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
      if (effect.kind === "afterBattleTransfiguration") {
        if (eventType !== "END_BATTLE" || siteId === null || before.screen.type !== "site" || before.screen.siteId !== siteId || findSite(before, siteId)?.type !== "Battle") return null;
        const next = appendAfterBattleSource(journey, siteId, { kind: "transfiguration", dreamsignId, heldIndex, maxCount: effect.maxCount });
        if (next === null) return null;
        const count = afterBattleChoice(next.screen)!.sources.length;
        return { journey: next, before: { permissions: count - 1 }, after: { permissions: count, maxCount: effect.maxCount }, target: { siteIds: [siteId] } };
      }
      if (effect.kind === "additionalRandomTransfiguration") return null;
      const events = transfigurations.filter((occurrence) => occurrence.cardType === "Event");
      if (events.length === 0) return null;
      let deck = [...journey.deck];
      const copies = events.map(({ entry, cardId }, index) => {
        const copy = { ...structuredClone(entry), entryId: mintEntryId([...deck, ...reservedEntries], seq, index) };
        deck = [...deck, copy];
        return { fromEntryId: entry.entryId, entryId: copy.entryId, cardId };
      });
      return { journey: { ...journey, deck }, before: { deckSize: journey.deck.length }, after: { deckSize: deck.length, copied: copies.length },
        target: { siteIds: siteId === null ? [] : [siteId], copies } };
    },
  };
  factorySpecs.set(definition.afterJourneyEvent, { dreamsignId, effect });
  return definition;
}

export function validJourneyTransfigurationScreen(screen: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (typeof screen !== "object" || screen === null || !("type" in screen) || screen.type !== "journeyTransfiguration" || !("choice" in screen)) return false;
  return validatedAfterBattleCursor(screen.choice, journey, registry)?.kind === "transfiguration";
}

/** Validation finishes before any card changes or random forms are committed. */
export function resolveJourneyTransfiguration(journey: JourneyState, payload: Record<string, unknown>, ctx: EventContext, registry: JourneyModifierRegistry): JourneyState | null {
  if (journey.screen.type !== "journeyTransfiguration") return null;
  const cursor = validatedAfterBattleCursor(journey.screen.choice, journey, registry);
  if (cursor?.kind !== "transfiguration") return null;
  const { choice, source } = cursor;
  if (payload.siteId !== cursor.siteId || payload.dreamsignId !== source.dreamsignId ||
    payload.heldIndex !== source.heldIndex || payload.choiceIndex !== choice.index || !Array.isArray(payload.entryIds) || payload.entryIds.length > source.maxCount) return null;
  const ids = payload.entryIds.map(deckEntryIdFromUnknown);
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return null;
  const selected = ids.map((id) => journey.deck.find((entry) => entry.entryId === id));
  if (selected.some((entry) => entry === undefined || entry.transfiguration !== null)) return null;
  if (selected.length === 0) return advanceAfterBattle(journey, cursor);
  if (provider === null) return null;
  if (selected.some(entry => !validJourneyTransfigurationRecord(entry))) return null;
  const resolved = selected.map((entry) => provider!.resolve(entry!));
  const available = resolved.map(card => card === null ? [] : provider!.apply === undefined ? card.forms : (card.applicableForms ?? []).filter(form => form !== "Perfected"));
  if (available.some(forms => forms.length === 0)) return null;
  // Preflight every source/form before any random draw, including injected capabilities.
  if (provider.apply !== undefined && selected.some((entry, index) => available[index].some(form => !provider!.apply!(entry!, form).ok))) return null;
  const changed = new Map(ids.map((id, index) => {
    const form = available[index][Math.floor(ctx.rng(index) * available[index].length)];
    const result = provider!.apply?.(selected[index]!, form);
    if (result !== undefined && !result.ok) throw new Error("Transfiguration source changed during append");
    return [id!, result?.ok ? result.value : { ...selected[index]!, transfiguration: form }];
  }));
  return advanceAfterBattle({ ...journey, deck: journey.deck.map(entry => changed.get(entry.entryId) ?? entry) }, cursor);
}

/** A legacy resolver cannot certify a present complete record. */
export function validJourneyTransfigurationRecord(entry: unknown): boolean {
  if (!isDeckEntryTransfigurationRecord(entry)) return false;
  if (typeof entry !== "object" || entry === null || !("transfigurationApplications" in entry)) return true;
  try { return provider?.validateRecord?.(entry as DeckEntry) === true; } catch { return false; }
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
/** Only persisted DeckEntry-bearing locations consumed by journey continuations are inspected. */
export function validJourneyTransfigurationRecords(journey: unknown): boolean {
  if (!record(journey)) return true;
  const entries = (value: unknown) => !Array.isArray(value) || value.every(validJourneyTransfigurationRecord);
  const runtimes = (value: unknown) => !record(value) || Object.values(value).every(runtime => !record(runtime) || !record(runtime.resolution) || entries(runtime.resolution.purgedEntrySnapshots));
  if (!entries(journey.deck) || !runtimes(journey.siteRuntime)) return false;
  const screen = journey.screen;
  if (!record(screen) || !record(screen.choice) || screen.choice.kind !== "subtype" || !record(screen.choice.resume)) return true;
  const resume = screen.choice.resume;
  return (!record(resume.before) || entries(resume.before.deck) && runtimes(resume.before.siteRuntime)) && entries(resume.attemptedEntries) &&
    (!Array.isArray(resume.transfigurations) || resume.transfigurations.every(occurrence => !record(occurrence) || validJourneyTransfigurationRecord(occurrence.entry) && validJourneyTransfigurationOperation(occurrence)));
}
export function assertJourneyTransfigurationCheckpoint(state: unknown): void {
  if (record(state) && !validJourneyTransfigurationRecords(state.journey)) throw new Error("Invalid journey transfiguration checkpoint");
}

export function journeyLoopTransfiguration(dreamsignId: DreamsignId, source: JourneyTransfigurationProvider, cardId: CardId): ReturnType<typeof createJourneyLoopTransfiguration> {
  return createJourneyLoopTransfiguration(dreamsignId, source, cardId);
}
