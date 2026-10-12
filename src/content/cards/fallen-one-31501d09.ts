import { activated, discardCost, energyX, self, x } from "../../engine/dsl/builders";
import { untilEndOfTurn } from "../../engine/dsl/triggers";
import { gainSpark, move } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Fallen One",
  mtgName: "Blazing Rootwalla",
  id: "31501d09-5dde-44f4-a938-7ca95ad988a0",
  renderedText:
    "❖ – Discard a card: Move this character to an empty character position.\n\nX●: This character gains +X✦ until end of turn.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art Duplicate", "Art OK"],
  imageNumber: 2295991869,
  artOwned: false,
  cardNumber: 374,
  art: { x: 0, y: 1, scale: 1.07 },
  isStarter: false,
  abilities: () => [
    activated([discardCost()], move(self()), { speed: "fast" }),
    activated([energyX()], gainSpark(self(), x(), untilEndOfTurn())),
  ],
  verifiedText: "2do4uegzszi",
});
