import { fromVoid, ofSubtype } from "../../engine/dsl/builders";
import { onDissolved, triggered } from "../../engine/dsl/triggers";
import { grantReclaim } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Eternal Soul",
  mtgName: "Relentless Dead",
  id: "4e1c0192-2649-489f-aad3-75ff2887c0a7",
  renderedText: "▸Dissolved: Choose a survivor in your void to gain reclaim.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1104412604,
  artOwned: false,
  cardNumber: 468,
  art: { x: 0, y: 0.218, scale: 1.47 },
  isStarter: false,
  abilities: () => [triggered(onDissolved(), grantReclaim(fromVoid(ofSubtype("Survivor"))))],
  verifiedText: "p2wal9vesq",
});
