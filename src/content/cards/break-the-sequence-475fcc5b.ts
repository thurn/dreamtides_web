import { event, stackItem } from "../../engine/dsl/builders";
import { draw, eachPlayer, prevent, sequence } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Break the Sequence",
  mtgName: "Remand",
  id: "475fcc5b-c82d-4ef7-8020-90a8aeb2df53",
  renderedText: "Prevent a played card. Each player draws a card.",
  amplifiedText:
    "Prevent a played card. Draw 2 cards. The opponent draws a card.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Counterspell", "Art Rework", "Art OK", "Art Owned"],
  imageNumber: 1200949264,
  artOwned: true,
  cardNumber: 410,
  art: { x: 0.126, y: 0.398, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [event(sequence(
    prevent(stackItem()),
    variant.amplified ? sequence(draw(2), draw(1, "opponent")) : eachPlayer(draw(1)),
  ))],
  verifiedText: "130impsuw4w",
});
