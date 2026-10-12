import { event, everyIn } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Wheel of the Heavens",
  mtgName: "Timetwister",
  id: "25d00336-5ad7-433b-8ced-71720a9f074a",
  renderedText:
    "Each player shuffles their hand and void into their deck, then draws 5 cards. Banish this card.",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Owned"],
  imageNumber: 1480584617,
  artOwned: false,
  cardNumber: 7,
  art: { x: 0.21, y: 0.369, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    event(
      p.sequence(
        p.eachPlayer(p.shuffleInto([everyIn("hand"), everyIn("void")])),
        p.eachPlayer(p.draw(5)),
        p.banishSelfOnResolve(),
      ),
    ),
  ],
  verifiedText: "11fqyq4vzgw",
});
