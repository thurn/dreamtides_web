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
export const ENGINE_TRANSFIGURATIONS: readonly EngineTransfigurationDefinition[] = [empowered, amplified, kindled, inspired, enduring, hastened, resonant];

function prepared(card: EngineCardDefinition, variant: Variant): TransfigurationCard {
  const useAmplified = variant.amplified || variant.transfigurations?.includes("Amplified") === true && card.transfiguration?.amplified === true;
  const effective = useAmplified === variant.amplified ? variant : { ...variant, amplified: useAmplified };
  return { ...card, abilities: card.abilities(effective), resonantChange: card.transfiguration?.resonant[useAmplified ? "amplified" : "base"] ?? null };
}

/** Owned supported forms eligible for the current printed definition and authored variant. */
export function eligibleEngineTransfigurations(card: EngineCardDefinition, variant: Variant = BASE_VARIANT): readonly TransfigurationType[] {
  const base = prepared(card, variant);
  return ENGINE_TRANSFIGURATIONS.filter(form => form.eligible(base)).map(form => form.id);
}

/** Resolve once from a reusable source definition; returned abilities belong to this tuple. */
export function applyEngineTransfigurations(card: EngineCardDefinition, variant: Variant): PrintedCard {
  if (!variant.transfigurations?.some(type => ENGINE_TRANSFIGURATIONS.some(form => form.id === type))) return card;
  let result = prepared(card, variant);
  for (const form of ENGINE_TRANSFIGURATIONS) {
    if (variant.transfigurations?.includes(form.id) === true && form.eligible(result)) result = form.transform(result);
  }
  const { resonantChange: _change, abilities, ...definition } = result;
  return { ...definition, abilities: () => abilities };
}
