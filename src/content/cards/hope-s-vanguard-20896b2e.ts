import { activated, discardCost } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import survivor from "../figments/survivor-5256888f";
import { card } from "../define";

export default card({
  name: "Hope's Vanguard",
  mtgName: "Zombie Infestation",
  id: "20896b2e-59cc-4494-942c-eb95b75adaf9",
  renderedText: "Discard a card: Materialize a 1✦ survivor figment.",
  amplifiedText: "Discard a card: Materialize a 2✦ survivor figment.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Figment Maker", "Art Rework", "Art Duplicate", "Art OK"],
  imageNumber: 1387670426,
  artOwned: false,
  cardNumber: 422,
  isStarter: false,
  abilities: (variant) => [
    activated(
      [discardCost()],
      p.materializeFigments(parseFigmentId(survivor.id), 1, { spark: variant.amplified ? 2 : 1 }),
    ),
  ],
  verifiedText: "baz3ij69am",
});
