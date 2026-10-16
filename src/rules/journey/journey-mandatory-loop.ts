import { canonicalJourneyOnGain } from "./journey-on-gain";
import { canonicalJourneyPurge } from "./journey-purge";
import { canonicalJourneyDraft } from "./journey-draft";
import { journeyLoopFormsIntact } from "../../session/providers/journey-loop-source";
/** A closed repeating-original instruction, consumed at the earned finite-prefix boundary. */
import type { CardId } from "../../types/card-identity";
import type { DreamsignId } from "../../types/identifiers";
import type { DeckEntry, JourneyDreamsignGain, JourneyEarnedLoopInstruction, JourneyLoopBattleBinding, JourneyLoopPending, JourneyState, JourneyTransfigurationOccurrence } from "../../types/journey";
import type { ReducerLogRecord } from "../../eventlog/types";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";
import { canonicalJourneyTransfiguration, currentJourneyTransfigurationProvider, journeyTransfigurationOccurrences, journeyTransfigurationOperationOrder, validJourneyTransfigurationOperation, type JourneyTransfigurationProvider } from "./journey-transfiguration";
import { canonicalJourneyDeckEntry, journeyDeckEntryGains } from "./journey-deck-entry";
import { journeyLoopProviderSource } from "../../session/providers/journey-transfiguration-provider";

interface LoopSpec { readonly dreamsignId: DreamsignId; readonly cardId: CardId; readonly provider: JourneyTransfigurationProvider; readonly marker: NonNullable<JourneyModifierDefinition["journeyLoopContinuation"]> }
const specs = new WeakMap<JourneyModifierDefinition["afterJourneyEvent"], LoopSpec>();

/** Unsupported claims are refused before a game action; ordinary providers remain usable. */
export function journeyLoopTransfiguration(dreamsignId: DreamsignId, provider: JourneyTransfigurationProvider, cardId: CardId): { readonly ok: true; readonly definition: JourneyModifierDefinition } | { readonly ok: false; readonly reason: "unsupported_source" } {
  const source = journeyLoopProviderSource(provider, cardId);
  const anchor = source?.definition.cardType === "character" ? "Kindled" : "Inspired";
  if (!journeyLoopFormsIntact() || source === undefined || !source.data.forms.some(form => form.id === anchor)) return { ok: false, reason: "unsupported_source" };
  const afterJourneyEvent: JourneyModifierDefinition["afterJourneyEvent"] = () => null;
  const marker = Object.freeze({ kind: "mandatoryOriginalTransfiguration" as const, cardId });
  specs.set(afterJourneyEvent, Object.freeze({ dreamsignId, provider, cardId, marker }));
  return { ok: true, definition: Object.freeze({ dreamsignId, journeyLoopContinuation: marker, afterJourneyEvent }) };
}

/** A genuine callback copied into an incompatible definition is a configuration error. */
export function journeyLoopSpec(definition: JourneyModifierDefinition | undefined): LoopSpec | undefined {
  if (definition === undefined) return undefined;
  if (Object.values(Object.getOwnPropertyDescriptors(definition)).some(field => !("value" in field))) return undefined;
  const spec = specs.get(definition.afterJourneyEvent);
  if (spec === undefined) return undefined;
  if (definition.dreamsignId !== spec.dreamsignId || definition.journeyLoopContinuation !== spec.marker || Object.keys(definition).some(key => !["dreamsignId", "journeyLoopContinuation", "afterJourneyEvent"].includes(key))) throw new RangeError("Incompatible closed journey instruction");
  return spec;
}
export function validateJourneyLoopRegistry(definitions: readonly JourneyModifierDefinition[]): void {
  if (!definitions.some(definition => journeyLoopSpec(definition) !== undefined)) return;
  for (const definition of definitions) {
    if (journeyLoopSpec(definition) === undefined && !canonicalJourneyTransfiguration(definition) && !canonicalJourneyDeckEntry(definition) && !canonicalJourneyOnGain(definition) && !canonicalJourneyPurge(definition) && !canonicalJourneyDraft(definition)) throw new RangeError("Untrusted closed journey sibling");
  }
}
/** Lookup consumes the current captured source without registering new proof authority. */
export function journeyInstructionSource(definition: JourneyModifierDefinition | undefined, cardId: CardId): { readonly cardId: CardId; readonly provider: JourneyTransfigurationProvider } | undefined {
  const fixed = journeyLoopSpec(definition);
  if (fixed !== undefined) return fixed.cardId === cardId ? fixed : undefined;
  if (definition?.journeyTransfiguration?.kind !== "additionalRandomTransfiguration" || !canonicalJourneyTransfiguration(definition)) return undefined;
  const provider = currentJourneyTransfigurationProvider();
  return provider !== null && journeyLoopProviderSource(provider, cardId) !== undefined ? { cardId, provider } : undefined;
}
export function observesJourneyLoops(journey: JourneyState, lookup: JourneyModifierRegistry["lookup"]): boolean {
  return journey.dreamsigns.some(sign => {
    const definition = lookup(sign.id);
    return journeyLoopSpec(definition) !== undefined || definition?.journeyTransfiguration?.kind === "additionalRandomTransfiguration";
  });
}

/** Root occurrences are actual snapshots, not copies or arbitrary descriptor assertions. */
export function earnJourneyLoops(journey: JourneyState, occurrences: readonly JourneyTransfigurationOccurrence[], observerSources: readonly JourneyDreamsignGain[], lookup: JourneyModifierRegistry["lookup"], seq: number, siteId: JourneyLoopPending["siteId"], binding: JourneyLoopBattleBinding | null, logRecords: ReducerLogRecord[]): JourneyState {
  const prior = journey.pendingJourneyLoop;
  const instructions = [...(prior?.instructions ?? [])];
  occurrences.forEach((occurrence, ordinal) => {
    for (const source of observerSources) {
      const definition = lookup(source.dreamsignId);
      const spec = journeyInstructionSource(definition, occurrence.cardId);
      if (definition?.journeyTransfiguration?.kind === "additionalRandomTransfiguration" && (spec === undefined || spec.provider !== currentJourneyTransfigurationProvider() || !journeyLoopFormsIntact())) throw new Error("Additional journey source is unavailable");
      if (!validJourneyTransfigurationOperation(occurrence)) throw new Error("Invalid earned operation");
      if (spec === undefined || spec.cardId !== occurrence.cardId || spec.provider !== currentJourneyTransfigurationProvider() || !journeyLoopFormsIntact()) continue;
      const resolved = spec.provider.resolve(occurrence.entry);
      if (resolved?.cardId !== spec.cardId || spec.provider.validateRecord?.(occurrence.entry) !== true) {
        if (definition?.journeyTransfiguration?.kind === "additionalRandomTransfiguration") throw new Error("Invalid additional journey source record");
        continue;
      }
      const cause = occurrence.operation?.cause ?? { eventSeq: seq, ordinal, entryId: occurrence.entry.entryId, cardId: occurrence.cardId, applicationIndex: (occurrence.entry.transfigurationApplications?.length ?? 1) - 1 };
      if (instructions.some(instruction => (instruction.cause.causalSeq ?? instruction.cause.eventSeq) === (cause.causalSeq ?? cause.eventSeq) && instruction.cause.ordinal === cause.ordinal && instruction.source.heldIndex === source.heldIndex)) continue; // The same paused operation resumes once.
      const instruction: JourneyEarnedLoopInstruction = { kind: "mandatoryOriginalTransfiguration", permissionSeq: seq, sourceObserverSources: observerSources.map(source => ({ ...source })), cause, parentEntry: structuredClone(occurrence.entry), source: { ...source } };
      instructions.push(instruction);
      logRecords.push({ event: "journey_loop_instruction_earned", fields: { cause, source, parentEntry: instruction.parentEntry, siteId, permissionSeq: seq } });
    }
  });
  if (instructions.length === 0) return journey;
  return { ...journey, pendingJourneyLoop: prior === undefined ? { kind: "earnedOriginalTransfiguration", permissionSeq: seq, siteId, instructions, observerSources: observerSources.map(source => ({ ...source })), suspendedBattle: binding } : { ...prior, instructions } };
}
function reachedChoice(journey: JourneyState): boolean {
  return journey.screen.type === "journeyDreamsign" || journey.screen.type === "journeyTransfiguration" || journey.screen.type === "journeyPurge" || journey.screen.type === "journeyStarterPurge";
}

/** All current-operation siblings/acquisition windows finish before this call. */
export function settleJourneyLoops(journey: JourneyState, lookup: JourneyModifierRegistry["lookup"], seq: number, random: () => { value: number; drawIndex: number }, logRecords: ReducerLogRecord[], reservedEntries: readonly DeckEntry[], nextOperationOrdinal = 0): JourneyState {
  const pending = journey.pendingJourneyLoop;
  if (pending === undefined || reachedChoice(journey)) return journey;
  const { pendingJourneyLoop: _pending, ...rest } = journey;
  let next: JourneyState = rest;
  const reserved = new Map([...reservedEntries, ...next.deck].map(entry => [entry.entryId, entry]));
  const operationOrder = journeyTransfigurationOperationOrder(pending.instructions.map(item => item.cause), seq);
  let ordinal = Math.max(operationOrder.ordinalStart, nextOperationOrdinal);
  const queue = [...pending.instructions];
  for (const instruction of queue) {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0) throw new RangeError("Transfiguration operation ordinal overflow");
    const spec = journeyInstructionSource(lookup(instruction.source.dreamsignId), instruction.cause.cardId);
    if (spec === undefined) throw new Error("Earned journey instruction is unavailable");
    const target = next.deck.find(entry => entry.entryId === instruction.cause.entryId);
    if (target === undefined) continue;
    const resolved = spec.provider.resolve(target), source = journeyLoopProviderSource(spec.provider, instruction.cause.cardId);
    if (source === undefined || resolved?.cardId !== instruction.cause.cardId || target.cardNumber !== instruction.parentEntry.cardNumber || !spec.provider.validateRecord?.(target)) throw new Error("Earned journey source disagrees with its target");
    const forms = resolved.applicableForms ?? [];
    const anchor = source.definition.cardType === "character" ? "Kindled" as const : "Inspired" as const;
    const continuingSources = next.dreamsigns.flatMap(({ id }, heldIndex) => {
      const current = journeyInstructionSource(lookup(id), instruction.cause.cardId);
      return current?.cardId === spec.cardId && current.provider === spec.provider && current.provider === currentJourneyTransfigurationProvider() ? [{ dreamsignId: id, heldIndex }] : [];
    });
    if (forms.length === 0) continue;
    // These are exactly the callbacks executed by a child, including those
    // needed to preserve the captured closure. Opaque completed roots stay outside.
    for (const { id } of next.dreamsigns) {
      const definition = lookup(id);
      if (definition?.journeyTransfiguration?.kind === "additionalRandomTransfiguration" || definition?.journeyTransfiguration?.kind === "copyTransfiguredEvent") {
        if (!canonicalJourneyTransfiguration(definition)) throw new Error("Unsupported child transfiguration context");
      }
      if (definition?.journeyDeckEntry !== undefined && !canonicalJourneyDeckEntry(definition)) throw new Error("Unsupported child gain context");
    }
    if (forms.length > 0 && (!journeyLoopFormsIntact() || !forms.includes(anchor))) throw new Error("Unsupported earned journey source proof");
    if (journeyLoopFormsIntact() && continuingSources.length > 0 && forms.includes(anchor)) {
      const proof = { kind: "canonicalTransfigurationTypeClosure" as const, cardType: source.card.cardType, anchor, applicableForms: [...forms] };
      logRecords.push({ event: "journey_mandatory_loop_proved", fields: { cause: instruction.cause, continuingSources, proof } });
      const journeyDraw = { kind: "mandatoryJourneyLoop" as const, result: "draw" as const, committedSeq: seq, ...(operationOrder.causalSeq === seq ? {} : { committedCausalSeq: operationOrder.causalSeq }), cause: instruction.cause, earnedSource: instruction.source, continuingSources, proof, abandonedBattle: pending.suspendedBattle };
      logRecords.push({ event: "journey_draw_committed", fields: { ...journeyDraw } });
      return { ...next, screen: { type: "journeyFailed" }, journeyDraw };
    }
    // Preflight the complete current choice set before consuming its one draw.
    if (forms.some(candidate => spec.provider.apply?.(target, candidate).ok !== true)) throw new Error("Invalid earned journey application");
    const draw = random(), form = forms[Math.floor(draw.value * forms.length)];
    const appended = spec.provider.apply!(target, form);
    if (!appended.ok) throw new Error("Invalid earned journey application");
    const previousApplication = next;
    next = { ...next, deck: next.deck.map(entry => entry.entryId === target.entryId ? appended.value : entry) };
    const [occurrence] = journeyTransfigurationOccurrences(previousApplication, next, { eventSeq: seq, ...(operationOrder.causalSeq === seq ? {} : { causalSeq: operationOrder.causalSeq }), ordinalStart: ordinal++, parentCause: instruction.cause });
    const cause = occurrence.operation!.cause;
    const childObservers = next.dreamsigns.map(({ id }, heldIndex) => ({ dreamsignId: id, heldIndex }));
    logRecords.push({ event: "journey_loop_finite_application", fields: { cause, ...(operationOrder.causalSeq === seq ? {} : { rngEventSeq: seq }), parentCause: instruction.cause, form, applicableForms: forms, drawIndex: draw.drawIndex, before: target, after: appended.value } });
    // Known Tome copies are finite; formed copies cannot trigger either Crystal.
    for (const physical of childObservers.map(({ dreamsignId: id, heldIndex }) => ({ id, heldIndex }))) {
      const definition = lookup(physical.id);
      if (definition?.journeyTransfiguration?.kind !== "copyTransfiguredEvent") continue;
      const previous = next;
      const applied = definition.afterJourneyEvent({ lookup, before: previous, journey: next, eventType: "RESOLVE_JOURNEY_TRANSFIGURATION", heldIndex: physical.heldIndex, seq, random, reservedEntries: [...reserved.values()], gains: [], transfigurations: [occurrence], siteId: pending.siteId });
      if (applied === null) continue;
      next = applied.journey;
      for (const entry of next.deck) reserved.set(entry.entryId, entry);
      logRecords.push({ event: "journey_modifier_applied", fields: { dreamsignId: physical.id, heldIndex: physical.heldIndex, hook: "after_journey_event", permissionSeq: pending.permissionSeq, rngEventSeq: seq, before: applied.before, after: applied.after, target: applied.target } });
      const gains = journeyDeckEntryGains(previous, next);
      const gainSources = next.dreamsigns.map(({ id }, heldIndex) => ({ id, heldIndex, definition: lookup(id) })).filter(item => item.definition?.journeyDeckEntry !== undefined);
      gainSources.sort((a, b) => Number(b.definition!.journeyDeckEntry!.kind === "preventNightmare") - Number(a.definition!.journeyDeckEntry!.kind === "preventNightmare"));
      for (const gainSource of gainSources) {
        const gained = gainSource.definition!.afterJourneyEvent({ lookup, before: previous, journey: next, eventType: "RESOLVE_JOURNEY_TRANSFIGURATION", heldIndex: gainSource.heldIndex, seq, random, gains, transfigurations: [], siteId: pending.siteId });
        if (gained !== null) { next = gained.journey; logRecords.push({ event: "journey_modifier_applied", fields: { dreamsignId: gainSource.id, heldIndex: gainSource.heldIndex, hook: "after_journey_event", before: gained.before, after: gained.after, target: gained.target } }); }
      }
    }
    const earned = earnJourneyLoops(next, [occurrence], childObservers, lookup, seq, pending.siteId, pending.suspendedBattle, logRecords);
    if (earned.pendingJourneyLoop !== undefined) {
      queue.push(...earned.pendingJourneyLoop.instructions);
      const { pendingJourneyLoop: _earned, ...settled } = earned;
      next = settled;
    }
  }
  return next;
}

