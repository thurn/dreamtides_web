import { staticAbility } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { costModifier } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Nullifier",
  mtgName: "Thalia, Guardian of Thraben",
  id: "6da831c8-6fda-4078-9f2b-873db2416aad",
  renderedText: "Events cost 1● more.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Mage",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art Duplicate", "Art OK"],
  imageNumber: 2025883244,
  artOwned: true,
  cardNumber: 186,
  art: { x: 0, y: -0.29, scale: 1.77 },
  isStarter: false,
  abilities: () => [
    staticAbility(costModifier("you", { cardType: "event" }, 1)),
    staticAbility(costModifier("opponent", { cardType: "event" }, 1)),
  ],
  verifiedText: expectedVerifiedText("Events cost 1● more."),
});
