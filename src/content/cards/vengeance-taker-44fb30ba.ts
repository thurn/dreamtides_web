import { enemyCharacter, target } from "../../engine/dsl/builders";
import { onDissolved, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Vengeance Taker",
  mtgName: "Perilous Myr",
  id: "44fb30ba-c8a1-40e2-9f33-f2dd1fa96e5e",
  renderedText: "▸Dissolved: Dissolve a ≤2✦ enemy.",
  amplifiedText: "▸Dissolved: Dissolve a ≤3✦ enemy.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK", "tutorial"],
  imageNumber: 1798514893,
  artOwned: false,
  cardNumber: 231,
  art: { x: 0, y: 0.798, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [triggered(onDissolved(), p.dissolve(target(enemyCharacter({ sparkAtMost: variant.amplified ? 3 : 2 }))))],
  verifiedText: "1d8gp1wfsc",
});
