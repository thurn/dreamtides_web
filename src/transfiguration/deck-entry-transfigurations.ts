/** Complete journey records, certified by engine source and projected with shared text primitives. */
import type { EngineCardDefinition, PrintedCard } from "../engine/catalog";
import { BASE_VARIANT, type Variant } from "../engine/dsl/types";
import { appendEngineTransfiguration, applyEngineTransfigurations } from "../engine/transfigurations";
import { copyTransfigurationApplications, isTransfigurationApplications } from "../engine/transfiguration-application-data";
import { deckEntryIdFromUnknown } from "../types/identifiers";
import type { DeckEntry, TransfigurationType } from "../types/journey";
import type { CardData } from "../types/cards";
import type { TransfigurationData, TransfigurationPresentation } from "../types/transfiguration-data";
import { applyTransfigurationToCard, buildTransfigurationDisplay, buildTransfigurationStepsDisplay } from "./transfiguration-logic";
import { transfigurationForm } from "../data/transfiguration-data";

export type TransfigurationRecordResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: "invalid_record" | "unavailable_content" | "incompatible_legacy" | "inapplicable_form" };

/** Absence intentionally delegates legacy shape validation to existing ingress. */
export function isDeckEntryTransfigurationRecord(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !("transfigurationApplications" in value)) return true;
  if (!("entryId" in value) || deckEntryIdFromUnknown(value.entryId) === null || !("cardNumber" in value) || !Number.isSafeInteger(value.cardNumber) || Number(value.cardNumber) < 0 || !("transfiguration" in value)) return false;
  const applications = value.transfigurationApplications;
  return isTransfigurationApplications(applications) && applications.length > 0 && value.transfiguration === applications[0].form;
}

function printedValue(card: PrintedCard, variant: Variant): string {
  return JSON.stringify([card.costs, card.spark, card.cardType, card.subtype, card.speed, card.abilities(variant)]);
}

/** Actual source is required: CardData text cannot certify structural abilities. */
export function deckEntryTransfigurationVariant(definition: EngineCardDefinition, card: CardData, entry: Readonly<DeckEntry>, data: TransfigurationData): TransfigurationRecordResult<Variant> {
  if (!isDeckEntryTransfigurationRecord(entry)) return { ok: false, reason: "invalid_record" };
  if (definition.id !== card.id || entry.cardNumber !== card.cardNumber) return { ok: false, reason: "unavailable_content" };
  try {
    if (entry.transfigurationApplications !== undefined) {
      const value: Variant = { amplified: false, transfigurationApplications: copyTransfigurationApplications(entry.transfigurationApplications) };
      applyEngineTransfigurations(definition, value);
      return { ok: true, value };
    }
    if (entry.transfiguration === null) return { ok: true, value: BASE_VARIANT };
    const value = appendEngineTransfiguration(definition, BASE_VARIANT, entry.transfiguration);
    const legacy: Variant = { amplified: entry.transfiguration === "Amplified", transfigurations: [entry.transfiguration] };
    const canonical = applyEngineTransfigurations(definition, value);
    const previous = applyEngineTransfigurations(definition, legacy);
    const projected = resolveDeckEntryTransfigurations(data, card, { ...entry, transfigurationApplications: value.transfigurationApplications });
    if (printedValue(canonical, value) !== printedValue(previous, legacy) || JSON.stringify(projected) !== JSON.stringify(applyTransfigurationToCard(data, card, entry.transfiguration))) return { ok: false, reason: "incompatible_legacy" };
    return { ok: true, value };
  } catch {
    return { ok: false, reason: entry.transfigurationApplications === undefined ? "incompatible_legacy" : "invalid_record" };
  }
}

/** Immutable one-step append; failure has no random draw, partial record or source mutation. */
export function appendDeckEntryTransfiguration(data: TransfigurationData, card: CardData, definition: EngineCardDefinition, entry: Readonly<DeckEntry>, form: TransfigurationType): TransfigurationRecordResult<DeckEntry> {
  const current = deckEntryTransfigurationVariant(definition, card, entry, data);
  if (!current.ok) return current;
  try {
    const next = appendEngineTransfiguration(definition, current.value, form);
    const applications = copyTransfigurationApplications(next.transfigurationApplications!);
    return { ok: true, value: { ...entry, transfiguration: applications[0].form, transfigurationApplications: applications } };
  } catch { return { ok: false, reason: "inapplicable_form" }; }
}

/** Guarded presentation replay only; semantic ingress uses the source provider. */
export function resolveDeckEntryTransfigurations(data: TransfigurationData, card: CardData, entry: Readonly<DeckEntry>): CardData {
  if (!("transfigurationApplications" in entry)) return entry.transfiguration === null ? card : applyTransfigurationToCard(data, card, entry.transfiguration);
  if (!isDeckEntryTransfigurationRecord(entry)) throw new Error("Invalid journey transfiguration record");
  return entry.transfigurationApplications!.reduce((current, application) => {
    const steps = application.form === "Perfected" ? application.constituents : [application.form];
    return steps.reduce((result, form) => applyTransfigurationToCard(data, result, form), current);
  }, card);
}

function presentation(form: ReturnType<typeof transfigurationForm>): TransfigurationPresentation {
  const { name, description, glyph, accentColor, tintColor } = form;
  return { name, description, glyph, accentColor, tintColor };
}

/** Primary appearance with complete repeated application and Perfected constituent metadata. */
export function buildDeckEntryTransfigurationDisplay(data: TransfigurationData, card: CardData, entry: Readonly<DeckEntry>) {
  if (!("transfigurationApplications" in entry)) return entry.transfiguration === null ? null : buildTransfigurationDisplay(data, card, entry.transfiguration);
  if (!isDeckEntryTransfigurationRecord(entry)) throw new Error("Invalid journey transfiguration record");
  const applications = copyTransfigurationApplications(entry.transfigurationApplications!);
  const steps = applications.flatMap(application => application.form === "Perfected" ? application.constituents : [application.form]);
  const result = buildTransfigurationStepsDisplay(data, card, applications[0].form, steps);
  return { card: result.card, display: { ...result.display, applications: applications.map(application => ({ application, form: presentation(transfigurationForm(data, application.form)), ...(application.form === "Perfected" ? { constituents: application.constituents.map(form => presentation(transfigurationForm(data, form))) } : {}) })) } };
}

/** Administrative replacement and before-image construction discard the complete prior record. */
export function clearDeckEntryTransfigurations(entry: Readonly<DeckEntry>): DeckEntry {
  const { transfigurationApplications: _applications, ...rest } = entry;
  return { ...rest, transfiguration: null };
}
