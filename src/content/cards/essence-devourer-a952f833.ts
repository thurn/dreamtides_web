import { abandonCost, activated } from "../../engine/dsl/builders";
import { gainEnergy } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Essence Devourer",
  mtgName: "Squandered Resources",
  id: "a952f833-825a-435f-82b1-8d85f872d274",
  renderedText: "Abandon a ≤2● cost character: Gain 1●.",
  amplifiedText: "Abandon a ≤2● cost character: Gain 2●.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Monster",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Free Sacrifice", "Art Rework", "Art OK"],
  imageNumber: 524175406,
  artOwned: false,
  cardNumber: 150,
  art: { x: 0, y: 1, scale: 1 },
  isStarter: false,
  abilities: (variant) => [activated([abandonCost({ costAtMost: 2 })], gainEnergy(variant.amplified ? 2 : 1))],
  verifiedText: "6wscrfw752",
});
