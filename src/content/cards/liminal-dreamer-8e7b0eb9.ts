import { card } from "../define";
import { activated, discardHandCost, storedCounters } from "../../engine/dsl/builders";
import { draw, storeCounters } from "../../engine/effects/primitives";
import { onDawn, triggered } from "../../engine/dsl/triggers";

export default card({
  name: "Liminal Dreamer",
  mtgName: "Bomat Courier",
  id: "8e7b0eb9-4933-420b-abee-413bf5b3d2fc",
  renderedText:
    "▸Dawn: Store 1⧗.\n\nDiscard your hand: Draw one card per stored ⧗.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Child",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: [],
  imageNumber: 2023111790,
  artOwned: false,
  cardNumber: 300,
  art: { x: 0, y: -0.142, scale: 1.47 },
  isStarter: false,
  abilities: () => [triggered(onDawn(), storeCounters(1)), activated([discardHandCost()], draw(storedCounters()))],
  verifiedText: "1k4w8p9xwea",
});
