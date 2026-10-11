import { activated, energy, keyword, self } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Clifftop Marksman",
  mtgName: "Gingerbrute",
  id: "629fe4d4-826f-41b9-a913-458a503856a8",
  renderedText:
    "Awakened\n\n❖ – 1●: Move this character to an unoccupied character position.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "tutorial"],
  imageNumber: 2521694539,
  artOwned: false,
  cardNumber: 381,
  art: { x: 0.252, y: 0, scale: 1.17 },
  isStarter: false,
  verifiedText: "1nil7k8siwl",
  abilities: () => [keyword("awakened"), activated([energy(1)], p.move(self()), { speed: "fast" })],
});
