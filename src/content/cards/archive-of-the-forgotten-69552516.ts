import { energy, event, fromVoid, x } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Archive of the Forgotten",
  mtgName: "Finale of Promise",
  id: "69552516-14bc-42b9-b4b6-3a0cdc29686b",
  renderedText:
    "Choose up to two ≤X● cost events in your void to gain reclaim 0●.",
  energyCost: 2,
  energyCosts: ["2", "X"],
  xMinimum: 0,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 644603677,
  artOwned: true,
  cardNumber: 453,
  art: { x: 0, y: -0.3, scale: 1.27 },
  isStarter: false,
  abilities: () => [
    event(p.grantReclaim(fromVoid({ cardType: "event" }, { count: 2, upTo: true, costAtMost: x() }), { costs: [energy(0)] })),
  ],
  verifiedText: "24lhzklke2f",
});
