import { TRANSFIGURATION_RULES } from "../../content/transfiguration";
/** Closed default-source capture. This snapshot is also the provider's actual executor. */
import type { JourneyContent } from "../../data/journey-content";
import type { EngineCardDefinition, EngineCatalog } from "../../engine/catalog";
import { energy, energyX } from "../../engine/dsl/builders";
import type { Variant } from "../../engine/dsl/types";
import { appendEngineTransfiguration, eligibleEngineTransfigurations, ENGINE_TRANSFIGURATIONS } from "../../engine/transfigurations";
import type { CardData } from "../../types/cards";
import type { CardId } from "../../types/card-identity";
import type { TransfigurationData } from "../../types/transfiguration-data";
import { canonicalTransfigurationText } from "../../transfiguration/canonical-transfiguration-source";
import { applyTransfigurationToCard } from "../../transfiguration/transfiguration-logic";
import { TRANSFIGURE_MARK_START, TRANSFIGURE_MARK_END } from "../../runtime/transfigure-markers";
import { journeySourceOrigin } from "./journey-content-engine";

// Captured during static module initialization, before caller-supplied producers execute.
const canonicalRules = JSON.stringify(plain(TRANSFIGURATION_RULES));
const canonicalForms = ENGINE_TRANSFIGURATIONS.map(form => ({ form, descriptors: Object.getOwnPropertyDescriptors(form) }));
export function journeyLoopFormsIntact(): boolean {
  try { if (JSON.stringify(plain(TRANSFIGURATION_RULES)) !== canonicalRules) return false; } catch { return false; }
  return ENGINE_TRANSFIGURATIONS.length === canonicalForms.length && canonicalForms.every(({ form, descriptors }, index) => {
    if (ENGINE_TRANSFIGURATIONS[index] !== form || Reflect.ownKeys(form).length !== Reflect.ownKeys(descriptors).length) return false;
    return Reflect.ownKeys(descriptors).every(key => {
      const current = Object.getOwnPropertyDescriptor(form, key), original = Reflect.get(descriptors, key) as PropertyDescriptor;
      return current !== undefined && "value" in current && current.value === original.value;
    });
  });
}

/** Clone data, rejecting executable values, accessors, prototypes and cycles. */
function plain<T>(value: T, active = new Set<object>()): T {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || active.has(value)) throw new TypeError("Opaque journey source");
  if (Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype)) throw new TypeError("Opaque journey source prototype");
  active.add(value);
  const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    if (typeof key !== "string") throw new TypeError("Opaque journey source key");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor)) throw new TypeError("Opaque journey source accessor");
    Object.defineProperty(result, key, { value: plain(descriptor.value, active), enumerable: true });
  }
  active.delete(value);
  return Object.freeze(result) as T;
}

export interface JourneyLoopSource {
  readonly definition: EngineCardDefinition;
  readonly card: CardData;
  readonly data: TransfigurationData;
}

/** The canonical Resonant source removes one of these finite literal candidates per step. */
function measure(text: string): number {
  const clean = text.split(TRANSFIGURE_MARK_START).join("").split(TRANSFIGURE_MARK_END).join("");
  return [...clean.matchAll(/once per turn/gi)].length + [...clean.matchAll(/▸Dawn(?=[:,])|▸Materialized:/g)].length;
}
function validSpines(source: JourneyLoopSource): boolean {
  const { definition, card, data } = source;
  for (const amplified of [false, true]) {
    let variant = { amplified, transfigurationApplications: [] } as Parameters<typeof appendEngineTransfiguration>[1];
    let current = { ...card, renderedText: amplified ? card.amplifiedText ?? card.renderedText : card.renderedText };
    while (eligibleEngineTransfigurations(definition, variant).includes("Resonant")) {
      const before = measure(current.renderedText);
      variant = appendEngineTransfiguration(definition, variant, "Resonant");
      current = applyTransfigurationToCard(data, current, "Resonant");
      if (before <= 0 || measure(current.renderedText) >= before) return false;
    }
  }
  return true;
}

/** Only a normal constructor-owned post-catalog definition can enter this capture. */
export function captureJourneyLoopSources(content: JourneyContent, catalog: EngineCatalog): ReadonlyMap<CardId, JourneyLoopSource> {
  const captured = new Map<CardId, JourneyLoopSource>();
  if (!journeyLoopFormsIntact()) return captured;
  let data: TransfigurationData;
  try { data = plain(content.transfigurationData); } catch { return captured; }
  const occurrences = new Map<CardId, number>();
  for (const card of content.cardDatabase.values()) occurrences.set(card.id, (occurrences.get(card.id) ?? 0) + 1);
  for (const [number, input] of content.cardDatabase) {
    try {
      if (number !== input.cardNumber || !Number.isSafeInteger(number) || number < 0 || occurrences.get(input.id) !== 1 || !["Character", "Event"].includes(input.cardType) || typeof input.renderedText !== "string" || input.amplifiedText !== undefined && typeof input.amplifiedText !== "string") continue;
      const origin = journeySourceOrigin(catalog, input.id);
      if (origin === undefined) continue;
      const original = origin.definition;
      const labels = input.energyCosts ?? [input.energyCost === null ? "X" : String(input.energyCost)];
      const costs = labels.map(label => label === "X" ? energyX() : energy(Number(label)));
      const spark = input.cardType !== "Character" ? null : input.sparkVariable === true ? "x" : input.spark ?? 0;
      const speed = input.isInterrupt === true ? "interrupt" : input.isFast ? "fast" : "standard";
      if (original.id !== input.id || original.cardType !== (input.cardType === "Character" ? "character" : "event") || original.subtype !== input.subtype || original.spark !== spark || original.speed !== speed || (JSON.stringify(original.costs) !== JSON.stringify(costs) && JSON.stringify(original.costs) !== JSON.stringify(labels.map(label => label === "X" ? energyX(0) : energy(Number(label)))))) continue;
      if (original.synthetic !== undefined || original.transfigurationStates !== undefined) continue;
      const text = canonicalTransfigurationText(original.transfigurationState);
      if (!origin.textless && (text === undefined || text.original !== input.renderedText || text.authored !== input.amplifiedText)) continue;
      const card = plain(input);
      const base = plain(original.abilities({ amplified: false }));
      const authored = plain(original.abilities({ amplified: true }));
      if (![base, authored].every(value => Array.isArray(value))) continue;
      if (!journeyLoopFormsIntact() || journeySourceOrigin(catalog, input.id) !== origin) continue;
      const { abilities: _abilities, transfigurationState, ...fields } = original;
      const definition: EngineCardDefinition = Object.freeze({ ...plain(fields), ...(transfigurationState === undefined ? {} : { transfigurationState }), abilities: (variant: Variant) => variant.amplified ? authored : base });
      const source = Object.freeze({ definition, card, data });
      if (validSpines(source) && journeyLoopFormsIntact()) captured.set(card.id, source);
    } catch { /* Unsupported sources retain the ordinary provider path. */ }
  }
  return captured;
}

