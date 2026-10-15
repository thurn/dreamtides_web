/** Chronological composition of the catalog's landed form operations. */
import type { EngineCardDefinition, PrintedCard } from "./catalog";
import { namedTriggersOf } from "./dsl/abilities";
import type { ConstituentTransfiguration, TransfigurationApplication, Variant } from "./dsl/types";
import type { TransfigurationType } from "../types/journey";
import type { EngineTransfigurationDefinition, TransfigurationCard } from "./transfigurations";
import { copyTransfigurationApplications, isTransfigurationApplications, type TransfigurationPrefixState } from "./transfiguration-application-data";
import { TRANSFIGURATION_RULES } from "../content/transfiguration";

function same(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function invalid(): never { throw new Error("Invalid or unsupported transfiguration applications"); }

/** The table is owned by a catalog, keyed by a complete primitive prefix and authored selection. */
function tableState(card: EngineCardDefinition, variant: Variant, steps: readonly ConstituentTransfiguration[]) {
  if (card.transfigurationStates === undefined) return undefined;
  return card.transfigurationStates.find(state => state.initiallyAmplified === variant.amplified && state.typeRemap === variant.typeRemap && same(state.steps, steps)) ?? invalid();
}

function fold(card: EngineCardDefinition, variant: Variant, forms: readonly EngineTransfigurationDefinition[]) {
  if (variant.transfigurations !== undefined || !isTransfigurationApplications(variant.transfigurationApplications)) invalid();
  if (card.transfiguration !== undefined && card.transfigurationState === undefined && card.transfigurationStates === undefined) invalid();
  const sourceVariant: Variant = { amplified: variant.amplified, ...(variant.typeRemap === undefined ? {} : { typeRemap: variant.typeRemap }) };
  let current: TransfigurationCard = { ...card, abilities: card.abilities(sourceVariant), resonantChange: null };
  const steps: ConstituentTransfiguration[] = [], states: TransfigurationPrefixState[] = [];
  const refresh = () => {
    const transported = tableState(card, variant, steps);
    const metadata = card.transfigurationState?.(variant.amplified, steps) ?? transported ?? { amplified: false, resonant: null };
    current = { ...current, resonantChange: metadata.resonant?.change ?? null,
      transfiguration: { amplified: metadata.amplified, resonant: { base: metadata.resonant?.change ?? null, amplified: metadata.resonant?.change ?? null } } };
    const eligible = transported?.eligible ?? forms.filter(form => form.eligible(current)).map(form => form.id as ConstituentTransfiguration);
    states.push({ initiallyAmplified: variant.amplified, ...(variant.typeRemap === undefined ? {} : { typeRemap: variant.typeRemap }), steps: [...steps], eligible: [...eligible], amplified: metadata.amplified, resonant: metadata.resonant });
    return { metadata, eligible };
  };
  let state = refresh();
  const apply = (id: ConstituentTransfiguration) => {
    const form = forms.find(form => form.id === id) ?? invalid();
    if (id === "Amplified") {
      current = { ...current, abilities: card.abilities({ ...sourceVariant, amplified: true }) };
    } else if (id === "Resonant" && state.metadata.resonant !== null) {
      const selection = state.metadata.resonant;
      if (card.transfigurationStates === undefined && card.status === "authored") {
        const candidates = current.abilities.flatMap((ability, index) => {
          if (selection.change !== "oncePerTurn") return namedTriggersOf([ability]).includes(selection.change) ? [index] : [];
          const projected = form.transform({ ...current, abilities: [ability] }).abilities[0];
          return projected !== ability ? [index] : [];
        });
        if (candidates.length !== selection.count || selection.ordinal < 0 || candidates[selection.ordinal] === undefined) invalid();
        const target = candidates[selection.ordinal];
        const replacement = form.transform({ ...current, abilities: [current.abilities[target]] }).abilities[0];
        current = { ...current, abilities: current.abilities.map((ability, index) => index === target ? replacement : ability) };
      }
      // D36 sources have no original authored instruction; their source metadata still advances.
    } else current = form.transform(current);
    steps.push(id);
    state = refresh();
  };
  for (const application of variant.transfigurationApplications) {
    if (application.form === "Perfected") {
      if (state.eligible.length < TRANSFIGURATION_RULES.perfected.minimumEligibleForms || !same(application.constituents, state.eligible)) invalid();
      for (const form of application.constituents) apply(form);
    } else {
      if (!state.eligible.includes(application.form)) invalid();
      apply(application.form);
    }
  }
  return { current, states, eligible: state.eligible };
}

export function resolveTransfigurationApplications(card: EngineCardDefinition, variant: Variant, forms: readonly EngineTransfigurationDefinition[]): PrintedCard {
  const { resonantChange: _change, abilities, ...definition } = fold(card, variant, forms).current;
  return { ...definition, abilities: () => abilities };
}
export function eligibleTransfigurationApplications(card: EngineCardDefinition, variant: Variant, forms: readonly EngineTransfigurationDefinition[]): readonly TransfigurationType[] {
  const { eligible } = fold(card, variant, forms);
  return [...eligible, ...(eligible.length < TRANSFIGURATION_RULES.perfected.minimumEligibleForms ? [] : ["Perfected" as const])];
}
/** Canonical transport is produced from actual source execution, never a caller's snapshot claim. */
export function transfigurationApplicationStates(card: EngineCardDefinition, variant: Variant, forms: readonly EngineTransfigurationDefinition[]): readonly TransfigurationPrefixState[] {
  return fold(card, variant, forms).states;
}
/** Immutable append captures the current eligible set before executing one Perfected occasion. */
export function appendTransfigurationApplication(card: EngineCardDefinition, variant: Variant, form: TransfigurationType, forms: readonly EngineTransfigurationDefinition[]): Variant {
  const ordered = variant.transfigurationApplications === undefined ? { ...variant, transfigurationApplications: [] } : variant;
  const { eligible } = fold(card, ordered, forms);
  let application: TransfigurationApplication;
  if (form === "Perfected") {
    if (eligible.length < TRANSFIGURATION_RULES.perfected.minimumEligibleForms) invalid();
    application = { form, constituents: [...eligible] };
  } else {
    if (!eligible.includes(form)) invalid();
    application = { form };
  }
  const result = { ...ordered, transfigurationApplications: [...copyTransfigurationApplications(ordered.transfigurationApplications ?? []), application] };
  fold(card, result, forms);
  return result;
}
