import type { DreamwellCardModel } from "../../cumulus/components/battle/DreamwellCard";
import type { DreamwellCardDefinition } from "../types";
import { localizedSourceText } from "../../runtime/localization/runtime";

/**
 * Map the shared battle definition to the complete canonical Dreamwell card
 * display model. The definition UUID remains the component identity; display
 * copy is carried only in the resolved snapshot.
 */
export function dreamwellCardModel(
  definition: DreamwellCardDefinition,
): DreamwellCardModel {
  const cardId = definition.id;
  return {
    cardId,
    displaySnapshot: {
      id: cardId,
      name: localizedSourceText(definition.name),
      renderedText: localizedSourceText(definition.renderedText),
      energyAdded: definition.energyAdded,
      imageNumber: definition.imageNumber,
      ...(definition.art === undefined ? {} : { art: definition.art }),
    },
  };
}
