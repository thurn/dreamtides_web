import { enemyCharacter, event, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Unleash Ruin",
  mtgName: "Abrupt Decay",
  id: "09332e5b-3b4e-458f-9df0-3fc0419f65c3",
  renderedText: "Dissolve a ≤3● cost enemy.",
  amplifiedText: "Dissolve a ≤4● cost enemy.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: false,
  spark: null,
  tags: ["Removal", "Art Owned"],
  imageNumber: 1798514908,
  artOwned: false,
  cardNumber: 104,
  isStarter: false,
  abilities: (v) => [event(p.dissolve(target(enemyCharacter({ costAtMost: v.amplified ? 4 : 3 }))))],
  verifiedText: "2a1odgnqi87",
});
