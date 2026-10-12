import { event, stackItem } from "../../engine/dsl/builders";
import { prevent } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Overwhelm",
  mtgName: "Mana Drain",
  id: "1654d50f-815d-4172-b46b-8baa34a124db",
  renderedText: "Prevent a played card, then put that card into your hand.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Counterspell", "Art Rework", "Art OK", "Art Owned"],
  imageNumber: 1042405558,
  artOwned: true,
  cardNumber: 408,
  art: { x: 0, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: () => [event(prevent(stackItem(), { destination: "yourHand" }))],
  verifiedText: "10f2mdx3cvm",
});
