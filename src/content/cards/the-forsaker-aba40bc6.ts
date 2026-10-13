import { abandonCost, activated } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainPoints } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "The Forsaker",
  mtgName: "Zuran Orb",
  id: "aba40bc6-3e9e-4874-be8a-6984cbf13146",
  renderedText: "Abandon a ≤2● cost character: Gain 1⍟.",
  amplifiedText: "Abandon a ≤2● cost character: Gain 2⍟.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Renegade",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Free Sacrifice"],
  imageNumber: 1626794383,
  artOwned: false,
  cardNumber: 199,
  art: { x: 0, y: 1, scale: 1.37 },
  isStarter: false,
  abilities: (variant) => [activated([abandonCost({ costAtMost: 2 })], gainPoints(variant.amplified ? 2 : 1))],
  verifiedText: expectedVerifiedText("Abandon a ≤2● cost character: Gain 1⍟.", "Abandon a ≤2● cost character: Gain 2⍟."),
});
