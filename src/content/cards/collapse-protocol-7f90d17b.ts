import { event, fromVoid } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Collapse Protocol",
  mtgName: "Dreams of Steel and Oil",
  id: "7f90d17b-9146-4550-a372-a9d77e814ce6",
  renderedText:
    "Banish up to three cards from the opponent's void. Draw a card.",
  amplifiedText:
    "Banish up to three cards from the opponent's void. Draw 2 cards.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 379806730,
  artOwned: false,
  cardNumber: 173,
  isStarter: false,
  abilities: (v) => [
    event(
      p.sequence(
        p.banishCards([fromVoid({}, { player: "opponent", count: 3, upTo: true })]),
        p.draw(v.amplified ? 2 : 1),
      ),
    ),
  ],
  verifiedText: "1i6ytsylk0v",
});
