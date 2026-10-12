import { energy, enemyCharacter, event, reclaim, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Shatter the Frail",
  mtgName: "Darkblast",
  id: "7762759b-c1df-4c86-9dbb-a49d152f3616",
  renderedText: "Dissolve a ≤1✦ enemy.\n\nReclaim 1●",
  amplifiedText: "Dissolve a ≤2✦ enemy.\n\nReclaim 1●",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Removal", "Art Owned"],
  imageNumber: 2521694541,
  artOwned: true,
  cardNumber: 282,
  isStarter: false,
  abilities: (v) => [event(p.dissolve(target(enemyCharacter({ sparkAtMost: v.amplified ? 2 : 1 })))), reclaim(energy(1))],
  verifiedText: "1dry6cfh4q6",
});
