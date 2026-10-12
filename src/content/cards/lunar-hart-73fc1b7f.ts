import { either, onDawn, onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Lunar Hart",
  mtgName: "Sol Ring",
  id: "73fc1b7f-3c2b-4993-9590-924240515c2f",
  renderedText: "▸Materialized, Dawn: Gain 2●.",
  amplifiedText: "▸Materialized, Dawn: Gain 3●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Legendary",
  isFast: false,
  isInterrupt: false,
  spark: 0,
  tags: [],
  imageNumber: 1104412427,
  artOwned: false,
  cardNumber: 289,
  art: { x: 0, y: 0, scale: 1.47 },
  isStarter: false,
  abilities: (v) => [triggered(either(onMaterialized(), onDawn()), p.gainEnergy(v.amplified ? 3 : 2))],
  verifiedText: "1brxd0dr6x3",
});
