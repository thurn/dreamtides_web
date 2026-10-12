import { abandonSelfCost, activated, energy, everyIn, exhaustSelf } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Voidsire",
  mtgName: "Aftermath Analyst",
  id: "d8c90a33-a581-469a-9fd3-9a80d1cc5315",
  renderedText:
    "▸Materialized: Erode 3.\n\n5●, ☾, Abandon this character: Return all ≤2● cost characters from your void to play.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Self-Mill", "Art Rework", "Art OK"],
  imageNumber: 2186149281,
  artOwned: false,
  cardNumber: 397,
  art: { x: 0, y: 1, scale: 1.37 },
  isStarter: false,
  abilities: () => [
    triggered(onMaterialized(), p.erode(3)),
    activated([energy(5), exhaustSelf(), abandonSelfCost()], p.materialize(everyIn("void", { cardType: "character", costAtMost: 2 }))),
  ],
  verifiedText: "kczwups9h",
});
