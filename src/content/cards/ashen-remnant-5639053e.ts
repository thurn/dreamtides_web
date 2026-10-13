import { abandonCost, activated, countCards, self, staticAbility } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { erode, sparkModifier } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Ashen Remnant",
  mtgName: "Fiend Artisan",
  id: "5639053e-1fe3-4a42-b9c3-3fdf894bfab6",
  renderedText:
    "This character has +1✦ for each character in your void.\n\nAbandon another character: Erode 1.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Free Sacrifice", "Spark Scaler", "Art OK", "Art Owned"],
  imageNumber: 1639942843,
  artOwned: false,
  cardNumber: 51,
  art: { x: 0.4, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    staticAbility(sparkModifier(self(), countCards("void", { cardType: "character" }))),
    activated([abandonCost({ another: true })], erode(1)),
  ],
  verifiedText: expectedVerifiedText("This character has +1✦ for each character in your void.\n\nAbandon another character: Erode 1."),
});
