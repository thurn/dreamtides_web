import type { JourneyContent } from "../../data/journey-content";
import type { EngineCatalog } from "../../engine/catalog";
import { resolveDeckEntryCard } from "../../card-type-change";
import { eligibleTransfigurations, offeredTransfigurationForms } from "../../transfiguration/transfiguration-logic";
import { appendDeckEntryTransfiguration, deckEntryTransfigurationVariant, isDeckEntryTransfigurationRecord } from "../../transfiguration/deck-entry-transfigurations";
import { eligibleEngineTransfigurations } from "../../engine/transfigurations";
import type { JourneyTransfigurationProvider } from "../../rules/journey/journey-transfiguration";
import { journeyContentEngine } from "./battle-init-provider";

/** Captured immutable source is the authority for complete chronological records. */
export function createJourneyTransfigurationProvider(content: JourneyContent, source: EngineCatalog = journeyContentEngine(content).catalog): JourneyTransfigurationProvider {
  const validateRecord: NonNullable<JourneyTransfigurationProvider["validateRecord"]> = entry => {
    if (!isDeckEntryTransfigurationRecord(entry)) return false;
    if (!("transfigurationApplications" in entry)) return true;
    const card = content.cardDatabase.get(entry.cardNumber);
    if (card === undefined) return false;
    try { return deckEntryTransfigurationVariant(source.card(card.id), card, entry, content.transfigurationData).ok; } catch { return false; }
  };
  return { validateRecord, apply(entry, form) {
    if (!validateRecord(entry)) return { ok: false, reason: "invalid_record" };
    const card = content.cardDatabase.get(entry.cardNumber);
    if (card === undefined) return { ok: false, reason: "unavailable_content" };
    try { return appendDeckEntryTransfiguration(content.transfigurationData, card, source.card(card.id), entry, form); }
    catch { return { ok: false, reason: "unavailable_content" }; }
  }, resolve(entry) {
    if (!validateRecord(entry)) return null;
    const base = content.cardDatabase.get(entry.cardNumber);
    if (base === undefined) return null;
    const card = resolveDeckEntryCard(content.transfigurationData, base, entry);
    let applicableForms: ReturnType<typeof eligibleEngineTransfigurations> = [];
    try {
      const variant = deckEntryTransfigurationVariant(source.card(base.id), base, entry, content.transfigurationData);
      if (variant.ok) applicableForms = eligibleEngineTransfigurations(source.card(base.id), { ...variant.value, transfigurationApplications: variant.value.transfigurationApplications ?? [] }).filter(form => content.transfigurationData.forms.some(definition => definition.id === form));
    } catch { /* Legacy display remains available when structural append is unsupported. */ }
    return { cardId: base.id, cardType: card.cardType, subtype: card.subtype,
      starter: base.isStarter === true || base.roles?.includes("starter-deck") === true,
      perfectedEligible: entry.transfiguration === null && eligibleTransfigurations(content.transfigurationData, card).includes("Perfected"),
      applicableForms,
      forms: entry.transfiguration === null ? offeredTransfigurationForms(content.transfigurationData, card, null).map(offer => offer.type) : [] };
  } };
}
