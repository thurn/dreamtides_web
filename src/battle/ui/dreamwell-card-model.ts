import type { DreamwellCardModel } from "../../cumulus/components/battle/DreamwellCard";
import { asCardId } from "../../types/card-identity";
import type { DreamwellCardDefinition } from "../types";

/**
 * Map the shared battle definition to the complete canonical Dreamwell card
 * display model. The definition UUID remains the component identity; display
 * copy is carried only in the resolved snapshot.
 */
export function dreamwellCardModel(
  definition: DreamwellCardDefinition,
): DreamwellCardModel {
  const cardId = asCardId(definition.id);
  return {
    cardId,
    displaySnapshot: {
      id: cardId,
      name: definition.name,
      renderedText: definition.renderedText,
      energyAdded: definition.energyAdded,
      imageNumber: definition.imageNumber,
      ...(definition.art === undefined ? {} : { art: definition.art }),
    },
  };
}
