import { abandonCost, activated, exhaustSelf } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import shadow from "../figments/shadow-86125402";
import { card } from "../define";

export default card({
  name: "Grief Shaman",
  mtgName: "Witch's Oven",
  id: "85251f03-c873-46d8-81be-ab421c901a53",
  renderedText: "☾, Abandon a character: Materialize a 2✦ shadow figment.",
  amplifiedText: "☾, Abandon a character: Materialize a 3✦ shadow figment.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Mage",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 306660617,
  artOwned: false,
  cardNumber: 278,
  art: { x: 0, y: 0.644, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    activated(
      [exhaustSelf(), abandonCost()],
      p.materializeFigments(parseFigmentId(shadow.id), 1, { spark: variant.amplified ? 3 : 2 }),
    ),
  ],
  verifiedText: "pj7ub9acm3",
});
