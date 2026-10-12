import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Synapse Engineer",
  mtgName: "Jeskai Ascendancy",
  id: "12bb1efa-463b-4ac8-b9bd-e5bd135c3eb4",
  renderedText: "When you play an event, draw a card, then discard a card.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Tinkerer",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Event Payoff", "Art Rework", "Art OK"],
  imageNumber: 686903233,
  artOwned: false,
  cardNumber: 16,
  art: { x: 0, y: 0.489, scale: 1.47 },
  isStarter: false,
  abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.sequence(p.draw(1), p.discard(1)))],
  verifiedText: "1kitisw68kk",
});
