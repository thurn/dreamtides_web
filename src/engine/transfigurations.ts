import { resolveTransfigurationApplications, eligibleTransfigurationApplications, appendTransfigurationApplication, transfigurationApplicationStates } from "./transfiguration-applications";
/** The fixed catalog of structural form operations, before permanent deck modifications. */
import type { EngineCardDefinition, PrintedCard } from "./catalog";
import type { Ability, Variant } from "./dsl/types";
import { BASE_VARIANT } from "./dsl/types";
import type { GlossaryEntryId } from "../types/identifiers";
import type { TransfigurationType } from "../types/journey";
import type { ResonantChange } from "../transfiguration/transfiguration-logic";
import { empowered } from "./transfigurations/empowered";
import { amplified } from "./transfigurations/amplified";
import { kindled } from "./transfigurations/kindled";
import { inspired } from "./transfigurations/inspired";
import { enduring } from "./transfigurations/enduring";
import { hastened } from "./transfigurations/hastened";
import { resonant } from "./transfigurations/resonant";
import { attuned } from "./transfigurations/attuned";
import { createPerfected } from "./transfigurations/perfected";

export interface TransfigurationMetadata {
  readonly amplified: boolean;
  readonly resonant: { readonly base: ResonantChange | null; readonly amplified: ResonantChange | null };
}

export interface TransfigurationCard extends Omit<PrintedCard, "abilities"> {
  readonly abilities: readonly Ability[];
  readonly resonantChange: ResonantChange | null;
}

export interface EngineTransfigurationDefinition {
  readonly id: TransfigurationType;
  readonly uuid: GlossaryEntryId;
  readonly verifiedText: string;
  readonly eligible: (card: TransfigurationCard) => boolean;
  readonly transform: (card: TransfigurationCard) => TransfigurationCard;
}

/** Catalog order; later form owners add only their own definition. */
const constituentForms: readonly EngineTransfigurationDefinition[] = [empowered, amplified, kindled, inspired, enduring, hastened, resonant, attuned];
const perfected = createPerfected(constituentForms);
export const ENGINE_TRANSFIGURATIONS: readonly EngineTransfigurationDefinition[] = [...constituentForms, perfected];

function prepared(card: EngineCardDefinition, variant: Variant): TransfigurationCard {
  const useAmplified = variant.amplified || variant.transfigurations?.includes("Amplified") === true && card.transfiguration?.amplified === true;
  const effective = useAmplified === variant.amplified ? variant : { ...variant, amplified: useAmplified };
  return { ...card, transfiguration: card.transfiguration === undefined ? undefined : { ...card.transfiguration, amplified: card.transfiguration.amplified && !useAmplified }, abilities: card.abilities(effective), resonantChange: card.transfiguration?.resonant[useAmplified ? "amplified" : "base"] ?? null };
}

/** Owned supported forms eligible for the current printed definition and authored variant. */
export function eligibleEngineTransfigurations(card: EngineCardDefinition, variant: Variant = BASE_VARIANT): readonly TransfigurationType[] {
  if (variant.transfigurationApplications !== undefined) return eligibleTransfigurationApplications(card, variant, constituentForms);
  const base = prepared(card, variant);
  return ENGINE_TRANSFIGURATIONS.filter(form => form.eligible(base)).map(form => form.id);
}

/** Resolve once from a reusable source definition; returned abilities belong to this tuple. */
export function applyEngineTransfigurations(card: EngineCardDefinition, variant: Variant): PrintedCard {
  if (variant.transfigurationApplications !== undefined) return resolveTransfigurationApplications(card, variant, constituentForms);
  if (!variant.transfigurations?.some(type => ENGINE_TRANSFIGURATIONS.some(form => form.id === type))) return card;
  let result = prepared(card, variant);
  if (variant.transfigurations.includes("Perfected") && perfected.eligible(result)) {
    // Capture before an authored Amplified replacement changes available abilities.
    const selected = perfected.constituents(result);
    if (selected.includes(amplified)) result = prepared(card, { ...variant, amplified: true });
    result = perfected.transform(result, selected, variant.transfigurations);
  } else {
    for (const form of constituentForms) {
      if (variant.transfigurations.includes(form.id) && form.eligible(result)) result = form.transform(result);
    }
  }
  const { resonantChange: _change, abilities, ...definition } = result;
  return { ...definition, abilities: () => abilities };
}

/** Append one additional application to the complete ordered tuple. */
export function appendEngineTransfiguration(card: EngineCardDefinition, variant: Variant, form: TransfigurationType): Variant {
  return appendTransfigurationApplication(card, variant, form, constituentForms);
}

/** Catalog-owned canonical primitive-prefix metadata for worker transport. */
export function engineTransfigurationApplicationStates(card: EngineCardDefinition, variant: Variant) {
  return transfigurationApplicationStates(card, variant, constituentForms);
}
