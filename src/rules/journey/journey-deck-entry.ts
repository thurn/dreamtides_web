import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { cardIdFromUnknown, parseCardSubtype } from "../../types/card-identity";
import { deckEntryIdFromUnknown, dreamsignIdFromUnknown, type DeckEntryId, type DreamsignId } from "../../types/identifiers";
import type { JourneyDeckEntryEffect, JourneyDeckEntryGain, JourneyState, PreventedNightmareGain } from "../../types/journey";
import { journeyTransfigurationCard } from "./journey-transfiguration";
import type { JourneyModifierDefinition } from "./modifier-registry";

/** Snapshot only physical entries introduced by this operation, in deck order. */
export function journeyDeckEntryGains(before: JourneyState, journey: JourneyState): readonly JourneyDeckEntryGain[] {
  const old = new Set(before.deck.map((entry) => entry.entryId));
  return journey.deck.filter((entry) => !old.has(entry.entryId)).map((entry) => {
    const card = journeyTransfigurationCard(entry);
    if (card === null) throw new Error("Gained journey card content is unavailable.");
    return Object.freeze({ entry: Object.freeze(structuredClone(entry)), cardId: card.cardId, cardType: card.cardType, subtype: card.subtype });
  });
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Optional saved receipts have their own bounded structural and identity contract. */
export function validPreventedNightmareGains(value: unknown, deck: readonly unknown[], resolution: Record<string, unknown>): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  const ids = new Set<DeckEntryId>();
  for (const item of value) {
    if (!record(item)) return false;
    const id = deckEntryIdFromUnknown(item.entryId);
    if (id === null || ids.has(id) || cardIdFromUnknown(item.cardId) !== NIGHTMARE_CARD_ID ||
      dreamsignIdFromUnknown(item.dreamsignId) === null || typeof item.heldIndex !== "number" ||
      !Number.isSafeInteger(item.heldIndex) || item.heldIndex < 0 ||
      deck.some((entry) => record(entry) && entry.entryId === id) ||
      (Array.isArray(resolution.gainedEntryIds) && resolution.gainedEntryIds.includes(id)) ||
      (Array.isArray(resolution.nightmareGains) && resolution.nightmareGains.some((gain) => record(gain) && gain.entryId === id))) return false;
    if ((item.sourceEntryId !== undefined || item.sourceCardId !== undefined) &&
      (deckEntryIdFromUnknown(item.sourceEntryId) === null || item.sourceEntryId === id || cardIdFromUnknown(item.sourceCardId) !== NIGHTMARE_CARD_ID)) return false;
    ids.add(id);
  }
  return true;
}

/** Preserve the validated transaction; only fresh attempted additions are replaced. */
function prevent(journey: JourneyState, before: JourneyState, prevented: readonly PreventedNightmareGain[], siteId: Parameters<JourneyModifierDefinition["afterJourneyEvent"]>[0]["siteId"]): JourneyState {
  const blocked = new Set(prevented.map((gain) => gain.entryId));
  let next: JourneyState = { ...journey, deck: journey.deck.filter((entry) => !blocked.has(entry.entryId)),
    battleModifiers: journey.battleModifiers.flatMap((modifier) => {
      if (modifier.kind !== "temporary_nightmare_grant" || !modifier.addedEntryIds.some((id) => blocked.has(id))) return [modifier];
      const addedEntryIds = modifier.addedEntryIds.filter((id) => !blocked.has(id));
      return addedEntryIds.length === 0 ? [] : [{ ...modifier, addedEntryIds, count: addedEntryIds.length }];
    }) };
  if (siteId === null) return next;
  const runtime = journey.siteRuntime[siteId];
  const old = before.siteRuntime[siteId];
  if (runtime?.kind !== "exploration" || runtime.resolution === null ||
    (old?.kind === "exploration" && old.resolution === runtime.resolution)) return next;
  const resolution = runtime.resolution;
  const claimed = new Set(resolution.gainedEntryIds ?? resolution.nightmareGains?.map((gain) => gain.entryId) ?? []);
  const receiptPrevented = prevented.filter((gain) => claimed.has(gain.entryId));
  // Legacy scalar-only receipts describe the original domain batch, not a
  // later modifier-produced addition with its own application diagnostic.
  const basePrevented = claimed.size === 0 && before.deck.every((entry) => !blocked.has(entry.entryId)) &&
    resolution.gainedCardIds.includes(NIGHTMARE_CARD_ID) ? prevented : receiptPrevented;
  if (basePrevented.length === 0) return next;
  const offer = runtime.actionOffers.find((item) => item.actionId === resolution.actionId);
  const selected = resolution.selection?.entryIds;
  const copying = offer?.canonicalMechanicId === "duplicate-deck-entry" || offer?.canonicalMechanicId === "purge-and-duplicate";
  const savedPrevented = basePrevented.map((gain) => {
    const mapped = resolution.cardCopies?.find((copy) => copy.mintedEntryId === gain.entryId);
    const position = resolution.gainedEntryIds?.indexOf(gain.entryId) ?? -1;
    const source = mapped?.sourceEntryId ?? (copying
      ? deckEntryIdFromUnknown(resolution.selection?.copyEntryId ?? (Array.isArray(selected) ? selected.length === 1 ? selected[0] : selected[position] : undefined)) : null);
    if (source === null || source === undefined) return gain;
    const sourceEntry = journey.deck.find((entry) => entry.entryId === source) ?? before.deck.find((entry) => entry.entryId === source);
    if (sourceEntry === undefined || journeyTransfigurationCard(sourceEntry)?.cardId !== NIGHTMARE_CARD_ID) return gain;
    return { ...gain, sourceEntryId: source, sourceCardId: NIGHTMARE_CARD_ID };
  });
  // Nightmare identity is fixed. Parallel card and entry lists retain their order.
  const kept = resolution.gainedEntryIds?.map((id, index) => ({ id, cardId: resolution.gainedCardIds[index] })).filter(({ id }) => !blocked.has(id));
  const gainedCardIds = kept !== undefined && resolution.gainedCardIds.length === resolution.gainedEntryIds!.length
    ? kept.map(({ cardId }) => cardId)
    : resolution.gainedCardIds.filter((id) => id !== NIGHTMARE_CARD_ID);
  next = { ...next, siteRuntime: { ...next.siteRuntime, [siteId]: { ...runtime, resolution: { ...resolution,
    gainedCardIds,
    ...(kept === undefined ? {} : { gainedEntryIds: kept.map(({ id }) => id) }),
    nightmareGains: resolution.nightmareGains?.filter((gain) => !blocked.has(gain.entryId)),
    cardCopies: resolution.cardCopies?.filter((copy) => !blocked.has(copy.mintedEntryId)),
    cardReplacements: resolution.cardReplacements?.filter((copy) => !blocked.has(copy.replacementEntryId)),
    preventedNightmareGains: [...(resolution.preventedNightmareGains ?? []), ...savedPrevented],
  } } } };
  return next;
}

/** Catalog values author the threshold and amount; physical gains are the sole subjects. */
export function journeyDeckEntry(dreamsignId: DreamsignId, descriptor: JourneyDeckEntryEffect): JourneyModifierDefinition {
  if ((descriptor.kind !== "preventNightmare" && descriptor.kind !== "warriorSpark" && descriptor.kind !== "randomTransfiguration") ||
    (descriptor.kind === "warriorSpark" && (!Number.isSafeInteger(descriptor.amount) || descriptor.amount < 0)) ||
    (descriptor.kind === "randomTransfiguration" && (!Number.isSafeInteger(descriptor.minimumDeckSize) || descriptor.minimumDeckSize < 0))) throw new RangeError("Invalid journey deck entry clause.");
  const effect = Object.freeze({ ...descriptor });
  return { dreamsignId, journeyDeckEntry: effect,
    afterJourneyEvent({ before, journey, heldIndex, siteId, gains, random }): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
      const current = new Map(journey.deck.map((entry) => [entry.entryId, entry]));
      const present = gains.filter((gain) => current.has(gain.entry.entryId));
      if (effect.kind === "preventNightmare") {
        const prevented = present.filter((gain) => gain.cardId === NIGHTMARE_CARD_ID).map((gain) => ({ entryId: gain.entry.entryId, cardId: gain.cardId, dreamsignId, heldIndex }));
        if (prevented.length === 0) return null;
        const next = prevent(journey, before, prevented, siteId);
        return { journey: next, before: { deckSize: journey.deck.length, attempted: prevented.length }, after: { deckSize: next.deck.length, gained: 0, prevented: prevented.length }, target: { siteIds: siteId === null ? [] : [siteId], prevented } };
      }
      if (effect.kind === "warriorSpark") {
        const changes = present.filter((gain) => gain.cardType === "Character" && gain.subtype === parseCardSubtype("Warrior")).map((gain) => {
          const entry = current.get(gain.entry.entryId)!;
          return { entryId: entry.entryId, cardId: gain.cardId, before: entry.sparkBonus ?? 0, after: (entry.sparkBonus ?? 0) + effect.amount };
        });
        if (changes.length === 0) return null;
        const byId = new Map(changes.map((change) => [change.entryId, change]));
        return { journey: { ...journey, deck: journey.deck.map((entry) => byId.has(entry.entryId) ? { ...entry, sparkBonus: byId.get(entry.entryId)!.after } : entry) }, before: { changed: 0 }, after: { changed: changes.length, amount: effect.amount }, target: { siteIds: siteId === null ? [] : [siteId], sparkChanges: changes } };
      }
      if (journey.deck.length < effect.minimumDeckSize) return null;
      const eligible = present.flatMap((gain) => {
        const entry = current.get(gain.entry.entryId)!;
        if (entry.transfiguration !== null) return [];
        const card = journeyTransfigurationCard(entry);
        if (card === null) throw new Error("Gained journey card content is unavailable.");
        return card.forms.length === 0 ? [] : [{ gain, forms: card.forms }];
      });
      if (eligible.length === 0) return null;
      const transformations = eligible.map(({ gain, forms }) => {
        const draw = random();
        return { entryId: gain.entry.entryId, cardId: gain.cardId, type: forms[Math.floor(draw.value * forms.length)], applicableForms: forms, drawIndex: draw.drawIndex };
      });
      const byId = new Map(transformations.map((change) => [change.entryId, change.type]));
      return { journey: { ...journey, deck: journey.deck.map((entry) => byId.has(entry.entryId) ? { ...entry, transfiguration: byId.get(entry.entryId)! } : entry) }, before: { transformed: 0, deckSize: journey.deck.length }, after: { transformed: transformations.length, deckSize: journey.deck.length }, target: { siteIds: siteId === null ? [] : [siteId], transfigurations: transformations } };
    },
  };
}
