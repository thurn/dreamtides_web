import { activated, countersCost } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Seedling Sage",
  mtgName: "Paradise Mantle",
  id: "6b1c0e39-0e70-4061-b037-0e10026cfabb",
  renderedText: "When you play a character, store 1⧗.\n\n2⧗: Gain 1●.",
  amplifiedText: "When you play a character, store 2⧗.\n\n2⧗: Gain 1●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Child",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Character Payoff"],
  imageNumber: 519475348,
  artOwned: false,
  cardNumber: 438,
  art: { x: -0.34, y: 1, scale: 1.57 },
  isStarter: false,
  abilities: (variant) => [
    triggered(whenYouPlay({ cardType: "character" }), p.storeCounters(variant.amplified ? 2 : 1)),
    activated([countersCost(2)], p.gainEnergy(1)),
  ],
  verifiedText: "g0ggaykyos",
});
