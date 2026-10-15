import { expectedVerifiedText } from "../dsl/verified-text";
import { parseGlossaryEntryId } from "../../types/identifiers";
import type { TransfigurationType } from "../../types/journey";
import { TRANSFIGURATION_RULES } from "../../content/transfiguration";
import type { EngineTransfigurationDefinition, TransfigurationCard } from "../transfigurations";

/** The dispatcher supplies its ordered catalog, so composition has one source of order. */
export function createPerfected(forms: readonly EngineTransfigurationDefinition[]) {
  const constituents = (card: TransfigurationCard) => forms.filter(form => form.eligible(card));
  const minimum = TRANSFIGURATION_RULES.perfected.minimumEligibleForms;
  const eligible = (card: TransfigurationCard) => constituents(card).length >= minimum;
  return {
    id: "Perfected", uuid: parseGlossaryEntryId("22adf539-d2c9-4f33-9416-159d03a220ad"),
    verifiedText: expectedVerifiedText("Apply every available transfiguration"),
    eligible, constituents,
    transform(card: TransfigurationCard, selected = constituents(card), explicit: readonly TransfigurationType[] = []): TransfigurationCard {
      if (selected.length < minimum) return card;
      return forms.reduce((current, form) => selected.includes(form) || explicit.includes(form.id) && form.eligible(current) ? form.transform(current) : current, card);
    },
  } satisfies EngineTransfigurationDefinition & { readonly constituents: typeof constituents };
}
