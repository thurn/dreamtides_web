import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Skysign",
  mtgName: "Impulse",
  id: "5ce69085-aa75-4654-8abe-f9e773931e63",
  renderedText:
    "Look at the top 4 cards of your deck. Draw one of them and shuffle the rest back.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2637215373,
  artOwned: false,
  cardNumber: 100,
  art: { x: 0, y: 0.161, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(p.sequence(p.lookAtTop(4, { draw: 1 }), p.shuffleInto()))],
  verifiedText: "1glavots6a8",
});
