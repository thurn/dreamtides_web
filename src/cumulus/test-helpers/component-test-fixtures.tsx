import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { assertLocalized } from "@trox/runtime";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { GameCardModel } from "../components/card/CardView";
import { CumulusRoot } from "../CumulusRoot";

export function mountCumulus(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

export function syntheticGameCard(
  index = 1,
  name = `Card ${String(index)}`,
): GameCardModel {
  const id = asCardId(
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const displaySnapshot: CardData = {
    id,
    name: asCardName(name),
    cardNumber: index,
    cardType: "Character",
    subtype: "",
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
  portraitAlt: assertLocalized("Guide"),
  speakerName: assertLocalized("Guide"),
  text: assertLocalized("Guidance"),
};
