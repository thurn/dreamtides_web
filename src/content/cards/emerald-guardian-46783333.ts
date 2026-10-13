import { onDawn, onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Emerald Guardian",
  mtgName: "Llanowar Visionary",
  id: "46783333-78f9-4146-a8ec-0d1b81e1bf2f",
  renderedText: "▸Materialized: Draw a card.\n\n▸Dawn: Gain 1●.",
  amplifiedText: "▸Materialized: Draw a card.\n\n▸Dawn: Gain 2●.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["ETB Draw", "Art Owned"],
  imageNumber: 1169640025,
  artOwned: false,
  cardNumber: 383,
  art: { x: -0.294, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (v) => [triggered(onMaterialized(), p.draw(1)), triggered(onDawn(), p.gainEnergy(v.amplified ? 2 : 1))],
  verifiedText: "1xm1lj79mb4",
});
