import { abandonCost, activated, energy } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Blood Altar Monarch",
  mtgName: "Sai, Master Thopterist",
  id: "b977afaf-f583-45ec-8e34-99fbfa4e9190",
  renderedText: "1●, Abandon 2 warriors: Draw a card.",
  amplifiedText: "1●, Abandon 2 warriors: Draw 2 cards.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art Duplicate", "Art OK", "tutorial", "Art Owned"],
  imageNumber: 1219782721,
  artOwned: false,
  cardNumber: 81,
  art: { x: 0, y: 1, scale: 1.36 },
  isStarter: false,
  abilities: (variant) => [activated([energy(1), abandonCost({ subtype: "Warrior" }, 2)], p.draw(variant.amplified ? 2 : 1))],
  verifiedText: "y471x7ct5l",
});
