import { abandonCost, activated, exhaustSelf, randomIn, self } from "../../engine/dsl/builders";
import { gainSpark, materialize, sequence } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Flesh Cultivator",
  mtgName: "Knight of the Reliquary",
  id: "7977748d-02c1-4702-ba68-5c49f7f0759b",
  renderedText:
    "☾, Abandon a ≤2● cost character: Materialize a random ≤2● cost character from your deck. This character gains +1✦.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2586513023,
  artOwned: false,
  cardNumber: 321,
  isStarter: false,
  abilities: () => [activated([exhaustSelf(), abandonCost({ costAtMost: 2 })], sequence(materialize(randomIn("deck", 1, { cardType: "character", costAtMost: 2 })), gainSpark(self(), 1)))],
  verifiedText: "1gzscwgul3y",
});
