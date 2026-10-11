import { scoredAmount } from "../../engine/dsl/builders";
import { triggered, whenScores } from "../../engine/dsl/triggers";
import { losePoints } from "../../engine/effects/primitives/lose-points";
import { card } from "../define";

export default card({
  name: "Shatterpoint Agent",
  mtgName: "Vault Skirge",
  id: "7697da0e-d759-4c75-8c9c-477e9058b035",
  renderedText:
    "When this character scores ⍟, the opponent loses an equivalent quantity of ⍟.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2590831717,
  artOwned: true,
  cardNumber: 402,
  art: { x: 0.456, y: 0.761, scale: 1.17 },
  isStarter: false,
  abilities: () => [triggered(whenScores(), losePoints(scoredAmount(), "opponent"))],
  verifiedText: "2g99owwe6aq",
});
