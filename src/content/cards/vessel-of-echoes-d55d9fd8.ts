import { conditionCardCounts, energy, reclaim, self, staticAbility } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Vessel of Echoes",
  mtgName: "Putrid Imp",
  id: "d55d9fd8-ad2d-41f4-aa7f-5958432f00aa",
  renderedText:
    "If there are 6 or more cards in your void, this character has +5✦.\n\nReclaim 1●.",
  amplifiedText:
    "If there are 5 or more cards in your void, this character has +5✦.\n\nReclaim 1●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: [],
  imageNumber: 1289324113,
  artOwned: false,
  cardNumber: 421,
  isStarter: false,
  abilities: (variant) => [
    staticAbility(p.sparkModifier(self(), 5), { while: conditionCardCounts("void", variant.amplified ? 5 : 6) }),
    reclaim(energy(1)),
  ],
  verifiedText: "25rcefbj2cw",
});
