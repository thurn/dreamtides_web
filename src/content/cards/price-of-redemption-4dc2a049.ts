import { abandonCost, event, fromVoid, reclaim } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Price of Redemption",
  mtgName: "Bloodghast",
  id: "4dc2a049-d326-463b-85c7-117d5fd5ba72",
  renderedText:
    "Materialize a ≤2● cost character from your void.\n\nReclaim – Abandon a character.",
  amplifiedText:
    "Materialize a ≤3● cost character from your void.\n\nReclaim – Abandon a character.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1190830255,
  artOwned: false,
  cardNumber: 394,
  art: { x: 0, y: 1, scale: 1.1 },
  isStarter: false,
  abilities: (variant) => [
    event(p.materialize(fromVoid({ cardType: "character", costAtMost: variant.amplified ? 3 : 2 }))),
    reclaim(abandonCost()),
  ],
  verifiedText: "1wi4oe02315",
});
