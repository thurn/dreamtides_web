import { captureJourneyLoopSources, type JourneyLoopSource } from "./journey-loop-source";
import type { JourneyContent } from "../../data/journey-content";
import type { EngineCatalog } from "../../engine/catalog";
import { resolveDeckEntryCard } from "../../card-type-change";
import { eligibleTransfigurations, offeredTransfigurationForms } from "../../transfiguration/transfiguration-logic";
import { appendDeckEntryTransfiguration, deckEntryTransfigurationVariant, isDeckEntryTransfigurationRecord } from "../../transfiguration/deck-entry-transfigurations";
import { eligibleEngineTransfigurations } from "../../engine/transfigurations";
import type { JourneyTransfigurationProvider } from "../../rules/journey/journey-transfiguration";
import { journeyContentEngine } from "./journey-content-engine";

import type { CardId } from "../../types/card-identity";
const providerSources = new WeakMap<JourneyTransfigurationProvider, ReadonlyMap<CardId, JourneyLoopSource>>();
/** Query exact factory-owned executors; no registration/sealing API is exposed. */
export function journeyLoopProviderSource(provider: JourneyTransfigurationProvider, cardId: CardId): JourneyLoopSource | undefined {
  return providerSources.get(provider)?.get(cardId);
}

/** Captured immutable source is the authority for complete chronological records. */
export function createJourneyTransfigurationProvider(content: JourneyContent, source: EngineCatalog = journeyContentEngine(content).catalog): JourneyTransfigurationProvider {
  const snapshots = captureJourneyLoopSources(content, source);
  const capturedCards = new Map([...snapshots.values()].map(snapshot => [snapshot.card.cardNumber, snapshot.card]));
  const cardFor = (entry: Parameters<JourneyTransfigurationProvider["resolve"]>[0]) => {
    const original = capturedCards.get(entry.cardNumber) ?? content.cardDatabase.get(entry.cardNumber);
    return original === undefined ? undefined : snapshots.get(original.id)?.card ?? original;
  };
  const definitionFor = (card: NonNullable<ReturnType<typeof cardFor>>) => snapshots.get(card.id)?.definition ?? source.card(card.id);
  const dataFor = (card: NonNullable<ReturnType<typeof cardFor>>) => snapshots.get(card.id)?.data ?? content.transfigurationData;
  const validateRecord: NonNullable<JourneyTransfigurationProvider["validateRecord"]> = entry => {
    if (!isDeckEntryTransfigurationRecord(entry)) return false;
    if (!("transfigurationApplications" in entry)) return true;
    const card = cardFor(entry);
    if (card === undefined) return false;
    try { return deckEntryTransfigurationVariant(definitionFor(card), card, entry, dataFor(card)).ok; } catch { return false; }
  };
  const provider: JourneyTransfigurationProvider = { validateRecord, apply(entry, form) {
    if (!validateRecord(entry)) return { ok: false, reason: "invalid_record" };
    const card = cardFor(entry);
    if (card === undefined) return { ok: false, reason: "unavailable_content" };
    try { return appendDeckEntryTransfiguration(dataFor(card), card, definitionFor(card), entry, form); }
    catch { return { ok: false, reason: "unavailable_content" }; }
  }, resolve(entry) {
    if (!validateRecord(entry)) return null;
    const base = cardFor(entry);
    if (base === undefined) return null;
    const card = resolveDeckEntryCard(dataFor(base), base, entry);
    let applicableForms: ReturnType<typeof eligibleEngineTransfigurations> = [];
    try {
      const variant = deckEntryTransfigurationVariant(definitionFor(base), base, entry, dataFor(base));
      if (variant.ok) applicableForms = eligibleEngineTransfigurations(definitionFor(base), { ...variant.value, transfigurationApplications: variant.value.transfigurationApplications ?? [] }).filter(form => dataFor(base).forms.some(definition => definition.id === form));
    } catch { /* Legacy display remains available when structural append is unsupported. */ }
    return { cardId: base.id, cardType: card.cardType, subtype: card.subtype,
      starter: base.isStarter === true || base.roles?.includes("starter-deck") === true,
      perfectedEligible: entry.transfiguration === null && eligibleTransfigurations(dataFor(base), card).includes("Perfected"),
      applicableForms,
      forms: entry.transfiguration === null ? offeredTransfigurationForms(dataFor(base), card, null).map(offer => offer.type) : [] };
  } };
  Object.freeze(provider);
  providerSources.set(provider, snapshots);
  return provider;
}
