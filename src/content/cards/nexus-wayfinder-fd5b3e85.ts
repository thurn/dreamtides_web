import { staticAbility } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { costSetter } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Nexus Wayfinder",
  mtgName: "Aluren",
  id: "fd5b3e85-ad7b-4d87-b4db-cd6ba0e6d277",
  renderedText: "≤2● cost characters cost you 0●.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Explorer",
  rarity: "Legendary",
  isFast: false,
  isInterrupt: false,
  spark: 0,
  tags: ["Art Owned"],
  imageNumber: 2419795159,
  artOwned: false,
  cardNumber: 349,
  art: { x: 0, y: 1, scale: 1.37 },
  isStarter: false,
  abilities: () => [staticAbility(costSetter("you", { cardType: "character", costAtMost: 2 }, 0))],
  verifiedText: expectedVerifiedText("≤2● cost characters cost you 0●."),
});
