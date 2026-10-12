import { discardCost, enemyCharacter, event, reclaim, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Fell Swoop",
  mtgName: "Lava Dart",
  id: "18979c10-39b8-42fb-ac1d-dd784da498d1",
  renderedText: "Dissolve a ≤1✦ enemy.\n\nReclaim – Discard a card",
  amplifiedText: "Dissolve a ≤2✦ enemy.\n\nReclaim – Discard a card",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Removal"],
  imageNumber: 581686492,
  artOwned: false,
  cardNumber: 326,
  isStarter: false,
  abilities: (v) => [
    event(p.dissolve(target(enemyCharacter({ sparkAtMost: v.amplified ? 2 : 1 })))),
    reclaim(discardCost()),
  ],
  verifiedText: "1z5rm38tmah",
});
