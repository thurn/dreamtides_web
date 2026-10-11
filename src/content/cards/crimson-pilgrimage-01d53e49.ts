import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Crimson Pilgrimage",
  mtgName: "Expressive Iteration",
  id: "01d53e49-7833-4122-a970-b72c73ad2c28",
  renderedText:
    "Look at the top 4 cards of your deck. Choose one: Draw 1 of the cards, or draw 2 of the cards and they gain ephemeral.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 2600774401,
  artOwned: false,
  cardNumber: 412,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(p.chooseOne(p.lookAtTop(4, { draw: 1 }), p.lookAtTop(4, { draw: 2, ephemeral: true })))],
  verifiedText: "1upyq9vm04",
});
