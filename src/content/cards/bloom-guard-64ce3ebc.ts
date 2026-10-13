import { either, onDissolved, onMaterialized, triggered } from "../../engine/dsl/triggers";
import { draw } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Bloom Guard",
  mtgName: "Ichor Wellspring",
  id: "64ce3ebc-c0ac-4dd3-95ca-eeb67530187c",
  renderedText: "▸Materialized, Dissolved: Draw a card.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Ichor Wellspring", "Art Rework", "Art OK", "tutorial", "Art Owned"],
  imageNumber: 1790126246,
  artOwned: false,
  cardNumber: 129,
  art: { x: 0, y: -0.485, scale: 1.97 },
  isStarter: false,
  // RD-hv-umm2.342-1: its own Dissolved ability belongs to its last in-play controller.
  abilities: () => [triggered(either(onMaterialized(), onDissolved()), draw(1))],
  verifiedText: "1rth7whxy3",
});
