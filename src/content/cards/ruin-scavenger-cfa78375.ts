import { activated, banishFromAnyVoidCost, energy, self } from "../../engine/dsl/builders";
import { gainSpark } from "../../engine/effects/primitives/gain-spark";
import { card } from "../define";

export default card({
  name: "Ruin Scavenger",
  mtgName: "Deathrite Shaman",
  id: "cfa78375-85b7-47e9-95f5-b31e6d112c52",
  renderedText:
    "1●, Banish a card from the opponent's void: This character gains +1✦.",
  amplifiedText:
    "1●, Banish a card from the opponent's void: This character gains +2✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1902130345,
  artOwned: false,
  cardNumber: 204,
  isStarter: false,
  abilities: (variant) => [activated([energy(1), banishFromAnyVoidCost(1, {}, "opponent")], gainSpark(self(), variant.amplified ? 2 : 1))],
  verifiedText: "1lfvsxlotev",
});
