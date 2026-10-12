import { self } from "../../engine/dsl/builders";
import { triggered, whenReclaim } from "../../engine/dsl/triggers";
import { thisCharacterSpark } from "../../engine/dsl/values";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Thornwood Delver",
  mtgName: "Gau, Feral Youth",
  id: "c6d8a7cc-3856-4030-96eb-450e406dec33",
  renderedText:
    "Once per turn, when you reclaim a card, gain X⍟ where X is this character's ✦. Then this character gains +1✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Explorer",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: [],
  imageNumber: 700253806,
  artOwned: false,
  cardNumber: 194,
  isStarter: false,
  abilities: () => [
    triggered(whenReclaim(), p.sequence(p.gainPoints(thisCharacterSpark()), p.gainSpark(self(), 1)), { oncePerTurn: true }),
  ],
  verifiedText: "1818nj6weq6",
});
