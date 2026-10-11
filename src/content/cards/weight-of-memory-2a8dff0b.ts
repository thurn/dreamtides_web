import { countCards, enemyCharacter, event, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Weight of Memory",
  mtgName: "Unholy Heat",
  id: "2a8dff0b-759f-40cc-af40-393a4e7129d4",
  renderedText:
    "Dissolve an enemy with ✦ less than or equal to the number of cards in your void.",
  energyCost: 0,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Removal", "Art Owned"],
  imageNumber: 2018053223,
  artOwned: false,
  cardNumber: 198,
  isStarter: false,
  // The count is read as targets are offered and again as the chosen enemy is checked on resolution (RD-hv-umm2.76-1).
  abilities: () => [event(p.dissolve(target(enemyCharacter({ sparkAtMost: countCards("void") }))))],
  verifiedText: "my2kt3bs24",
});
