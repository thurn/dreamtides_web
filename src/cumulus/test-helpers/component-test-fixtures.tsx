import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { GameCardModel } from "../components/card/CardView";
import {
  testCardId,
  testCardSubtype,
} from "../../types/test-identities";

export function syntheticGameCard(
  index = 1,
  name = `Card ${String(index)}`,
): GameCardModel {
  const id = testCardId(
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const displaySnapshot: CardData = {
    id,
    name: parseCardName(name),
    cardNumber: index,
    cardType: "Character",
    subtype: testCardSubtype(""),
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: index,
    artOwned: true,
  };
  return { cardId: id, displaySnapshot };
}

export const fixtureDialogue = {
  portrait: { kind: "character-portrait", characterId: "mira" } as const,
  portraitAlt: "Guide",
  speakerName: "Guide",
  text: "Guidance",
};
