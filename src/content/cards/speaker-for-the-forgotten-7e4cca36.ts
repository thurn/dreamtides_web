import { activated, energy } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Speaker for the Forgotten",
  mtgName: "Urza, Lord High Artificer",
  id: "7e4cca36-5134-415a-b30a-c4876b58976c",
  renderedText: "5●: Erode 1. That card gains reclaim 0●.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Mage",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Owned"],
  imageNumber: 2278837663,
  artOwned: true,
  cardNumber: 219,
  art: { x: 0.084, y: 0.839, scale: 1.17 },
  isStarter: false,
  abilities: () => [activated([energy(5)], p.grantReclaim(p.reclaimMovedBy(p.erode(1)), { costs: [energy(0)] }))],
  verifiedText: "1qesnja9umn",
});
